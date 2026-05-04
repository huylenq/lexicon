---
name: retro
description: "Use this skill at every natural stopping point in a coding session — when a task is complete, tests pass and the user is moving on, or the user signals satisfaction ('looks good', 'ok that's done', 'thanks'). This is NOT optional based on perceived significance. Run it even if the session was 'just chatting' or felt small. The skill itself decides whether anything needs to escalate to the human; most sessions produce a silent log entry and nothing more. Skipping this skill is how spec drift goes undetected and the cold doc rots. This is one of three lexicon skills — read lexicon:overview if you haven't already this session."
---

# Lexicon: retro

This skill closes the loop on a coding session. It runs at every stopping point. The output is almost always silent — a log entry in `docs/plans/_retros/` that nobody will read unless something goes wrong later. Occasionally, when structural triggers fire, it produces a proposal for the human.

The point: **the question gets asked, every time.**

If you haven't loaded `lexicon:overview` yet this session, read it first.

## Recognize the trigger

Run when:
- The user signals completion: "looks good", "that's it", "thanks", "ok we're done"
- A feature/task that had an active plan is verified working
- Tests pass and the user moves on without further direction
- The user explicitly says "wrap up" or "do the retro"

If unsure whether a stopping point has been reached, lean toward running. The cost of running unnecessarily is a small log file. The cost of skipping is silent drift.

## Find the session ID

Look for `$LEXICON_SESSION_ID` or read `docs/plans/_scratch/.session-id`. If neither exists, the `ground` skill never ran for this session — note it in the retro ("session ran without grounding; consider whether the work was genuinely trivial"). Mint an ID now if needed.

## Gather inputs

Read, in this order:
1. `docs/plans/_active/<session-id>.md` — what the session declared it would do.
2. `docs/plans/_scratch/<session-id>.md` — notes accumulated during the session.
3. `docs/system.md` — the cold model.
4. `docs/calibration.md` if it exists — project-specific significance overrides.
5. The actual code diff for this session (use git: `git diff` against the session's start point if possible, otherwise summarize touched files).
6. Other files in `docs/plans/_active/` — to be aware of concurrent sessions.

## Run the structural checks

These are the **only** things that escalate to a proposal. Everything else stays silent.

### Check 1: Vocabulary
Did the session introduce a noun or verb (in code: class names, function names, key parameter names; in conversation: domain terms used repeatedly) that isn't in `docs/system.md`'s glossary?

If yes → candidate for proposal.

### Check 2: Vocabulary consistency
Did the session use a term from the glossary in a way that doesn't match its definition?

If yes → candidate for proposal. **High priority** — this is the silent-renaming bug.

### Check 3: Invariants
Did the session's changes violate, refine, or contradict any invariant in `system.md`? Re-read each invariant and ask: would it still hold if I read the new code?

If yes → candidate for proposal.

### Check 4: Boundaries
Did the session cross a boundary in `system.md`'s bounded contexts? (New import edge, new call site, new shared state across a previously clean boundary.)

If yes → candidate for proposal.

### Check 5: Decisions
Were any non-obvious choices made — picking approach A over B for reasons future-readers wouldn't recover from the code alone?

If yes → candidate for an ADR (lighter than a proposal; just append to `docs/decisions/`).

### Check 6: Declared scope match
Did the actual work stay within the scope declared in `_active/<session-id>.md`? If it drifted significantly, flag it — not because drift is bad, but because the *reason* for drift often reveals something about the model that wasn't captured.

## Decide: silent retro or proposal?

**Silent retro (the common case)**: None of checks 1–4 fired, or they fired but the answer was clearly already covered by `system.md`. Write the retro file and stop.

**Proposal**: One or more structural checks fired with real signal. Write *both* the retro file *and* a proposal file.

Be conservative on escalation. Borderline cases default to silent retro with a note about what was borderline — across multiple sessions, patterns will emerge that justify a proposal even if no single session did. Don't try to be perfectly precise per-session; the architecture handles eventual consistency.

## Write the retro file

Always write `docs/plans/_retros/<session-id>.md`:

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

Then delete `docs/plans/_active/<session-id>.md` (the soft lock — session is done).

The scratchpad `docs/plans/_scratch/<session-id>.md` can be deleted or kept for one cycle in case the user wants to review. Deletion is fine; the retro captures what mattered.

## Write the proposal file (only when warranted)

If escalating, write `docs/plans/_proposals/<session-id>-<short-label>.md`:

```markdown
# Proposal: <short label>
Session: <session-id>
Ended: <iso timestamp>
Touches: <sections of system.md likely affected>

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

If the only thing that fired was check 5 (decisions), don't write a proposal — append an ADR to `docs/decisions/`:

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
- For proposals: name them and where they live. "Wrote one proposal to `docs/plans/_proposals/...md` — it's about the new `ScanQueue` concept; review when you have a moment."

Don't dump proposal contents into chat. The proposal file is the artifact; chat is the pointer.

## On calibration

You will sometimes flag noise and miss real changes. Expected. When the user rejects a proposal as noise, encourage them to add a one-line note to `docs/calibration.md`. When the user later notices a missed change, encourage the same. This is how the skill gets better over time without retraining.
