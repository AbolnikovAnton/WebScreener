/**
 * Minimal fixed-window rate limiter keyed by client IP. In-memory, so it is
 * per process; behind several instances use a shared store instead.
 */
export function createRateLimiter({ windowMs, max, now = Date.now }) {
  const windows = new Map();

  const cleanup = setInterval(() => {
    const currentTime = now();
    for (const [key, entry] of windows) {
      if (entry.resetAt <= currentTime) {
        windows.delete(key);
      }
    }
  }, windowMs);
  cleanup.unref();

  return {
    /** Records a hit and returns whether it is within the limit. */
    tryConsume(key) {
      const currentTime = now();
      let entry = windows.get(key);

      if (!entry || entry.resetAt <= currentTime) {
        entry = { count: 0, resetAt: currentTime + windowMs };
        windows.set(key, entry);
      }

      entry.count += 1;
      return entry.count <= max;
    },

    stop() {
      clearInterval(cleanup);
    },
  };
}
