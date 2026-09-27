import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findNewMatches, toSnippet } from "../src/matcher.js";
import { createRateLimiter } from "../src/rateLimit.js";
import { createTaskQueue, QueueFullError } from "../src/taskQueue.js";

describe("findNewMatches", () => {
  it("matches case-insensitively and keeps the original text", () => {
    const seen = new Set();
    const fresh = findNewMatches(["React is great", "nothing here", "I like REACT"], "react", seen);
    assert.deepEqual(fresh, ["React is great", "I like REACT"]);
  });

  it("skips lines it has already seen", () => {
    const seen = new Set(["React is great"]);
    assert.deepEqual(findNewMatches(["React is great", "React again"], "react", seen), ["React again"]);
  });

  it("collapses whitespace so the same line is not reported twice", () => {
    const seen = new Set();
    findNewMatches(["Hello   react"], "react", seen);
    assert.deepEqual(findNewMatches(["Hello react"], "react", seen), []);
  });

  it("stops at the limit", () => {
    const seen = new Set();
    const fresh = findNewMatches(["a key", "b key", "c key"], "key", seen, 2);
    assert.deepEqual(fresh, ["a key", "b key"]);
  });
});

describe("toSnippet", () => {
  it("leaves short lines alone", () => {
    assert.equal(toSnippet("short line", 0, 5), "short line");
  });

  it("cuts long lines around the match", () => {
    const line = `${"a".repeat(500)} needle ${"b".repeat(500)}`;
    const snippet = toSnippet(line, line.indexOf("needle"), 6, 20);
    assert.ok(snippet.startsWith("…"));
    assert.ok(snippet.endsWith("…"));
    assert.ok(snippet.includes("needle"));
    assert.ok(snippet.length < 60);
  });
});

describe("createTaskQueue", () => {
  const deferred = () => {
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };

  it("never runs more tasks than the concurrency limit", async () => {
    const queue = createTaskQueue({ concurrency: 2, maxQueued: 10 });
    let running = 0;
    let peak = 0;
    const task = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 10));
      running -= 1;
    };

    await Promise.all(Array.from({ length: 6 }, () => queue.run(task)));
    assert.equal(peak, 2);
    assert.equal(queue.active, 0);
  });

  it("rejects when the waiting list is full", async () => {
    const queue = createTaskQueue({ concurrency: 1, maxQueued: 1 });
    const gate = deferred();
    const first = queue.run(() => gate.promise);
    const second = queue.run(() => "second");

    await assert.rejects(queue.run(() => "third"), QueueFullError);
    gate.resolve("first");
    assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
  });

  it("drops a queued task whose signal aborts", async () => {
    const queue = createTaskQueue({ concurrency: 1, maxQueued: 5 });
    const gate = deferred();
    const first = queue.run(() => gate.promise);

    const controller = new AbortController();
    let secondRan = false;
    const second = queue.run(
      () => {
        secondRan = true;
      },
      { signal: controller.signal },
    );

    controller.abort(new Error("gone"));
    await assert.rejects(second, /gone/);
    assert.equal(queue.queued, 0);

    gate.resolve();
    await first;
    assert.equal(secondRan, false);
  });
});

describe("createRateLimiter", () => {
  it("allows up to max hits per window, per key", () => {
    let time = 0;
    const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => time });

    assert.equal(limiter.tryConsume("a"), true);
    assert.equal(limiter.tryConsume("a"), true);
    assert.equal(limiter.tryConsume("a"), false);
    assert.equal(limiter.tryConsume("b"), true);

    time = 1000;
    assert.equal(limiter.tryConsume("a"), true);
    limiter.stop();
  });
});
