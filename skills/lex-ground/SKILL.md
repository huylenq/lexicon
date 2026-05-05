---
name: lex-ground
description: "Run at the start of any substantive coding work in a project that has (or should have) lexicon/system.md. Invoke before writing or modifying code, before drafting plans, on any task that touches the project's domain concepts — even small ones, unless they're purely mechanical (typo fixes, dependency bumps, log tweaks). Skipping is the most common cause of silent vocabulary drift and architectural inconsistency. Read lex-overview first."
---

# Lexicon: ground

This skill makes sure work is grounded in the project's shared model *before* code is written. It is the entry point into the lexicon workflow.

If you haven't loaded `lex-overview` yet this session, read it first. It defines the project shape, the rules, and how `lex-ground` / `lex-retro` / `lex-crystallize` fit together.

`lex-ground` is purely **behavioral** — it reads files and produces a scope declaration in conversation. It does not write anything to disk. The agent's context window holds the grounding for the rest of the session; that's enough.

## No `lexicon/system.md`? Defer to `lex-bootstrap`

If `lexicon/system.md` doesn't exist, **stop and surface to the user**:

> "This project doesn't have lexicon docs yet. Bootstrapping is a one-shot setup — it scans existing docs and code, drafts a first-cut `system.md`, migrates ADR-shaped content, and produces a triage list. That's a different skill (`lex-bootstrap`) because it warrants a focused pass rather than getting squeezed into the start of an unrelated task. Want to:
> (a) run `lex-bootstrap` now and come back to the original task after,
> (b) skip lexicon for this session and not be asked again, or
> (c) work without lexicon just for now (still ask next session)?"

Don't try to bootstrap inline from this skill. The doc-audit and code-audit phases are too heavyweight to fold into a per-task grounding step, and shortcutting them produces a `system.md` that misses everything sitting in existing `docs/` content. Defer to `lex-bootstrap`.

If the user picks (b), record the decision in a way the agent will remember (a `.lexicon-skip` marker file at the repo root works) so future sessions don't re-prompt. If (c), proceed with the user's task without grounding in `system.md`; this is a graceful fallback, not the intended flow.

## The grounding ritual

Run before any substantive code change:

### 1. Read `lexicon/system.md` end to end (and relevant Domain Views)

Don't skim. The whole point of this layer is to be small enough to read every session. If it's grown past ~500 lines, surface that to the user — or check whether the project should be using Domain Views (`lexicon/views/*.md`) for partitioning.

If `lexicon/views/` exists, also read the view(s) matching the bounded context of the work being done. The bounded-contexts index in `system.md` points at the relevant view files. **Don't load every view eagerly** — that defeats the partitioning. Identify the relevant context(s) (from the task description, the files about to change, or by asking the user) and load only those views. When in doubt about context, ask before guessing.

### 2. Read `~/src/lexicon/lexicon-prefs.md` if it exists

The user's personal overrides for lexicon skill behavior — workflow, style, significance calibration, patterns about how they work. Loaded at session start by `lex-overview`; mentioned here as a reminder that grounding should respect prefs entries. Project-specific overrides (the old `lexicon/calibration.md` role) live in the project's `CLAUDE.md` and are loaded by Claude Code automatically.

### 3. Declare scope (in conversation)

State, in chat, what you're about to do — using vocabulary from `system.md`. Cover:

- **Task** — one paragraph, in the user's words.
- **Bounded context** — which context from `system.md` this work lives in. If a Domain View exists for it, name the view file. If unclear, say so explicitly.
- **Vocabulary in play** — the glossary terms (from `system.md` or the owning view) you expect to use, and how they apply here.
- **Invariants you're depending on** — restate the relevant invariants in your own words, so misreadings surface now rather than after the diff.
- **Files likely to change** — short list with one-line "why" each.
- **Out of scope** — what this task is explicitly NOT doing, especially adjacent things that could tempt scope creep.

Be honest. If you don't know which bounded context the work lives in, say so — that's a real signal, not a failure.

This declaration is for the conversation only. Don't write it to a file. The session retro (`lex-retro`) will summarize what was actually declared vs what shipped, using this exchange as input.

### 4. Check vocabulary completeness

For each significant noun or verb in the task description that *isn't* in `lexicon/system.md`'s glossary (or the relevant view's), flag it:

> Heads up — the task uses the term "X" which isn't in the glossary. Want to:
> (a) note it for the session-end retro to consider,
> (b) add it to the glossary now (via `lex-crystallize` after the work lands), or
> (c) propose it's a synonym for an existing term?

Default to (a) for low-stakes work, (b) for anything touching a bounded-context boundary or invariant.

## When to skip the full ritual

Genuinely mechanical work doesn't need full grounding:
- Typo fixes in comments or docs
- Dependency version bumps with no API change
- Log message wording tweaks
- Renaming a local variable for clarity within a single function

For these, briefly acknowledge ("trivial: <description>") and proceed. `lex-retro` may still run at the end and produce a one-line log; that's fine.

If you're tempted to call something "trivial" but it touches a file mentioned in `system.md`, it's not trivial. Run the full grounding.

## What this skill is not

- It is not a planning skill. It declares *where in the model* the work lives, not *what* to do.
- It is not a code-review skill. It runs before code, not after.
- It is not a substitute for asking clarifying questions. If intent is genuinely ambiguous, ask.
- It is not a coordination mechanism. If multiple sessions are running on the same repo, this skill doesn't try to detect or prevent overlap — that's a git problem.

## On honesty about uncertainty

The most useful output of this skill is often a flag: "I read `system.md` but I'm not sure which bounded context this task lives in." That's not a failure — that's grounding *working*. It surfaces ambiguity at the cheapest possible time. Resist the temptation to pick a context confidently when you're guessing.
