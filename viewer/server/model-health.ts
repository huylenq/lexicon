// Model Health — the deterministic pass that turns the cold layer from
// "prose trusted" into "mechanically checked" (spec:
// lexicon/specs/model-health-design.md).
//
// One advisory pass, four checks, reusing the existing code-intel backend
// (anchorsFromGraph, tree-sitter declaration extraction, the call-flow
// supervisor's goToDefinition, derived CodeEdges with provenance):
//
//   1. Anchor resolution  — does each <code-anchor symbol=> still resolve?
//      (healthy | drifted | dangling | external; line drift is a sub-flag,
//      not an error — symbol is identity, lines are a refreshable cache.)
//   2. Boundary contradiction — join derived cross-context edges against the
//      DECLARED seams / boundary-rules. Only contradictions against a declared
//      rule surface; healthy cross-context edges are NOT findings.
//   3. Dead weight — atoms not pulling their weight (conservative).
//
// ADVISORY ONLY. This module never writes atoms, never mutates the cold layer
// or code; the loader remains the source of truth for structural validity.
// Two entry points share this schema: the viewer (LSP-backed, useLsp:true) and
// the standalone validators/anchor-health.ts script (tree-sitter only,
// useLsp:false — call-flow contradictions announced as "not checked").

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve as resolvePath, relative } from "node:path";
import { getParser, grammarFor, parseRoot, type Grammar, type TsNode } from "./grammars.ts";
import { getSupervisor } from "./lsp/supervisor.ts";
import { extractStructureEdges, anchorsFromGraph, type CodeEdge, type CodeEdgeKind, type EdgeProvenance } from "./code-intel.ts";
import { getCodeEdges } from "./call-flow.ts";
import type { CodeAnchor, ResolvedGraph, ResolvedEntity, EntityRef, TermCategory } from "./schema.ts";

// Directory segments that mark code living outside the project's own tree —
// dependencies, vendored copies, build output. An anchor pointing here resolves
// "externally": real, but not the project's to maintain.
const EXTERNAL_SEGMENTS = new Set([
  "node_modules", ".venv", "venv", "vendor", "site-packages", "dist", "build",
]);

export type AnchorStatus = "healthy" | "drifted" | "dangling" | "external";

export interface AnchorFinding {
  fqid: string;          // the atom carrying the anchor
  symbol: string;        // the durable identity
  file: string;          // declared (repo-relative) file
  status: AnchorStatus;
  // Line numbers are a cache, not identity: a healthy symbol whose declared
  // line is stale carries driftedLine=true plus the corrected start line.
  driftedLine?: boolean;
  declaredLineStart?: number;
  actualLineStart?: number;   // 1-based; corrected cache
  resolvedFile?: string;      // for drifted: where the symbol actually lives
  detail?: string;
}

export type ContradictionKind =
  | "boundary-leak"
  | "separate-ways-violation"
  | "acl-bypass"
  | "unsupported-seam";

export interface Contradiction {
  kind: ContradictionKind;
  // confidence rides on edge provenance: lsp/tree-sitter = confirmed (a real
  // structural reference); degraded name-match = possible. Deterministic
  // absence (unsupported-seam) is confirmed.
  confidence: "confirmed" | "possible";
  // edge endpoints (for the three edge-driven kinds)
  source?: string;
  target?: string;
  sourceContext?: string;
  targetContext?: string;
  edgeKind?: CodeEdgeKind;
  provenance?: EdgeProvenance;
  // declared atom involved (for seam-driven kinds)
  seamId?: string;
  detail: string;
}

export type DeadWeightKind = "unanchored-code-term" | "orphan-atom";

export interface DeadWeightFinding {
  kind: DeadWeightKind;
  fqid: string;
  category?: TermCategory;
  detail: string;
}

export interface ModelHealthReport {
  anchors: AnchorFinding[];
  contradictions: Contradiction[];
  deadWeight: DeadWeightFinding[];
  generatedAt: string;
}

export interface ModelHealthOptions {
  // LSP-backed refinement: authoritative (disambiguated structure + call-flow)
  // edges for the contradiction join, plus goToDefinition refinement of
  // not-locally-declared anchors. When false (the standalone validator) the
  // pass is tree-sitter only: edges are the eager structure tier and call-flow
  // contradictions are not checked.
  useLsp?: boolean;
}

// ---------------- anchor collection (keeps line numbers) ----------------

interface AnchorRecord {
  fqid: string;
  anchor: CodeAnchor; // file + optional symbol + optional lineStart/lineEnd
}

