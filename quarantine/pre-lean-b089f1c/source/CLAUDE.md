# CLAUDE.md — meta-context for iterating lexicon

This file is for a future Claude Code session opening this repo to work on lexicon itself. It captures the **thinking behind the design** — the things that aren't in `README.md` (user-facing) or in the individual files under `skills/lexicon/` (operational).

If you're an agent reading this: read it before proposing changes to the skill description, subcommand bodies, reference files, or plugin structure. The current shape is the result of several rounds of pushback on plausible-but-wrong defaults; understanding *why* those defaults were rejected matters more than the surface decisions.

Lexicon-the-plugin is not a domain codebase, so the cold-doc shape (`lexicon/system.xml` + bounded contexts + invariants) doesn't apply at the repo root — the artifact being maintained here is a coherent skill body with shared reference material, not a running system with executable invariants. This file plays the role `system.xml` would play for a coding project: capturing the design rationale that's hard to recover from the skill files alone.

The `viewer/` subproject is different. It's an actual app (a local web app for browsing cold layers) with its own domain, and it carries its own `viewer/lexicon/` cold layer, set up via `/lexicon:bootstrap` on that subdirectory. When working inside `viewer/`, the normal lexicon workflow applies: `/lexicon:ground` reads `viewer/lexicon/system.xml`, and `/lexicon:crystallize` absorbs the git diff into the viewer's cold layer. This file (at the repo root) governs the plugin; `viewer/lexicon/` governs the viewer app.

---

## The core bet

Working with a coding agent over long sessions, the same problems repeat:

1. **Silent vocabulary drift.** The agent renames concepts mid-session and you don't notice until something breaks.
2. **Architectural rule violations.** The agent fixes a bug in module A by reaching into module B, violating an unwritten boundary.
3. **Conversational opacity.** By turn 40, decisions made on turn 12 are lost.

Lexicon's bet: **a small, living document captures the invariant parts of the system** (vocabulary, bounded contexts, "why"s), and a workflow forces both human and agent to ground in it before work and update it deliberately when learning happens.

The DDD heritage matters. The single most load-bearing element is **ubiquitous language** — the same nouns appear in `system.xml`, in conversation, and in code. Everything else (invariants, contexts, rationale) rests on having the words right.

---

## Conceptual model: temperature layers

This vocabulary recurs throughout the design. Internalize it before changing things.

- **Cold layer** — `lexicon/system.xml` plus optional `contexts/<slug>.xml` and `surfaces/<slug>.xml`. Glossary, invariants, bounded contexts, "why"s. Evolves at the speed of *learning*, not the speed of typing. Small (under ~500 lines per file). Edits go through `/lexicon:crystallize`: propose in conversation, get the user's yes, apply.
- **Hot layer** — per-feature plans in `lexicon/plans/<feature>/`. Born when work starts, absorbed (crystallized) or discarded when work lands.
- **Code** — the executable spec. Evolves freely.

The cold layer is read every session start; it's small and slow-growing (`system.xml`, `contexts/`, `surfaces/`).

There used to be a third "cool" tier: an always-written `retros/` directory of per-session logs that `crystallize` aggregated over. **v1.0 removed it.** The retro step never fired reliably at stopping points, and the logs went unread between crystallizations — the "make the question get asked every session" property was aspirational, not real. The job the cool tier was meant to do — give `crystallize` a record of what changed since the last absorption — is now done by the **git diff since `lexicon/.last-crystallized`**. Git history *is* the session log, and it's a better one: it's always written, never depends on the agent remembering, and `crystallize` reads it directly. If you're tempted to reintroduce a session-log artifact, first name the failure mode git history doesn't already cover.

---

## Plugin shape: three skills (awareness + action + laxicon), six subcommands, six command wrappers

The plugin contributes three Claude Code skills — `using-lexicon` (the awareness primer), `lexicon` (the action skill with six subcommands), and `laxicon` (the human-governed prose sibling) — plus six slash commands (`spec` was added after the v1.0 collapse; see "Why `spec` is its own subcommand" below; `using-lexicon` was added later still — see "Why `using-lexicon` is a second skill"):

