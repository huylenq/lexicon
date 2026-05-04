---
name: lex-ground
description: "Run at the start of any substantive coding work in a project that has (or should have) lexicon/system.md. Invoke before writing or modifying code, before drafting plans, on any task that touches the project's domain concepts — even small ones, unless they're purely mechanical (typo fixes, dependency bumps, log tweaks). Skipping is the most common cause of silent vocabulary drift and architectural inconsistency. Read lex-overview first."
---

# Lexicon: ground

This skill makes sure work is grounded in the project's shared model *before* code is written. It is the entry point into the lexicon workflow.

If you haven't loaded `lex-overview` yet this session, read it first. It defines the project shape, the rules, and how `lex-ground` / `lex-retro` / `lex-crystallize` fit together.

## No `lexicon/system.md`? Defer to `lex-bootstrap`

If `lexicon/system.md` doesn't exist, **stop and surface to the user**:

> "This project doesn't have lexicon docs yet. Bootstrapping is a one-shot setup — it scans existing docs and code, drafts a first-cut `system.md`, migrates ADR-shaped content, and produces a triage list. That's a different skill (`lex-bootstrap`) because it warrants a focused pass rather than getting squeezed into the start of an unrelated task. Want to:
> (a) run `lex-bootstrap` now and come back to the original task after,
> (b) skip lexicon for this session and not be asked again, or
> (c) work without lexicon just for now (still ask next session)?"

Don't try to bootstrap inline from this skill. The doc-audit and code-audit phases are too heavyweight to fold into a per-task grounding step, and shortcutting them produces a `system.md` that misses everything sitting in existing `docs/` content. Defer to `lex-bootstrap`.

If the user picks (b), record the decision in a way the agent will remember (a `.lexicon-skip` marker file at the repo root works) so future sessions don't re-prompt. If (c), proceed with the user's task without grounding in `system.md`; this is a graceful fallback, not the intended flow.

## Mint a session ID

If `$LEXICON_SESSION_ID` isn't set, mint one: a short timestamped string like `2026-05-04-1430-ab12`. Write it to `lexicon/plans/_scratch/.session-id` so subsequent skill invocations find it. Reuse the same ID for the rest of this session.

## The grounding ritual

Run before any substantive code change:

### 1. Read `lexicon/system.md` end to end (and relevant Domain Views)

Don't skim. The whole point of this layer is to be small enough to read every session. If it's grown past ~500 lines, surface that to the user — or check whether the project should be using Domain Views (`lexicon/views/*.md`) for partitioning.

If `lexicon/views/` exists, also read the view(s) matching the bounded context of the work being done. The bounded-contexts index in `system.md` points at the relevant view files. **Don't load every view eagerly** — that defeats the partitioning. Identify the relevant context(s) (from the task description, the files about to change, or by asking the user) and load only those views. When in doubt about context, ask before guessing.

### 2. Read `lexicon/calibration.md` if it exists

Project-specific notes about what counts as significant. Overrides the default sense of when to escalate proposals.

### 3. Check for in-flight work

Read every file in `lexicon/plans/_active/`. Each one declares another session's scope. If any of them touch:
- The same files you're about to touch, or
- The same bounded context you're about to work in, or
- An invariant you're about to depend on,

**stop and surface the overlap to the user before proceeding.** Don't try to merge or coordinate automatically — just announce it.

### 4. Declare your own scope

Write a file at `lexicon/plans/_active/<session-id>.md`:

```markdown
# Active session: <session-id>
Started: <iso timestamp>

## Task
<One-paragraph description of what you're about to do, in the user's words.>

## Bounded context
<Which context from system.md this work lives in. If a Domain View exists for it (`lexicon/views/<slug>.md`), name the view file. If unclear, say so explicitly — that's a real signal.>

## Vocabulary in play
- <Term from glossary (system.md or owning view)>: <how it applies here>
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

For each significant noun or verb in the task description that *isn't* in `lexicon/system.md`'s glossary, flag it:

> Heads up — the task uses the term "X" which isn't in the glossary. Want to:
> (a) add it to the glossary now,
> (b) propose a synonym for an existing term, or
> (c) note it for the session-end retro to consider?

Default to (c) for low-stakes work, (a) for anything touching a bounded-context boundary or invariant.

### 6. Open a scratchpad

Create `lexicon/plans/_scratch/<session-id>.md`:

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

Write into this throughout the session. The `lex-retro` skill reads it at the end.

## When to skip the full ritual

Genuinely mechanical work doesn't need full grounding:
- Typo fixes in comments or docs
- Dependency version bumps with no API change
- Log message wording tweaks
- Renaming a local variable for clarity within a single function

For these, run a minimal version: still mint a session ID, still write a one-line `_active/` file ("trivial: <description>"), still open a scratchpad. Skip steps 1, 5, and the full scope declaration. The `lex-retro` skill needs the session ID to exist.

If you're tempted to call something "trivial" but it touches a file mentioned in `system.md`, it's not trivial. Run the full grounding.

## What this skill is not

- It is not a planning skill. It declares *where in the model* the work lives, not *what* to do.
- It is not a code-review skill. It runs before code, not after.
- It is not a substitute for asking clarifying questions. If intent is genuinely ambiguous, ask.

## On honesty about uncertainty

The most useful output of this skill is often a flag: "I read `system.md` but I'm not sure which bounded context this task lives in." That's not a failure — that's grounding *working*. It surfaces ambiguity at the cheapest possible time. Resist the temptation to pick a context confidently when you're guessing.