// Every (entity, code-anchor) pair carrying a symbol — symbols + constrainsCode,
// the same surface anchorsFromGraph walks, but retaining the line cache so drift
// can be reported.
function anchorRecords(graph: ResolvedGraph): AnchorRecord[] {
  const out: AnchorRecord[] = [];
  for (const e of Object.values(graph.entities)) {
    for (const a of [...(e.symbols ?? []), ...(e.constrainsCode ?? [])]) {
      if (a.symbol) out.push({ fqid: e.ref.fqid, anchor: a });
    }
  }
  return out;
}

// ---------------- tree-sitter declaration scan ----------------

// All named declarations in a parsed file → 0-based start row of the name.
// Generalizes code-intel's declOf / call-flow's callablePositions: types and
// callables both count, since an anchor's symbol can be either.
function scanDeclarations(root: TsNode, g: Grammar): Map<string, number> {
  const out = new Map<string, number>();
  const record = (nameNode: TsNode | null) => {
    if (nameNode && !out.has(nameNode.text)) out.set(nameNode.text, nameNode.startPosition.row);
  };
  const walk = (node: TsNode) => {
    if (g === "py") {
      if (node.type === "class_definition" || node.type === "function_definition") {
        record(node.childForFieldName("name"));
      } else if (node.type === "assignment") {
        // Module-/class-level constants: `X = ...`. (Attribute targets like
        // `self.x = ...` have a non-identifier left and are skipped.)
        const left = node.childForFieldName("left");
        if (left && left.type === "identifier") record(left);
      }
    } else {
      switch (node.type) {
        case "interface_declaration":
        case "type_alias_declaration":
        case "class_declaration":
        case "enum_declaration":
        case "function_declaration":
        case "method_definition":
        case "method_signature":
          record(node.childForFieldName("name"));
          break;
        case "variable_declarator":
          // Any named binding is a declaration for anchor-resolution purposes —
          // a `const` lookup table or value object is as valid an anchor target
          // as a function (unlike the call-flow scanner, which wants callables).
          record(node.childForFieldName("name"));
          break;
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c) walk(c);
    }
  };
  walk(root);
  return out;
}

// First position of a bare reference to `name` (identifier / type_identifier)
// in a parsed file — used to seed an LSP goToDefinition when the symbol has no
// local declaration (an import/re-export). Skips the declaration sites
// themselves is unnecessary: any reference position resolves to the same def.
function firstReference(root: TsNode, name: string): { line: number; character: number } | null {
  let found: { line: number; character: number } | null = null;
  const walk = (node: TsNode) => {
    if (found) return;
    if ((node.type === "identifier" || node.type === "type_identifier") && node.text === name) {
      found = { line: node.startPosition.row, character: node.startPosition.column };
      return;
    }
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c) walk(c);
    }
  };
  walk(root);
  return found;
}

interface ParsedFile { root: TsNode; grammar: Grammar; decls: Map<string, number> }

function isExternalPath(file: string): boolean {
  return file.split(/[\\/]/).some(seg => EXTERNAL_SEGMENTS.has(seg));
}

// Resolve an anchored file under a symlink that escapes the project tree → the
// dep is external even though its declared path looks repo-relative.
function escapesRoot(absFile: string, realRoot: string): boolean {
  try {
    const real = realpathSync(absFile);
    return !real.startsWith(realRoot);
  } catch {
    return false;
  }
}

// ---------------- check 1: anchor resolution ----------------

