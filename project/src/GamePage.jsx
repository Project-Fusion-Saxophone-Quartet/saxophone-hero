// src/GamePage.jsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMetronome } from "./hooks/useMetronome";
import { MetronomeUI } from "./components/MetronomeUI";

const BG       = "#0a0a0f";
const BG2      = "#12121a";
const BORDER   = "rgba(255,255,255,0.08)";
const TEXT     = "rgba(255,255,255,0.88)";
const TEXT_DIM = "rgba(255,255,255,0.35)";

const DEFAULT_CONFIG = {
  voiceOrder:  ["soprano", "alto", "tenor", "baritone"],
  voiceNames:  { soprano: "Soprano", alto: "Alto", tenor: "Tenor", baritone: "Baritone" },
  voiceColors: { soprano: "#f72585", alto: "#4cc9f0", tenor: "#4361ee", baritone: "#7209b7" },
};

// Cached at module level so all instances share one fetch
let _configCache = null;
async function fetchConfig() {
  if (_configCache) return _configCache;
  try {
    const r = await fetch("/config");
    _configCache = await r.json();
  } catch {
    _configCache = DEFAULT_CONFIG;
  }
  return _configCache;
}

// ── Tutorial ──────────────────────────────────────────────────────────────────
const STEPS = [
  {
    title: "Blocks fall toward you",
    body: "Coloured blocks scroll down the screen. Each block represents a note your saxophone section is playing.",
    visual: "blocks",
  },
  {
    title: "Tap when a block hits the line",
    body: "At the bottom of the screen is a pulsing red line. Tap the screen the moment a block reaches that line.",
    visual: "line",
  },
  {
    title: "Left hand  ·  Right hand",
    body: "Blocks appear on the left or right side of the screen — one for each thumb. Tap with the correct thumb.",
    visual: "hands",
  },
  {
    title: "Hold notes — release matters too",
    body: "Tall blocks are held notes. Press when the block hits the line and release when it ends. Both the press and release earn points.",
    visual: "hold",
  },
  {
    title: "Don't spam",
    body: "Every errant tap costs your whole team points. Only tap when a block is actually at the line — patience beats button-mashing.",
    visual: "spam",
  },
  {
    title: "Accuracy matters",
    body: "The closer your tap is to the line, the more points your team earns. A miss costs points, so stay focused!",
    visual: "accuracy",
  },
  {
    title: "Block colors = note values",
    body: "Each color tells you what subdivision of the beat the note falls on — how fast the notes are coming.",
    visual: "colors",
  },
];

