import "./App.css";
import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function App() {
  const [website, setWebsite] = useState("");
  const [keyword, setKeyword] = useState("");
  const [result, setResult] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progressCount, setProgressCount] = useState(0);
  const eventSourceRef = useRef(null);
  const activeRequestIdRef = useRef("");

  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE_URL}/subscribe`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data);

      if (payload.type !== "progress") {
        return;
      }

      if (!payload.requestId || payload.requestId !== activeRequestIdRef.current) {
        return;
      }

      setProgressCount(payload.total || 0);
      if (Array.isArray(payload.newMatches) && payload.newMatches.length > 0) {
        setResult((prevData) => [...prevData, ...payload.newMatches]);
      }
    };

    eventSource.onerror = () => {
      setError("SSE connection dropped. Please reload the page.");
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, []);

  const isFindDisabled = useMemo(() => {
    return loading || !website.trim() || !keyword.trim();
  }, [keyword, loading, website]);

  const handleFind = async () => {
    const nextRequestId = createRequestId();
    const params = new URLSearchParams({
      url: website.trim(),
      keyword: keyword.trim(),
      requestId: nextRequestId,
    });

    setError("");
    setLoading(true);
    setResult([]);
    setProgressCount(0);
    activeRequestIdRef.current = nextRequestId;

    try {
      const response = await fetch(`${API_BASE_URL}/?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }

      if (data.keywordFound.length === 0) {
        setResult(["Nothing found"]);
      } else {
        setResult(data.keywordFound);
      }
    } catch (fetchError) {
      console.error("Error:", fetchError);
      setError(fetchError.message || "Unexpected error");
      setResult([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="hero">
        <p className="eyebrow">Web Screener</p>
        <h1>Keyword Scanner</h1>
        <p className="subtitle">
          Scan long web pages with auto-scroll and get live progress while results
          are being discovered.
        </p>
      </header>

      <section className="controls">
        <div className="field">
          <label htmlFor="website">Website URL</label>
          <input
            id="website"
            type="url"
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
            placeholder="e.g. react"
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        <button disabled={isFindDisabled} onClick={handleFind}>
          {loading ? "Searching..." : "Find"}
        </button>
      </section>

      {loading && (
        <div className="statusRow" role="status" aria-live="polite">
          <span className="spinner"></span>
          <span>Live matches found: {progressCount}</span>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <section className="results">
        <h2>Results</h2>
        <ul>
          {result.map((item, index) => (
            <li key={`${item}-${index}`}>
              {item.split(keyword).map((part, i) => (
                <React.Fragment key={i}>
                  {i > 0 && keyword ? <mark>{keyword}</mark> : null}
                  {part}
                </React.Fragment>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default App;