async function resolveAnchors(
  graph: ResolvedGraph,
  projectRoot: string,
  useLsp: boolean,
): Promise<AnchorFinding[]> {
  const root = resolvePath(projectRoot);
  let realRoot = root;
  try { realRoot = realpathSync(root); } catch { /* keep */ }
  const records = anchorRecords(graph);

  // Parse each distinct anchored, parseable, in-tree file once.
  const parsedByFile = new Map<string, ParsedFile | null>();
  const parseFile = (file: string): ParsedFile | null => {
    if (parsedByFile.has(file)) return parsedByFile.get(file)!;
    let result: ParsedFile | null = null;
    const g = grammarFor(file);
    const parser = g ? getParser(g) : null;
    if (g && parser) {
      try {
        const src = readFileSync(join(root, file), "utf8");
        const ast = parseRoot(parser, src);
        if (ast) result = { root: ast, grammar: g, decls: scanDeclarations(ast, g) };
      } catch { /* fail-soft */ }
    }
    parsedByFile.set(file, result);
    return result;
  };

  // Pre-parse every distinct in-tree anchored file so the "moved to another
  // anchored file" lookup is available.
  const declIndex = new Map<string, string[]>(); // symbol -> files declaring it
  for (const { anchor } of records) {
    const file = anchor.file;
    if (isExternalPath(file) || !existsSync(join(root, file))) continue;
    const pf = parseFile(file);
    if (!pf) continue;
    for (const name of pf.decls.keys()) {
      let arr = declIndex.get(name);
      if (!arr) { arr = []; declIndex.set(name, arr); }
      if (!arr.includes(file)) arr.push(file);
    }
  }

  const sup = useLsp ? getSupervisor(root) : null;
  const findings: AnchorFinding[] = [];

  for (const { fqid, anchor } of records) {
    const symbol = anchor.symbol!;
    const file = anchor.file;
    const base: AnchorFinding = { fqid, symbol, file, status: "dangling" };

    // External by declared path (dependency / vendored / build output).
    if (isExternalPath(file)) {
      findings.push({ ...base, status: "external", detail: `anchored file is outside the project tree (${file})` });
      continue;
    }

    const abs = join(root, file);
    if (!existsSync(abs)) {
      findings.push({ ...base, status: "dangling", detail: `file not found: ${file}` });
      continue;
    }

    // Symlinked dependency: the path is repo-relative but resolves outside.
    if (escapesRoot(abs, realRoot)) {
      findings.push({ ...base, status: "external", detail: `anchored file resolves outside the project tree (symlinked): ${file}` });
      continue;
    }

    const pf = parseFile(file);
    if (!pf) {
      // Unparseable (no grammar / read error): confirm existence only.
      findings.push({ ...base, status: "healthy", detail: `file exists; symbol not verified (no grammar for ${file})` });
      continue;
    }

    const declRow = pf.decls.get(symbol);
    if (declRow !== undefined) {
      // Found in the declared file → healthy. Line cache may be stale.
      const actualLineStart = declRow + 1; // tree-sitter rows are 0-based
      const f: AnchorFinding = { ...base, status: "healthy", actualLineStart };
      if (anchor.lineStart !== undefined) {
        f.declaredLineStart = anchor.lineStart;
        if (anchor.lineStart !== actualLineStart) {
          f.driftedLine = true;
          f.detail = `line cache stale: declared ${anchor.lineStart}, actual ${actualLineStart}`;
        }
      }
      findings.push(f);
      continue;
    }

    // Not declared in the stated file. Is it in another anchored file (moved)?
    const elsewhere = (declIndex.get(symbol) ?? []).filter(f => f !== file);
    if (elsewhere.length > 0) {
      findings.push({ ...base, status: "drifted", resolvedFile: elsewhere[0], detail: `symbol declared in ${elsewhere[0]}, not in ${file}` });
      continue;
    }

    // Tree-sitter alone can't tell "gone" from "re-exported from a dependency".
    // When LSP is available, follow a reference to the definition.
    if (sup) {
      const ref = firstReference(pf.root, symbol);
      const hit = ref ? sup.providerForFile(abs) : null;
      if (ref && hit) {
        try {
          await hit.provider.open(abs);
          const def = await hit.provider.goToDefinition(abs, ref.line, ref.character);
          if (def) {
            const real = (() => { try { return realpathSync(def.file); } catch { return def.file; } })();
            if (!real.startsWith(realRoot) || isExternalPath(relative(realRoot, real))) {
              findings.push({ ...base, status: "external", detail: `symbol resolves outside the project tree (${relative(root, def.file)})` });
              continue;
            }
            const rel = relative(root, def.file);
            if (rel !== file) {
              findings.push({ ...base, status: "drifted", resolvedFile: rel, detail: `symbol resolves to ${rel}, not ${file}` });
              continue;
            }
          }
        } catch { /* fail-soft to dangling */ }
      }
    }

    findings.push({ ...base, status: "dangling", detail: `symbol "${symbol}" not found in ${file}` });
  }

  return findings;
}

// ---------------- check 2: boundary contradictions ----------------

const SEPARATE_WAYS = "separate-ways";
const ANTICORRUPTION_LAYER = "anticorruption-layer";

