---
name: overview
description: "Read this skill at the start of any session in a project that has a docs/system.md file, OR whenever any other lexicon skill (ground, retro, crystallize) is about to run, OR when the user asks about the lexicon workflow. This skill defines the rules of the document-mediated workflow that the other lexicon skills implement. Other lexicon skills assume this content is in context — load this first. Skipping it means the other skills won't know how the pieces fit together."
---

# Lexicon: workflow overview

This skill is the **rulebook** for the lexicon workflow. The three operational skills (`ground`, `retro`, `crystallize`) implement specific moments in the loop; this skill explains how they fit together.

If you're loading this in response to one of the other skills, you only need the **Project shape** and **Rules of engagement** sections — skim and proceed.

## Core idea

Code is the executable spec — it evolves freely, always true to itself. Above the code, a small **cold layer** (`docs/system.md`) captures things code can't express well: vocabulary, invariants, bounded contexts, and the "why"s. The cold layer evolves at the speed of *learning*, not the speed of typing. Per-feature plans are a **hot layer** that lives briefly and gets absorbed into the cold layer (or discarded) when work lands.

The whole system rests on **ubiquitous language** in the DDD sense: the same nouns and verbs appear in `system.md`, in conversation, and in code. When all three layers use the same vocabulary, mental-model alignment between human and agent is enforced by repetition rather than by remembering.

## Project shape

A project using lexicon has:

```
docs/
  system.md                         ← the cold layer
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

If a project doesn't have this structure, the **ground** skill offers to bootstrap it. The user opts in per project — lexicon is not forced on every project.

## The three skills

- **`lexicon:ground`** — Runs at the start of substantive coding work. Reads `system.md`, declares scope (terms, invariants, bounded context), checks for in-flight work by other agents, opens a scratchpad. Trigger: any non-trivial task.
- **`lexicon:retro`** — Runs at every natural stopping point. Always writes a log; only escalates to a proposal when structural triggers fire (vocabulary, invariants, boundaries). Trigger: completion signals like "looks good", "we're done", tests pass and user moves on.
- **`lexicon:crystallize`** — Runs at feature completion (multi-session). Reviews the cumulative diff against `system.md` and proposes a coherent set of updates. Trigger: "feature X is done", "we're shipping X", a `docs/plans/<feature>/` reaching completion.

## Rules of engagement

These apply whenever a project has `docs/system.md`.

### 1. Read `system.md` first

Before substantive work, read it end to end. It's small by design — under ~500 lines. If it's longer, surface it to the user as a sign the cold doc is rotting.

### 2. Ground before code

For any task that isn't strictly mechanical (typo fixes, dependency bumps, log tweaks), invoke `lexicon:ground` before writing or modifying code. Skipping grounding is the most common source of silent drift.

### 3. Surface contradictions

If `docs/system.md` contradicts the code or the user's request, **stop and surface it before proceeding**. Don't quietly work around it. Don't hallucinate that the doc is right.

### 4. Announce before claiming

When `lexicon:ground` writes `docs/plans/_active/<session-id>.md`, it's a soft lock — it announces what this session is touching. Other concurrent sessions read these to detect overlap. Don't skip this even for short sessions.

### 5. Always retro

At any natural stopping point, run `lexicon:retro`. Most retros are silent (a log entry only). The point is the question gets asked every time, so structural drift is caught at the cheapest moment.

### 6. Crystallize features, not sessions

When a multi-session feature is complete, run `lexicon:crystallize`. Only fires for features, not sessions. The user typically signals this with phrases like "feature X is done."

### 7. `system.md` is write-protected

Skills propose changes to `docs/system.md` via files in `docs/plans/_proposals/`. They never edit `system.md` directly. The user reviews and explicitly accepts proposals before the diff is applied. This is the serialization point that makes concurrent agents safe.

### 8. ADRs are append-only

Skills *can* append directly to `docs/decisions/` without a proposal step. ADRs are history, not changes to the canonical model.

### 9. Concurrent-session awareness

When multiple coding sessions are active in the same repo, each shards its files by session ID. The `ground` skill reads sibling `_active/` files to detect overlap and surfaces it to the user. This doesn't prevent overlap — it announces it, so the user can decide.

### 10. Calibration over time

If `docs/calibration.md` exists, read it. It contains project-specific notes about what counts as significant — overrides for the skills' default sense. When the user rejects a proposal as noise or flags a missed change, encourage them to add a line to `calibration.md`.

## Session ID

Each session needs a unique ID for sharding files. The `ground` skill mints one if `$LEXICON_SESSION_ID` isn't set, and writes it to `docs/plans/_scratch/.session-id` so subsequent skill invocations in the same session can find it. Use the same ID throughout a session.

## When this workflow doesn't apply

If a project has no `docs/system.md` and no `docs/` folder, the user is on a project that doesn't (yet) use lexicon. **Don't force it.** Ask once, near the start of substantive work: "This project doesn't have lexicon docs. Want me to bootstrap them?" If the user says no, drop it and work normally for this session. Don't ask again.

The workflow is opt-in per project. Small scripts, throwaway prototypes, and exploratory notebooks usually don't benefit from it.

## Honest limitations

- **Concurrent code conflicts** are still a git problem, not a doc problem. Lexicon reduces the *probability* of conflict by making in-flight work visible, but it doesn't prevent two sessions from editing the same lines.
- **The agent is a fallible filter.** Proposals will sometimes be noise; real changes will sometimes be missed. The aggregation pass (future skill) and `calibration.md` are the corrections, not the per-session judgment.
- **Cold-layer rot is real.** If `system.md` isn't getting updated despite repeated proposals, the workflow degrades to ceremony. The *user* has to take crystallization seriously; no skill design fixes a doc that's never reviewed.

## Templates

The plugin ships templates for `system.md`, plans, and ADRs at `${CLAUDE_PLUGIN_ROOT}/templates/`. The `ground` skill references these when bootstrapping a new project.
