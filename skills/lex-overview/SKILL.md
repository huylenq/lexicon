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
  plans/
    _active/                        ← soft locks declaring what each session is touching
    _scratch/                       ← per-session ephemeral notes
    _proposals/                     ← session-end diffs awaiting human merge
    _retros/                        ← always-written session logs
    _archive/                       ← landed plans and accepted crystallizations
    <feature>/                      ← in-flight materialized plans
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

- **`lex-bootstrap`** — Runs **once** at adoption time. Scans existing docs and code, drafts a first-cut `system.md`, migrates ADR-shaped content, sets up the directory structure, and produces a triage report. Trigger: "set up lexicon", "adopt lexicon", "bootstrap lexicon", or `lex-ground` deferring on a project with no `system.md`.
- **`lex-ground`** — Runs at the start of substantive coding work. Reads `system.md`, declares scope (terms, invariants, bounded context), checks for in-flight work by other agents, opens a scratchpad. Trigger: any non-trivial task.
- **`lex-retro`** — Runs at every natural stopping point. Always writes a log; only escalates to a proposal when structural triggers fire (vocabulary, invariants, boundaries). Trigger: completion signals like "looks good", "we're done", tests pass and user moves on.
- **`lex-crystallize`** — Runs at feature completion (multi-session). Reviews the cumulative diff against `system.md` and proposes a coherent set of updates. Trigger: "feature X is done", "we're shipping X", a `lexicon/plans/<feature>/` reaching completion.
- **`lex-audit`** — Runs periodically (quarterly, on demand, or before planning sessions). Re-validates `system.md` against current code to catch backward-flow drift — stale glossary, dead invariants, undeclared contexts, hygiene rot. Produces a triage list, never edits `system.md` directly. Trigger: "audit lexicon", "sanity-check the docs", "is `system.md` still accurate?".

### Forward-flow vs backward-flow drift

A subtle but important distinction. `lex-retro` and `lex-crystallize` catch **forward-flow drift** — new work introducing inconsistency, surfaced at the cheapest moment. They are blind to **backward-flow drift** — `system.md` claims things that *used to be true*. A term that got renamed in code six sessions ago, an invariant that's quietly violated, a context boundary that's leaked. `lex-audit` exists specifically for that asymmetry: the architecture is eventually consistent in the forward direction only, and audit closes the loop.

## Structural checks

Three skills (`lex-retro`, `lex-crystallize`, `lex-audit`) run the same six checks at different scopes and in different directions. Definitions live here so they stay in sync.

The six checks:

1. **Vocabulary** — Was a noun or verb used (in code: class/type/function/key parameter names; in conversation: terms used repeatedly) that isn't in `system.md`'s glossary or the relevant view's glossary?
2. **Vocabulary consistency** — Was a glossary term used in a way that doesn't match its definition? **High priority** — this is the silent-renaming bug.
3. **Invariants** — Did the work violate, refine, or contradict any invariant in `system.md`? Re-read each invariant and ask: would it still hold given the current code?
4. **Boundaries** — Did the work cross a boundary in `system.md`'s bounded contexts? (New import edge, new call site, new shared state across a previously clean boundary.)
5. **Decisions** — Were any non-obvious choices made — picking approach A over B for reasons future-readers wouldn't recover from the code alone? These warrant an ADR rather than a `system.md` proposal.
6. **Declared scope match** — Did the actual work stay within the scope declared in `_active/<session-id>.md`? When it drifted, the *reason* often reveals a model gap.

### Per-skill direction

Same checks, different application:

- **`lex-retro`** runs them forward against one session's diff: *"did this session introduce anything that conflicts with `system.md`?"*
- **`lex-crystallize`** runs them forward against a feature's cumulative diff: *"did the feature as a whole shift the model?"* Filter for terms that stuck across sessions, invariants that genuinely changed, boundaries that genuinely redrew.
- **`lex-audit`** runs them backward against existing `system.md` claims: *"for each entry / invariant / boundary in `system.md`, does it still hold in current code?"* Audit also runs hygiene, calibration, and distillation-completion phases that have no forward-flow analogue — see `lex-audit` for those.

### Domain Views scoping

If the project uses Domain Views (`lexicon/views/*.md`), each check is scoped: first against the view(s) covering the relevant bounded context, then against `system.md` for cross-cutting concerns. Flags on view-owned content target that view; flags on cross-cutting concerns target `system.md`. Name the target file(s) explicitly in any proposal.