```
.claude-plugin/plugin.json         ← plugin name: "lexicon"
commands/                          ← thin slash wrappers for TUI autocomplete
  bootstrap.md  ground.md  crystallize.md  spec.md  validate.md  meta-evolve.md
skills/
  using-lexicon/                   ← awareness layer: parks the standing disposition, routes to lexicon
    SKILL.md                        ← what the cold layer is for, the moves & their moments, the posture
  lexicon/                         ← action layer: runs the moves
    SKILL.md                        ← entry, dispatch on $subcommand, standing rules
    reference/                      ← single source of truth, read on demand
      schema.md  schema.xsd  checks.md  rules.md  design.md
    subcommands/                    ← lifecycle bodies, loaded by dispatch
      bootstrap.md  ground.md  crystallize.md  spec.md  validate.md  meta-evolve.md
    migrations/                     ← per-version deltas, used by validate's structural pass
      v0.x-to-v0.1.md  v0.1-to-v0.2.md  v0.2-to-v0.3.md  v0.3-to-v1.0.md
    templates/                      ← XML examples for bootstrap
    validators/                     ← standalone tree-sitter validators (`<codeRoot> --artifact-root <artifactRoot>`)
  laxicon/                         ← thin prose contract: markdown lives at lexicon/docs/
    SKILL.md
```

`using-lexicon` has no `commands/` wrapper and no subcommands: it's `user-invocable: true` and auto-fires on its description, so the user can turn it on deliberately or let it park itself when a lexicon project opens. The six command wrappers still map only to the action skill's verbs.

> **Taxonomy note (v1.0).** This shape descends from the v0.11.0 six-subcommand layout (`adopt` / `ground` / `retro` / `crystallize` / `conform` / `meta-evolve`). v1.0 collapsed it to five: **`retro` was removed**, **`conform` was renamed `validate`**, and **`adopt` was renamed `bootstrap`**. The sections below were written for the six-verb shape; where they say `adopt` read `bootstrap`, where they say `conform` read `validate`, and the "Why session-end retro runs always" subsection is superseded by "Why retro was removed (v1.0)". The reasoning in the historical subsections is preserved because it still explains *why the lifecycle moments are distinct* — only retro's moment was judged not worth a standing step.

This consolidates an earlier shape (v0.10.x and prior) that had seven sibling skills: `lex-overview`, `lex-bootstrap`, `lex-ground`, `lex-retro`, `lex-crystallize`, `lex-audit`, `lex-migrate`, `lex-meta`. The collapse rationale is below ("Why the consolidation"). The earlier rationales for individual skill splits are preserved further down because they motivate why the *subcommands* remain distinct lifecycle moments inside the single skill.

---

## Why the consolidation (v0.11.0)

The seven-skill shape had real costs the user hit in practice:

### Cost 1: SKILL.md duplication, with drift

Each of the seven SKILL.md files restated the same standing rules (read system.yaml first; ground before code; surface contradictions; always retro; cold-layer edits go through crystallize; IDs are slugs). Across seven files, this prose drifted. The "load lex-overview first" hop tried to dedupe by transitivity, but transitivity is a soft contract: lex-migrate's body said "load lex-overview" and lex-overview's body said "read SCHEMA.md" — two hops, both prose, both fallible.

The shared content was actually two distinct kinds: **specification** (the schema, the six structural checks, the rules-of-engagement edge cases) and **dispatch glue** (cross-references between skills). The specification deserved to live in real files that subcommands could `Read` directly; the dispatch glue was load-bearing only because the architecture was split.

Resolution: pull the specification into `skills/lexicon/reference/` as real files (`schema.md`, `checks.md`, `rules.md`, `design.md`). Subcommands read them via `${CLAUDE_SKILL_DIR}/reference/<name>.md` — one hop, mechanical, no transitive contract.

### Cost 2: Description budget vs. coherent description

The seven descriptions were internally-bookkeeping language ("Defines the shared rules, the cold-layer schema, and the structural checks the other skills depend on"). For an agent that doesn't already know lexicon, they're worse than useless — they assume the vocabulary they're supposed to introduce.

A single holistic description on the lexicon skill ("Living domain-driven documentation. A small cold-layer XML doc captures vocabulary, invariants, bounded contexts; ground before substantive work, retro at stopping points, crystallize on user's call, conform periodically") gives the model a real conceptual handle. The plugin-level pitch in `plugin.json` carries the "what is lexicon" weight together.

Most of the seven triggers fired from the same conceptual moment anyway — "this project has `lexicon/system.xml`" — and phase selection was genuinely session-state-dependent in ways description-based triggering couldn't capture. One description, dispatch from session context, is the right shape.

### Cost 3: lex-audit and lex-migrate were the same primitive

Both asked "does the cold layer conform to the latest schema?" — audit asked it against current code (semantic drift), migrate asked it against the schema spec (structural drift). The audit/migrate handoff dance ("audit flags crossCuttingTerms, tells user to run migrate") was a symptom of an over-split.

Resolution: `/lexicon:conform` runs a unified two-pass check — structural (mechanical, apply delta chain) and semantic (interpretive, triage list). The same skill body handles both because the **primitive is the same**; only the resolution differs.

