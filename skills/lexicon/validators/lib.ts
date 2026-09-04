// lib.ts — shared backend for the standalone mechanical-candidate validators.
//
// These validators are STANDALONE: tree-sitter only, Bash-invocable as
// `bun <script> <projectRoot> [args]`, with ZERO dependency on the running
// viewer server or an LSP. They load a project's lexicon cold layer (via the
// viewer's loader, which is pure tree-sitter for the structure tier) and the
// derived code edges, then report mechanical structural facts.
//
// Everything here is ADVISORY and READ-ONLY: nothing writes atoms, nothing
// mutates the cold layer or code. Candidates are structural triggers the agent
// triages inside crystallize's existing propose-confirm flow — they never make
// crystallize agent-triggered and carry no significance/size scoring (only
// binary structural facts; reference/checks.md philosophy).
//
// LSP-dependent signals (call-flow `calls`-edge boundary crossings) are
// announced as "not checked (no LSP)" rather than implying coverage — the
// two-provider discipline from code-lens-design.md Decision 6.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { loadLexicon } from "../../../viewer/server/loader.ts";
import { getParser, grammarFor, parseRoot, type Grammar, type TsNode } from "../../../viewer/server/grammars.ts";
import type { CodeAnchor, CodeEdge, ResolvedEntity, ResolvedGraph } from "../../../viewer/server/schema.ts";

// ---------------- markdown output ----------------

export interface Out {
  (s?: string): void;
  toString(): string;
}

export function makeOut(): Out {
  const lines: string[] = [];
  const fn = ((s = "") => { lines.push(s); }) as Out;
  fn.toString = () => lines.join("\n");
  return fn;
}

// ---------------- validator CLI roots ----------------

export interface ValidatorArgs {
  codeRoot: string;
  artifactRoot: string;
  rest: string[];
}

export function parseValidatorArgs(args: string[]): ValidatorArgs {
  const codeRoot = args[0];
  if (!codeRoot) throw new Error("missing code root");

  let artifactRoot = codeRoot;
  const rest: string[] = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i] !== "--artifact-root") {
      rest.push(args[i]);
      continue;
    }
    const value = args[++i];
    if (!value) throw new Error("--artifact-root requires a path");
    artifactRoot = value;
  }
  return { codeRoot, artifactRoot, rest };
}

// ---------------- cold-layer loading ----------------

// Load the graph, or return a ready-to-print markdown error block when the
// cold layer can't be resolved (stale schema, parse errors, missing dir) —
// the same fail-fast surfacing anchor-health.ts wants up front rather than a
// falsely-clean empty report.
export async function loadGraphOrError(
  projectRoot: string,
  heading: string,
  artifactRoot = projectRoot,
): Promise<{ graph: ResolvedGraph; errorMarkdown?: string }> {
  const graph = await loadLexicon(projectRoot, artifactRoot);
  const errors = graph.issues.filter(i => i.severity === "error");
  if (!graph.system && errors.length > 0) {
    const out = makeOut();
    out(`## ${heading}`);
    out();
    out(`Could not resolve the cold layer at \`${join(artifactRoot, "lexicon")}\`:`);
    out();
    for (const e of errors.slice(0, 10)) out(`- ${e.file}: ${e.message}`);
    return { graph, errorMarkdown: out.toString() };
  }
  return { graph };
}

// ---------------- path normalization ----------------

// Normalize a CLI-supplied path to a repo-relative path matching how anchors
// store `file=`. Absolute paths are relativized against the project root. A
// relative path is read as project-relative first (the natural "this file in
// the project" mental model); only if it doesn't exist there is it treated as
// cwd-relative.
export function toRepoRel(projectRoot: string, p: string): string {
  const root = resolve(projectRoot);
  if (isAbsolute(p)) return relative(root, p).split("\\").join("/");
  if (existsSync(join(root, p))) return p.split("\\").join("/");
  const abs = resolve(process.cwd(), p);
  return relative(root, abs).split("\\").join("/");
}

// ---------------- git helpers ----------------

