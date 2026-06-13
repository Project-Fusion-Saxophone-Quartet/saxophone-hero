// server/handlers.js
import * as messages from "./messages.js";
import { msPerBeat } from "./utils.js";

// Per-voice player counts: { soprano: 3, alto: 1, ... }
// Updated whenever a player joins or disconnects.
const playerCounts = { soprano: 0, alto: 0, tenor: 0, baritone: 0 };

function getPlayerCount(part) {
  return Math.max(1, playerCounts[part] || 1);
}

// ✅ NEW: Handle client identification
export function handleIdentify(ws, msg) {
  ws.clientType = msg.clientType || "game"; // Default to "game" if not specified
  ws.isHost = msg.isHost || false;
  console.log(`[ws] ${ws.id} identified as: ${ws.isHost ? 'host' : ws.clientType}`);
}

export function handlePlayerJoin(
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
) {
  ws.name = msg.name;
  ws.part = msg.part;

  // ✅ Only increment player count for game clients
  if (ws.clientType === "game" && playerCounts[ws.part] !== undefined) {
    playerCounts[ws.part]++;
  }

  broadcast(
    JSON.stringify({
      type: "scoreUpdate",
      scores,
    }),
  );

  broadcastPresence();

  // ✅ If game already running, send current start state to THIS player
  if (gameState.currentGameStartTime) {
    ws.send(
      JSON.stringify({
        type: "start",
        startTime: gameState.currentGameStartTime,
        sopranoBeats: rhythmicSequenceSoprano,
        altoBeats: rhythmicSequenceAlto,
        tenorBeats: rhythmicSequenceTenor,
        baritoneBeats: rhythmicSequenceBaritone,
      }),
    );
  }
}

export function handlePerformerJoin(ws, scores, broadcastPresence, msg) {
  ws.name = msg.name;
  ws.part = msg.part;

  // ✅ Performers don't increment player counts
  // (This function might be deprecated now — handlePlayerJoin handles both)

  broadcastPresence();
}

export function handleStart(
  scores,
  broadcast,
  serverNowMs,
  rhythmicSequenceSoprano,
  rhythmicSequenceAlto,
  rhythmicSequenceTenor,
  rhythmicSequenceBaritone,
  gameState,
) {
  const bpms = [
    rhythmicSequenceSoprano.bpm,
    rhythmicSequenceAlto.bpm,
    rhythmicSequenceTenor.bpm,
    rhythmicSequenceBaritone.bpm,
  ];

  const uniqueBpms = new Set(bpms);

  if (uniqueBpms.size !== 1) {
    throw new Error(`BPM mismatch between parts: ${bpms.join(", ")}`);
  }

  const bpm = bpms[0];
  const intervalMs = msPerBeat(bpm);

  const now = serverNowMs();
  const beatsElapsed = Math.floor(now / intervalMs);
  const prepBeats = 1;

  // DEBUG: set to a beat number to skip ahead for testing late levels.
  // e.g. 900 jumps to ~Level 15, 1050 jumps near Level 17.
  // Set to 0 for normal performance.
  const DEBUG_START_BEAT = 0;

  gameState.currentGameStartTime = (beatsElapsed + prepBeats) * intervalMs
    - (DEBUG_START_BEAT * intervalMs);

  gameState.scheduledIndex = DEBUG_START_BEAT;
  gameState.endgameFired   = false;   // reset for fresh game

  broadcast(
    messages.makeStartMessage(
      gameState.currentGameStartTime,
      bpm,
      rhythmicSequenceSoprano,
      rhythmicSequenceAlto,
      rhythmicSequenceTenor,
      rhythmicSequenceBaritone,
    ),
  );

  // Score reset — keep playerCounts intact since players are already joined
  Object.keys(scores).forEach((k) => delete scores[k]);

  ["soprano", "alto", "tenor", "baritone"].forEach(
    (part) => (scores[part] = 0),
  );

  broadcast(
    JSON.stringify({
      type: "scoreUpdate",
      scores,
    }),
  );
}

export function handleTap(ws, scores, broadcast, msg, INTERVAL_MS) {
  if (!ws.part) return;

  const tapTime = msg.timestamp;
  const nearestTick = Math.round(tapTime / INTERVAL_MS) * INTERVAL_MS;
  const diff = tapTime - nearestTick;
  const n = getPlayerCount(ws.part);

  if (scores[ws.part] == null) scores[ws.part] = 0;

  if (msg.hit === true) {
    const pts = typeof msg.points === "number" ? msg.points : 1;
    scores[ws.part] = Math.round((scores[ws.part] + pts / n) * 100) / 100;
  } else if (msg.hit === false) {
    scores[ws.part] = Math.max(0, Math.round((scores[ws.part] - 1 / n) * 100) / 100);
  } else {
    scores[ws.part] = Math.round((scores[ws.part] + 1 / n) * 100) / 100;
  }

  broadcast(
    messages.makeTapBroadcastMessage(ws.part, tapTime, diff, scores[ws.part], msg.hit),
  );

  broadcast(
    JSON.stringify({ type: "scoreUpdate", scores }),
  );
}

export function removePlayer(ws) {
  // ✅ Only decrement if this was a game client
  if (ws.clientType === "game" && ws.part && playerCounts[ws.part] !== undefined) {
    playerCounts[ws.part] = Math.max(0, playerCounts[ws.part] - 1);
  }
}

export function handleStop(scores, broadcast, broadcastPresence, gameState) {
  broadcast(messages.makeStopMessage(scores));
  Object.keys(scores).forEach((k) => (scores[k] = 0));
  Object.keys(playerCounts).forEach((k) => { playerCounts[k] = 0; });
  gameState.currentGameStartTime = null;
  gameState.scheduledIndex = 0;
  broadcastPresence();
}