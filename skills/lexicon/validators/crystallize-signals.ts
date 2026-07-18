#!/usr/bin/env bun
// crystallize-signals.ts — mechanical candidates for `crystallize`
// (workflow-mechanization-design.md Decision 2).
//
// Over a git range, emit the three structural-check candidates crystallize
// currently re-derives from memory:
//
//   * vocabulary candidates (check 1)  — new exported symbols in the diff not
//     covered by any term's <symbols> → glossary candidates.
//   * consistency candidates (check 2) — an anchored symbol renamed / moved /
//     deleted in the diff. HIGH priority: this is the silent-rename bug lexicon
//     exists to kill.
//   * boundary candidates (check 4)    — cross-context structure edges touching
//     the diff (best-effort; call-flow edges announced as not checked, no LSP).
//
// The output is a candidate block crystallize presents BEFORE its proposal:
// "Detected N candidates — triage:". These are ADVISORY structural triggers —
// never auto-applied, and they do NOT make crystallize agent-triggered (it
// stays user-triggered). No significance/size scoring; only binary structural
// facts.
//
// STANDALONE: tree-sitter only, no viewer server, no LSP. READ-ONLY.
//
// Usage:
//   bun skills/lexicon/validators/crystallize-signals.ts <projectRoot> [gitRange]
//   (gitRange defaults to commits newer than lexicon/.last-crystallized)

import {
  loadGraphOrError,
  makeOut,
  parseRange,
  gitFilesInRange,
  gitShow,
  lastCrystallizedRange,
  scanDeclsFromSource,
  anchorEntries,
} from "./lib.ts";
import type { ResolvedGraph, CodeEdge } from "../../../viewer/server/schema.ts";

const [, , projectRootArg, rangeArg] = process.argv;

if (!projectRootArg) {
  console.error("usage: bun crystallize-signals.ts <projectRoot> [gitRange]");
  process.exit(2);
}
const projectRoot = projectRootArg;

const out = makeOut();
const { graph, errorMarkdown } = await loadGraphOrError(projectRoot, "Crystallize signals");
if (errorMarkdown) {
  console.log(errorMarkdown);
  process.exit(0);
}

const range = rangeArg ?? lastCrystallizedRange(projectRoot);
if (!range) {
  out(`## Crystallize signals`);
  out();
  out(`No git range given and no usable \`lexicon/.last-crystallized\` marker.`);
  out(`Pass a range explicitly, e.g. \`bun crystallize-signals.ts <projectRoot> HEAD~10..HEAD\`.`);
  console.log(out.toString());
  process.exit(0);
}

const { base, head } = parseRange(range);
const changed = gitFilesInRange(projectRoot, range).filter(f => /\.(ts|tsx|py)$/.test(f));

// ---- declaration deltas per changed file ----
interface Delta { added: Map<string, boolean>; removed: Set<string> } // added: name→exported
const deltas = new Map<string, Delta>();
const addedSymbolToFiles = new Map<string, string[]>();

for (const file of changed) {
  const oldSrc = gitShow(projectRoot, base, file);
  const newSrc = gitShow(projectRoot, head, file);
  const oldDecls = oldSrc != null ? scanDeclsFromSource(file, oldSrc) : null;
  const newDecls = newSrc != null ? scanDeclsFromSource(file, newSrc) : null;
  // A file unparseable in both endpoints yields no signal (fail-soft).
  if (!oldDecls && !newDecls) continue;
  const added = new Map<string, boolean>();
  const removed = new Set<string>();
  for (const [name, info] of newDecls ?? new Map()) {
    if (!oldDecls || !oldDecls.has(name)) {
      added.set(name, info.exported);
      const arr = addedSymbolToFiles.get(name) ?? [];
      arr.push(file);
      addedSymbolToFiles.set(name, arr);
    }
  }
  for (const name of (oldDecls ?? new Map()).keys()) {
    if (!newDecls || !newDecls.has(name)) removed.add(name);
  }
  deltas.set(file, { added, removed });
}

// ---- graph anchor indexes ----
const termAnchoredSymbols = new Set<string>();
const anchorBySymbolFile = new Map<string, string[]>(); // `${symbol}|${file}` → fqids (every anchoring atom)
for (const ae of anchorEntries(graph)) {
  if (!ae.anchor.symbol) continue;
  const key = `${ae.anchor.symbol}|${ae.anchor.file}`;
  const arr = anchorBySymbolFile.get(key) ?? [];
  if (!arr.includes(ae.entity.ref.fqid)) arr.push(ae.entity.ref.fqid);
  anchorBySymbolFile.set(key, arr);
  if (ae.entity.ref.kind === "term") termAnchoredSymbols.add(ae.anchor.symbol);
}

