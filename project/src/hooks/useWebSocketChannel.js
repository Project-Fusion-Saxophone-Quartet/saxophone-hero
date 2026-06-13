import { useCallback, useEffect, useRef } from "react";
import { getWebSocket, addWsListener } from "../lib/wsClient";

export function useWebSocketChannel(url) {
  const wsRef       = useRef(null);
  // Use a ref for the handlers set so it is never recreated across renders.
  // This prevents the subscribe/unsubscribe cycle from dropping messages
  // that arrive during a React re-render triggered by a prior message.
  const handlersRef = useRef(new Set());

  // Stable relay — registered once with wsClient, never re-registered.
  // Reads handlersRef.current so it always sees the latest set of handlers
  // without needing to be recreated.
  const relayRef = useRef((msg) => {
    handlersRef.current.forEach((fn) => fn(msg));
  });

  useEffect(() => {
    const ws = getWebSocket(url);
    wsRef.current = ws;
    // Register the relay once. The relay itself is stable (relayRef.current
    // never changes), so cleanup/re-registration on url change is safe.
    const unsub = addWsListener(relayRef.current);
    return () => unsub();
  }, [url]);

  const sendJson = useCallback((obj) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }, []);

  // onMessage registers a handler and returns an unsubscribe function.
  // useCallback gives it a stable reference so callers' useEffects don't
  // re-run on every render.
  const onMessage = useCallback((fn) => {
    handlersRef.current.add(fn);
    return () => handlersRef.current.delete(fn);
  }, []);

  // Return ws as a ref accessor so callers always get the live socket.
  return { ws: wsRef.current, sendJson, onMessage };
}