### Cost 4: The retro always-on contract was aspirational

The seven-skill design treated "always run retro at stopping points" as a property mechanically enforced by lex-retro being its own skill with pushy description. In practice, stopping-point detection is hard, the description didn't reliably fire, and retros were skipped silently. Splitting didn't deliver the property.

A unified entry point that tracks "we just did ground, work is happening" can route to retro at lifecycle boundaries more reliably than seven independent triggers competing on fuzzy cues. The merge gives the property a chance.

### Cost 5: Slash command UX vs. encapsulation tension

Each split skill got its own slash command (`/lex-meta`, `/lex-audit`). For the user, that's a flat slash menu — discoverable, tab-completable. For sharing reference material across skills, it required cross-skill file paths via `${CLAUDE_SKILL_DIR}/../<sibling>/`, which worked but felt like working against the encapsulation model.

Resolution: the slash UX is preserved via **command wrappers** at the plugin root (`commands/<verb>.md`). Each wrapper is three lines: a description and a body that delegates to the lexicon skill with the named subcommand. The substance lives in one skill folder; the slash menu shows six verbs. Encapsulation and ergonomics both win.

### What the merge cost

Honestly enumerated:

- **`meta-evolve`'s slash-only guarantee is now soft.** `disable-model-invocation` is per-skill. The whole `lexicon` skill is model-invocable (otherwise auto-fire breaks for ground/retro), so `meta-evolve`'s "must be explicit" becomes a rule the dispatch enforces in body prose. The subcommand body has a defensive check ("If reached by inference rather than explicit slash, stop and ask"). It's a soft contract, not a runtime guarantee. For a cross-repo bundle mutator, this is a real-but-modest loosening.
- **Subcommand mis-routing.** When `$subcommand` is empty and the model infers from session context, it can pick wrong. The seven-skill design caught some of this mechanically at the description boundary; the unified dispatch leans harder on session-context judgment.
- **Per-subcommand frontmatter is gone.** No way to give `conform` a different `effort` or `allowed-tools` than `ground`. Fine today; foreclosed for the future without re-splitting.
- **Migration cost.** Every cross-reference in the bundle, viewer loader assumptions, CLAUDE.md, CHANGELOG — flipped at once. Done in v0.11.0.

---

## Why `using-lexicon` is a second skill (not a seventh subcommand)

The consolidation above collapsed seven skills into one. So a future agent reading "Cost 1: SKILL.md duplication, with drift" will reasonably ask why the bundle now ships **two** skills again — `using-lexicon` alongside `lexicon`. The collapse was right; this addition doesn't undo it. They are different *kinds* of thing.

The trigger came from real use: the six verbs rely on the user being disciplined about *which* to fire *when*. That's exactly the "fragmented, relies on user discipline" complaint — the user has to be the dispatcher. Lexicon already auto-fires on `lexicon/system.xml`, but its body is a **dispatcher**: load, pick a verb, run it. That posture reads as a strict workflow, not a collaborator who notices when a move would help.

`using-lexicon` is the **awareness layer**, modeled on superpowers' `using-superpowers`: a skill whose only job is to *park a standing disposition* into the session — what the cold layer is for, which move fits which moment, and the posture of offering it proactively but advisorily. It does no work; it routes to the `lexicon` skill's subcommands. The two-layer split (awareness on top, action verbs underneath) is the shape superpowers uses, and the user picked it deliberately over folding the disposition into the existing skill.

Why this is **not** a re-fragmentation, point by point against the original collapse costs:

- **Not SKILL.md duplication (Cost 1).** The seven old skills each *restated the same rules*, and they drifted. `using-lexicon` restates almost nothing: it carries a deliberately thin pocket frame and an explicit "if this contradicts the shared references, they win" clause. The rules of engagement still live in exactly one place (`reference/rules.md`); the schema/checks still live in exactly one place. The primer adds *disposition*, which has no other home — it's not specification, so there's nothing to duplicate.
- **Different kind, not a parallel verb (the audit/migrate lesson).** Cost 3 collapsed `lex-audit` + `lex-migrate` because they were *the same primitive*. The opposite holds here: an always-on advisory disposition and a forward-flow lifecycle mutation are genuinely different primitives. Folding awareness into `ground` (or any verb) would mean the disposition only exists once you've already decided to run that verb — too late to do its job, which is to help you decide.
- **Different trigger posture.** The action skill fires per-move (often with a verb named). The primer wants the *broad* "you're in a lexicon project / make this session lexicon-aware" trigger, and it's `user-invocable: true` so the user can deliberately turn it on. Two postures, cleanly separated, rather than one skill straining to be both.

