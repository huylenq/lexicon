// Structure-tier code intelligence for the code lens (spec: code-lens-design.md, P1).
//
// Derives extends / implements / uses edges between cold-layer atoms by parsing
// the files their `<code-anchor symbol=>` anchors point at, with tree-sitter.
// Multi-language: TypeScript (interfaces / type aliases / classes / enums) and
// Python (classes + inheritance). Domain-selective by construction — an edge is
// emitted only between two anchored atoms, so the cold layer's anchor set filters
// the noise (D2).
//
// Two resolvers share one parse pass:
//   * extractStructureEdges (sync)         — name-match; ambiguous names fan out
//     to every same-named atom. Fast, in-process, no LSP. Used eagerly by the
//     loader for instant render.
//   * extractStructureEdgesResolved (async) — disambiguates ambiguous references
//     via LSP goToDefinition (the syntactic→semantic boundary, D3). Used by the
//     lazy /code-edges path. Degrades to fan-out when no provider resolves.
//
// Fail-soft throughout: a missing grammar, an unreadable file, or an oversized-
// file parse degrades to fewer edges, never a throw.

import { readFileSync } from "node:fs";
import { join, resolve as resolvePath, relative } from "node:path";
import { getParser, grammarFor, parseRoot, type Grammar, type TsNode } from "./grammars.ts";
import { getSupervisor } from "./lsp/supervisor.ts";
import type { ResolvedGraph } from "./schema.ts";

export type CodeEdgeKind = "extends" | "implements" | "uses" | "calls";

// How an edge was derived. tree-sitter = syntactic name-match; lsp = LSP-resolved
// (goToDefinition-disambiguated structure or call-hierarchy calls); degraded =
// name-match fan-out where no provider resolved (the D3 ceiling).
export type EdgeProvenance = "tree-sitter" | "lsp" | "degraded";

export interface CodeEdge {
  source: string; // fqid
  target: string; // fqid
  kind: CodeEdgeKind;
  provenance: EdgeProvenance;
}

export interface AnchorInput {
  fqid: string;
  symbol: string;
  file: string; // repo-relative
}

// Every (entity, code-anchor-with-symbol) pair — the input both tiers consume.
export function anchorsFromGraph(graph: ResolvedGraph): AnchorInput[] {
  const anchors: AnchorInput[] = [];
  for (const e of Object.values(graph.entities)) {
    for (const a of [...(e.symbols ?? []), ...(e.constrainsCode ?? [])]) {
      if (a.symbol) anchors.push({ fqid: e.ref.fqid, symbol: a.symbol, file: a.file });
    }
  }
  return anchors;
}

interface Pos { line: number; character: number }
interface DeclInfo { name: string; ext: Map<string, Pos>; impl: Map<string, Pos>; uses: Map<string, Pos> }

// One structural reference from an anchored declaration to a (named) target,
// with the reference's source position for LSP disambiguation.
interface PendingRef { sourceFqid: string; name: string; kind: CodeEdgeKind; file: string; line: number; character: number }

function collectRefs(node: TsNode | null, type: string, out: Map<string, Pos>): void {
  if (!node) return;
  if (node.type === type && !out.has(node.text)) {
    out.set(node.text, { line: node.startPosition.row, character: node.startPosition.column });
  }
  for (let i = 0; i < node.childCount; i++) collectRefs(node.child(i), type, out);
}

// Identifiers inside Python annotation `type` nodes (field / param types).
function pyAnnotationRefs(node: TsNode | null, out: Map<string, Pos>): void {
  if (!node) return;
  if (node.type === "type") collectRefs(node, "identifier", out);
  for (let i = 0; i < node.childCount; i++) pyAnnotationRefs(node.child(i), out);
}

function declOf(node: TsNode, g: Grammar): DeclInfo | null {
  if (g === "py") {
    if (node.type !== "class_definition") return null;
    const name = node.childForFieldName("name")?.text;
    if (!name) return null;
    const ext = new Map<string, Pos>();
    collectRefs(node.childForFieldName("superclasses"), "identifier", ext);
    const uses = new Map<string, Pos>();
    pyAnnotationRefs(node.childForFieldName("body"), uses);
    return { name, ext, impl: new Map(), uses };
  }
  const TS_DECLS = new Set(["interface_declaration", "type_alias_declaration", "class_declaration", "enum_declaration"]);
  if (!TS_DECLS.has(node.type)) return null;
  const name = node.childForFieldName("name")?.text;
  if (!name) return null;
  const ext = new Map<string, Pos>();
  const impl = new Map<string, Pos>();
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (!c) continue;
    if (c.type === "extends_type_clause" || c.type === "extends_clause") collectRefs(c, "type_identifier", ext);
    else if (c.type === "implements_clause") collectRefs(c, "type_identifier", impl);
    else if (c.type === "class_heritage") {
      for (let j = 0; j < c.childCount; j++) {
        const h = c.child(j);
        if (h?.type === "extends_clause") collectRefs(h, "type_identifier", ext);
        if (h?.type === "implements_clause") collectRefs(h, "type_identifier", impl);
      }
    }
  }
  const uses = new Map<string, Pos>();
  collectRefs(node.childForFieldName("body") ?? node.childForFieldName("value"), "type_identifier", uses);
  return { name, ext, impl, uses };
}