function git(projectRoot: string, args: string[]): string {
  return execFileSync("git", ["-C", projectRoot, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function gitSafe(projectRoot: string, args: string[]): string | null {
  try {
    // Suppress stderr: a `git show <base>:<file>` for a file that didn't exist
    // at the base rev is an expected miss, not an error to surface.
    return execFileSync("git", ["-C", projectRoot, ...args], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

// Parse a git range "A..B" (or bare "A" → "A..HEAD") into endpoints.
export function parseRange(range: string): { base: string; head: string } {
  const i = range.indexOf("..");
  if (i === -1) return { base: range, head: "HEAD" };
  const base = range.slice(0, i);
  const head = range.slice(i + 2) || "HEAD";
  return { base, head };
}

// Repo-relative files changed in a git range (new paths; rename-aware).
export function gitFilesInRange(projectRoot: string, range: string): string[] {
  const out = gitSafe(projectRoot, ["diff", "--name-only", range]);
  if (out == null) return [];
  return out.split("\n").map(l => l.trim()).filter(Boolean);
}

// Blob contents of a file at a given revision, or null if absent there.
export function gitShow(projectRoot: string, rev: string, file: string): string | null {
  return gitSafe(projectRoot, ["show", `${rev}:${file}`]);
}

// The `.last-crystallized` marker carries one ISO timestamp. Derive a default
// range "<last-commit-at-or-before-marker>..HEAD" — i.e. commits newer than the
// marker. Returns null when the marker is absent/empty or no commit predates it.
export function lastCrystallizedRange(projectRoot: string, artifactRoot = projectRoot): string | null {
  const marker = join(artifactRoot, "lexicon", ".last-crystallized");
  if (!existsSync(marker)) return null;
  let ts: string;
  try {
    ts = readFileSync(marker, "utf8").trim();
  } catch {
    return null;
  }
  if (!ts) return null;
  const base = gitSafe(projectRoot, ["rev-list", "-1", `--before=${ts}`, "HEAD"]);
  const sha = base?.trim();
  if (!sha) return null;
  return `${sha}..HEAD`;
}

// ---------------- tree-sitter declaration scanning ----------------

export interface DeclInfo {
  row: number;       // 0-based start row
  exported: boolean; // TS: has an `export` ancestor; Py: not underscore-prefixed
}

// Node types that introduce a nested scope — declarations inside them are
// locals/methods, not top-level vocabulary, so they're skipped (avoids the
// candidate over-production the spec warns about: __init__, local vars, etc.).
const SCOPE_NODES = new Set([
  // python
  "class_definition", "function_definition",
  // typescript
  "class_declaration", "function_declaration", "method_definition",
  "function_expression", "arrow_function", "generator_function",
  "generator_function_declaration",
]);

// Named top-level declarations in a parsed source → name → DeclInfo. Only
// module/top-level declarations are recorded (nested methods/locals skipped).
// Generalizes model-health's scanDeclarations with an export flag so vocabulary
// candidates can mark the project's public surface. Reuses grammars.ts.
function scanDeclsFromRoot(root: TsNode, g: Grammar): Map<string, DeclInfo> {
  const out = new Map<string, DeclInfo>();
  const record = (nameNode: TsNode | null, exported: boolean) => {
    if (!nameNode) return;
    const name = nameNode.text;
    if (/^__.*__$/.test(name)) return; // dunder methods are never vocabulary
    if (!out.has(name)) out.set(name, { row: nameNode.startPosition.row, exported });
  };
  const walk = (node: TsNode, underExport: boolean, nested: boolean) => {
    const exp = underExport || node.type === "export_statement";
    if (!nested) {
      if (g === "py") {
        if (node.type === "class_definition" || node.type === "function_definition") {
          const n = node.childForFieldName("name");
          if (n) record(n, !n.text.startsWith("_"));
        } else if (node.type === "assignment") {
          const left = node.childForFieldName("left");
          if (left && left.type === "identifier") record(left, !left.text.startsWith("_"));
        }
      } else {
        switch (node.type) {
          case "interface_declaration":
          case "type_alias_declaration":
          case "class_declaration":
          case "enum_declaration":
          case "function_declaration":
            record(node.childForFieldName("name"), exp);
            break;
          case "variable_declarator":
            record(node.childForFieldName("name"), exp);
            break;
        }
      }
    }
    const childNested = nested || SCOPE_NODES.has(node.type);
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c) walk(c, exp, childNested);
    }
  };
  walk(root, false, false);
  return out;
}

// Parse a source string for a given filename → declarations. Returns null when
// no grammar applies or the parse fails (fail-soft).
export function scanDeclsFromSource(file: string, src: string): Map<string, DeclInfo> | null {
  const g = grammarFor(file);
  if (!g) return null;
  const parser = getParser(g);
  if (!parser) return null;
  const root = parseRoot(parser, src);
  if (!root) return null;
  return scanDeclsFromRoot(root, g);
}

// ---------------- anchor / entity indexing ----------------

export interface AnchorEntry {
  entity: ResolvedEntity;
  anchor: CodeAnchor;
  kind: "symbol" | "constrains-code";
}

// Every (entity, code-anchor) pair, retaining file + symbol + line cache. Covers
// both <symbols> (terms) and <constrains-code> (invariants).
export function anchorEntries(graph: ResolvedGraph): AnchorEntry[] {
  const out: AnchorEntry[] = [];
  for (const e of Object.values(graph.entities)) {
    for (const a of e.symbols ?? []) out.push({ entity: e, anchor: a, kind: "symbol" });
    for (const a of e.constrainsCode ?? []) out.push({ entity: e, anchor: a, kind: "constrains-code" });
  }
  return out;
}

// Anchor entries whose file is in the given set.
export function anchorsInFiles(graph: ResolvedGraph, files: Set<string>): AnchorEntry[] {
  return anchorEntries(graph).filter(ae => files.has(ae.anchor.file));
}

// fqids of atoms carrying at least one anchor in the file set.
export function anchoredFqidsInFiles(graph: ResolvedGraph, files: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const ae of anchorsInFiles(graph, files)) out.add(ae.entity.ref.fqid);
  return out;
}

// ---------------- code-modules glob matching ----------------

function globToRegExp(glob: string): RegExp {
  let re = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  re = re.replace(/\*\*/g, " ");
  re = re.replace(/\*/g, "[^/]*");
  re = re.replace(/ /g, ".*");
  return new RegExp("^" + re + "$");
}

export function fileMatchesModule(file: string, mod: string): boolean {
  if (mod === file) return true;
  if (mod.includes("*")) return globToRegExp(mod).test(file);
  const dir = mod.endsWith("/") ? mod : mod + "/";
  return file.startsWith(dir);
}

// ---------------- context resolution ----------------

export interface ContextHit {
  fqid: string;
  name: string;
  slug: string;
  viaAnchor: string[];      // files matched because an owned atom anchors there
  viaCodeModules: string[]; // files matched by a <code-modules> glob
}

// Bounded contexts owning any of the given files, via (a) an owned atom's
// anchor falling in the file, or (b) a <code-modules> glob match.
export function contextsForFiles(graph: ResolvedGraph, files: Set<string>): ContextHit[] {
  const hits = new Map<string, ContextHit>();
  const ensure = (slug: string): ContextHit | null => {
    const ctx = graph.entities[`context/${slug}`];
    if (!ctx) return null;
    let h = hits.get(slug);
    if (!h) {
      h = { fqid: ctx.ref.fqid, name: ctx.ref.name, slug, viaAnchor: [], viaCodeModules: [] };
      hits.set(slug, h);
    }
    return h;
  };

  // (a) anchors of owned atoms.
  for (const ae of anchorEntries(graph)) {
    if (!files.has(ae.anchor.file)) continue;
    const slug = ae.entity.ownerContextId;
    if (!slug) continue;
    const h = ensure(slug);
    if (h && !h.viaAnchor.includes(ae.anchor.file)) h.viaAnchor.push(ae.anchor.file);
  }

  // (b) <code-modules> globs.
  for (const fqid of graph.byKind["bounded-context"]) {
    const ctx = graph.entities[fqid];
    if (!ctx?.codeModules) continue;
    const slug = ctx.ownerContextId;
    if (!slug) continue;
    for (const file of files) {
      if (ctx.codeModules.some(m => fileMatchesModule(file, m))) {
        const h = ensure(slug);
        if (h && !h.viaCodeModules.includes(file)) h.viaCodeModules.push(file);
      }
    }
  }

  return [...hits.values()];
}

// ---------------- edges / seams / omissions in scope ----------------

// Derived code edges with at least one endpoint anchored in the file set.
export function edgesTouchingFiles(graph: ResolvedGraph, files: Set<string>): CodeEdge[] {
  const anchored = anchoredFqidsInFiles(graph, files);
  return (graph.codeEdges ?? []).filter(e => anchored.has(e.source) || anchored.has(e.target));
}

function ctxSlugOfRef(fqid: string | undefined): string | undefined {
  if (!fqid) return undefined;
  return fqid.startsWith("context/") ? fqid.slice("context/".length) : undefined;
}

// Seams owned by, or relating, any of the given context slugs.
export function seamsForContexts(graph: ResolvedGraph, ctxSlugs: Set<string>): ResolvedEntity[] {
  const out: ResolvedEntity[] = [];
  for (const fqid of graph.byKind.seam) {
    const s = graph.entities[fqid];
    if (!s) continue;
    const related = new Set<string>();
    if (s.ownerContextId) related.add(s.ownerContextId);
    for (const r of [s.upstream, s.downstream]) { const c = ctxSlugOfRef(r?.fqid); if (c) related.add(c); }
    for (const p of s.participants ?? []) { const c = ctxSlugOfRef(p.fqid); if (c) related.add(c); }
    if ([...related].some(c => ctxSlugs.has(c))) out.push(s);
  }
  return out;
}

// Boundary-rules relating any of the given context slugs.
export function boundaryRulesForContexts(graph: ResolvedGraph, ctxSlugs: Set<string>): ResolvedEntity[] {
  const out: ResolvedEntity[] = [];
  for (const fqid of graph.byKind["boundary-rule"]) {
    const r = graph.entities[fqid];
    if (!r) continue;
    const related = new Set<string>();
    if (r.ownerContextId) related.add(r.ownerContextId);
    for (const c of [ctxSlugOfRef(r.boundaryFrom?.fqid), ctxSlugOfRef(r.boundaryTo?.fqid)]) if (c) related.add(c);
    if ([...related].some(c => ctxSlugs.has(c))) out.push(r);
  }
  return out;
}

// Deliberate omissions whose related atoms intersect the scope (atoms or
// contexts in play).
export function omissionsForScope(
  graph: ResolvedGraph,
  atomFqids: Set<string>,
  ctxSlugs: Set<string>,
): { topic: string; reason: string; triggers?: string[] }[] {
  const sys = graph.system;
  if (!sys?.deliberateOmissions) return [];
  const out: { topic: string; reason: string; triggers?: string[] }[] = [];
  for (const om of sys.deliberateOmissions) {
    const related = (om.relatedAtoms ?? []).map(r => r.fqid);
    const hit =
      related.some(f => atomFqids.has(f)) ||
      related.some(f => { const c = ctxSlugOfRef(f); return c ? ctxSlugs.has(c) : false; });
    if (hit) out.push({ topic: om.topic, reason: om.reason, triggers: om.triggers });
  }
  return out;
}

// ---------------- misc ----------------

export function shortProse(s: string | undefined, max = 160): string {
  if (!s) return "";
  // The loader renders inline <ref to="x"/> as [[x]] markers; flatten to the
  // bare slug for a readable card.
  const oneLine = s.replace(/\[\[([^\]]+)\]\]/g, "$1").replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}

// True when `arg` resolves to an existing file — checked project-relative
// first (the natural mental model), then absolute, then cwd-relative. A git
// range like "A..B" won't exist on disk, so this cleanly distinguishes the
// two arg shapes impact.ts accepts.
export function isFileLike(projectRoot: string, arg: string): boolean {
  const candidates = isAbsolute(arg)
    ? [arg]
    : [join(resolve(projectRoot), arg), resolve(process.cwd(), arg)];
  for (const c of candidates) {
    try { if (statSync(c).isFile()) return true; } catch { /* next */ }
  }
  return false;
}
