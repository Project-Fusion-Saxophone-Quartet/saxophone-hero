// useMetronome.js
import { useEffect, useRef, useState } from "react";
import { useServerClock } from "./useServerClock";
import { useWebSocketChannel } from "./useWebSocketChannel";
import { useAudioClick } from "./useAudioClick";

export function useMetronome({ httpUrl, wsUrl, bpm = 120, isHost = false, clientType = "game" }) {
  const { serverNowMs, offsetMs } = useServerClock(httpUrl);
  const { ws, sendJson, onMessage } = useWebSocketChannel(wsUrl);
  const { initAudioContext, makeClick, suspendAudio } = useAudioClick(isHost);

  const [running, setRunning] = useState(false);
  const [lastTap, setLastTap] = useState(null);
  const [history, setHistory] = useState([]);
  const [clients, setClients] = useState([]);
  const [scores, setScores] = useState({}); 
  const [celebration, setCelebration] = useState(null);

  const makeClickRef    = useRef(makeClick);
  const suspendAudioRef = useRef(suspendAudio);
  const serverNowMsRef  = useRef(serverNowMs);
  const isHostRef       = useRef(isHost);
  const identifiedRef   = useRef(false); // ✅ Track if we've sent identify
  
  useEffect(() => { makeClickRef.current    = makeClick;    }, [makeClick]);
  useEffect(() => { suspendAudioRef.current = suspendAudio; }, [suspendAudio]);
  useEffect(() => { serverNowMsRef.current  = serverNowMs;  }, [serverNowMs]);
  useEffect(() => { isHostRef.current       = isHost;       }, [isHost]);

  // ✅ Send client type identification when WebSocket opens
  useEffect(() => {
    if (!ws) return;
    
    const handleOpen = () => {
      if (identifiedRef.current) return; // Already sent
      identifiedRef.current = true;
      
      sendJson({ type: "identify", clientType, isHost });
      console.log(`[WS] Identified as: ${isHost ? 'host' : clientType}`);
    };
    
    // If already open, send immediately
    if (ws.readyState === WebSocket.OPEN) {
      handleOpen();
    } else {
      // Otherwise wait for open event
      ws.addEventListener('open', handleOpen);
      return () => ws.removeEventListener('open', handleOpen);
    }
  }, [ws, sendJson, clientType, isHost]);

  useEffect(() => {
    if (!onMessage) return;

    const handler = (msg) => {
      switch (msg.type) {
        case "start":
          setRunning(true);
          break;

        case "tickSchedule":
          msg.tickTimes.forEach((tickTimeMs, i) => {
            const deltaSec   = (tickTimeMs - serverNowMsRef.current()) / 1000;
            const isDownbeat = Array.isArray(msg.tickDownbeats)
              ? !!msg.tickDownbeats[i]
              : !!msg.isSectionTransitioned;
            const isPrepBeat = Array.isArray(msg.tickPrepBeats)
              ? !!msg.tickPrepBeats[i]
              : false;

            if (deltaSec > 0.05) {
              const prepBeatNumber = isPrepBeat 
                ? msg.tickPrepBeats.slice(0, i + 1).filter(Boolean).length
                : null;
              
              makeClickRef.current(deltaSec, isDownbeat, prepBeatNumber);
            }
          });
          break;

        case "tapBroadcast":
          setScores((s) => ({ ...s, [msg.part]: msg.score }));
          break;

        case "scoreUpdate":
          setScores(msg.scores);
          break;

        case "presence":
          setClients(msg.clients);
          break;

        case "celebrate":
          console.log("celebrate received:", msg.winner);
          setCelebration({
            winner: msg.winner,
            isTie:  msg.isTie,
            score:  msg.score,
            scores: msg.scores,
          });
          break;

        case "stop":
          console.log("stop received, celebration will remain:", msg.type);
          setRunning(false);
          suspendAudioRef.current();
          break;

        default:
          break;
      }
    };

    const off = onMessage(handler);
    return () => off();
  }, [onMessage]);

  const startMetronome = () => {
    setRunning(true);
    sendJson({ type: "start" });
  };

  const stopMetronome = () => {
    setRunning(false);
    sendJson({ type: "stop" });
    suspendAudio();
  };

  const tap = (payload) => {
    let sNow;
    let hit = undefined;
    let index = undefined;

    if (payload && payload.timestamp) {
      sNow = payload.timestamp;
      hit = payload.hit;
      index = payload.index;
    } else {
      sNow = serverNowMs();
    }

    const intervalMs = 60000 / bpm;
    const nearest = Math.round(sNow / intervalMs) * intervalMs;
    const diff = sNow - nearest;
    const record = { t: sNow, diff: Math.round(diff) };

    setLastTap(record);
    setHistory((h) => [record, ...h].slice(0, 20));

    const payloadToSend = {
      type: "tap",
      timestamp: sNow,
      diff: Math.round(diff),
    };
    if (typeof hit !== "undefined") payloadToSend.hit = !!hit;
    if (typeof index !== "undefined") payloadToSend.index = index;

    sendJson(payloadToSend);
  };

  return {
    startMetronome,
    stopMetronome,
    tap,
    lastTap,
    history,
    scores,
    clients,
    running,
    celebration,
    offsetMs,
    serverNowMs,
    initAudioContext,
    ws,
  };
}