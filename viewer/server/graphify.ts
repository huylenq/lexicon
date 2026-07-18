// Graphify lens — server-side reader for the tree-sitter "territory" graph.
//
// The viewer CONSUMES `<project-root>/graphify-out/graph.json` when a user has
// run the graphify CLI themselves; it never runs graphify. Absent artifact →
// clean "not present", the viewer behaves exactly as today. This module owns
// the artifact-only interface (spec graphify-lens-design.md Decision 2/3):
//   - hand-rolled, fail-fast parse of the NetworkX node-link JSON
//   - one parse per mtime, cached, with an in-memory adjacency index
//   - probe/summary, k-hop neighborhood, and label search over that index
//
// No zod: the rest of the server (loader.ts) hand-rolls validation, so this
// follows the same idiom rather than adding a dependency. A malformed or
// unrecognized graph.json is a hard load error surfaced as a warning-bearing
// "present but unreadable" status — never a silent empty graph.

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ---------------- artifact shapes (as observed) ----------------
//
// NetworkX node-link dump. Nodes carry identity + provenance; edges live under
// `links`. We read the fields the lens needs and ignore the rest (`_origin`,
// `weight`, `hyperedges`, …) — tolerant to extra keys, strict on the shape we
// depend on.

export interface GraphifyNode {
  id: string;
  label: string;
  sourceFile: string;      // "" when the symbol has no file (builtins etc.)
  sourceLocation: string;  // e.g. "L21"; "" when absent
  community: number | null;
  normLabel: string;
  fileType: string;        // "code" | "rationale" | "concept" | …
}

export interface GraphifyEdge {
  source: string;
  target: string;
  relation: string;        // contains | calls | imports | references | extends | …
  confidence: string;      // EXTRACTED | INFERRED | AMBIGUOUS
}

// Relations that signal a real code relationship (a symbol using another),
// versus `contains` (a file enclosing its own symbols — pure scaffolding) and
// doc/`rationale_for` noise. Entry-point ranking counts only these, so a big
// file's contains-star can't dominate the suggestions with utility noise.
const DOMAIN_RELATIONS: ReadonlySet<string> = new Set([
  "calls",
  "imports",
  "imports_from",
  "references",
  "extends",
  "inherits",
  "implements",
  "method",
]);

export interface ParsedGraph {
  nodes: GraphifyNode[];
  edges: GraphifyEdge[];
  builtAtCommit: string | null;
  // id → node
  byId: Map<string, GraphifyNode>;
  // id → incident edges (both directions kept; traversal is undirected but
  // each edge keeps its declared source→target for rendering the arrow)
  adjacency: Map<string, GraphifyEdge[]>;
  // undirected degree per node id (incident-edge count)
  degree: Map<string, number>;
  // incident domain-relation edges per node id (DOMAIN_RELATIONS only) — the
  // ranking signal for entry-point suggestions; excludes `contains`/doc edges.
  domainDegree: Map<string, number>;
  // distinct edge-endpoint ids that reference a node absent from the node set:
  // the signature of graphify's path+name ID collision (colliding nodes are
  // dropped upstream before the artifact is written, leaving dangling edges).
  droppedNodeRefs: number;
  relationHistogram: Record<string, number>;
  communityCount: number;
}

export class GraphifyParseError extends Error {}

