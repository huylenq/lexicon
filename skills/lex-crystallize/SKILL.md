---
name: lex-crystallize
description: "Run when the user asks to update the cold layer — phrases like 'crystallize', 'update lexicon', 'sync lexicon', 'absorb the retros', 'feature X is done', 'we're shipping X'. User-triggered, not agent-triggered: don't volunteer this unprompted. Reads retros since the last crystallization, cross-checks against git diff, proposes a coherent diff to system.md (and views) inline in conversation, and applies it directly on the user's yes. Read lex-overview first."
---

# Lexicon: crystallize

`lex-retro` runs at every stopping point and logs drift flags. **`lex-crystallize` runs when you tell it to** — it absorbs accumulated retros into the cold layer.

The agent doesn't reliably know when a body of work is "done" or when accumulated drift is worth absorbing. The user does. So this skill is **user-triggered**: it runs when the user says so, not when the agent guesses.

If you haven't loaded `lex-overview` yet this session, read it first.

## When to run this

Run when the user explicitly says one of:
- "crystallize" / "crystallize the work" / "crystallize feature X"
- "update lexicon" / "update system.md" / "absorb the retros" / "sync lexicon"
- "we're done with X" / "feature X is shipped" / "wrap up X"

Don't volunteer this unprompted. If you suspect drift has accumulated, surface it as a question ("There are 12 retros since the last crystallization, several flagging the same `ScanQueue` term — want to crystallize?") and let the user decide. The user is the trigger.

If the user just wants to make a small targeted edit ("add `ScanQueue` to the glossary"), apply that directly without running the full crystallize ritual. This skill is for *aggregated* updates; one-line edits are just edits.

### Period-scoped vs feature-scoped

By default, crystallize considers **all retros newer than `.last-crystallized`** — period-scoped. This is the right mode for "update lexicon" / "absorb the retros."

If the user names a specific feature ("crystallize feature X", "we're done with X"), run **feature-scoped**: filter retros whose scope declaration references that feature, and consider only those. Don't update `.last-crystallized` to "now" afterward — that would skip the non-feature retros from a later period-scoped run. Instead, leave the marker untouched and tell the user: "Crystallized feature X. <N> non-feature retros are still unaddressed — they'll show up in the next period-scoped crystallize."

If the filter is ambiguous (the user says "crystallize the recent work" with no feature name), ask before guessing.

## Gather inputs

Read:

1. **The crystallization marker.** `lexicon/.last-crystallized` contains an ISO timestamp of the last successful crystallization. If absent, treat all retros as in-scope.
2. **All retros newer than the marker.** Files in `lexicon/retros/` whose names sort after the marker timestamp. Pay particular attention to:
   - `## Structural drift` sections (real flags worth absorbing).
   - `## Notes for future sweeps` (sub-flag-threshold patterns that may have crossed the line cumulatively).
