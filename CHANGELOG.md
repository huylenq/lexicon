# Changelog

All notable changes to lexicon will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with the following convention:

- **Major** — the project shape changes (breaks existing `lexicon/` structures).
- **Minor** — skill behavior changes meaningfully (escalation rules, scope of checks, new skills).
- **Patch** — skill description tuning, prose edits, bug fixes in templates.

While in 0.x, breaking project-shape changes bump the minor (0.x.0 → 0.(x+1).0); the major bump is reserved for a stability commitment at 1.0.

## [0.5.0] - 2026-05-04

### BREAKING

- **Removed `_proposals/`, `_active/`, `_scratch/`.** The two-stage proposal flow and per-session file sharding are gone. The properties they protected (deliberate cold-layer review, multi-agent safety) turned out to be either already-provided-by-the-Edit-approval-loop or hypothetical-in-practice. See `CLAUDE.md` § "Why we removed proposals and session sharding" for the full reasoning.

- **`retros/` promoted to top-level.** Was `lexicon/plans/_retros/`; now `lexicon/retros/`. With `_active/`, `_scratch/`, `_proposals/` gone, retros were the only thing left under `plans/` besides feature folders, and they're not feature-scoped — moving them up makes the structure honest.

- **New top-level paths.** `lexicon/audits/` for audit reports (was `_proposals/audit-<iso>.md`). `lexicon/bootstrap.md` for the one-shot adoption report (was `_proposals/bootstrap-<iso>.md`). `lexicon/.last-crystallized` is a new marker file containing an ISO timestamp; `lex-crystallize` reads retros newer than this and updates it on successful application.

  **Migration for existing projects:**
  ```
  git mv lexicon/plans/_retros lexicon/retros
  mkdir lexicon/audits
  # If you have an outstanding bootstrap report:
  git mv lexicon/plans/_proposals/bootstrap-*.md lexicon/bootstrap.md
  # Old audit reports:
  git mv lexicon/plans/_proposals/audit-*.md lexicon/audits/
  # Anything still in _proposals/ that you haven't acted on: triage manually.
  rm -rf lexicon/plans/_active lexicon/plans/_scratch lexicon/plans/_proposals
  # Optional: seed the marker so the first crystallize doesn't re-consider all retros.
  date -u +%Y-%m-%dT%H:%M:%SZ > lexicon/.last-crystallized
  ```

### Changed

- **`lex-crystallize` is now user-triggered with inline application.** Trigger broadens from "feature done" to any user-initiated update ("crystallize", "update lexicon", "absorb the retros", "feature X is done"). Reads retros newer than `.last-crystallized`, cross-checks against `git diff`, proposes the diff inline in chat, and applies on the user's yes — no proposal file. Still includes the "deliberately NOT changing" discipline. Adds a step to surface pre-existing inconsistencies in `system.md` rather than silently smoothing over them.

- **`lex-ground` no longer writes files.** Grounding (scope declaration, vocabulary check) happens in conversation. The agent's context window holds it for the rest of the session. Lost: session ID minting, `_active/<id>.md` lock writes, sibling `_active/` overlap detection, `_scratch/<id>.md` notes. Gained: simplicity.

- **`lex-retro` writes to `lexicon/retros/<iso-timestamp>.md`** (was `_retros/<session-id>.md`). Structural-drift flags land **inline** in the same file under a `## Structural drift` section, instead of triggering a separate proposal file.

- **`lex-audit` hygiene checks updated.** Removed `_active/` orphan checks and `_proposals/` triage checks (those folders no longer exist). Added `.last-crystallized` cadence check (flag if marker is missing or > 60 days while retros show recent activity). Audit report path moves to `lexicon/audits/audit-<iso>.md`.

- **`lex-overview` rules consolidated.** Removed rules 4 ("Announce before claiming"), 9 ("Concurrent-session awareness"), and the "Session ID" section. Added rule 5 ("Crystallize on the user's call") making the user-triggered property explicit. Rule 7 (was "system.md is write-protected") became rule 6 ("Cold-layer edits go through `lex-crystallize`") — same property, different mechanism.

