#!/usr/bin/env bun
// anchor-health.ts — the first real occupant of validators/.
//
// A STANDALONE, tree-sitter-only, Bash-invocable anchor-resolution check. It
// does NOT require the running viewer server and does NOT require an LSP: it
// loads a project's lexicon cold layer, resolves every <code-anchor symbol=>
// against the code with tree-sitter, and prints a Model Health report
// (healthy / drifted / dangling / external counts + the unhealthy list).
//
// This is the agent-side provider of `code-lens-design.md` Decision 6 / the
// Model Health spec's Decision 3: it shares the ModelHealthReport schema and
// section format with the viewer's GET /api/.../model-health, but runs with
// zero env. LSP-dependent checks (call-hierarchy `calls`-edge contradictions,
// goToDefinition re-export classification) are announced as "not checked (no
// LSP)" rather than implying coverage they don't have.
//
// Usage:
//   bun skills/lexicon/validators/anchor-health.ts [CODE_ROOT] [--artifact-root ARTIFACT_ROOT]
//   (CODE_ROOT defaults to the current working directory. ARTIFACT_ROOT defaults
//    to CODE_ROOT and points at the worktree containing the lexicon/ cold layer.)
//
// Advisory only: it never writes atoms, never mutates the cold layer or code,
// and always exits 0 — findings are triage, corrections route through
// /lexicon:crystallize.

import { resolve } from "node:path";
import { computeModelHealth, type AnchorFinding } from "../../../viewer/server/model-health.ts";
import { loadGraphOrError, parseValidatorArgs } from "./lib.ts";

const argv = process.argv.slice(2);
const parsed = parseValidatorArgs(argv.length > 0 ? argv : [process.cwd()]);
if (parsed.rest.length > 0) {
  console.error("usage: bun anchor-health.ts [CODE_ROOT] [--artifact-root ARTIFACT_ROOT]");
  process.exit(2);
}
const projectRoot = resolve(parsed.codeRoot);
const artifactRoot = resolve(parsed.artifactRoot);

const lines: string[] = [];
const out = (s = "") => lines.push(s);

// Surface a stale/broken cold layer up front rather than printing an empty,
// falsely-clean report (shared with the other standalone validators via lib.ts).
const { graph, errorMarkdown } = await loadGraphOrError(projectRoot, "Model health", artifactRoot);
if (errorMarkdown) {
  console.log(errorMarkdown);
  process.exit(0);
}

// Tree-sitter only — no LSP, no viewer process.
const report = await computeModelHealth(graph, projectRoot, { useLsp: false });

const counts = { healthy: 0, drifted: 0, dangling: 0, external: 0 } as Record<AnchorFinding["status"], number>;
let driftedLines = 0;
for (const a of report.anchors) {
  counts[a.status]++;
  if (a.driftedLine) driftedLines++;
}

out(`## Model health`);
out();
out(`_Deterministic, tree-sitter only (no LSP). Project: \`${projectRoot}\`._`);
out();

// ---- Anchor resolution ----
out(`### Anchor resolution`);
out();
out(`${report.anchors.length} anchored symbol(s): ${counts.healthy} healthy, ${counts.drifted} drifted, ${counts.dangling} dangling, ${counts.external} external.`);
if (driftedLines > 0) out(`${driftedLines} healthy anchor(s) have a stale line cache (refreshable; not an error).`);
out();
const unhealthy = report.anchors.filter(a => a.status !== "healthy");
if (unhealthy.length === 0) {
  out(`No dangling, drifted, or external anchors.`);
} else {
  for (const a of unhealthy) {
    out(`- **${a.status}** \`${a.symbol}\` (${a.fqid}) — ${a.detail ?? a.file}`);
  }
}
out();
const staleLine = report.anchors.filter(a => a.driftedLine);
if (staleLine.length > 0) {
  out(`<details><summary>Stale line caches (${staleLine.length})</summary>`);
  out();
  for (const a of staleLine) {
    out(`- \`${a.symbol}\` (${a.fqid}) — declared line ${a.declaredLineStart}, actual ${a.actualLineStart}`);
  }
  out();
  out(`</details>`);
  out();
}

// ---- Boundary contradictions (structure tier only without LSP) ----
out(`### Boundary contradictions`);
out();
out(`> Call-flow (\`calls\`-edge) contradictions: **not checked (no LSP)**. Structure-tier (\`extends\` / \`implements\` / \`uses\`) contradictions below; run the viewer's Model Health view for LSP-confirmed call-flow coverage.`);
out();
if (report.contradictions.length === 0) {
  out(`No structure-tier contradictions against a declared seam or boundary-rule.`);
} else {
  for (const c of report.contradictions) {
    const where = c.source ? `${c.source} → ${c.target}` : (c.seamId ?? "");
    out(`- **${c.kind}** (${c.confidence}) ${where} — ${c.detail}`);
  }
}
out();

// ---- Dead weight ----
out(`### Dead weight`);
out();
if (report.deadWeight.length === 0) {
  out(`No unanchored code terms or orphan atoms.`);
} else {
  for (const d of report.deadWeight) {
    out(`- **${d.kind}** \`${d.fqid}\`${d.category ? ` (${d.category})` : ""} — ${d.detail}`);
  }
}
out();

// ---- Items deliberately not flagged (the trim discipline) ----
out(`### Items deliberately not flagged`);
out();
out(`- Healthy cross-context edges (no declared seam/rule is contradicted) — not findings by design.`);
out(`- \`concept\`-category terms without code anchors — legitimately abstract; exempt from dead weight.`);
out(`- Stale line caches on otherwise-healthy anchors — a refresh, not an error.`);
out(`- Call-flow contradictions — not checked here (no LSP); see the note above.`);
out();

console.log(lines.join("\n"));
process.exit(0);
