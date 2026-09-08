import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
const agentFixture = fileURLToPath(
  new URL("./tests/fixtures/agent.ts", import.meta.url),
);
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.browser.ts",
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:5384",
    viewport: { width: 1600, height: 1000 },
    channel: process.env.PLAYWRIGHT_CHANNEL || "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run build:client && bun run server/index.ts",
    env: {
      LEXICON_VIEWER_API_PORT: "5384",
      LEXICON_VIEWER_DB: ":memory:",
      LEXICON_CODEX_BIN: agentFixture,
      LEXICON_GROK_BIN: agentFixture,
      LEXICON_CLAUDE_BIN: agentFixture,
      LEXICON_PI_BIN: `${agentFixture} acp --acp-owner pi-owned`,
      LEXICON_OMP_BIN: `${agentFixture} acp --acp-owner omp-owned`,
      LEXICON_HERMES_BIN: `${agentFixture} acp --acp-owner hermes-owned`,
    },
    url: "http://127.0.0.1:5384/api/health",
    reuseExistingServer: false,
  },
});
