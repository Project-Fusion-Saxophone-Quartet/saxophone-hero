// src/ProgressionPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProgressionUI } from "./components/ProgressionUI";
import { useMetronome } from "./hooks/useMetronome";

const DEFAULT_CONFIG = {
  voiceOrder:  ["soprano", "alto", "tenor", "baritone"],
  voiceNames:  { soprano: "Soprano", alto: "Alto", tenor: "Tenor", baritone: "Baritone" },
  voiceColors: { soprano: "#f72585", alto: "#4cc9f0", tenor: "#4361ee", baritone: "#7209b7" },
};

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

export default function ProgressionPage() {
  // Create performer-specific metronome
  const wsUrl   = `${window.location.origin.replace(/^http/, "ws")}/`;
  const httpUrl = `${window.location.origin}/time`;
  const bpm     = 120;
  
  const performerMetronome = useMetronome({ 
    wsUrl, 
    httpUrl, 
    bpm, 
    isHost: false, 
    clientType: "performer"
  });
  
  const { scores, ws, serverNowMs, startMetronome, stopMetronome } = performerMetronome;
  const isRunning = performerMetronome.running;
  const celebration = performerMetronome.celebration;

  const [config, setConfig]             = useState(DEFAULT_CONFIG);
  const [joined, setJoined]           = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameEnded, setGameEnded]     = useState(false);
  const gameStartedRef    = React.useRef(false);
  const selectedPartRef   = React.useRef("");
  const [selectedPart, setSelectedPart] = useState(() => {
    return sessionStorage.getItem("performerPart") || "";
  });
  const [beats, setBeats]             = useState([]);
  const [startTime, setStartTime]     = useState(null);

  useEffect(() => { selectedPartRef.current = selectedPart; }, [selectedPart]);

  useEffect(() => {
    const prevJoined = sessionStorage.getItem("performerJoined");
    if (!selectedPart || !prevJoined || !ws || joined) return;

    const doJoin = () => {
      setJoined(true);
      ws.send(JSON.stringify({ type: "playerJoin", name: selectedPart, part: selectedPart }));
    };

    if (ws.readyState === WebSocket.OPEN) {
      doJoin();
    } else {
      ws.addEventListener("open", doJoin, { once: true });
    }
  }, [ws, selectedPart, joined]);

  const navigate = useNavigate();

  useEffect(() => { fetchConfig().then(setConfig); }, []);

  const VOICE_COLORS = config.voiceColors;
  const VOICE_NAMES  = config.voiceNames;
  const VOICE_ORDER  = config.voiceOrder;

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "stop") {
        if (gameStartedRef.current) setGameEnded(true);
      } else if (msg.type === "start") {
        setGameStarted(true);
        gameStartedRef.current = true;

        if (
          msg.sopranoBeats &&
          msg.altoBeats &&
          msg.tenorBeats &&
          msg.baritoneBeats
        ) {
          const partMap = {
            soprano:  msg.sopranoBeats,
            alto:     msg.altoBeats,
            tenor:    msg.tenorBeats,
            baritone: msg.baritoneBeats,
          };
          setBeats(partMap[selectedPartRef.current]);
        }

        if (msg.startTime) setStartTime(msg.startTime);
      }
    };

    ws.addEventListener("message", handleMessage);
    return () => ws.removeEventListener("message", handleMessage);
  }, [ws]);

  const handlePerformerJoin = () => {
    if (!selectedPart) return;
    document.activeElement?.blur();
    window.scrollTo(0, 0);
    sessionStorage.setItem("performerPart", selectedPart);
    sessionStorage.setItem("performerJoined", "true");
    setJoined(true);
    ws.send(JSON.stringify({ type: "playerJoin", name: selectedPart, part: selectedPart }));
  };

  // ── 1. Join screen ──────────────────────────────────────────────────────────
  if (!joined) {
    return (
      <div style={{
        position: "fixed", inset: 0,
        background: "#0a0a0f",
        display: "flex", flexDirection: "column",
        justifyContent: "center", alignItems: "center",
        gap: "2rem", padding: "2rem",
      }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, letterSpacing: "-0.01em", color: "rgba(255,255,255,0.88)", marginBottom: "0.4rem" }}>
            Level Progression
          </h1>
          <p style={{ fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>
            Select your part
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
          {VOICE_ORDER.map((part) => {
            const color = VOICE_COLORS[part] || "rgba(255,255,255,0.5)";
            const active = selectedPart === part;
            return (
              <button
                key={part}
                onClick={() => setSelectedPart(part)}
                style={{
                  padding: "0.6rem 1.2rem",
                  borderRadius: "4px",
                  border: `1px solid ${active ? color : "rgba(255,255,255,0.12)"}`,
                  background: active ? `${color}22` : "transparent",
                  color: active ? color : "rgba(255,255,255,0.5)",
                  fontSize: "0.8rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  boxShadow: active ? `0 0 12px ${color}44` : "none",
                }}
              >
                {VOICE_NAMES[part] || part}
              </button>
            );
          })}
        </div>
        <button
          onClick={handlePerformerJoin}
          disabled={!selectedPart}
          style={{
            padding: "0.65rem 2rem",
            borderRadius: "4px",
            border: `1px solid ${selectedPart ? VOICE_COLORS[selectedPart] : "rgba(255,255,255,0.12)"}`,
            background: selectedPart ? `${VOICE_COLORS[selectedPart]}22` : "transparent",
            color: selectedPart ? VOICE_COLORS[selectedPart] : "rgba(255,255,255,0.25)",
            fontSize: "0.8rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            cursor: selectedPart ? "pointer" : "not-allowed",
            transition: "all 0.15s",
          }}
        >
          Join Game
        </button>
      </div>
    );
  }

  // ── 2. Lobby ────────────────────────────────────────────────────────────────
  if (joined && !gameStarted) {
    const color = VOICE_COLORS[selectedPart] || "rgba(255,255,255,0.5)";
    return (
      <div style={{
        position: "fixed", inset: 0,
        background: "#0a0a0f",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: "1rem", padding: "2rem",
      }}>
        <div style={{
          fontSize: "0.65rem", letterSpacing: "0.18em",
          textTransform: "uppercase", color,
          marginBottom: "0.25rem",
        }}>
          {selectedPart}
        </div>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "rgba(255,255,255,0.88)", letterSpacing: "-0.01em" }}>
          Performer Lobby
        </h1>
        <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em" }}>
          Waiting for host to start the game…
        </p>
        <div style={{
          width: 32, height: 2,
          background: color,
          borderRadius: 1,
          marginTop: "0.5rem",
          animation: "pulse 2s ease-in-out infinite",
        }} />
        <style>{`@keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }`}</style>
      </div>
    );
  }

  // ── 3. Game running or ended ────────────────────────────────────────────────
  if (gameStarted || gameEnded) {
    const winnerColor = celebration
      ? (VOICE_COLORS[celebration.winner.split(" & ")[0]] || "#ffffff")
      : "#ffffff";

    return (
      <div style={{ position: "relative", width: "100%", height: "100dvh" }}>
        <ProgressionUI
          startMetronome={startMetronome}
          stopMetronome={stopMetronome}
          scores={scores}
          ws={ws}
          isRunning={isRunning}
          serverNowMs={serverNowMs}
          bpm={120}
          beatData={beats}
          startTime={startTime}
          part={selectedPart}
        />

        {celebration && (
          <div
            style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              backgroundColor: "rgba(0,0,0,1)", // ✅ Fully opaque — no ProgressionUI bleed-through
              pointerEvents: "none",
              zIndex: 9999, // ✅ Force celebration to render on top
            }}
          >
            <div style={{ fontSize: "clamp(1rem, 5vw, 2rem)", color: "rgba(255,255,255,0.6)", marginBottom: "0.5rem", letterSpacing: "0.15em" }}>
              {celebration.isTie ? "IT'S A TIE" : "WINNER"}
            </div>
            <div
              style={{
                fontSize: "clamp(2rem, 10vw, 5rem)", fontWeight: "900",
                color: winnerColor, letterSpacing: "0.05em",
                textShadow: `0 0 40px ${winnerColor}`,
                textTransform: "uppercase", textAlign: "center",
                padding: "0 1rem",
              }}
            >
              {celebration.winner}
            </div>
            <div style={{ fontSize: "clamp(1rem, 4vw, 1.8rem)", color: "rgba(255,255,255,0.5)", marginTop: "1rem" }}>
              Score: {celebration.score}
            </div>
            <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.4rem", alignItems: "center" }}>
              {Object.entries(celebration.scores || {})
                .sort(([, a], [, b]) => b - a)
                .map(([voice, sc]) => (
                  <div key={voice} style={{ fontSize: "clamp(0.8rem, 3vw, 1.2rem)", color: VOICE_COLORS[voice] || "#fff", opacity: 0.85 }}>
                    {voice.charAt(0).toUpperCase() + voice.slice(1)}: {sc}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}