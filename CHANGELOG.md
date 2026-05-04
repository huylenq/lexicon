# Changelog

All notable changes to lexicon will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with the following convention:

- **Major** — the project shape changes (breaks existing `docs/` structures).
- **Minor** — skill behavior changes meaningfully (escalation rules, scope of checks, new skills).
- **Patch** — skill description tuning, prose edits, bug fixes in templates.

## [0.3.0] - 2026-05-04

### Added
- `lex-audit` — periodic-maintenance skill. The complementary refresh pass to `lex-bootstrap`'s adoption pass: bootstrap absorbs initial truth; audit catches drift accumulated since. Specifically catches **backward-flow drift** that `lex-retro` and `lex-crystallize` are structurally blind to — `system.md` claims things that *used to be true* (stale glossary entries, dead invariants, undeclared bounded contexts, hygiene rot in `docs/plans/`). Read-mostly: produces a triage report under `docs/plans/_proposals/audit-<iso>.md` with calibrated flags (high-priority definition mismatches, possibly-violated invariants distinguishing "stale doc" from "code regression", boundary leakage, orphaned `_active/` files, untriaged proposals, retro-volume warnings, calibration coherence). Never unilaterally edits `system.md` or deletes plan/retro files. Supports targeted mode for narrower checks ("audit just the glossary").

### Why ship audit now (vs deferring further)

v0.2.0's notes said audit was deferred until real usage data on drift patterns. We're shipping it earlier on the bet that **its absence is itself the design risk**: without audit, projects that adopt lexicon and then go quiet for a few months silently accumulate exactly the kind of rot the workflow exists to prevent. The structural checks in audit are derived from the same primitives as `lex-retro` (vocabulary/invariants/boundaries), just applied at project scope and in the backward direction, so the design isn't speculative — it inverts the existing model. Calibration of the checks (what fraction of flags turn out to be noise) still depends on real usage, but that's a tunable not a structural unknown.

## [0.2.0] - 2026-05-04

### Added
- `lex-bootstrap` — dedicated one-shot adoption skill. Replaces the bootstrap subroutine that previously lived inside `lex-ground`. Unlike the old subroutine (which only scanned the codebase), this skill scans existing docs *and* code, distills a first-cut `system.md` from the intersection, migrates ADR-shaped content into `docs/decisions/`, and produces a triage report under `docs/plans/_proposals/bootstrap-<iso>.md`. The triage report flags drift between docs and code, vocabulary inconsistencies, and recommended (but not auto-executed) file moves.

### Changed
- `lex-ground` no longer bootstraps inline. When it encounters a project without `docs/system.md`, it surfaces and defers to `lex-bootstrap`. Reasoning: the doc-audit and code-audit phases are too heavyweight to fold into per-task grounding, and shortcutting them produces a `system.md` that misses content already sitting in existing `docs/`.
- Templates moved from `skills/lex-ground/templates/` to `skills/lex-bootstrap/templates/` (now the canonical user).

### Why a separate bootstrap skill
The migration question for projects with existing docs surfaced a real gap: the old inline bootstrap was code-only, so it ignored exactly the kind of pre-existing cold-layer content (architecture docs, design notes, RFCs) that's the highest-value extraction zone. Splitting bootstrap into its own skill lets it spend tokens on a doc audit, a cross-reference between doc vocabulary and code identifiers, and a structured triage report — work that doesn't fit inside a per-task grounding step.

## [0.1.0] - 2026-05-04

Initial release. The shape is plausible but unproven on real projects.

### Added
- `lex-overview` — the rulebook, loaded by other skills at session start.
- `lex-ground` — runs at the start of substantive coding work; bootstraps `docs/` structure on first use, declares scope, opens scratchpad.
- `lex-retro` — runs at every natural stopping point; always logs, escalates only on structural triggers (vocabulary, invariants, boundaries).
- `lex-crystallize` — runs at multi-session feature completion; reviews cumulative diff against `system.md` and proposes coherent updates.
- Templates for `system.md`, plans, and ADRs (shipped inside the `lex-ground` skill folder so they remain reachable when installed via `npx skills`, not just as a Claude Code plugin).

### Skill naming

Skills use a flat `lex-*` prefix (`lex-overview`, `lex-ground`, `lex-retro`, `lex-crystallize`) rather than relying on Claude Code's plugin namespace (`lexicon:ground`). This is because `npx skills` — a common alternate install path — doesn't apply marketplace prefixes. Flat-prefixed names work identically in both install modes.

### Deliberately not included
- **Stop hook for retro enforcement.** Considered but dropped — Claude Code's `Stop` event fires on every agent→user turn, not at session end, so a hook there would be excessively noisy. The pushy skill descriptions are the only enforcement mechanism in v0.1.0. See `CLAUDE.md` for the reasoning and what a future session-end signal would need.
- **Materialize-plan skill.** Native plan mode and `docs/plans/<feature>/` are meant to compose, but the right shape needs real-world signal before committing.
- **Periodic-aggregation pass.** A skill that sweeps multiple retros to find patterns across sessions. Worth adding once proposal volume justifies it.
- ~~**Lex-audit skill.**~~ Shipped in v0.3.0 — see above.

### Known unknowns
- Triggering accuracy of skill descriptions on real projects.
- Calibration of structural triggers — what fraction of escalations turn out to be noise.
- Whether the `overview` skill reliably loads when cross-referenced from other skills.
