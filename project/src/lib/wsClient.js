// src/lib/wsClient.js
//
// Singleton WebSocket per URL. One connection is shared across all hook
// instances within a tab. Handles reconnection automatically if the socket
// closes mid-game.

let wsInstance = null;
let wsUrl      = null;
const listeners = new Map(); // id → fn
let nextId = 0;
let reconnectTimer = null;

function attachHandlers(ws) {
  ws.onopen = () => {
    console.log("✅ WebSocket connected");
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  };

  ws.onclose = (ev) => {
    console.warn(`❌ WebSocket closed (code=${ev.code}), scheduling reconnect…`);
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        console.log("🔄 WebSocket reconnecting…");
        wsInstance = new WebSocket(wsUrl);
        attachHandlers(wsInstance);
      }, 500);
    }
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "celebrate") {
      console.log(`[wsClient] celebrate received — winner=${msg.winner}, listeners=${listeners.size}`);
    }
    listeners.forEach((fn) => fn(msg));
  };
}

export function getWebSocket(url) {
  if (!wsUrl) wsUrl = url;

  if (!wsInstance
      || wsInstance.readyState === WebSocket.CLOSED
      || wsInstance.readyState === WebSocket.CLOSING) {
    wsInstance = new WebSocket(url);
    attachHandlers(wsInstance);
  }
  return wsInstance;
}

export function addWsListener(fn) {
  const id = nextId++;
  listeners.set(id, fn);
  return () => listeners.delete(id);
}
