// useServerOffset.js
//
// Estimates the clock offset between client and server using RTT compensation.
// Uses a single polling loop to avoid conflicting offset updates.
// Applies exponential smoothing so transient network spikes don't destabilise
// the offset estimate.

import { useEffect, useState } from "react";

export function useServerOffset(httpUrl = `${window.location.origin}/time`) {
  const [offsetMs, setOffsetMs] = useState(null);  // null = not yet synced
  const alpha = 0.15;  // smoothing factor: higher = faster but noisier

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      const t0 = Date.now();
      try {
        const res = await fetch(httpUrl);
        const t1 = Date.now();
        const { serverTime } = await res.json();

        // Estimate server time at moment of response receipt:
        // server processed the request at roughly (t0 + t1) / 2,
        // so the offset is serverTime + rtt/2 - t1
        const rtt            = t1 - t0;
        const estServerTime  = serverTime + rtt / 2;
        const newOffset      = estServerTime - t1;

        if (!cancelled) {
          setOffsetMs((prev) =>
            prev === null ? newOffset : prev * (1 - alpha) + newOffset * alpha
          );
          console.log(`Clock offset: ${Math.round(newOffset)}ms  RTT: ${rtt}ms`);
        }
      } catch (err) {
        console.error("Clock sync failed:", err);
      }
    }

    // Initial sync immediately, then every 2 seconds.
    // 2s is frequent enough to track drift without hammering the server
    // when many tabs are open.
    ping();
    const interval = setInterval(ping, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [httpUrl]);

  return offsetMs;
}
