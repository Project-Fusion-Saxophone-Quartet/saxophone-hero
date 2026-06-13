// index.mjs
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import fs from "fs";
import os from "os";
import { spawn } from "child_process"; // kept for potential future use
import osc from "osc";

import * as handlers from "./server/handlers.js";
import * as messages from "./server/messages.js";
import { createNtpSync, msPerBeat } from "./server/utils.js";
import QRCode from "qrcode";
import open from "open";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

// ── OSC / UDP bridge (replaces standalone udp.js) ──────────────────────────
const MAX_IP   = process.env.MAX_IP   || "127.0.0.1";
const MAX_PORT = parseInt(process.env.MAX_PORT || "9000", 10);

const udpPort = new osc.UDPPort({
  localAddress: "0.0.0.0",
  localPort: 57121,
  remoteAddress: MAX_IP,
  remotePort: MAX_PORT,
});
udpPort.open();
udpPort.on("ready", () => console.log(`OSC ready → sending to ${MAX_IP}:${MAX_PORT}`));

function getLocalIPv4Addresses() {
  const nets = os.networkInterfaces();
  const results = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal (127.0.0.1) and non-IPv4
      if (net.family === "IPv4" && !net.internal) {
        results.push(net.address);
      }
    }
  }

  return results;
}

// ---- Load score ----
const sequencePathSoprano = path.resolve(
  "./public/tap_sequences/generated/soprano.json",
);
const rhythmicSequenceSoprano = JSON.parse(
  fs.readFileSync(sequencePathSoprano, "utf8"),
);

const sequencePathAlto = path.resolve(
  "./public/tap_sequences/generated/alto.json",
);
const rhythmicSequenceAlto = JSON.parse(
  fs.readFileSync(sequencePathAlto, "utf8"),
);

const sequencePathTenor = path.resolve(
  "./public/tap_sequences/generated/tenor.json",
);
const rhythmicSequenceTenor = JSON.parse(
  fs.readFileSync(sequencePathTenor, "utf8"),
);

const sequencePathBaritone = path.resolve(
  "./public/tap_sequences/generated/baritone.json",
);
const rhythmicSequenceBaritone = JSON.parse(
  fs.readFileSync(sequencePathBaritone, "utf8"),
);

// ---- Section transition beats (1-based) ----
// Union of all four voices so that every 8-bar boundary across every part
// triggers the downbeat click, regardless of which voice is currently playing.
const sectionStartBeats = new Set([
  ...rhythmicSequenceSoprano.sections.map((s) => s.markers[0]),
  ...rhythmicSequenceAlto.sections.map((s) => s.markers[0]),
  ...rhythmicSequenceTenor.sections.map((s) => s.markers[0]),
  ...rhythmicSequenceBaritone.sections.map((s) => s.markers[0]),
]);