What this *does* re-incur, honestly: the awareness frame and the action skill's "core idea" now say overlapping things, so they can drift. The mitigation is structural, not vigilance — the primer is explicitly subordinate ("they win") and points at the shared references rather than re-deriving them. If the overlap ever grows past a pocket summary, that's the signal it's creeping toward Cost 1; trim it back, don't let it accrete rules.

The one soft spot: with two model-invocable skills auto-firing in a lexicon project, both load. That's intended (it mirrors `using-superpowers` + a domain skill both loading), but it does mean the primer and the action skill must not fight. The cross-reference at the top of each (`lexicon/SKILL.md` points up to the primer; the primer routes down to the verbs) is what keeps them composing rather than colliding.

---

## Why each subcommand exists as a distinct lifecycle moment

The consolidation merges *files*, not *moments*. There are still six distinct user-facing lifecycle moments, each with its own subcommand body. The original rationale for each split — preserved here so future iterations don't re-collapse them — was:

### Why `bootstrap` is its own subcommand, not folded into `ground`

In v0.1.0, "first time in a project" was handled inline at the top of `lex-ground`'s body. The migration question for projects with existing docs surfaced the gap: the inline subroutine could only afford a *codebase* scan, not a full doc audit. For any project with substantive existing documentation (ARCHITECTURE.md, RFCs, ADR folders), the drafted cold layer would systematically miss exactly the highest-value content.

Splitting `bootstrap` out (named `adopt` before v1.0) lets the dedicated subcommand spend tokens on:
- Reading existing docs and bucketing them.
- Cross-referencing doc vocabulary against code identifiers (the strongest signal for real ubiquitous-language candidates).
- Archiving ADR-shaped existing docs and lifting their content into `rationale:` fields.
- Producing a structured triage report rather than a fait-accompli draft.
- Running the post-bootstrap distillation interview **one decision per conversational turn** in the same session.

This work doesn't fit inside a per-task grounding step — both because it's heavyweight and because the user's mental moment is different (adoption is a deliberate decision, not a drive-by side effect of starting a task).

### Why `validate` exists as its own subcommand, separate from `crystallize`

(`validate` was named `conform` before v1.0.) `crystallize` is feature-scoped and forward-flow (what changed in this body of work?). `validate`'s semantic pass is project-scoped and backward-flow (what in the cold layer no longer matches the current code?). Same primitives, different direction and frequency.

- **Different cadence.** Crystallize fires per-feature (potentially weekly). Validate fires per-quarter or on-demand. Folding one into the other would either over-run validate or under-run crystallize.
- **Different mutation semantics.** Crystallize applies typed mutations to the cold layer with the user's yes. Validate's semantic pass *never* applies; it produces a triage list. Validate's structural pass *does* apply, but to file-shape concerns the user yes's collectively, not per-atom.

`validate` descends from the prior `lex-audit` + `lex-migrate` pair, merged because those two were the same primitive (cold layer vs. some external truth) wearing different costumes. Crystallize is a genuinely different primitive (project-state delta absorbed into the cold layer) and stays separate.

### Why `spec` is its own subcommand (and why specs aren't XML)

Added after the spec-authoring conventions were reconciled into the bundle. The decision that shaped it: **specs occupy a distinct altitude the cold layer can't reach.** The cold layer is small by design (~500 lines/file), structured, always-loaded — it answers *"what are our words and rules?"* A spec answers *"how does this subsystem work, end to end?"*: per-feature narrative, mermaid flows, the history of how it was built. Forcing that into the typed XML graph would either bloat the cold layer past its always-readable size or mangle prose-shaped content into prose-in-strings — the same reason plans and reports are markdown (see "Why deltas are markdown"). So specs stay **markdown**, human-directly-readable, under `lexicon/specs/`.

The load-bearing reconciliation is **vocabulary ownership**: a spec must NOT carry its own glossary. Two glossaries (one in the spec, one in the cold layer) drift — the exact disease lexicon treats. So Shape B specs reference cold-layer atoms by `[[fqid]]` instead of redefining them; the viewer resolves those links. The cold layer owns vocabulary; the spec owns narrative that *uses* it.

`spec` is a distinct lifecycle moment, not folded into `crystallize`, because authoring/evolving a design doc is forward-flow and human-paced, while crystallize is diff-driven absorption. But the two **pair at completion**: when the user confirms a feature is done, that one moment has two outputs — `crystallize` absorbs vocabulary/invariants into the cold layer, and `spec` promotes the design doc (Shape A → as-built Shape B, progress note deleted, `git mv` to `established/`). This deliberately mirrors crystallize's user-triggered discipline: promotion needs explicit user confirmation that the work is built, because the agent is not a reliable judge of "done" (same reasoning as "Why crystallize is user-triggered").

