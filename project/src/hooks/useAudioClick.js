import { useRef } from "react";

// ✅ Configuration constants
const COUNT_OFFSET_MS = -80;      // Voice timing offset (negative = earlier)
const COUNT_PLAYBACK_RATE = 2;  // Speed multiplier
const COUNT_DETUNE = -700;        // Pitch correction in cents (-100 cents = -1 semitone)

export function useAudioClick(isHost) {
  const audioCtxRef = useRef(null);
  const countBuffersRef = useRef(null);

  const initAudioContext = async () => {
    if (!isHost) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    
    // Load count audio files
    if (!countBuffersRef.current) {
      try {
        const buffers = await Promise.all([
          fetch('/count-1.wav').then(r => r.arrayBuffer()).then(b => audioCtxRef.current.decodeAudioData(b)),
          fetch('/count-2.wav').then(r => r.arrayBuffer()).then(b => audioCtxRef.current.decodeAudioData(b)),
          fetch('/count-3.wav').then(r => r.arrayBuffer()).then(b => audioCtxRef.current.decodeAudioData(b)),
          fetch('/count-4.wav').then(r => r.arrayBuffer()).then(b => audioCtxRef.current.decodeAudioData(b)),
        ]);
        countBuffersRef.current = buffers;
        console.log('[Audio] Count files loaded');
      } catch (err) {
        console.warn('[Audio] Failed to load count files:', err);
      }
    }
  };

  const suspendAudio = () => {
    if (audioCtxRef.current?.state === "running") {
      audioCtxRef.current.suspend();
    }
  };

  // ✅ Play count audio with speed, pitch correction, and timing offset
  const playCount = (countNumber, secondsFromNow) => {
    if (!isHost || !audioCtxRef.current || !countBuffersRef.current) return;
    if (countNumber < 1 || countNumber > 4) return;
    
    const ctx = audioCtxRef.current;
    const buffer = countBuffersRef.current[countNumber - 1];
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = COUNT_PLAYBACK_RATE; // Speed up
    source.detune.value = COUNT_DETUNE;              // Pitch correction
    source.connect(ctx.destination);
    
    // Apply timing offset
    const adjustedTime = ctx.currentTime + secondsFromNow + (COUNT_OFFSET_MS / 1000);
    source.start(adjustedTime);
  };

  const makeClick = (secondsFromNow, isDownbeat = false, prepBeatNumber = null) => {
    if (!isHost || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isDownbeat ? "square" : "sine";
    osc.frequency.value = isDownbeat ? 1320 : 880;

    const t = ctx.currentTime + secondsFromNow;
    gain.gain.setValueAtTime(isDownbeat ? 0.7 : 0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.03);
    
    // Play count audio if this is a prep beat
    if (prepBeatNumber) {
      playCount(prepBeatNumber, secondsFromNow);
    }
  };

  return { initAudioContext, makeClick, suspendAudio };
}