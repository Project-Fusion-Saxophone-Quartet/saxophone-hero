import React, { useEffect, useRef, useState } from "react";
import "./MetronomeUI.css";

// ---------------------------------------------------------------------------
// Subdivision colour map
// ---------------------------------------------------------------------------

const EPSILON = 0.025;

const SUBDIVISION_COLORS = {
  quarter:      "#4cc9f0",
  eighth:       "#f7b731",
  sixteenth:    "#26de81",
  triplet1:     "#fd9644",
  triplet2:     "#a55eea",
  quintuplet:   "#fc5c65",
  thirtySecond: "#aaaaaa",
  sextuplet:    "#fd79a8",
  other:        "#ffffff",
};

const LEGEND = [
  { key: "quarter",      label: "Beat",         color: SUBDIVISION_COLORS.quarter      },
  { key: "eighth",       label: "& (8th)",      color: SUBDIVISION_COLORS.eighth       },
  { key: "sixteenth",    label: "e / a (16th)", color: SUBDIVISION_COLORS.sixteenth    },
  { key: "triplet1",     label: "Trip. 1/3",    color: SUBDIVISION_COLORS.triplet1     },
  { key: "triplet2",     label: "Trip. 2/3",    color: SUBDIVISION_COLORS.triplet2     },
  { key: "quintuplet",   label: "Quintuplet",   color: SUBDIVISION_COLORS.quintuplet   },
  { key: "thirtySecond", label: "32nd",         color: SUBDIVISION_COLORS.thirtySecond },
  { key: "sextuplet",    label: "Sextuplet",    color: SUBDIVISION_COLORS.sextuplet    },
];

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

// ---------------------------------------------------------------------------
// Voice colours for score bars
// ---------------------------------------------------------------------------

const VOICE_COLORS = {
  soprano:  "#ff6b9d",
  alto:     "#f7b731",
  tenor:    "#4cc9f0",
  baritone: "#26de81",
};

const VOICE_ORDER = ["soprano", "alto", "tenor", "baritone"];

// ---------------------------------------------------------------------------
// Adaptive hit window
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tiered accuracy system
//
// Three tiers based on multiples of the base adaptive window:
//   Perfect  = base window        → +2 pts, large green burst
//   Excellent = 2× base window    → +1 pt,  medium blue burst
//   Good      = 3.5× base window  → +0.5 pts, small bronze burst
//   Miss      = outside Good      → -1 pt,  red screen flash
//
// Base window still scales with note density so tiers stay proportional
// across all rhythmic values.
// ---------------------------------------------------------------------------

const TIER_COLORS = {
  perfect:   "#00e676",  // vivid green
  excellent: "#2979ff",  // bright blue
  good:      "#ff9100",  // bronze/amber
};

const TIER_COUNTS = {
  perfect:   30,
  excellent: 18,
  good:      10,
};

const TIER_POINTS = {
  perfect:   2,
  excellent: 1,
  good:      0.5,
};

function computeAccuracyTier(beatTimes, index, nearestTime) {
  // Fixed accuracy windows — tight and consistent across all rhythmic values.
  // The Good window (80ms) is still narrower than most note gaps so mashing
  // remains ineffective even at lower levels.
  if (nearestTime <= 20) return "perfect";
  if (nearestTime <= 40) return "excellent";
  if (nearestTime <= 80) return "good";
  return null;  // miss
}

// ---------------------------------------------------------------------------
// Hold note constants
//
// Notes longer than a 16th note (125ms at 120 BPM) are treated as holds.
// Scoring: tier points on press + same tier points on release (hold only).
// A perfect hold = 4 pts max. Miss = -1 pt.
// ---------------------------------------------------------------------------

const HOLD_THRESHOLD_MS      = 125;   // 16th note at 120 BPM
const HOLD_RELEASE_TOLERANCE = 0.15;  // ±15% of scaled duration
const VISUAL_DURATION_SCALE  = 0.2;   // blocks and hold windows use 20% of musical duration
                                       // proportional relationships preserved, scale reduced 80%

// ---------------------------------------------------------------------------
// Diagonal stripe helper — draws clipped diagonal stripes over a rectangle
// Used to mark hold notes as visually distinct from tap notes
// ---------------------------------------------------------------------------