function ctxSlugOf(ref: EntityRef | null | undefined): string | undefined {
  if (!ref) return undefined;
  return ref.fqid.startsWith("context/") ? ref.fqid.slice("context/".length) : undefined;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface SeamInfo {
  seam: ResolvedEntity;
  contexts: string[]; // distinct context slugs the seam relates
}

function contradictions(graph: ResolvedGraph, edges: CodeEdge[]): Contradiction[] {
  const out: Contradiction[] = [];
  const ctxOf = (fqid: string): string | null => graph.entities[fqid]?.ownerContextId ?? null;

  // Index declared seams by the unordered context pairs they relate.
  const seams: SeamInfo[] = [];
  for (const fqid of graph.byKind.seam) {
    const seam = graph.entities[fqid];
    if (!seam) continue;
    const ctxs = new Set<string>();
    if (seam.ownerContextId) ctxs.add(seam.ownerContextId);
    for (const r of [seam.upstream, seam.downstream]) { const s = ctxSlugOf(r); if (s) ctxs.add(s); }
    for (const p of seam.participants ?? []) { const s = ctxSlugOf(p); if (s) ctxs.add(s); }
    seams.push({ seam, contexts: [...ctxs] });
  }

  // Declared boundary-rules: just their context pairs (a rule governs a pair,
  // so its presence keeps an edge from being a *leak*).
  const ruledPairs = new Set<string>();
  for (const fqid of graph.byKind["boundary-rule"]) {
    const rule = graph.entities[fqid];
    if (!rule) continue;
    const from = ctxSlugOf(rule.boundaryFrom) ?? rule.ownerContextId ?? undefined;
    const to = ctxSlugOf(rule.boundaryTo);
    if (from && to) ruledPairs.add(pairKey(from, to));
  }

  // Per pair, the declared seams; and seams flagged separate-ways / ACL.
  const seamsByPair = new Map<string, SeamInfo[]>();
  for (const si of seams) {
    for (let i = 0; i < si.contexts.length; i++) {
      for (let j = i + 1; j < si.contexts.length; j++) {
        const k = pairKey(si.contexts[i], si.contexts[j]);
        let arr = seamsByPair.get(k);
        if (!arr) { arr = []; seamsByPair.set(k, arr); }
        arr.push(si);
      }
    }
  }
  const declaredPair = (a: string, b: string): boolean =>
    seamsByPair.has(pairKey(a, b)) || ruledPairs.has(pairKey(a, b));

  const confidenceOf = (p: EdgeProvenance): "confirmed" | "possible" =>
    p === "degraded" ? "possible" : "confirmed";

  // The downstream context's ACL gateway module (if exactly one module is
  // declared there): its members are the atoms allowed to reach upstream.
  const aclMembers = (downstream: string | undefined): Set<string> | null => {
    if (!downstream) return null;
    const modules = graph.byKind.module
      .map(f => graph.entities[f])
      .filter(m => m && m.ownerContextId === downstream);
    if (modules.length !== 1) return null;
    return new Set((modules[0].moduleMembers ?? []).map(r => r.fqid));
  };

  // Track which seam pairs are supported by at least one cross-context edge.
  const supportedPairs = new Set<string>();

  for (const e of edges) {
    const ca = ctxOf(e.source);
    const cb = ctxOf(e.target);
    if (!ca || !cb || ca === cb) continue; // intra-context edges are never findings
    const key = pairKey(ca, cb);
    supportedPairs.add(key);

    const pairSeams = seamsByPair.get(key) ?? [];
    const sepWays = pairSeams.find(si => si.seam.seamKind === SEPARATE_WAYS);
    const acl = pairSeams.find(si => si.seam.seamKind === ANTICORRUPTION_LAYER);

    const common = {
      source: e.source, target: e.target, sourceContext: ca, targetContext: cb,
      edgeKind: e.kind, provenance: e.provenance, confidence: confidenceOf(e.provenance),
    };

    if (sepWays) {
      out.push({ kind: "separate-ways-violation", ...common, seamId: sepWays.seam.ref.fqid,
        detail: `${e.source} ${e.kind} ${e.target} crosses a separate-ways boundary (${ca} ⊥ ${cb})` });
      continue;
    }
    if (acl) {
      // The edge should flow through the downstream's ACL module. downstream =
      // the seam's downstream context if asymmetric, else the edge's source ctx.
      const downstream = ctxSlugOf(acl.seam.downstream) ?? ca;
      const members = aclMembers(downstream);
      if (members && !members.has(e.source)) {
        out.push({ kind: "acl-bypass", ...common, seamId: acl.seam.ref.fqid,
          detail: `${e.source} bypasses the anticorruption layer between ${ca} and ${cb}` });
        continue;
      }
      // ACL declared and the edge is (or can't be shown to bypass) mediated → governed.
      continue;
    }
    if (declaredPair(ca, cb)) continue; // some other declared rule governs it

    out.push({ kind: "boundary-leak", ...common,
      detail: `${e.source} ${e.kind} ${e.target} crosses ${ca}→${cb} with no declared seam or boundary-rule` });
  }

  // unsupported-seam: a declared seam (other than separate-ways, which is
  // *meant* to have no edges) with no derived edge supporting any of its pairs.
  for (const si of seams) {
    if (si.seam.seamKind === SEPARATE_WAYS) continue;
    if (si.contexts.length < 2) continue;
    let supported = false;
    for (let i = 0; i < si.contexts.length && !supported; i++) {
      for (let j = i + 1; j < si.contexts.length; j++) {
        if (supportedPairs.has(pairKey(si.contexts[i], si.contexts[j]))) { supported = true; break; }
      }
    }
    if (!supported) {
      out.push({ kind: "unsupported-seam", confidence: "confirmed", seamId: si.seam.ref.fqid,
        detail: `seam ${si.seam.ref.fqid} (${si.contexts.join(", ")}) has no derived code edge behind it` });
    }
  }

  return out;
}

// ---------------- check 3: dead weight ----------------

const CODE_MAPPING_CATEGORIES = new Set<TermCategory>(["entity", "value", "service", "event"]);

function deadWeight(graph: ResolvedGraph, edges: CodeEdge[]): DeadWeightFinding[] {
  const out: DeadWeightFinding[] = [];

  // unanchored-code-term: a code-mapping term with no <symbols>. concept exempt.
  for (const fqid of graph.byKind.term) {
    const t = graph.entities[fqid];
    if (!t) continue;
    const category = t.category;
    if (!category || !CODE_MAPPING_CATEGORIES.has(category)) continue; // concept (or unset → concept) exempt
    const hasSymbol = (t.symbols ?? []).some(a => a.symbol);
    if (!hasSymbol) {
      out.push({ kind: "unanchored-code-term", fqid, category,
        detail: `term is category="${category}" but carries no code anchor` });
    }
  }

  // orphan-atom: anchored, but no derived edge touches it AND nothing references
  // it. concept exempt. Build the inbound-reference set across all entities —
  // *meaningful* cross-references only. Automatic containment (a context owning
  // its terms, an aggregate owning its members, a module its members) is graph
  // presence every atom has by construction, so it does NOT count: counting it
  // would make every atom "referenced" and the check inert.
  const referenced = new Set<string>();
  const add = (r: EntityRef | null | undefined) => { if (r) referenced.add(r.fqid); };
  const addAll = (rs: EntityRef[] | undefined) => { for (const r of rs ?? []) referenced.add(r.fqid); };
  for (const e of Object.values(graph.entities)) {
    addAll(e.narrativeRefs);
    addAll(e.operatesOn);
    addAll(e.consumers);
    addAll(e.disambiguatesFrom);
    addAll(e.participants);
    add(e.upstream); add(e.downstream);
    add(e.boundaryFrom); add(e.boundaryTo);
    for (const o of e.deliberateOmissions ?? []) addAll(o.relatedAtoms);
  }

  const edgeEndpoints = new Set<string>();
  for (const e of edges) { edgeEndpoints.add(e.source); edgeEndpoints.add(e.target); }

  // anchored atoms = those carrying at least one symbol anchor.
  const anchored = new Set(anchorsFromGraph(graph).map(a => a.fqid));
  for (const fqid of anchored) {
    const e = graph.entities[fqid];
    if (!e) continue;
    if (e.category === "concept") continue; // concept exempt
    if (edgeEndpoints.has(fqid)) continue;
    if (referenced.has(fqid)) continue;
    out.push({ kind: "orphan-atom", fqid, category: e.category,
      detail: `anchored atom has no derived code edge and no inbound reference` });
  }

  return out;
}

// ---------------- entry point ----------------

export async function computeModelHealth(
  graph: ResolvedGraph,
  projectRoot: string,
  opts: ModelHealthOptions = {},
): Promise<ModelHealthReport> {
  const useLsp = opts.useLsp ?? true;

  // Edge set for the contradiction join. With LSP: authoritative
  // (disambiguated structure + call-flow). Without: the eager structure tier.
  let edges: CodeEdge[];
  if (useLsp) {
    edges = await getCodeEdges(projectRoot, anchorsFromGraph(graph)).catch(() => graph.codeEdges ?? []);
  } else {
    edges = graph.codeEdges ?? extractStructureEdges(projectRoot, anchorsFromGraph(graph));
  }

  const anchors = await resolveAnchors(graph, projectRoot, useLsp);

  return {
    anchors,
    contradictions: contradictions(graph, edges),
    deadWeight: deadWeight(graph, edges),
    generatedAt: new Date().toISOString(),
  };
}
