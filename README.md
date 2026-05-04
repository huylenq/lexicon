# lexicon

A document-mediated workflow for coding agents. A Claude Code plugin.

> Code is the executable spec. Above the code, a small **cold-layer doc** captures what code can't express well: vocabulary, invariants, bounded contexts, and the "why"s. Lexicon makes sure the human and the agent stay aligned on that doc — through grounding before work, retros at every stopping point, and crystallization when a feature lands.

Inspired by domain-driven design's [ubiquitous language](https://martinfowler.com/bliki/UbiquitousLanguage.html). Built for the messy reality of working with coding agents on real codebases.

## What it does

Lexicon adds three skills to Claude Code:

| Skill | Fires when | Does |
|---|---|---|
| `lexicon:ground` | Before substantive coding work | Reads `docs/system.md`, declares scope (terms, invariants, bounded context), checks for in-flight work by other agents, opens a scratchpad |
| `lexicon:retro` | At every natural stopping point | Always logs; only escalates a proposal when vocabulary, invariants, or boundaries shifted |
| `lexicon:crystallize` | When a multi-session feature is complete | Reviews cumulative changes and proposes a coherent diff to `system.md` |

The skills coordinate through a `docs/` folder structure that the plugin manages. Concurrent agents are made safe by sharding everything per-session and treating `system.md` as a write-protected merge point.

## Why

Working with a coding agent over a long session, the same problems keep showing up:

- The agent silently renames concepts. "Case" becomes "Record" becomes "Entry" across three turns, and you don't notice until something breaks.
- Architectural rules drift. The agent fixes a bug in module A by reaching into module B, violating a boundary that was never written down.
- Long chats become unscannable. By turn 40, neither of you can find the decision that was made on turn 12.
- Multiple parallel agents step on each other's work because nothing tells them what's in flight.

Lexicon's bet: a small, living document captures the *invariant* parts of the system (vocabulary, bounded contexts, "why"s) — and a workflow makes sure both human and agent ground in that document before work, and update it deliberately when learning happens.

## Install

```bash
# Install from this GitHub repo
/plugin install github:huylenq/lexicon
```

Or for local development:

```bash
git clone https://github.com/huylenq/lexicon
claude --plugin-dir ./lexicon
```

## First use in a project

The first time you do substantive work in a project, `lexicon:ground` will offer to bootstrap the `docs/` structure:

```
docs/
  system.md                # the cold layer
  decisions/               # ADRs
  plans/                   # _active, _scratch, _proposals, _retros, _archive
```

Accept it. The agent will draft a first cut of `system.md` from the codebase, but **the invariants and "why"s are in your head, not the code** — plan for a focused session writing it together.

If you don't want to use lexicon on a particular project, decline the bootstrap. The agent won't ask again.

## Project shape

```
docs/
  system.md                # cold layer: glossary, invariants, bounded contexts, "why"s
  decisions/               # ADRs, append-only
  calibration.md           # project-specific notes on what counts as "significant"
  plans/
    _active/               # soft locks declaring what each session is touching
    _scratch/              # per-session ephemeral notes
    _proposals/            # session-end diffs awaiting your merge
    _retros/               # always-written session logs
    _archive/              # landed plans and accepted crystallizations
    <feature>/             # in-flight materialized plans
```

## Concurrent sessions

Run multiple Claude Code sessions on the same repo? Lexicon shards everything by session ID:

- Each session writes its own `_active/<id>.md`, `_scratch/<id>.md`, `_retros/<id>.md`.
- `lexicon:ground` checks sibling `_active/` files at session start and announces overlaps.
- Proposals never write to `system.md` directly — they queue under `_proposals/` for human review.

This doesn't *prevent* conflict (that's still a git problem), but it surfaces it at the cheapest moment.

## What this is not

- **Not a planning tool.** Lexicon doesn't replace native plan mode. It complements it.
- **Not a code-review tool.** It runs *before* code, not after.
- **Not a documentation generator.** The doc lives in your repo and is maintained by you and the agent together.
- **Not a substitute for clarity.** If you don't know what your invariants are, lexicon can help you discover them, but it can't invent them.

## Status

v0.1.0 — early. The shape is plausible but unproven on real projects. Issues and PRs welcome.

For the design rationale, rejected alternatives, and open questions, see [`CLAUDE.md`](./CLAUDE.md). For version history, see [`CHANGELOG.md`](./CHANGELOG.md).

## License

MIT
