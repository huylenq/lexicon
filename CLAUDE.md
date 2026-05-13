# CLAUDE.md — meta-context for iterating lexicon

This file is for a future Claude Code session opening this repo to work on lexicon itself. It captures the **thinking behind the design** — the things that aren't in `README.md` (user-facing) or in the individual `SKILL.md` files (operational).

If you're an agent reading this: read it before proposing changes to skill descriptions, escalation rules, or the project-shape conventions. The current shape is the result of several rounds of pushback on plausible-but-wrong defaults; understanding *why* those defaults were rejected matters more than the surface decisions.

Lexicon-the-skill-bundle is not a domain codebase, so the cold-doc shape (`lexicon/system.yaml` + bounded contexts + invariants) doesn't apply at the repo root — the artifact being maintained here is a coherent set of skill descriptions and bodies, not a running system with executable invariants. This file plays the role `system.yaml` would play for a coding project: capturing the design rationale that's hard to recover from the skill files alone.

The `viewer/` subproject is different. It's an actual app (a local web app for browsing cold layers) with its own domain — graph layout, drift indicators, search, project switching — and it carries its own `viewer/lexicon/` cold layer, bootstrapped via `lex-bootstrap` on that subdirectory. When working inside `viewer/`, the normal lexicon workflow applies: `lex-ground` reads `viewer/lexicon/system.yaml`, retros land in `viewer/lexicon/retros/`, crystallize updates the viewer's cold layer. This file (at the repo root) governs the skill bundle; `viewer/lexicon/` governs the viewer app.

---

## The core bet

Working with a coding agent over long sessions, the same problems repeat:

1. **Silent vocabulary drift.** The agent renames concepts mid-session and you don't notice until something breaks.
2. **Architectural rule violations.** The agent fixes a bug in module A by reaching into module B, violating an unwritten boundary.
3. **Conversational opacity.** By turn 40, decisions made on turn 12 are lost.

Lexicon's bet: **a small, living document captures the invariant parts of the system** (vocabulary, bounded contexts, "why"s), and a workflow forces both human and agent to ground in it before work and update it deliberately when learning happens.

(v0.1.0 also tried to address multi-agent collisions through per-session sharding and `_active/` soft locks. v0.5.0 dropped that mechanism — see "Why we removed proposals and session sharding" below. Concurrent-agent coordination, if it matters for a given project, is now a git problem; lexicon stays out of it.)

The DDD heritage matters. The single most load-bearing element is **ubiquitous language** — the same nouns appear in `system.md`, in conversation, and in code. Everything else (invariants, contexts, ADRs) rests on having the words right.

---

## Conceptual model: temperature layers

This vocabulary recurs throughout the design. Internalize it before changing things.

- **Cold layer** — `lexicon/system.md` (and optional views). Glossary, invariants, bounded contexts, "why"s. Evolves at the speed of *learning*, not the speed of typing. Small (under ~500 lines). Edits go through `lex-crystallize`: propose in conversation, get the user's yes, apply.
- **Hot layer** — per-feature plans in `lexicon/plans/<feature>/`. Born when work starts, absorbed (crystallized) or discarded when work lands.
- **Code** — the executable spec. Evolves freely.

Two temperatures of session artifacts, distinguished by who reads them:

| Temperature | Where | When read | Volume |
|---|---|---|---|
| Cold | `system.md`, `views/`, `decisions/` | Every session start | Small, slow-growing |
| Cool | `retros/` | Aggregated by `lex-crystallize` when the user triggers it; otherwise unread | High volume |

The cool tier exists deliberately. It's there to **make the question get asked** ("did anything material happen this session?") without demanding human attention. Don't be tempted to delete or downsize it — its uselessness in any single session *is* its value, and `lex-crystallize` does read it when the user runs it.

(v0.1.0–v0.4.0 had a third "warm" tier — `_proposals/` — for diffs awaiting human merge, plus `_active/` and `_scratch/` per-session shards. v0.5.0 collapsed all of that. See "Why we removed proposals and session sharding" below.)

---

## Design decisions and their reasoning

### Why separate skills, not one

Could be a single `lexicon` skill that branches internally. Rejected because skill descriptions are the trigger mechanism — separate skills give the agent distinct sets of contextual cues to fire on. `bootstrap` triggers on "set up lexicon" cues; `ground` triggers on "starting work" cues; `retro` triggers on "stopping point" cues; `crystallize` triggers on "feature done" cues; `audit` triggers on "sanity check" / "is system.md still accurate?" cues; `migrate` triggers on "convert to YAML" cues; `meta` triggers on `/lex-meta` (explicit slash, no phrase fallback). Conflating any of them would weaken triggering.

