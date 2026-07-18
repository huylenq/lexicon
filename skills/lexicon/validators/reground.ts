#!/usr/bin/env bun
// reground.ts — the `ground` reload card (workflow-mechanization-design.md
// Decision 3 / manifesto A).
//
// Given the files an agent is about to touch (the declared scope), emit the
// relevant slice of the cold layer: the bounded context(s) those files belong
// to, the terms/invariants anchored in them, the derived code edges touching
// them, and the seams / deliberate-omissions in play. `ground` reads
// system.xml end-to-end as today and uses this card to make its scope
// declaration concrete instead of impressionistic — recovering structure
// without slurping whole source files.
//
// STANDALONE: tree-sitter only, no viewer server, no LSP. ADVISORY / READ-ONLY.
// Best-effort: degrades to "no structure" for files with no anchors.
//
// Usage:
//   bun skills/lexicon/validators/reground.ts <projectRoot> <file> [file...]

import {
  loadGraphOrError,
  makeOut,
  toRepoRel,
  anchorsInFiles,
  contextsForFiles,
  edgesTouchingFiles,
  seamsForContexts,
  boundaryRulesForContexts,
  omissionsForScope,
  anchoredFqidsInFiles,
  shortProse,
} from "./lib.ts";

const [, , projectRootArg, ...fileArgs] = process.argv;

if (!projectRootArg || fileArgs.length === 0) {
  console.error("usage: bun reground.ts <projectRoot> <file> [file...]");
  process.exit(2);
}

const projectRoot = projectRootArg;
const files = new Set(fileArgs.map(f => toRepoRel(projectRoot, f)));

const out = makeOut();
const { graph, errorMarkdown } = await loadGraphOrError(projectRoot, "Reload card");
if (errorMarkdown) {
  console.log(errorMarkdown);
  process.exit(0);
}

out(`## Reload card`);
out();
out(`_Deterministic, tree-sitter only (no LSP). Project: \`${projectRoot}\`._`);
out();
out(`Scope (${files.size} file${files.size === 1 ? "" : "s"}):`);
for (const f of files) out(`- \`${f}\``);
out();

// ---- Bounded contexts owning the scope ----
const contexts = contextsForFiles(graph, files);
const ctxSlugs = new Set(contexts.map(c => c.slug));
out(`### Bounded context(s)`);
out();
if (contexts.length === 0) {
  out(`No bounded context claims these files (no anchored atom, no \`<code-modules>\` match). **No structure** — ground by reading the files directly.`);
} else {
  for (const c of contexts) {
    const reasons: string[] = [];
    if (c.viaAnchor.length) reasons.push(`${c.viaAnchor.length} anchored atom file(s)`);
    if (c.viaCodeModules.length) reasons.push(`\`<code-modules>\` match`);
    out(`- **${c.name}** (\`${c.fqid}\`) — via ${reasons.join(", ")}`);
  }
}
out();

// ---- Terms / invariants anchored in the scope ----
const anchored = anchorsInFiles(graph, files);
const terms = anchored.filter(a => a.entity.ref.kind === "term");
const invariants = anchored.filter(a => a.entity.ref.kind === "invariant");

out(`### Terms anchored here (${new Set(terms.map(t => t.entity.ref.fqid)).size})`);
out();
if (terms.length === 0) {
  out(`None.`);
} else {
  const seen = new Set<string>();
  for (const a of terms) {
    if (seen.has(a.entity.ref.fqid)) continue;
    seen.add(a.entity.ref.fqid);
    const e = a.entity;
    out(`- **${e.ref.name}** (\`${e.ref.fqid}\`${e.category ? `, ${e.category}` : ""}) — ${shortProse(e.definition)}`);
  }
}
out();

out(`### Invariants anchored here (${new Set(invariants.map(t => t.entity.ref.fqid)).size})`);
out();
if (invariants.length === 0) {
  out(`None.`);
} else {
  const seen = new Set<string>();
  for (const a of invariants) {
    if (seen.has(a.entity.ref.fqid)) continue;
    seen.add(a.entity.ref.fqid);
    const e = a.entity;
    const mode = e.validationMode ? ` [${e.validationMode}]` : "";
    out(`- **${e.ref.name}** (\`${e.ref.fqid}\`)${mode} — ${shortProse(e.statement)}`);
  }
}
out();

// ---- Derived code edges touching the scope ----
const edges = edgesTouchingFiles(graph, files);
out(`### Derived code edges touching the scope (${edges.length})`);
out();
out(`> Call-flow (\`calls\`-edge) edges: **not checked (no LSP)**. Structure-tier (\`extends\` / \`implements\` / \`uses\`) edges below.`);
out();
if (edges.length === 0) {
  out(`No structure-tier edges between anchored atoms touch these files.`);
} else {
  for (const e of edges) {
    const sn = graph.entities[e.source]?.ref.name ?? e.source;
    const tn = graph.entities[e.target]?.ref.name ?? e.target;
    out(`- ${sn} **${e.kind}** ${tn} (${e.provenance})`);
  }
}
out();

// ---- Seams & boundary-rules in play ----
const seams = seamsForContexts(graph, ctxSlugs);
const rules = boundaryRulesForContexts(graph, ctxSlugs);
out(`### Seams & boundary-rules in play (${seams.length + rules.length})`);
out();
if (seams.length === 0 && rules.length === 0) {
  out(`None relate the context(s) in scope.`);
} else {
  for (const s of seams) {
    out(`- **seam** ${s.ref.name} (\`${s.ref.fqid}\`, kind=${s.seamKind ?? "unknown"}) — ${shortProse(s.definition)}`);
  }
  for (const r of rules) {
    out(`- **rule** ${shortProse(r.statement, 120)} (\`${r.ref.fqid}\`)`);
  }
}
out();

// ---- Deliberate omissions / seams (the "what we chose not to model") ----
const atomFqids = anchoredFqidsInFiles(graph, files);
const omissions = omissionsForScope(graph, atomFqids, ctxSlugs);
out(`### Deliberate omissions in play (${omissions.length})`);
out();
if (omissions.length === 0) {
  out(`None reference atoms or contexts in scope.`);
} else {
  for (const o of omissions) {
    out(`- **${o.topic}** — ${shortProse(o.reason)}${o.triggers?.length ? ` _(trigger: ${shortProse(o.triggers.join("; "), 80)})_` : ""}`);
  }
}
out();

console.log(out.toString());
process.exit(0);
