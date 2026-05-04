---
name: ground
description: "Use this skill at the start of any substantive coding work in a project that has (or should have) a docs/system.md file. Run it before writing or modifying code, before drafting plans, whenever a task involves the project's domain concepts. Trigger this even for tasks that feel small, unless they're purely mechanical (typo fixes, dependency bumps, log message tweaks). Skipping this skill is the most common failure mode that causes silent vocabulary drift and architectural inconsistency. This is one of three lexicon skills — read lexicon:overview if you haven't already this session."
---

# Lexicon: ground

This skill makes sure work is grounded in the project's shared model *before* code is written. It is the entry point into the lexicon workflow.

If you haven't loaded `lexicon:overview` yet this session, read it first. It defines the project shape, the rules, and how `ground`/`retro`/`crystallize` fit together.

## Bootstrap (first time in a project)

If `docs/system.md` doesn't exist, **stop and offer to bootstrap** before doing the user's task:

> "This project doesn't have lexicon docs yet. I can set up the structure (`docs/system.md`, `docs/decisions/`, `docs/plans/...`) and draft a first cut of `system.md` from the codebase. The drafted `system.md` will need real review from you — invariants and 'why's are in your head, not the code. Want to proceed?"

If yes:

1. Create the directory structure:
   ```
   docs/
     decisions/
     plans/_active/
     plans/_scratch/
     plans/_proposals/
     plans/_retros/
     plans/_archive/
   ```
2. Copy `${CLAUDE_PLUGIN_ROOT}/templates/system.md.template` to `docs/system.md` and fill it in from a quick scan of the codebase (key types, modules, top-level concepts). Mark sections that need user input with `<!-- TODO: confirm with user -->`.
3. Tell the user which sections need their input, and ask whether to continue with the original task now or focus on `system.md` first.

If no, work normally for this session. Don't ask again.

## Mint a session ID

If `$LEXICON_SESSION_ID` isn't set, mint one: a short timestamped string like `2026-05-04-1430-ab12`. Write it to `docs/plans/_scratch/.session-id` so subsequent skill invocations find it. Reuse the same ID for the rest of this session.

## The grounding ritual

Run before any substantive code change:

### 1. Read `docs/system.md` end to end

Don't skim. The whole point of this layer is to be small enough to read every session. If it's grown past ~500 lines, surface that to the user.

### 2. Read `docs/calibration.md` if it exists

Project-specific notes about what counts as significant. Overrides the default sense of when to escalate proposals.

### 3. Check for in-flight work

Read every file in `docs/plans/_active/`. Each one declares another session's scope. If any of them touch:
- The same files you're about to touch, or
- The same bounded context you're about to work in, or
- An invariant you're about to depend on,

**stop and surface the overlap to the user before proceeding.** Don't try to merge or coordinate automatically — just announce it.

### 4. Declare your own scope

Write a file at `docs/plans/_active/<session-id>.md`:

```markdown
# Active session: <session-id>
Started: <iso timestamp>

## Task
<One-paragraph description of what you're about to do, in the user's words.>

## Bounded context
<Which context from system.md this work lives in. If unclear, name that explicitly.>

## Vocabulary in play
- <Term from glossary>: <how it applies here>
- <Term from glossary>: <how it applies here>

## Invariants you're depending on
- <Invariant from system.md, restated in your own words>

## Files likely to change
- <path> — <why>
- <path> — <why>

## Out of scope
<What this task is explicitly NOT doing, especially adjacent things that could tempt scope creep.>
```

Be honest. If you don't know which bounded context the work lives in, say so — that's a real signal.

### 5. Check vocabulary completeness

For each significant noun or verb in the task description that *isn't* in `docs/system.md`'s glossary, flag it:

> Heads up — the task uses the term "X" which isn't in the glossary. Want to:
> (a) add it to the glossary now,
> (b) propose a synonym for an existing term, or
> (c) note it for the session-end retro to consider?

Default to (c) for low-stakes work, (a) for anything touching a bounded-context boundary or invariant.

### 6. Open a scratchpad

Create `docs/plans/_scratch/<session-id>.md`:

```markdown
# Scratch: <session-id>

## Concepts encountered
<New terms or refinements of existing terms that come up during the session.>

## Assumptions made
<Decisions taken without explicit user confirmation; flag for retro review.>

## Boundary touches
<Times the work touched or crossed a boundary defined in system.md.>

## Surprises
<Things that contradicted system.md or required re-reading code to understand.>
```

Write into this throughout the session. The `retro` skill reads it at the end.

## When to skip the full ritual

Genuinely mechanical work doesn't need full grounding:
- Typo fixes in comments or docs
- Dependency version bumps with no API change
- Log message wording tweaks
- Renaming a local variable for clarity within a single function

For these, run a minimal version: still mint a session ID, still write a one-line `_active/` file ("trivial: <description>"), still open a scratchpad. Skip steps 1, 5, and the full scope declaration. The `retro` skill needs the session ID to exist.

If you're tempted to call something "trivial" but it touches a file mentioned in `system.md`, it's not trivial. Run the full grounding.

## What this skill is not

- It is not a planning skill. It declares *where in the model* the work lives, not *what* to do.
- It is not a code-review skill. It runs before code, not after.
- It is not a substitute for asking clarifying questions. If intent is genuinely ambiguous, ask.

## On honesty about uncertainty

The most useful output of this skill is often a flag: "I read `system.md` but I'm not sure which bounded context this task lives in." That's not a failure — that's grounding *working*. It surfaces ambiguity at the cheapest possible time. Resist the temptation to pick a context confidently when you're guessing.