What was consciously *not* done: this is the "Light" integration. Specs were cloned into the bundle and reconciled (paths under `lexicon/`, vocabulary deferral, completion pairing, viewer rendering), but the spec artifact was NOT absorbed into the XML schema and `spec` does not write to the cold layer — cold-layer mutations still route only through `crystallize`. If a future iteration is tempted to make `spec` emit atoms directly, that breaks Rule 5 (cold-layer edits go through crystallize); resist it.

### Why `meta-evolve` is slash-only

Bundle edits are deliberate. The slash-command form forces the user to invoke intentionally; volunteering would slide back into the "agent decides what's significant" failure mode the rest of the workflow explicitly rejects.

The triage gate up front (`bundle-edit / project-quirk / no-op`) is load-bearing — it's what prevents the subcommand from inventing reasons to edit just because it was invoked. The no-op branch must remain a respected outcome.

Where every other subcommand takes the bundle as authoritative and reshapes the project, `meta-evolve` takes the session as authoritative and reshapes the bundle. It writes only to `~/src/lexicon/`; it touches no project file.

### Why structural triggers, not "significance" judgment

Earlier drafts had the drift checks escalate based on "is this significant?" Rejected because **the agent is the worst possible judge of significance** — either over-escalates (to seem safe) or under-escalates (to seem efficient).

Current design escalates on **structural triggers** (vocabulary, invariants, boundaries, decisions) which are mechanically detectable and hard to game. A 3-line change that violates an invariant escalates; a 300-line mechanical refactor doesn't. This is the most important calibration in the system. Resist the temptation to add a "size" or "complexity" heuristic — that path leads back to subjective judgment. The triggers live in `reference/checks.md` and now fire inside `crystallize` (forward) and `validate` (backward).

### Why retro was removed (v1.0)

This subsection used to be "Why session-end retro runs always, not conditionally" — the argument that a retro should fire at every stopping point, always writing a log to `retros/`, because "the question gets asked, every time" and the agent is a poor judge of triviality.

In practice the premise didn't hold. Stopping-point detection was unreliable, so the "always" never materialized; the user (Huy) reported he would never invoke `retro` deliberately, and the logs were never read between crystallizations. An always-on step that doesn't reliably run, producing an artifact nobody reads, is ceremony — exactly what lexicon is supposed to avoid.

The **worthy piece** of retro was running the six structural checks forward over the session's diff. That work didn't need a separate per-session step or a log file: `crystallize` already ran the same checks at cumulative scope. v1.0 makes `crystallize` read the **git diff since `.last-crystallized`** as its primary input and run the checks over it directly. Git history is the always-written, never-forgotten session log the `retros/` directory was pretending to be.

What was genuinely lost: the sub-threshold "notes for future sweeps" scratchpad, where an observation too small to flag could accumulate across sessions until it crossed a line. If that loss bites — if real drift is slipping through because there's nowhere to park a half-signal between crystallizations — the fix is a lightweight note mechanism, *not* a revived always-on retro. Name the failure first.

### Why crystallize is user-triggered, not agent-triggered

The agent doesn't reliably know when work is "done" — it knows when a session ends. Feature-completion is a user judgment call.

Crystallize runs only when the user says so ("crystallize", "update lexicon", "feature X is done"). The trigger broadens too — it's no longer feature-scoped only, also "user wants to absorb accumulated work into the cold layer." Read the git diff newer than `lexicon/.last-crystallized`, run the structural checks over it, propose, apply, update the marker.

This pairs naturally with the absence of a Stop hook: there's no good "session end" or "feature end" signal the agent can detect, so don't pretend there is. The user is the source of that signal. (And since v1.0 folded retro into crystallize, crystallize is also the *only* forward-flow drift catcher — one more reason it must actually get run; see the open question on stale cold layers.)

---

## Design-system vocabulary inside the cold layer

Design systems and DDD's ubiquitous language are the same primitive applied to different surfaces — both are "the same nouns must appear in code, in conversation, and in the cold doc, or alignment drifts." The failure modes rhyme exactly: silent renaming (`Card` → `Tile` → `Panel`), invariants that quietly erode (the focus-state contract), boundary leaks (raw `<button>` escaping the wrapper component).

Concretely: design vocabulary is fields in `system.xml` (tokens, components, layout primitives, interaction patterns, a11y invariants) plus dedicated `surfaces/<slug>.xml` files for named layout zones. Backend-only projects skip these entirely. The structural checks gain design-system signals (hex literal outside the token file; new component file; raw HTML escaping the wrapper layer; a11y invariant touched) — no new checks; `reference/checks.md` names them per check, and crystallize / validate inherit automatically.

