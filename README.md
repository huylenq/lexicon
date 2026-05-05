# lexicon

Plain text / documentation is the medium of alignment (not a spec-driven development workflow, this is not it). The main pains lexicon aimed to solve are:

- Cognitive / mental models gaps and drifts between human and agents.
- An ideal surface for attention-level that needs human.

Rationale:

> Code is the executable spec. Above the code, a small **cold-layer doc** captures what code can't express well: vocabulary, invariants, bounded contexts, and the "why"s. Lexicon makes sure the human and the agent stay aligned on that doc — through grounding before work, retros at every stopping point, and crystallization when a feature lands.

Inspired by domain-driven design's [ubiquitous language](https://martinfowler.com/bliki/UbiquitousLanguage.html). Built for the messy reality of working with coding agents on real codebases. When the project has a UI surface, the same discipline extends to design vocabulary — tokens, component names, layout primitives, and accessibility contracts live in the same cold doc, with no separate workflow.

## What it does

Lexicon adds five skills to Claude Code:

| Skill | Fires when | Does |
|---|---|---|
| `lex-bootstrap` | Once, at adoption time | Scans existing docs and code, drafts a first-cut `system.md`, migrates ADR-shaped content, sets up `lexicon/` structure, produces a triage report |
| `lex-ground` | Before substantive coding work | Reads `lexicon/system.md`, declares scope (terms, invariants, bounded context) **in conversation**, surfaces vocabulary gaps. No file writes. |
| `lex-retro` | At every natural stopping point | Always logs to `lexicon/retros/`; structural-drift flags land inline in the same log when triggers fire |
| `lex-crystallize` | **You trigger it** ("crystallize", "update lexicon", "feature X is done") | Reads retros since last crystallization, cross-checks against git, proposes a coherent diff to `system.md` inline in chat, applies it directly on your yes |
| `lex-audit` | Periodically (quarterly, on demand) | Re-validates `system.md` against current code; flags stale glossary, dead invariants, undeclared contexts, hygiene rot. Writes a triage report to `lexicon/audits/`; never edits `system.md` directly |

Cold-layer edits (`system.md`, views) go through `lex-crystallize` — propose, agree, apply. There's no separate proposal file or merge queue: the proposal happens in chat and the edit happens immediately.

## Why

Working with a coding agent over a long session, the same problems keep showing up:

- The agent silently renames concepts. "Case" becomes "Record" becomes "Entry" across three turns, and you don't notice until something breaks.
- Architectural rules drift. The agent fixes a bug in module A by reaching into module B, violating a boundary that was never written down.
- Long chats become unscannable. By turn 40, neither of you can find the decision that was made on turn 12.
- Multiple parallel agents step on each other's work because nothing tells them what's in flight.

Lexicon's bet: a small, living document captures the *invariant* parts of the system (vocabulary, bounded contexts, "why"s) — and a workflow makes sure both human and agent ground in that document before work, and update it deliberately when learning happens.

## Install

```bash
# As a Claude Code plugin (from this GitHub repo)
/plugin install github:huylenq/lexicon
```

Or as flat skills via [`npx skills`](https://github.com/vercel-labs/skills):

```bash
npx skills add huylenq/lexicon                    # all four skills
npx skills add huylenq/lexicon --skill lex-ground # one skill
```

Or for local development:

```bash
git clone https://github.com/huylenq/lexicon
claude --plugin-dir ./lexicon
```

The skills are flat-named (`lex-overview`, `lex-bootstrap`, `lex-ground`, `lex-retro`, `lex-crystallize`, `lex-audit`) so the same names work in both modes — Claude Code's plugin namespace prefix isn't applied when installed via `npx skills`.

## First use in a project

The first time you do substantive work in a project, `lex-ground` will detect there's no `lexicon/system.md` and prompt you to run `lex-bootstrap` — the dedicated, one-shot adoption pass. Run it (either by saying "set up lexicon" or by accepting the prompt), and you'll get:

```
lexicon/
  system.md                # drafted from existing docs + code, with TODO markers
  decisions/               # ADRs (migrated from any ADR-shaped existing docs)
  retros/                  # session logs, populated by lex-retro
  audits/                  # audit reports, populated by lex-audit
  plans/_archive/          # archived plan folders
```

Plus a **triage report** at `lexicon/bootstrap.md` listing drift flags, vocabulary inconsistencies, and recommended file moves for the human to review.

The drafted `system.md` is intentionally a first cut — invariants and "why"s are in your head, not the code, so plan for a focused distillation session afterward where you walk through the TODO markers with the agent.

If you don't want to use lexicon on a particular project, decline the bootstrap prompt. The agent won't ask again that session (and `lex-ground` describes a marker-file approach for skipping across sessions too).

## Project shape

```
lexicon/
  system.md                # cold layer: glossary, invariants, bounded contexts, "why"s
  views/                   # optional: per-context cold-layer slices
  decisions/               # ADRs, append-only
  retros/                  # always-written session logs (timestamp-named)
  audits/                  # audit reports
  bootstrap.md             # one-shot adoption report (created by lex-bootstrap)
  .last-crystallized       # marker: lex-crystallize reads retros newer than this
  plans/
    <feature>/             # in-flight materialized plans
    _archive/              # archived plan folders
```

## What this is not

- **Not a planning tool.** Lexicon doesn't replace native plan mode. It complements it.
- **Not a code-review tool.** It runs *before* code, not after.
- **Not a documentation generator.** The doc lives in your repo and is maintained by you and the agent together.
- **Not a substitute for clarity.** If you don't know what your invariants are, lexicon can help you discover them, but it can't invent them.

## Status

v0.6.0 — early. The shape is plausible but unproven on real projects. Issues and PRs welcome.

For the design rationale, rejected alternatives, and open questions, see [`CLAUDE.md`](./CLAUDE.md). For version history, see [`CHANGELOG.md`](./CHANGELOG.md).

## License

MIT
