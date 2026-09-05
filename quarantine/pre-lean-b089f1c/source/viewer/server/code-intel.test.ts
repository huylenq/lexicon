// Integration test for the code lens through the real loader: a self-contained
// multi-stack fixture (TS + Python) exercises both tiers and both languages —
// structure (tree-sitter) and call-flow (tsserver / pyright via the supervisor).

import { test, expect } from "bun:test";
import { join } from "node:path";
import { loadLexicon } from "./loader.ts";
import { anchorsFromGraph, extractStructureEdges } from "./code-intel.ts";
import { getCodeEdges } from "./call-flow.ts";
import { getSupervisor } from "./lsp/supervisor.ts";

const ROOT = join(import.meta.dir, "..", "test-fixtures", "multistack");

test("code lens: eager structure + lazy authoritative edges across TS and Python", async () => {
  const g = await loadLexicon(ROOT);

  // Structure tier is eager in the loader (tree-sitter, in-process, no calls).
  const structure = g.codeEdges ?? [];
  expect(structure.some(e => e.source.endsWith("circle") && e.kind === "extends" && e.target.endsWith("shape"))).toBe(true);
  expect(structure.every(e => e.kind !== "calls")).toBe(true);
  // Eager structure edges are syntactic name-matches.
  expect(structure.every(e => e.provenance === "tree-sitter")).toBe(true);

  // Lazy /code-edges payload: LSP-disambiguated structure + call-flow edges.
  const edges = await getCodeEdges(ROOT, anchorsFromGraph(g));
  const find = (src: string, kind: string, tgt: string) =>
    edges.find(e => e.source.endsWith(src) && e.kind === kind && e.target.endsWith(tgt));
  const has = (src: string, kind: string, tgt: string) => find(src, kind, tgt) !== undefined;
  expect(has("circle", "extends", "shape")).toBe(true);   // structure (resolved)
  expect(has("compute-area", "calls", "scale")).toBe(true); // TS call-flow (tsserver)
  expect(has("total", "calls", "add-all")).toBe(true);      // Python call-flow (pyright)

  // Provenance per tier: unambiguous structure stays tree-sitter; call-flow is lsp.
  expect(find("circle", "extends", "shape")!.provenance).toBe("tree-sitter");
  expect(find("compute-area", "calls", "scale")!.provenance).toBe("lsp");
  expect(find("total", "calls", "add-all")!.provenance).toBe("lsp");
  expect(edges.filter(e => e.kind === "calls").every(e => e.provenance === "lsp")).toBe(true);

  getSupervisor(ROOT).shutdown();
}, 30000);

// Same-name disambiguation: two distinct types both named `Widget` live in
// different modules; a consumer uses one of them. Eager name-match fans out to
// BOTH (wrong); the resolved pass uses goToDefinition to keep only the real one.
const AMBIG = join(import.meta.dir, "..", "test-fixtures", "ambiguous");

test("structure tier: goToDefinition disambiguates same-named references", async () => {
  const g = await loadLexicon(AMBIG);
  const anchors = anchorsFromGraph(g);

  // Eager fan-out: consumer --uses--> BOTH a/Widget and b/Widget (tree-sitter).
  const eager = extractStructureEdges(AMBIG, anchors);
  const eagerUses = eager.filter(e => e.source.endsWith("consumer") && e.kind === "uses");
  expect(eagerUses.length).toBe(2);
  expect(eagerUses.every(e => e.provenance === "tree-sitter")).toBe(true);

  // Resolved: exactly one, the actually-imported a/Widget, via goToDefinition (lsp).
  const resolved = await getCodeEdges(AMBIG, anchors);
  const resolvedUses = resolved.filter(e => e.source.endsWith("consumer") && e.kind === "uses");
  expect(resolvedUses.length).toBe(1);
  expect(resolvedUses[0].target.endsWith("widget-a")).toBe(true);
  expect(resolvedUses[0].provenance).toBe("lsp");

  getSupervisor(AMBIG).shutdown();
}, 30000);