### Why ship 0.5.0

The proposal flow was the single biggest piece of ceremony in the workflow, and it was paying daily cost for protections that turned out to be hypothetical in single-agent interactive use (the dominant mode). Cutting it now — before more projects adopt v0.4.x and accumulate `_proposals/` directories — keeps migration cheap. Per-session sharding came along because once `_active/` and `_scratch/` weren't holding up a coordination protocol, they were just session-ID-named files with no readers.

Risk: if real concurrent-agent use turns out to need coordination, lexicon will need to bring something back. The bet is that git is sufficient and that the rare cases where it isn't are not common enough to justify a daily-cost mechanism.

## [0.4.0] - 2026-05-04

### BREAKING

- **Renamed `docs/` → `lexicon/`** as the lexicon-owned root folder. This avoids colliding with projects that already use `docs/` for runbooks, API references, onboarding guides, etc. — lexicon's structure now lives in its own clearly-named directory and never claims a generic name. All paths inside the tree are unchanged: `lexicon/system.md`, `lexicon/views/`, `lexicon/decisions/`, `lexicon/calibration.md`, `lexicon/plans/{_active,_scratch,_proposals,_retros,_archive,<feature>}/`.

  **Migration for existing projects:** `git mv docs lexicon`, then update any external references (tooling, links, scripts) that hard-coded the old path. No file *contents* need to change — the folder rename is the entire migration.

  **Why this is breaking despite small surface area:** project-shape changes break automation, links, and muscle memory. The CLAUDE.md convention explicitly classes folder renames as a major-equivalent event.

### Changed

- **Skill descriptions trimmed.** All six descriptions now sit between 58–76 words (previously 60–250). The redundant trailing `Read lex-overview if you haven't already this session.` was tightened to `Read lex-overview first.`, and the boilerplate `This is one of N lexicon skills` line was removed entirely (the count had drifted across versions — `lex-ground` and `lex-retro` still claimed "one of three" — and `lex-overview` is the canonical source for the skill list anyway).

- **Structural checks consolidated into `lex-overview`.** The six checks (vocabulary, vocabulary consistency, invariants, boundaries, decisions, declared-scope match) used to be restated in `lex-retro` and `lex-crystallize` and inverted in `lex-audit`'s phase headings. They now have a single canonical definition under `lex-overview` § Structural checks, with a `### Per-skill direction` block explaining how each consuming skill applies them (forward against a session diff for retro, forward against a cumulative feature diff for crystallize, backward against existing claims for audit). `lex-retro` and `lex-crystallize` reference the canonical list and only carry their direction-specific framing; `lex-audit` keeps its audit-specific procedural phases (literal grep, healthy/drifted/dead/mismatch classification, hygiene sweep) and adds a one-paragraph cross-reference noting that phases 1–3 invert checks 1–4.

- **CLAUDE.md.** Removed the "chicken-and-egg" framing about lexicon needing to dogfood itself — lexicon is a skill bundle, not a domain codebase, so the cold-doc shape doesn't apply. Updated the project-shape-change note and the provenance section to reflect the `docs/` → `lexicon/` rename. Convention bullet now references `lexicon/`.

### Why ship 0.4.0 now (vs bundling with 0.5)

The path collision and the description bloat were both surfaced by the same review pass on v0.3.0's skills. They're independent — the rename is a shape change, the trim is description tuning — but they share a triggering cause (the pass exposing what real review catches that internal iteration didn't), and they both touch every skill file. Shipping them together avoids two consecutive revs of the same set of files.

The structural-checks consolidation is the riskier change of the three, because it relies on `lex-overview` being reliably loaded before retro/crystallize/audit fire. If that assumption holds in real use, the consolidation removes ~60 lines of restated content; if it doesn't, retro and crystallize are missing a checklist they depend on. The fallback if it fails: re-inline the six checks into each skill body as the v0.1.0 design did. This is the open question to watch most closely after this release.

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
