// server/messages.js
export function makeStartMessage(
  startTime,
  bpm,
  sopranoBeats,
  altoBeats,
  tenorBeats,
  baritoneBeats,
) {
  return JSON.stringify({
    type: "start",
    startTime,
    bpm,
    sopranoBeats,
    altoBeats,
    tenorBeats,
    baritoneBeats,
  });
}

export function makeStopMessage(scores) {
  return JSON.stringify({
    type: "stop",
    scores,
  });
}

export function makeTickScheduleMessage(tickTimes, tickDownbeats, tickPrepBeats) {
  return JSON.stringify({
    type: "tickSchedule",
    tickTimes,
    tickDownbeats,
    tickPrepBeats,
  });
}

export function makeTapBroadcastMessage(part, timestamp, diff, score, hit) {
  return JSON.stringify({
    type: "tapBroadcast",
    part,
    timestamp,
    diff,
    score,
    hit: !!hit,   // always a boolean so the projection can track hit rate
  });
}

export function makePresenceMessage(clients) {
  return JSON.stringify({
    type: "presence",
    clients,
  });
}