function TutorialVisual({ type, color }) {
  const w = 200, h = 140;
  const lineY = h * 0.82;

  if (type === "blocks") return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {[0, 1, 2].map(i => (
        <rect key={i} x={60} y={10 + i * 40} width={80} height={28}
          rx={6} fill={color} opacity={0.15 + i * 0.35}
          stroke={color} strokeWidth={1.5} />
      ))}
      <text x={w/2} y={h-8} textAnchor="middle" fill={TEXT_DIM} fontSize={11}>
        blocks scroll down
      </text>
    </svg>
  );

  if (type === "line") return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <rect x={60} y={lineY - 52} width={80} height={28} rx={6}
        fill={color} opacity={0.8} stroke={color} strokeWidth={1.5} />
      <line x1={20} y1={lineY} x2={w-20} y2={lineY}
        stroke="#ff2244" strokeWidth={2.5} strokeDasharray="6 3" />
      <circle cx={w/2} cy={lineY} r={5} fill="#ff2244" opacity={0.9} />
      <text x={w/2} y={h-6} textAnchor="middle" fill={TEXT_DIM} fontSize={11}>
        tap here ↑
      </text>
    </svg>
  );

  if (type === "hands") return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <rect x={18} y={30} width={70} height={28} rx={6}
        fill={color} opacity={0.75} stroke={color} strokeWidth={1.5} />
      <text x={53} y={49} textAnchor="middle" fill="#fff" fontSize={13} fontWeight="bold">L</text>
      <rect x={112} y={30} width={70} height={28} rx={6}
        fill={color} opacity={0.75} stroke={color} strokeWidth={1.5} />
      <text x={147} y={49} textAnchor="middle" fill="#fff" fontSize={13} fontWeight="bold">R</text>
      <text x={53} y={90} textAnchor="middle" fill={TEXT_DIM} fontSize={11}>left thumb</text>
      <text x={147} y={90} textAnchor="middle" fill={TEXT_DIM} fontSize={11}>right thumb</text>
      <line x1={100} y1={20} x2={100} y2={110} stroke={BORDER} strokeWidth={1} />
    </svg>
  );

  if (type === "hold") return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {/* Tall hold block */}
      <rect x={70} y={10} width={60} height={80} rx={6}
        fill={color} opacity={0.75} stroke={color} strokeWidth={1.5} />
      {/* Diagonal stripes inside */}
      {[0,1,2,3,4].map(i => (
        <line key={i} x1={70 + i*15} y1={10} x2={70} y2={10 + i*15}
          stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
      ))}
      {/* Hit line */}
      <line x1={20} y1={lineY} x2={w-20} y2={lineY}
        stroke="#ff2244" strokeWidth={2} strokeDasharray="6 3" />
      {/* Press arrow */}
      <text x={52} y={lineY + 18} textAnchor="middle" fill={TEXT_DIM} fontSize={10}>press ↑</text>
      {/* Release arrow */}
      <text x={148} y={22} textAnchor="middle" fill={TEXT_DIM} fontSize={10}>↓ release</text>
    </svg>
  );

  if (type === "spam") return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {/* One correct block at the line */}
      <rect x={60} y={lineY - 32} width={80} height={28} rx={6}
        fill={color} opacity={0.85} stroke={color} strokeWidth={1.5} />
      {/* Line */}
      <line x1={20} y1={lineY} x2={w-20} y2={lineY}
        stroke="#ff2244" strokeWidth={2} strokeDasharray="6 3" />
      {/* Phantom errant taps shown as faded Xs */}
      {[[40, 50], [155, 40], [45, 100], [160, 95]].map(([x, y], i) => (
        <text key={i} x={x} y={y} textAnchor="middle"
          fill="#ff4444" fontSize={18} opacity={0.4} fontWeight="bold">✕</text>
      ))}
      <text x={w/2} y={h-6} textAnchor="middle" fill="#ff4444" fontSize={10} opacity={0.7}>
        errant taps = team penalty
      </text>
    </svg>
  );

  if (type === "colors") {
    const subdivisions = [
      { label: "Quarter note",  color: "#4cc9f0", desc: "beat" },
      { label: "8th note",      color: "#f7b731", desc: "& of the beat" },
      { label: "16th note",     color: "#26de81", desc: "e / a" },
      { label: "Triplet",       color: "#fd9644", desc: "3 per beat" },
      { label: "Quintuplet",    color: "#fc5c65", desc: "5 per beat" },
      { label: "Sextuplet",     color: "#fd79a8", desc: "6 per beat" },
      { label: "32nd note",     color: "#aaaaaa", desc: "very fast" },
    ];
    const rowH = 20;
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {subdivisions.map(({ label, color: c, desc }, i) => (
          <g key={label} transform={`translate(0, ${i * rowH + 4})`}>
            <rect x={8} y={2} width={14} height={12} rx={3} fill={c} />
            <text x={28} y={12} fill={TEXT} fontSize={10} fontWeight="600">{label}</text>
            <text x={w - 8} y={12} textAnchor="end" fill={TEXT_DIM} fontSize={9}>{desc}</text>
          </g>
        ))}
      </svg>
    );
  }

  if (type === "accuracy") return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {[
        { label: "Perfect", pts: "+2", y: 18, op: 1.0 },
        { label: "Excellent", pts: "+1", y: 48, op: 0.75 },
        { label: "Good", pts: "+0.5", y: 78, op: 0.5 },
        { label: "Miss", pts: "−1", y: 108, op: 0.3 },
      ].map(({ label, pts, y, op }) => (
        <g key={label}>
          <text x={20} y={y} fill={color} fontSize={12} opacity={op} fontWeight="600">{label}</text>
          <text x={w-20} y={y} textAnchor="end" fill={TEXT} fontSize={12} opacity={op}>{pts}</text>
        </g>
      ))}
    </svg>
  );

  return null;
}

