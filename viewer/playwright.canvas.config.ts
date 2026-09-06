import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.prototype.ts",
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:5395",
    viewport: { width: 1600, height: 1000 },
    channel: process.env.PLAYWRIGHT_CHANNEL || "chromium",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run dev:canvas",
    env: { LEXICON_VIEWER_API_PORT: "5396", LEXICON_CANVAS_PORT: "5395", LEXICON_VIEWER_DB: ":memory:" },
    url: "http://127.0.0.1:5395/api/health",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
