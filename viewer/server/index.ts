import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { readFile, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute, join } from "node:path";
import { projects } from "./db.ts";
import { loadLexicon, invalidateCache } from "./loader.ts";

const app = new Hono();

app.get("/api/health", c => c.json({ ok: true }));

app.get("/api/projects", c => c.json(projects.list()));

app.post("/api/projects", async c => {
  const body = await c.req.json().catch(() => ({}));
  const rootPath = (body.rootPath ?? "").toString().trim();
  const name = (body.name ?? "").toString().trim();
  if (!rootPath) return c.json({ error: "rootPath required" }, 400);
  if (!isAbsolute(rootPath)) return c.json({ error: "rootPath must be absolute" }, 400);
  let s;
  try { s = await stat(rootPath); } catch { return c.json({ error: "path does not exist" }, 400); }
  if (!s.isDirectory()) return c.json({ error: "rootPath must be a directory" }, 400);
  try {
    const finalName = name || rootPath.split("/").filter(Boolean).slice(-1)[0] || rootPath;
    const row = projects.add(finalName, rootPath);
    return c.json(row);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

app.delete("/api/projects/:id", c => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  const p = projects.get(id);
  if (p) invalidateCache(p.root_path);
  projects.remove(id);
  return c.json({ ok: true });
});

app.get("/api/projects/:id/lexicon", async c => {
  const id = Number(c.req.param("id"));
  const p = projects.get(id);
  if (!p) return c.json({ error: "not found" }, 404);
  projects.touch(id);
  const refresh = c.req.query("refresh") === "1";
  if (refresh) invalidateCache();
  const graph = await loadLexicon(p.root_path);
  return c.json({ project: p, graph });
});

// Read a file inside project root for Monaco peek.
// Clamps the resolved path to the project root to avoid escape.
app.get("/api/projects/:id/file", async c => {
  const id = Number(c.req.param("id"));
  const p = projects.get(id);
  if (!p) return c.json({ error: "not found" }, 404);
  const reqPath = c.req.query("path");
  if (!reqPath) return c.json({ error: "path required" }, 400);
  const root = resolve(p.root_path);
  const full = resolve(join(root, reqPath));
  const rel = relative(root, full);
  if (rel.startsWith("..") || isAbsolute(rel)) return c.json({ error: "path escape" }, 400);
  try {
    const text = await readFile(full, "utf8");
    return c.json({ path: rel, text });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 404);
  }
});

// Serve built client.
const CLIENT_DIST = resolve(import.meta.dir, "..", "client", "dist");
app.get(
  "*",
  serveStatic({
    root: relative(process.cwd(), CLIENT_DIST) || ".",
    rewriteRequestPath: path => (path === "/" ? "/index.html" : path),
  }),
);
// SPA fallback
app.notFound(async c => {
  try {
    const html = await readFile(join(CLIENT_DIST, "index.html"), "utf8");
    return c.html(html);
  } catch {
    return c.text("client not built — run `bun run build:client`", 404);
  }
});

const port = Number(process.env.PORT ?? 8787);
console.log(`lexicon-viewer api on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
