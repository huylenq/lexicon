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
1. `lexicon/system.yaml` — the cold-layer root.
2. Relevant `lexicon/contexts/*.yaml` — whichever the session was working in.
3. `~/src/lexicon/lexicon-prefs.md` — personal overrides (Calibration section especially, for what to flag vs skip). Loaded by `lex-overview` already; re-check if this session might have added entries.
4. The actual code diff for this session (use git: `git diff` against the session's start point if known, otherwise summarize touched files from the conversation history).
5. The conversation history itself — the scope declaration `lex-ground` produced is here, not in any file.

## Run the structural checks

Run the six checks defined in `lex-overview` § Structural checks, applied **forward against this session's diff**: *did this session introduce anything that conflicts with `system.yaml`?*

Each check that fires is a candidate flag in the retro's `## Structural drift` section. Check 5 (Decisions) surfaces as a flag like any other — v0.3 has no append-only ADR slot; the decision argument lives as `rationale:` on the affected atom, which is a cold-layer edit and goes through `lex-crystallize`. The retro names the candidate target atom and the argument; crystallize applies it.

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
- Decisions: <none | flagged: rationale candidate on ...>
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

## Tell the user

After writing the retro:

- If silent (no drift flags): one line. "Retro logged."
- If drift flags: name them briefly. "Retro logged with one drift flag — new `ScanQueue` concept worth crystallizing later."
- If a decision argument was captured: name the rationale candidate. "Retro logged; flagged a rationale candidate on `context/intake/invariant/scan-queue-bound` for the queue-vs-stream choice — apply via crystallize."

Don't dump the retro contents into chat. The file is the artifact; chat is the pointer.

## Capturing feedback into `lexicon-prefs.md`

When the user says **"for lexicon: <X>"** during the session (or any session this skill closes out), append the entry to `~/src/lexicon/lexicon-prefs.md` as part of the retro. Pick the section that fits (Workflow / Style / Calibration / Patterns) and append a dated entry. Don't add a heavyweight schema — short label, the rule, optional one-line context. After appending, mention in the chat summary: "Logged a prefs entry under <section>: <label>."

If a strong feedback signal showed up in the session but the user *didn't* use the explicit phrasing — they just corrected a behavior, or a flag got rejected for a reason that sounds general — ask once at retro time: "Want me to log that as a `for-lexicon` entry?" Single yes/no, no follow-up if they decline. Don't pile this on top of every retro; only when the signal is clear.

You will sometimes flag noise and sometimes miss real changes. Expected. The Calibration section of `lexicon-prefs.md` is where those corrections accumulate. This is how the skill gets better over time without retraining.
