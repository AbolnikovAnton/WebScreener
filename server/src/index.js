import { createApp } from "./app.js";
import { closeBrowser } from "./browser.js";
import { loadConfig } from "./config.js";

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}

const config = loadConfig();
const { app, close } = createApp(config);

const server = app.listen(config.port, () => {
  console.log(`Web Screener API listening on http://localhost:${config.port}`);
  if (config.allowPrivateHosts) {
    console.warn("ALLOW_PRIVATE_HOSTS=true: local and private addresses can be scanned. Never enable this in production.");
  }
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down…`);
  close();
  server.close();
  // Open SSE streams would keep server.close() waiting forever.
  server.closeAllConnections();
  await closeBrowser();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
