---
name: lexicon
description: "Living domain-driven documentation. A small cold-layer XML doc (lexicon/system.xml, contexts/<slug>.xml, surfaces/<slug>.xml) captures vocabulary, invariants, bounded contexts, design-system surfaces; per-session retros and on-demand crystallization keep it true. Auto-fires whenever a project has lexicon/system.xml — at the start of substantive work (subcommand: ground), at stopping points (retro), when the user wants to absorb accumulated work (crystallize), check schema or semantic drift (conform), set up a fresh project (adopt), or amend the lexicon bundle itself after correcting a lexicon skill (evolve)."
user-invocable: false
argument-hint: "[adopt|ground|retro|crystallize|conform|evolve]"
arguments: [subcommand]
---

# Lexicon

This is the single entry point for the lexicon workflow. The body is a dispatcher: pick a subcommand, read its file, follow the standing rules below.

## Core idea

Code is the executable spec — it evolves freely, always true to itself. Above the code, a small **cold layer** captures things code can't express well: vocabulary, invariants, bounded contexts, and the "why"s. The cold layer evolves at the speed of *learning*, not the speed of typing. Per-feature plans are a **hot layer** that lives briefly and gets absorbed into the cold layer (or discarded) when work lands.

The whole system rests on **ubiquitous language** in the DDD sense: the same nouns and verbs appear in the cold layer, in conversation, and in code. When all three layers use the same vocabulary, mental-model alignment between human and agent is enforced by repetition rather than by remembering.

The cold layer is **structured XML files**, not markdown prose. Each entity (system, bounded context, term, invariant, seam, boundary rule, aggregate, module, shared kernel, surface, region) is a typed XML element with a stable `id` attribute and prose-bearing child elements. Cross-references are uniform `<ref to="fqid"/>` elements — inline in prose (mixed content) or inside structural wrappers like `<members>`, `<participating-contexts>`. When the project has a UI surface, design vocabulary — tokens, components, named surfaces, regions — counts as ubiquitous language too and lives in the same files.

## Project shape

A project using lexicon has:

```
lexicon/
  system.xml                        ← the cold layer root
  contexts/                         ← one file per bounded context
    <context-slug>.xml
  surfaces/                         ← optional: UI surfaces with regions
    <surface-slug>.xml
  retros/                           ← always-written session logs
  audits/                           ← legacy; conform.md is the current report
  conform.md                        ← drift report (created by conform)
  bootstrap.md                      ← one-shot adoption report (created by adopt)
  migrate.md                        ← legacy; conform writes structural-migration history into conform.md
  .last-crystallized                ← ISO timestamp marker; crystallize reads retros newer than this
  plans/
    <feature>/                      ← in-flight materialized plans
    _archive/                       ← archived plan folders
  _pre-migrate-archive/             ← created by conform's structural pass; preserves pre-v1.0 originals
```

If the structure isn't there, the `adopt` subcommand is the one-shot setup. The workflow is opt-in per project.

## Dispatch

The subcommand is `$subcommand`. Resolve as follows:

- **Explicit** (`adopt` | `ground` | `retro` | `crystallize` | `conform` | `evolve`): read `${CLAUDE_SKILL_DIR}/subcommands/<name>.md` and proceed per its body.
- **Empty**: infer from session context using the heuristics below. If ambiguous, **ask before reading any subcommand file** — picking wrong wastes tokens on the wrong procedure.

### Inference heuristics

- Project has no `lexicon/system.xml` and the user is starting substantive work → suggest `adopt` (unless the user declined recently — see "When this workflow doesn't apply" below).
- The user just signalled completion ("looks good", "we're done", "thanks", "ok ship it", tests pass and the user moves on without further direction) → `retro`.
- The user said "crystallize", "update lexicon", "absorb the retros", "feature X is done", "we're shipping X" → `crystallize`.
- The user said "audit", "is the cold layer still accurate?", "sanity-check the docs", "check for drift", "conform", "migrate", "upgrade lexicon", or named a schema gap ("we don't have aggregates yet", "system.yaml still has crossCuttingTerms") → `conform`.
- The user typed `/lexicon:evolve` explicitly or otherwise made it clear they want to amend this skill bundle → `evolve`. **Never infer evolve** without an explicit cue — it writes cross-repo into `~/src/lexicon/`.
- Otherwise, at the start of substantive work → `ground`.

## Subcommand summaries

So dispatch can choose without reading the whole file:

- **`adopt`** — One-time per project. Drafts the cold layer from existing docs and code, sets up the directory structure, archives ADR-shaped docs and lifts their content into `rationale:` fields, then interviews the user one decision at a time to resolve gaps. Writes `lexicon/bootstrap.md`.
- **`ground`** — Read `system.xml` and the relevant context files, declare scope in conversation, surface vocabulary gaps. No file writes. The agent's context window holds the grounding.
- **`retro`** — Always runs at stopping points. Writes `lexicon/retros/<iso>.md` with the six structural-check results; flags land inline.
- **`crystallize`** — User-triggered. Aggregate retros newer than `.last-crystallized`, cross-check against git diff, propose typed mutations (create / update / rename / move / deprecate / add-anchor / add-rationale / set-category / set-seam-kind / set-status / delete) inline in conversation, apply on the user's yes, bump the marker.
- **`conform`** — Two-pass drift detection: **schema-structural** (cold-layer files vs. current schema; offers to apply the migration delta chain from `migrations/`) and **semantic** (cold-layer claims vs. current code; read-only triage). Writes a unified `lexicon/conform.md` report. Replaces the legacy `lex-audit` + `lex-migrate` pair.
- **`evolve`** — Slash-only (`/lexicon:evolve [optional prompt]`). After a correction this session, take the conversation as primary signal and the project's `lexicon/` diff as corroborating evidence, then amend the responsible part of this bundle (`~/src/lexicon/skills/lexicon/` — `SKILL.md`, a `subcommands/<name>.md`, or a `reference/<name>.md`). Cross-repo write; does not commit.

