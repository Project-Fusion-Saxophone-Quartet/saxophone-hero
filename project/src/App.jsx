// src/App.jsx
import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useMetronome } from "./hooks/useMetronome";
import GamePage from "./GamePage";
import ProgressionPage from "./ProgressionPage";
import ProjectionPage from "./ProjectionPage";

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG       = "#0a0a0f";
const BG2      = "#12121a";
const BORDER   = "rgba(255,255,255,0.08)";
const TEXT     = "rgba(255,255,255,0.88)";
const TEXT_DIM = "rgba(255,255,255,0.4)";

const VOICE_COLORS = {
  soprano:  "#f72585",
  alto:     "#4cc9f0",
  tenor:    "#4361ee",
  baritone: "#7209b7",
};

const GLOBAL_STYLE = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root {
    height: 100%;
    background: #0a0a0f;
    color: rgba(255,255,255,0.88);
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  }
  a { color: rgba(255,255,255,0.4); text-decoration: none; transition: color 0.2s; }
  a:hover { color: rgba(255,255,255,0.88); }
  button {
    background: transparent;
    border: 1px solid rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.88);
    font-family: inherit;
    font-size: 0.9rem;
    padding: 0.5rem 1.25rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    letter-spacing: 0.05em;
  }
  button:hover:not(:disabled) {
    background: rgba(255,255,255,0.07);
    border-color: rgba(255,255,255,0.25);
  }
  button:disabled { opacity: 0.3; cursor: not-allowed; }
`;

export default function App() {
  return (
    <>
      <style>{GLOBAL_STYLE}</style>
      <Router>
        <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
          <nav style={{
            padding: "0.75rem 1.25rem",
            borderBottom: `1px solid ${BORDER}`,
            display: "flex",
            gap: "1.5rem",
            alignItems: "center",
            background: BG2,
            fontSize: "0.8rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            <a href="/">Home</a>
            <a href="/game">Game</a>
            <a href="/performer">Performer Page</a>
            <a href="/projection">Projection</a>
          </nav>

          <div style={{ flex: 1 }}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/game" element={<GamePage />} />
              <Route path="/performer" element={<ProgressionPage />} />
              <Route path="/scoreboard" element={<ScoreboardPage />} />
              <Route path="/projection" element={<ProjectionPage />} />
            </Routes>
          </div>
        </div>
      </Router>
    </>
  );
}

// ── Home page ─────────────────────────────────────────────────────────────────
function HomePage() {
  const wsUrl   = `${window.location.origin.replace(/^http/, "ws")}/`;
  const httpUrl = `${window.location.origin}/time`;
  const bpm     = 120;
  
  const hostMetronome = useMetronome({ wsUrl, httpUrl, bpm, isHost: true });
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const warmup = () => hostMetronome.initAudioContext?.();
    window.addEventListener("pointerdown", warmup, { once: true });
    return () => window.removeEventListener("pointerdown", warmup);
  }, [hostMetronome]);

  const wrappedStart = () => {
    hostMetronome.initAudioContext?.();
    hostMetronome.startMetronome();
    setIsRunning(true);
  };
  const wrappedStop = () => {
    setIsRunning(false);
    hostMetronome.stopMetronome();
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <div style={{ marginBottom: "2.5rem" }}>
        <h1 style={{
          fontSize: "clamp(1.8rem, 5vw, 2.8rem)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          marginBottom: "0.5rem",
          color: TEXT,
        }}>
          Saxophone Hero!
        </h1>
        <h2 style={{
          fontSize: "clamp(1rem, 3vw, 1.5rem)",
          fontWeight: 100,
          letterSpacing: "-0.02em",
          marginBottom: "0.5rem",
          color: TEXT,
        }}>
          music composed by Sky Macklay
        </h2>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          {Object.entries(VOICE_COLORS).map(([voice, color]) => (
            <span key={voice} style={{
              color, fontSize: "0.7rem", letterSpacing: "0.14em", textTransform: "uppercase",
            }}>{voice}</span>
          ))}
        </div>
        <div style={{ width: 36, height: 2, background: VOICE_COLORS.soprano, borderRadius: 1 }} />
      </div>

      <div style={{
        background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8,
        padding: "1.5rem", marginBottom: "2rem", fontSize: "0.875rem", lineHeight: 1.7,
      }}>
        {[
          { label: "For Performers", color: VOICE_COLORS.alto,
            text: "Open the Performer Page link on your iPad and select your part. You'll be directed to a lobby to wait for the piece to start." },
          { label: "For Players", color: VOICE_COLORS.tenor,
            text: "Scan the QR code to open the Game link on your phone. Select a voice and wait for the game to start." },
          { label: "Serving the Piece", color: VOICE_COLORS.baritone,
            text: "Run this page on the electronics laptop. Route headphone audio to a splitter so all players hear the click track. Once everyone is in their lobbies, press Start Game." },
        ].map(({ label, color, text }, i) => (
          <section key={i} style={{ marginBottom: i < 2 ? "1.25rem" : 0 }}>
            <h2 style={{ fontSize: "0.65rem", letterSpacing: "0.16em", textTransform: "uppercase", color, marginBottom: "0.5rem" }}>
              {label}
            </h2>
            <p style={{ color: TEXT }}>{text}</p>
          </section>
        ))}
      </div>

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <button
          onClick={wrappedStart}
          disabled={hostMetronome.running}
          style={{ borderColor: isRunning ? BORDER : VOICE_COLORS.soprano, color: isRunning ? TEXT_DIM : VOICE_COLORS.soprano }}
        >
          Start Game
        </button>
        <button onClick={wrappedStop} disabled={!hostMetronome.running}>
          Stop Game
        </button>
        {hostMetronome.running && (
          <span style={{ fontSize: "0.7rem", color: VOICE_COLORS.soprano, letterSpacing: "0.12em" }}>
            ● LIVE
          </span>
        )}
      </div>
    </div>
  );
}

// ── Scoreboard page ───────────────────────────────────────────────────────────
function ScoreboardPage() {
  const [config, setConfig] = useState({
    voiceOrder:  ["soprano", "alto", "tenor", "baritone"],
    voiceNames:  { soprano: "Soprano", alto: "Alto", tenor: "Tenor", baritone: "Baritone" },
    voiceColors: { soprano: "#f72585", alto: "#4cc9f0", tenor: "#4361ee", baritone: "#7209b7" },
  });
  
  const [liveScores, setLiveScores] = useState({});

  useEffect(() => {
    fetch("/config").then(r => r.json()).then(setConfig).catch(() => {});
  }, []);

  const parts = config.voiceOrder;
  const max = Math.max(...parts.map(p => liveScores?.[p] ?? 0), 1);

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <h1 style={{ fontSize: "0.65rem", letterSpacing: "0.16em", textTransform: "uppercase", color: TEXT_DIM, marginBottom: "2rem" }}>
        Live Scores
      </h1>
      {parts.map((part) => {
        const score = liveScores?.[part] ?? 0;
        const pct   = (score / max) * 100;
        const color = config.voiceColors[part] || "rgba(255,255,255,0.5)";
        const label = config.voiceNames[part]  || part;
        return (
          <div key={part} style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
              <span style={{ color, fontSize: "0.7rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>{label}</span>
              <span style={{ color: TEXT, fontVariantNumeric: "tabular-nums" }}>{score}</span>
            </div>
            <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${pct}%`, background: color,
                borderRadius: 2, transition: "width 0.4s ease",
                boxShadow: `0 0 8px ${color}`,
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}