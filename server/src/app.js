import cors from "cors";
import express from "express";

import { createRateLimiter } from "./rateLimit.js";
import { scanPage, ScanError } from "./scanner.js";
import { openSseStream } from "./sse.js";
import { createTaskQueue, QueueFullError } from "./taskQueue.js";
import { assertSafeUrl, UnsafeUrlError } from "./urlGuard.js";

function readQueryString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateInput({ url, keyword }, config) {
  if (!url || !keyword) {
    return "Both a URL and a keyword are required.";
  }
  if (url.length > config.maxUrlLength) {
    return `The URL is too long (max ${config.maxUrlLength} characters).`;
  }
  if (keyword.length > config.maxKeywordLength) {
    return `The keyword is too long (max ${config.maxKeywordLength} characters).`;
  }
  return null;
}

function toUserMessage(error) {
  if (error instanceof UnsafeUrlError || error instanceof ScanError || error instanceof QueueFullError) {
    return error.message;
  }
  return "Something went wrong while scanning the page.";
}

/**
 * Builds the Express app. Kept separate from index.js (which calls listen)
 * so tests can start it on a random port with their own config.
 */
export function createApp(config, { scan = scanPage } = {}) {
  const app = express();
  const queue = createTaskQueue({
    concurrency: config.maxConcurrentScans,
    maxQueued: config.maxQueuedScans,
  });
  const rateLimiter = createRateLimiter({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
  });

  app.set("trust proxy", config.trustProxy);
  app.disable("x-powered-by");
  app.use(cors({ origin: config.corsOrigins.includes("*") ? true : config.corsOrigins }));

  app.get("/health", (req, res) => {
    res.json({ status: "ok", activeScans: queue.active, queuedScans: queue.queued });
  });

  /**
   * GET /scan?url=...&keyword=...
   *
   * One request = one scan, streamed back as Server-Sent Events:
   *   status      { state: "queued" | "loading" | "scrolling" }
   *   matches     { newMatches: string[], total: number }
   *   done        { total, truncated, timedOut }
   *   scan-error  { message }
   *
   * Errors are sent as an event (not an HTTP status) because the browser's
   * EventSource API cannot read the body of a non-200 response.
   */
  app.get("/scan", async (req, res) => {
    const sse = openSseStream(res, { heartbeatMs: config.sseHeartbeatMs });
    const fail = (message) => {
      sse.send("scan-error", { message });
      sse.close();
    };

    const url = readQueryString(req.query.url);
    const keyword = readQueryString(req.query.keyword);

    const validationError = validateInput({ url, keyword }, config);
    if (validationError) {
      return fail(validationError);
    }

    if (!rateLimiter.tryConsume(req.ip)) {
      return fail("Too many scans from your address. Please wait a minute and try again.");
    }

    // When the user closes the tab or presses Cancel, stop the scan right
    // away instead of scrolling a page nobody is waiting for.
    const clientGone = new AbortController();
    res.on("close", () => clientGone.abort(new Error("Client disconnected")));

    let total = 0;
    try {
      const safeUrl = await assertSafeUrl(url, { allowPrivateHosts: config.allowPrivateHosts });

      if (queue.isSaturated && queue.queued < config.maxQueuedScans) {
        sse.send("status", { state: "queued", position: queue.queued + 1 });
      }

      const result = await queue.run(
        async () => {
          // The time limit starts when the scan starts, not while it waits in the queue.
          const timeout = AbortSignal.timeout(config.scanTimeoutMs);
          try {
            return await scan({
              url: safeUrl.href,
              keyword,
              signal: AbortSignal.any([clientGone.signal, timeout]),
              options: config,
              onStatus: (state) => sse.send("status", { state }),
              onMatches: (newMatches, runningTotal) => {
                total = runningTotal;
                sse.send("matches", { newMatches, total });
              },
            });
          } catch (error) {
            // Matches found before the time limit were already streamed, so
            // finish normally and let the client show them.
            if (timeout.aborted && !clientGone.signal.aborted) {
              return { total, truncated: false, timedOut: true };
            }
            throw error;
          }
        },
        { signal: clientGone.signal },
      );

      sse.send("done", { total: result.total, truncated: result.truncated, timedOut: Boolean(result.timedOut) });
      sse.close();
    } catch (error) {
      if (clientGone.signal.aborted) {
        return;
      }
      if (!(error instanceof UnsafeUrlError || error instanceof ScanError || error instanceof QueueFullError)) {
        console.error("Scan failed:", error);
      }
      fail(toUserMessage(error));
    }
  });

  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return {
    app,
    queue,
    close() {
      rateLimiter.stop();
    },
  };
}
