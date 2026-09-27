const { join } = require("node:path");

/**
 * Keep the Chrome that Puppeteer downloads inside the project folder.
 * Hosts like Render run `npm ci` in a build step and only ship the project
 * directory to the running service, so the default ~/.cache location would be
 * lost and scans would fail with "Could not find Chrome".
 *
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  cacheDirectory: join(__dirname, ".cache", "puppeteer"),
};
