import osc from "osc";
import { WebSocketServer } from "ws";

const MAX_IP =
  process.env.MAX_IP || "127.0.0.1"; // auto when local

const MAX_PORT = process.env.MAX_PORT || 9000;

const udpPort = new osc.UDPPort({
  localAddress: "0.0.0.0", // listen on all interfaces
  localPort: 57121,
  remoteAddress: MAX_IP, // SEND TO MAX
  remotePort: MAX_PORT,
});

udpPort.open();

udpPort.on("ready", () => {
  console.log("UDP ready → sending to", MAX_IP);
});

const wss = new WebSocketServer({
  host: "0.0.0.0", // IMPORTANT
  port: 8081,
});

wss.on("connection", (ws) => {
  console.log("WebSocket client connected");

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (err) {
      console.warn("Received invalid JSON:", msg.toString());
      return; // ignore
    }

    const { part, section } = data;

    // only send if both values exist
    if (!part || section == null) {
      console.warn("Skipping invalid section message:", data);
      return;
    }

    console.log("sending section", section, "for part", part);

    try {
      udpPort.send({
        address: `/section/${part}`,
        args: [section],
      });
    } catch (err) {
      console.error("OSC send error:", err);
    }
  });
});