### Why design vocabulary gained a surfaces/regions tier

v0.6.0's tiers (tokens, components, layout primitives, interaction patterns, a11y invariants) didn't cover the **named layout zones inside a specific surface** — "the right sidebar of the composer view," "the header strip of the run page." Real use surfaced this: "I have no idea how to call the right sidebar in the composer view." Without names, the team and agent can't refer to these regions precisely; retros can't flag drift in them.

The key separation: **conceptual identity is the naming gate, implementation status is metadata.** A region earns a name when the team refers to it as a discrete piece — even if its code is still an inline JSX block. v1.0's schema encodes this directly: a region carries exactly one of `<component-impl>` or `<inline-impl>` as a child element, with file:line attributes on the inline variant. A future extraction becomes a single-element swap, not a vocabulary change.

The pathology to watch: surfaces/regions sections bloating to the size of the rendered tree. The conversational-referent rule ("the team refers to it as a discrete piece") is the trim discipline.

### Why templates carry no meta-instructional prose

Templates ship as bare structure — section headings and placeholder examples, no blockquote prefaces, no "on completion run crystallize" notes, no `*Optional.*` labels. After the user fills in real content, any meta-instruction becomes vestigial noise that looks authoritative enough to demand attention before being dismissed. The agent reads `SKILL.md` and the relevant subcommand every session for the rules; the human has internalized them by the second read.

If you're tempted to add explanatory prose to a template "so the user knows what to put there": that's a sign the subcommand body is under-explaining. Fix the subcommand, not the template.

---

## Why proposals and session sharding were removed (v0.5.0, preserved through consolidation)

v0.1.0–v0.4.0 treated the cold doc (then `system.md`) as write-protected and routed every proposed edit through `lexicon/plans/_proposals/<file>.md`, with the user as the merge coordinator.

In real interactive use, this turned out to be ceremony for ceremony's sake:

- **The deliberate-review property is already there in the Edit-approval loop.** When `crystallize` proposes a diff in chat and applies via Edit, the user sees the exact change before it lands. The proposal *file* added a round-trip without adding a guarantee.
- **The serialization-point property only mattered for parallel agents,** and parallel agents on the same repo are rare in practice. When they do happen, git already gives you conflict detection and merge resolution; lexicon's staging area was duplicating git's job, less reliably.
- **The two-stage flow created its own failure mode.** Proposals would pile up because there was no event forcing the user to triage them.

The property that *was* worth preserving: cold-layer edits are deliberate. That's now encoded as Rule 6 in `reference/rules.md` (don't drive-by-edit the cold layer; route through `crystallize`) plus the explicit propose-then-apply discipline in `subcommands/crystallize.md`. Same property, no file artifact.

If you find yourself wanting to bring proposals back: ask whether the failure mode you're trying to address is real or hypothetical. If it's real, name the failure first, then design the minimum mechanism that addresses it.

---

## Why `lexicon-prefs.md` is deprecated

v0.1.0–v0.6.0 had per-project `lexicon/calibration.md`; it failed because most calibration is about *the user*, not the project, so lessons didn't propagate across projects. v0.7.0 replaced it with user-level `~/src/lexicon/lexicon-prefs.md` captured via an explicit "for lexicon: <X>" trigger phrase; it failed because the buffer-then-curate model didn't pay for itself.

`/lexicon:meta-evolve` (formerly `/lex-meta`) replaced both. Conversation is the primary signal; the bundle repo's dirty working tree is the accumulation buffer; SKILL.md / subcommand / reference files are edited directly.

The `lexicon-prefs.md` file at the repo root is kept for now as a deprecated artifact; it's referenced nowhere. Cleanup is a future `/lexicon:meta-evolve` candidate.

---

## Schema versioning and the migration-delta discipline

The cold-layer schema is versioned (currently v1.0). `validate`'s structural pass is built as an **orchestrator + per-version deltas**: the subcommand body knows how to detect a project's current version, compute the chain to the latest, and apply each delta. The substance of each version bump lives in its own file under `skills/lexicon/migrations/v<old>-to-v<new>.md`.

### What this means for future schema bumps

When the cold-layer schema bumps (v0.3 → v0.4, …), the work is:

