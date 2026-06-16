# Subcommand: ground

Run at the start of substantive work. Reads the cold layer, declares scope in conversation, surfaces vocabulary gaps. **No file writes** — the agent's context window holds the grounding for the rest of the session; that's the artifact.

## Pre-flight

If `lexicon/system.xml` doesn't exist, **stop and surface**:

> This project doesn't have lexicon docs yet. Setup is a one-shot pass — it scans existing docs and code, drafts a first-cut `system.xml`, absorbs ADR-shaped content into rationale fields, and produces a triage list. That's a different subcommand (`bootstrap`). Want to:
> (a) run `bootstrap` now and come back to the original task after,
> (b) skip lexicon for this session and not be asked again, or
> (c) work without lexicon just for now (still ask next session)?

Don't try to bootstrap inline here — the doc-audit and code-audit phases are too heavyweight for a per-task grounding step. Defer to `bootstrap`.

If the user picks (b), drop a `.lexicon-skip` marker file at the repo root so future sessions don't re-prompt. If (c), proceed with the task ungrounded; this is a graceful fallback, not the intended flow.

If `lexicon/system.xml` is on a pre-v1.0 schema, or `lexicon/system.yaml`/`lexicon/system.md` exists (older formats), defer to `validate` first.

## The grounding ritual

### 1. Read `lexicon/system.xml` end to end

Don't skim. The whole point of this layer is to be small enough to read every session. If it's grown past ~500 lines, surface that — the project may want to partition into `lexicon/contexts/<slug>.xml` files.

### 2. Read the relevant context file(s)

If `lexicon/contexts/` exists, also read the file(s) matching the bounded context of the work being done. The `contexts:` index in `system.xml` lists the available slugs. **Don't load every context file eagerly** — that defeats the partitioning. Identify the relevant context(s) (from the task description, the files about to change, or by asking the user) and load only those. When in doubt about context, ask before guessing.

If `lexicon/surfaces/` exists and the work touches UI, load the relevant surface file(s).

### 3. Declare scope in conversation

State, in chat, what you're about to do — using vocabulary from `system.xml` and the loaded context files. Cover:

- **Task** — one paragraph, in the user's words.
- **Bounded context** — which context from `system.xml` this work lives in. If a per-context file exists for it (`lexicon/contexts/<slug>.xml`), name it. If unclear, say so explicitly.
- **Vocabulary in play** — the glossary terms (from `system.xml` or the owning context file) you expect to use, and how they apply here. If shared kernels are in play, name them.
- **Invariants you're depending on** — restate the relevant invariants in your own words, so misreadings surface now rather than after the diff.
- **Files likely to change** — short list with one-line "why" each.
- **Out of scope** — what this task is explicitly NOT doing, especially adjacent things that could tempt scope creep.

Be honest. If you don't know which bounded context the work lives in, say so — that's a real signal, not a failure.

This declaration is for the conversation only. **Don't write it to a file.** It anchors the rest of the session; when `crystallize` later absorbs the work, it reads this exchange (alongside the git diff) to tell what was declared vs what shipped.

### 4. Check vocabulary completeness

For each significant noun or verb in the task description that *isn't* in the loaded glossary, flag it:

> Heads up — the task uses the term "X" which isn't in the glossary. Want to:
> (a) note it for a later `crystallize` to consider,
> (b) add it to the glossary now (via `crystallize` after the work lands), or
> (c) propose it's a synonym for an existing term?

Default to (a) for low-stakes work, (b) for anything touching a bounded-context boundary or invariant.

## When to skip the full ritual

Genuinely mechanical work doesn't need full grounding:

- Typo fixes in comments or docs
- Dependency version bumps with no API change
- Log message wording tweaks
- Renaming a local variable for clarity within a single function

For these, briefly acknowledge ("trivial: <description>") and proceed. No grounding declaration is needed.

If you're tempted to call something "trivial" but it touches a file mentioned in `system.xml` or a context file's `codeModules:`, it's not trivial. Run the full grounding.

## What this subcommand is not

- It is not a planning subcommand. It declares *where in the model* the work lives, not *what* to do.
- It is not a code-review subcommand. It runs before code, not after.
- It is not a substitute for asking clarifying questions. If intent is genuinely ambiguous, ask.
- It is not a coordination mechanism. If multiple sessions are running on the same repo, this subcommand doesn't try to detect or prevent overlap — that's a git problem.

## On honesty about uncertainty

The most useful output of this subcommand is often a flag: *"I read `system.xml` but I'm not sure which bounded context this task lives in."* That's not a failure — that's grounding working. It surfaces ambiguity at the cheapest possible time. Resist the temptation to pick a context confidently when you're guessing.