## Rules of engagement

These apply whenever a project has `lexicon/system.md`.

### 1. Read `system.md` first (and relevant views)

Before substantive work, read `system.md` end to end. It's small by design — under ~500 lines. If it's longer, surface it to the user as a sign the cold doc is rotting (or a sign the project has outgrown one file and should consider Domain Views).

If `lexicon/views/` exists, also read the view(s) matching the bounded context of the work being done. `system.md`'s bounded-contexts index points at the relevant view files. Loading every view eagerly defeats the partitioning — load only what's relevant. When in doubt, ask the user which context the work is in.

### 2. Ground before code

For any task that isn't strictly mechanical (typo fixes, dependency bumps, log tweaks), invoke `lex-ground` before writing or modifying code. Skipping grounding is the most common source of silent drift.

### 3. Surface contradictions

If `lexicon/system.md` contradicts the code or the user's request, **stop and surface it before proceeding**. Don't quietly work around it. Don't hallucinate that the doc is right.

### 4. Announce before claiming

When `lex-ground` writes `lexicon/plans/_active/<session-id>.md`, it's a soft lock — it announces what this session is touching. Other concurrent sessions read these to detect overlap. Don't skip this even for short sessions.

### 5. Always retro

At any natural stopping point, run `lex-retro`. Most retros are silent (a log entry only). The point is the question gets asked every time, so structural drift is caught at the cheapest moment.

### 6. Crystallize features, not sessions

When a multi-session feature is complete, run `lex-crystallize`. Only fires for features, not sessions. The user typically signals this with phrases like "feature X is done."

### 7. `system.md` (and views) are write-protected

Skills propose changes to `lexicon/system.md` and `lexicon/views/*.md` via files in `lexicon/plans/_proposals/`. They never edit these files directly. The user reviews and explicitly accepts proposals before the diff is applied. This is the serialization point that makes concurrent agents safe. A proposal can target one view, multiple views, `system.md`, or any combination — name the targets explicitly in the proposal header.

### 8. ADRs are append-only

Skills *can* append directly to `lexicon/decisions/` without a proposal step. ADRs are history, not changes to the canonical model.

### 9. Concurrent-session awareness

When multiple coding sessions are active in the same repo, each shards its files by session ID. The `lex-ground` skill reads sibling `_active/` files to detect overlap and surfaces it to the user. This doesn't prevent overlap — it announces it, so the user can decide.

### 10. Calibration over time

If `lexicon/calibration.md` exists, read it. It contains project-specific notes about what counts as significant — overrides for the skills' default sense. When the user rejects a proposal as noise or flags a missed change, encourage them to add a line to `calibration.md`.

## Session ID

Each session needs a unique ID for sharding files. The `lex-ground` skill mints one if `$LEXICON_SESSION_ID` isn't set, and writes it to `lexicon/plans/_scratch/.session-id` so subsequent skill invocations in the same session can find it. Use the same ID throughout a session.

## When this workflow doesn't apply

If a project has no `lexicon/` folder, the user is on a project that doesn't (yet) use lexicon. **Don't force it.** Surface once, near the start of substantive work: "This project doesn't have lexicon docs. Want to run `lex-bootstrap`?" — and respect a "no" by not asking again that session (`lex-ground` describes the marker-file approach for skipping across sessions).

The workflow is opt-in per project. Small scripts, throwaway prototypes, and exploratory notebooks usually don't benefit from it.

## Honest limitations

- **Concurrent code conflicts** are still a git problem, not a doc problem. Lexicon reduces the *probability* of conflict by making in-flight work visible, but it doesn't prevent two sessions from editing the same lines.
- **The agent is a fallible filter.** Proposals will sometimes be noise; real changes will sometimes be missed. The aggregation pass (future skill) and `calibration.md` are the corrections, not the per-session judgment.
- **Cold-layer rot is real.** If `system.md` isn't getting updated despite repeated proposals, the workflow degrades to ceremony. The *user* has to take crystallization seriously; no skill design fixes a doc that's never reviewed.

## Templates

Templates for `system.md`, Domain Views, plans, and ADRs ship inside the `lex-bootstrap` skill folder, in a `templates/` directory next to its `SKILL.md`. `lex-bootstrap` references these when adopting lexicon in a new project. They live there (not at the repo root) so they remain reachable when this plugin is installed via `npx skills` — which only copies the skill folder itself.