3. **Cross-check with git.** Run `git log --since=<marker>` and `git diff <commit-at-marker>..HEAD` over the relevant code paths. Catches drift the retros missed (skipped retros, silent renames the structural checks didn't flag).
4. `lexicon/system.md` — the current cold model.
5. Relevant `lexicon/views/*.md` — whichever views the diff touches.
6. `lexicon/decisions/` — recent ADRs that might overlap with what you're about to propose.
7. `lexicon/calibration.md` if it exists.

This is a bigger read than a retro. Take the time on it. Crystallization done badly is worse than crystallization skipped — a wrong glossary entry is harder to remove than a missing one is to add.

## Run the structural checks at cumulative scope

Run the six checks defined in `lex-overview` § Structural checks, applied **forward against the cumulative diff since the last crystallization**: *did the accumulated work shift the model?*

The cumulative framing changes how each check lands:

- **Vocabulary** — filter for terms that *stuck around and stabilized* across multiple sessions. A term that appeared in one retro and got renamed by the next isn't worth glossarying.
- **Vocabulary consistency** — look at coherence *across* all retros and the current code. If terminology drifted within the period, that's a vocabulary problem worth fixing.
- **Invariants** — look for adds, removes, modifications across the whole diff, not per-session.
- **Boundaries** — re-look at the bounded-context section with fresh eyes; cumulative boundary changes often hide in incremental session diffs.
- **Decisions** — prefer a single ADR for a coherent decision arc when scattered session-level decisions cohere into one story.
- **Declared scope match (cumulative)** — did the work as a whole stay where it said it would, or did it become something else? If it became something else, that often reveals a model update.

## Surface pre-existing inconsistencies

If `system.md` (or a view) already contains passages that look mutually inconsistent — a term defined two slightly different ways, an invariant that contradicts another, a boundary description out of step with the bounded-contexts list — **surface this to the user before proposing the new diff**. Don't smooth it over silently.

These usually come from previous incomplete edits, concurrent sessions that didn't reconcile, or older content that got partially updated. The right move is to name what you found and ask: "Should I reconcile this as part of the crystallization, or is it intentional?" Reconciling without asking is exactly the kind of silent edit lexicon exists to prevent.

## Propose the diff inline

Don't write a proposal file. Present the proposed changes **in conversation**, grouped by target file. Aim for the smallest possible diff that captures what shifted.

Use this shape in chat:

> ## Crystallization proposal
> Period: `<marker timestamp>` → now
> Retros considered: `<N>` (`<list of timestamps or a range>`)
> Targets: `<lexicon/system.md and/or lexicon/views/<slug>.md>`
>
> ### Summary
> <2-3 sentences: what does the system do now that it didn't before, or what did we learn that wasn't captured?>
>
> ### Proposed edits
> *(Group by target file. Show actual diff hunks where helpful. Cluster by category: glossary additions, glossary refinements, invariant changes, boundary changes, "why" notes.)*
>
> ```diff
> --- a/lexicon/system.md
> +++ b/lexicon/system.md
> @@ glossary @@
> +**ScanQueue**: ordered buffer holding inference jobs between intake and the worker pool. Distinct from `JobQueue` (which is per-worker) — see ADR-0042.
> ```
>
> ### ADRs to add
> - `ADR-NNNN: <title>` — <one-line summary, body to be written if you accept>
>
> ### Deliberately NOT changing
> <Adjacent things you noticed but are excluding from this crystallization. These are visible-but-deferred — call them out so they're not silently lost.>
>
> ### Confidence: <low | medium | high>
>
> Apply this? (yes / revise / no)

If the project uses Domain Views, name the targets explicitly. A crystallization that touches *every* view is a sign the partition needs revisiting — surface that as its own observation.

## Apply on yes

When the user says yes:

1. **Apply the diff to the named files** using Edit. Group changes by file; one Edit per logical hunk.
2. **Append any new ADRs** to `lexicon/decisions/`.
3. **If a feature plan was involved**, move `lexicon/plans/<feature>/` to `lexicon/plans/_archive/<feature>/` (ask first if the user didn't explicitly ask to wrap up the feature).
4. **Update the marker.** Write the current ISO timestamp to `lexicon/.last-crystallized`.
5. **Confirm in chat**: "Crystallized. <N> edits applied to <files>; <K> ADRs added; marker updated."

If the user says revise, iterate on the proposal in conversation. Don't apply partial diffs unilaterally.

If the user says no, **still update the marker** if they want future crystallizations to skip these retros — ask: "Skip these retros in future crystallizations? (yes updates the marker; no leaves them in scope)". This avoids re-proposing the same rejected edits next time.

## On the "deliberately NOT changing" section

This is one of the most useful parts of the proposal. Crystallization is tempting to use as a chance to fix everything you've noticed about `system.md`. Resist. Each crystallization should be tightly scoped to what the period actually shifted. Adjacent issues go in the "deliberately NOT changing" section so they're visible but not folded in — a future crystallization, an audit, or a deliberate spec-review session can address them.

Mixing scopes is how cold-layer edits become unreviewable.

## On the relationship to retro

If retros ran consistently during the period, most of the work for crystallization is already done — you're aggregating across drift flags, not starting from scratch. If retros were *not* run (for whatever reason), crystallization has to do all the structural-check work on the full diff, which is harder and more error-prone. Surface that if you notice it: "I see N retros over the last <period>, but the git history shows M sessions of substantive work; the crystallization may miss things that retros would have caught."

The system is designed to work even with imperfect retro coverage, but it works *best* when retros were faithfully written along the way.