// A node's source file looks like a test (py + ts/js conventions). Used to
// filter the test scaffolding that otherwise drowns a neighborhood's signal:
//   **/tests/**, **/test_*.py, **/*_test.*, **/*.test.*
export function isTestFile(f: string): boolean {
  if (!f) return false;
  if (/(^|\/)tests\//.test(f)) return true;
  const base = f.slice(f.lastIndexOf("/") + 1);
  if (/^test_.*\.py$/.test(base)) return true;
  if (/_test\.[^.]+$/.test(base)) return true;
  if (/\.test\.[^.]+$/.test(base)) return true;
  return false;
}

// ---------------- fail-fast parser ----------------

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Parse the raw graph.json text into a ParsedGraph, or throw GraphifyParseError.
// Fail-fast on structural violations (not an object, `nodes`/`links` not arrays,
// a node without a string id). Non-fatal defects (dangling edge endpoints from
// the collision drop) are counted into `droppedNodeRefs` and surfaced as a
// warning by the caller — the graph is usable, just known-incomplete.
export function parseGraphJson(text: string): ParsedGraph {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new GraphifyParseError(`graph.json is not valid JSON: ${(e as Error).message}`);
  }
  if (raw === null || typeof raw !== "object") {
    throw new GraphifyParseError("graph.json root is not an object");
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.nodes)) {
    throw new GraphifyParseError("graph.json has no `nodes` array (unrecognized shape)");
  }
  if (!Array.isArray(obj.links)) {
    throw new GraphifyParseError("graph.json has no `links` array (unrecognized shape)");
  }

  const nodes: GraphifyNode[] = [];
  const byId = new Map<string, GraphifyNode>();
  const communities = new Set<number>();
  for (const rawNode of obj.nodes) {
    if (rawNode === null || typeof rawNode !== "object") {
      throw new GraphifyParseError("graph.json has a non-object entry in `nodes`");
    }
    const n = rawNode as Record<string, unknown>;
    if (typeof n.id !== "string" || n.id === "") {
      throw new GraphifyParseError("graph.json has a node without a string `id`");
    }
    const community = typeof n.community === "number" ? n.community : null;
    if (community !== null) communities.add(community);
    const node: GraphifyNode = {
      id: n.id,
      label: asString(n.label) || n.id,
      sourceFile: asString(n.source_file),
      sourceLocation: asString(n.source_location),
      community,
      normLabel: asString(n.norm_label) || asString(n.label),
      fileType: asString(n.file_type),
    };
    nodes.push(node);
    // Last write wins on a duplicate id (graphify shouldn't emit them; be
    // defensive rather than throw — the adjacency below keys on the survivor).
    byId.set(node.id, node);
  }

  const edges: GraphifyEdge[] = [];
  const adjacency = new Map<string, GraphifyEdge[]>();
  const degree = new Map<string, number>();
  const domainDegree = new Map<string, number>();
  const relationHistogram: Record<string, number> = {};
  const missingRefs = new Set<string>();

  const link = (id: string, e: GraphifyEdge) => {
    const list = adjacency.get(id);
    if (list) list.push(e);
    else adjacency.set(id, [e]);
    degree.set(id, (degree.get(id) ?? 0) + 1);
    if (DOMAIN_RELATIONS.has(e.relation)) {
      domainDegree.set(id, (domainDegree.get(id) ?? 0) + 1);
    }
  };

  for (const rawEdge of obj.links) {
    if (rawEdge === null || typeof rawEdge !== "object") {
      throw new GraphifyParseError("graph.json has a non-object entry in `links`");
    }
    const l = rawEdge as Record<string, unknown>;
    if (typeof l.source !== "string" || typeof l.target !== "string") {
      throw new GraphifyParseError("graph.json has a link without string `source`/`target`");
    }
    const edge: GraphifyEdge = {
      source: l.source,
      target: l.target,
      relation: asString(l.relation) || "unknown",
      confidence: asString(l.confidence),
    };
    edges.push(edge);
    relationHistogram[edge.relation] = (relationHistogram[edge.relation] ?? 0) + 1;
    if (!byId.has(edge.source)) missingRefs.add(edge.source);
    else link(edge.source, edge);
    if (!byId.has(edge.target)) missingRefs.add(edge.target);
    else link(edge.target, edge);
  }

  return {
    nodes,
    edges,
    builtAtCommit: typeof obj.built_at_commit === "string" ? obj.built_at_commit : null,
    byId,
    adjacency,
    degree,
    domainDegree,
    droppedNodeRefs: missingRefs.size,
    relationHistogram,
    communityCount: communities.size,
  };
}

// ---------------- mtime cache ----------------

const cache = new Map<string, { mtime: number; parsed: ParsedGraph }>();

function graphPath(projectRoot: string): string {
  return join(projectRoot, "graphify-out", "graph.json");
}

export type GraphifyLoad =
  | { status: "absent" }
  | { status: "unreadable"; error: string }
  | { status: "ok"; parsed: ParsedGraph; mtime: number; warnings: string[] };

