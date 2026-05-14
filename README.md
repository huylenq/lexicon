# lexicon

Plain text / documentation is the medium of alignment (not a spec-driven development workflow, this is not it). The main pains lexicon aimed to solve are:

- Cognitive / mental models gaps and drifts between human and agents.
- An ideal surface for attention-level that needs human.

Rationale:

> Code is the executable spec. Above the code, a small **cold-layer doc** captures what code can't express well: vocabulary, invariants, bounded contexts, and the "why"s. Lexicon makes sure the human and the agent stay aligned on that doc — through grounding before work, retros at every stopping point, and crystallization when a feature lands.

Built on Eric Evans' [Domain-Driven Design](https://en.wikipedia.org/wiki/Domain-driven_design): ubiquitous language inside bounded contexts, entities and value objects and services and events as term categories, aggregates with roots, shared kernels for inter-context coordination, the eight context-map relationship kinds as typed seams, subdomains classified core / supporting / generic. Built for the messy reality of working with coding agents on real codebases. When the project has a UI surface, the same discipline extends to design vocabulary — tokens, component names, layout primitives, named layout zones (surfaces & regions), and accessibility contracts live in the same cold doc, with no separate workflow.

## What it does

Lexicon adds six skills to Claude Code:

| Skill | Fires when | Does |
|---|---|---|
| `lex-bootstrap` | Once, at adoption time | Scans existing docs and code, drafts a first-cut `system.yaml`, archives ADR-shaped content (with optional rationale-lift onto affected atoms), sets up `lexicon/` structure, then interviews you to resolve gaps / drift flags / inconsistencies before writing the triage report |
| `lex-ground` | Before substantive coding work | Reads `lexicon/system.yaml`, declares scope (terms, invariants, bounded context) **in conversation**, surfaces vocabulary gaps. No file writes. |
| `lex-retro` | At every natural stopping point | Always logs to `lexicon/retros/`; structural-drift flags land inline in the same log when triggers fire |
| `lex-crystallize` | **You trigger it** ("crystallize", "update lexicon", "feature X is done") | Reads retros since last crystallization, cross-checks against git, proposes a typed mutation set inline in chat, applies it directly on your yes |
| `lex-audit` | Periodically (quarterly, on demand) | Re-validates the cold layer against current code; flags stale glossary, dead invariants, untyped seams, rationale-empty atoms, hygiene rot. Writes a triage report to `lexicon/audits/`; never edits the cold layer directly |
| `lex-migrate` | On schema bumps | Detects the project's cold-layer schema version, computes the chain of per-version deltas to reach the latest, and applies each delta interactively. Current latest: v0.3 (DDD-faithful) |
| `lex-meta` | **You trigger it** (`/lex-meta`) after correcting something a lexicon skill produced | The self-evolve channel for the bundle itself: takes the session conversation as the primary signal, amends the responsible `~/src/lexicon/skills/<skill>/SKILL.md`, leaves the bundle repo uncommitted so accumulated edits stay visible |

Cold-layer edits (`system.yaml`, per-context files) go through `lex-crystallize` — propose, agree, apply. There's no separate proposal file or merge queue: the proposal happens in chat and the edit happens immediately.

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

The first time you do substantive work in a project, `lex-ground` will detect there's no `lexicon/system.yaml` and prompt you to run `lex-bootstrap` — the dedicated, one-shot adoption pass. Run it (either by saying "set up lexicon" or by accepting the prompt), and you'll get:

```
lexicon/
  system.yaml              # drafted from existing docs + code, honest about gaps
  contexts/                # one file per bounded context (when ≥3 atoms)
  surfaces/                # UI surfaces + regions (only if the project has a UI)
  retros/                  # session logs, populated by lex-retro
  audits/                  # audit reports, populated by lex-audit
  plans/_archive/          # archived plan folders
  _pre-migrate-archive/    # only if Phase 6 archived ADR-shaped existing docs
```

After writing the draft, the skill immediately interviews you batch-style to resolve the TODO markers, drift flags, and inconsistencies — no separate "focused distillation session" to schedule later. You can say "pause" at any batch break to stop and resume another time. The final **triage report** at `lexicon/bootstrap.md` reflects what was resolved vs. deferred.

If you don't want to use lexicon on a particular project, decline the bootstrap prompt. The agent won't ask again that session (and `lex-ground` describes a marker-file approach for skipping across sessions too).

## Project shape

```
lexicon/
  system.yaml              # cold layer root: shared kernels, contexts index, overlays, deliberate omissions
  contexts/                # one file per bounded context (terms, invariants, seams, boundary rules, aggregates, modules)
    <slug>.yaml
  surfaces/                # optional: UI surfaces with regions
    <slug>.yaml
  retros/                  # always-written session logs (timestamp-named markdown)
  audits/                  # audit reports
  bootstrap.md             # one-shot adoption report (created by lex-bootstrap)
  migrate.md               # migration report (created by lex-migrate)
  .last-crystallized       # marker: lex-crystallize reads retros newer than this
  plans/
    <feature>/             # in-flight materialized plans
    _archive/              # archived plan folders
  _pre-migrate-archive/    # frozen pre-migration originals (e.g. archived ADRs)
```

## What this is not

- **Not a planning tool.** Lexicon doesn't replace native plan mode. It complements it.
- **Not a code-review tool.** It runs *before* code, not after.
- **Not a documentation generator.** The doc lives in your repo and is maintained by you and the agent together.
- **Not a substitute for clarity.** If you don't know what your invariants are, lexicon can help you discover them, but it can't invent them.

## Status

v0.10.0 — early. Cold-layer schema v0.3 (DDD-faithful) is the current target. The shape is plausible but unproven on real projects. Issues and PRs welcome.

For the design rationale, rejected alternatives, and open questions, see [`CLAUDE.md`](./CLAUDE.md). For version history, see [`CHANGELOG.md`](./CHANGELOG.md).

## License

MIT
