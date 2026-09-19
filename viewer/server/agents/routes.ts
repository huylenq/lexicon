import { agentSessions } from "../agent-sessions";
import { conversationKey } from "../model-service";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AgentProject } from "../model-service";
import { agents } from "./service";
import { AgentStateStream } from "./state-stream";
import { agentDrafts } from "./drafts";

export function installAgentRuntimeRoutes(app: Hono, project: (id: string) => Promise<AgentProject>) {
  app.get("/api/projects/:id/agent/sessions", async c => {
    const p = agentSessions.scope(await project(c.req.param("id")), c.req.query("agent"));
    return c.json(agents.sessions(conversationKey(p)));
  });
  app.get("/api/projects/:id/agent/state", async c => {
    const p = agentSessions.scope(await project(c.req.param("id")), c.req.query("agent"));
    let state = agents.state(conversationKey(p));
    const unsubscribe = await agents.subscribe(p, next => { state = next; });
    unsubscribe();
    return c.json(state);
  });
  app.get("/api/projects/:id/agent/diff", async c => c.json(await agents.diff(agentSessions.scope(await project(c.req.param("id")), c.req.query("agent")))));
  app.get("/api/projects/:id/agent/draft-source", async c => {
    const query = c.req.query(), { draftId, itemId, side, linkIndex } = query;
    if (Object.keys(query).some(key => !["agent", "draftId", "itemId", "side", "linkIndex"].includes(key)) || !draftId || !itemId || !["before", "after"].includes(side) || !/^\d+$/.test(linkIndex || ""))
      return c.json({ error: "Select a source link from the current model delta." }, 400);
    const p = agentSessions.scope(await project(c.req.param("id")), query.agent);
    return c.json(await agentDrafts.source(p, draftId, itemId, side as "before" | "after", Number(linkIndex)));
  });
  app.get("/api/projects/:id/agent/events", async c => {
    const p = agentSessions.scope(await project(c.req.param("id")), c.req.query("agent"));
    return streamSSE(c, async stream => {
      let finish!: () => void;
      const done = new Promise<void>(resolve => { finish = resolve; });
      stream.onAbort(() => finish());
      const output = new AgentStateStream((event, data) => stream.writeSSE({ event, data }), finish);
      let unsubscribe = () => {}, heartbeat: ReturnType<typeof setInterval> | undefined;
      try {
        unsubscribe = await agents.subscribe(p, state => output.push(state));
        heartbeat = setInterval(() => { void output.ping(); }, 5000);
        await done;
      } finally { output.close(); clearInterval(heartbeat); unsubscribe(); }
    });
  });
  app.post("/api/projects/:id/agent/open", async c => {
    if (!c.req.header("content-type")?.startsWith("application/json")) return c.json({ error: "JSON required." }, 415);
    const p = agentSessions.scope(await project(c.req.param("id")), c.req.query("agent"));
    return c.json(await agents.openInT3(p, c.req.raw.signal));
  });
  app.post("/api/projects/:id/agent/:action", async c => {
    if (!c.req.header("content-type")?.startsWith("application/json")) return c.json({ error: "JSON required." }, 415);
    return c.json(await agents.action(agentSessions.scope(await project(c.req.param("id")), c.req.query("agent")), c.req.param("action"), await c.req.json()));
  });
}