## Reference (read on demand)

These files are the **single source of truth** the subcommands share. Each subcommand body says when to read them; the index here is so you know what's available.

- `${CLAUDE_SKILL_DIR}/reference/schema.md` — normative cold-layer XML schema (current: v1.0). Read whenever you're emitting, mutating, or validating cold-layer XML.
- `${CLAUDE_SKILL_DIR}/reference/schema.xsd` — hand-authored XSD mirror of the schema, shipped as a real artifact for future editor-mode tooling. v1.0 doesn't run it at load time; the TypeScript traversal in the viewer's loader is authoritative.
- `${CLAUDE_SKILL_DIR}/reference/checks.md` — the six structural checks (vocabulary, vocabulary consistency, invariants, boundaries, decisions, declared-scope match), with per-scope guidance. Read by `retro`, `crystallize`, and `conform`.
- `${CLAUDE_SKILL_DIR}/reference/rules.md` — full rules of engagement (read system.yaml first, ground before code, surface contradictions, always retro, crystallize on user's call, cold-layer edits route through crystallize, IDs are slugs). Restated tersely in the next section; the full text covers edge cases.
- `${CLAUDE_SKILL_DIR}/reference/design.md` — design rationale for the current schema and workflow shape. Read when reasoning about *why* a slot exists; the spec answers *what* the slot is.

The migration deltas live next to them:

- `${CLAUDE_SKILL_DIR}/migrations/v0.x-to-v0.1.md`, `v0.1-to-v0.2.md`, `v0.2-to-v0.3.md`, `v0.3-to-v1.0.md` — per-version deltas used by `conform`'s structural pass. Each is self-contained: pre-flight, detection, apply phases, validate phase, report template.

XML templates and (eventually) deterministic scripts are at:

- `${CLAUDE_SKILL_DIR}/templates/{system,bounded-context,surface}.xml.example`, `${CLAUDE_SKILL_DIR}/templates/plan.md.template` — reference shapes used by `adopt`.
- `${CLAUDE_SKILL_DIR}/validators/` — future home for deterministic schema validators. Empty until the first script lands.

## Standing rules (terse)

The full set lives in `reference/rules.md`; these are the load-bearing ones that apply across every subcommand. If a subcommand contradicts what's here, that subcommand is wrong.

1. **Read `lexicon/system.xml` first.** Before substantive work, end to end. It's small by design (~500 lines). Past that, surface for partitioning into `contexts/<slug>.xml`. If relevant context files exist, load only the ones that match the work — don't read every context file eagerly.
2. **Ground before code.** For any task that isn't strictly mechanical (typo fix, dependency bump, log tweak), run `ground` before writing or modifying code. Skipping grounding is the most common source of silent drift.
3. **Surface contradictions.** If the cold layer contradicts the code or the user's request, stop and surface it. Don't quietly work around it or hallucinate that the doc is right.
4. **Always retro.** At any natural stopping point, run `retro`. Most retros log only a session summary; the structural-check section flags drift only when triggers actually fire. The point is the question gets asked every time.
5. **Crystallize on the user's call.** `crystallize` is user-triggered, never agent-triggered. If you suspect drift has accumulated, surface it as a question and let the user decide.
6. **Cold-layer edits go through `crystallize`.** Don't drive-by-edit `lexicon/system.xml`, `lexicon/contexts/*.xml`, or `lexicon/surfaces/*.xml` as a side effect of unrelated work. Cold-layer changes are deliberate: propose, get explicit approval, then apply. (Direct edits are fine when the user explicitly asks — "fix this typo in system.xml.")
7. **IDs are slugs; rename ≠ re-slug.** Display `name:` mutates freely. The `id:` (slug) is the stable handle. Refs in other files use the slug; renaming a slug breaks them. Slug changes go through `crystallize` as a rename mutation that cascades references.

## When this workflow doesn't apply

If a project has no `lexicon/` folder, surface once near the start of substantive work: *"This project doesn't have lexicon docs. Want to run `adopt`?"* — and respect a "no" by not asking again that session. Use a `.lexicon-skip` marker file at the repo root if the user wants the skip to persist across sessions.

If a project's `lexicon/` is on an older schema (v0.3 YAML, v0.2 YAML, v0.1 YAML, or pre-v0.1 markdown `lexicon/system.md`), surface once: *"This project is on lexicon schema vX; v1.0 is current. Want to run `conform` first?"* Respect a "no"; the operational subcommands won't run cleanly until structural migration happens, and the viewer (if used) refuses to render the project.

The workflow is opt-in per project. Small scripts, throwaway prototypes, and exploratory notebooks usually don't benefit.

## Honest limitations

- The agent is a fallible filter. Drift flags will sometimes be noise; real changes will sometimes be missed. The fix for systematic miscalibration is `/lexicon:evolve`, which amends the responsible part of this bundle.
- Cold-layer rot is real. If the cold layer isn't getting updated despite repeated retros surfacing drift, the workflow degrades to ceremony. The *user* has to actually run `crystallize` periodically; no skill design fixes a doc that's never reviewed.
- Concurrent agents on the same repo are not coordinated. Each session reads, does its work, writes its retro. Conflicts surface as ordinary git conflicts.
