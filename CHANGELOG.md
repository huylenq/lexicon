# Changelog

All notable changes to lexicon will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with the following convention:

- **Major** — the project shape changes (breaks existing `docs/` structures).
- **Minor** — skill behavior changes meaningfully (escalation rules, scope of checks, new skills).
- **Patch** — skill description tuning, prose edits, bug fixes in templates.

## [0.1.0] - 2026-05-04

Initial release. The shape is plausible but unproven on real projects.

### Added
- `lexicon:overview` — the rulebook, loaded by other skills at session start.
- `lexicon:ground` — runs at the start of substantive coding work; bootstraps `docs/` structure on first use, declares scope, opens scratchpad.
- `lexicon:retro` — runs at every natural stopping point; always logs, escalates only on structural triggers (vocabulary, invariants, boundaries).
- `lexicon:crystallize` — runs at multi-session feature completion; reviews cumulative diff against `system.md` and proposes coherent updates.
- Templates for `system.md`, plans, and ADRs.

### Deliberately not included
- **Stop hook for retro enforcement.** Considered but dropped — Claude Code's `Stop` event fires on every agent→user turn, not at session end, so a hook there would be excessively noisy. The pushy skill descriptions are the only enforcement mechanism in v0.1.0. See `CLAUDE.md` for the reasoning and what a future session-end signal would need.
- **Materialize-plan skill.** Native plan mode and `docs/plans/<feature>/` are meant to compose, but the right shape needs real-world signal before committing.
- **Periodic-aggregation pass.** A skill that sweeps multiple retros to find patterns across sessions. Worth adding once proposal volume justifies it.

### Known unknowns
- Triggering accuracy of skill descriptions on real projects.
- Calibration of structural triggers — what fraction of escalations turn out to be noise.
- Whether the `overview` skill reliably loads when cross-referenced from other skills.
