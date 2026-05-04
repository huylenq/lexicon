---
name: lex-overview
description: "Load at the start of any session in a project that has lexicon/system.md, whenever another lexicon skill (lex-bootstrap, lex-ground, lex-retro, lex-crystallize, lex-audit) is about to run, or when the user asks about the lexicon workflow. Defines the shared rules and the structural checks the other skills depend on. Load this first; the others assume it is in context."
---

# Lexicon: workflow overview

This skill is the **rulebook** for the lexicon workflow. Five skills implement specific moments in the loop — one adoption-time (`lex-bootstrap`), three operational (`lex-ground`, `lex-retro`, `lex-crystallize`), and one periodic-maintenance (`lex-audit`); this skill explains how they fit together.

If you're loading this in response to one of the other skills, you only need the **Project shape** and **Rules of engagement** sections — skim and proceed.

## Core idea

Code is the executable spec — it evolves freely, always true to itself. Above the code, a small **cold layer** (`lexicon/system.md`) captures things code can't express well: vocabulary, invariants, bounded contexts, and the "why"s. The cold layer evolves at the speed of *learning*, not the speed of typing. Per-feature plans are a **hot layer** that lives briefly and gets absorbed into the cold layer (or discarded) when work lands.

The whole system rests on **ubiquitous language** in the DDD sense: the same nouns and verbs appear in `system.md`, in conversation, and in code. When all three layers use the same vocabulary, mental-model alignment between human and agent is enforced by repetition rather than by remembering.

## Project shape

A project using lexicon has:

```
lexicon/
  system.md                         ← the cold layer (holistic entry point)
  views/                            ← optional: Domain Views (cold-layer slices, see below)
    <context-slug>.md
  decisions/                        ← ADRs, append-only
  calibration.md                    ← project-specific notes on what counts as "significant"
  retros/                           ← always-written session logs (timestamp-named)
  audits/                           ← audit reports
  bootstrap.md                      ← one-shot adoption triage report (created by lex-bootstrap)
  .last-crystallized                ← ISO timestamp marker; lex-crystallize reads retros newer than this
  plans/
    <feature>/                      ← in-flight materialized plans
    _archive/                       ← archived plan folders
```

If a project doesn't have this structure, the **`lex-bootstrap`** skill is the one-shot adoption pass that creates it. The user opts in per project — lexicon is not forced on every project.

### Domain Views (optional)

`system.md` is bounded at ~500 lines because cold-layer rot is the failure mode. Some projects — those with rich domain models, multiple substantial bounded contexts, or long architectural histories — hit that bound. Domain Views are the escape valve: per-context partitions of the cold layer, each one a small file with the same shape as `system.md` but scoped to one bounded context (or topic cluster).

When views exist:
- `system.md` becomes a **slim holistic index** — cross-cutting glossary (terms with no single owning context), bounded-contexts index pointing at views, cross-context invariants, cross-context architecture seams, ADR pointers. Same ~500-line ceiling, easier to honor.
- Each view at `lexicon/views/<context-slug>.md` carries the context's local glossary, invariants, internal seams, and scoped ADR pointers.
- **Ownership rule**: every term has *exactly one* owning location — either a single view or `system.md`'s cross-cutting glossary. Other views *use* the term but never *redefine* it. This is what makes partitioning work — without ownership, views drift independently. `lex-audit` flags violations.

When *not* to use views:
- Simple projects. One `system.md` is enough; views add ceremony without payoff.
- Projects whose bounded contexts are still settling. Premature partitioning locks in shapes that may be wrong.
- Contexts with no rich self-contained UL — small contexts stay as one-paragraph entries in `system.md`'s bounded-contexts index, no view file needed. **Not every context needs a view; that's the most important escape hatch.**

Views are non-breaking: adding one later, or absorbing a view back into `system.md`, is a routine refactor. Start without them; promote when `system.md` starts feeling tight.

## The five skills

