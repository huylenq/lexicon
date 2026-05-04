---
name: lex-crystallize
description: "Run when a multi-session feature, plan, or epic is finished — code landed, tests passing, the work conceptually complete. The heavier counterpart to lex-retro: reviews cumulative changes against system.md, decides what to absorb into the cold doc, archives the plan. Trigger on phrases like 'we're done with X', 'feature X is shipped', 'wrap up the X work', or when an entry under lexicon/plans/<feature>/ reaches completion. Don't use for every session — that's lex-retro. Read lex-overview first."
---

# Lexicon: crystallize

`lex-retro` runs at every stopping point. **`lex-crystallize` runs at feature-completion**, which is rarer and warrants a deeper pass.

A feature usually spans multiple sessions. Each session's retro looks at one slice. When the whole feature is done, you need a *cumulative* view — what did this body of work, taken together, change about how the system should be understood?

If you haven't loaded `lex-overview` yet this session, read it first.

## When to run this

Run when:
- The user says a feature, epic, or plan is done.
- A folder under `lexicon/plans/<feature>/` has all its tasks completed.
- A native plan-mode plan has been fully executed and verified.

Don't run for:
- Single-session work (use `lex-retro`).
- Work in progress (run `lex-retro` for each stopping point along the way).
- Bug fixes, even big ones, unless they shifted the model.

If unsure, ask: "Should I crystallize this, or just retro it?" The user knows whether the work was a feature or a session.

## Gather inputs

Read:
1. The plan folder (`lexicon/plans/<feature>/` if one exists) — original intent, scope, decisions made along the way.
2. All retros and proposals from sessions that touched this work — find them by searching `_retros/` and `_proposals/` for references to the feature, or by date range.
3. `lexicon/system.md` — current cold model.
4. `lexicon/calibration.md` if it exists.
5. `lexicon/decisions/` — recent ADRs that might overlap.
6. The cumulative code diff for the feature (compare branch or tag-to-tag if available; otherwise reconstruct from the plan's file list).

This is a bigger read than `lex-retro`. Take time on it.

## Re-run structural checks at feature scope

Run the six checks defined in `lex-overview` § Structural checks, applied **forward against the feature's cumulative diff**: *did the feature as a whole shift the model?*

The cumulative framing changes how each check lands:

- **Vocabulary** — filter for terms that *stuck around and stabilized* across the feature. Terms that appeared in one session and got renamed by the next aren't worth glossarying.
- **Vocabulary consistency** — look at coherence *across* all sessions. If terminology drifted within the feature, the feature itself surfaced a vocabulary problem worth fixing.
- **Invariants** — features are often *defined by* an invariant change. Look for adds, removes, modifications across the whole diff, not per-session.
- **Boundaries** — re-look at the bounded-context section with fresh eyes; cumulative boundary changes often hide in incremental session diffs.
- **Decisions** — prefer a single ADR for the feature when scattered session-level decisions cohere into one story.
- **Declared scope match (cumulative)** — did the feature deliver what it set out to, or did it become something else? If it became something else, that often reveals a model update.

## The crystallization step

The new behavior unique to this skill: **propose updates to the cold layer as a coherent diff, not as scattered points.**

A crystallization isn't a list of bullets. It's a small set of edits to `system.md` (and/or relevant Domain Views) that, taken together, leave the cold layer more accurate than before. Aim for the smallest possible diff that captures what shifted. If the diff is large, that's a signal the feature was bigger than expected, or the prior cold layer was significantly out of date.

If the project uses Domain Views, a feature often touches one view primarily and `system.md` lightly (e.g., adding a new term to the relevant view's glossary plus updating cross-context invariants in `system.md` if the feature shifted a boundary). Target each file explicitly. A feature that touches *every* view is a sign that either the feature redrew context boundaries (which is itself worth crystallizing carefully) or the partition needs revisiting — surface that.

Write the crystallization proposal to `lexicon/plans/_proposals/crystallize-<feature>-<iso>.md`:

```markdown
# Crystallization: <feature name>
Period: <start date> — <end date>
Sessions involved: <session-ids>
Targets: <lexicon/system.md and/or lexicon/views/<slug>.md — name each file explicitly>

## Summary of what shipped
<2-3 sentences. What does the system do now that it didn't before?>

## Proposed updates to the cold layer
> Group the proposed changes by target file. If the project uses Domain Views, most edits typically land in the view(s) for the affected context(s); cross-context shifts land in system.md.

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
The plan folder `lexicon/plans/<feature>/` should be:
- [ ] archived to `lexicon/plans/_archive/<feature>/` (default)
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

The crystallization is a *proposal*. It does not edit `lexicon/system.md` directly. The user reviews, possibly asks for revisions, and explicitly accepts before the diff is applied.

After the user accepts:
- Apply the diff to `lexicon/system.md`.
- Write any new ADRs to `lexicon/decisions/`.
- Move the plan folder to `lexicon/plans/_archive/<feature>/` (or per the user's choice).
- Move the crystallization proposal itself to `lexicon/plans/_archive/_crystallizations/<feature>-<iso>.md` for history.

## Tell the user

When the proposal is written, summarize in chat:

> Crystallization for <feature> is at `lexicon/plans/_proposals/crystallize-<feature>-...md`. It proposes <N> glossary additions, <M> invariant changes, and recommends archiving the plan folder. Review when ready.

Don't dump the diff into chat. The proposal file is the artifact; chat is the pointer.

## On the relationship to retro

If `lex-retro` ran properly during the feature, most of the work for crystallization is already done — you're aggregating across retros, not starting from scratch. If retros were *not* run (for whatever reason), crystallization has to do all the structural-check work on the full diff, which is harder and more error-prone. Surface that if you notice it: "I see only N retros for this feature though it spanned M sessions; the crystallization may miss things that proper retros would have caught."

The system is designed to work even with imperfect retro coverage, but it works *best* when the cool-tier logs were faithfully written along the way.