interface Collected {
  refs: PendingRef[];
  bySymbol: Map<string, string[]>;       // symbol -> fqids
  bySymbolFile: Map<string, string>;     // symbol|file -> fqid
}

// Single parse pass over the anchored files → the structural references plus the
// symbol indexes both resolvers share.
function collect(projectRoot: string, anchors: AnchorInput[]): Collected {
  const bySymbol = new Map<string, string[]>();
  const bySymbolFile = new Map<string, string>();
  const byFile = new Map<string, AnchorInput[]>();
  for (const a of anchors) {
    if (!a.symbol) continue;
    let arr = bySymbol.get(a.symbol);
    if (!arr) { arr = []; bySymbol.set(a.symbol, arr); }
    arr.push(a.fqid);
    bySymbolFile.set(`${a.symbol}|${a.file}`, a.fqid);
    let list = byFile.get(a.file);
    if (!list) { list = []; byFile.set(a.file, list); }
    list.push(a);
  }

  const refs: PendingRef[] = [];
  for (const [file, fileAnchors] of byFile) {
    const g = grammarFor(file);
    if (!g) continue;
    const parser = getParser(g);
    if (!parser) continue;
    let src: string;
    try { src = readFileSync(join(projectRoot, file), "utf8"); } catch { continue; }
    const root = parseRoot(parser, src);
    if (!root) continue;
    const wanted = new Set(fileAnchors.map(a => a.symbol));

    const walk = (node: TsNode) => {
      const decl = declOf(node, g);
      if (decl && wanted.has(decl.name)) {
        const sourceFqid = bySymbolFile.get(`${decl.name}|${file}`);
        if (sourceFqid) {
          for (const n of decl.ext.keys()) { decl.uses.delete(n); }
          for (const n of decl.impl.keys()) { decl.uses.delete(n); }
          const add = (m: Map<string, Pos>, kind: CodeEdgeKind) => {
            for (const [name, pos] of m) refs.push({ sourceFqid, name, kind, file, line: pos.line, character: pos.character });
          };
          add(decl.ext, "extends");
          add(decl.impl, "implements");
          add(decl.uses, "uses");
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i);
        if (c) walk(c);
      }
    };
    walk(root);
  }
  return { refs, bySymbol, bySymbolFile };
}

function dedupe(): { push: (s: string, t: string, k: CodeEdgeKind, p: EdgeProvenance) => void; edges: CodeEdge[] } {
  const edges: CodeEdge[] = [];
  const seen = new Set<string>();
  return {
    edges,
    push: (source, target, kind, provenance) => {
      if (source === target) return;
      const key = `${source}|${target}|${kind}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ source, target, kind, provenance });
    },
  };
}

// Eager: name-match, fan-out on ambiguity. Sync, no LSP — every edge is a
// syntactic tree-sitter match.
export function extractStructureEdges(projectRoot: string, anchors: AnchorInput[]): CodeEdge[] {
  const { refs, bySymbol } = collect(projectRoot, anchors);
  const { push, edges } = dedupe();
  for (const r of refs) for (const t of bySymbol.get(r.name) ?? []) push(r.sourceFqid, t, r.kind, "tree-sitter");
  return edges;
}

// Lazy: disambiguate ambiguous references (a name with ≥2 same-named anchored
// atoms in different files) via the provider's goToDefinition. Unambiguous
// references stay name-match (no LSP). Degrades to fan-out when no provider
// resolves the position.
export async function extractStructureEdgesResolved(projectRoot: string, anchors: AnchorInput[]): Promise<CodeEdge[]> {
  const root = resolvePath(projectRoot);
  const { refs, bySymbol, bySymbolFile } = collect(projectRoot, anchors);
  const sup = getSupervisor(root);
  const { push, edges } = dedupe();

  for (const r of refs) {
    const candidates = bySymbol.get(r.name) ?? [];
    // Unambiguous name-match needs no LSP — a confident syntactic edge.
    if (candidates.length <= 1) { for (const t of candidates) push(r.sourceFqid, t, r.kind, "tree-sitter"); continue; }

    const abs = resolvePath(root, r.file);
    const hit = sup.providerForFile(abs);
    if (!hit) { for (const t of candidates) push(r.sourceFqid, t, r.kind, "degraded"); continue; } // degrade
    await hit.provider.open(abs);
    const def = await hit.provider.goToDefinition(abs, r.line, r.character);
    if (!def) { for (const t of candidates) push(r.sourceFqid, t, r.kind, "degraded"); continue; } // degrade

    const target = bySymbolFile.get(`${r.name}|${relative(root, def.file)}`);
    if (target) push(r.sourceFqid, target, r.kind, "lsp");
    // else: resolved to a non-anchored file → the real target isn't anchored; drop.
  }
  return edges;
}
