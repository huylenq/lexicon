---
name: lexicon
description: "Living domain-driven documentation. A small cold-layer XML doc (lexicon/system.xml, contexts/<slug>.xml, surfaces/<slug>.xml) captures vocabulary, invariants, bounded contexts, design-system surfaces; on-demand crystallization keeps it true. Auto-fires whenever a project's primary/default worktree has lexicon/system.xml, including sessions running in a linked worktree with no local copy — at the start of substantive work (subcommand: ground), when the user wants to absorb accumulated work into the cold layer (crystallize), author or file a design/architecture spec (spec), check schema or semantic drift (validate), set up a fresh project (bootstrap), or amend the lexicon bundle itself after correcting a lexicon skill (meta-evolve)."
user-invocable: false
argument-hint: "[bootstrap|ground|crystallize|spec|validate|meta-evolve]"
arguments: [subcommand]
---

# Lexicon

This skill runs the lexicon **moves**. The body is a dispatcher: pick a subcommand, read its file, follow the standing rules below.

Above this skill sits the `using-lexicon` primer — the awareness layer that parks a standing disposition into the session (what the cold layer is for, which move fits which moment) and offers the right move advisorily. That primer doesn't *do* the work; it routes here. When a move is accepted or clearly called for, this skill is what actually runs it. If you arrived here via the primer with a subcommand already chosen, proceed straight to dispatch.

**Bundle source of truth:** this bundle is wired via Claude's `--plugin-dir`, so every `${CLAUDE_SKILL_DIR}/…` path resolves to `<plugin-dir>/skills/lexicon` at runtime — canonically `~/src/lexicon/skills/lexicon/`. If the skill launched from a stub that left `${CLAUDE_SKILL_DIR}` unresolved, read the referenced files directly from `~/src/lexicon/skills/lexicon/` — never filesystem-search (`find /`) for them.

## Core idea

Code is the executable spec — it evolves freely, always true to itself. Above the code, a small **cold layer** captures things code can't express well: vocabulary, invariants, bounded contexts, and the "why"s. The cold layer evolves at the speed of *learning*, not the speed of typing. Per-feature plans are a **hot layer** that lives briefly and gets absorbed into the cold layer (or discarded) when work lands.

The whole system rests on **ubiquitous language** in the DDD sense: the same nouns and verbs appear in the cold layer, in conversation, and in code. When all three layers use the same vocabulary, mental-model alignment between human and agent is enforced by repetition rather than by remembering.

### Shared artifact worktree

Lexicon is project-level shared memory, not per-branch implementation state. The canonical project instance lives in the repository's **primary/default worktree**, even when an agent is coding in a linked feature worktree. It is often intentionally untracked or ignored there.

- Resolve the current code worktree and the primary/default worktree separately. Use the first `worktree` path reported by `git worktree list --porcelain` as the primary/default worktree; do not infer it from a branch name such as `main` or `develop`.
- Read and write `lexicon/` only under that primary/default worktree unless the human explicitly names another artifact root. Never read from, create, copy, or update it in the agent's linked worktree.
- Absence from the current linked worktree does not mean the project lacks these artifacts. Check the primary/default worktree before offering `bootstrap` or creating any knowledge directory.
- Keep code inspection, implementation, tests, git history, and feature-branch diffs rooted in the agent's current worktree. `crystallize` reads the implementation diff from the current worktree but reads and writes the cold layer and `.last-crystallized` in the primary/default worktree.
- Every bundled standalone validator accepts separate roots: pass the current implementation checkout as `<codeRoot>` and the primary/default worktree as `--artifact-root <artifactRoot>`. The second flag may be omitted only when both roots are genuinely the same. Never copy knowledge artifacts into a linked worktree merely to satisfy tooling.

The cold layer is **structured XML files**, not markdown prose. Each entity (system, bounded context, term, invariant, seam, boundary rule, aggregate, module, shared kernel, surface, region) is a typed XML element with a stable `id` attribute and prose-bearing child elements. Cross-references are uniform `<ref to="fqid"/>` elements — inline in prose (mixed content) or inside structural wrappers like `<members>`, `<participating-contexts>`. When the project has a UI surface, design vocabulary — tokens, components, named surfaces, regions — counts as ubiquitous language too and lives in the same files.

### Prose under `lexicon/docs/`

Markdown lives in `lexicon/docs/`, not in a sibling product. Wiki pages, specs, plans, and ideas are ordinary files the agent may write under the current task. There is no required status machine and no promotion ceremony. Git is the session log. `ground` may read relevant prose; `crystallize` may mine stable vocabulary or rationale from it. Distillation is one-way: prose → cold-layer XML, and only through `crystallize`.

A leftover `laxicon/` directory is the old name for this folder. Do not create a new sibling.

## Project shape

A project using lexicon has:

