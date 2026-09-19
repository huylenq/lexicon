import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AgentConnection } from "../shared/agent-runtime";
import type { T3PairingInput, UserSettings } from "../shared/user-settings";

interface Connections {
  connectionState(): Promise<AgentConnection>;
  pair(input: T3PairingInput): Promise<AgentConnection>;
  disconnect(): Promise<void>;
}
export function installUserSettingsRoutes(app: Hono, connections: Connections) {
  let revision = Date.now();
  let mutation: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const read = async (): Promise<UserSettings> => {
    const before = revision;
    const t3 = await connections.connectionState();
    // A slow health check cannot publish the connection from before a change.
    return before === revision ? { revision, connections: { t3 } } : read();
  };
  const change = <T,>(action: () => Promise<T>) => {
    const next = mutation.then(async () => {
      await action(); revision++;
      for (const listener of listeners) listener();
      return read();
    });
    mutation = next.catch(() => {});
    return next;
  };
  app.get("/api/settings", async c => c.json(await read()));
  app.post("/api/settings/connections/t3", async c => {
    if (!c.req.header("content-type")?.startsWith("application/json")) return c.json({ error: "JSON required." }, 415);
    const input = await c.req.json();
    if (!input || typeof input.url !== "string" || typeof input.credential !== "string") return c.json({ error: "Server address and pairing token required." }, 400);
    return c.json(await change(() => connections.pair(input)));
  });
  app.delete("/api/settings/connections/t3", async c => c.json(await change(() => connections.disconnect())));
  app.get("/api/settings/events", c => streamSSE(c, async stream => {
    let finish!: () => void;
    const done = new Promise<void>(resolve => { finish = resolve; });
    const notify = () => { void stream.writeSSE({ event: "settings", data: JSON.stringify({ revision }) }).catch(finish); };
    stream.onAbort(finish);
    listeners.add(notify);
    notify();
    const heartbeat = setInterval(() => { void stream.writeSSE({ event: "ping", data: "{}" }).catch(finish); }, 5000);
    try { await done; } finally { clearInterval(heartbeat); listeners.delete(notify); }
  }));
}
