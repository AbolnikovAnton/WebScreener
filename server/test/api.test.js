import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import { closeBrowser } from "../src/browser.js";
import { scanPage } from "../src/scanner.js";
import { listen, scan, startApp, testConfig, waitFor } from "./helpers.js";

const fixtureHtml = await readFile(new URL("./fixtures/infinite-feed.html", import.meta.url), "utf8");

function waitForAbort(signal) {
  return new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
}

describe("GET /scan with a fake scanner", () => {
  it("rejects missing input with a scan-error event", async () => {
    const api = await startApp(testConfig());
    try {
      const events = await scan(api.baseUrl, { url: "https://example.com" });
      assert.deepEqual(events.map((e) => e.event), ["scan-error"]);
      assert.match(events[0].data.message, /keyword are required/);
    } finally {
      await api.stop();
    }
  });

  it("rejects a too-long keyword", async () => {
    const api = await startApp(testConfig({ maxKeywordLength: 5 }));
    try {
      const [event] = await scan(api.baseUrl, { url: "https://example.com", keyword: "toolong" });
      assert.equal(event.event, "scan-error");
      assert.match(event.data.message, /too long/);
    } finally {
      await api.stop();
    }
  });

  it("blocks private addresses when ALLOW_PRIVATE_HOSTS is off", async () => {
    let scanned = false;
    const api = await startApp(testConfig({ allowPrivateHosts: false }), {
      scan: async () => {
        scanned = true;
      },
    });
    try {
      const [event] = await scan(api.baseUrl, { url: "http://169.254.169.254/latest/meta-data/", keyword: "x" });
      assert.equal(event.event, "scan-error");
      assert.match(event.data.message, /private network/);
      assert.equal(scanned, false);
    } finally {
      await api.stop();
    }
  });

  it("rate-limits a single client", async () => {
    const api = await startApp(testConfig({ rateLimitMax: 1 }), {
      scan: async () => ({ total: 0, truncated: false }),
    });
    try {
      const params = { url: "https://example.com", keyword: "x" };
      assert.equal((await scan(api.baseUrl, params)).at(-1).event, "done");
      const [event] = await scan(api.baseUrl, params);
      assert.equal(event.event, "scan-error");
      assert.match(event.data.message, /Too many scans/);
    } finally {
      await api.stop();
    }
  });

  it("says the server is busy when the queue is full", async () => {
    const api = await startApp(testConfig({ maxConcurrentScans: 1, maxQueuedScans: 0 }), {
      scan: ({ signal }) => waitForAbort(signal),
    });
    const firstClient = new AbortController();
    try {
      const firstResponse = fetch(`${api.baseUrl}/scan?url=https://example.com&keyword=a`, {
        signal: firstClient.signal,
      }).catch(() => {});
      await waitFor(() => api.queue.active === 1);

      const [event] = await scan(api.baseUrl, { url: "https://example.com", keyword: "b" });
      assert.equal(event.event, "scan-error");
      assert.match(event.data.message, /busy/);

      firstClient.abort();
      await firstResponse;
    } finally {
      await api.stop();
    }
  });

  it("stops the scan when the client disconnects", async () => {
    let scanSignal;
    const api = await startApp(testConfig(), {
      scan: ({ signal }) => {
        scanSignal = signal;
        return waitForAbort(signal);
      },
    });
    try {
      const client = new AbortController();
      const response = await fetch(`${api.baseUrl}/scan?url=https://example.com&keyword=a`, {
        signal: client.signal,
      });
      await waitFor(() => scanSignal !== undefined);

      client.abort();
      await response.text().catch(() => {});

      await waitFor(() => scanSignal.aborted);
      await waitFor(() => api.queue.active === 0);
    } finally {
      await api.stop();
    }
  });

  it("finishes with partial results when the time limit is hit", async () => {
    const api = await startApp(testConfig({ scanTimeoutMs: 100 }), {
      scan: async ({ signal, onMatches }) => {
        onMatches(["first match"], 1);
        await waitForAbort(signal);
        throw signal.reason;
      },
    });
    try {
      const events = await scan(api.baseUrl, { url: "https://example.com", keyword: "match" });
      assert.deepEqual(events.map((e) => e.event), ["matches", "done"]);
      assert.deepEqual(events[1].data, { total: 1, truncated: false, timedOut: true });
    } finally {
      await api.stop();
    }
  });
});

describe("GET /scan with real Chrome", () => {
  let fixtureUrl;
  let fixtureServer;
  let api;

  before(async () => {
    fixtureServer = createServer((req, res) => {
      if (req.url === "/redirect-to-metadata") {
        res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" }).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(fixtureHtml);
    });
    fixtureUrl = await listen(fixtureServer);
    api = await startApp(testConfig());
  });

  after(async () => {
    await api?.stop();
    fixtureServer?.closeAllConnections();
    fixtureServer?.close();
    await closeBrowser();
  });

  it("scrolls an infinite feed to the end and streams every match", { timeout: 60_000 }, async () => {
    const events = await scan(api.baseUrl, { url: fixtureUrl, keyword: "needle" });

    const matches = events.filter((e) => e.event === "matches").flatMap((e) => e.data.newMatches);
    const expectedItems = Array.from({ length: 12 }, (_, i) => `Needle item ${i * 10 + 5}`);

    // Items from the last batch only exist after scrolling to the very bottom.
    for (const item of expectedItems) {
      assert.ok(matches.includes(item), `missing "${item}"`);
    }
    assert.ok(matches.includes("NEEDLE inside a frame"), "text inside iframes is scanned too");

    const done = events.at(-1);
    assert.equal(done.event, "done");
    assert.equal(done.data.total, 13);
    assert.equal(done.data.timedOut, false);
  });

  it("stops when a page redirects to a private address", { timeout: 60_000 }, async () => {
    // The fixture itself lives on 127.0.0.1, so allow exactly that host and
    // check that the redirect target is still blocked.
    await assert.rejects(
      scanPage({
        url: `${fixtureUrl}/redirect-to-metadata`,
        keyword: "x",
        onMatches: () => {},
        options: testConfig({ allowPrivateHosts: false }),
        isAllowedHost: async (hostname) => hostname === "127.0.0.1",
      }),
      /redirected to a local or private address/,
    );
  });
});
