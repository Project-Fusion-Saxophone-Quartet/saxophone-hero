// server/utils.js
import Sntp from "@hapi/sntp";

// Returns a function `serverNowMs()` that gives the current server time,
// and a function `setGameActive(bool)` to pause NTP corrections mid-game.
//
// NTP corrections are smoothed (slewed) rather than applied as hard jumps.
// A correction larger than SLEW_THRESHOLD_MS is applied at SLEW_RATE_MS
// per tick rather than all at once, preventing discontinuous time jumps
// during a live performance.
export async function createNtpSync(ntpServer = "pool.ntp.org") {
  let offset     = 0;   // current applied offset
  let targetOffset = 0; // what NTP says the offset should be
  let gameActive = false;

  const SLEW_THRESHOLD_MS = 5;    // corrections smaller than this apply immediately
  const SLEW_RATE_MS      = 1;    // max ms to slew per slew tick (every 100ms)
  const POLL_INTERVAL_MS  = 60_000;

  async function syncNtp() {
    if (gameActive) {
      console.log("NTP sync skipped — game in progress");
      return;
    }
    try {
      const { t } = await Sntp.time({ host: ntpServer, timeout: 2000 });
      targetOffset = t;
      const delta = Math.abs(targetOffset - offset);
      if (delta <= SLEW_THRESHOLD_MS) {
        // Small correction — apply immediately
        offset = targetOffset;
        console.log(`NTP sync: offset=${offset.toFixed(2)} ms (applied immediately)`);
      } else {
        // Large correction — will be slewed gradually
        console.log(`NTP sync: offset=${targetOffset.toFixed(2)} ms (slewing from ${offset.toFixed(2)} ms, delta=${delta.toFixed(2)} ms)`);
      }
    } catch (err) {
      console.error("NTP sync failed:", err.message);
    }
  }

  // Slew loop — runs every 100ms, nudges offset toward targetOffset
  setInterval(() => {
    if (offset === targetOffset) return;
    const delta = targetOffset - offset;
    const step  = Math.sign(delta) * Math.min(Math.abs(delta), SLEW_RATE_MS);
    offset += step;
  }, 100);

  // Initial sync
  await syncNtp();

  // Resync every 60 seconds
  setInterval(syncNtp, POLL_INTERVAL_MS);

  function serverNowMs() {
    return Date.now() + offset;
  }

  // Call this when a game starts/stops to pause NTP corrections mid-performance
  serverNowMs.setGameActive = (active) => {
    gameActive = active;
    if (active) console.log("NTP sync paused for game duration");
    else        console.log("NTP sync resumed");
  };

  return serverNowMs;
}

// Returns interval in ms per beat
export function msPerBeat(bpm) {
  return 60000 / bpm;
}
