export class QueueFullError extends Error {
  constructor() {
    super("The server is busy right now. Please try again in a minute.");
    this.name = "QueueFullError";
  }
}

/**
 * Runs at most `concurrency` tasks at once and keeps up to `maxQueued`
 * waiting. Each scan holds a Chrome tab, so this is what keeps a burst of
 * requests from exhausting the server's memory.
 */
export function createTaskQueue({ concurrency, maxQueued }) {
  let active = 0;
  const waiting = [];

  function startNext() {
    while (active < concurrency && waiting.length > 0) {
      waiting.shift().start();
    }
  }

  return {
    get active() {
      return active;
    },

    get queued() {
      return waiting.length;
    },

    get isSaturated() {
      return active >= concurrency;
    },

    run(task, { signal } = {}) {
      if (signal?.aborted) {
        return Promise.reject(signal.reason);
      }
      if (active >= concurrency && waiting.length >= maxQueued) {
        return Promise.reject(new QueueFullError());
      }

      return new Promise((resolve, reject) => {
        const entry = {
          start() {
            signal?.removeEventListener("abort", onAbort);
            active += 1;
            Promise.resolve()
              .then(task)
              .then(resolve, reject)
              .finally(() => {
                active -= 1;
                startNext();
              });
          },
        };

        // A client that leaves while still queued must not take a slot later.
        function onAbort() {
          const index = waiting.indexOf(entry);
          if (index !== -1) {
            waiting.splice(index, 1);
            reject(signal.reason);
          }
        }

        signal?.addEventListener("abort", onAbort, { once: true });
        waiting.push(entry);
        startNext();
      });
    },
  };
}
