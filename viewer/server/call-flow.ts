// Call-flow tier for the code lens (spec: code-lens-design.md, P2 / D3 sequence half).
//
// Derives `calls` edges between anchored atoms. tree-sitter locates each
// function/method-anchored atom's name position (per-language grammar); the
// call-flow supervisor routes the file to the right provider (tsserver for TS,
// pyright for Python, correctly provisioned per root) for the semantic call
// hierarchy. An edge is emitted only when the other endpoint is also an anchored
// atom — the same domain-selective rule as the structure tier.
//
// Health-gated: a misprovisioned root (pyright with the wrong env → all imports
// unresolved → empty/garbage call graph) is skipped, so its atoms fall back to
// the structure tier instead of producing silently-wrong edges (spec D7).
//
// Async, process-backed, fail-soft throughout.

import { readFileSync } from "node:fs";
import { resolve as resolvePath, relative } from "node:path";
import { getSupervisor } from "./lsp/supervisor.ts";
import { getParser, grammarFor, parseRoot, type TsNode, type Grammar } from "./grammars.ts";
import { extractStructureEdgesResolved, type AnchorInput, type CodeEdge } from "./code-intel.ts";

// The lazy /code-edges payload: the *authoritative* edge set computed with LSP —
// disambiguated structure edges + call-flow edges. Cached per project root so
// repeated fetches don't re-query; invalidated by the loader's invalidateCache
// (file change / refresh). The client replaces the eager (name-match) structure
// edges with this once it arrives.
const codeEdgeCache = new Map<string, Promise<CodeEdge[]>>();

export function getCodeEdges(projectRoot: string, anchors: AnchorInput[]): Promise<CodeEdge[]> {
  const key = resolvePath(projectRoot);
  let hit = codeEdgeCache.get(key);
  if (!hit) {
    hit = (async () => {
      const structure = await extractStructureEdgesResolved(projectRoot, anchors).catch(() => [] as CodeEdge[]);
      const calls = await extractCallEdges(projectRoot, anchors).catch(() => [] as CodeEdge[]);
      return [...structure, ...calls];
    })();
    codeEdgeCache.set(key, hit);
  }
  return hit;
}

export function invalidateCodeEdges(projectRoot?: string): void {
  if (projectRoot) codeEdgeCache.delete(resolvePath(projectRoot));
  else codeEdgeCache.clear();
}

// callable-declaration name -> 0-based (line, character) of the name token.
function callablePositions(root: TsNode, g: Grammar): Map<string, { line: number; character: number }> {
  const out = new Map<string, { line: number; character: number }>();
  const record = (nameNode: TsNode | null) => {
    if (nameNode) out.set(nameNode.text, { line: nameNode.startPosition.row, character: nameNode.startPosition.column });
  };
  const walk = (node: TsNode) => {
    if (g === "py") {
      if (node.type === "function_definition") record(node.childForFieldName("name"));
    } else {
      if (node.type === "function_declaration" || node.type === "method_definition" || node.type === "method_signature") {
        record(node.childForFieldName("name"));
      } else if (node.type === "variable_declarator") {
        const value = node.childForFieldName("value");
        if (value && (value.type === "arrow_function" || value.type === "function")) record(node.childForFieldName("name"));
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

export async function extractCallEdges(projectRoot: string, anchors: AnchorInput[]): Promise<CodeEdge[]> {
  const root = resolvePath(projectRoot);
  const sup = getSupervisor(root);

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

  // Resolve a call-hierarchy endpoint to an anchored atom. The call hierarchy
  // gives the *resolved* definition file, so prefer an exact (name, file) match.
  // Fall back to name-only ONLY when the name is unambiguous — an ambiguous name
  // (≥2 same-named anchored atoms in different files) whose resolved file isn't
  // anchored can't be safely attributed, so drop it rather than guess wrong.
  const resolveAtom = (name: string, file: string): string | null => {
    const exact = bySymbolFile.get(`${name}|${relative(root, file)}`);
    if (exact) return exact;
    const candidates = bySymbol.get(name);
    return candidates && candidates.length === 1 ? candidates[0] : null;
  };

  const edges: CodeEdge[] = [];
  const seen = new Set<string>();
  const push = (source: string, target: string) => {
    if (source === target) return;
    const k = `${source}|${target}`;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ source, target, kind: "calls", provenance: "lsp" });
  };

  // Group anchored files by their provider root, so the health-gate can probe
  // the aggregate (a single file under-counts misprovisioning).
  interface Entry { file: string; abs: string; g: Grammar; fileAnchors: AnchorInput[] }
  const byRoot = new Map<string, { provider: ReturnType<typeof sup.providerForFile>; entries: Entry[] }>();
  for (const [file, fileAnchors] of byFile) {
    const g = grammarFor(file);
    if (!g) continue;
    const abs = resolvePath(root, file);
    const hit = sup.providerForFile(abs);
    if (!hit) continue;
    // Key by grammar + dir, not dir alone: one directory can be both a TS and a
    // Python root (configs side by side), and each language has its own provider.
    const key = `${g}:${hit.root.dir}`;
    let grp = byRoot.get(key);
    if (!grp) { grp = { provider: hit, entries: [] }; byRoot.set(key, grp); }
    grp.entries.push({ file, abs, g, fileAnchors });
  }

  for (const grp of byRoot.values()) {
    const hit = grp.provider!;
    // Health-gate: skip a misprovisioned root rather than emit silently-wrong
    // edges; its atoms keep their structure-tier edges.
    if (!(await sup.isRootHealthy(grp.entries.map(e => e.abs)))) continue;

    for (const { file, abs, g, fileAnchors } of grp.entries) {
      const parser = getParser(g);
      if (!parser) continue;
      let positions: Map<string, { line: number; character: number }>;
      try {
        const astRoot = parseRoot(parser, readFileSync(abs, "utf8"));
        if (!astRoot) continue;
        positions = callablePositions(astRoot, g);
      } catch { continue; }
      const callable = fileAnchors.filter(a => positions.has(a.symbol));
      if (callable.length === 0) continue;
      await hit.provider.open(abs);

      for (const a of callable) {
        const pos = positions.get(a.symbol)!;
        const sourceFqid = bySymbolFile.get(`${a.symbol}|${file}`);
        if (!sourceFqid) continue;
        for (const c of await hit.provider.incomingCalls(abs, pos.line, pos.character)) {
          const caller = resolveAtom(c.name, c.file);
          if (caller) push(caller, sourceFqid); // caller --calls--> this atom
        }
        for (const c of await hit.provider.outgoingCalls(abs, pos.line, pos.character)) {
          const callee = resolveAtom(c.name, c.file);
          if (callee) push(sourceFqid, callee); // this atom --calls--> callee
        }
      }
    }
  }

  return edges;
}
