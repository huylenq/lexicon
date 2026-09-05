import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "hono/bun";
import { readFile, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { projects } from "./db.ts";
import { loadLexicon, invalidateCache } from "./loader.ts";
import { anchorsFromGraph } from "./code-intel.ts";
import { getCodeEdges } from "./call-flow.ts";
import { computeModelHealth } from "./model-health.ts";
import { probeGraphify, loadGraphify, neighborhood, searchNodes, nodeDetail } from "./graphify.ts";
import { subscribe } from "./watch.ts";

const app = new Hono();

const execFileAsync = promisify(execFile);

interface FileCommit {
  hash: string;
  message: string;
  date: string; // ISO
  author: string;
}

// Per (root + sorted file-set) cache for the read-only git-log lookup backing
// the atom dossier. Commits-touching-a-file change rarely relative to a viewer
// session; the cache keeps repeated dossier opens off the git subprocess.
const fileCommitsCache = new Map<string, FileCommit[]>();

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

// Graphify lens (spec: graphify-lens-design.md). Artifact-only: reads
// <root>/graphify-out/graph.json when the user has run the graphify CLI
// themselves; the viewer never runs graphify. Absent → clean not-present, the
// viewer behaves exactly as today. Three read-only endpoints share one
// mtime-cached parse + adjacency index (graphify.ts).

// Probe + summary: presence, counts, relation histogram, staleness, warnings.
app.get("/api/projects/:id/graphify", async c => {
  const id = Number(c.req.param("id"));
  const p = projects.get(id);
  if (!p) return c.json({ error: "not found" }, 404);
  const probe = await probeGraphify(p.root_path);
  return c.json(probe);
});

// k-hop induced subgraph around a node, filtered by relation kind, hard-capped.
// Server-side because the artifact doesn't fit the wire at workspace scale
// (honeywell ~25k nodes / ~50k edges); the browser gets only the neighborhood.
app.get("/api/projects/:id/graphify/neighborhood", async c => {
  const id = Number(c.req.param("id"));
  const p = projects.get(id);
  if (!p) return c.json({ error: "not found" }, 404);
  const node = c.req.query("node");
  if (!node) return c.json({ error: "node required" }, 400);
  const load = await loadGraphify(p.root_path);
  if (load.status === "absent") return c.json({ status: "absent" });
  if (load.status === "unreadable") return c.json({ status: "unreadable", error: load.error });
  const hops = Number(c.req.query("hops") ?? "1");
  const cap = c.req.query("cap") ? Number(c.req.query("cap")) : undefined;
  const relCsv = c.req.query("relations");
  const relations = relCsv ? relCsv.split(",").map(s => s.trim()).filter(Boolean) : null;
  const hideTests = c.req.query("hideTests") === "1";
  const sub = neighborhood(load.parsed, node, {
    hops: Number.isFinite(hops) ? hops : 1,
    relations,
    cap: cap !== undefined && Number.isFinite(cap) ? cap : undefined,
    hideTests,
  });
  if (!sub) return c.json({ status: "ok", neighborhood: null, warnings: load.warnings });
  return c.json({ status: "ok", neighborhood: sub, warnings: load.warnings });
});

// Full relation summary for one node (over the whole graph, not the induced
// neighborhood) — backs the node detail rail.
app.get("/api/projects/:id/graphify/node", async c => {
  const id = Number(c.req.param("id"));
  const p = projects.get(id);
  if (!p) return c.json({ error: "not found" }, 404);
  const nodeId = c.req.query("node");
  if (!nodeId) return c.json({ error: "node required" }, 400);
  const load = await loadGraphify(p.root_path);
  if (load.status === "absent") return c.json({ status: "absent" });
  if (load.status === "unreadable") return c.json({ status: "unreadable", error: load.error });
  return c.json({ status: "ok", detail: nodeDetail(load.parsed, nodeId) });
});

// Label / norm_label search over nodes, ranked by degree, capped — backs the
// entry-point picker. Empty q → the highest-degree suggestions.
app.get("/api/projects/:id/graphify/search", async c => {
  const id = Number(c.req.param("id"));
  const p = projects.get(id);
  if (!p) return c.json({ error: "not found" }, 404);
  const load = await loadGraphify(p.root_path);
  if (load.status === "absent") return c.json({ status: "absent" });
  if (load.status === "unreadable") return c.json({ status: "unreadable", error: load.error });
  const q = c.req.query("q") ?? "";
  const cap = c.req.query("cap") ? Number(c.req.query("cap")) : undefined;
  const hits = searchNodes(load.parsed, q, cap !== undefined && Number.isFinite(cap) ? cap : undefined);
  return c.json({ status: "ok", hits });
});

// Call-flow tier (code lens), computed lazily on demand — process-backed
// (tsserver/pyright) and seconds-slow, so it's kept off the eager /lexicon
// load. The client fetches this only when the code lens is opened, and merges
// the edges into the graph's structure-tier codeEdges. Cached per root.
app.get("/api/projects/:id/code-edges", async c => {
  const id = Number(c.req.param("id"));
  const p = projects.get(id);
  if (!p) return c.json({ error: "not found" }, 404);
  const graph = await loadLexicon(p.root_path);
  const edges = await getCodeEdges(p.root_path, anchorsFromGraph(graph));
  return c.json({ edges });
});

// Model Health — the deterministic, advisory pass (spec: model-health-design.md).
// Reuses the live supervisor (useLsp), so call-flow contradictions and
// goToDefinition anchor refinement are included. Read-only: it never writes
// atoms or mutates the cold layer — findings are triage, corrections route
// through crystallize in the terminal.
app.get("/api/projects/:id/model-health", async c => {
  const id = Number(c.req.param("id"));
  const p = projects.get(id);
  if (!p) return c.json({ error: "not found" }, 404);
  const graph = await loadLexicon(p.root_path);
  const report = await computeModelHealth(graph, p.root_path, { useLsp: true });
  return c.json({ report });
});

// Recent commits touching a set of files — the atom dossier's "historical
// scar" (manifesto idea E). Read-only `git log`, scoped to the given
// repo-relative files, capped at 10 entries. Each file is clamped to the
// project root (path-escape rejected); result cached per (root, file-set).
app.get("/api/projects/:id/file-commits", async c => {
  const id = Number(c.req.param("id"));
  const p = projects.get(id);
  if (!p) return c.json({ error: "not found" }, 404);
  const filesParam = c.req.query("files");
  if (!filesParam) return c.json({ error: "files required" }, 400);

  const root = resolve(p.root_path);
  const files: string[] = [];
  for (const raw of filesParam.split(",").map(s => s.trim()).filter(Boolean)) {
    const full = resolve(join(root, raw));
    const rel = relative(root, full);
    if (rel.startsWith("..") || isAbsolute(rel)) return c.json({ error: "path escape" }, 400);
    files.push(rel);
  }
  if (files.length === 0) return c.json({ commits: [] });

  const cacheKey = `${root}\0${[...files].sort().join("\0")}`;
  const cached = fileCommitsCache.get(cacheKey);
  if (cached) return c.json({ commits: cached });

  // Unit/record separators (\x1f / \x1e) survive commit messages containing
  // newlines and commas, which a naive delimiter would split on.
  const FMT = "%H%x1f%s%x1f%aI%x1f%an%x1e";
  let commits: FileCommit[];
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "-n", "10", `--pretty=format:${FMT}`, "--", ...files],
      { cwd: root, maxBuffer: 1024 * 1024 },
    );
    commits = stdout
      .split("\x1e")
      .map(r => r.trim())
      .filter(Boolean)
      .map(rec => {
        const [hash, message, date, author] = rec.split("\x1f");
        return { hash, message, date, author };
      });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
  fileCommitsCache.set(cacheKey, commits);
  return c.json({ commits });
});

