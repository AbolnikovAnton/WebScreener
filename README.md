# Web Screener

Web Screener scans a web page for a keyword. It opens the page in headless
Chrome, keeps scrolling so infinite feeds load more content, and streams every
matching line to the browser as soon as it is found.

## Stack

- **Client:** React 19 + Vite, tested with Vitest and Testing Library
- **Server:** Node.js, Express 5, Puppeteer, tested with the built-in `node:test`
- **Live updates:** Server-Sent Events (one stream per scan)

## Project structure

```text
client/                 React front end
  src/useScan.js        opens the SSE stream and tracks scan state
  src/HighlightedText   case-insensitive <mark> highlighting
server/
  src/index.js          entry point: loads .env, starts the HTTP server
  src/app.js            Express app and the GET /scan route
  src/scanner.js        Puppeteer: open, scroll, collect matching text
  src/urlGuard.js       SSRF protection (blocks local/private addresses)
  src/taskQueue.js      limits how many scans run at once
  src/rateLimit.js      per-IP request limit
  src/matcher.js        finds new matching lines, builds snippets
  test/                 unit + integration tests (real Chrome, local fixture)
```

## Requirements

- Node.js 20.12 or newer
- npm 9 or newer

Puppeteer downloads its own Chrome on `npm install`.

## Getting started

```bash
cd server && npm install
cd ../client && npm install
```

Run the two parts in separate terminals:

```bash
cd server
npm run dev        # http://localhost:3001, restarts on changes
```

```bash
cd client
npm run dev        # http://localhost:5173
```

In development Vite forwards `/api/*` to the server, so no CORS setup is needed.

## Configuration

Both parts work without any configuration. To change something, copy the
example file and edit it:

- `server/.env.example` → `server/.env` — port, allowed origins, concurrency,
  timeouts, rate limit, and more. Every option is documented in the file.
- `client/.env.example` → `client/.env.local` — `VITE_API_URL` for production
  builds that talk to a separately deployed API.

To scan pages on your own machine (e.g. `http://localhost:8080`), start the
server with `ALLOW_PRIVATE_HOSTS=true`. Never enable it on a public server.

## Deploying to Render

**API — Web Service**

| Setting        | Value         |
| -------------- | ------------- |
| Root Directory | `server`      |
| Build Command  | `npm ci`      |
| Start Command  | `npm start`   |

Environment: `CHROME_NO_SANDBOX=true`, `TRUST_PROXY=true`,
`CORS_ORIGIN=<front-end URL>`, and `MAX_CONCURRENT_SCANS=1` on the 512 MB
free plan. Puppeteer installs Chrome into `server/.cache` (see
`server/.puppeteerrc.cjs`) so it ships with the service.

**UI — Static Site**

| Setting           | Value                          |
| ----------------- | ------------------------------ |
| Root Directory    | `client`                       |
| Build Command     | `npm ci && npm run build`      |
| Publish Directory | `dist`                         |

Environment: `VITE_API_URL=<API URL>`. It is baked in at build time, so
redeploy the site after changing it.

## Tests

```bash
cd server && npm test     # unit tests + integration tests with real Chrome
cd client && npm test     # component tests
cd client && npm run lint
```

The server's integration test serves a local infinite-scroll page and checks
that every batch is found, including text inside an iframe.

## API

### `GET /scan?url=…&keyword=…`

Starts a scan and streams its progress as Server-Sent Events. Closing the
connection stops the scan.

| Event        | Data                                                              |
| ------------ | ----------------------------------------------------------------- |
| `status`     | `{ "state": "queued" \| "loading" \| "scrolling", "position"? }`  |
| `matches`    | `{ "newMatches": ["…"], "total": 12 }`                            |
| `done`       | `{ "total": 12, "truncated": false, "timedOut": false }`          |
| `scan-error` | `{ "message": "…" }`                                              |

Errors are sent as a `scan-error` event instead of an HTTP error status
because the browser's `EventSource` cannot read the body of a failed
response. The stream always ends with either `done` or `scan-error`.

```js
const source = new EventSource("/api/scan?url=https%3A%2F%2Fexample.com&keyword=domain");
source.addEventListener("matches", (e) => console.log(JSON.parse(e.data).newMatches));
source.addEventListener("done", () => source.close());
source.addEventListener("scan-error", (e) => {
  console.error(JSON.parse(e.data).message);
  source.close();
});
```

### `GET /health`

```json
{ "status": "ok", "activeScans": 1, "queuedScans": 0 }
```

## How it works

1. The URL is checked: only `http(s)`, no embedded credentials, and the host
   must not resolve to a loopback, private, link-local or otherwise reserved
   address.
2. The scan waits for a free slot (`MAX_CONCURRENT_SCANS`). If too many are
   already waiting, the client is told the server is busy.
3. A single shared Chrome opens a fresh, isolated browser context. Every
   request the page makes (redirects, iframes, XHR) passes the same address
   check; images, fonts and media are skipped to save time.
4. The scanner reads the visible text of the page and its frames, scrolls to
   the bottom, waits for the network to settle, and repeats until the page
   stops growing, the step limit is reached, or `SCAN_TIMEOUT_MS` runs out.
   New matching lines are streamed immediately. Long paragraphs are cut to a
   snippet around the match.

## Limitations

- Pages that scroll inside an inner container (instead of the window) are
  only scanned for what is initially loaded.
- Text inside shadow DOM is not read.
- SSRF protection checks DNS in Node, while Chrome resolves names on its own.
  A hostile DNS server could answer differently the second time (DNS
  rebinding), and WebSocket connections are not intercepted. For a public
  deployment, also run the server in a network that cannot reach internal
  services.
- Rate limiting and the queue live in memory, so they apply per process.

## License

[MIT](LICENSE)