1. **Update `skills/lexicon/reference/schema.md`** to document the new version's schema additions (the spec is authoritative there).
2. **Bump the viewer schema** (`viewer/server/schema.ts`): raise `SCHEMA_VERSION` and add the new literal to the `schemaVersion` zod union so files declaring the new version validate. Mirror any new fields into `viewer/client/src/lib/types.ts`. Wire any new resolver / renderer support in the loader and client.
3. **Write `skills/lexicon/migrations/v<old>-to-v<new>.md`** — the delta. Use the existing three files as the structural template: preamble, pre-flight, detection phase, apply phases, validate phase, report-section template.
4. **Update the "supported deltas" list** in `skills/lexicon/subcommands/validate.md` so the orchestrator names the new delta. No other changes to the orchestrator.

Step 3 is the load-bearing one. Without a delta file, `validate`'s structural pass cannot upgrade existing projects to the new version. **Every schema bump ships a delta.**

### Why deltas are markdown, not XML

A delta is a runbook for an agent — natural-language phases, decision rules with rationale, examples of good/bad outcomes. XML (or YAML) would force the substance into prose-in-strings anyway, with worse formatting. The cold-layer artifacts the deltas *produce* are XML (since v1.0); the deltas themselves are prose because they're instructions for a reader.

The same applies to `validate` reports, `bootstrap` reports, and the migration report sections: all markdown, because they're meant for human (and agent) reading, not for the cold-layer's typed graph. Plan files under `lexicon/plans/<feature>/` are the other exception — markdown for the same reason.

---

## Things that look optional but are load-bearing

Easy targets for "simplification" that would actually break the system. Don't remove without reading the reasoning above.

- **The `lexicon/.last-crystallized` marker.** Trivial file (one ISO timestamp), critical role: it's the anchor for the git-diff window `crystallize` considers. Without it, every crystallization either re-considers the entire history or asks the user "since when?" — both worse. (Since v1.0 removed `retros/`, this marker is the *only* thing telling `crystallize` where the last absorption ended.)
- **The bundle repo's dirty working tree at `~/src/lexicon/`.** Uncommitted edits accumulated across `/lexicon:meta-evolve` invocations are the buffer that makes lexicon adapt to the user across projects. Without that property, the same corrections get re-made every project.
- **The user-as-trigger property of `crystallize`.** Tempting to make the model volunteer crystallizations when drift piles up. Don't. The premise is that the model isn't a reliable judge of "done" — making it a judge again undoes the simplification.
- **The "Items deliberately not flagged" section in `validate` reports.** Looks like padding. Is the discipline that keeps reports from over-flagging — without it, the model lists everything ambiguous and the user's review budget collapses.
- **The "explicit slash only" rule for `meta-evolve`.** The soft enforcement (dispatch checks for inference and asks) is what prevents cross-repo writes from being silent.

---

## Open questions for v0.x

These are things the current shape doesn't answer. Future iterations should grapple with them, ideally informed by real usage.

### Should there be a sub-threshold note mechanism between crystallizations?

v1.0 removed `retros/` and with it the `## Notes for future sweeps` scratchpad — the place an observation too small to flag could sit until it accumulated into something worth absorbing. `crystallize` now works purely from the git diff, which catches *what changed* but not *what the agent noticed-but-couldn't-yet-justify*. If real drift starts slipping through for lack of anywhere to park a half-signal, the answer is a single lightweight note file (not a per-session always-on log — that's the failure mode v1.0 just removed). Open until real usage shows whether the gap bites.

### How do you crystallize a sprawling, long-neglected period?

Because `crystallize` reads the git diff since `.last-crystallized`, a marker that hasn't moved in months means a huge, multi-area diff — harder to absorb accurately than a tight one. `crystallize` surfaces this ("~40 commits across four areas since the last crystallization — scope to one area at a time?") and can run feature-scoped over a subset, but the real mitigation is cadence: crystallize at natural boundaries. This is the inverse risk of the stale-cold-layer open question below.

### Plan-mode interaction

Native plan mode and `lexicon/plans/<feature>/` are meant to compose: native plan mode for the interactive draft stage, materialization to `lexicon/plans/<feature>/` when the plan is substantial enough to outlive the session. v0.11.0 has no `materialize-plan` subcommand. The user does it manually if they want it.

A materialization subcommand is the obvious next addition. The hard part is the *threshold* — when is a plan worth persisting? "More than X files touched" is too mechanical. "Crosses a cold-layer boundary" is closer. Worth thinking about before adding.

### Stale cold layer when crystallize never runs

User-triggered crystallize has the inverse failure mode of agent-triggered: if the user never says "crystallize," the cold layer stops absorbing changes, drift accumulates silently, and the workflow degrades to ceremony-around-a-frozen-doc. `validate` partially addresses this (its hygiene sweep flags a stale `.last-crystallized` against recent git activity), but `validate` is also user-triggered. Removing the always-on retro made this sharper: there's no longer even a per-session artifact whose pile-up could hint that crystallize is overdue — the only signal is the git log getting ahead of the marker.

