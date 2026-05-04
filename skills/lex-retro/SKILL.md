---
name: lex-retro
description: "Run at every natural stopping point — task complete, tests pass and the user moves on, signals like 'looks good' / 'we're done' / 'thanks'. NOT optional based on perceived significance; run even on small or chatty sessions. The skill itself decides whether anything escalates to the human; most runs produce a silent log entry only. Skipping is how spec drift goes undetected and the cold doc rots. Read lex-overview first."
---

# Lexicon: retro

This skill closes the loop on a coding session. It runs at every stopping point. The output is almost always silent — a log entry in `lexicon/plans/_retros/` that nobody will read unless something goes wrong later. Occasionally, when structural triggers fire, it produces a proposal for the human.

The point: **the question gets asked, every time.**

If you haven't loaded `lex-overview` yet this session, read it first.

## Recognize the trigger

Run when:
- The user signals completion: "looks good", "that's it", "thanks", "ok we're done"
- A feature/task that had an active plan is verified working
- Tests pass and the user moves on without further direction
- The user explicitly says "wrap up" or "do the retro"

If unsure whether a stopping point has been reached, lean toward running. The cost of running unnecessarily is a small log file. The cost of skipping is silent drift.

## Find the session ID

Look for `$LEXICON_SESSION_ID` or read `lexicon/plans/_scratch/.session-id`. If neither exists, the `lex-ground` skill never ran for this session — note it in the retro ("session ran without grounding; consider whether the work was genuinely trivial"). Mint an ID now if needed.

## Gather inputs

Read, in this order:
1. `lexicon/plans/_active/<session-id>.md` — what the session declared it would do.
2. `lexicon/plans/_scratch/<session-id>.md` — notes accumulated during the session.
3. `lexicon/system.md` — the cold model.
4. `lexicon/calibration.md` if it exists — project-specific significance overrides.
5. The actual code diff for this session (use git: `git diff` against the session's start point if possible, otherwise summarize touched files).
6. Other files in `lexicon/plans/_active/` — to be aware of concurrent sessions.

## Run the structural checks

Run the six checks defined in `lex-overview` § Structural checks, applied **forward against this session's diff**: *did this session introduce anything that conflicts with `system.md`?*

Each check that fires is a candidate for a proposal — except check 5 (Decisions), which becomes a candidate for an ADR (append to `lexicon/decisions/`, lighter than a proposal).

These are the **only** things that escalate to a proposal. Everything else stays silent.

## Decide: silent retro or proposal?

**Silent retro (the common case)**: None of checks 1–4 fired, or they fired but the answer was clearly already covered by `system.md`. Write the retro file and stop.

**Proposal**: One or more structural checks fired with real signal. Write *both* the retro file *and* a proposal file.

Be conservative on escalation. Borderline cases default to silent retro with a note about what was borderline — across multiple sessions, patterns will emerge that justify a proposal even if no single session did. Don't try to be perfectly precise per-session; the architecture handles eventual consistency.

## Write the retro file

Always write `lexicon/plans/_retros/<session-id>.md`:

```markdown
# Retro: <session-id>
Ended: <iso timestamp>
Outcome: <silent | proposal | adr | proposal+adr>

## What was declared
<Copy task and scope from _active/<session-id>.md, briefly.>

## What actually changed
- <file>: <one-line summary>
- <file>: <one-line summary>

## Structural checks
- Vocabulary: <pass | flagged: ...>
- Vocabulary consistency: <pass | flagged: ...>
- Invariants: <pass | flagged: ...>
- Boundaries: <pass | flagged: ...>
- Decisions: <none | recorded as ADR ...>
- Scope match: <within scope | drifted: ...>

## Notes for future sweeps
<Anything that didn't justify a proposal alone but might be a pattern across sessions.>
```

Then delete `lexicon/plans/_active/<session-id>.md` (the soft lock — session is done).

The scratchpad `lexicon/plans/_scratch/<session-id>.md` can be deleted or kept for one cycle in case the user wants to review. Deletion is fine; the retro captures what mattered.

## Write the proposal file (only when warranted)

If escalating, write `lexicon/plans/_proposals/<session-id>-<short-label>.md`:

```markdown
# Proposal: <short label>
Session: <session-id>
Ended: <iso timestamp>
Targets: <lexicon/system.md and/or lexicon/views/<slug>.md — name each file explicitly>
Touches: <sections of the target file(s) likely affected>

## What we observed
<The structural trigger, in plain language. "We introduced a `ScanQueue` concept that isn't in the glossary, used it consistently across three files, and it sits between the Inference and Storage contexts.">

## Why it matters
<Why this is worth updating system.md, not just letting code carry the meaning.>

## Proposed change to system.md
<A concrete diff or insertion. Don't apply it; just propose.>

```diff
- (existing relevant section)
+ (proposed update)
```

## Confidence
<low | medium | high>

## Alternatives considered
<If you considered other framings before settling on this one.>
```

Keep proposals **short**. The human reading a proposal should be able to evaluate it in under two minutes. If it's longer, the proposal is trying to do too much — split it.

## ADRs are lighter

If the only thing that fired was check 5 (decisions), don't write a proposal — append an ADR to `lexicon/decisions/`:

```markdown
# ADR-<NNNN>: <Short title>
Date: <iso>
Status: accepted

## Context
<What problem we faced.>

## Decision
<What we chose.>

## Consequences
<What this enables and what it forecloses.>
```

ADRs don't need user approval before being written — they're append-only history.

## Tell the user

After writing files:

- For silent retros: one line. "Retro logged, no proposals."
- For proposals: name them and where they live. "Wrote one proposal to `lexicon/plans/_proposals/...md` — it's about the new `ScanQueue` concept; review when you have a moment."

Don't dump proposal contents into chat. The proposal file is the artifact; chat is the pointer.

## On calibration

You will sometimes flag noise and miss real changes. Expected. When the user rejects a proposal as noise, encourage them to add a one-line note to `lexicon/calibration.md`. When the user later notices a missed change, encourage the same. This is how the skill gets better over time without retraining.
