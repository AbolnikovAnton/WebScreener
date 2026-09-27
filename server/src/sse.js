/**
 * Turns an Express response into a Server-Sent Events stream.
 * Named events are used so the client can listen to each type separately.
 */
export function openSseStream(res, { heartbeatMs }) {
  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Stops nginx from buffering the stream.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  let closed = false;

  // Comment lines keep proxies and load balancers from dropping an idle
  // connection while a slow page is loading.
  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, heartbeatMs);
  heartbeat.unref();

  res.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
  });

  return {
    get closed() {
      return closed;
    },

    send(event, data) {
      if (!closed) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    },

    close() {
      clearInterval(heartbeat);
      if (!closed) {
        closed = true;
        res.end();
      }
    },
  };
}
