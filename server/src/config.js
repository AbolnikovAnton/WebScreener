function readInt(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative integer, got "${raw}"`);
  }
  return value;
}

function readList(env, name, fallback) {
  const raw = env[name] ?? fallback;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

// Read lazily (not at import time) so index.js can load .env first
// and tests can pass their own values.
export function loadConfig(env = process.env) {
  return {
    port: readInt(env, "PORT", 3001),
    corsOrigins: readList(env, "CORS_ORIGIN", "http://localhost:5173"),
    trustProxy: env.TRUST_PROXY === "true",

    // Only for local development and tests: lets the scanner open localhost / LAN pages.
    allowPrivateHosts: env.ALLOW_PRIVATE_HOSTS === "true",
    chromeNoSandbox: env.CHROME_NO_SANDBOX === "true",

    maxConcurrentScans: readInt(env, "MAX_CONCURRENT_SCANS", 2),
    maxQueuedScans: readInt(env, "MAX_QUEUED_SCANS", 10),
    scanTimeoutMs: readInt(env, "SCAN_TIMEOUT_MS", 60_000),
    navigationTimeoutMs: readInt(env, "NAVIGATION_TIMEOUT_MS", 30_000),
    maxScrollSteps: readInt(env, "MAX_SCROLL_STEPS", 40),
    stableStepsToStop: readInt(env, "STABLE_STEPS_TO_STOP", 2),
    scrollDelayMs: readInt(env, "SCROLL_DELAY_MS", 700),
    maxMatches: readInt(env, "MAX_MATCHES", 500),

    maxUrlLength: readInt(env, "MAX_URL_LENGTH", 2048),
    maxKeywordLength: readInt(env, "MAX_KEYWORD_LENGTH", 100),

    rateLimitWindowMs: readInt(env, "RATE_LIMIT_WINDOW_MS", 60_000),
    rateLimitMax: readInt(env, "RATE_LIMIT_MAX", 10),

    sseHeartbeatMs: readInt(env, "SSE_HEARTBEAT_MS", 15_000),
  };
}
