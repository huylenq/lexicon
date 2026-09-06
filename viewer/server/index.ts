import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { projects } from "./db";
import { loadModel, parseModel } from "./model";
import { readCode } from "./code";
import type { Project } from "../shared/model";
import { codeTargetId } from "../shared/model";
import { streamSSE } from "hono/streaming";
import { chat } from "./chat/service";
import { modelOrEmpty, readXml, fingerprint } from "./chat/model-edit";
import { probeProviders, listModels } from "./chat/providers";
import { providers, type Provider } from "../shared/chat";
import { stopOwnedAgents } from "./chat/process";

const exec = promisify(execFile);
const repository = resolve(import.meta.dir, "../..");
const examples = [
  ...(process.env.LEXICON_CANVAS_PROTOTYPE === "1" ? [{
    id: "canvas-workshop",
    name: "Checkout · Canvas workshop",
    root: resolve(import.meta.dir, "../examples/canvas-workshop"),
    artifactRoot: resolve(import.meta.dir, "../examples/canvas-workshop"),
    example: true,
  }] : []),
  {
    id: "dentalml",
    name: "DentalML · Canal measurement",
    root: resolve(repository, "../dentalml"),
    artifactRoot: resolve(import.meta.dir, "../examples/dentalml"),
    example: true,
  },
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
  const local = (host: string) =>
    ["localhost", "127.0.0.1", "[::1]"].includes(host);
  if (!local(new URL(c.req.url).hostname))
    return c.json({ error: "Local requests only." }, 403);
  const origin = c.req.header("origin");
  if (origin && !local(new URL(origin).hostname))
    return c.json({ error: "Local requests only." }, 403);
  await next();
});
app.onError((error, c) => c.json({ error: error.message }, 400));
app.get("/api/health", (c) => c.json({ ok: true, model: "2.0" }));
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
  const model = await modelOrEmpty(await artifactRoot(root));
  if (projects.list().some((p) => p.root_path === root))
    return c.json({ error: "This project is already in your library." }, 409);
  const p = projects.add(model.name, root);
  return c.json({ id: String(p.id), name: p.name, root: p.root_path });
});
app.delete("/api/projects/:id", (c) => {
  const p = project(c.req.param("id"));
  if (!p) return c.json({ error: "Project not found." }, 404);
  if (p.example)
    return c.json({ error: "Built-in examples stay in the library." }, 400);
  if (chat.state(p.id).running)
    return c.json(
      { error: "Stop the project conversation before removing it." },
      409,
    );
  projects.remove(Number(p.id));
  return c.json({ ok: true });
});
app.get("/api/projects/:id/model", async (c) => {
  const p = project(c.req.param("id"));
  if (!p) return c.json({ error: "Project not found." }, 404);
  const root = p.artifactRoot || (await artifactRoot(p.root));
  const xml = await readXml(root);
  const model = xml === null ? await modelOrEmpty(root) : parseModel(xml);
  if (!p.example) {
    projects.touch(Number(p.id));
    if (p.name !== model.name) projects.rename(Number(p.id), model.name);
  }
  return c.json({
    project: { id: p.id, name: model.name, root: p.root, example: p.example },
    model,
    modelRevision: fingerprint(xml),
    artifactRoot: root,
  });
});
app.get("/api/providers", async (c) => c.json(await probeProviders()));
app.get("/api/providers/:id/models", async (c) => {
  const id = c.req.param("id") as Provider;
  if (!providers.includes(id)) return c.json({ error: "Unknown coding agent." }, 404);
  try { return c.json(await listModels(id)); }
  catch (error) { return c.json({ error: (error as Error).message }, 503); }
});
async function chatProject(id: string) {
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
app.get("/api/projects/:id/chat", (c) => {
  if (!project(c.req.param("id")))
    return c.json({ error: "Project not found." }, 404);
  return c.json(chat.state(c.req.param("id")));
});
app.get("/api/projects/:id/chat/events", (c) => {
  const id = c.req.param("id");
  if (!project(id)) return c.json({ error: "Project not found." }, 404);
  return streamSSE(c, async (stream) => {
    let ended = false;
    let finish!: () => void;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const unsubscribe = chat.subscribe(id, (state) => {
      if (!ended)
        void stream
          .writeSSE({ event: "state", data: JSON.stringify(state) })
          .catch(() => finish());
    });
    const heartbeat = setInterval(() => {
      if (!ended)
        void stream
          .writeSSE({ event: "ping", data: "{}" })
          .catch(() => finish());
    }, 5000);
    stream.onAbort(finish);
    await done;
    ended = true;
    clearInterval(heartbeat);
    unsubscribe();
  });
});
app.post("/api/projects/:id/chat/:action", async (c) => {
  if (!c.req.header("content-type")?.startsWith("application/json"))
    return c.json({ error: "JSON request required." }, 415);
  const p = await chatProject(c.req.param("id"));
  const action = c.req.param("action");
  const body = await c.req.json();
  if (action === "send") return c.json(await chat.start(p, body));
  if (action === "stop") chat.stop(p.id);
  else if (action === "undo") await chat.undo(p);
  else if (action === "reset") chat.reset(p.id);
  else if (action === "answer") chat.answer(p.id, body.requestId, body.answers);
  else return c.json({ error: "Unknown conversation action." }, 404);
  return c.json(chat.state(p.id));
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
    await readCode(
      p.example ? p.root : await codeRoot(p.root, artifacts),
      link,
    ),
  );
});
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
  const shutdown = async () => {
    chat.stopAll();
    await stopOwnedAgents();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
export default {
  hostname: "127.0.0.1",
  port,
  idleTimeout: 60,
  fetch: app.fetch,
};