function drawStripes(ctx, x, y, w, h, color = "rgba(255,255,255,0.22)") {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([]);
  const spacing = 7;
  for (let d = -h; d < w + h; d += spacing) {
    ctx.beginPath();
    ctx.moveTo(x + d,     y);
    ctx.lineTo(x + d + h, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Particle helpers
// ---------------------------------------------------------------------------

function createParticles(x, y, color, count = 22) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 5;
    const life  = 0.7 + Math.random() * 0.3;
    out.push({
      x, y,
      vx:      Math.cos(angle) * speed,
      vy:      Math.sin(angle) * speed - 2.5,
      life,
      maxLife: life,
      decay:   0.018 + Math.random() * 0.012,
      size:    3 + Math.random() * 5,
      color,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------

export function MetronomeUI({
  tap,
  scores,
  serverNowMs,
  beatData,
  startTime,
  ws,
  bpm        = 120,
  isRunning,
  playerPart = null,
  celebration = null,
}) {
  const canvasRef = useRef(null);
  const [localScore, setLocalScore] = useState(0);
  const [tappedBeats, setTappedBeats] = useState(new Set());

  // Draw-loop refs
  const scoresRef      = useRef(scores);
  const localScoreRef  = useRef(0);
  const particlesRef   = useRef([]);
  const pendingHitRef   = useRef(null);  // { x, y, color, count } — particle burst
  const pendingFlashRef = useRef(null);  // { x, y, color } — bright flash on hold press
  const pendingMissRef  = useRef(false); // true briefly after a miss — drives red flash
  const hitLineYRef    = useRef(0);
  const allColorsRef   = useRef([]);
  const canvasWRef     = useRef(0);

  // Pre-computed beat data (accessible by press + release handlers)
  const beatTimesRef       = useRef([]);
  const allDurationsMsRef  = useRef([]);
  const allHandsHandlerRef = useRef([]);

  // Active hold state keyed by pointerId — robust against finger drift
  // across the screen midline during a hold.
  // Value: { side, noteIndex, noteEndMs, durationMs }
  const activeHoldsRef = useRef({});

  // Winner celebration — set once when Level 17 is detected
  const celebrationRef     = useRef(null);  // { winner, color, score, tieWith }
  const celebParticlesRef  = useRef([]);
  const lastLevelRef       = useRef("");

  // Track isRunning via ref so the draw loop reads it without needing to restart
  const isRunningRef = useRef(isRunning);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);

  // Track celebration prop via ref so draw loop always sees latest value.
  // If the draw loop has already stopped (game over, non-winning tab),
  // flip a state bit to restart it so the celebration overlay renders.
  const celebrationPropRef = useRef(celebration);
  const [celebrationKick, setCelebrationKick] = useState(0);
  useEffect(() => {
    console.log("MetronomeUI celebration prop changed:", celebration);
    celebrationPropRef.current = celebration;
    if (celebration && !isRunningRef.current) {
      // Draw loop may have exited — kick it to restart
      setCelebrationKick(k => k + 1);
    }
  }, [celebration]);

  // Keep serverNowMs stable via ref so it doesn't restart the draw loop
  const serverNowMsRef2 = useRef(serverNowMs);
  useEffect(() => { serverNowMsRef2.current = serverNowMs; }, [serverNowMs]);

  useEffect(() => { scoresRef.current     = scores;     }, [scores]);
  useEffect(() => { localScoreRef.current = localScore; }, [localScore]);

  // Pre-compute beat data whenever beatData or timing changes
  useEffect(() => {
    if (!beatData?.sections || startTime == null) return;
    const msPerBeat = 60000 / bpm;
    const allBeats  = beatData.sections.flatMap(s => s.beats);
    beatTimesRef.current       = allBeats.map(b => startTime + b * msPerBeat);
    allDurationsMsRef.current  = beatData.sections.flatMap(s => s.durations).map(d => d * msPerBeat);
    allHandsHandlerRef.current = beatData.sections.flatMap(s => s.hands);
  }, [beatData, startTime, bpm]);

  // -------------------------------------------------------------------------
  // Shared pointer helpers
  // -------------------------------------------------------------------------

  const getSide = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return "L";
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? rect.left;
    return x > rect.left + rect.width / 2 ? "R" : "L";
  };

  const queueBurst = (noteIndex, side, tier = "perfect") => {
    const w      = canvasWRef.current;
    const blockW = Math.min(200, w * 0.35);
    const hitX   = side === "L" ? w * 0.1 + blockW / 2 : w * 0.6 + blockW / 2;
    pendingHitRef.current = {
      x:     hitX,
      y:     hitLineYRef.current,
      color: TIER_COLORS[tier] ?? allColorsRef.current[noteIndex] ?? "#ffffff",
      count: TIER_COUNTS[tier] ?? 22,
    };
  };

  // Flash: a brief bright rect overlay drawn once at the hit line position.
  // Used on successful hold press to confirm the start without a full burst.
  const queueFlash = (noteIndex, side) => {
    const w      = canvasWRef.current;
    const blockW = Math.min(200, w * 0.35);
    const flashX = side === "L" ? w * 0.1 : w * 0.6;
    pendingFlashRef.current = {
      x:     flashX,
      y:     hitLineYRef.current,
      w:     blockW,
      color: allColorsRef.current[noteIndex] || "#ffffff",
      born:  performance.now(),
    };
  };

  // -------------------------------------------------------------------------
  // Pointer down — tap or hold press
  // -------------------------------------------------------------------------

  const handlePointerDown = (e) => {
    e.preventDefault();
    const now         = serverNowMsRef2.current();
    const beatTimes   = beatTimesRef.current;
    const allHands    = allHandsHandlerRef.current;
    const allDurMs    = allDurationsMsRef.current;
    if (!beatTimes.length) return;

    let nearestIndex = -1;
    let nearestTime  = Infinity;
    beatTimes.forEach((bt, i) => {
      const delta = Math.abs(bt - now);
      if (delta < nearestTime) { nearestTime = delta; nearestIndex = i; }
    });

    const tier    = computeAccuracyTier(beatTimes, nearestIndex, nearestTime);
    const isHit   = tier !== null;
    const side    = getSide(e);
    const beatHand  = allHands[nearestIndex] ?? "";
    const sideHit   = beatHand.includes(side);
    const durationMs = allDurMs[nearestIndex] ?? 0;
    const isHold     = durationMs > HOLD_THRESHOLD_MS;
    const points     = isHit && sideHit ? TIER_POINTS[tier] : 0;

    tap({ timestamp: now, hit: isHit && sideHit, index: nearestIndex, side, points });

    if (isHit && sideHit) {
      const dedupKey = `$${nearestIndex}-$${side}`;
      if (tappedBeats.has(dedupKey)) return;
      setTappedBeats(prev => { const c = new Set(prev); c.add(dedupKey); return c; });

      // Tier-coloured particle burst on all hits
      queueBurst(nearestIndex, side, tier);

      if (isHold) {
        canvasRef.current?.setPointerCapture(e.pointerId);
        queueFlash(nearestIndex, side);
        const scaledDurationMs = durationMs * VISUAL_DURATION_SCALE;
        const noteEndMs        = beatTimes[nearestIndex] + scaledDurationMs;
        // Store tier so release can award matching points
        activeHoldsRef.current[e.pointerId] = { side, noteIndex: nearestIndex, noteEndMs, durationMs: scaledDurationMs, tier };
        if (navigator.vibrate) navigator.vibrate([30, 20, 30, 20, 30, 20, 30, 20, 30]);
      } else {
        if (navigator.vibrate) navigator.vibrate(18);
      }
      setLocalScore(prev => prev + points);
    } else {
      // Miss — penalty + red screen flash
      pendingMissRef.current = true;
      setLocalScore(prev => Math.max(0, prev - 1));
    }
  };

  // -------------------------------------------------------------------------
  // Pointer up — check hold release
  // -------------------------------------------------------------------------

  const handlePointerUp = (e) => {
    e.preventDefault();
    const now  = serverNowMsRef2.current();
    const hold = activeHoldsRef.current[e.pointerId];
    if (!hold) return;

    if (navigator.vibrate) navigator.vibrate(0);
    delete activeHoldsRef.current[e.pointerId];

    const { side, noteIndex, noteEndMs, durationMs, tier = "perfect" } = hold;
    const tolerance    = durationMs * HOLD_RELEASE_TOLERANCE;
    const releaseError = Math.abs(now - noteEndMs);

    if (releaseError <= tolerance) {
      const releasePoints = TIER_POINTS[tier] ?? 1;
      tap({ timestamp: now, hit: true, index: noteIndex, side, points: releasePoints });
      queueBurst(noteIndex, side, tier);
      if (navigator.vibrate) navigator.vibrate(25);
      setLocalScore(prev => prev + releasePoints);
    }
    // Early / late release: no penalty, no reward
  };

  const handlePointerCancel = (e) => {
    if (activeHoldsRef.current[e.pointerId]) {
      if (navigator.vibrate) navigator.vibrate(0);
      delete activeHoldsRef.current[e.pointerId];
    }
  };

  // -------------------------------------------------------------------------
  // Canvas draw loop
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!beatData?.sections || beatData.sections.length === 0 ||
        startTime == null) return;

    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const travelTimeMs = 2000;
    const lookAheadMs  = 4000;
    const SCORE_H      = 96;  // 80px voice bars + 16px status strip
    const LEGEND_H     = 28;
    let animationFrame;

    const resizeCanvas = () => {
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      canvas.width  = window.innerWidth;
      canvas.height = vh - LEGEND_H;
      hitLineYRef.current = canvas.height * 0.85;
      canvasWRef.current  = canvas.width;
    };
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    const msPerBeat    = 60000 / bpm;
    const allBeats     = beatData.sections.flatMap(s => s.beats);
    const allDurations = beatData.sections.flatMap(s => s.durations);
    const allHands     = beatData.sections.flatMap(s => s.hands);
    const allColors    = allBeats.map(getSubdivisionColor);
    const allDurMs     = allDurations.map(d => d * msPerBeat);
    allColorsRef.current = allColors;

    const fmtScore = (s) => Number.isInteger(s) ? String(s) : s.toFixed(1);

    // ── Score bars + level indicator ────────────────────────────────────────
    const drawScoreBars = (w, now) => {
      const scores   = scoresRef.current;
      const maxScore = Math.max(1, ...Object.values(scores));
      const barH = 13, rowH = SCORE_H / VOICE_ORDER.length;
      const labelW = 72, numW = 36;
      const barX = labelW + 8, barW = w - barX - numW - 8;

      let currentLevelName = "";
      const currentBeat = (now - startTime) / msPerBeat;
      for (const sec of beatData.sections) {
        const [first, last] = sec.markers;
        if (currentBeat >= first && currentBeat <= last) { currentLevelName = sec.name; break; }
      }
      // If between sections, hold the last active section name
      if (!currentLevelName) {
        for (let i = beatData.sections.length - 1; i >= 0; i--) {
          if (currentBeat > beatData.sections[i].markers[1]) {
            currentLevelName = beatData.sections[i].name;
            break;
          }
        }
      }

      const VOICE_BAR_H = 80;  // voice bars occupy top 80px
      const STATUS_H    = 16;  // status strip below that

      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, w, VOICE_BAR_H);

      // Status strip background
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.fillRect(0, VOICE_BAR_H, w, STATUS_H);

      VOICE_ORDER.forEach((voice, i) => {
        const score   = scores[voice] ?? 0;
        const fill    = score / maxScore;
        const color   = VOICE_COLORS[voice] || "#ffffff";
        const isLocal = playerPart === voice;
        const rowH    = VOICE_BAR_H / VOICE_ORDER.length;
        const cy      = rowH * i + rowH / 2;
        const barY    = cy - barH / 2;

        if (isLocal) { ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.fillRect(0, rowH * i, w, rowH); }

        ctx.font = isLocal ? "bold 11px system-ui" : "11px system-ui";
        ctx.fillStyle = isLocal ? "#ffffff" : "rgba(255,255,255,0.55)";
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(voice, 8, cy);

        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 3); ctx.fill();

        if (fill > 0) {
          if (isLocal) { ctx.shadowColor = color; ctx.shadowBlur = 10; }
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.roundRect(barX, barY, barW * fill, barH, 3); ctx.fill();
          ctx.shadowBlur = 0;
        }

        ctx.font = isLocal ? "bold 11px system-ui" : "11px system-ui";
        ctx.fillStyle = isLocal ? color : "rgba(255,255,255,0.45)";
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        ctx.fillText(fmtScore(score), w - 6, cy);
      });

      // ── Status strip: current level (left) + personal score (right) ─────────
      const stripY = VOICE_BAR_H + STATUS_H / 2;
      const localColor = playerPart ? (VOICE_COLORS[playerPart] || "#ffffff") : "#ffffff";
      const personalScore = localScoreRef.current;

      // Separator line
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(0, VOICE_BAR_H); ctx.lineTo(w, VOICE_BAR_H); ctx.stroke();

      // Level name
      ctx.font         = "bold 11px system-ui";
      ctx.fillStyle    = currentLevelName ? localColor : "rgba(255,255,255,0.3)";
      ctx.textAlign    = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(currentLevelName || "—", 10, stripY);

      // Personal score
      ctx.font         = "bold 11px system-ui";
      ctx.fillStyle    = personalScore > 0 ? "#ffffff" : "rgba(255,255,255,0.3)";
      ctx.textAlign    = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(personalScore > 0 ? `${fmtScore(personalScore)} pts` : "0 pts", w - 10, stripY);

      return currentLevelName;  // expose for Level 17 winner detection
    };

    // ── Particles + press flash + miss flash ─────────────────────────────────
    const updateParticles = (wallClock) => {
      // Miss flash — brief red tint over the whole canvas
      if (pendingMissRef.current) {
        pendingMissRef.current = false;
        // Store born time for fade
        if (!canvas._missFlashBorn) canvas._missFlashBorn = wallClock;
      }
      if (canvas._missFlashBorn !== undefined) {
        const elapsed  = wallClock - canvas._missFlashBorn;
        const FADE_MS  = 200;
        if (elapsed < FADE_MS) {
          const t = 1 - elapsed / FADE_MS;
          ctx.save();
          ctx.globalAlpha = t * 0.35;
          ctx.fillStyle   = "#ff1744";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        } else {
          delete canvas._missFlashBorn;
        }
      }

      // Hold-press flash
      if (pendingFlashRef.current) {
        const f       = pendingFlashRef.current;
        const elapsed = wallClock - f.born;
        const FADE_MS = 150;
        if (elapsed < FADE_MS) {
          const t = 1 - elapsed / FADE_MS;
          ctx.save();
          ctx.globalAlpha = t * 0.75;
          ctx.fillStyle   = f.color;
          ctx.shadowColor = f.color;
          ctx.shadowBlur  = 24 * t;
          ctx.fillRect(f.x, f.y - 30, f.w, 60);
          ctx.restore();
        } else {
          pendingFlashRef.current = null;
        }
      }

      // Particle burst — uses tier count from pendingHitRef
      if (pendingHitRef.current) {
        const { x, y, color, count } = pendingHitRef.current;
        pendingHitRef.current = null;
        particlesRef.current.push(...createParticles(x, y, color, count));
      }
      const alive = [];
      for (const p of particlesRef.current) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life -= p.decay;
        if (p.life <= 0) continue;
        const t = p.life / p.maxLife;
        ctx.globalAlpha = t * t;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2); ctx.fill();
        alive.push(p);
      }
      particlesRef.current = alive;
      ctx.globalAlpha = 1;
    };

    // ── Main draw loop ────────────────────────────────────────────────────────
    const draw = () => {
      const now       = serverNowMsRef2.current();
      const wallClock = performance.now();

      const stopped  = !isRunningRef.current;
      const lastSection    = beatData.sections[beatData.sections.length - 1];
      const lastBeatNumber = lastSection.markers[1];
      const lastBeatTime   = startTime + lastBeatNumber * msPerBeat;
      const gameOver       = stopped || now > lastBeatTime + 1000;

      // Diagnostic: log once when gameOver first becomes true
      if (gameOver && !MetronomeUI._gameOverLogged) {
        MetronomeUI._gameOverLogged = true;
        console.log(`[MetronomeUI] gameOver: stopped=$${stopped}, celebrationProp=$${!!celebrationPropRef.current}, celebrationRef=${!!celebrationRef.current}`);
      }
      if (!gameOver) MetronomeUI._gameOverLogged = false;

      // Before game starts: draw nothing, just wait
      if (!isRunningRef.current && !celebrationPropRef.current) {
        animationFrame = requestAnimationFrame(draw);
        return;
      }

      const w        = canvas.width;
      const h        = canvas.height;
      const hitLineY = hitLineYRef.current;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#111111";
      ctx.fillRect(0, 0, w, h);

      // Seed celebration particles once when celebration first arrives
      if (celebrationPropRef.current && celebParticlesRef.current.length === 0) {
        const color = VOICE_COLORS[celebrationPropRef.current.winner.split(" & ")[0]] || "#ffffff";
        for (let i = 0; i < 80; i++) {
          const px = Math.random() * w;
          const py = SCORE_H + Math.random() * (h - SCORE_H) * 0.6;
          celebParticlesRef.current.push(...createParticles(px, py, color, 1));
        }
      }

      // After game ends, keep loop alive for celebration overlay
            if (gameOver) {
              updateParticles(wallClock);
              if (celebrationPropRef.current) {
                const cel   = celebrationPropRef.current;
                const color = VOICE_COLORS[cel.winner.split(" & ")[0]] || "#ffffff";
                const pulse = (Math.sin(wallClock * 0.005) + 1) / 2;
                ctx.fillStyle = "rgba(0,0,0,0.70)";
                ctx.fillRect(0, SCORE_H, w, h - SCORE_H);
                drawScoreBars(w, serverNowMsRef2.current());
                const midY = SCORE_H + (h - SCORE_H) / 2;
                ctx.save();
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.font = `${72 + pulse * 12}px system-ui`;
                ctx.fillText("🏆", w / 2, midY - h * 0.18);
                ctx.font = `bold ${Math.min(52, w * 0.1) + pulse * 4}px system-ui`;
                ctx.fillStyle = color; ctx.shadowColor = color;
                ctx.shadowBlur = 24 + pulse * 20;
                ctx.fillText(cel.winner.toUpperCase(), w / 2, midY - h * 0.03);
                ctx.shadowBlur = 0;
                ctx.font = `bold ${Math.min(36, w * 0.07)}px system-ui`;
                ctx.fillStyle = "#ffffff";
                ctx.fillText(cel.isTie ? "IT'S A TIE!" : "WINS!", w / 2, midY + h * 0.09);
                ctx.font = `${Math.min(22, w * 0.045)}px system-ui`;
                ctx.fillStyle = "rgba(255,255,255,0.65)";
                ctx.fillText(`Score: ${fmtScore(cel.score)}`, w / 2, midY + h * 0.18);
                ctx.restore();
              }
              animationFrame = requestAnimationFrame(draw);
              return;
            }

            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = "#111111";
            ctx.fillRect(0, 0, w, h);

            const currentLevelName = drawScoreBars(w, now);

            // ── Level 17 winner detection ───────────────────────────────────────────
            if (currentLevelName === "Level 17" &&
                lastLevelRef.current !== "Level 17" &&
                !celebrationRef.current) {
              const s      = scoresRef.current;
              const sorted = Object.entries(s).sort(([, a], [, b]) => b - a);
              if (sorted.length > 0) {
                const topScore = sorted[0][1];
                const winners  = sorted.filter(([, sc]) => sc === topScore);
                celebrationRef.current = {
                  winner:   winners.map(([v]) => v).join(" & "),
                  color:    VOICE_COLORS[winners[0][0]] || "#ffffff",
                  score:    topScore,
                  isTie:    winners.length > 1,
                };
                // Spawn a burst of celebration particles spread across the screen
                for (let i = 0; i < 80; i++) {
                  const px = Math.random() * w;
                  const py = SCORE_H + Math.random() * (h - SCORE_H) * 0.6;
                  celebParticlesRef.current.push(
                    ...createParticles(px, py, celebrationRef.current.color, 1)
                  );
                }
              }
            }
            lastLevelRef.current = currentLevelName;

            // ── Pulsing hit line ────────────────────────────────────────────────────
            // Flares on each beat, sharp exponential decay within ~⅓ beat.
            // Colour shifts slightly warm on the pulse.
            const beatPhase = ((now - startTime) % msPerBeat) / msPerBeat;
            const pulse     = Math.pow(Math.max(0, 1 - beatPhase * 3), 2);
            const lineH     = 3 + pulse * 5;
            const lineY     = hitLineY - (lineH - 3) / 2;
            ctx.save();
            ctx.shadowColor = `rgba(255, 80, 80, ${pulse * 0.9})`;
            ctx.shadowBlur  = pulse * 22;
            ctx.fillStyle   = `rgba(230, ${Math.round(57 + pulse * 40)}, 70, ${0.75 + pulse * 0.25})`;
            ctx.fillRect(w * 0.1, lineY, w * 0.8, lineH);
            ctx.restore();

            // ── Beat grid ───────────────────────────────────────────────────────────
            const firstB = Math.floor((now - travelTimeMs * 0.15 - startTime) / msPerBeat);
            const lastB  = Math.ceil ((now + travelTimeMs + lookAheadMs - startTime) / msPerBeat);
            ctx.save();
            ctx.strokeStyle = "rgba(255,255,255,0.18)";
            ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
            for (let b = firstB; b <= lastB; b++) {
              const gridY = hitLineY - ((startTime + b * msPerBeat - now) / travelTimeMs) * hitLineY;
              if (gridY < SCORE_H || gridY > h) continue;
              ctx.beginPath(); ctx.moveTo(w * 0.05, gridY); ctx.lineTo(w * 0.95, gridY); ctx.stroke();
            }
            ctx.restore();

            // ── Falling blocks ───────────────────────────────────────────────────────
            const blockWidth = Math.min(200, w * 0.35);

            // Collect currently held note indices from all active pointers
            const heldIndices = new Set(
              Object.values(activeHoldsRef.current).map(h => h.noteIndex)
            );
            // Glow pulse: 2Hz oscillation
            const glowPhase = (Math.sin(wallClock * 0.012) + 1) / 2;

            for (let i = 0; i < allBeats.length; i++) {
              const beatTime          = startTime + allBeats[i] * msPerBeat;
              const duration          = allDurations[i];
              const durationMs        = allDurMs[i];
              const scaledDurationMs  = durationMs * VISUAL_DURATION_SCALE;
              const hand              = allHands[i];
              if (!hand || durationMs == null) continue;  // guard against ragged arrays
              // Block height uses scaled duration — proportional relationships preserved,
              // physical size reduced 80% so blocks don't stack in dense passages.
              const blockH     = Math.max(8, (scaledDurationMs / travelTimeMs) * hitLineY);
              const isHold     = durationMs > HOLD_THRESHOLD_MS;
              // noteEndMs also uses scaled duration so visual fade and hold window stay in sync
              const noteEndMs  = beatTime + scaledDurationMs;
              const timeUntilHit = beatTime - now;
              const timeUntilEnd = noteEndMs - now;

              // Visibility: hold notes stay visible through scaled duration, then fade 300ms
              const isVisible = isHold
                ? (timeUntilEnd > -300 && timeUntilHit < travelTimeMs + lookAheadMs)
                : (timeUntilHit > -300 && timeUntilHit < travelTimeMs + lookAheadMs);
              if (!isVisible) continue;

              // Alpha: hold blocks stay opaque until their scaled end time, then fade
              let alpha;
              if (timeUntilHit >= 0) {
                alpha = 1;
              } else if (isHold) {
                alpha = timeUntilEnd >= 0 ? 1 : Math.max(0, 1 + timeUntilEnd / 300);
              } else {
                alpha = Math.max(0, 1 + timeUntilHit / 300);
              }

              // Y position: normal falling for all blocks (no pinning)
              const drawY = hitLineY - (timeUntilHit / travelTimeMs) * hitLineY - blockH;

              if (drawY + blockH < SCORE_H) continue;

              ctx.globalAlpha = alpha;

              const isBeingHeld = heldIndices.has(i);

              // Base fill
              ctx.fillStyle = allColors[i];
              if (hand.includes("L")) ctx.fillRect(w * 0.1,           drawY, blockWidth, blockH);
              if (hand.includes("R")) ctx.fillRect(w * 0.1 + w * 0.5, drawY, blockWidth, blockH);

              // Hold note visual distinction: diagonal stripes + white border
              if (isHold) {
                if (hand.includes("L")) {
                  drawStripes(ctx, w * 0.1,           drawY, blockWidth, blockH);
                  ctx.strokeStyle = "rgba(255,255,255,0.55)";
                  ctx.lineWidth = 1.5; ctx.setLineDash([]);
                  ctx.strokeRect(w * 0.1,           drawY, blockWidth, blockH);
                }
                if (hand.includes("R")) {
                  drawStripes(ctx, w * 0.1 + w * 0.5, drawY, blockWidth, blockH);
                  ctx.strokeStyle = "rgba(255,255,255,0.55)";
                  ctx.lineWidth = 1.5; ctx.setLineDash([]);
                  ctx.strokeRect(w * 0.1 + w * 0.5,  drawY, blockWidth, blockH);
                }
              }

              // Pulsing glow overlay while actively held
              if (isBeingHeld) {
                ctx.save();
                const glowAlpha = 0.28 + glowPhase * 0.42;
                ctx.shadowColor = "#ffffff";
                ctx.shadowBlur  = 20 + glowPhase * 28;
                ctx.fillStyle   = `rgba(255,255,255,${glowAlpha})`;
                if (hand.includes("L")) ctx.fillRect(w * 0.1,           drawY, blockWidth, blockH);
                if (hand.includes("R")) ctx.fillRect(w * 0.1 + w * 0.5, drawY, blockWidth, blockH);
                ctx.restore();
              }
            }

            ctx.globalAlpha = 1;
            ctx.setLineDash([]);

            // Particles + flash on top
            updateParticles(wallClock);

            // ── Winner celebration overlay ──────────────────────────────────────────
            if (celebrationRef.current) {
              const cel     = celebrationRef.current;
              const pulse   = (Math.sin(wallClock * 0.005) + 1) / 2;

              // Dim background overlay
              ctx.fillStyle = "rgba(0,0,0,0.70)";
              ctx.fillRect(0, SCORE_H, w, h - SCORE_H);

              // Celebration particles
              const aliveC = [];
              for (const p of celebParticlesRef.current) {
                p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= p.decay * 0.4;
                if (p.life <= 0) continue;
                const t = p.life / p.maxLife;
                ctx.globalAlpha = t * t;
                ctx.fillStyle   = p.color;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2); ctx.fill();
                aliveC.push(p);
              }
              celebParticlesRef.current = aliveC;
              ctx.globalAlpha = 1;

              ctx.save();
              ctx.textAlign    = "center";
              ctx.textBaseline = "middle";
              const midY = SCORE_H + (h - SCORE_H) / 2;

              // Trophy
              ctx.font = `${72 + pulse * 12}px system-ui`;
              ctx.fillText("🏆", w / 2, midY - h * 0.18);

              // Winner name
              ctx.font        = `bold ${Math.min(52, w * 0.1) + pulse * 4}px system-ui`;
              ctx.fillStyle   = cel.color;
              ctx.shadowColor = cel.color;
              ctx.shadowBlur  = 24 + pulse * 20;
              ctx.fillText(cel.winner.toUpperCase(), w / 2, midY - h * 0.03);
              ctx.shadowBlur  = 0;

              // "WINS!"
              ctx.font      = `bold ${Math.min(36, w * 0.07)}px system-ui`;
              ctx.fillStyle = "#ffffff";
              ctx.fillText(cel.isTie ? "IT'S A TIE!" : "WINS!", w / 2, midY + h * 0.09);

              // Score
              ctx.font      = `${Math.min(22, w * 0.045)}px system-ui`;
              ctx.fillStyle = "rgba(255,255,255,0.65)";
              ctx.fillText(`Score: ${fmtScore(cel.score)}`, w / 2, midY + h * 0.18);

              ctx.restore();
            }

            animationFrame = requestAnimationFrame(draw);
          };

          draw();
          return () => {
            console.log("MetronomeUI draw loop CLEANUP — isRunning:", isRunningRef.current, "celebration:", !!celebrationPropRef.current);
            cancelAnimationFrame(animationFrame);
            window.removeEventListener("resize", resizeCanvas);
          };
        }, [bpm, beatData, startTime, playerPart, celebrationKick]);

        return (
          <div className="metronome-ui">
            <canvas
              ref={canvasRef}
              className="metronome-canvas"
              style={{ touchAction: "none" }}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            />

            {/* Subdivision colour legend */}
            <div style={{
              position: "fixed", bottom: 0, left: 0, right: 0,
              height: 28, display: "flex", justifyContent: "center",
              alignItems: "center", gap: "0 10px", padding: "0 8px",
              backgroundColor: "rgba(0,0,0,0.75)", zIndex: 10, overflowX: "auto",
            }}>
              {LEGEND.map(({ key, label, color }) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: 2,
                    backgroundColor: color,
                    border: color === "#111111" ? "1px solid #555" : "none",
                  }} />
                  <span style={{ color: "#bbb", fontSize: "9px", whiteSpace: "nowrap" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }