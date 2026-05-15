# Subcommand: retro

Closes the loop on a coding session. Runs at every stopping point. The output is a log entry in `lexicon/retros/` — almost always read by no one, until `crystallize` aggregates them later. When structural triggers fire, the flags go **inline in the same log entry** under a `## Structural drift` section; there is no separate proposal file.

The point: **the question gets asked, every time.**

## Recognize the trigger

Run when:

- The user signals completion: "looks good", "that's it", "thanks", "ok we're done", "ship it".
- A feature/task that had an active plan is verified working.
- Tests pass and the user moves on without further direction.
- The user explicitly says "wrap up" or "do the retro".

If unsure whether a stopping point has been reached, lean toward running. The cost of running unnecessarily is a small log file. The cost of skipping is silent drift.

## Gather inputs

Read, in this order:

1. `lexicon/system.xml` — the cold-layer root.
2. The relevant `lexicon/contexts/*.xml` and `lexicon/surfaces/*.xml` — whichever the session was working in.
3. The actual code diff for this session (`git diff` against the session's start point if known, otherwise summarize touched files from the conversation history).
4. The conversation history itself — the scope declaration `ground` produced lives here, not in any file. If `ground` didn't run, note that.

## Run the structural checks

Run the six checks defined in `${CLAUDE_SKILL_DIR}/reference/checks.md`, applied **forward against this session's diff**: *did this session introduce anything that conflicts with the cold layer?*

Each check that fires is a candidate flag in the retro's `## Structural drift` section. Check 5 (Decisions) surfaces as a flag like any other — v0.3 has no append-only ADR slot; the decision argument lives as `rationale:` on the affected atom, which is a cold-layer edit and goes through `crystallize`. The retro names the candidate target atom and the argument; crystallize applies it.

Be conservative on flagging. Borderline cases get a brief note under `## Notes for future sweeps` rather than a full drift flag — across multiple sessions, patterns will emerge that `crystallize` can act on. Don't try to be perfectly precise per-session; the architecture handles eventual consistency.

## Write the retro file

Always write `lexicon/retros/<iso-timestamp>.md` (e.g. `2026-05-15T14-30-00.md`):

```markdown
# Retro: <iso timestamp>
Outcome: <silent | drift-flagged | rationale-candidate | drift+rationale>

## What was declared
<Summarize the scope declaration from grounding, briefly. If ground didn't run, note: "session ran without grounding".>

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
- **Suggested target(s)**: <lexicon/system.xml and/or lexicon/contexts/<slug>.xml>
- **Confidence**: <low | medium | high>

## Notes for future sweeps
<Anything that didn't justify a drift flag alone but might be a pattern across sessions. crystallize reads these.>
```

Keep the retro **short**. The drift section, if present, should be readable in under two minutes per flag. Long retros are a signal you're trying to crystallize inside a retro — don't. Crystallization is a separate subcommand, user-triggered.

## Tell the user

After writing the retro:

- If silent (no drift flags): one line. "Retro logged."
- If drift flags: name them briefly. "Retro logged with one drift flag — new `ScanQueue` concept worth crystallizing later."
- If a rationale candidate was captured: name it. "Retro logged; flagged a rationale candidate on `context/inference/invariant/scan-queue-bound` for the queue-vs-stream choice — apply via crystallize."

Don't dump the retro contents into chat. The file is the artifact; chat is the pointer.

## On miscalibration

You will sometimes flag noise and sometimes miss real changes. Expected. When the user corrects a retro's flagging — "stop flagging X" / "you should have flagged Y" — and the correction is the kind that should generalize across projects, that's a `/lexicon:evolve` moment, not a silent acceptance.