```
lexicon/
  system.xml                        ← the cold layer root
  contexts/                         ← one file per bounded context
    <context-slug>.xml
  surfaces/                         ← optional: UI surfaces with regions
    <surface-slug>.xml
  docs/                             ← all markdown prose
    wiki/                           ← human-facing explanation (optional)
    specs/                          ← design/architecture docs
    plans/                          ← disposable execution notes
    ideas/                          ← pre-commitment thinking (optional)
  validate.md                       ← drift report (created by validate)
  bootstrap.md                      ← one-shot setup report (created by bootstrap)
  .last-crystallized                ← ISO timestamp marker; crystallize reads the git diff newer than this
  _pre-migrate-archive/             ← created by validate's structural pass; preserves pre-v1.0 originals
```

If the structure isn't there, the `bootstrap` subcommand is the one-shot setup. The workflow is opt-in per project. A project may keep `lexicon/docs/` without a cold layer.

## Dispatch

The subcommand is `$subcommand`. Resolve as follows:

- **Explicit** (`bootstrap` | `ground` | `crystallize` | `spec` | `validate` | `meta-evolve`): read `${CLAUDE_SKILL_DIR}/subcommands/<name>.md` and proceed per its body.
- **Empty**: infer from session context using the heuristics below. If ambiguous, **ask before reading any subcommand file** — picking wrong wastes tokens on the wrong procedure.

### Inference heuristics

- Project has no `lexicon/system.xml` and the user is starting substantive work → suggest `bootstrap` (unless the user declined recently — see "When this workflow doesn't apply" below).
- The user said "crystallize", "update lexicon", "absorb the work", "feature X is done", "we're shipping X" → `crystallize`. (If "done" also means a design doc should be finalized, pair with `spec` promotion — see that subcommand.)
- The user said "write a spec", "design doc", "architecture doc", "RFC", "finalize/establish the spec", "start a progress note", or asked where a design note should go → `spec`.
- The user said "audit", "is the cold layer still accurate?", "sanity-check the docs", "check for drift", "validate", "migrate", "upgrade lexicon", or named a schema gap ("we don't have aggregates yet", "system.yaml still has crossCuttingTerms") → `validate`.
- The user typed `/lexicon:meta-evolve` explicitly or otherwise made it clear they want to amend this skill bundle → `meta-evolve`. **Never infer meta-evolve** without an explicit cue — it writes cross-repo into `~/src/lexicon/`.
- Otherwise, at the start of substantive work → `ground`.

## Subcommand summaries

So dispatch can choose without reading the whole file:

- **`bootstrap`** — One-time per project. Drafts the cold layer from existing docs and code, sets up the directory structure, archives ADR-shaped docs and lifts their content into `rationale:` fields, then interviews the user one decision at a time to resolve gaps. Writes `lexicon/bootstrap.md`.
- **`ground`** — Read `system.xml` and the relevant context files, declare scope in conversation, surface vocabulary gaps. No file writes. The agent's context window holds the grounding.
- **`crystallize`** — User-triggered. Reads the git diff newer than `.last-crystallized` plus recent-session conversation, runs the six structural checks over it, proposes typed mutations (create / update / rename / move / deprecate / add-anchor / add-rationale / set-category / set-seam-kind / set-status / delete) inline in conversation, applies on the user's yes, bumps the marker. This is where session drift gets caught and absorbed — there is no separate per-session retro step; git history is the session log.
- **`spec`** — Author or update a markdown design/architecture doc under `lexicon/docs/specs/`. Specs sit above code and below the cold layer. They defer vocabulary to the cold layer (link atoms via `[[fqid]]`) rather than carrying a glossary; the viewer renders them. Update the same file in place; do not run a promotion ceremony.
- **`validate`** — Two-pass drift detection: **schema-structural** (cold-layer files vs. current schema; offers to apply the migration delta chain from `migrations/`) and **semantic** (cold-layer claims vs. current code; read-only triage). Writes a unified `lexicon/validate.md` report.
- **`meta-evolve`** — Slash-only (`/lexicon:meta-evolve [optional prompt]`). After a correction this session, take the conversation as primary signal and the project's `lexicon/` diff as corroborating evidence, then amend the responsible part of this bundle (`~/src/lexicon/skills/lexicon/` — `SKILL.md`, a `subcommands/<name>.md`, or a `reference/<name>.md`). Cross-repo write; does not commit.

## Reference (read on demand)

These files are the **single source of truth** the subcommands share. Each subcommand body says when to read them; the index here is so you know what's available.

