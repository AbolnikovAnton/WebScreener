import puppeteer from "puppeteer";

// Starting Chrome takes about a second and ~100 MB, so one browser is shared
// by all scans. Each scan gets its own isolated BrowserContext (separate
// cookies, storage and cache) instead.
let browserPromise = null;

const CLOSE_TIMEOUT_MS = 3000;

export function getBrowser({ noSandbox = false } = {}) {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: true,
        args: noSandbox ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
      })
      .then((browser) => {
        // If Chrome crashes, the next scan launches a fresh one.
        browser.on("disconnected", () => {
          browserPromise = null;
        });
        return browser;
      })
      .catch((error) => {
        browserPromise = null;
        throw error;
      });
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (!browserPromise) {
    return;
  }
  const pending = browserPromise;
  browserPromise = null;
  let browser;
  try {
    browser = await pending;
  } catch {
    return; // Never started.
  }

  // browser.close() can hang on Windows even after Chrome has exited, which
  // would block shutdown forever. Give it a moment, then make sure.
  let timer;
  const gaveUp = new Promise((resolve) => {
    timer = setTimeout(resolve, CLOSE_TIMEOUT_MS);
  });
  await Promise.race([browser.close().catch(() => {}), gaveUp]);
  clearTimeout(timer);
  browser.process()?.kill("SIGKILL");
  browser.disconnect().catch(() => {});
}