function Tutorial({ part, color, onDone }) {
  const [step, setStep] = useState(0);
  color = color || "#fff";
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div style={{
      position: "fixed", inset: 0, background: BG,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "2rem", gap: "1.5rem",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color, marginBottom: "0.4rem" }}>
          How to Play · {step + 1} of {STEPS.length}
        </div>
        <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 20 : 6, height: 3,
              borderRadius: 2,
              background: i <= step ? color : "rgba(255,255,255,0.12)",
              transition: "all 0.3s ease",
            }} />
          ))}
        </div>
      </div>

      {/* Visual */}
      <div style={{
        background: BG2, border: `1px solid ${BORDER}`,
        borderRadius: 12, padding: "1.5rem",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <TutorialVisual type={current.visual} color={color} />
      </div>

      {/* Text */}
      <div style={{ textAlign: "center", maxWidth: 320 }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: TEXT, marginBottom: "0.5rem", letterSpacing: "-0.01em" }}>
          {current.title}
        </h2>
        <p style={{ fontSize: "0.85rem", color: TEXT_DIM, lineHeight: 1.6 }}>
          {current.body}
        </p>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        {step > 0 && (
          <button
            onClick={() => setStep(s => s - 1)}
            style={{ borderColor: BORDER, color: TEXT_DIM, fontSize: "0.8rem", padding: "0.5rem 1rem" }}
          >
            Back
          </button>
        )}
        <button
          onClick={() => isLast ? onDone() : setStep(s => s + 1)}
          style={{
            borderColor: color, color,
            fontSize: "0.8rem", padding: "0.5rem 1.5rem",
            background: `${color}18`,
            boxShadow: `0 0 12px ${color}30`,
          }}
        >
          {isLast ? "Got it — I'm ready!" : "Next →"}
        </button>
      </div>

      {/* Skip */}
      <button
        onClick={onDone}
        style={{ border: "none", background: "none", color: TEXT_DIM, fontSize: "0.7rem", letterSpacing: "0.08em", cursor: "pointer", padding: "0.25rem" }}
      >
        Skip tutorial
      </button>
    </div>
  );
}