// Load + parse the artifact for a project, cached per mtime. Absent file →
// {absent}. Parse failure → {unreadable} (fail-fast, no silent empty graph).
export async function loadGraphify(projectRoot: string): Promise<GraphifyLoad> {
  const path = graphPath(projectRoot);
  let mtime: number;
  try {
    mtime = (await stat(path)).mtimeMs;
  } catch {
    return { status: "absent" };
  }

  const cached = cache.get(projectRoot);
  let parsed: ParsedGraph;
  if (cached && cached.mtime === mtime) {
    parsed = cached.parsed;
  } else {
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (e) {
      return { status: "unreadable", error: `cannot read graph.json: ${(e as Error).message}` };
    }
    try {
      parsed = parseGraphJson(text);
    } catch (e) {
      return { status: "unreadable", error: (e as Error).message };
    }
    cache.set(projectRoot, { mtime, parsed });
  }

  const warnings: string[] = [];
  if (parsed.droppedNodeRefs > 0) {
    warnings.push(
      `${parsed.droppedNodeRefs} edge endpoint(s) reference nodes missing from the graph — ` +
      `graphify's path+name ID collision drops colliding nodes before writing; the graph is incomplete here.`,
    );
  }
  return { status: "ok", parsed, mtime, warnings };
}

export function invalidateGraphifyCache(projectRoot?: string) {
  if (projectRoot) cache.delete(projectRoot);
  else cache.clear();
}

// ---------------- staleness (git, best-effort) ----------------

export interface Staleness {
  artifactMtime: number;         // ms
  latestCommitTime: number | null; // ms of HEAD commit, null if git unavailable
  commitsBehind: number | null;  // commits from built_at_commit..HEAD, null if uncomputable
  stale: boolean;                // commitsBehind > 0, or (fallback) mtime older than HEAD
}

// Compute how far behind HEAD the artifact is. Best-effort: any git failure
// (not a repo, unknown commit) degrades to nulls — never throws. Only the JSON
// parse is fail-fast; staleness is advisory.
export async function graphifyStaleness(
  projectRoot: string,
  builtAtCommit: string | null,
  artifactMtime: number,
): Promise<Staleness> {
  let latestCommitTime: number | null = null;
  let commitsBehind: number | null = null;
  try {
    const { stdout } = await execFileAsync("git", ["log", "-1", "--format=%cI"], {
      cwd: projectRoot,
    });
    const iso = stdout.trim();
    if (iso) {
      const t = Date.parse(iso);
      if (Number.isFinite(t)) latestCommitTime = t;
    }
  } catch {
    /* not a git repo / git absent — leave null */
  }
  if (builtAtCommit) {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["rev-list", "--count", `${builtAtCommit}..HEAD`],
        { cwd: projectRoot },
      );
      const n = parseInt(stdout.trim(), 10);
      if (Number.isFinite(n)) commitsBehind = n;
    } catch {
      /* unknown commit / not a repo — leave null */
    }
  }
  const stale =
    commitsBehind !== null
      ? commitsBehind > 0
      : latestCommitTime !== null
        ? artifactMtime < latestCommitTime
        : false;
  return { artifactMtime, latestCommitTime, commitsBehind, stale };
}

// ---------------- probe / summary (P0) ----------------

export interface GraphifySummary {
  nodeCount: number;
  edgeCount: number;
  communityCount: number;
  relationHistogram: Record<string, number>;
  builtAtCommit: string | null;
  staleness: Staleness;
  warnings: string[];
}

export type GraphifyProbe =
  | { status: "absent" }
  | { status: "unreadable"; error: string }
  | ({ status: "ok" } & GraphifySummary);

// Presence probe + summary for GET /api/projects/:id/graphify.
export async function probeGraphify(projectRoot: string): Promise<GraphifyProbe> {
  const load = await loadGraphify(projectRoot);
  if (load.status === "absent") return { status: "absent" };
  if (load.status === "unreadable") return { status: "unreadable", error: load.error };
  const { parsed } = load;
  const staleness = await graphifyStaleness(projectRoot, parsed.builtAtCommit, load.mtime);
  return {
    status: "ok",
    nodeCount: parsed.nodes.length,
    edgeCount: parsed.edges.length,
    communityCount: parsed.communityCount,
    relationHistogram: parsed.relationHistogram,
    builtAtCommit: parsed.builtAtCommit,
    staleness,
    warnings: load.warnings,
  };
}

// ---------------- neighborhood + search (P1) ----------------

