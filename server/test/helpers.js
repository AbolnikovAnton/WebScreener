import { once } from "node:events";

import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

export function testConfig(overrides = {}) {
  return {
    ...loadConfig({}),
    allowPrivateHosts: true,
    corsOrigins: ["*"],
    rateLimitMax: 1000,
    scrollDelayMs: 150,
    ...overrides,
  };
}

export async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

export async function startApp(config, deps) {
  const { app, queue, close } = createApp(config, deps);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    queue,
    async stop() {
      close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/** Parses a complete SSE body into [{ event, data }]. Comment lines are skipped. */
export function parseSse(text) {
  return text
    .split("\n\n")
    .map((block) => {
      let event = "message";
      const dataLines = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
      }
      return dataLines.length > 0 ? { event, data: JSON.parse(dataLines.join("\n")) } : null;
    })
    .filter(Boolean);
}

export async function scan(baseUrl, params, init) {
  const response = await fetch(`${baseUrl}/scan?${new URLSearchParams(params)}`, init);
  return parseSse(await response.text());
}

export async function waitFor(check, { timeoutMs = 2000, intervalMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error("waitFor timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
