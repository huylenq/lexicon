#!/usr/bin/env bun
// impact.ts — change-impact query (workflow-mechanization-design.md Decision 4 /
// manifesto F).
//
// Given a set of files OR a git range, answer: which anchored atoms touch these
// files? which invariants' <constrains-code> falls in them? which context
// boundaries does the change cross? This is a thin composition over the
// reground card's logic, applied to an arbitrary diff — surfaced inside
// `ground` (pre-work: "this change will touch invariant X") and available to
// `crystallize` (post-work). It is NOT a new lifecycle moment.
//
// STANDALONE: tree-sitter only, no viewer server, no LSP. ADVISORY / READ-ONLY.
//
// Usage:
//   bun skills/lexicon/validators/impact.ts <projectRoot> <file> [file...]
//   bun skills/lexicon/validators/impact.ts <projectRoot> <gitRange>

import {
  loadGraphOrError,
  makeOut,
  toRepoRel,
  gitFilesInRange,
  isFileLike,
  anchorsInFiles,
  contextsForFiles,
  seamsForContexts,
  boundaryRulesForContexts,
  shortProse,
} from "./lib.ts";

const [, , projectRootArg, ...rest] = process.argv;

if (!projectRootArg || rest.length === 0) {
  console.error("usage: bun impact.ts <projectRoot> (<file> [file...] | <gitRange>)");
  process.exit(2);
}
const projectRoot = projectRootArg;

const out = makeOut();
const { graph, errorMarkdown } = await loadGraphOrError(projectRoot, "Change impact");
if (errorMarkdown) {
  console.log(errorMarkdown);
  process.exit(0);
}

// Resolve scope: explicit files (any arg that exists on disk) or a git range.
let files: Set<string>;
let scopeLabel: string;
const fileArgs = rest.filter(a => isFileLike(projectRoot, a));
if (fileArgs.length > 0) {
  files = new Set(fileArgs.map(f => toRepoRel(projectRoot, f)));
  scopeLabel = `${files.size} file(s)`;
} else {
  const range = rest[0];
  const changed = gitFilesInRange(projectRoot, range);
  files = new Set(changed);
  scopeLabel = `git range \`${range}\` (${files.size} changed file(s))`;
}

out(`## Change impact`);
out();
out(`_Deterministic, tree-sitter only (no LSP). Project: \`${projectRoot}\`. Scope: ${scopeLabel}._`);
out();
if (files.size === 0) {
  out(`No files in scope — nothing to report.`);
  console.log(out.toString());
  process.exit(0);
}
for (const f of files) out(`- \`${f}\``);
out();

// ---- anchored atoms touching the scope ----
const anchored = anchorsInFiles(graph, files);
const seenAtoms = new Map<string, { name: string; fqid: string; kind: string }>();
for (const a of anchored) {
  if (!seenAtoms.has(a.entity.ref.fqid)) {
    seenAtoms.set(a.entity.ref.fqid, { name: a.entity.ref.name, fqid: a.entity.ref.fqid, kind: a.entity.ref.kind });
  }
}
out(`### Anchored atoms touching the change (${seenAtoms.size})`);
out();
if (seenAtoms.size === 0) {
  out(`No anchored atom falls in these files.`);
} else {
  for (const a of seenAtoms.values()) out(`- **${a.name}** (\`${a.fqid}\`, ${a.kind})`);
}
out();

// ---- invariants whose constrains-code falls in the scope ----
const constrained = anchored.filter(a => a.kind === "constrains-code" && a.entity.ref.kind === "invariant");
const seenInv = new Set<string>();
out(`### Invariants constrained here (${new Set(constrained.map(c => c.entity.ref.fqid)).size})`);
out();
if (constrained.length === 0) {
  out(`No invariant's \`<constrains-code>\` falls in these files.`);
} else {
  for (const a of constrained) {
    if (seenInv.has(a.entity.ref.fqid)) continue;
    seenInv.add(a.entity.ref.fqid);
    const e = a.entity;
    const mode = e.validationMode ? ` [${e.validationMode}]` : "";
    out(`- **${e.ref.name}** (\`${e.ref.fqid}\`)${mode} — ${shortProse(e.statement)}`);
  }
}
out();

// ---- context boundaries crossed ----
const contexts = contextsForFiles(graph, files);
const ctxSlugs = new Set(contexts.map(c => c.slug));
out(`### Context boundaries crossed (${contexts.length} context(s))`);
out();
if (contexts.length === 0) {
  out(`No bounded context claims these files — no boundary in play.`);
} else if (contexts.length === 1) {
  out(`The change stays within **${contexts[0].name}** (\`${contexts[0].fqid}\`) — no boundary crossed.`);
} else {
  out(`The change spans ${contexts.length} contexts:`);
  for (const c of contexts) out(`- **${c.name}** (\`${c.fqid}\`)`);
  out();
  const seams = seamsForContexts(graph, ctxSlugs);
  const rules = boundaryRulesForContexts(graph, ctxSlugs);
  if (seams.length === 0 && rules.length === 0) {
    out(`No declared seam or boundary-rule governs these contexts — a multi-context change across an **undeclared** boundary (check 4 signal).`);
  } else {
    out(`Governing seams / rules:`);
    for (const s of seams) out(`- **seam** ${s.ref.name} (\`${s.ref.fqid}\`, kind=${s.seamKind ?? "unknown"})`);
    for (const r of rules) out(`- **rule** ${shortProse(r.statement, 120)} (\`${r.ref.fqid}\`)`);
  }
}
out();

console.log(out.toString());
process.exit(0);
