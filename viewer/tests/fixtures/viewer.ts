import { mock } from "bun:test";
import { FakeT3 } from "./t3";
const runtimeExports = { ...await import("../../server/agents/runtime") };
const runtime = new FakeT3();
mock.module("../../server/agents/runtime", () => ({
  ...runtimeExports,
  T3Runtime: { connect: async () => runtime },
  localT3Origin: (url: string) => url,
  t3Descriptor: async () => ({ environmentId: "browser-fixture", label: "Test T3" }),
}));
const { db } = await import("../../server/db");
const config = (await import("../../server/index")).default;
// Provider tool calls use the same HTTP MCP route without requiring a second server.
runtime.mcpFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  Promise.resolve(config.fetch(new Request(input, init)))) as typeof fetch;
db.run("INSERT OR REPLACE INTO t3_connection VALUES (1, 'http://127.0.0.1:5733', 'test-cookie', 'browser-fixture')");
Bun.serve(config);