// ---- consistency candidates (check 2, HIGH) ----
interface Consistency { symbol: string; file: string; fqids: string[]; movedTo?: string }
const consistency: Consistency[] = [];
for (const [file, d] of deltas) {
  for (const removedName of d.removed) {
    const fqids = anchorBySymbolFile.get(`${removedName}|${file}`);
    if (!fqids) continue; // only anchored symbols matter for check 2
    const movedFiles = (addedSymbolToFiles.get(removedName) ?? []).filter(f => f !== file);
    consistency.push({ symbol: removedName, file, fqids, movedTo: movedFiles[0] });
  }
}

// ---- vocabulary candidates (check 1) ----
interface Vocab { symbol: string; file: string; exported: boolean }
const vocab: Vocab[] = [];
const renamedNew = new Set<string>(); // added names that are the new side of a rename — skip as fresh vocab
for (const c of consistency) {
  if (c.movedTo) continue; // moved, not renamed
  // a same-file rename: an added symbol in the same file replacing the removed one is ambiguous;
  // we don't try to pair names, but we do avoid double-counting obvious moves above.
}
for (const [file, d] of deltas) {
  for (const [name, exported] of d.added) {
    if (termAnchoredSymbols.has(name)) continue; // already covered by a term anchor
    if (renamedNew.has(name)) continue;
    vocab.push({ symbol: name, file, exported });
  }
}

// ---- boundary candidates (check 4, best-effort) ----
const changedSet = new Set(changed);
function crossContextEdgesTouchingDiff(g: ResolvedGraph): { edge: CodeEdge; srcCtx: string; tgtCtx: string }[] {
  const anchoredInDiff = new Set<string>();
  for (const ae of anchorEntries(g)) if (changedSet.has(ae.anchor.file)) anchoredInDiff.add(ae.entity.ref.fqid);
  const out: { edge: CodeEdge; srcCtx: string; tgtCtx: string }[] = [];
  for (const e of g.codeEdges ?? []) {
    const sc = g.entities[e.source]?.ownerContextId;
    const tc = g.entities[e.target]?.ownerContextId;
    if (!sc || !tc || sc === tc) continue;
    if (!anchoredInDiff.has(e.source) && !anchoredInDiff.has(e.target)) continue;
    out.push({ edge: e, srcCtx: sc, tgtCtx: tc });
  }
  return out;
}
const boundary = crossContextEdgesTouchingDiff(graph);

// ---- render ----
const total = vocab.length + consistency.length + boundary.length;
out(`## Crystallize signals`);
out();
out(`_Deterministic, tree-sitter only (no LSP). Project: \`${projectRoot}\`. Range: \`${range}\` (${changed.length} code file(s) changed)._`);
out();
out(`**Detected ${total} candidate${total === 1 ? "" : "s"} — triage:**`);
out();

// Consistency first — it's the high-priority silent-rename signal.
out(`### Consistency candidates (check 2 — HIGH) (${consistency.length})`);
out();
if (consistency.length === 0) {
  out(`No anchored symbol was renamed, moved, or deleted in this range.`);
} else {
  for (const c of consistency) {
    const where = c.movedTo
      ? `moved to \`${c.movedTo}\` (anchor still points at \`${c.file}\`)`
      : `renamed or deleted in \`${c.file}\``;
    const by = c.fqids.map(f => `\`${f}\``).join(", ");
    out(`- **\`${c.symbol}\`** — anchored by ${by}, now ${where}. Anchor is stale; re-point or rename the atom.`);
  }
}
out();

out(`### Vocabulary candidates (check 1) (${vocab.length})`);
out();
if (vocab.length === 0) {
  out(`No new symbol in the diff lacks a term anchor.`);
} else {
  for (const v of vocab) {
    out(`- **\`${v.symbol}\`** (${v.exported ? "exported" : "local"}) in \`${v.file}\` — no term anchors it. Glossary candidate.`);
  }
}
out();

out(`### Boundary candidates (check 4) (${boundary.length})`);
out();
out(`> Call-flow (\`calls\`-edge) crossings: **not checked (no LSP)**. Structure-tier (\`extends\` / \`implements\` / \`uses\`) crossings touching the diff below; "new" is approximated as "touches a changed file".`);
out();
if (boundary.length === 0) {
  out(`No cross-context structure edge touches the changed files.`);
} else {
  for (const b of boundary) {
    const sn = graph.entities[b.edge.source]?.ref.name ?? b.edge.source;
    const tn = graph.entities[b.edge.target]?.ref.name ?? b.edge.target;
    out(`- ${sn} (\`${b.srcCtx}\`) **${b.edge.kind}** ${tn} (\`${b.tgtCtx}\`) — cross-context edge (${b.edge.provenance}).`);
  }
}
out();

out(`### Items deliberately not flagged`);
out();
out(`- Non-anchored symbols renamed/deleted in the diff — not a consistency signal (nothing in the cold layer pointed at them).`);
out(`- Healthy cross-context edges with a declared seam/rule — governed by design; run anchor-health.ts for contradiction checks.`);
out(`- Call-flow edges — not checked here (no LSP).`);
out();

console.log(out.toString());
process.exit(0);
