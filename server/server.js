const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 3001;
const MAX_SCROLL_STEPS = 40;
const REQUEST_TIMEOUT_MS = 90000;

app.use(cors());

// Array to store clients
let clients = [];

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function sendSseEvent(payload) {
  clients.forEach((client) => {
    client.write(`data: ${JSON.stringify(payload)}\n\n`);
  });
}

async function extractTextLines(page) {
  return page.evaluate(() => {
    const bodyText = document.body ? document.body.innerText : "";
    return bodyText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  });
}

// Function to search for a keyword on a page
async function searchKeyword(url, keyword, requestId) {
  const keywordNormalized = keyword.toLowerCase();
  const foundSet = new Set();

  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: REQUEST_TIMEOUT_MS,
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: REQUEST_TIMEOUT_MS,
    });
    await page.waitForSelector("body", { timeout: 15000 });

    let oldHeight = -1;

    for (let step = 0; step < MAX_SCROLL_STEPS; step += 1) {
      const lines = await extractTextLines(page);
      const freshMatches = [];

      lines.forEach((line) => {
        if (line.toLowerCase().includes(keywordNormalized) && !foundSet.has(line)) {
          foundSet.add(line);
          freshMatches.push(line);
        }
      });

      if (freshMatches.length > 0) {
        sendSseEvent({
          type: "progress",
          requestId,
          newMatches: freshMatches,
          total: foundSet.size,
        });
      }

      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === oldHeight) {
        break;
      }

      oldHeight = newHeight;
      await autoScroll(page);
      await delay(700);
    }

    return Array.from(foundSet);
  } finally {
    await browser.close();
  }
}

// Function to introduce delay
function delay(time) {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

// Function to automatically scroll the page to the end
async function autoScroll(page) {
  await page.evaluate(() => {
    const distance = Math.max(window.innerHeight * 0.8, 300);
    window.scrollBy(0, distance);
  });
}

// Route for processing requests
app.get("/", async (req, res) => {
  const url = req.query.url ? String(req.query.url).trim() : "";
  const keyword = req.query.keyword ? String(req.query.keyword).trim() : "";
  const requestId = req.query.requestId ? String(req.query.requestId) : "";

  if (!url || !keyword || !requestId) {
    return res.status(400).json({
      error: "Missing required query params: url, keyword, requestId",
    });
  }

  if (!isValidHttpUrl(url)) {
    return res.status(400).json({
      error: "Invalid URL. Use full http/https URL.",
    });
  }

  try {
    console.log("Received request with URL:", url);
    console.log("Received request with keyword:", keyword);
    console.log("Received requestId:", requestId);

    // Perform a keyword search on the page and send updates using SSE
    const keywordFound = await searchKeyword(url, keyword, requestId);
    return res.json({ keywordFound });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Route for clients to subscribe to updates
app.get("/subscribe", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  // Add client to the list
  clients.push(res);

  // Remove client when connection is closed
  req.on("close", () => {
    clients = clients.filter((client) => client !== res);
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