(v0.1.0 shipped with three; bootstrap was a subroutine inside `ground`. v0.2.0 split it out. v0.3.0 added audit. v0.9.0 added migrate for the YAML transition. The unreleased line adds `lex-meta` as the bundle's self-evolve channel. See dedicated rationales below.)

### Why `lex-bootstrap` is its own skill, not a subroutine of `lex-ground`

In v0.1.0, "first time in a project" was handled inline at the top of `lex-ground`'s body. The migration question for projects with existing docs surfaced the gap: the inline subroutine could only afford a *codebase* scan, not a full doc audit. That meant for any project with substantive existing documentation (architecture docs, design notes, RFCs, ADR folders), the drafted `system.md` would systematically miss exactly the highest-value cold-layer content.

Splitting bootstrap out lets the dedicated skill spend tokens on:
- Reading existing docs and bucketing them.
- Cross-referencing doc vocabulary against code identifiers (the strongest signal for real ubiquitous-language candidates).
- Migrating ADR-shaped existing docs.
- Producing a structured triage report rather than a fait-accompli draft.

This work doesn't fit inside a per-task grounding step — both because it's heavyweight and because the user's mental moment is different (adoption is a deliberate decision, not a drive-by side effect of starting a task). Triggering cues are different too: "set up lexicon" / "adopt lexicon" / "migrate to lexicon" vs the per-task triggers `ground` fires on.

### Why `lex-audit` is its own skill, not bundled with bootstrap or crystallize

`lex-bootstrap` and `lex-audit` are both "non-task reconciliation between `system.md` and reality" at project scope. Considered unifying as `lex-reconcile` with mode detection — rejected because:

- **Different inputs.** Bootstrap reads existing docs and codebase to *draft* `system.md`. Audit reads existing `system.md` and codebase to *validate* it. Doc-heavy vs code-heavy.
- **Different outputs.** Bootstrap writes a draft `system.md` plus a triage list. Audit writes only a triage list and never touches `system.md`. The latter is a stricter contract; bundling would muddy it.
- **Different timing.** Bootstrap is one-shot at adoption. Audit is periodic (quarterly, on-demand, before-planning). The user's mental moment is "I'm setting this up" vs "is this still healthy?".
- **Different triggering language.** "Set up lexicon" / "adopt lexicon" vs "audit lexicon" / "is system.md still accurate?". Conflating them weakens triggering accuracy on both.

Considered bundling audit with crystallize since both surface drift candidates. Rejected because:

- **Different scope.** Crystallize is feature-scoped and forward-flow (what changed in this body of work?). Audit is project-scoped and backward-flow (what in `system.md` no longer matches the current code?). Same primitives, different direction and frequency.
- **Different cadence.** Crystallize fires per-feature (potentially weekly). Audit fires per-quarter or on-demand. Folding one into the other would either over-run audit or under-run crystallize.

The structural checks in audit invert the same primitives as retro/crystallize (vocabulary/invariants/boundaries) — that's intentional; running the same checks in the opposite direction is exactly the asymmetry that motivates the skill. The implementation is essentially "retro's structural checks, but applied to existing `system.md` claims rather than this session's diff."

### Why an `overview` skill, not embedded rules

Earlier draft embedded the workflow rules in each skill's body. Rejected because:
- Quintuplication: the rules would appear in five SKILL.md files, drifting over time.
- Context bloat: each skill firing would inject the full ruleset.

`overview` is loaded once per session (cross-referenced from the other skills' first instructions) and stays in context for everything that follows. It's a soft contract — if `overview` doesn't load reliably in practice, the fallback is to inline the most critical rules into each skill's body.

### Why the hot/cold separation must be enforced mechanically

If the cold doc tries to mirror code, it rots — code moves faster. If it stays too abstract, it's useless to the agent. The cold doc has to capture *the things code can't express well*: intent/why, invariants, conceptual model, boundaries/seams. Code captures everything else.

The agent will, by default, want to write everything into one place. The folder structure (`retros/`, `audits/`, `<feature>/`, `_archive/`) exists to **mechanically separate** these things so the cold doc can stay cold. Don't collapse this structure unless you have a strong reason — every directory exists to absorb a specific kind of content that would otherwise pollute `system.md`.

### Why design vocabulary extends `system.md` rather than forking a new skill bundle (v0.6.0)

Design systems and DDD's ubiquitous language are the same primitive applied to different surfaces — both are "the same nouns must appear in code, in conversation, and in the cold doc, or alignment drifts." The failure modes rhyme exactly: silent renaming (`Card` becomes `Tile` becomes `Panel`), invariants that quietly erode (the focus-state contract, the no-cross-context-shared-state rule), boundary leaks (raw `<button>` escaping the wrapper component, module A reaching into module B). When the underlying primitive is the same, splitting the workflow doubles the ceremony for no extra reach.

The concrete moves in v0.6.0:

- A `## Design system` section in `system.md.template` covering tokens, component vocabulary, layout primitives, interaction patterns, and a11y invariants. References canonical sources (theme, tokens, config) by path; doesn't duplicate values. Backend-only projects delete the section.
- When the design surface gets rich, the section promotes to `lexicon/views/design-system.md` — the existing Domain View mechanism, no new file conventions.
- The six structural checks gain design-system signals (hex literal outside the token file; new component file; raw HTML escaping the wrapper layer; a11y invariant touched). No new checks. The signals subsection in `lex-overview` § Structural checks names them per check; retro/crystallize/audit inherit through the existing per-skill direction logic.
- `lex-bootstrap` extends Phase 1, 2, 4, 4b, 8 with design-system surface scanning; `lex-audit` extends Phase 1 and 2 with token/component validation and a11y-tooling integration.
- `lex-retro` and `lex-crystallize` get **no** body changes — they consume the structural checks defined in `lex-overview`, so the inheritance is automatic.

If you find yourself wanting to fork (a `lex-design-*` skill family, or a separate `design.md`): name the concrete failure mode that motivates it. The likely real one is "design-only sessions never engage lexicon at all because the trigger language doesn't fire." If that turns out to be a recurring pattern in real use, the fix is sharper triggering language in the existing skills, not a parallel bundle.

The pathology to watch: design tokens being treated as values rather than vocabulary, leading to a `## Design system` section that lists every hex code. The cold doc captures **intent and invariants**; the canonical token files own values. When the section starts duplicating the theme file, that's drift in the wrong direction — surface it during audit.

### Why design vocabulary gained a surfaces/regions tier (v0.8.0)

v0.6.0 named "tokens, component names, layout primitives, interaction patterns, and accessibility invariants" as the design-system tiers. Real use on Eir (running a bootstrap-style design-system extraction after the cold layer was already adopted) exposed a missing tier: the **named layout zones inside a specific surface** — the "right sidebar of the composer view," the "header strip of the run page," the "progress tracker rail." The user's complaint was concrete: "I have no idea how to call the right sidebar in the composer view." Without names for these zones, neither the team nor the agent can refer to them precisely; without precise references, retros can't flag drift in them and crystallize can't absorb them.

The first attempt at filling the gap landed on a wrong rule: "inline `<div>`s don't earn names." This collapsed two orthogonal axes — *conceptual identity* (does the team think of this as a thing?) and *implementation status* (has it been factored out into its own component?). The collapse hid meaningful regions whose code happened to be inline (Eir's "header strip" was a 14-line JSX block at `compose-page.tsx:973–987`; the team referred to it; nobody had extracted it yet — it deserved a name).

v0.8.0 separates the axes:
- **Conceptual identity is the naming gate.** A region earns a name when the team refers to it as a discrete piece, full stop.
- **Implementation status is metadata, recorded as a tag** — `*Component*: <import>` for extracted artifacts, `*Inline*: <file>:<lineStart>–<lineEnd>` for inline blocks. The tag tells the agent where to grep; it doesn't gate the naming.

A future extraction is then a tag update (`*Inline*` → `*Component*`), not a vocabulary change. That's the right shape because the *concept* didn't move, only its file home did. `lex-audit`'s region validation specifically distinguishes "extracted-but-tag-still-says-inline" (tag drift, easy fix) from "deleted" (real dead-region candidate) so the human picks the right action.

The same primitive applied at a different scale matters here. A surface (route/screen/window/pane) is a bounded context for layout vocabulary; the regions inside it are its glossary terms. v0.6.0 had already committed to "design vocabulary is ubiquitous language" — surfaces/regions is just that idea pushed one level down, into the named structure of each surface.

The generalization beyond web was deliberate. Surface/region is the abstraction; the per-platform signals (`<aside>` / `<main>` for web, SwiftUI `Sidebar` / `ToolbarItem` for iOS, Flutter `Drawer` / `AppBar`, terminal panes, print sections) are examples of where to look, not the definition. The cold layer holds the names; the platform decides what the rendered manifestation looks like. Backend-only projects continue to skip the entire design-system section, unchanged since v0.6.0.

The pathology to watch: surfaces/regions sections that bloat into the size of the rendered tree itself. The conversational-referent rule ("the team refers to it as a discrete piece") is the trim discipline. If a region only got a name because the agent saw an `<aside>` and felt obligated to list it, that's bloat — surface it during audit. If the team has been saying "the X" for weeks and the cold doc doesn't have an entry for it, that's drift — surface it during retro/crystallize.

If you find yourself wanting to add yet another design tier (motion vocabulary, content-tone vocabulary, empty-state vocabulary, etc.): name a real failure mode that the existing five tiers can't capture. v0.8.0 paid the cost of one more tier because regions had a concrete recurring failure (untalkaboutable layout zones); subsequent additions need the same evidence. Tier inflation defeats the cold-doc-stays-small property.

### Why template files were trimmed of meta-instructional blockquotes (v0.6.0)

The four templates (`system.md`, `view.md`, `plan.md`, `adr.md`) shipped with multi-paragraph blockquote prefaces explaining when/how to use each section: "The ubiquitous language…", "Properties that must hold across the system…", `*Optional.*`, "On completion, run lex-crystallize…", and so on. These rendered into the user's actual `lexicon/system.md`, where they served no audience: the agent reads `lex-overview` (which contains the same rules canonically) every session per Rule 1, and the human had already internalized them by the time they were re-reading the populated file. After the user filled in real content, the blockquotes became vestigial noise readers had to skip past — the worst kind, because they look authoritative enough to demand attention before being dismissed.

The trim discipline: keep section headings and `< >` placeholder examples (those get replaced by user content); drop blockquote prefaces, `*Optional.*` labels (once a section is in the rendered file, it's not "optional" — if it doesn't apply, you delete the section, same as anyone treats `## Bounded contexts` for a single-context project), ownership-rule restatements, "on completion" workflow notes, and ~500-line maintenance reminders. Every removal was cross-checked against the SKILL.md bodies; nothing unique to the templates was lost.

If you're tempted to add explanatory prose to a template "so the user knows what to put there": that's a sign the SKILL.md body is under-explaining. Fix the SKILL.md, not the template.

### Why we removed proposals and session sharding (v0.5.0)

v0.1.0–v0.4.0 treated `system.md` as write-protected and routed every proposed edit through `lexicon/plans/_proposals/<file>.md`, with the user as the merge coordinator. The stated property was: *deliberate review of cold-doc changes, with parallel agents made safe by the staging area as a serialization point.*

In real interactive use, this turned out to be ceremony for ceremony's sake:

- **The deliberate-review property is already there in the Edit-approval loop.** When `lex-crystallize` proposes a diff in chat and applies via Edit, the user sees the exact change before it lands. The proposal *file* added a round-trip without adding a guarantee.
- **The serialization-point property only mattered for parallel agents,** and parallel agents on the same repo are rare in practice. When they do happen, git already gives you conflict detection and merge resolution; lexicon's staging area was duplicating git's job, less reliably.
- **The two-stage flow created its own failure mode.** Proposals would pile up in `_proposals/` because there was no event forcing the user to triage them. `lex-audit` ended up flagging "stale proposals" — a bug introduced by the mechanism that was supposed to fix things.

v0.5.0 collapses this: `lex-crystallize` proposes inline in conversation, applies on the user's yes, updates `lexicon/.last-crystallized`. No `_proposals/`. No two-stage flow. Bootstrap and audit reports are still files (because the user works through them over multiple days), but they live at `lexicon/bootstrap.md` and `lexicon/audits/audit-<iso>.md` — they're persistent triage lists, not merge queues.

Per-session sharding (`_active/<id>.md`, `_scratch/<id>.md`) went with it. The agent's context window holds the per-session scope declaration; `lex-ground` doesn't write files anymore. Concurrent-agent coordination is downgraded to "git, like every other shared file in the repo." This is honest about what lexicon could actually do for that problem.

The property that *was* worth preserving: cold-layer edits are deliberate. That's now encoded as Rule 6 in `lex-overview` (don't drive-by-edit `system.md`; route through `lex-crystallize`) plus the explicit propose-then-apply discipline in the `lex-crystallize` body. Same property, no file artifact.

If you find yourself wanting to bring proposals back: ask whether the failure mode you're trying to address is real or hypothetical. If it's real, name the failure first, then design the minimum mechanism that addresses it. The 0.4.0 proposal flow was designed for a *hypothetical* multi-agent collision and paid daily ceremony cost in exchange.

### Why structural triggers, not "significance" judgment

Earlier draft had retros escalate based on "is this significant?" Rejected because **the agent is the worst possible judge of significance** — either over-escalates (to seem safe) or under-escalates (to seem efficient).

Current design escalates on **structural triggers** (vocabulary, invariants, boundaries) which are mechanically detectable and hard to game. A 3-line change that violates an invariant escalates; a 300-line mechanical refactor doesn't. This is the most important calibration in the system. Resist the temptation to add a "size" or "complexity" heuristic — that path leads back to subjective judgment.

### Why session-end retro runs always, not conditionally

Most sessions produce silent retros (a log entry only). It would be tempting to skip retro for "obviously trivial" sessions. Rejected because:
- The agent's sense of "trivial" is unreliable.
- The cool-tier log is cheap to write and valuable as archive.
- The point is **the question gets asked, every time**. Conditional execution undermines that.

The trivial-fast-path in `ground` is a deliberate compromise (skip the heavy steps for genuinely mechanical work) but the retro itself always runs.

### Why prefs are user-level, not project-level (v0.7.0)

v0.1.0–v0.6.0 had `lexicon/calibration.md` per project — a place to record overrides for "what counts as significant," populated by appending lines when the user rejected a flag as noise. The file was supposed to grow over time as the skills learned the project's quirks.

In practice, three things went wrong:

- **Same lessons, every project.** Most calibration is about *the user's* perspective — their tolerance for chatter, their idea of "important," their style preferences — not about the project's content. Those lessons should propagate from project A to project B, but `lexicon/calibration.md` is per-project, so they don't.
- **Narrow axis.** Calibration was framed as significance-only. The actual feedback the user wants to give is wider — workflow preferences, presentation style, patterns about how they think — and a "significance" file isn't the right shape for any of that.
- **Nobody writes it.** Even when the user *did* reject a flag, going to a separate file and writing a line is enough activation energy that it just doesn't happen. The file stays empty.

v0.7.0 replaces this with `~/src/lexicon/lexicon-prefs.md` (path hardcoded for now while iterating; portability deferred):

- **User-level**, so lessons accumulate across projects.
- **Section-shaped, not single-axis** — Workflow, Style, Calibration, Patterns. Free prose under each, no rigid format.
- **Captured by an explicit trigger phrase** — "for lexicon: <X>" — so the user can dump feedback mid-session without context-switching to a separate file. Skills append on their behalf.
- **Acts as both live override and curation buffer.** Skills read it at session start (entries take effect immediately). Periodically, stabilized entries get absorbed into the SKILL.md files themselves (a deliberate human curation step), then pruned from the prefs file. The file should stay small over time; pile-up is a curation-overdue signal that `lex-audit` can flag.

The trigger phrasing matters: **"for lexicon: <X>"** is distinct from generic "remember that" (which goes to project memory or the user's PKM). Skills do not intercept the generic phrasing. This was the user's own concern — they wanted explicit routing because they manage multiple memory systems and didn't want the agent guessing.

Project-specific overrides — the cases where calibration *is* genuinely about the project's content, not the user — go into the project's `CLAUDE.md` instead. That's already a per-project, always-loaded file in the user's workflow; it's the natural home, and it removes the need for a `lexicon/calibration.md`.

The "no separate `lex-feedback` skill" decision was deliberate: lexicon already has five skills and the taxonomy is hard to remember. Folding the feedback-capture behavior into `lex-retro` (explicit trigger) and `lex-crystallize` (suggest entries on repeated rejections) keeps the surface area flat. If feedback-capture grows complex enough to need its own skill, revisit.

### Why `lex-meta` is its own skill, and why it kills `lexicon-prefs.md` (unreleased)

The v0.7.0 "no separate feedback skill" call held until real use exposed two things the prefs file couldn't do:

1. **It missed the highest-signal feedback channel.** The richest input isn't "I'd like to register a taste preference" (the only thing `for lexicon: <X>` was shaped to capture) — it's "I just corrected something the agent produced and the *conversation* contains the rationale." A correction-incident has the agent's wrong output, the user's pushback, and the user's reasoning, all in-context. A separate prefs file forces transcription away from that context, and the transcription is usually the step that doesn't happen.
2. **The buffer-then-curate model wasn't actually paying for itself.** Prefs entries accumulated, but the curation pass into SKILL.md files was supposed to be a deliberate human step and rarely happened. The buffer-of-a-buffer added ceremony without raising the rate of bundle improvement.

`lex-meta` collapses both:

- **Conversation is the primary signal, diff is corroborating.** The agent reads the in-context turns for the *why*; the project's `lexicon/` diff confirms what landed. Together they're a much higher-fidelity input than a one-line prefs entry, and they come for free — no transcription step.
- **The bundle repo's dirty working tree replaces the prefs buffer.** Every `/lex-meta` edits a SKILL.md in `~/src/lexicon/` and leaves the change uncommitted. Across multiple invocations the dirty state accumulates; the next run reads it via `git status`/`git diff` and can refine an existing uncommitted edit rather than introducing a parallel one. The buffer *is* the thing it's a buffer for — no second file drifting from the first, no curation pass needed. Crystallization happens in-place.
- **User-triggered, explicit slash command, no phrase trigger.** Bundle edits are deliberate. The slash-command form forces the user to invoke intentionally; volunteering would slide back into the "agent decides what's significant" failure mode the rest of the workflow explicitly rejects.
- **Triage gate up front: bundle-edit / project-quirk / no-op.** A `/lex-meta` invocation is *not* a contract to produce a SKILL.md amendment. The no-op branch is load-bearing — it's what prevents the skill from inventing reasons to edit just because it was invoked.
- **Bug vs. taste is a labeling sub-question inside the bundle-edit branch**, not a routing decision. Both produce a SKILL.md edit; the label tells the user which they're approving so taste calls don't go global silently.
- **Interview replaces queue.** Earlier drafts considered a "not confident" fallback that queued the incident to a meta-buffer for later. Rejected because the user is on the line — when the agent isn't confident, it asks (capped at three or four questions), not defers. The whole point of being a slash command is the audience is present.

**What this kills.** `lexicon-prefs.md` is deprecated (not yet ripped out — other SKILL.md files still reference it, and that cleanup is itself a candidate `/lex-meta` use). The "for lexicon: <X>" phrase trigger is retired with it — its discoverability advantage (fires opportunistically without a slash) doesn't outweigh the transcription cost it imposed.

**What it asymmetrically does.** Where every other lexicon skill takes the bundle as authoritative and reshapes the project, `lex-meta` takes the session as authoritative and reshapes the bundle. It writes only to `~/src/lexicon/`; it touches no project file (no retro, no `.last-crystallized` bump, no cold-layer mutation).

**Discoverability gap to watch.** Slash-command requires the user to *think to invoke it*. The old phrase trigger fired opportunistically — that property is gone. If real use shows that correction-incidents pass unrecorded because nobody types `/lex-meta` at the right moment, the right next move is probably `lex-retro` noticing pushback-against-skill-output in the session and gently suggesting `/lex-meta` — not bringing the phrase trigger back. Holding that as a future move, not a current commitment.

### Why crystallize is user-triggered, not agent-triggered (v0.5.0)

v0.1.0–v0.4.0 had `lex-crystallize` fire on agent-detected "feature done" cues. The agent doesn't reliably know when work is done — it knows when *a session* is done. Feature-completion is a user judgment call.

v0.5.0 makes this explicit: crystallize runs only when the user says so ("crystallize", "update lexicon", "feature X is done"). The trigger broadens too — it's no longer feature-scoped, just "user wants to absorb accumulated retros into the cold layer." Aggregate the retros newer than `lexicon/.last-crystallized`, propose, apply, update the marker.

This pairs naturally with the dropped Stop-hook idea: there's no good "session end" or "feature end" signal the agent can detect, so don't pretend there is. The user is the source of that signal. Make the trigger explicit and stop trying to guess.

### Why no Stop hook

A `Stop` hook was drafted and considered. Rejected after recognizing that Claude Code's `Stop` event fires on every agent→user turn, not at session end. A hook there would nudge the agent to run retro between every exchange, which is catastrophic noise.

There is no event in Claude Code today that means "session is ending" — sessions end when the user closes the terminal, which has no hook. The pushy skill descriptions are the only enforcement mechanism for retros, and `lex-crystallize` is user-triggered by design (see above), so no hook is needed for it either.

If a future Claude Code version adds a true session-end event, retros could move to a hook. **Crystallize should stay user-triggered regardless** — the signal "I'm ready to absorb this" is a human judgment call, not a session-state event.

### Why the skill folder names are short

Skill folder names drive the slash-command form. Considered long names (`ground-in-vocabulary`, `session-retro`) for self-description. Picked the short `lex-` prefixed names (`lex-overview`, `lex-bootstrap`, `lex-ground`, `lex-retro`, `lex-crystallize`, `lex-audit`) for command ergonomics — the user types these — while still encoding the lexicon provenance and avoiding collisions with generic vocabulary in `~/.claude/skills/`.

The prefix-rather-than-namespace decision matters because `npx skills` (vercel-labs/skills) is a common alternate install path that does **not** apply Claude Code's plugin namespace. Under `npx skills`, what would be `lexicon:ground` in marketplace mode just becomes `ground` — too generic, and a likely collision. Picking `lex-ground` as the actual skill name (in YAML frontmatter and folder name) sidesteps this entirely: the same flat names work in both install modes.

If you rename a skill folder, also update:
- The `name:` frontmatter inside that skill's `SKILL.md` (must match the folder name).
- The cross-references in the *other* skills' SKILL.md files (they reference each other by name).
- README.md.
- CHANGELOG.md.
- This file's references.

---

## Things that look optional but are load-bearing

These are easy targets for "simplification" that would actually break the system. Don't remove without reading the reasoning above.

- **The `retros/` directory.** Almost never read in any single session. Looks like noise. Is the mechanism that makes "the question gets asked every time" enforceable, *and* the input `lex-crystallize` aggregates over.
- **The `lexicon/.last-crystallized` marker.** Trivial file (one ISO timestamp), critical role: it's how `lex-crystallize` knows which retros to consider. Without it, every crystallization either re-considers the entire history or asks the user "since when?" — both worse.
- **The bundle repo's dirty working tree at `~/src/lexicon/`** *(replaces the v0.7.0 `lexicon-prefs.md` role)*. Uncommitted SKILL.md edits accumulated across `/lex-meta` invocations are the buffer that makes lexicon adapt to the user across projects. Without that property — without each `/lex-meta` leaving its edit dirty for review across sessions — the same corrections get re-made every project. See "Why `lex-meta` is its own skill, and why it kills `lexicon-prefs.md`" above for the full rationale. (The old `lexicon-prefs.md` is deprecated but still readable while other SKILL.md files reference it; that cleanup is itself a candidate `/lex-meta` use.)
- **The "deliberately not changing" section in `lex-crystallize` proposals.** Looks like padding. Is the discipline that keeps each crystallization tightly scoped — without it, a crystallization becomes a chance to fix everything noticed about `system.md`, and the proposal becomes unreviewable.
- **The user-as-trigger property of `lex-crystallize`.** It's tempting to make the agent volunteer crystallizations when retros pile up. Don't. The premise of v0.5.0 is that the agent isn't a reliable judge of "done" — making it a judge again undoes the simplification.

---

## Open questions for v0.x

These are the things v0.1.0 doesn't answer. Future iterations should grapple with them, ideally informed by real usage.

### How much human authorship does `system.md` actually need?

`lex-bootstrap` drafts `system.md` from existing docs + code, with TODO markers on anything best-guess. The user is supposed to follow up with a focused-distillation session that walks through every TODO. In practice, will users do that? If they don't, the cold doc starts wrong and the rest of the workflow rests on shaky foundations.

`lex-bootstrap` already mitigates this somewhat — its triage report is explicitly a list for the human to act on, not an autonomous diff. But there's no enforcement that the user actually runs the distillation session. Open question whether the right move is more pushy ("system.md still has 14 unresolved TODOs — run the distillation session before more substantive work?"), or whether that crosses into nagging.

### What's the right rotation policy for `retros/`?

Always-write means high volume over time. After a year, `retros/` could have thousands of files. Options:
- Rotate monthly into subdirectories (`retros/2026-05/`).
- Auto-archive retros older than N days into a single compressed file.
- Periodic agent pass that summarizes old retros and deletes them.

v0.5.0 punts. `lex-audit` flags volume > 500 as "consider rotation," but doesn't act. Watch for pain.

### How do you crystallize when retros weren't run?

The crystallize skill explicitly handles this case ("I see N retros over the last period, but git shows M sessions of substantive work") and now leans more heavily on git diff as a cross-check, which mitigates the gap. Still not a real fix in a world where retros are inconsistent — surfacing the gap to the user is what the skill does.

### Plan-mode interaction

Native plan mode and `lexicon/plans/<feature>/` are meant to compose: native plan mode for the interactive draft stage, materialization to `lexicon/plans/<feature>/` when the plan is substantial enough to outlive the session. v0.5.0 has no `materialize-plan` skill. The user does it manually if they want it.

The materialization skill is the obvious next addition. The hard part is the *threshold* — when is a plan worth persisting? "More than X files touched" is too mechanical. "Crosses a `system.md` boundary" is closer. Worth thinking about before adding.

### Stale `system.md` when crystallize never runs

User-triggered crystallize has the inverse failure mode of agent-triggered: if the user never says "crystallize," the cold layer stops absorbing retros, drift accumulates silently, and the workflow degrades to ceremony-around-a-frozen-doc. `lex-audit` partially addresses this (Phase 4 flags stale `.last-crystallized`), but the audit itself is also user-triggered.

If audits + crystallize both go neglected, lexicon has no recourse. The right answer is probably *some* nudge — pushy retros that say "this is the 12th retro since the last crystallization, want to crystallize now?" — without crossing into agent-volunteers-crystallize territory. That nudge isn't designed yet.

---

## How to iterate this plugin

Cheap edits, in increasing order of risk:

1. **Skill description tuning** (patch). Adjust pushiness, add example cues, sharpen contexts. This is the lever for triggering accuracy. Test by using lexicon on a real project and noting when skills should-have-fired-but-didn't or fired-when-they-shouldn't-have.

2. **Skill body prose** (patch). Clarify instructions, add examples, expand the "when to skip" sections. Doesn't change behavior, just clarity.

3. **Structural-check granularity in retro** (minor). The current six checks are binary (fire/no-fire). Reality is more "kinda touched a boundary." If this granularity feels wrong in practice, this is the place to add nuance — but be careful not to slip back into significance-judgment.

4. **Adding a skill** (minor). Most likely candidates: `materialize-plan`, `aggregate-retros`. Each one should be justified by a concrete recurring failure in real use, not by "it would be nice if..."

5. **Project-shape changes** (major). Renaming directories, restructuring `lexicon/`, changing the file conventions. These break existing lexicon-managed projects and should be very rare. Bump major version, document migration steps.

When in doubt about whether something is patch/minor/major, ask: "would an existing lexicon user need to do anything to upgrade?" If no → patch. If yes-but-easy → minor. If their existing `lexicon/` folder breaks → major.

---

## Style notes for SKILL.md files

These are conventions the current files follow. Keep them when editing.

- **Imperative mood** for instructions ("Read X", "Write Y to Z").
- **Honest hedging** about uncertainty ("If unclear, surface this to the user — that's a real signal, not a failure").
- **Counter-examples** for behavior that's tempting but wrong ("If you're tempted to call something 'trivial' but it touches a file mentioned in `system.md`, it's not trivial").
- **Cross-references by full skill name** (`lex-retro`, not just `retro`) when one skill mentions another. Using the full prefixed name keeps references unambiguous regardless of install mode.
- **No bullet-point soup.** Prose where possible. Lists only where the items are genuinely parallel.
- **Pushy descriptions** in the YAML frontmatter, but **measured prose** in the body. The frontmatter has to compete for trigger; the body has to be clear.

---

## Working with this repo as a Claude Code session

If you're a future agent helping iterate on lexicon:

- **Read this file first.** Then `README.md` (user-facing pitch) and `CHANGELOG.md` (what's shipped).
- **Then read the SKILL.md files** in this order: `lex-overview`, `lex-bootstrap`, `lex-ground`, `lex-retro`, `lex-crystallize`, `lex-audit`. Each builds on the previous.
- **Don't edit a SKILL.md without reading the whole skill.** The files are short by design; partial reads lead to inconsistent edits.
- **For triggering-accuracy work:** don't speculate from the description alone. The user should test the skill on real projects and report back what worked and what didn't. The `skill-creator` skill (in `/mnt/skills/examples/`) has an evaluation flow for more rigorous testing.
- **When the user disagrees with a draft, push back if you have reasoning, then defer.** The pattern in the original design conversation was: the user critiques, the agent thinks through whether the critique lands, agrees or disagrees with reasoning, and adjusts. Don't just acquiesce — that loses the design rigor.

---

## Provenance

This plugin emerged from a long design conversation with the author about how to make the human↔coding-agent interface more durable. Key design moves and the order they were made:

1. The user described the problem space (mental model alignment, validatable specs, document as medium).
2. We landed on the cold/hot/code three-layer model.
3. Domain-driven design's ubiquitous language was named as the load-bearing primitive.
4. Implementation was anchored to Claude Code's existing primitives (skills, a project-local doc convention — originally `docs/`, later renamed to `lexicon/` to avoid colliding with projects' existing docs trees, no new infrastructure).
5. Several plausible-but-wrong defaults were rejected through critique:
   - Slash commands as the primary trigger (too opt-in).
   - Significance judgment for retro escalation (agent is a bad judge).
   - Embedded rules per skill (triplication).
   - Stop hook for retro enforcement (wrong granularity in Claude Code).
6. The plugin was bundled with three skills + an overview, sharded session conventions, and a write-protected `system.md`.
7. **v0.5.0 reversal**: the proposal-file flow and per-session sharding (`_proposals/`, `_active/`, `_scratch/`) were removed. The properties they protected — deliberate cold-layer review, multi-agent safety — turned out to be either already-provided-by-the-Edit-loop (review) or hypothetical-in-practice (multi-agent). `lex-crystallize` became user-triggered with inline application; `lex-ground` lost its file writes; concurrent-agent coordination was downgraded to "git, like every other shared file." See "Why we removed proposals and session sharding" above for the full reasoning.

If you find yourself wanting to revert one of those rejected defaults, re-read why it was rejected. If the reason still holds, don't revert. If the reason has changed (new Claude Code feature, new evidence from real use), document the change in CHANGELOG and adjust.

The same applies in reverse for v0.5.0 reversals — if you're tempted to bring proposals or session sharding back, name the concrete failure mode you're addressing first. The original justifications were defensible-on-paper but didn't survive contact with how lexicon actually gets used.
