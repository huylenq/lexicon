import { defineConfig } from "@playwright/test";
const port = process.env.LEXICON_BROWSER_PORT || process.env.LEXICON_TEST_PORT || "5384";
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.browser.ts",
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL,
    viewport: { width: 1600, height: 1000 },
    channel: process.env.PLAYWRIGHT_CHANNEL || "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run build:client && bun run tests/fixtures/viewer.ts",
    env: {
      LEXICON_VIEWER_API_PORT: port,
      LEXICON_VIEWER_DB: ":memory:",
    },
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
  },
});
