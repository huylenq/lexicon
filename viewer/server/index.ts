import { agentSessions } from "./agent-sessions";
import { modelDocuments } from "./model-documents";
import { modelEdits } from "./model-service";
import { agents } from "./agents/service";
import { installUserSettingsRoutes } from "./user-settings-routes";
import { readProjectSettings, writeProjectSettings } from "./settings";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute, join, basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dbPath, projects } from "./db";
import * as log from "./log";
import { loadModel, readModelDocument } from "./model";
import { readSource, readSourceMetadata } from "./source";
import { readProjectFiles, readProjectFile } from "./files";
import type { Project } from "../shared/model";
import { MODEL_SCHEMA, codeTargetId } from "../shared/model";
import { modelOrEmpty, readXml, fingerprint } from "./model-edit";
import { CanvasError, validateCanvas, readCanvas, saveCanvas, recoverCanvas, saveCanvasAsset, readCanvasAsset } from "./canvas";
import { MAX_CANVAS_BYTES, MAX_ASSET_BYTES } from "../shared/canvas";
import { installAgentRuntimeRoutes } from "./agents/routes";
import { installAgentRoutes } from "./agent/routes";

const exec = promisify(execFile);
const repository = resolve(import.meta.dir, "../..");
const examplesRoot = process.env.LEXICON_EXAMPLES_ROOT || resolve(repository, "examples");
const examples = [
  {
    id: "shop", name: "Shop · Domain, architecture, and flows",
    root: resolve(examplesRoot, "shop"),
    artifactRoot: resolve(examplesRoot, "shop"), example: true,
  },
  ...((process.env.LEXICON_CANVAS_WORKSHOP || process.env.LEXICON_CANVAS_PROTOTYPE) === "1" ? [{
    id: "canvas-workshop",
    name: "Checkout · Canvas workshop",
    root: resolve(examplesRoot, "canvas-workshop"),
    artifactRoot: resolve(examplesRoot, "canvas-workshop"),
    example: true,
  }] : []),
];
export async function artifactRoot(root: string): Promise<string> {
  for (const name of ["model.xml", "system.xml"])
    if (await stat(join(root, "lexicon", name)).catch(() => null)) return root;
  try {
    const { stdout } = await exec("git", ["worktree", "list", "--porcelain"], {
      cwd: root,
      timeout: 3000,
    });
    return (
      stdout
        .split("\n")
        .find((l) => l.startsWith("worktree "))
        ?.slice(9) || root
    );
  } catch {
    return root;
  }
}
async function codeRoot(root: string, artifacts: string): Promise<string> {
  if (root === artifacts) return root;
  try {
    return (
      await exec("git", ["rev-parse", "--show-toplevel"], {
        cwd: root,
        timeout: 3000,
      })
    ).stdout.trim();
  } catch {
    return root;
  }
}
function project(id: string) {
  const sample = examples.find((p) => p.id === id);
  if (sample) return sample;
  if (!/^\d+$/.test(id)) return null;
  const row = projects.get(Number(id));
  return (
    row && {
      id: String(row.id),
      name: row.name,
      root: row.root_path,
      artifactRoot: null,
      example: false,
    }
  );
}
export const app = new Hono();
app.use("/api/*", async (c, next) => {
  const desktopToken = process.env.LEXICON_DESKTOP_TOKEN;
  if (desktopToken && c.req.header("x-lexicon-desktop-token") !== desktopToken && !(c.req.path === "/api/agent/mcp/turn" && agents.delivery.accepts(c.req.header("authorization")?.replace(/^Bearer /, "") || "")))
    return c.json({ error: "Desktop session required." }, 403);
  const local = (host: string) =>
    ["localhost", "127.0.0.1", "[::1]"].includes(host);
  if (!local(new URL(c.req.url).hostname))
    return c.json({ error: "Local requests only." }, 403);
  const origin = c.req.header("origin");
  if (origin && !local(new URL(origin).hostname))
    return c.json({ error: "Local requests only." }, 403);
  await next();
});
app.use("/api/*", async (c, next) => {
  const started = performance.now();
  await next();
  if (c.req.path === "/api/health" || c.req.path.includes("/events")) return;
  const ms = Math.round(performance.now() - started);
  log.debug("http", { msg: "request", method: c.req.method, path: c.req.path, status: c.res.status, ms });
  if (ms > 500) log.warn("http", { msg: "slow", method: c.req.method, path: c.req.path, ms });
});
app.onError((error, c) => {
  log.error("http", { msg: "failed", method: c.req.method, path: c.req.path, error: error.message, status: error instanceof CanvasError ? error.status : 400 });
  return c.json({ error: error.message }, error instanceof CanvasError ? error.status : 400);
});
installUserSettingsRoutes(app, agents);
app.get("/api/health", (c) => c.json({ ok: true, model: MODEL_SCHEMA }));
app.get("/api/projects", (c) =>
  c.json([
    ...examples.map(({ artifactRoot, ...p }) => p),
    ...projects.list().map(
      (p) =>
        ({
          id: String(p.id),
          name: p.name,
          root: p.root_path,
        }) satisfies Project,
    ),
  ]),
);
app.post("/api/projects", async (c) => {
  const body = await c.req.json();
  if (typeof body.root !== "string" || !isAbsolute(body.root))
    return c.json({ error: "Enter an absolute project folder." }, 400);
  const root = await realpath(body.root);
  if (!(await stat(root)).isDirectory())
    return c.json({ error: "Choose a project folder." }, 400);
  const document = await readModelDocument(await artifactRoot(root));
  if (projects.list().some((p) => p.root_path === root))
    return c.json({ error: "This project is already in your library." }, 409);
  const p = projects.add(document.model?.name || basename(root), root);
  return c.json({ id: String(p.id), name: p.name, root: p.root_path });
});
app.delete("/api/projects/:id", async (c) => {
  const p = project(c.req.param("id"));
  if (!p) return c.json({ error: "Project not found." }, 404);
  if (p.example)
    return c.json({ error: "Built-in examples stay in the library." }, 400);
  if (modelEdits.workingOn(await realpath(await artifactRoot(p.root))) || await agents.workingOn({ ...p, artifactRoot: await artifactRoot(p.root), example: !!p.example }))
    return c.json(
      { error: "Stop the project’s agents before removing it." },
      409,
    );
  projects.remove(Number(p.id));
  return c.json({ ok: true });
});
app.get("/api/projects/:id/model/revision", async c => {
  const p = project(c.req.param("id"));
  if (!p) return c.json({ error: "Project not found." }, 404);
  c.header("Cache-Control", "no-store");
  const root = p.artifactRoot || await artifactRoot(p.root);
  return c.json({ modelRevision: await modelDocuments.revision(root) });
});
app.get("/api/projects/:id/model", async (c) => {
  const p = project(c.req.param("id"));
  if (!p) return c.json({ error: "Project not found." }, 404);
  const root = p.artifactRoot || (await artifactRoot(p.root));
  const { document, revision } = await modelDocuments.read(root);
  const name = document.model?.name || p.name;
  if (!p.example) {
    projects.touch(Number(p.id));
    if (p.name !== name) projects.rename(Number(p.id), name);
  }
  return c.json({
    project: { id: p.id, name, root: p.root, example: p.example },
    ...document,
    modelRevision: revision,
    artifactRoot: root,
  });
});
async function canvasProject(id: string) {
  const p = project(id);
  if (!p) throw new CanvasError("Project not found.");
  const root = p.artifactRoot || await artifactRoot(p.root);
  return { root, modelId: (await modelOrEmpty(root)).id };
}
app.get("/api/projects/:id/canvas", async (c) => {
  const { root, modelId } = await canvasProject(c.req.param("id"));
  c.header("Cache-Control", "no-store");
  return c.json(await readCanvas(root, modelId));
});
app.put("/api/projects/:id/canvas", async (c) => {
  if (!c.req.header("content-type")?.startsWith("application/json")) return c.json({ error: "JSON request required." }, 415);
  const text = await c.req.text();
  if (Buffer.byteLength(text) > MAX_CANVAS_BYTES) throw new CanvasError("Canvas is larger than 20 MB.", 413);
  const { root, modelId } = await canvasProject(c.req.param("id")), body = JSON.parse(text);
  return c.json(await saveCanvas(root, modelId, body.revision, body.document));
});
app.post("/api/projects/:id/canvas/validate", async (c) => {
  if (!c.req.header("Content-Type")?.includes("application/json")) return c.json({ error: "JSON is required." }, 400);
  const text = await c.req.text();
  if (Buffer.byteLength(text) > MAX_CANVAS_BYTES) throw new CanvasError("Canvas files must be smaller than 20 MB.", 413);
  const { modelId } = await canvasProject(c.req.param("id"));
  return c.json(validateCanvas(JSON.parse(text), modelId));
});
app.post("/api/projects/:id/canvas/recover", async (c) => {
  if (!c.req.header("content-type")?.startsWith("application/json")) return c.json({ error: "JSON request required." }, 415);
  const { root, modelId } = await canvasProject(c.req.param("id"));
  return c.json(await recoverCanvas(root, modelId, (await c.req.json()).revision));
});
app.post("/api/projects/:id/canvas/assets", async (c) => {
  const { root } = await canvasProject(c.req.param("id"));
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length > MAX_ASSET_BYTES) throw new CanvasError("Canvas media is larger than 25 MB.", 413);
  return c.json(await saveCanvasAsset(root, c.req.header("content-type")?.split(";")[0] || "", bytes));
});
app.get("/api/projects/:id/canvas/assets/:name", async (c) => {
  const { root } = await canvasProject(c.req.param("id"));
  try {
    const asset = await readCanvasAsset(root, c.req.param("name"));
    return new Response(asset.bytes, { headers: { "Content-Type": asset.type, "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'", "Cache-Control": "private, max-age=31536000, immutable" } });
  } catch (e) { return c.json({ error: `Canvas media unavailable: ${(e as Error).message}` }, 404); }
});
async function agentProject(id: string) {
  const p = project(id);
  if (!p) throw new Error("Project not found.");
  const artifacts = p.artifactRoot || (await artifactRoot(p.root));
  return {
    id: p.id,
    root: p.example ? p.root : await codeRoot(p.root, artifacts),
    artifactRoot: artifacts,
    example: p.example,
  };
}
installAgentRuntimeRoutes(app, agentProject);
app.get("/api/projects/:id/agents", async c => {
  const p = await agentProject(c.req.param("id"));
  return c.json(await agents.listTasks(p));
});
app.post("/api/projects/:id/agents", async c => {
  if (!c.req.header("content-type")?.startsWith("application/json")) return c.json({ error: "JSON required." }, 415);
  const p = await agentProject(c.req.param("id"));
  return c.json(await agentSessions.assign(p, await c.req.json()), 201);
});
app.get("/api/projects/:id/model/history", async c => {
  const p = await agentProject(c.req.param("id"));
  return c.json(modelEdits.state(p.id));
});
app.post("/api/projects/:id/canvas/model-command", async c => {
  if (!c.req.header("content-type")?.startsWith("application/json")) return c.json({ error: "JSON request required." }, 415);
  return c.json(await modelEdits.canvasCommand(await agentProject(c.req.param("id")), await c.req.json()));
});
app.post("/api/projects/:id/model/undo", async c => {
  const p = await agentProject(c.req.param("id")), body = await c.req.json();
  await modelEdits.undo(p, body.changeId);
  return c.json(modelEdits.state(p.id));
});
app.get("/api/projects/:id/settings", async (c) => {
  const p = project(c.req.param("id"));
  if (!p) return c.json({ error: "Project not found." }, 404);
  return c.json(readProjectSettings(p.artifactRoot || await artifactRoot(p.root)));
});
app.put("/api/projects/:id/settings", async (c) => {
  const p = project(c.req.param("id"));
  if (!p) return c.json({ error: "Project not found." }, 404);
  if (p.example) return c.json({ error: "Example settings are read-only." }, 400);
  if (!c.req.header("content-type")?.includes("application/json")) return c.json({ error: "JSON request required." }, 415);
  try { return c.json(await writeProjectSettings(await artifactRoot(p.root), await c.req.json())); }
  catch (error) { return c.json({ error: (error as Error).message }, 400); }
});
for (const path of ["/api/projects/:id/files", "/api/projects/:id/repository"] as const) app.get(path, async (c) => {
  if (!project(c.req.param("id"))) return c.json({ error: "Project not found." }, 404);
  const p = await agentProject(c.req.param("id"));
  return c.json(await readProjectFiles(p.root, c.req.query("refresh") === "1", p.artifactRoot));
});
for (const path of ["/api/projects/:id/files/file", "/api/projects/:id/repository/file"] as const) app.get(path, async (c) => {
  if (!project(c.req.param("id"))) return c.json({ error: "Project not found." }, 404);
  const p = await agentProject(c.req.param("id"));
  try { return c.json(await readProjectFile(p.root, c.req.query("file") || "", p.artifactRoot)); }
  catch (error) { return c.json({ error: (error as Error).message }, 400); }
});
app.get("/api/projects/:id/source-metadata", async (c) => {
  const p = project(c.req.param("id"));
  if (!p) return c.json({ error: "Project not found." }, 404);
  const artifacts = p.artifactRoot || (await artifactRoot(p.root));
  const model = await loadModel(artifacts);
  return c.json(await readSourceMetadata(p.example ? p.root : await codeRoot(p.root, artifacts), model.items.flatMap(item => item.codeLinks)));
});
app.get("/api/projects/:id/code", async (c) => {
  const p = project(c.req.param("id"));
  if (!p) return c.json({ error: "Project not found." }, 404);
  const artifacts = p.artifactRoot || (await artifactRoot(p.root));
  const model = await loadModel(artifacts);
  const item = model.items.find((i) => i.id === c.req.query("owner"));
  const index = Number(c.req.query("index"));
  const target = c.req.query("target");
  const link = target
    ? model.items
        .flatMap((i) => i.codeLinks)
        .find((l) => codeTargetId(l) === target)
    : Number.isInteger(index) && index >= 0
      ? item?.codeLinks[index]
      : undefined;
  if (!link) return c.json({ error: "Code link not found." }, 404);
  return c.json(
    await readSource(
      p.example ? p.root : await codeRoot(p.root, artifacts),
      link,
    ),
  );
});
agents.connectOperations(installAgentRoutes(app, agentProject, () => [
  ...examples.map(({ artifactRoot, ...p }) => p),
  ...projects.list().map(p => ({ id: String(p.id), name: p.name, root: p.root_path })),
], agents.delivery));
app.all("/api/*", (c) => c.json({ error: "Endpoint not found." }, 404));
const dist = resolve(import.meta.dir, "../client/dist");
app.get("*", serveStatic({ root: relative(process.cwd(), dist) || "." }));
app.get("*", async (c) => {
  try {
    return c.html(await readFile(join(dist, "index.html"), "utf8"));
  } catch {
    return c.text(
      "Build the reader with bun run build:client, or start bun run dev:client.",
      404,
    );
  }
});
const port = Number(process.env.LEXICON_VIEWER_API_PORT || 5374);
if (import.meta.main) {
  log.info("server", { msg: "listen", port, db: dbPath });
  const shutdown = async () => {
    log.info("server", { msg: "stop" });
    await agents.dispose();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
export default {
  hostname: "127.0.0.1",
  port,
  idleTimeout: 60,
  maxRequestBodySize: 30 * 1024 * 1024,
  fetch: app.fetch,
};