export interface GraphifyNeighborNode extends GraphifyNode {
  degree: number;   // full-graph undirected degree (not the induced-subgraph degree)
  hop: number;      // BFS distance from the seed (0 = seed)
}

export interface GraphifyNeighborhood {
  seed: string;
  nodes: GraphifyNeighborNode[];
  edges: GraphifyEdge[];
  truncated: boolean;   // node cap hit — more neighbors exist than returned
  hops: number;
  relations: string[] | null;  // the relation filter applied, null = all
  hiddenTests: number;  // test-file neighbors filtered out (0 when hideTests off)
}

const DEFAULT_CAP = 120;
const MAX_CAP = 400;
const MAX_HOPS = 4;

// k-hop induced subgraph around `node`, filtered by relation kind, hard-capped.
// Returns null when the seed id isn't in the graph. BFS is undirected; the cap
// bounds total nodes (anti-hairball — the lens never renders the whole graph).
export function neighborhood(
  parsed: ParsedGraph,
  node: string,
  opts: { hops?: number; relations?: string[] | null; cap?: number; hideTests?: boolean } = {},
): GraphifyNeighborhood | null {
  if (!parsed.byId.has(node)) return null;
  const hops = Math.max(1, Math.min(MAX_HOPS, opts.hops ?? 1));
  const cap = Math.max(1, Math.min(MAX_CAP, opts.cap ?? DEFAULT_CAP));
  const relFilter =
    opts.relations && opts.relations.length > 0 ? new Set(opts.relations) : null;
  const hideTests = opts.hideTests ?? false;

  const hopOf = new Map<string, number>([[node, 0]]);
  let frontier = [node];
  let truncated = false;
  // Distinct test-file neighbors skipped — filtered BEFORE the cap so tests
  // never eat the node budget and the truncation notice stays honest. The seed
  // itself is always kept even if it's a test the user deliberately picked.
  const hiddenTests = new Set<string>();

  for (let h = 1; h <= hops && frontier.length > 0 && !truncated; h++) {
    const next: string[] = [];
    for (const cur of frontier) {
      for (const e of parsed.adjacency.get(cur) ?? []) {
        if (relFilter && !relFilter.has(e.relation)) continue;
        const other = e.source === cur ? e.target : e.source;
        const otherNode = parsed.byId.get(other);
        if (!otherNode || hopOf.has(other)) continue;
        if (hideTests && isTestFile(otherNode.sourceFile)) {
          hiddenTests.add(other);
          continue;
        }
        if (hopOf.size >= cap) {
          truncated = true;
          break;
        }
        hopOf.set(other, h);
        next.push(other);
      }
      if (truncated) break;
    }
    frontier = next;
  }

  const nodes: GraphifyNeighborNode[] = [];
  for (const [id, hop] of hopOf) {
    const n = parsed.byId.get(id)!;
    nodes.push({ ...n, degree: parsed.degree.get(id) ?? 0, hop });
  }
  // Induced edges: both endpoints present, relation passes the filter. Dedupe
  // by (source,target,relation) since adjacency stores each edge under both ends.
  const present = new Set(hopOf.keys());
  const seen = new Set<string>();
  const edges: GraphifyEdge[] = [];
  for (const e of parsed.edges) {
    if (!present.has(e.source) || !present.has(e.target)) continue;
    if (relFilter && !relFilter.has(e.relation)) continue;
    const key = `${e.source}\0${e.target}\0${e.relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push(e);
  }

  return {
    seed: node,
    nodes,
    edges,
    truncated,
    hops,
    relations: relFilter ? [...relFilter] : null,
    hiddenTests: hiddenTests.size,
  };
}

export interface GraphifySearchHit extends GraphifyNode {
  degree: number;
}

// ---------------- node detail (relation summary) ----------------

export interface GraphifyRelationGroup {
  relation: string;
  direction: "in" | "out";
  count: number;                       // distinct neighbors in this group
  confidence: Record<string, number>;  // edge-confidence histogram (provenance)
  neighbors: { id: string; label: string; sourceFile: string }[]; // capped
  more: number;                        // distinct neighbors beyond the cap
}

export interface GraphifyNodeDetail {
  node: GraphifyNode;
  degree: number;        // full incident-edge count
  domainDegree: number;  // domain-relation incident count
  groups: GraphifyRelationGroup[];
}

// Full relation summary for one node, over the WHOLE graph adjacency (not the
// induced neighborhood) — grouped by relation kind and direction, with distinct
// neighbor labels (capped) and a confidence histogram as muted provenance. Used
// by the detail rail; returns null for an unknown id.
export function nodeDetail(
  parsed: ParsedGraph,
  id: string,
  neighborCap = 25,
): GraphifyNodeDetail | null {
  const node = parsed.byId.get(id);
  if (!node) return null;

  interface Acc {
    relation: string;
    direction: "in" | "out";
    seen: Set<string>;
    order: string[];
    confidence: Record<string, number>;
  }
  const groups = new Map<string, Acc>();
  for (const e of parsed.adjacency.get(id) ?? []) {
    const isOut = e.source === id;
    const other = isOut ? e.target : e.source;
    if (!parsed.byId.has(other)) continue; // skip dangling (dropped-node) endpoints
    const direction: "in" | "out" = isOut ? "out" : "in";
    const key = `${e.relation}\0${direction}`;
    let g = groups.get(key);
    if (!g) {
      g = { relation: e.relation, direction, seen: new Set(), order: [], confidence: {} };
      groups.set(key, g);
    }
    const conf = e.confidence || "?";
    g.confidence[conf] = (g.confidence[conf] ?? 0) + 1;
    if (!g.seen.has(other)) {
      g.seen.add(other);
      g.order.push(other);
    }
  }

  const out: GraphifyRelationGroup[] = [...groups.values()]
    .map(g => {
      const shown = g.order.slice(0, neighborCap);
      return {
        relation: g.relation,
        direction: g.direction,
        count: g.order.length,
        confidence: g.confidence,
        neighbors: shown.map(nid => {
          const n = parsed.byId.get(nid)!;
          return { id: n.id, label: n.label, sourceFile: n.sourceFile };
        }),
        more: Math.max(0, g.order.length - shown.length),
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    node,
    degree: parsed.degree.get(id) ?? 0,
    domainDegree: parsed.domainDegree.get(id) ?? 0,
    groups: out,
  };
}

// Entry-point suggestions when the picker is empty. NOT raw degree — that
// surfaces stdlib/utility god-nodes (String, Path, main) and files that win on
// `contains` scaffolding, the measured ~6/10-noise problem. Instead: drop nodes
// with no project file (builtins/externals come from nowhere the user can
// explore), then rank by domain-relation degree (calls/imports/references/…,
// excluding `contains`), tie-broken by raw degree. The `degree` field stays the
// full incident count for display consistency with search hits.
export function topNodes(parsed: ParsedGraph, cap = 20): GraphifySearchHit[] {
  return [...parsed.byId.values()]
    .filter(n => n.sourceFile !== "")
    .map(n => ({
      ...n,
      degree: parsed.degree.get(n.id) ?? 0,
      _dom: parsed.domainDegree.get(n.id) ?? 0,
    }))
    .sort((a, b) => b._dom - a._dom || b.degree - a.degree)
    .slice(0, Math.max(1, Math.min(MAX_CAP, cap)))
    .map(({ _dom, ...hit }) => hit);
}

// Label / norm_label substring match, capped. Empty query → the domain-ranked
// entry-point suggestions (topNodes). The match SET is unfiltered — searching
// "path" still finds the fileless `Path` builtin — but hits are ordered the
// same way as topNodes (domain-relation degree, then raw degree), so a builtin
// never outranks a domain symbol that matches the same query.
export function searchNodes(parsed: ParsedGraph, q: string, cap = 20): GraphifySearchHit[] {
  const query = q.trim().toLowerCase();
  const limit = Math.max(1, Math.min(MAX_CAP, cap));
  if (!query) return topNodes(parsed, limit);
  const hits: GraphifySearchHit[] = [];
  for (const n of parsed.byId.values()) {
    if (n.label.toLowerCase().includes(query) || n.normLabel.toLowerCase().includes(query)) {
      hits.push({ ...n, degree: parsed.degree.get(n.id) ?? 0 });
    }
  }
  hits.sort(
    (a, b) =>
      (parsed.domainDegree.get(b.id) ?? 0) - (parsed.domainDegree.get(a.id) ?? 0) ||
      b.degree - a.degree,
  );
  return hits.slice(0, limit);
}