- **`lex-bootstrap`** — Runs **once** at adoption time. Scans existing docs and code, drafts a first-cut `system.md`, migrates ADR-shaped content, sets up the directory structure, and produces a triage report at `lexicon/bootstrap.md`. Trigger: "set up lexicon", "adopt lexicon", "bootstrap lexicon", or `lex-ground` deferring on a project with no `system.md`.
- **`lex-ground`** — Runs at the start of substantive coding work. Reads `system.md` and relevant views, declares scope (terms, invariants, bounded context) **in conversation**, surfaces vocabulary gaps. No file writes — the agent's context window holds the grounding for the rest of the session. Trigger: any non-trivial task.
- **`lex-retro`** — Runs at every natural stopping point. Always writes a log to `lexicon/retros/<timestamp>.md`, with structural-drift flags inline in the log when they fire. Trigger: completion signals like "looks good", "we're done", tests pass and user moves on.
- **`lex-crystallize`** — **User-triggered.** Runs when the user explicitly asks to update the cold layer ("crystallize", "update lexicon", "absorb the retros", "feature X is done"). Reads retros since the last crystallization, cross-checks against git diff, proposes a coherent set of edits to `system.md` (and views) **inline in conversation**, and applies them directly on user approval. Updates `lexicon/.last-crystallized`.
- **`lex-audit`** — Runs periodically (quarterly, on demand, or before planning sessions). Re-validates `system.md` against current code to catch backward-flow drift — stale glossary, dead invariants, undeclared contexts, hygiene rot. Writes a triage report to `lexicon/audits/audit-<iso>.md`; never edits `system.md` directly. Trigger: "audit lexicon", "sanity-check the docs", "is `system.md` still accurate?".

### Forward-flow vs backward-flow drift

A subtle but important distinction. `lex-retro` and `lex-crystallize` catch **forward-flow drift** — new work introducing inconsistency, surfaced at the cheapest moment. They are blind to **backward-flow drift** — `system.md` claims things that *used to be true*. A term that got renamed in code six sessions ago, an invariant that's quietly violated, a context boundary that's leaked. `lex-audit` exists specifically for that asymmetry: the architecture is eventually consistent in the forward direction only, and audit closes the loop.

## Structural checks

Three skills (`lex-retro`, `lex-crystallize`, `lex-audit`) run the same six checks at different scopes and in different directions. Definitions live here so they stay in sync.

The six checks:

1. **Vocabulary** — Was a noun or verb used (in code: class/type/function/key parameter names; in conversation: terms used repeatedly) that isn't in `system.md`'s glossary or the relevant view's glossary?
2. **Vocabulary consistency** — Was a glossary term used in a way that doesn't match its definition? **High priority** — this is the silent-renaming bug.
3. **Invariants** — Did the work violate, refine, or contradict any invariant in `system.md`? Re-read each invariant and ask: would it still hold given the current code?
4. **Boundaries** — Did the work cross a boundary in `system.md`'s bounded contexts? (New import edge, new call site, new shared state across a previously clean boundary.)
5. **Decisions** — Were any non-obvious choices made — picking approach A over B for reasons future-readers wouldn't recover from the code alone? These warrant an ADR rather than a glossary/invariant edit.
6. **Declared scope match** — Did the actual work stay within the scope the agent grounded on? When it drifted, the *reason* often reveals a model gap.

### Per-skill direction

Same checks, different application:

- **`lex-retro`** runs them forward against one session's diff: *"did this session introduce anything that conflicts with `system.md`?"* Flags land inline in the retro file.
- **`lex-crystallize`** runs them forward against the cumulative diff since the last crystallization: *"did the accumulated work shift the model?"* Filter for terms that stuck across sessions, invariants that genuinely changed, boundaries that genuinely redrew.
- **`lex-audit`** runs them backward against existing `system.md` claims: *"for each entry / invariant / boundary in `system.md`, does it still hold in current code?"* Audit also runs hygiene, calibration, and distillation-completion phases that have no forward-flow analogue — see `lex-audit` for those.

### Domain Views scoping

If the project uses Domain Views (`lexicon/views/*.md`), each check is scoped: first against the view(s) covering the relevant bounded context, then against `system.md` for cross-cutting concerns. Flags on view-owned content target that view; flags on cross-cutting concerns target `system.md`. Name the target file(s) explicitly when proposing edits.

