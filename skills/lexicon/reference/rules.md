# Rules of engagement

Applies whenever a project has `lexicon/system.xml`. The terse version lives in `SKILL.md`'s "Standing rules"; this file covers the edge cases.

## 1. Read `system.xml` first (and relevant context files)

Before substantive work, read `system.xml` end to end. It's small by design — under ~500 lines. If it's longer, surface to the user as a sign the cold doc is rotting (or that the project has outgrown one file and should partition into `contexts/<slug>.xml`).

If `lexicon/contexts/` exists, also read the context file(s) matching the bounded context of the work being done. `system.xml`'s `<contexts>` index lists the available slugs. Loading every context file eagerly defeats the partitioning — load only what's relevant. When in doubt, ask the user which context the work is in.

If `lexicon/surfaces/` exists and the work touches UI, load the relevant surface file(s) too.

## 2. Ground before code

For any task that isn't strictly mechanical (typo fixes in comments, dependency version bumps with no API change, log-message wording tweaks, local-variable renames), run the `ground` subcommand before writing or modifying code. Skipping grounding is the most common source of silent drift.

If you're tempted to call something "trivial" but it touches a file mentioned in `system.xml` or a context file, it's not trivial — run the full grounding.

## 3. Surface contradictions

If the cold-layer XML contradicts the code or the user's request, **stop and surface it before proceeding**. Don't quietly work around it. Don't hallucinate that the doc is right.

The same applies during `crystallize`: if the existing cold layer contains entries that look mutually inconsistent (a term defined two different ways across contexts, an aggregate's `members:` pointing at a deleted term, a seam whose `upstream`/`downstream` refer to nonexistent contexts), surface it before proposing the new mutation set. Don't smooth it over silently.

## 4. Always retro

At any natural stopping point, run `retro`. Signals: the user says "looks good", "we're done", "thanks", "ok ship it"; tests pass and the user moves on without further direction; a feature with an active plan is verified working.

Most retros log only the session summary; the structural-check section flags drift only when triggers actually fire. The point is the question gets asked every time, so structural drift is caught at the cheapest moment.

If unsure whether a stopping point has been reached, lean toward running. The cost of running unnecessarily is a small log file. The cost of skipping is silent drift.

## 5. Crystallize on the user's call

`crystallize` is **user-triggered**, not agent-triggered. The agent doesn't reliably know when a body of work is "done" — the user does.

When the user says "crystallize", "update lexicon", "absorb the retros", "feature X is done", "we're shipping X", or anything similar, run `crystallize`. Don't volunteer to crystallize unprompted.

If you suspect drift has accumulated (many retros since the last `.last-crystallized`, the same flag repeating), you may *surface* it as a question — "There are 12 retros since the last crystallization, several flagging the same `ScanQueue` term — want to crystallize?" — and let the user decide. Surfacing is fine; running uninvited isn't.

## 6. Cold-layer edits go through `crystallize`

Don't edit `lexicon/system.xml`, `lexicon/contexts/*.xml`, or `lexicon/surfaces/*.xml` as a drive-by side effect of unrelated work. Cold-layer changes are deliberate: propose the typed mutations in conversation, get explicit approval, then apply. `crystallize` is the subcommand that does this; outside of it, leave the cold layer alone.

Direct edits ARE fine when the user explicitly asks for them — *"fix this typo in system.xml"*, *"add `ScanQueue` to the glossary now"*. The rule is against silent drive-by edits, not against deliberate small ones. A one-line edit the user asked for doesn't need the full `crystallize` ritual.

This applies to the design-system files too. Adding "just one more shade of blue" to the token list, or naming a new component inline, is a cold-layer edit — route through `crystallize` like any other vocabulary addition.

## 7. IDs are slugs; rename ≠ re-slug

Display `name:` mutates freely. The `id:` (slug) is the stable handle. Refs in other files use the slug; renaming a slug breaks them.

When a slug genuinely no longer fits the concept, treat it as a `crystallize` rename operation — the subcommand applies the slug change and cascades the reference updates in a single typed mutation. Don't change a slug inline as an editing afterthought; the references that already point at the old slug will dangle silently.

## 8. Respect project-specific overrides in `CLAUDE.md`

Project-specific overrides for lexicon's defaults — what to flag, what to skip, naming conventions, calibration — live in the project's `CLAUDE.md`. That file is loaded by Claude Code automatically at session start; treat its entries as live overrides of the defaults here, until a future `/lexicon:evolve` pass absorbs them into the bundle.

Cross-project overrides (the role the old `lexicon-prefs.md` played) are not maintained here; that file is deprecated. The current mechanism is `/lexicon:evolve` — when a correction recurs across projects and should generalize, evolve amends the relevant SKILL.md or subcommand file in this bundle directly.

## When this workflow doesn't apply

If a project has no `lexicon/` folder, surface once near the start of substantive work: *"This project doesn't have lexicon docs. Want to run `adopt`?"* — and respect a "no" by not asking again that session. Use a `.lexicon-skip` marker file at the repo root if the user wants the skip to persist across sessions.

If a project's `lexicon/` is on an older schema (v0.3 YAML, v0.2 YAML, v0.1 YAML, or pre-v0.1 markdown `lexicon/system.md`), surface once: *"This project is on lexicon schema vX; v1.0 is current. Want to run `conform` first?"* Respect a "no"; the operational subcommands won't run cleanly until structural migration happens, and the viewer (if used) will refuse to render the project.

The workflow is opt-in per project. Small scripts, throwaway prototypes, and exploratory notebooks usually don't benefit.

## Honest limitations

- **The agent is a fallible filter.** Drift flags will sometimes be noise; real changes will sometimes be missed. The fix for systematic miscalibration is `/lexicon:evolve`, not silent acceptance.
- **Cold-layer rot is real.** If the cold layer isn't getting updated despite repeated retros surfacing drift, the workflow degrades to ceremony. The *user* has to actually run `crystallize` periodically; no skill design fixes a doc that's never reviewed.
- **Concurrent agents.** If you run multiple sessions on the same repo, lexicon doesn't coordinate them — each session reads the cold layer, does its work, writes its retro. Conflicts surface as ordinary git conflicts. Lexicon doesn't try to prevent this; it just stays out of the way.
