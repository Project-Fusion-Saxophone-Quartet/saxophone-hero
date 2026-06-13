import React, { useEffect, useRef } from "react";
import "./ProgressionUI.css";

export function ProgressionUI({
  scores,
  serverNowMs,
  beatData,
  startTime,
  bpm = 120,
  isRunning,
  part,
  ws,
}) {
  const canvasRef = useRef(null);
  const lastSectionRef = useRef(-1);
  const finishedRef = useRef(false);

  const serverNowMsRef = useRef(serverNowMs);
  useEffect(() => { serverNowMsRef.current = serverNowMs; }, [serverNowMs]);

  const displayScores = { ...scores };

  useEffect(() => {
    if (!beatData || !beatData.sections || !startTime || !isRunning) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const controlHeights = 120;
    let animationFrame;
    let sectionInterval;

    const resizeCanvas = () => {
      const vh = window.visualViewport
        ? window.visualViewport.height
        : window.innerHeight;
      canvas.width = window.innerWidth;
      canvas.height = vh - controlHeights;
    };
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    const msPerBeat = 60000 / bpm;
    const sections = beatData.sections;
    const allBeats = sections.flatMap((s) => s.beats);
    const lastBeatTime = startTime + allBeats[allBeats.length - 1] * msPerBeat;

    // ── Section detection & OSC send ────────────────────────────────────────
    const detectSection = () => {
      const now = serverNowMsRef.current();
      const currentBeat = (now - startTime) / msPerBeat;

      let idx = -1;
      for (let i = 0; i < sections.length; i++) {
        const [first, last] = sections[i].markers;
        if (currentBeat >= first && currentBeat <= last) { idx = i; break; }
      }
      if (idx === -1) {
        for (let i = sections.length - 1; i >= 0; i--) {
          if (currentBeat > sections[i].markers[1]) { idx = i; break; }
        }
      }

      if (idx !== -1 && idx !== lastSectionRef.current) {
        lastSectionRef.current = idx;
        if (ws?.readyState === WebSocket.OPEN) {
          const level = parseInt(sections[idx].name.split(" ")[1], 10);
          if (!isNaN(level)) {
            ws.send(JSON.stringify({ type: "section", part, section: level }));
          }
        }
      }
    };

    // Run at 250ms normally. When tab goes to background, browsers throttle
    // setInterval to ~1000ms. We compensate by calling detectSection()
    // immediately on visibilitychange so no level change is ever missed —
    // the instant the tab regains visibility (or loses it), we sync.
    sectionInterval = setInterval(detectSection, 250);

    const handleVisibilityChange = () => {
      detectSection(); // catch any missed level while tab was hidden/shown
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // ── Canvas draw loop (rAF — visual only) ────────────────────────────────
    const draw = () => {
      const now = serverNowMsRef.current();

      if (now > lastBeatTime + 1000) {
        if (!finishedRef.current) finishedRef.current = true;
        animationFrame = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const currentBeat = (now - startTime) / msPerBeat;
      const idx = lastSectionRef.current;

      if (idx >= 0) {
        const current = sections[idx];
        const next = sections[idx + 1];
        const [first, last] = current.markers;
        const inGapPeriod = currentBeat < first || currentBeat > last;

        ctx.font = "48px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        if (inGapPeriod) {
          ctx.fillStyle = "rgba(255,255,255,0.88)";
          ctx.fillText(current.name, canvas.width / 2, 20);
        } else if (next && current.name !== next.name) {
          ctx.fillStyle = "#f72585";
          ctx.fillText("NEXT: " + next.name, canvas.width / 2, 20);
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.88)";
          ctx.fillText(current.name, canvas.width / 2, 20);
        }
      }

      animationFrame = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      clearInterval(sectionInterval);
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resizeCanvas);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [bpm, beatData, startTime, isRunning, part]);

  return (
    <div className="progression-ui">
      <canvas ref={canvasRef} />
      <div
        className="scores"
        style={{
          position: "fixed",
          top: "600px",
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
        }}
      >
        {Object.entries(displayScores).map(([client, score]) => (
          <div key={client}>
            {client}: {score}
          </div>
        ))}
      </div>
    </div>
  );
}
