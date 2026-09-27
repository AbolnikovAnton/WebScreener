import { getBrowser } from "./browser.js";
import { findNewMatches } from "./matcher.js";
import { createHostChecker, UnsafeUrlError } from "./urlGuard.js";

/** An error whose message is safe and useful to show to the user. */
export class ScanError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ScanError";
  }
}

// Not needed to read text, and skipping them makes scans much faster.
const SKIPPED_RESOURCE_TYPES = new Set(["image", "media", "font"]);

const NETWORK_IDLE = { idleTime: 500, timeout: 5000 };

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Checks every request the page makes — including redirects, iframes, fetch/XHR
 * and sub-resources — not only the URL the user typed. Otherwise a public page
 * could simply redirect the browser to http://127.0.0.1.
 */
async function guardRequests(page, { isAllowedHost, onBlockedNavigation }) {
  await page.setRequestInterception(true);

  page.on("request", async (request) => {
    if (request.isInterceptResolutionHandled()) {
      return;
    }

    let allowed = false;
    try {
      const url = new URL(request.url());

      if (url.protocol === "data:" || url.protocol === "blob:") {
        allowed = true;
      } else if (
        (url.protocol === "http:" || url.protocol === "https:") &&
        !SKIPPED_RESOURCE_TYPES.has(request.resourceType())
      ) {
        allowed = await isAllowedHost(url.hostname);
        if (!allowed && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
          onBlockedNavigation();
        }
      }

      if (allowed) {
        await request.continue();
      } else {
        await request.abort("blockedbyclient");
      }
    } catch {
      // The page was closed while we were deciding. Nothing to do.
    }
  });
}

/** Reads visible text from the page and every frame on it. */
async function collectTextLines(page) {
  const texts = await Promise.all(
    page.frames().map((frame) =>
      frame.evaluate(() => (document.body ? document.body.innerText : "")).catch(() => ""),
    ),
  );
  return texts.flatMap((text) => text.split("\n"));
}

/**
 * Scrolls to the very bottom and reports the document height afterwards.
 * Scrolling all the way (rather than one screen at a time) is what triggers
 * infinite-scroll loaders, which usually fire near the end of the page.
 */
async function scrollToBottom(page) {
  return page.evaluate(() => {
    const scroller = document.scrollingElement || document.documentElement;
    scroller.scrollTo(0, scroller.scrollHeight);
    return scroller.scrollHeight;
  });
}

function describeNavigationError(error) {
  if (error?.name === "TimeoutError") {
    return "The page took too long to load.";
  }
  const code = /net::(ERR_[A-Z_]+)/.exec(error?.message ?? "")?.[1];
  if (code === "ERR_NAME_NOT_RESOLVED") {
    return "The site could not be found. Check the address.";
  }
  if (code) {
    return `Could not open the page (${code}).`;
  }
  return "Could not open the page.";
}

/**
 * Opens `url`, scrolls through it and reports every visible line that
 * contains `keyword`. New matches are pushed through `onMatches` as they are
 * found. Resolves to `{ total, truncated }`.
 *
 * Aborting `signal` closes the tab immediately and rejects with its reason.
 */
export async function scanPage({
  url,
  keyword,
  signal,
  onMatches,
  onStatus = () => {},
  options,
  isAllowedHost = createHostChecker({ allowPrivateHosts: options.allowPrivateHosts }),
}) {
  signal?.throwIfAborted();

  const browser = await getBrowser({ noSandbox: options.chromeNoSandbox });
  const context = await browser.createBrowserContext();
  const closeContext = () => context.close().catch(() => {});
  signal?.addEventListener("abort", closeContext, { once: true });

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(options.navigationTimeoutMs);

    let navigationBlocked = false;
    await guardRequests(page, {
      isAllowedHost,
      onBlockedNavigation: () => {
        navigationBlocked = true;
      },
    });

    onStatus("loading");
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
    } catch (error) {
      signal?.throwIfAborted();
      if (navigationBlocked) {
        throw new UnsafeUrlError("The page redirected to a local or private address, so the scan was stopped.");
      }
      throw new ScanError(describeNavigationError(error), { cause: error });
    }

    // Client-rendered sites (React, Vue…) fill <body> only after their
    // scripts and API calls finish.
    await page.waitForNetworkIdle(NETWORK_IDLE).catch(() => {});

    onStatus("scrolling");
    const seen = new Set();
    let lastHeight = -1;
    let stableSteps = 0;

    for (let step = 0; step < options.maxScrollSteps; step += 1) {
      signal?.throwIfAborted();

      const fresh = findNewMatches(await collectTextLines(page), keyword, seen, options.maxMatches);
      if (fresh.length > 0) {
        onMatches(fresh, seen.size);
      }
      if (seen.size >= options.maxMatches) {
        return { total: seen.size, truncated: true };
      }

      const height = await scrollToBottom(page);
      await delay(options.scrollDelayMs);
      await page.waitForNetworkIdle(NETWORK_IDLE).catch(() => {});

      // Stop only after the height stays the same for a few rounds in a row:
      // a single unchanged round often just means the next batch is slow.
      stableSteps = height === lastHeight ? stableSteps + 1 : 0;
      if (stableSteps >= options.stableStepsToStop) {
        break;
      }
      lastHeight = height;
    }

    // One last read for content that loaded during the final wait.
    const fresh = findNewMatches(await collectTextLines(page), keyword, seen, options.maxMatches);
    if (fresh.length > 0) {
      onMatches(fresh, seen.size);
    }

    return { total: seen.size, truncated: seen.size >= options.maxMatches };
  } catch (error) {
    // Closing the context makes in-flight Puppeteer calls fail with
    // "Target closed"; report the real reason instead.
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener("abort", closeContext);
    await closeContext();
  }
}
