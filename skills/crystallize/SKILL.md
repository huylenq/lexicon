---
name: crystallize
description: "Use this skill when a multi-session feature, plan, or epic is finished — code is landed, tests pass, the work is conceptually complete. This is the heavier counterpart to lexicon:retro: it reviews the cumulative changes from a feature against system.md, decides what to absorb into the cold doc, and archives the plan. Trigger when the user says things like 'we're done with X', 'feature X is shipped', 'wrap up the X work', or when an entry in docs/plans/<feature>/ has reached completion. Don't use this for every session — use lexicon:retro for that. Use this when a coherent piece of work crosses the finish line. This is one of three lexicon skills — read lexicon:overview if you haven't already this session."
---

# Lexicon: crystallize

`lexicon:retro` runs at every stopping point. **`lexicon:crystallize` runs at feature-completion**, which is rarer and warrants a deeper pass.

A feature usually spans multiple sessions. Each session's retro looks at one slice. When the whole feature is done, you need a *cumulative* view — what did this body of work, taken together, change about how the system should be understood?

If you haven't loaded `lexicon:overview` yet this session, read it first.

## When to run this

Run when:
- The user says a feature, epic, or plan is done.
- A folder under `docs/plans/<feature>/` has all its tasks completed.
- A native plan-mode plan has been fully executed and verified.

Don't run for:
- Single-session work (use `lexicon:retro`).
- Work in progress (run `lexicon:retro` for each stopping point along the way).
- Bug fixes, even big ones, unless they shifted the model.

If unsure, ask: "Should I crystallize this, or just retro it?" The user knows whether the work was a feature or a session.

## Gather inputs

Read:
1. The plan folder (`docs/plans/<feature>/` if one exists) — original intent, scope, decisions made along the way.
2. All retros and proposals from sessions that touched this work — find them by searching `_retros/` and `_proposals/` for references to the feature, or by date range.
3. `docs/system.md` — current cold model.
4. `docs/calibration.md` if it exists.
5. `docs/decisions/` — recent ADRs that might overlap.
6. The cumulative code diff for the feature (compare branch or tag-to-tag if available; otherwise reconstruct from the plan's file list).

This is a bigger read than `retro`. Take time on it.

## Re-run structural checks at feature scope

The same six checks from `retro`, but now applied to the **cumulative** result:

- **Vocabulary**: Are there new terms that have *stuck around and stabilized* across the feature? (Terms that appeared in one session and got renamed by the next aren't worth glossarying.)
- **Vocabulary consistency**: Across all sessions, did terminology stay coherent? If not, the feature itself surfaced a vocabulary problem worth fixing.
- **Invariants**: Did the feature add, remove, or modify any invariant? Often a feature is *defined by* an invariant change.
- **Boundaries**: Did the feature cross or redraw any context boundary? Re-look at the bounded-context section of `system.md` with fresh eyes.
- **Decisions**: Are there decisions that span sessions and deserve a single ADR rather than scattered notes?
- **Declared scope match (cumulative)**: Did the feature deliver what it set out to, or did it become something else? If it became something else, that often reveals a model update.

## The crystallization step

The new behavior unique to this skill: **propose updates to `system.md` as a coherent diff, not as scattered points.**

A crystallization isn't a list of bullets. It's a small set of edits to `system.md` that, taken together, leave the cold doc more accurate than before. Aim for the smallest possible diff that captures what shifted. If the diff is large, that's a signal the feature was bigger than expected, or the prior `system.md` was significantly out of date.

Write the crystallization proposal to `docs/plans/_proposals/crystallize-<feature>-<iso>.md`:

```markdown
# Crystallization: <feature name>
Period: <start date> — <end date>
Sessions involved: <session-ids>

## Summary of what shipped
<2-3 sentences. What does the system do now that it didn't before?>

## Proposed updates to system.md

### Glossary additions
- **<Term>**: <definition>. <counter-example: "NOT to be confused with X">

### Glossary refinements
- **<Existing term>**: <how the definition needs to change, and why>

### Invariant changes
- Add: <new invariant, in plain language>
- Modify: <existing invariant → revised version>
- Remove: <invariant that no longer holds, and why it's OK that it doesn't>

### Boundary changes
- <description of new or modified boundary>

### "Why" notes worth recording
- <reasoning that future-readers won't recover from code alone>

## ADRs to write or merge
- <Either: "ADR-NNNN: <title>" with body, or: "Merge existing ADRs A, B, C into single ADR D">

## Plan archival
The plan folder `docs/plans/<feature>/` should be:
- [ ] archived to `docs/plans/_archive/<feature>/` (default)
- [ ] kept (only if it has ongoing reference value)
- [ ] deleted (only if it duplicates information now in system.md)

## Confidence
<low | medium | high>

## What this crystallization deliberately does NOT change
<Sometimes a feature reveals that system.md is wrong about something *adjacent* to the feature. Note it here for a future pass; don't try to fix it now.>
```

## On the "deliberately not changing" section

This is one of the most useful parts of the format. Crystallization is tempting to use as a chance to fix everything you've noticed about `system.md`. Resist. Each crystallization should be tightly scoped to the feature. Adjacent issues go in the "deliberately NOT changing" section so they're visible but not folded in — a future feature, or a deliberate spec-review session, can address them.

Mixing scopes is how proposals become unreviewable.

## Don't apply the diff

The crystallization is a *proposal*. It does not edit `docs/system.md` directly. The user reviews, possibly asks for revisions, and explicitly accepts before the diff is applied.

After the user accepts:
- Apply the diff to `docs/system.md`.
- Write any new ADRs to `docs/decisions/`.
- Move the plan folder to `docs/plans/_archive/<feature>/` (or per the user's choice).
- Move the crystallization proposal itself to `docs/plans/_archive/_crystallizations/<feature>-<iso>.md` for history.

## Tell the user

When the proposal is written, summarize in chat:

> Crystallization for <feature> is at `docs/plans/_proposals/crystallize-<feature>-...md`. It proposes <N> glossary additions, <M> invariant changes, and recommends archiving the plan folder. Review when ready.

Don't dump the diff into chat. The proposal file is the artifact; chat is the pointer.

## On the relationship to retro

If `lexicon:retro` ran properly during the feature, most of the work for crystallization is already done — you're aggregating across retros, not starting from scratch. If retros were *not* run (for whatever reason), crystallization has to do all the structural-check work on the full diff, which is harder and more error-prone. Surface that if you notice it: "I see only N retros for this feature though it spanned M sessions; the crystallization may miss things that proper retros would have caught."

The system is designed to work even with imperfect retro coverage, but it works *best* when the cool-tier logs were faithfully written along the way.
