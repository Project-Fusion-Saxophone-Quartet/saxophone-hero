// src/ProjectionPage.jsx
//
// Full-screen projection display — designed to run on a laptop connected to a
// projector placed behind the performers.  Shows all four voices as falling-
// block DDR lanes side by side (Baritone → Tenor → Alto → Soprano, matching
// typical SATB stage positioning right-to-left), a shared hit line, the beat
// grid, and per-voice particle bursts whose intensity scales with the team's
// rolling hit rate.
//
// Connects to the game WebSocket independently — works on a separate machine
// from the players.  Individual phones remain valid gaming interfaces.

import React, { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Column order: left → right mirrors BTAS stage positioning
// Overridden at runtime by /config endpoint — edit config.json to change.
const DEFAULT_VOICE_ORDER = ["baritone", "tenor", "alto", "soprano"];

const DEFAULT_VOICE_COLORS = {
  soprano:  "#a855f7",
  alto:     "#f7b731",
  tenor:    "#3b82f6",
  baritone: "#22c55e",
};

// Subdivision colours — identical to MetronomeUI so the projection matches
// what players see on their phones
const EPSILON = 0.025;
const SUBDIVISION_COLORS = {
  quarter:      "#4cc9f0",
  eighth:       "#f7b731",
  sixteenth:    "#26de81",
  triplet1:     "#fd9644",
  triplet2:     "#a55eea",
  quintuplet:   "#fc5c65",
  thirtySecond: "#111111",
  sextuplet:    "#fd79a8",
  other:        "#ffffff",
};

function getSubdivisionColor(beat) {
  const frac = ((beat % 1) + 1) % 1;
  if (frac < EPSILON || frac > 1 - EPSILON)                                  return SUBDIVISION_COLORS.quarter;
  if (Math.abs(frac - 0.5)   < EPSILON)                                      return SUBDIVISION_COLORS.eighth;
  if (Math.abs(frac - 0.25)  < EPSILON || Math.abs(frac - 0.75)  < EPSILON) return SUBDIVISION_COLORS.sixteenth;
  if (Math.abs(frac - 1/3)   < EPSILON)                                      return SUBDIVISION_COLORS.triplet1;
  if (Math.abs(frac - 2/3)   < EPSILON)                                      return SUBDIVISION_COLORS.triplet2;
  if (Math.abs(frac - 0.2)   < EPSILON || Math.abs(frac - 0.4)   < EPSILON ||
      Math.abs(frac - 0.6)   < EPSILON || Math.abs(frac - 0.8)   < EPSILON) return SUBDIVISION_COLORS.quintuplet;
  if (Math.abs(frac - 0.125) < EPSILON || Math.abs(frac - 0.375) < EPSILON ||
      Math.abs(frac - 0.875) < EPSILON)                                      return SUBDIVISION_COLORS.thirtySecond;
  if (Math.abs(frac - 1/6)   < EPSILON || Math.abs(frac - 5/6)   < EPSILON) return SUBDIVISION_COLORS.sextuplet;
  return SUBDIVISION_COLORS.other;
}

// Rolling window size for hit-rate calculation
const HIT_WINDOW = 20;

// ---------------------------------------------------------------------------
// Particle helpers
// ---------------------------------------------------------------------------

function createParticles(x, y, color, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 6;
    const life  = 0.65 + Math.random() * 0.35;
    out.push({
      x, y,
      vx:      Math.cos(angle) * speed,
      vy:      Math.sin(angle) * speed - 3,  // upward bias
      life,
      maxLife: life,
      decay:   0.016 + Math.random() * 0.012,
      size:    3 + Math.random() * 6,
      color,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------

export default function ProjectionPage() {
  const canvasRef = useRef(null);
  const [config, setConfig] = useState(null);

  // Fetch ensemble config from server on mount — no rebuild needed to reconfigure
  useEffect(() => {
    fetch("/config")
      .then(r => r.json())
      .then(setConfig)
      .catch(() => setConfig({
        voiceOrder:  DEFAULT_VOICE_ORDER,
        voiceColors: DEFAULT_VOICE_COLORS,
        voiceNames:  { soprano: "Soprano", alto: "Alto", tenor: "Tenor", baritone: "Baritone" },
      }));
  }, []);

  // Wait for config before starting the draw loop
  if (!config) return null;

  return <ProjectionCanvas canvasRef={canvasRef} config={config} />;
}

function ProjectionCanvas({ canvasRef, config }) {
  const VOICE_ORDER  = config.voiceOrder;
  const VOICE_COLORS = config.voiceColors;
  const VOICE_NAMES  = config.voiceNames || {};

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    let raf;

    // ── State (all in refs — no React re-renders needed) ─────────────────
    const offsetRef       = { current: 0 };           // NTP clock offset
    const startTimeRef    = { current: null };
    const runningRef      = { current: false };
    const scoresRef       = { current: {} };

    // Pre-flattened beat data per voice (set on "start")
    // { soprano: { beats, durations, hands, colors }, ... }
    const voiceDataRef    = { current: {} };

    // Rolling hit-rate windows per voice (last HIT_WINDOW taps)
    const hitWindowsRef   = { current: {
      soprano: [], alto: [], tenor: [], baritone: [],
    }};

    // Particle pools per voice
    const particlesRef    = { current: {
      soprano: [], alto: [], tenor: [], baritone: [],
    }};

    // Pending bursts queued by WS handler, consumed by draw loop
    const pendingBurstsRef = { current: [] };

    // Winner celebration — set once when Level 17 is detected
    const celebrationRef    = { current: null };  // { winner, color, score, isTie }
    const celebParticlesRef = { current: [] };
    const lastLevelRefs     = { current: { soprano: "", alto: "", tenor: "", baritone: "" } };

    // Upcoming tick times for column separator pulse
    const tickTimesRef = { current: [] };

    // QR code image for the pre-game waiting screen
    const qrImageRef = { current: null };
    fetch("/qr/game/svg")
      .then(r => r.text())
      .then(svg => {
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const url  = URL.createObjectURL(blob);
        const img  = new Image();
        img.onload = () => { qrImageRef.current = img; };
        img.src = url;
      })
      .catch(() => {});

    const serverNowMs = () => Date.now() + offsetRef.current;

    // ── NTP sync ─────────────────────────────────────────────────────────
    fetch("/time")
      .then(r => r.json())
      .then(({ serverTime }) => {
        offsetRef.current = serverTime - Date.now();
      })
      .catch(() => {});

    // ── WebSocket ─────────────────────────────────────────────────────────
    const wsUrl = `${window.location.origin.replace(/^http/, "ws")}/`;
    const ws    = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "start") {
        const raw = {
          soprano:  msg.sopranoBeats,
          alto:     msg.altoBeats,
          tenor:    msg.tenorBeats,
          baritone: msg.baritoneBeats,
        };

        // Pre-flatten per voice once so the draw loop doesn't allocate
        const vd = {};
        for (const [voice, data] of Object.entries(raw)) {
          if (!data?.sections) continue;
          const beats     = data.sections.flatMap(s => s.beats);
          const durations = data.sections.flatMap(s => s.durations);
          const hands     = data.sections.flatMap(s => s.hands);
          const colors    = beats.map(getSubdivisionColor);
          vd[voice] = { beats, durations, hands, colors, sections: data.sections };
        }

        voiceDataRef.current    = vd;
        startTimeRef.current    = msg.startTime;
        runningRef.current      = true;

        // Reset per-game state
        hitWindowsRef.current   = { soprano: [], alto: [], tenor: [], baritone: [] };
        particlesRef.current    = { soprano: [], alto: [], tenor: [], baritone: [] };
        pendingBurstsRef.current = [];
      }

      if (msg.type === "celebrate") {
        const sortedScores = Object.entries(msg.scores || {}).sort(([,a],[,b]) => b - a);
        celebrationRef.current = {
          winner:    msg.winner,
          isTie:     msg.isTie,
          score:     msg.score,
          allScores: sortedScores,
          color:     VOICE_COLORS[msg.winner.split(" & ")[0]] || "#ffffff",
          born:      performance.now(),
        };
      }

      if (msg.type === "stop") {
        runningRef.current = false;
      }

      if (msg.type === "scoreUpdate") {
        scoresRef.current = msg.scores ?? {};
      }

      if (msg.type === "tickSchedule") {
        // Accumulate upcoming tick times for the column separator pulse
        tickTimesRef.current.push(...msg.tickTimes);
        // Keep only future ticks (trim anything more than 5s old)
        const cutoff = Date.now() + offsetRef.current - 500;
        tickTimesRef.current = tickTimesRef.current.filter(t => t > cutoff);
      }

      if (msg.type === "tapBroadcast") {
        const { part, hit } = msg;
        if (!part) return;

        // Update rolling hit window
        const win = hitWindowsRef.current[part] ?? [];
        win.push(!!hit);
        if (win.length > HIT_WINDOW) win.shift();
        hitWindowsRef.current[part] = win;

        // Queue burst on hit
        if (hit) {
          const hitRate = win.length > 0
            ? win.filter(Boolean).length / win.length
            : 1;
          pendingBurstsRef.current.push({ voice: part, hitRate });
        }
      }
    };

    // ── Canvas resize ─────────────────────────────────────────────────────
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    // ── Layout constants ──────────────────────────────────────────────────
    const BPM         = 120;
    const MS_PER_BEAT = 60000 / BPM;
    const TRAVEL_MS   = 2000;
    const LOOK_AHEAD  = 4000;
    const SCORE_H     = 72;   // top strip for score bars
    const LABEL_H     = 42;   // voice name + level name   // voice label row just below score strip
    const fmtScore    = (s) => Number.isInteger(s) ? String(s) : s.toFixed(1);

    // ── Draw helpers ──────────────────────────────────────────────────────

    function drawScoreBars(w) {
      const scores   = scoresRef.current;
      const maxScore = Math.max(1, ...Object.values(scores));
      const colW     = w / 4;

      // Background strip
      ctx.fillStyle = "rgba(0,0,0,0.72)";
      ctx.fillRect(0, 0, w, SCORE_H);

      VOICE_ORDER.forEach((voice, vi) => {
        const score  = scores[voice] ?? 0;
        const fill   = score / maxScore;
        const color  = VOICE_COLORS[voice];
        const barX   = colW * vi + 10;
        const barW   = colW - 20;
        const barH   = 18;
        const barY   = SCORE_H / 2 - barH / 2;

        // Track
        ctx.fillStyle = "rgba(255,255,255,0.07)";
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 4);
        ctx.fill();

        // Fill
        if (fill > 0) {
          ctx.shadowColor = color;
          ctx.shadowBlur  = 10;
          ctx.fillStyle   = color;
          ctx.beginPath();
          ctx.roundRect(barX, barY, barW * fill, barH, 4);
          ctx.fill();
          ctx.shadowBlur  = 0;
        }

        // Score number above bar
        ctx.font         = "bold 13px system-ui";
        ctx.fillStyle    = "rgba(255,255,255,0.75)";
        ctx.textAlign    = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(score, colW * vi + colW / 2, barY - 2);
      });
    }

    function drawVoiceLabels(w, now) {
      const colW = w / 4;
      VOICE_ORDER.forEach((voice, vi) => {
        const color    = VOICE_COLORS[voice];
        const vd       = voiceDataRef.current[voice];
        const cx       = colW * vi + colW / 2;
        const stripY   = SCORE_H;
        const stripH   = LABEL_H;

        // Find current section for this voice
        let levelName = "";
        if (vd?.sections && startTimeRef.current) {
          const currentBeat = (now - startTimeRef.current) / MS_PER_BEAT;
          for (const sec of vd.sections) {
            const [first, last] = sec.markers;
            if (currentBeat >= first && currentBeat <= last) { levelName = sec.name; break; }
          }
          // Hold last known level when between sections
          if (!levelName) {
            for (let i = vd.sections.length - 1; i >= 0; i--) {
              if (currentBeat > vd.sections[i].markers[1]) {
                levelName = vd.sections[i].name;
                break;
              }
            }
          }
        }

        // Voice name (upper half of strip)
        ctx.font         = "bold 12px system-ui";
        ctx.fillStyle    = color;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText((VOICE_NAMES[voice] || voice).toUpperCase(), cx, stripY + stripH * 0.3);

        // Current level (lower half, slightly smaller and dimmer)
        ctx.font         = "11px system-ui";
        ctx.fillStyle    = levelName ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)";
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(levelName || "—", cx, stripY + stripH * 0.72);
      });
    }

    function drawGrid(w, h, hitLineY, now) {
      const firstB = Math.floor((now - TRAVEL_MS * 0.15 - startTimeRef.current) / MS_PER_BEAT);
      const lastB  = Math.ceil ((now + TRAVEL_MS + LOOK_AHEAD - startTimeRef.current) / MS_PER_BEAT);

      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.13)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 6]);

      for (let b = firstB; b <= lastB; b++) {
        const gridY = hitLineY - ((startTimeRef.current + b * MS_PER_BEAT - now) / TRAVEL_MS) * hitLineY;
        if (gridY < SCORE_H + LABEL_H || gridY > h) continue;
        ctx.beginPath();
        ctx.moveTo(0, gridY);
        ctx.lineTo(w, gridY);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawBlocks(w, hitLineY, now) {
      const colW = w / 4;

      VOICE_ORDER.forEach((voice, vi) => {
        const vd = voiceDataRef.current[voice];
        if (!vd) return;

        const { beats, durations, hands, colors } = vd;
        const colX  = colW * vi;
        const PAD   = colW * 0.06;
        const halfW = (colW - PAD * 2) / 2 - 2;
        const lX    = colX + PAD;
        const rX    = colX + colW / 2 + 2;

        for (let i = 0; i < beats.length; i++) {
          if (!hands[i] || durations[i] == null || !colors[i]) continue;
          const beatTime         = startTimeRef.current + beats[i] * MS_PER_BEAT;
          const durationMs       = durations[i] * MS_PER_BEAT;
          const scaledDurationMs = durationMs * 0.2;
          const blockH           = Math.max(6, (scaledDurationMs / TRAVEL_MS) * hitLineY);
          const isHold           = durationMs > 125;  // same threshold as MetronomeUI
          const noteEndMs        = beatTime + scaledDurationMs;
          const timeToHit        = beatTime - now;
          const timeToEnd        = noteEndMs - now;

          // Visibility: hold blocks stay until scaled end, tap blocks fade after hit
          const isVisible = isHold
            ? (timeToEnd > -300 && timeToHit < TRAVEL_MS + LOOK_AHEAD)
            : (timeToHit > -300 && timeToHit < TRAVEL_MS + LOOK_AHEAD);
          if (!isVisible) continue;

          // Alpha: hold blocks stay opaque through scaled duration then fade
          let alpha;
          if (timeToHit >= 0) {
            alpha = 1;
          } else if (isHold) {
            alpha = timeToEnd >= 0 ? 1 : Math.max(0, 1 + timeToEnd / 300);
          } else {
            alpha = Math.max(0, 1 + timeToHit / 300);
          }

          const y = hitLineY - (timeToHit / TRAVEL_MS) * hitLineY - blockH;
          if (y + blockH < SCORE_H + LABEL_H) continue;

          ctx.globalAlpha = alpha;
          ctx.fillStyle   = colors[i];

          if (hands[i].includes("L")) ctx.fillRect(lX, y, halfW, blockH);
          if (hands[i].includes("R")) ctx.fillRect(rX, y, halfW, blockH);
        }
        ctx.globalAlpha = 1;
      });
    }

    function spawnAndDrawParticles(w, hitLineY) {
      const colW = w / 4;

      // Spawn pending bursts
      while (pendingBurstsRef.current.length > 0) {
        const { voice, hitRate } = pendingBurstsRef.current.shift();
        const vi = VOICE_ORDER.indexOf(voice);
        if (vi === -1) continue;

        const cx    = colW * vi + colW / 2;
        // Scale: 6 particles at 0% hit rate → 44 at 100%
        const count = Math.round(6 + hitRate * 38);
        particlesRef.current[voice].push(
          ...createParticles(cx, hitLineY, VOICE_COLORS[voice], count)
        );
      }

      // Animate particles
      for (const voice of VOICE_ORDER) {
        const alive = [];
        for (const p of particlesRef.current[voice]) {
          p.x    += p.vx;
          p.y    += p.vy;
          p.vy   += 0.18;
          p.life -= p.decay;
          if (p.life <= 0) continue;

          const t = p.life / p.maxLife;
          ctx.globalAlpha = t * t;
          ctx.fillStyle   = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
          ctx.fill();
          alive.push(p);
        }
        particlesRef.current[voice] = alive;
      }
      ctx.globalAlpha = 1;
    }

    // ── Celebration overlay helper ─────────────────────────────────────────
    const drawCelebrationOverlay = (w, h) => {
      const cel     = celebrationRef.current;
      if (!cel) return;
      const elapsed = performance.now() - cel.born;
      const fadeIn  = Math.min(1, elapsed / 600);
      const pulse   = (Math.sin(performance.now() * 0.005) + 1) / 2;
      const colW    = w / 4;

      ctx.fillStyle = `rgba(0,0,0,${0.72 * fadeIn})`;
      ctx.fillRect(0, SCORE_H + LABEL_H, w, h - SCORE_H - LABEL_H);

      const aliveC = [];
      for (const p of celebParticlesRef.current) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= p.decay * 0.35;
        if (p.life <= 0) continue;
        const t = p.life / p.maxLife;
        ctx.globalAlpha = t * t * fadeIn;
        ctx.fillStyle   = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2); ctx.fill();
        aliveC.push(p);
      }
      celebParticlesRef.current = aliveC;
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.globalAlpha = fadeIn;
      const midY = SCORE_H + LABEL_H + (h - SCORE_H - LABEL_H) / 2;

      ctx.font = `${100 + pulse * 14}px system-ui`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🏆", w / 2, midY - h * 0.2);

      ctx.font = `bold ${Math.min(80, w * 0.09) + pulse * 5}px system-ui`;
      ctx.fillStyle = cel.color; ctx.shadowColor = cel.color;
      ctx.shadowBlur = 30 + pulse * 30;
      ctx.fillText(cel.winner.toUpperCase(), w / 2, midY - h * 0.04);
      ctx.shadowBlur = 0;

      ctx.font = `bold ${Math.min(52, w * 0.06)}px system-ui`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(cel.isTie ? "IT'S A TIE!" : "WINS!", w / 2, midY + h * 0.08);

      ctx.font = `bold ${Math.min(28, w * 0.032)}px system-ui`;
      cel.allScores.forEach(([voice, score]) => {
        const isWinner = score === cel.score;
        const vx = colW * VOICE_ORDER.indexOf(voice) + colW / 2;
        ctx.fillStyle   = isWinner ? VOICE_COLORS[voice] : "rgba(255,255,255,0.45)";
        ctx.shadowColor = isWinner ? VOICE_COLORS[voice] : "transparent";
        ctx.shadowBlur  = isWinner ? 12 : 0;
        ctx.textAlign   = "center";
        ctx.fillText(`${voice}: ${fmtScore(score)}`, vx, midY + h * 0.2);
      });
      ctx.shadowBlur = 0;
      ctx.restore();
    };

    // ── Main draw loop ────────────────────────────────────────────────────
    const draw = () => {
      try {
      const now = serverNowMs();
      const w   = canvas.width;
      const h   = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = "#111111";
      ctx.fillRect(0, 0, w, h);

      // Score bars
      drawScoreBars(w);

      const hitLineY = h * 0.87;

      // Column separators — yellow vertical lines that pulse on every beat,
      // giving clear visual separation between the four Tetris wells while
      // staying musically connected to the rhythm
      const drawColumnSeparators = (w, h, now) => {
        const colW = w / 4;

        // Beat phase: 0 at the moment of a click, rising to 1 just before next
        let pulse = 0;
        if (startTimeRef.current && runningRef.current) {
          const elapsed   = now - startTimeRef.current;
          const beatPhase = (elapsed % MS_PER_BEAT) / MS_PER_BEAT;
          // Sharp exponential decay: full brightness on beat, fades within ~⅓ beat
          pulse = Math.pow(Math.max(0, 1 - beatPhase * 2.8), 2);
        }

        const alpha     = 0.18 + pulse * 0.68;
        const lineWidth = 1.5  + pulse * 2.5;
        const glowBlur  = pulse * 22;

        ctx.save();
        ctx.setLineDash([]);
        ctx.strokeStyle = `rgba(255, 210, 50, ${alpha})`;
        ctx.lineWidth   = lineWidth;
        ctx.shadowColor = `rgba(255, 210, 50, ${pulse * 0.85})`;
        ctx.shadowBlur  = glowBlur;

        for (let i = 1; i < 4; i++) {
          const x = colW * i;
          ctx.beginPath();
          ctx.moveTo(x, SCORE_H);
          ctx.lineTo(x, h);
          ctx.stroke();
        }

        ctx.restore();
      };

      drawColumnSeparators(w, h, now);
      drawVoiceLabels(w, now);
      drawGrid(w, h, hitLineY, now);
      drawBlocks(w, hitLineY, now);

      // Hit line (drawn after blocks so it's always visible)
      ctx.fillStyle = "#e63946";
      ctx.fillRect(0, hitLineY, w, 3);

      // Particles (drawn last, on top of everything)
      spawnAndDrawParticles(w, hitLineY);

      // ── Level 17 winner detection ──────────────────────────────────────────
      if (!celebrationRef.current) {
        for (const voice of VOICE_ORDER) {
          const vd = voiceDataRef.current[voice];
          if (!vd?.sections) continue;
          const currentBeat = (now - startTimeRef.current) / MS_PER_BEAT;
          let levelName = "";
          for (const sec of vd.sections) {
            const [first, last] = sec.markers;
            if (currentBeat >= first && currentBeat <= last) { levelName = sec.name; break; }
          }
          if (levelName === "Level 17" && lastLevelRefs.current[voice] !== "Level 17") {
            // Any voice hitting Level 17 triggers the announcement
            const s      = scoresRef.current;
            const sorted = Object.entries(s).sort(([, a], [, b]) => b - a);
            if (sorted.length > 0) {
              const topScore = sorted[0][1];
              const winners  = sorted.filter(([, sc]) => sc === topScore);
              celebrationRef.current = {
                winner:  winners.map(([v]) => v).join(" & "),
                color:   VOICE_COLORS[winners[0][0]] || "#ffffff",
                score:   topScore,
                isTie:   winners.length > 1,
                allScores: sorted,
                born:    performance.now(),
              };
              // Big burst of celebration particles
              for (let i = 0; i < 120; i++) {
                const px = Math.random() * w;
                const py = (SCORE_H + LABEL_H) + Math.random() * (h - SCORE_H - LABEL_H) * 0.7;
                const vc = winners[Math.floor(Math.random() * winners.length)][0];
                celebParticlesRef.current.push(
                  ...createParticles(px, py, VOICE_COLORS[vc] || "#fff", 1)
                );
              }
            }
            break;
          }
          lastLevelRefs.current[voice] = levelName;
        }
      }

      // ── Not running: show celebration or waiting screen ───────────────────
      if (!runningRef.current || !startTimeRef.current) {
        if (celebrationRef.current) {
          // Seed particles once
          if (celebParticlesRef.current.length === 0) {
            const winners = celebrationRef.current.winner.split(" & ");
            for (let i = 0; i < 120; i++) {
              const px = Math.random() * w;
              const py = (SCORE_H + LABEL_H) + Math.random() * (h - SCORE_H - LABEL_H) * 0.7;
              const vc = winners[Math.floor(Math.random() * winners.length)];
              celebParticlesRef.current.push(
                ...createParticles(px, py, VOICE_COLORS[vc] || "#fff", 1)
              );
            }
          }
          drawColumnSeparators(w, h, now);
          drawVoiceLabels(w, now);
          drawCelebrationOverlay(w, h);
        } else {
          // Pre-game waiting screen — show QR code for late joiners
          ctx.fillStyle    = "rgba(255,255,255,0.15)";
          ctx.font         = "bold 22px system-ui";
          ctx.textAlign    = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("Waiting for game to start…", w / 2, h * 0.25);

          if (qrImageRef.current) {
            const qrSize = Math.min(w, h) * 0.38;
            const qrX    = (w - qrSize) / 2;
            const qrY    = h * 0.32;
            ctx.drawImage(qrImageRef.current, qrX, qrY, qrSize, qrSize);

            ctx.fillStyle    = "rgba(255,255,255,0.5)";
            ctx.font         = "bold 18px system-ui";
            ctx.textAlign    = "center";
            ctx.textBaseline = "top";
            ctx.fillText("Scan to join the game", w / 2, qrY + qrSize + 16);
          }
        }
        raf = requestAnimationFrame(draw);
        return;
      }

      // ── Winner celebration overlay ─────────────────────────────────────────
      drawCelebrationOverlay(w, h);

      raf = requestAnimationFrame(draw);
      } catch(e) {
        console.error("ProjectionPage draw error:", e);
        raf = requestAnimationFrame(draw);
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      ws.close();
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#111111" }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />
    </div>
  );
}