If validate + crystallize both go neglected, lexicon has no recourse. The right answer is probably *some* nudge — at ground time, noticing the git log has run well ahead of `.last-crystallized` and asking "want to crystallize first?" — without crossing into model-volunteers-crystallize territory. That nudge isn't designed yet.

### Validators

`skills/lexicon/validators/` now has four standalone tree-sitter scripts (`anchor-health.ts`, `crystallize-signals.ts`, `reground.ts`, `impact.ts`) invoked with `<codeRoot> --artifact-root <artifactRoot>`. They are advisory: they emit mechanical candidates for `validate` / `ground` / `crystallize` to triage. The viewer's loader at `viewer/server/loader.ts` remains the source of truth for structural validity.

Still unbuilt: a deterministic XML/`xmllint --schema` pass, plus a richer TypeScript check for ref resolution, duplicate-slug detection, and seam-direction sanity (semantics XSD can't express).

---

## How to iterate this plugin

Cheap edits, in increasing order of risk:

1. **Skill description and subcommand description tuning** (patch). Adjust pushiness, add example cues, sharpen contexts. This is the lever for triggering accuracy. Test by using lexicon on a real project and noting when subcommands should-have-fired-but-didn't or fired-when-they-shouldn't-have.

2. **Subcommand body prose** (patch). Clarify instructions, add examples, expand the "when to skip" sections. Doesn't change behavior, just clarity.

3. **Reference file content** (patch to minor). `schema.md`, `checks.md`, `rules.md` are the most-read content; tightening them is high-leverage. Note that schema changes are *not* patches — see "Schema versioning" above.

4. **Structural-check granularity** (minor). The current six checks are binary (fire/no-fire). Reality is more "kinda touched a boundary." If this granularity feels wrong in practice, `reference/checks.md` is the place to add nuance — but be careful not to slip back into significance-judgment.

5. **Adding a subcommand** (minor). Most likely candidates: `materialize-plan`. Each one should be justified by a concrete recurring failure in real use, not by "it would be nice if..." Adding a subcommand means a new `subcommands/<name>.md`, a new `commands/<name>.md` wrapper, and a dispatch update in `SKILL.md`.

6. **Project-shape changes** (major). Renaming directories, restructuring `lexicon/`, changing the file conventions. These break existing lexicon-managed projects and should be very rare. Bump major version, document migration steps.

When in doubt about whether something is patch/minor/major, ask: "would an existing lexicon user need to do anything to upgrade?" If no → patch. If yes-but-easy → minor. If their existing `lexicon/` folder breaks → major.

---

## Working with this repo as a Claude Code session

If you're a future agent helping iterate on lexicon:

- **Read this file first.** Then `README.md` (user-facing pitch) and `CHANGELOG.md` (what's shipped).
- **Then read the skill** in this order: `skills/lexicon/SKILL.md`, `skills/lexicon/reference/{schema,checks,rules,design}.md`, `skills/lexicon/subcommands/{bootstrap,ground,crystallize,validate,meta-evolve}.md`. Each builds on the previous.
- **Don't edit a subcommand body without reading the whole subcommand.** The files are short by design; partial reads lead to inconsistent edits.
- **For triggering-accuracy work:** don't speculate from the description alone. Test on real projects and note what fired wrongly or didn't fire when it should have.
- **When the user disagrees with a draft, push back if you have reasoning, then defer.** The original design conversation worked this way: the user critiques, the agent thinks through whether the critique lands, agrees or disagrees with reasoning, and adjusts. Don't just acquiesce — that loses the design rigor.

### Style conventions for SKILL.md and subcommand files

- **Imperative mood** for instructions ("Read X", "Write Y to Z").
- **Honest hedging** about uncertainty ("If unclear, surface this to the user — that's a real signal, not a failure").
- **Counter-examples** for behavior that's tempting but wrong ("If you're tempted to call something 'trivial' but it touches an entity in `system.xml`, it's not trivial").
- **Cross-references by full subcommand name** (`crystallize`, not just "the next subcommand").
- **No bullet-point soup.** Prose where possible. Lists only where the items are genuinely parallel.
- **Pushy descriptions** in the SKILL.md YAML frontmatter, but **measured prose** in the body. The frontmatter has to compete for trigger; the body has to be clear. (Note: SKILL.md frontmatter stays YAML — Claude Code's skill loader expects that format; only the lexicon cold-layer files flipped to XML in v1.0.)
