import "./App.css";

import { useState } from "react";

import { HighlightedText } from "./HighlightedText.jsx";
import { normalizeUrl } from "./normalizeUrl.js";
import { useScan } from "./useScan.js";

function statusText(scan) {
  switch (scan.status) {
    case "connecting":
      return "Connecting…";
    case "queued":
      return scan.queuePosition
        ? `Waiting in line (position ${scan.queuePosition})…`
        : "Waiting in line…";
    case "loading":
      return "Opening the page…";
    case "scrolling":
      return `Scrolling and scanning… ${scan.total} found so far`;
    default:
      return "";
  }
}

function App() {
  const [website, setWebsite] = useState("");
  const [keyword, setKeyword] = useState("");
  const scan = useScan();

  const canSubmit = !scan.isRunning && website.trim() !== "" && keyword.trim() !== "";

  const handleSubmit = (event) => {
    event.preventDefault();
    if (canSubmit) {
      scan.start(normalizeUrl(website), keyword.trim());
    }
  };

  const finished = scan.status === "done" || scan.status === "cancelled";

  return (
    <div className="App">
      <header className="hero">
        <p className="eyebrow">Web Screener</p>
        <h1>Keyword Scanner</h1>
        <p className="subtitle">
          Scan long web pages with auto-scroll and get live progress while results are being discovered.
        </p>
      </header>

      <form className="controls" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="website">Website URL</label>
          <input
            id="website"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck="false"
            value={website}
            placeholder="https://example.com"
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="keyword">Keyword</label>
          <input
            id="keyword"
            value={keyword}
            maxLength={100}
            placeholder="e.g. react"
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        <div className="actions">
          <button type="submit" disabled={!canSubmit}>
            {scan.isRunning ? "Scanning…" : "Find"}
          </button>
          {scan.isRunning && (
            <button type="button" className="secondary" onClick={scan.cancel}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div aria-live="polite">
        {scan.isRunning && (
          <div className="statusRow" role="status">
            <span className="spinner" aria-hidden="true"></span>
            <span>{statusText(scan)}</span>
          </div>
        )}
      </div>

      {scan.status === "error" && (
        <p className="error" role="alert">
          {scan.error}
        </p>
      )}

      {scan.status !== "idle" && (
        <section className="results" aria-labelledby="results-title">
          <h2 id="results-title">
            Results{scan.matches.length > 0 ? ` (${scan.matches.length})` : ""}
          </h2>

          {scan.status === "done" && scan.timedOut && (
            <p className="notice">The time limit was reached, so these results may be incomplete.</p>
          )}
          {scan.status === "done" && scan.truncated && (
            <p className="notice">Showing the first {scan.total} matches.</p>
          )}
          {scan.status === "cancelled" && <p className="notice">Scan cancelled.</p>}

          {finished && scan.matches.length === 0 && (
            <p className="empty">Nothing found for “{scan.query?.keyword}”.</p>
          )}

          {scan.matches.length > 0 && (
            <ul>
              {scan.matches.map((item, index) => (
                // Matches are only ever appended, so the index is a stable key.
                <li key={index}>
                  <HighlightedText text={item} query={scan.query?.keyword} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
