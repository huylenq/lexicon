---
name: lex-retro
description: "Run at every natural stopping point — task complete, tests pass and the user moves on, signals like 'looks good' / 'we're done' / 'thanks'. NOT optional based on perceived significance; run even on small or chatty sessions. Always writes a log entry to lexicon/retros/; structural-drift flags land inline in the log when triggers fire. Skipping is how spec drift goes undetected and the cold doc rots. Read lex-overview first."
---

# Lexicon: retro

This skill closes the loop on a coding session. It runs at every stopping point. The output is a log entry in `lexicon/retros/` — almost always read by no one, until `lex-crystallize` aggregates them later. When structural triggers fire, the flags go **inline in the same log entry** under a `## Structural drift` section; there is no separate proposal file.

The point: **the question gets asked, every time.**

If you haven't loaded `lex-overview` yet this session, read it first.

## Recognize the trigger

Run when:
- The user signals completion: "looks good", "that's it", "thanks", "ok we're done"
- A feature/task that had an active plan is verified working
- Tests pass and the user moves on without further direction
- The user explicitly says "wrap up" or "do the retro"

If unsure whether a stopping point has been reached, lean toward running. The cost of running unnecessarily is a small log file. The cost of skipping is silent drift.

## Gather inputs

Read, in this order:
1. `lexicon/system.md` — the cold model.
2. Relevant `lexicon/views/*.md` — whichever the session was working in.
3. `lexicon/calibration.md` if it exists — project-specific significance overrides.
4. The actual code diff for this session (use git: `git diff` against the session's start point if known, otherwise summarize touched files from the conversation history).
5. The conversation history itself — the scope declaration `lex-ground` produced is here, not in any file.

## Run the structural checks

Run the six checks defined in `lex-overview` § Structural checks, applied **forward against this session's diff**: *did this session introduce anything that conflicts with `system.md`?*

Each check that fires is a candidate flag in the retro's `## Structural drift` section — except check 5 (Decisions), which becomes a candidate for an ADR (append to `lexicon/decisions/`, lighter than a drift flag and doesn't wait for crystallize).

Be conservative on flagging. Borderline cases get a brief note under `## Notes for future sweeps` rather than a full drift flag — across multiple sessions, patterns will emerge that `lex-crystallize` can act on. Don't try to be perfectly precise per-session; the architecture handles eventual consistency.

## Write the retro file

Always write `lexicon/retros/<iso-timestamp>.md` (e.g. `2026-05-04T14-30-00.md`):

```markdown
# Retro: <iso timestamp>
Outcome: <silent | drift-flagged | adr | drift+adr>

## What was declared
<Summarize the scope declaration from grounding, briefly. If lex-ground didn't run, note: "session ran without grounding".>

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

## Structural drift
<Only present if any of checks 1–4 fired with real signal. One block per flag:>

### <Short label>
- **What we observed**: <plain language. "We introduced a `ScanQueue` concept that isn't in the glossary, used it consistently across three files, and it sits between the Inference and Storage contexts.">
- **Why it might matter**: <why this is worth surfacing to crystallize, not just letting code carry the meaning.>
- **Suggested target(s)**: <lexicon/system.md and/or lexicon/views/<slug>.md>
- **Confidence**: <low | medium | high>

## Notes for future sweeps
<Anything that didn't justify a drift flag alone but might be a pattern across sessions. lex-crystallize reads these.>
```

Keep the retro **short**. The drift section, if present, should be readable in under two minutes per flag. Long retros are a signal you're trying to crystallize inside a retro — don't. Crystallization is a separate skill, user-triggered.

## ADRs are lighter

If the only thing that fired was check 5 (decisions), don't write a drift flag — append an ADR to `lexicon/decisions/`:

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

After writing the retro:

- If silent (no drift flags, no ADR): one line. "Retro logged."
- If drift flags: name them briefly. "Retro logged with one drift flag — new `ScanQueue` concept worth crystallizing later."
- If ADR: name it. "Retro logged; recorded ADR-0042 for the queue-vs-stream choice."

Don't dump the retro contents into chat. The file is the artifact; chat is the pointer.

## On calibration

You will sometimes flag noise and sometimes miss real changes. Expected. When the user dismisses a flag as noise, encourage them to add a one-line note to `lexicon/calibration.md`. When the user later notices a missed change, encourage the same. This is how the skill gets better over time without retraining.
