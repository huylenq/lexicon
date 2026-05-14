---
name: lex-overview
description: "Load at the start of any session in a project that has lexicon/system.yaml, whenever another lexicon skill (lex-bootstrap, lex-ground, lex-retro, lex-crystallize, lex-audit, lex-migrate, lex-meta) is about to run, or when the user asks about the lexicon workflow. Defines the shared rules, the cold-layer YAML schema, and the structural checks the other skills depend on. Load this first; the others assume it is in context."
---

# Lexicon: workflow overview

This skill is the **rulebook** for the lexicon workflow. Seven skills implement specific moments in the loop — one adoption-time (`lex-bootstrap`), three operational (`lex-ground`, `lex-retro`, `lex-crystallize`), one periodic-maintenance (`lex-audit`), one format-migration (`lex-migrate`), and one self-evolve channel (`lex-meta`) that lets the bundle itself learn from corrections; this skill explains how they fit together.

If you're loading this in response to one of the other skills, you only need the **Project shape**, **Schema** (in the sibling `SCHEMA.md`), and **Rules of engagement** sections — skim and proceed.

## Core idea

Code is the executable spec — it evolves freely, always true to itself. Above the code, a small **cold layer** captures things code can't express well: vocabulary, invariants, bounded contexts, and the "why"s. The cold layer evolves at the speed of *learning*, not the speed of typing. Per-feature plans are a **hot layer** that lives briefly and gets absorbed into the cold layer (or discarded) when work lands.

The whole system rests on **ubiquitous language** in the DDD sense: the same nouns and verbs appear in the cold layer, in conversation, and in code. When all three layers use the same vocabulary, mental-model alignment between human and agent is enforced by repetition rather than by remembering.

The cold layer is **structured YAML files**, not markdown prose. Each entity (term, invariant, bounded context, decision, surface, region) is a typed record with a stable ID and prose-bearing fields (definition, statement, rationale, body). The structure pays for itself: agent and tool can reason about the graph; the human reads the prose. Migration from earlier markdown-based lexicon (v0.x) goes through `lex-migrate`.

When the project has a UI surface — web pages, desktop windows, mobile screens, CLI/TUI panes, print layouts, voice-skill turns, anything rendered for a human — design vocabulary counts as ubiquitous language too. Not just tokens and reusable components, but also **surfaces** (named top-level views/screens/windows) and the **regions** within them (sidebars, toolbars, canvases, hero blocks, banners), plus interaction patterns and accessibility contracts. It lives in the same cold-layer files. The structural checks below don't split for it.

Regions in particular need a small framing: **a region earns a name when the team refers to it as a discrete piece, regardless of whether it's been factored into its own component file.** Implementation status — extracted artifact vs inline block at file:line — is metadata, not a gate on naming. Naming the inline ones is exactly what lets the team and the agent talk about them precisely.

## Project shape

A project using lexicon has:

```
lexicon/
  system.yaml                       ← the cold layer root (holistic entry point)
  contexts/                         ← one file per bounded context
    <context-slug>.yaml
  decisions/                        ← one file per ADR, append-only
    ADR-<NNNN>-<slug>.yaml
  surfaces/                         ← optional: UI surfaces with regions
    <surface-slug>.yaml
  retros/                           ← always-written session logs (timestamp-named markdown for now)
  audits/                           ← audit reports (markdown)
  bootstrap.md                      ← one-shot adoption triage report (created by lex-bootstrap)
  .last-crystallized                ← ISO timestamp marker; lex-crystallize reads retros newer than this
  plans/
    <feature>/                      ← in-flight materialized plans
    _archive/                       ← archived plan folders
```

If a project doesn't have this structure, the **`lex-bootstrap`** skill is the one-shot adoption pass that creates it. The user opts in per project — lexicon is not forced on every project.

A project still carrying v0.x markdown (`system.md`, `views/*.md`, `decisions/*.md`) is migrated with **`lex-migrate`** before the operational skills run against it. Don't manually port markdown to YAML — the migration is mechanical and the agent should not improvise it.

### `system.yaml` size

The root file still has a soft ceiling around 500 lines. Past that, partition into per-context files under `lexicon/contexts/`. Structured YAML can bloat as easily as prose; the bound exists to force the cold doc to stay glanceable.

### Per-context partitions

`lexicon/contexts/<slug>.yaml` is the natural home for a bounded context's owned terms, invariants, seams, and boundary rules. The root `system.yaml` references these contexts by slug and holds only cross-cutting entries (terms/invariants spanning ≥3 contexts) plus the deliberate-omissions list and contexts index.

Simple projects can live with everything in `system.yaml` and an empty `contexts/`. Don't materialize a context file until the context actually owns ≥3 entries; until then it's a one-line index entry in the root.