// ── GamePage ──────────────────────────────────────────────────────────────────
export default function GamePage() {
  const wsUrl   = `${window.location.origin.replace(/^http/, "ws")}/`;
  const httpUrl = `${window.location.origin}/time`;
  const bpm     = 120;
  
  // Create game-specific metronome
  const playerMetronome = useMetronome({ 
    wsUrl, 
    httpUrl, 
    bpm, 
    isHost: false,
    clientType: "game"
  });
  
  const { tap, lastTap, history, scores, clients, serverNowMs, ws, celebration } = playerMetronome;

  const [config, setConfig]              = useState(DEFAULT_CONFIG);
  const [joined, setJoined]             = useState(false);
  const [name, setName]                 = useState("");
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialDone, setTutorialDone] = useState(false);
  const [gameStarted, setGameStarted]   = useState(false);
  const [gameEnded, setGameEnded]       = useState(false);
  const [selectedPart, setSelectedPart] = useState("");
  const [beats, setBeats]               = useState([]);
  const [startTime, setStartTime]       = useState(null);
  const [score, setScore]               = useState(0);
  const gameStartedRef                  = React.useRef(false);
  const navigate                        = useNavigate();

  const [finalScores, setFinalScores] = useState(() => {
    try {
      const saved = localStorage.getItem("finalScores");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  function updateFinalScores(s) {
    if (!s) return;
    setFinalScores(s);
    localStorage.setItem("finalScores", JSON.stringify(s));
  }

  useEffect(() => { fetchConfig().then(setConfig); }, []);

  const VOICE_COLORS = config.voiceColors;
  const VOICE_NAMES  = config.voiceNames;
  const VOICE_ORDER  = config.voiceOrder;

  const displayedClients = joined && name
    ? [{ name, part: selectedPart }, ...clients.filter(c => c.name !== name)]
    : clients;

  useEffect(() => {
    if (!ws) return;
    const handleMessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "stop") {
        updateFinalScores(msg.scores);
        console.log(`stop received: gameStartedRef=${gameStartedRef.current}`);
      } else if (msg.type === "start") {
        setGameStarted(true);
        gameStartedRef.current = true;
        if (msg.sopranoBeats && msg.altoBeats && msg.tenorBeats && msg.baritoneBeats) {
          const partMap = {
            soprano: msg.sopranoBeats, alto: msg.altoBeats,
            tenor: msg.tenorBeats, baritone: msg.baritoneBeats,
          };
          setBeats(partMap[selectedPart]);
        }
        if (msg.startTime) setStartTime(msg.startTime);
      }
    };
    ws.addEventListener("message", handleMessage);
    return () => ws.removeEventListener("message", handleMessage);
  }, [ws, navigate, updateFinalScores, score, name, selectedPart]);

  const handlePlayerJoin = () => {
    if (!name || !selectedPart) return;
    document.activeElement?.blur();
    window.scrollTo(0, 0);
    setJoined(true);
    setNameSubmitted(true);
    setShowTutorial(true);
    ws.send(JSON.stringify({ type: "playerJoin", name, part: selectedPart }));
  };

  const handleTutorialDone = () => {
    setShowTutorial(false);
    setTutorialDone(true);
  };

  // ── 1. Join screen ──────────────────────────────────────────────────────────
  if (!joined || !nameSubmitted) {
    const color = VOICE_COLORS[selectedPart];
    return (
      <div style={{
        position: "fixed", inset: 0, background: BG,
        display: "flex", flexDirection: "column",
        justifyContent: "center", alignItems: "center",
        gap: "1.75rem", padding: "2rem",
      }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: TEXT, letterSpacing: "-0.01em", marginBottom: "0.3rem" }}>
            Saxophone Hero
          </h1>
          <p style={{ fontSize: "0.75rem", color: TEXT_DIM, letterSpacing: "0.08em" }}>
            Join the game
          </p>
        </div>

        {/* Name input */}
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handlePlayerJoin()}
          placeholder="Your name"
          style={{
            padding: "0.75rem 1rem",
            background: BG2,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: TEXT,
            fontSize: "1rem",
            textAlign: "center",
            width: "100%", maxWidth: 280,
            outline: "none",
            fontFamily: "inherit",
            letterSpacing: "0.04em",
          }}
        />

        {/* Voice selector */}
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", justifyContent: "center" }}>
          {VOICE_ORDER.map(part => {
            const c = VOICE_COLORS[part] || TEXT_DIM;
            const active = selectedPart === part;
            return (
              <button key={part} onClick={() => setSelectedPart(part)} style={{
                padding: "0.55rem 1rem", borderRadius: 4,
                border: `1px solid ${active ? c : BORDER}`,
                background: active ? `${c}20` : "transparent",
                color: active ? c : TEXT_DIM,
                fontSize: "0.75rem", letterSpacing: "0.1em",
                textTransform: "uppercase", cursor: "pointer",
                transition: "all 0.15s",
                boxShadow: active ? `0 0 10px ${c}40` : "none",
              }}>
                {VOICE_NAMES[part] || part}
              </button>
            );
          })}
        </div>

        {/* Join button */}
        <button
          onClick={handlePlayerJoin}
          disabled={!name || !selectedPart}
          style={{
            padding: "0.65rem 2rem", borderRadius: 4,
            border: `1px solid ${color || BORDER}`,
            background: color ? `${color}20` : "transparent",
            color: color || TEXT_DIM,
            fontSize: "0.8rem", letterSpacing: "0.12em",
            textTransform: "uppercase", cursor: !name || !selectedPart ? "not-allowed" : "pointer",
            transition: "all 0.15s",
          }}
        >
          Join Game
        </button>

        <div style={{ fontSize: "0.7rem", color: TEXT_DIM, letterSpacing: "0.06em" }}>
          {clients?.length
            ? `${clients.length} player${clients.length !== 1 ? "s" : ""} online`
            : "Connecting…"}
        </div>
      </div>
    );
  }

  // ── 2. Tutorial ─────────────────────────────────────────────────────────────
  if (showTutorial && !tutorialDone && !gameStarted) {
    return <Tutorial part={selectedPart} color={VOICE_COLORS[selectedPart]} onDone={handleTutorialDone} />;
  }

  // ── 3. Lobby ─────────────────────────────────────────────────────────────────
  if (joined && !gameStarted) {
    const color = VOICE_COLORS[selectedPart] || TEXT;
    return (
      <div style={{
        position: "fixed", inset: 0, background: BG,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: "1.25rem", padding: "2rem",
      }}>
        <div style={{ fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color }}>
          {selectedPart}
        </div>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: TEXT, letterSpacing: "-0.01em" }}>
          Game Lobby
        </h1>
        <p style={{ fontSize: "0.8rem", color: TEXT_DIM, letterSpacing: "0.06em" }}>
          Waiting for the host to start…
        </p>

        {/* Connected players */}
        {displayedClients.length > 0 && (
          <div style={{
            background: BG2, border: `1px solid ${BORDER}`,
            borderRadius: 8, padding: "1rem 1.5rem",
            width: "100%", maxWidth: 320,
            fontSize: "0.8rem",
          }}>
            {displayedClients.map(player => {
              const pc = VOICE_COLORS[player.part] || TEXT_DIM;
              return (
                <div key={player.name + player.part} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "0.3rem 0", color: TEXT_DIM,
                  borderBottom: `1px solid ${BORDER}`,
                }}>
                  <span style={{ color: player.name === name ? TEXT : TEXT_DIM }}>
                    {player.name === name ? "● " : "○ "}{player.name}
                  </span>
                  <span style={{ color: pc, fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {player.part}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Replay tutorial */}
        <button
          onClick={() => { setShowTutorial(true); setTutorialDone(false); }}
          style={{ border: "none", background: "none", color: TEXT_DIM, fontSize: "0.7rem", letterSpacing: "0.08em", cursor: "pointer", marginTop: "0.5rem" }}
        >
          ↩ Review tutorial
        </button>

        <div style={{ width: 28, height: 2, background: color, borderRadius: 1, opacity: 0.6,
          animation: "pulse 2s ease-in-out infinite" }} />
        <style>{`@keyframes pulse { 0%,100%{opacity:0.2} 50%{opacity:0.8} }`}</style>
      </div>
    );
  }

  // ── 4. Game running or celebration ──────────────────────────────────────────
  if (gameStarted || gameEnded || celebration) {
    return (
      <MetronomeUI
        startMetronome={playerMetronome.startMetronome} 
        stopMetronome={playerMetronome.stopMetronome}
        tap={tap} 
        lastTap={lastTap} 
        history={history}
        scores={scores} 
        ws={ws} 
        isRunning={playerMetronome.running}
        serverNowMs={serverNowMs} 
        bpm={120}
        beatData={beats} 
        startTime={startTime}
        playerName={name} 
        playerPart={selectedPart}
        celebration={celebration}
      />
    );
  }

  return null;
}