- `${CLAUDE_SKILL_DIR}/reference/schema.md` — normative cold-layer XML schema (current: v1.0). Read whenever you're emitting, mutating, or validating cold-layer XML.
- `${CLAUDE_SKILL_DIR}/reference/schema.xsd` — hand-authored XSD mirror of the schema, shipped as a real artifact for future editor-mode tooling. v1.0 doesn't run it at load time; the TypeScript traversal in the viewer's loader is authoritative.
- `${CLAUDE_SKILL_DIR}/reference/checks.md` — the six structural checks (vocabulary, vocabulary consistency, invariants, boundaries, decisions, declared-scope match), with per-scope guidance. Read by `crystallize` and `validate`.
- `${CLAUDE_SKILL_DIR}/reference/rules.md` — full rules of engagement (read system.xml first, ground before code, surface contradictions, crystallize on user's call, cold-layer edits route through crystallize, IDs are slugs). Restated tersely in the next section; the full text covers edge cases.
- `${CLAUDE_SKILL_DIR}/reference/design.md` — design rationale for the current schema and workflow shape. Read when reasoning about *why* a slot exists; the spec answers *what* the slot is.

The migration deltas live next to them:

- `${CLAUDE_SKILL_DIR}/migrations/v0.x-to-v0.1.md`, `v0.1-to-v0.2.md`, `v0.2-to-v0.3.md`, `v0.3-to-v1.0.md` — per-version deltas used by `validate`'s structural pass. Each is self-contained: pre-flight, detection, apply phases, validate phase, report template.

XML templates and (eventually) deterministic scripts are at:

- `${CLAUDE_SKILL_DIR}/templates/{system,bounded-context,surface}.xml.example`, `${CLAUDE_SKILL_DIR}/templates/plan.md.template` — reference shapes used by `bootstrap`.
- `${CLAUDE_SKILL_DIR}/validators/` — standalone tree-sitter validators (`anchor-health.ts`, `crystallize-signals.ts`, `reground.ts`, `impact.ts`). Invoke as `bun <script> <codeRoot> --artifact-root <artifactRoot> …`.

## Standing rules (terse)

The full set lives in `reference/rules.md`; these are the load-bearing ones that apply across every subcommand. If a subcommand contradicts what's here, that subcommand is wrong.

1. **Use the shared artifact worktree.** Resolve the primary/default worktree before looking for project knowledge. Read and write `lexicon/` only there; use the current agent worktree for code and implementation diffs. Never treat a missing local copy in a linked worktree as an absent project artifact.
2. **Read `lexicon/system.xml` first.** Before substantive work, end to end. It's small by design (~500 lines). Past that, surface for partitioning into `contexts/<slug>.xml`. If relevant context files exist, load only the ones that match the work — don't read every context file eagerly.
3. **Ground before code.** For any task that isn't strictly mechanical (typo fix, dependency bump, log tweak), run `ground` before writing or modifying code. Skipping grounding is the most common source of silent drift.
4. **Surface contradictions.** If the cold layer contradicts the code or the user's request, stop and surface it. Don't quietly work around it or hallucinate that the doc is right.
5. **Crystallize on the user's call.** `crystallize` is user-triggered, never agent-triggered. It reads the current implementation worktree's git diff since the shared artifact root's last crystallization marker, runs the structural checks over it, and proposes mutations — there is no separate per-session retro. If you suspect drift has accumulated (the git history shows substantive work but the cold layer hasn't moved), surface it as a question and let the user decide.
6. **Cold-layer edits go through `crystallize`.** Don't drive-by-edit `lexicon/system.xml`, `lexicon/contexts/*.xml`, or `lexicon/surfaces/*.xml` as a side effect of unrelated work. Cold-layer changes are deliberate: propose, get explicit approval, then apply in the shared artifact worktree. (Direct edits are fine when the user explicitly asks — "fix this typo in system.xml.")
7. **IDs are slugs; rename ≠ re-slug.** Display `name:` mutates freely. The `id:` (slug) is the stable handle. Refs in other files use the slug; renaming a slug breaks them. Slug changes go through `crystallize` as a rename mutation that cascades references.
8. **Prose is markdown under `lexicon/docs/`.** During `ground` and `crystallize`, read the relevant pages. Do not invent a sibling `laxicon/` directory or a status/promotion workflow. Cold-layer XML still goes through `crystallize`; prose files may be edited under the current task.

## When this workflow doesn't apply

If a project has no `lexicon/` folder, surface once near the start of substantive work: *"This project doesn't have lexicon docs. Want to run `bootstrap`?"* — and respect a "no" by not asking again that session. Use a `.lexicon-skip` marker file at the repo root if the user wants the skip to persist across sessions.

If a project's `lexicon/` is on an older schema (v0.3 YAML, v0.2 YAML, v0.1 YAML, or pre-v0.1 markdown `lexicon/system.md`), surface once: *"This project is on lexicon schema vX; v1.0 is current. Want to run `validate` first?"* Respect a "no"; the operational subcommands won't run cleanly until structural migration happens, and the viewer (if used) refuses to render the project.

The workflow is opt-in per project. Small scripts, throwaway prototypes, and exploratory notebooks usually don't benefit.

## Honest limitations

- The agent is a fallible filter. Drift flags will sometimes be noise; real changes will sometimes be missed. The fix for systematic miscalibration is `/lexicon:meta-evolve`, which amends the responsible part of this bundle.
- Cold-layer rot is real. If the cold layer isn't getting crystallized despite the code moving underneath it, the workflow degrades to ceremony. The *user* has to actually run `crystallize` periodically; no skill design fixes a doc that's never reviewed.
- Concurrent agents share one artifact root even when their code worktrees are isolated. Re-read an artifact immediately before editing it, keep writes narrow, and surface concurrent changes rather than overwriting them; untracked shared artifacts may not produce ordinary git conflicts.