// ---- Generate score (iterative until peak spread = 4) ----
async function generateScore() {
  const scriptPath = path.join(__dirname, "generate_score.py");
  if (!fs.existsSync(scriptPath)) {
    console.warn("generate_score.py not found — using existing generated files");
    return;
  }

  const TARGET_SPREAD = 3;
  let attempt = 0;

  while (true) {
    attempt++;
    const result = await new Promise((resolve) => {
      const proc = spawn("python3", [scriptPath], {
        cwd: __dirname,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      proc.stdout.on("data", d => { stdout += d; });
      proc.stderr.on("data", d => process.stderr.write(d));
      proc.on("exit", () => resolve(stdout));
    });

    // Parse the peak spread from generator output
    const match = result.match(/Peak spread\s*:\s*(\d+)/);
    const spread = match ? parseInt(match[1], 10) : -1;

    process.stdout.write(result); // show generator output
    console.log(`Score generation attempt ${attempt}: peak spread = ${spread}`);

    if (spread === TARGET_SPREAD) {
      console.log(`✓ Target spread of ${TARGET_SPREAD} achieved after ${attempt} attempt${attempt > 1 ? "s" : ""}`);
      break;
    }

    console.log(`  Spread ${spread} ≠ ${TARGET_SPREAD} — regenerating…`);
  }
}

await generateScore();

// ---- Create Express app ----
const app = express();
app.use(cors());

// ---- NTP ----
const serverNowMs = await createNtpSync();

// ---- HTTP API ----
app.get("/time", (req, res) => {
  res.json({ serverTime: serverNowMs() });
});

// ---- Ensemble config ----
const configPath = path.join(__dirname, "config.json");
let ensembleConfig = {
  voiceOrder:  ["baritone", "tenor", "alto", "soprano"],
  voiceNames:  { soprano: "Soprano", alto: "Alto", tenor: "Tenor", baritone: "Baritone" },
  voiceColors: { soprano: "#a855f7", alto: "#f7b731", tenor: "#3b82f6", baritone: "#22c55e" },
};
if (fs.existsSync(configPath)) {
  try {
    ensembleConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    console.log(`Ensemble config loaded: ${ensembleConfig.voiceOrder.join(" / ")}`);
  } catch (e) {
    console.warn("config.json parse error — using defaults:", e.message);
  }
} else {
  console.log("No config.json found — using default SATB layout");
}

app.get("/config", (req, res) => {
  try {
    const fresh = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, "utf8"))
      : ensembleConfig;
    res.json(fresh);
  } catch {
    res.json(ensembleConfig); // fall back to startup-loaded version
  }
});

// ---- Serve frontend ----
const distPath = path.join(__dirname, "dist");

// ---- QR code display pages (for projector) ----
// Served at /qr/game and /qr/performer — large, clean, projector-ready.
// /qr/:page/svg returns just the raw SVG for embedding (used by ProjectionPage).
app.get("/qr/:page/svg", async (req, res) => {
  const ip = getLocalIPv4Addresses()[0];
  if (!ip) return res.status(503).send("No LAN IP available");

  const pageConfig = {
    game:      "/game",
    performer: "/performer",
  };

  const urlPath = pageConfig[req.params.page];
  if (!urlPath) return res.status(404).send("Not found");

  const url = `http://${ip}:${PORT}${urlPath}`;
  const svgString = await QRCode.toString(url, {
    type: "svg",
    width: 400,
    margin: 2,
    color: { dark: "#ffffff", light: "#00000000" },
  });

  res.setHeader("Content-Type", "image/svg+xml");
  res.send(svgString);
});

