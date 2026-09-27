import { useCallback, useEffect, useRef, useState } from "react";

// In development Vite proxies /api to the backend (see vite.config.js), so no
// CORS setup is needed. In production point VITE_API_URL at the deployed API.
export const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

const RUNNING_STATUSES = new Set(["connecting", "queued", "loading", "scrolling"]);

const initialState = {
  status: "idle", // idle | connecting | queued | loading | scrolling | done | error | cancelled
  query: null, // { url, keyword } of the current/last scan, used for highlighting
  matches: [],
  total: 0,
  queuePosition: null,
  truncated: false,
  timedOut: false,
  error: "",
};

function parseEventData(event) {
  try {
    return JSON.parse(event.data);
  } catch {
    return null;
  }
}

/**
 * Runs one scan at a time over Server-Sent Events.
 *
 * Every scan opens its own EventSource to GET /scan, so each user only ever
 * receives their own results, and closing the connection (Cancel, new scan,
 * leaving the page) tells the server to stop scrolling.
 */
export function useScan(apiBaseUrl = API_BASE_URL) {
  const [state, setState] = useState(initialState);
  const sourceRef = useRef(null);

  const closeSource = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  useEffect(() => closeSource, [closeSource]);

  const start = useCallback(
    (url, keyword) => {
      closeSource();

      const params = new URLSearchParams({ url, keyword });
      const source = new EventSource(`${apiBaseUrl}/scan?${params}`);
      sourceRef.current = source;
      setState({ ...initialState, status: "connecting", query: { url, keyword } });

      // Ignore anything from a connection we have already replaced or closed.
      const on = (type, handler) => {
        source.addEventListener(type, (event) => {
          if (sourceRef.current === source) {
            handler(parseEventData(event) ?? {});
          }
        });
      };

      on("status", (data) => {
        setState((prev) => ({ ...prev, status: data.state, queuePosition: data.position ?? null }));
      });

      on("matches", (data) => {
        const newMatches = Array.isArray(data.newMatches) ? data.newMatches : [];
        setState((prev) => ({
          ...prev,
          matches: [...prev.matches, ...newMatches],
          total: data.total ?? prev.total + newMatches.length,
        }));
      });

      on("done", (data) => {
        closeSource();
        setState((prev) => ({
          ...prev,
          status: "done",
          total: data.total ?? prev.total,
          truncated: Boolean(data.truncated),
          timedOut: Boolean(data.timedOut),
        }));
      });

      on("scan-error", (data) => {
        closeSource();
        setState((prev) => ({ ...prev, status: "error", error: data.message || "The scan failed." }));
      });

      // EventSource reconnects on its own after a network error, which here
      // would silently start the same scan again. Close it and tell the user.
      source.onerror = () => {
        if (sourceRef.current !== source) {
          return;
        }
        closeSource();
        setState((prev) => ({
          ...prev,
          status: "error",
          error: "Lost connection to the server. Make sure it is running and try again.",
        }));
      };
    },
    [apiBaseUrl, closeSource],
  );

  const cancel = useCallback(() => {
    closeSource();
    setState((prev) => ({ ...prev, status: "cancelled" }));
  }, [closeSource]);

  return {
    ...state,
    isRunning: RUNNING_STATUSES.has(state.status),
    start,
    cancel,
  };
}
