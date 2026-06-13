// useServerClock.js
import { useServerOffset } from "./useServerOffset";

export function useServerClock(httpUrl) {
  // offsetMs is null until first sync completes — treat as 0 in the meantime
  const offsetMs = useServerOffset(httpUrl) ?? 0;
  const serverNowMs = () => Date.now() + offsetMs;
  return { serverNowMs, offsetMs };
}
