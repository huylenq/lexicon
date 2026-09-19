import { expect, test } from "bun:test";
import { Hono } from "hono";
import { installUserSettingsRoutes } from "../server/user-settings-routes";
import type { AgentConnection } from "../shared/agent-runtime";

const disconnected = (): AgentConnection => ({ configured: false, connected: false, url: "http://127.0.0.1:5733", models: [] });
function fixture() {
  let current = disconnected();
  let finish: (() => void) | undefined;
  const calls: string[] = [];
  const app = new Hono();
  app.onError((error, c) => c.json({ error: error.message }, 400));
  installUserSettingsRoutes(app, {
    connectionState: async () => ({ ...current }),
    pair: async input => {
      calls.push("pair");
      if (input.credential === "invalid") throw new Error("Pairing failed");
      if (input.credential === "wait") await new Promise<void>(resolve => { finish = resolve; });
      current = { ...disconnected(), url: input.url, configured: true, connected: true, label: "Local T3" };
      return current;
    },
    disconnect: async () => { calls.push("disconnect"); current = disconnected(); },
  });
  return { app, calls, finish: () => finish?.() };
}
const body = (credential: string) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "http://localhost:5733", credential }) });
const endpoint = "/api/settings/connections/t3";
test("user settings are independent of projects, omit pairing input, and survive a failed replacement", async () => {
  const { app } = fixture();
  const initial = await (await app.request("/api/settings")).json();
  expect(initial.connections.t3.configured).toBe(false);
  const saved = await (await app.request(endpoint, body("private-token"))).json();
  expect(saved.revision).toBeGreaterThan(initial.revision);
  expect(saved.connections.t3.connected).toBe(true);
  expect(JSON.stringify(saved)).not.toContain("private-token");
  expect((await app.request(endpoint, body("invalid"))).status).toBe(400);
  expect(await (await app.request("/api/settings")).json()).toEqual(saved);
  const removed = await (await app.request(endpoint, { method: "DELETE" })).json();
  expect(removed.connections.t3.configured).toBe(false);
  expect(removed.revision).toBeGreaterThan(saved.revision);
});
test("malformed pairing requests cannot mutate user configuration", async () => {
  const { app, calls } = fixture();
  expect((await app.request(endpoint, { method: "POST", body: "bad" })).status).toBe(415);
  for (const input of ["{", "null", "[]", "{}", '{"url":12,"credential":"secret"}']) {
    const response = await app.request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: input });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeString();
  }
  expect(calls).toEqual([]);
});
test("disconnect waits for an in-flight pair and cannot be undone by its late completion", async () => {
  const { app, calls, finish } = fixture();
  const pairing = app.request(endpoint, body("wait"));
  for (let i = 0; i < 20 && calls.length === 0; i++) await new Promise(resolve => setTimeout(resolve, 0));
  expect(calls).toEqual(["pair"]);
  const disconnect = app.request(endpoint, { method: "DELETE" });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(calls).toEqual(["pair"]);
  finish();
  expect((await pairing).status).toBe(200);
  expect((await disconnect).status).toBe(200);
  expect(calls).toEqual(["pair", "disconnect"]);
  expect((await (await app.request("/api/settings")).json()).connections.t3.configured).toBe(false);
});
test("settings events notify other clients after a global connection change", async () => {
  const { app } = fixture();
  const abort = new AbortController();
  const response = await app.request("/api/settings/events", { signal: abort.signal });
  const reader = response.body!.getReader();
  const initial = new TextDecoder().decode((await reader.read()).value);
  expect(initial).toContain("event: settings");
  await app.request(endpoint, body("token"));
  const changed = new TextDecoder().decode((await reader.read()).value);
  expect(changed).toContain("event: settings");
  expect(changed).not.toEqual(initial);
  expect(changed).not.toContain("token");
  abort.abort(); await reader.cancel();
});
