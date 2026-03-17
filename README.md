# Web Screener

Web Screener is a small full-stack app that scans a web page for a keyword, auto-scrolls dynamic content, and streams live progress updates to the UI.

## Stack

- Client: React (Create React App)
- Server: Node.js, Express, Puppeteer
- Live updates: Server-Sent Events (SSE)

## Project Structure

- client/titan-app: frontend application
- server: backend API and crawling logic

## Recent Improvements

- Added request validation and strict URL checks on the backend.
- Switched matching from raw HTML parsing to visible text extraction.
- Added deduplication for cleaner search results.
- Added bounded scrolling and request timeout safeguards.
- Added requestId-based SSE filtering to avoid cross-request mixing.
- Refreshed UI with responsive layout, progress state, and error handling.

## Requirements

- Node.js 18+
- npm 9+

## Installation

```bash
# backend
cd server
npm install

# frontend
cd ../client/titan-app
npm install
```

## Run in Development

Use two terminals.

Terminal 1:

```bash
cd server
npm start
```

Backend runs on http://localhost:3001.

Terminal 2:

```bash
cd client/titan-app
npm start
```

Frontend runs on the first free port (usually http://localhost:3000).

## API

### GET /

Query parameters:

- url: full http/https page URL
- keyword: word or phrase to search for
- requestId: unique client request ID used to filter SSE events

Example:

```text
http://localhost:3001/?url=https%3A%2F%2Fexample.com&keyword=Example&requestId=test-1
```

Response:

```json
{
  "keywordFound": ["..."]
}
```

### GET /subscribe

SSE event payload:

```json
{
  "type": "progress",
  "requestId": "...",
  "newMatches": ["..."],
  "total": 5
}
```

### GET /health

Health check endpoint.

## Notes and Next Steps

- Add automated tests for both backend and frontend.
- Add server-side concurrency limits for long-running scans.
- Move configuration (ports, API base URL, timeouts) to environment files per environment.