**Ownership rule**: every term has *exactly one* owning location — either a single context file or `system.yaml`'s cross-cutting glossary. Other contexts may *use* the term but never *redefine* it. `lex-audit` flags violations.

### When *not* to partition

- Simple projects. One `system.yaml` is enough; per-context files add ceremony without payoff.
- Contexts that are still settling. Premature partitioning locks in shapes that may be wrong.
- Contexts with no rich self-contained UL — small contexts stay as one-paragraph entries in `system.yaml`'s `contexts` list, no `contexts/<slug>.yaml` needed. **Not every context needs its own file; that's the most important escape hatch.**

Partitions are non-breaking: adding one later, or absorbing one back into `system.yaml`, is a routine refactor.

## Schema

The normative cold-layer schema lives in `SCHEMA.md` alongside this file. **Read it now** — it's part of this overview, not an external reference. It covers the current schema (v0.2): shared rules (slugs, refs, prose-bearing fields), the four file kinds (`system`, `bounded-context`, `decision`, `surface`), annotated entity shapes for each, anchoring discipline for the optional-but-expected fields, and the backtick convention for names with code identifiers. Migration between schema versions is *not* documented there — that lives in per-version delta files under `skills/lex-migrate/migrations/`.

Other lexicon skills don't read `SCHEMA.md` directly — they get it transitively by loading this overview first. The path to `SCHEMA.md` is "next to this `SKILL.md`," which is symlink-stable across `npx skills` and plugin-namespaced installs alike.

## The seven skills

- **`lex-bootstrap`** — Runs **once** at adoption time. Scans existing docs and code, drafts a first-cut `system.yaml` and per-context files, migrates ADR-shaped content into YAML, sets up the directory structure, and produces a triage report at `lexicon/bootstrap.md`. Trigger: "set up lexicon", "adopt lexicon", "bootstrap lexicon", or `lex-ground` deferring on a project with no `system.yaml`.
- **`lex-ground`** — Runs at the start of substantive coding work. Reads `system.yaml` and relevant context files, declares scope (terms, invariants, bounded context) **in conversation**, surfaces vocabulary gaps. No file writes — the agent's context window holds the grounding for the rest of the session. Trigger: any non-trivial task.
- **`lex-retro`** — Runs at every natural stopping point. Writes a log to `lexicon/retros/<timestamp>.md`, with structural-drift flags inline. Trigger: completion signals like "looks good", "we're done", tests pass and user moves on. *Retros remain markdown for now; structured retros are a future evolution.*
- **`lex-crystallize`** — **User-triggered.** Runs when the user explicitly asks to update the cold layer ("crystallize", "update lexicon", "absorb the retros", "feature X is done"). Reads retros since the last crystallization, cross-checks against git diff, proposes a typed mutation set (creates / updates / renames / deprecations) over the YAML files **inline in conversation**, and applies on user approval. Updates `lexicon/.last-crystallized`.
- **`lex-audit`** — Runs periodically (quarterly, on demand, or before planning sessions). Re-validates the cold-layer YAML against current code to catch backward-flow drift — stale glossary, dead invariants, undeclared contexts, hygiene rot, dangling refs. Writes a triage report to `lexicon/audits/audit-<iso>.md`; never edits cold-layer YAML directly. Trigger: "audit lexicon", "sanity-check the docs", "is the cold layer still accurate?".
- **`lex-migrate`** — Schema and structural migration. Detects the project's current cold-layer schema version, computes the chain of per-version deltas needed to reach the latest supported version (e.g. v0.x markdown → v0.1 → v0.2), and applies each delta in order. The deltas are individual files under `skills/lex-migrate/migrations/v<X>-to-v<Y>.md` — adding support for a future schema bump is one new delta file, not a change to the skill body. Triggers: "migrate lexicon", "upgrade lexicon", "upgrade to v0.2", "lexicon doesn't have narrative / overlays / inline links", or `lex-ground`/`lex-bootstrap`/`lex-audit` detecting structural violations against the latest schema.
- **`lex-meta`** — **User-triggered.** Runs when the user invokes `/lex-meta [optional prompt]` after correcting something a lexicon skill produced. This is the self-evolve channel for the skill bundle itself: takes the conversation (primary signal) and the project's `lexicon/` diff (corroborating), interviews to disambiguate, then amends the responsible `~/src/lexicon/skills/<skill>/SKILL.md`. Cross-repo write; leaves the bundle repo uncommitted so accumulated edits stay visible until you deliberately push.

### Forward-flow vs backward-flow drift

A subtle but important distinction. `lex-retro` and `lex-crystallize` catch **forward-flow drift** — new work introducing inconsistency, surfaced at the cheapest moment. They are blind to **backward-flow drift** — the cold layer claims things that *used to be true*. A term that got renamed in code six sessions ago, an invariant that's quietly violated, a context boundary that's leaked. `lex-audit` exists specifically for that asymmetry: the architecture is eventually consistent in the forward direction only, and audit closes the loop.