app.get("/qr/:page", async (req, res) => {
  const page = req.page;
  const ip = getLocalIPv4Addresses()[0];
  if (!ip) return res.status(503).send("No LAN IP available");

  const pageConfig = {
    game:      { path: "/game",      label: "Join the Game",    sub: "Audience players" },
    performer: { path: "/performer", label: "Performer Page",   sub: "Musicians" },
  };

  const config = pageConfig[req.params.page];
  if (!config) return res.status(404).send("Not found");

  const url = `http://${ip}:${PORT}${config.path}`;
  const svgString = await QRCode.toString(url, {
    type: "svg",
    width: 400,
    margin: 2,
    color: { dark: "#ffffff", light: "#00000000" },
  });

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${config.label}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%;
      background: #0a0a0f;
      display: flex; align-items: center; justify-content: center;
      margin: 0;
    }
    .card {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 2rem;
      width: 100%; height: 100%;
      padding: 2rem;
    }
    .label {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 2rem; font-weight: 700;
      color: rgba(255,255,255,0.9);
      letter-spacing: -0.02em;
      text-align: center;
    }
    .sub {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 1rem;
      color: rgba(255,255,255,0.35);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-top: -1.5rem;
    }
    .qr {
      width: min(70vw, 70vh);
      height: min(70vw, 70vh);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr svg {
      width: 100%;
      height: 100%;
    }
    .url {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 1rem;
      color: rgba(255,255,255,0.4);
      letter-spacing: 0.04em;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="label">${config.label}</div>
    <div class="sub">${config.sub}</div>
    <div class="qr">${svgString}</div>
    <div class="url">${url}</div>
  </div>
</body>
</html>`);
});

app.use(express.static(distPath));
app.use((req, res) => res.sendFile(path.join(distPath, "index.html")));

// ---- Create HTTP + WS server ----
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/" });

// ---- Game state ----
const scores = {};
const gameState = {
  currentGameStartTime: null,
  scheduledIndex: 0,
  INTERVAL_MS: msPerBeat(rhythmicSequenceAlto.bpm),
  currentGameTimeout: null,
  endgameFired: false,   // guard: ensure celebrate+stop only fires once per game
};

// ---- Helpers ----
function broadcast(msg) {
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(msg);
  });
}

function broadcastPresence() {
  const clients = Array.from(wss.clients)
    .filter((c) => c.readyState === 1 && c.name && c.clientType === "game") // ✅ Only game clients
    .map((c) => ({
      name: c.name,
      part: c.part,
    }));
  broadcast(messages.makePresenceMessage(clients));
}

// ---- Metronome tick scheduling ----
function scheduleTicks() {
  if (!gameState.currentGameStartTime) return;

  const now = serverNowMs();
  const lookAhead = now + 2000; // scheduleAheadMs
  const tickTimes = [];
  const tickDownbeats  = []; // parallel array: true if this tick is a downbeat
  const tickPrepBeats  = []; // parallel array: true if this tick is a prep beat (beats 1-4)

  const sequences = [
    rhythmicSequenceSoprano,
    rhythmicSequenceAlto,
    rhythmicSequenceTenor,
    rhythmicSequenceBaritone,
  ];

  // Level 17 is the endgame — all voices reach it simultaneously.
  // The metronome plays one downbeat click on beat 1157 then stops.
  const level17StartBeat = Math.max(
    ...sequences.map((seq) => {
      const sec = seq.sections.find(s => s.name === 'Level 17');
      return sec ? sec.markers[0] : 0;
    }),
  );

  // Stop 2 beats after Level 17 starts — just enough for the downbeat click
  // to sound. The celebration overlay persists on clients independently.
  const stopAfterBeat = level17StartBeat + 2;
  const tickCutoffMs  = gameState.currentGameStartTime + stopAfterBeat * gameState.INTERVAL_MS;

  while (true) {
    const tickTime =
      gameState.currentGameStartTime +
      gameState.scheduledIndex * gameState.INTERVAL_MS;

    if (tickTime > lookAhead) break;
    if (tickTime > tickCutoffMs) break;

    // Beat index is 1-based in the section markers, so add 1.
    // Beats 1-4 are the count-in (4 BEAT PREP) and all play as high-pitched downbeats.
    const beatNumber = gameState.scheduledIndex + 1;
    const isDownbeat = sectionStartBeats.has(beatNumber) || (beatNumber >= 1 && beatNumber <= 4);
    const isPrepBeat = beatNumber >= 1 && beatNumber <= 4;
    tickDownbeats.push(isDownbeat);
    tickPrepBeats.push(isPrepBeat);
    tickTimes.push(tickTime);
    gameState.scheduledIndex++;
  }

  if (tickTimes.length > 0) {
    broadcast(messages.makeTickScheduleMessage(tickTimes, tickDownbeats, tickPrepBeats));
  }

  const lastBeatTime = gameState.currentGameStartTime + stopAfterBeat * gameState.INTERVAL_MS;

  if (now > lastBeatTime + 500 && !gameState.endgameFired) {
    gameState.endgameFired = true;   // prevent re-entry on subsequent ticks

    // Determine winner — fall back gracefully if no taps were recorded
    const sortedScores = Object.entries(scores).sort(([,a],[,b]) => b - a);
    const topScore  = sortedScores.length > 0 ? sortedScores[0][1] : 0;
    const winners   = sortedScores.length > 0
      ? sortedScores.filter(([,s]) => s === topScore).map(([v]) => v)
      : ["everyone"];

    const celebrateMsg = JSON.stringify({
      type:   "celebrate",
      winner: winners.join(" & "),
      isTie:  winners.length > 1,
      score:  topScore,
      scores,
    });

    console.log(`[endgame] broadcasting celebrate — winner=${winners.join(" & ")}, clients=${wss.clients.size}`);
    broadcast(celebrateMsg);

    // Delay stop by 2s so all clients have time to render Level 17
    // before playback freezes. celebrate is already sent above.
    setTimeout(() => {
      console.log(`[endgame] broadcasting stop, clients=${wss.clients.size}`);
      broadcast(messages.makeStopMessage(scores));
      Object.keys(scores).forEach((k) => (scores[k] = 0));
      gameState.currentGameStartTime = null;
      gameState.scheduledIndex = 0;
      gameState.endgameFired = false;  // reset for next game
      serverNowMs.setGameActive(false); // resume NTP corrections
      broadcastPresence();
    }, 2000);
  }
}
setInterval(scheduleTicks, gameState.INTERVAL_MS / 4);

// ---- WS connection handler ----
let clientCounter = 0;
wss.on("connection", (ws) => {
  ws.id = `socket-${++clientCounter}`;
  ws.name = null;
  ws.clientType = null; // ✅ Initialize clientType
  console.log(`[ws] client connected: ${ws.id} (total: ${wss.clients.size})`);

  ws.on("message", (data) => {
    const msg = JSON.parse(data);
    switch (msg.type) {
      case "identify": // ✅ NEW: Handle client identification
        handlers.handleIdentify(ws, msg);
        break;
      case "playerJoin":
        handlers.handlePlayerJoin(
          ws,
          scores,
          broadcastPresence,
          broadcast,
          msg,
          gameState,
          rhythmicSequenceSoprano,
          rhythmicSequenceAlto,
          rhythmicSequenceTenor,
          rhythmicSequenceBaritone,
        );
        break;
      case "start":
        serverNowMs.setGameActive(true);   // pause NTP corrections during game
        handlers.handleStart(
          scores,
          broadcast,
          serverNowMs,
          rhythmicSequenceSoprano,
          rhythmicSequenceAlto,
          rhythmicSequenceTenor,
          rhythmicSequenceBaritone,
          gameState,
        );
        break;
      case "tap":
        handlers.handleTap(ws, scores, broadcast, msg, gameState.INTERVAL_MS);
        break;
      case "stop":
        handlers.handleStop(scores, broadcast, broadcastPresence, gameState);
        serverNowMs.setGameActive(false);  // resume NTP corrections after game
        break;
      case "section":
        // ProgressionUI sends { type: "section", part, section }
        // Forward to Max via OSC, same as udp.js did
        if (msg.part && msg.section != null) {
          try {
            udpPort.send({ address: `/section/${msg.part}`, args: [msg.section] });
            console.log(`sending section ${msg.section} for part ${msg.part}`);
          } catch (err) {
            console.error("OSC send error:", err);
          }
        }
        break;
    }
  });

  ws.on("close", (code) => {
    console.log(`[ws] client disconnected: ${ws.id} code=${code} (remaining: ${wss.clients.size})`);
    if (ws.name) delete scores[ws.name];
    handlers.removePlayer(ws);
    broadcastPresence();
  });
});

// ---- Start server ----
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Frontend served from ${distPath}`);

  const ips = getLocalIPv4Addresses();

  if (ips.length === 0) {
    console.log("No local network IP found");
  } else {
    const ip = ips[0]; // use the first LAN IP for QR codes
    ips.forEach((ip) => {
      console.log(`→ http://${ip}:${PORT}`);
    });

    console.log(`\n── GAME (audience)    → http://${ip}:${PORT}/game`);
    console.log(`── PERFORMER PAGE     → http://${ip}:${PORT}/performer`);
    console.log(`── PROJECTION         → http://${ip}:${PORT}/projection\n`);

    // Open three browser windows on startup:
    // 1. Home screen — for the host to start/stop the game
    // 2. Projection page — to be shown on the projector
    // 3. Performer page QR code — for setting up performers' tablets
    console.log("Opening browser windows…");
    open(`http://${ip}:${PORT}/`);
    open(`http://${ip}:${PORT}/projection`);
    open(`http://${ip}:${PORT}/qr/performer`);
  }
});