## Rules of engagement

These apply whenever a project has `lexicon/system.md`.

### 1. Read `system.md` first (and relevant views)

Before substantive work, read `system.md` end to end. It's small by design — under ~500 lines. If it's longer, surface it to the user as a sign the cold doc is rotting (or a sign the project has outgrown one file and should consider Domain Views).

If `lexicon/views/` exists, also read the view(s) matching the bounded context of the work being done. `system.md`'s bounded-contexts index points at the relevant view files. Loading every view eagerly defeats the partitioning — load only what's relevant. When in doubt, ask the user which context the work is in.

### 2. Ground before code

For any task that isn't strictly mechanical (typo fixes, dependency bumps, log tweaks), invoke `lex-ground` before writing or modifying code. Skipping grounding is the most common source of silent drift.

### 3. Surface contradictions

If `lexicon/system.md` contradicts the code or the user's request, **stop and surface it before proceeding**. Don't quietly work around it. Don't hallucinate that the doc is right.

### 4. Always retro

At any natural stopping point, run `lex-retro`. Most retros log only the session summary; the structural-check section flags drift only when triggers actually fire. The point is the question gets asked every time, so structural drift is caught at the cheapest moment.

### 5. Crystallize on the user's call

`lex-crystallize` is **user-triggered**, not agent-triggered. The agent doesn't reliably know when a body of work is "done" — the user does. When the user says "crystallize", "update lexicon", "absorb the retros", "feature X is done", or anything similar, run `lex-crystallize`. Don't volunteer to crystallize unprompted.

### 6. Cold-layer edits go through `lex-crystallize`

Don't edit `lexicon/system.md` or `lexicon/views/*.md` as a drive-by side effect of unrelated work. Cold-layer changes are deliberate: propose the diff in conversation, get explicit approval, then apply. `lex-crystallize` is the skill that does this; outside of it, leave the cold layer alone. (Direct edits ARE fine when the user explicitly asks for them — e.g. "fix this typo in system.md".)

### 7. ADRs are append-only

Skills *can* append directly to `lexicon/decisions/` without going through crystallize. ADRs are history, not changes to the canonical model.

### 8. Calibration over time

If `lexicon/calibration.md` exists, read it. It contains project-specific notes about what counts as significant — overrides for the skills' default sense. When the user rejects a flagged drift as noise or flags a missed change, encourage them to add a line to `calibration.md`.

## When this workflow doesn't apply

If a project has no `lexicon/` folder, the user is on a project that doesn't (yet) use lexicon. **Don't force it.** Surface once, near the start of substantive work: "This project doesn't have lexicon docs. Want to run `lex-bootstrap`?" — and respect a "no" by not asking again that session (`lex-ground` describes the marker-file approach for skipping across sessions).

The workflow is opt-in per project. Small scripts, throwaway prototypes, and exploratory notebooks usually don't benefit from it.

## Honest limitations

- **The agent is a fallible filter.** Drift flags will sometimes be noise; real changes will sometimes be missed. `calibration.md` is the correction, not the per-session judgment.
- **Cold-layer rot is real.** If `system.md` isn't getting updated despite repeated retros surfacing drift, the workflow degrades to ceremony. The *user* has to actually run `lex-crystallize` periodically; no skill design fixes a doc that's never reviewed.
- **Concurrent agents.** If you run multiple sessions on the same repo, lexicon doesn't coordinate them — each session reads `system.md`, does its work, writes its retro. Conflicts (on retros, on crystallize-time edits) surface as ordinary git conflicts. Lexicon doesn't try to prevent this; it just stays out of the way.

## Templates

Templates for `system.md`, Domain Views, plans, and ADRs ship inside the `lex-bootstrap` skill folder, in a `templates/` directory next to its `SKILL.md`. `lex-bootstrap` references these when adopting lexicon in a new project. They live there (not at the repo root) so they remain reachable when this plugin is installed via `npx skills` — which only copies the skill folder itself.