## Structural checks

Three skills (`lex-retro`, `lex-crystallize`, `lex-audit`) run the same six checks at different scopes and in different directions. Definitions live here so they stay in sync.

The six checks:

1. **Vocabulary** — Was a noun or verb used (in code: class/type/function/key parameter names; in conversation: terms used repeatedly) that isn't in the cold layer's glossary?
2. **Vocabulary consistency** — Was a glossary term used in a way that doesn't match its definition? **High priority** — this is the silent-renaming bug.
3. **Invariants** — Did the work violate, refine, or contradict any invariant? Re-read each invariant and ask: would it still hold given the current code?
4. **Boundaries** — Did the work cross a boundary in the bounded-contexts model? (New import edge, new call site, new shared state across a previously clean boundary.)
5. **Decisions** — Were any non-obvious choices made — picking approach A over B for reasons future-readers wouldn't recover from the code alone? These warrant an ADR rather than a glossary/invariant edit.
6. **Declared scope match** — Did the actual work stay within the scope the agent grounded on? When it drifted, the *reason* often reveals a model gap.

### Per-skill direction

Same checks, different application:

- **`lex-retro`** runs them forward against one session's diff: *"did this session introduce anything that conflicts with the cold layer?"* Flags land inline in the retro file.
- **`lex-crystallize`** runs them forward against the cumulative diff since the last crystallization: *"did the accumulated work shift the model?"* Filter for terms that stuck across sessions, invariants that genuinely changed, boundaries that genuinely redrew.
- **`lex-audit`** runs them backward against existing cold-layer claims: *"for each entry / invariant / boundary, does it still hold in current code?"* Audit also runs hygiene and distillation-completion phases that have no forward-flow analogue — see `lex-audit` for those.

### Context-file scoping

Each check is scoped: first against the context file(s) covering the relevant bounded context, then against `system.yaml` for cross-cutting concerns. Flags on context-owned content target the context file; flags on cross-cutting concerns target `system.yaml`. Name the target file(s) explicitly when proposing edits.

### Design-system signals

When the project has a UI surface (one or more `surfaces/<slug>.yaml` files exist), the same six checks pick up design-system drift naturally — design vocabulary is ubiquitous language for the UI, no separate machinery needed.

- **Vocabulary** — new component file, new token entry in the theme/config, new layout primitive, new interaction pattern, **a new named region inside a surface (extracted *or* inline)**. An inline region introduced without a name in the cold layer is just as much vocabulary drift as an unnamed extracted component — the conversational referent exists either way.
- **Vocabulary consistency** — hex / px / rem literal outside the token file; raw `<button>` where `<Button>` exists; component imported from a path that bypasses the design-system root; **the same region called by two different names across files**.
- **Invariants** — accessibility contracts (visible focus, color contrast, keyboard navigation, label-input pairing). Most are validatable via linters or axe-core; surface the violation when tooling flags it.
- **Boundaries** — design-system seam: interactive primitives only via wrapper components; styling only via tokens, not inline values; **named regions stay scoped to their owning surface (a region referenced from a second surface is either misnamed or being promoted to a primitive — both worth flagging)**.
- **Decisions** — "drawer over modal because…" — same shape as code decisions.
- **Scope match** — grounding said "small UI tweak" but the diff added a new token or component — scope drift.

If no `surfaces/` files exist and no design tokens/components appear in code, these signals are no-ops — backend-only projects skip naturally.

## Rules of engagement

These apply whenever a project has `lexicon/system.yaml`.

### 1. Read `system.yaml` first (and relevant context files)

Before substantive work, read `system.yaml` end to end. It's small by design — under ~500 lines. If it's longer, surface it to the user as a sign the cold doc is rotting (or a sign the project has outgrown one file and should partition into `contexts/<slug>.yaml` files).

If `lexicon/contexts/` exists, also read the context file(s) matching the bounded context of the work being done. `system.yaml`'s `contexts` index lists the available slugs. Loading every context file eagerly defeats the partitioning — load only what's relevant. When in doubt, ask the user which context the work is in.

### 2. Ground before code

For any task that isn't strictly mechanical (typo fixes, dependency bumps, log tweaks), invoke `lex-ground` before writing or modifying code. Skipping grounding is the most common source of silent drift.

### 3. Surface contradictions

If the cold-layer YAML contradicts the code or the user's request, **stop and surface it before proceeding**. Don't quietly work around it. Don't hallucinate that the doc is right.

### 4. Always retro

At any natural stopping point, run `lex-retro`. Most retros log only the session summary; the structural-check section flags drift only when triggers actually fire. The point is the question gets asked every time, so structural drift is caught at the cheapest moment.

### 5. Crystallize on the user's call

