import { createAgentOperations } from "./operations";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Project } from "../../shared/model";
import { chat, type ChatProject } from "../chat/service";
import { fingerprint, readXml } from "../chat/model-edit";
import { only, record, text } from "./edit";
import { readViewerState } from "./sessions";
import { agentTools } from "./tools";

export function installAgentRoutes(app: Hono, resolveProject: (id: string) => Promise<ChatProject>, listProjects: () => Project[]) {
  const operations = createAgentOperations(chat, resolveProject, listProjects);
  const { sessions } = operations;
  chat.connectOperations(operations);
  app.use("/api/agent/*", async (c, next) => {
    if (["POST", "PUT"].includes(c.req.method)) {
      if (!c.req.header("content-type")?.startsWith("application/json")) return c.json({ error: "JSON request required." }, 415);
      if ((await c.req.text()).length > 128_000) return c.json({ error: "Agent request is too large." }, 413);
    }
    await next();
  });
  app.get("/api/agent/tools", c => c.json(agentTools));
  app.post("/api/agent/tools/:name", async c => c.json(await operations.execute(c.req.param("name"), await c.req.json())));
  app.post("/api/agent/projects/:id/sessions", async c => {
    const project = await resolveProject(c.req.param("id"));
    return c.json(sessions.create(project.id, readViewerState(await c.req.json())));
  });
  app.put("/api/agent/projects/:id/sessions/:session", c => c.req.json().then(body => c.json(sessions.update(c.req.param("id"), c.req.param("session"), readViewerState(body)))));
  app.delete("/api/agent/projects/:id/sessions/:session", c => {
    sessions.close(c.req.param("id"), c.req.param("session"));
    return c.json({ ok: true });
  });
  app.post("/api/agent/projects/:id/sessions/:session/ack", async c => {
    const body = record(await c.req.json());
    only(body, ["operationId", "state", "error"]);
    sessions.acknowledge(c.req.param("id"), c.req.param("session"), text(body.operationId, "operation ID"), readViewerState(body.state), body.error === undefined ? undefined : text(body.error, "error"));
    return c.json({ ok: true });
  });
  app.get("/api/agent/projects/:id/sessions/:session/events", async c => {
    const project = await resolveProject(c.req.param("id")), id = c.req.param("session");
    if (!sessions.list(project.id).some(s => s.id === id && !s.connected)) throw new Error("Viewer session unavailable or already connected.");
    return streamSSE(c, async stream => {
      let finish!: () => void, ended = false, checking = false;
      const done = new Promise<void>(resolve => { finish = resolve; });
      const stop = sessions.connect(project.id, id, message => {
        if (!ended) void stream.writeSSE({ event: "message", data: JSON.stringify(message) }).catch(finish);
      });
      const check = async () => {
        if (checking || ended) return;
        checking = true;
        try {
          sessions.modelChanged(project.id, fingerprint(await readXml(project.artifactRoot)));
          await stream.writeSSE({ event: "ping", data: "{}" });
        } catch { finish(); }
        finally { checking = false; }
      };
      const timer = setInterval(() => void check(), 1_000);
      stream.onAbort(finish);
      await check();
      await done;
      ended = true;
      clearInterval(timer);
      stop();
    });
  });
  return sessions;
}