// List the atoms (with line ranges) contained in a YAML file. Backs the
// Specimen Slab's atom rail — a navigator that lets the user jump between
// every atom in a file without leaving the inspector.
app.get("/api/projects/:id/yaml-siblings", async c => {
  const id = Number(c.req.param("id"));
  const p = projects.get(id);
  if (!p) return c.json({ error: "not found" }, 404);
  const reqPath = c.req.query("path");
  if (!reqPath) return c.json({ error: "path required" }, 400);
  const graph = await loadLexicon(p.root_path);
  const siblings = Object.values(graph.entities)
    .filter(e => e.source.file === reqPath)
    .map(e => ({
      fqid: e.ref.fqid,
      kind: e.ref.kind,
      name: e.ref.name,
      lineStart: e.source.lineStart,
      lineEnd: e.source.lineEnd,
      path: e.source.path,
    }))
    .sort((a, b) => a.lineStart - b.lineStart);
  return c.json({ file: reqPath, siblings });
});

// Stream filesystem events for the project's lexicon/ directory as SSE.
// The client subscribes once per ProjectPage mount and refetches on each
// `changed` event. The watcher is shared across subscribers per root and
// torn down when the last one disconnects (see watch.ts).
app.get("/api/projects/:id/events", c => {
  const id = Number(c.req.param("id"));
  const p = projects.get(id);
  if (!p) return c.json({ error: "not found" }, 404);
  const projectRoot = p.root_path;
  return streamSSE(c, async stream => {
    let unsubscribe = () => {};
    unsubscribe = subscribe(projectRoot, paths => {
      stream
        .writeSSE({ event: "changed", data: JSON.stringify({ paths }) })
        .catch(() => unsubscribe());
    });
    stream.onAbort(unsubscribe);
    await stream.writeSSE({ event: "open", data: "1" });
    // Heartbeat keeps the connection from idling out at a proxy or in the
    // browser. Without it, an open stream with no FS activity for ~60s
    // gets reaped and the client churns through reconnects.
    while (!stream.aborted) {
      await stream.sleep(25_000);
      if (stream.aborted) break;
      try { await stream.writeSSE({ event: "ping", data: "1" }); }
      catch { break; }
    }
    unsubscribe();
  });
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

const port = Number(process.env.LEXICON_VIEWER_API_PORT ?? 5374);
console.log(`lexicon-viewer api on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