`lex-crystallize` is **user-triggered**, not agent-triggered. The agent doesn't reliably know when a body of work is "done" — the user does. When the user says "crystallize", "update lexicon", "absorb the retros", "feature X is done", or anything similar, run `lex-crystallize`. Don't volunteer to crystallize unprompted.

### 6. Cold-layer edits go through `lex-crystallize`

Don't edit `lexicon/system.yaml`, `lexicon/contexts/*.yaml`, or `lexicon/surfaces/*.yaml` as a drive-by side effect of unrelated work. Cold-layer changes are deliberate: propose the typed mutations in conversation, get explicit approval, then apply. `lex-crystallize` is the skill that does this; outside of it, leave the cold layer alone. (Direct edits ARE fine when the user explicitly asks for them — e.g. "fix this typo in system.yaml".)

This applies to the design-system files too. Adding "just one more shade of blue" to the token list, or naming a new component inline, is a cold-layer edit — route through `lex-crystallize` like any other vocabulary addition.

### 7. ADRs are append-only

Skills *can* append directly to `lexicon/decisions/` without going through crystallize. ADRs are history, not changes to the canonical model. Status transitions (`accepted` → `superseded`) are the only legitimate mutation on an existing ADR file, and they go through `lex-crystallize` so the supersession edge is set on both sides.

### 8. IDs are slugs; rename ≠ re-slug

Display `name` mutates freely. The `id` (slug) is the stable handle. Refs in other files use the slug; renaming a slug breaks them. When a slug genuinely no longer fits the concept, treat it as a `lex-crystallize` rename operation — the skill applies the slug change and cascades the reference updates in a single typed mutation.

### 9. Load `lexicon-prefs.md` and respect "for lexicon: …" feedback

At session start (when this skill loads), also load `~/src/lexicon/lexicon-prefs.md` if it exists. The path is hardcoded for now while lexicon iterates. The file holds the user's personal overrides for skill behavior — workflow preferences, style, significance calibration, patterns about how the user works. Treat its entries as **live overrides** of skill defaults: a rule there takes precedence over a default rule here or in another skill body, until a future curation absorbs it back into the skill itself.

When the user says **"for lexicon: <X>"** (or "for lexicon, <X>" / "for lexicon — <X>") during a session, append an entry to the relevant section of `lexicon-prefs.md`. This is the explicit feedback channel into the lexicon skill layer; it is distinct from generic "remember that" (which goes to project memory or the user's PKM, not here). Don't intercept the generic phrasing.

Project-specific overrides (the role formerly played by `lexicon/calibration.md`) live in the project's `CLAUDE.md`, which is the natural home for them.

## When this workflow doesn't apply

If a project has no `lexicon/` folder, the user is on a project that doesn't (yet) use lexicon. **Don't force it.** Surface once, near the start of substantive work: "This project doesn't have lexicon docs. Want to run `lex-bootstrap`?" — and respect a "no" by not asking again that session (`lex-ground` describes the marker-file approach for skipping across sessions).

If a project has `lexicon/system.md` but no `lexicon/system.yaml`, it's on the v0.x markdown layout. Surface once: "This project is on the markdown-era lexicon. Want to run `lex-migrate` first?" Respect a "no"; the operational skills won't run cleanly until migration happens, and the user will see the consequences.

The workflow is opt-in per project. Small scripts, throwaway prototypes, and exploratory notebooks usually don't benefit from it.

## Honest limitations

- **The agent is a fallible filter.** Drift flags will sometimes be noise; real changes will sometimes be missed. `lexicon-prefs.md` (Calibration section) is where corrections accumulate, not the per-session judgment.
- **Cold-layer rot is real.** If the cold layer isn't getting updated despite repeated retros surfacing drift, the workflow degrades to ceremony. The *user* has to actually run `lex-crystallize` periodically; no skill design fixes a doc that's never reviewed.
- **Transitional state.** `lex-ground`, `lex-retro`, `lex-audit` are still mid-migration — their bodies will be updated in a follow-up release to read/write YAML natively. Until then, they treat YAML as canonical but their internal phrasing may still reference `system.md`. `SCHEMA.md` is the source of truth.
- **Concurrent agents.** If you run multiple sessions on the same repo, lexicon doesn't coordinate them — each session reads the cold layer, does its work, writes its retro. Conflicts surface as ordinary git conflicts. Lexicon doesn't try to prevent this; it just stays out of the way.

## Templates and examples

Annotated YAML example files ship inside the `lex-bootstrap` skill folder, in a `templates/` directory next to its `SKILL.md`. `lex-bootstrap` references these when adopting lexicon in a new project. They live there (not at the repo root) so they remain reachable when this plugin is installed via `npx skills` — which only copies the skill folder itself.

The schema specification in `SCHEMA.md` (alongside this file) is normative; examples are reference shapes only.
