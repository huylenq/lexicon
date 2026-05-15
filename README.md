# lexicon

Plain text / documentation is the medium of alignment (not a spec-driven development workflow, this is not it). The main pains lexicon aimed to solve are:

- Cognitive / mental models gaps and drifts between human and agents.
- An ideal surface for attention-level that needs human.

Rationale:

> Code is the executable spec. Above the code, a small **cold-layer doc** captures what code can't express well: vocabulary, invariants, bounded contexts, and the "why"s. Lexicon makes sure the human and the agent stay aligned on that doc — through grounding before work, retros at every stopping point, and crystallization when a feature lands.

Built on Eric Evans' [Domain-Driven Design](https://en.wikipedia.org/wiki/Domain-driven_design): ubiquitous language inside bounded contexts, entities and value objects and services and events as term categories, aggregates with roots, shared kernels for inter-context coordination, the eight context-map relationship kinds as typed seams, subdomains classified core / supporting / generic. Built for the messy reality of working with coding agents on real codebases. When the project has a UI surface, the same discipline extends to design vocabulary — tokens, component names, layout primitives, named layout zones (surfaces & regions), and accessibility contracts live in the same cold doc, with no separate workflow.

## What it does

Lexicon ships as **one Claude Code skill** (`lexicon`) with **six subcommands**, each exposed as a slash command for tab-completion ergonomics. The substance lives in `skills/lexicon/`; reference files (schema, structural checks, rules) are centralized in `skills/lexicon/reference/` and read by whichever subcommand needs them.

| Subcommand | Fires when | Does |
|---|---|---|
| `/lexicon:adopt` | Once, at adoption time | Scans existing docs and code, drafts a first-cut `system.yaml`, archives ADR-shaped content (with optional rationale-lift onto affected atoms), sets up `lexicon/` structure, then interviews you to resolve gaps / drift flags / inconsistencies — one decision per conversational turn |
| `/lexicon:ground` | Before substantive coding work | Reads `lexicon/system.yaml` and the relevant context files, declares scope (terms, invariants, bounded context) **in conversation**, surfaces vocabulary gaps. No file writes. |
| `/lexicon:retro` | At every natural stopping point | Always logs to `lexicon/retros/`; structural-drift flags land inline in the same log when triggers fire |
| `/lexicon:crystallize` | **You trigger it** ("crystallize", "update lexicon", "feature X is done") | Reads retros since last crystallization, cross-checks against git, proposes a typed mutation set inline in chat, applies it directly on your yes |
| `/lexicon:conform` | Periodically (quarterly, on demand) or when schema bumps | Two-pass conformance check: structural pass detects schema-version drift and offers to apply the migration delta chain; semantic pass re-validates the cold layer against current code (stale glossary, dead invariants, untyped seams, hygiene rot). Writes a triage report to `lexicon/conform.md` |
| `/lexicon:evolve` | **You trigger it** (`/lexicon:evolve`) after correcting something a lexicon subcommand produced | The self-evolve channel for the bundle itself: takes the session conversation as the primary signal, amends the responsible `~/src/lexicon/skills/lexicon/<path>`, leaves the bundle repo uncommitted so accumulated edits stay visible |

Cold-layer edits (`system.yaml`, per-context files) go through `crystallize` — propose, agree, apply. There's no separate proposal file or merge queue: the proposal happens in chat and the edit happens immediately.

## Why

Working with a coding agent over a long session, the same problems keep showing up:

- The agent silently renames concepts. "Case" becomes "Record" becomes "Entry" across three turns, and you don't notice until something breaks.
- Architectural rules drift. The agent fixes a bug in module A by reaching into module B, violating a boundary that was never written down.
- Long chats become unscannable. By turn 40, neither of you can find the decision that was made on turn 12.

Lexicon's bet: a small, living document captures the *invariant* parts of the system (vocabulary, bounded contexts, "why"s) — and a workflow makes sure both human and agent ground in that document before work, and update it deliberately when learning happens.

## Install

```bash
# As a Claude Code plugin (from this GitHub repo)
/plugin install github:huylenq/lexicon
```

Or for local development:

```bash
git clone https://github.com/huylenq/lexicon
claude --plugin-dir ./lexicon
```

The plugin contributes one skill (`lexicon`) and six slash commands (`adopt`, `ground`, `retro`, `crystallize`, `conform`, `evolve`) — all namespaced as `/lexicon:<command>`. The skill itself is `user-invocable: false`; the model auto-fires it based on its description when context warrants, or you invoke a subcommand explicitly via slash.

## First use in a project

The first time you do substantive work in a project, the `lexicon` skill will detect there's no `lexicon/system.yaml` and prompt you to run `/lexicon:adopt` — the dedicated, one-shot adoption pass. Run it (either by saying "set up lexicon" or by accepting the prompt), and you'll get:

```
lexicon/
  system.yaml              # drafted from existing docs + code, honest about gaps
  contexts/                # one file per bounded context (when ≥3 atoms)
  surfaces/                # UI surfaces + regions (only if the project has a UI)
  retros/                  # session logs, populated by retro
  audits/                  # archived conform reports
  plans/_archive/          # archived plan folders
  _pre-migrate-archive/    # only if adopt archived ADR-shaped existing docs
```

After writing the draft, `adopt` immediately interviews you **one decision per conversational turn** to resolve TODO markers, drift flags, and inconsistencies — no separate "focused distillation session" to schedule later, no bulk-confirm shortcodes. You can say "pause" at any item boundary to stop and resume another time. The final **triage report** at `lexicon/bootstrap.md` reflects what was resolved vs. deferred.

If you don't want to use lexicon on a particular project, decline the prompt. The skill won't ask again that session. Drop a `.lexicon-skip` marker file at the repo root if you want the skip to persist across sessions.

## Project shape

```
lexicon/
  system.yaml              # cold layer root: shared kernels, contexts index, overlays, deliberate omissions
  contexts/                # one file per bounded context (terms, invariants, seams, boundary rules, aggregates, modules)
    <slug>.yaml
  surfaces/                # optional: UI surfaces with regions
    <slug>.yaml
  retros/                  # always-written session logs (timestamp-named markdown)
  audits/                  # archived conform reports
  bootstrap.md             # one-shot adoption report (created by adopt)
  conform.md               # drift report (created by conform; overwritten each run)
  .last-crystallized       # marker: crystallize reads retros newer than this
  plans/
    <feature>/             # in-flight materialized plans
    _archive/              # archived plan folders
  _pre-migrate-archive/    # frozen pre-migration originals (e.g. archived ADRs)
```

## Plugin shape

```
~/src/lexicon/                      # plugin repo
  .claude-plugin/plugin.json
  README.md
  CLAUDE.md                          # meta-context for iterating lexicon itself
  CHANGELOG.md
  commands/                          # thin slash wrappers for TUI autocomplete
    adopt.md  ground.md  retro.md  crystallize.md  conform.md  evolve.md
  skills/
    lexicon/                         # the only skill
      SKILL.md                        # entry, dispatch, standing rules
      reference/                      # single source of truth
        schema.md  checks.md  rules.md  design.md
      subcommands/                    # lifecycle bodies, loaded on demand
        adopt.md  ground.md  retro.md  crystallize.md  conform.md  evolve.md
      migrations/                     # per-version deltas, used by conform
        v0.x-to-v0.1.md  v0.1-to-v0.2.md  v0.2-to-v0.3.md
      templates/                      # YAML examples for adopt
      validators/                     # future deterministic schema validators
  viewer/                            # local web viewer for browsing cold layers
```

## What this is not

- **Not a planning tool.** Lexicon doesn't replace native plan mode. It complements it.
- **Not a code-review tool.** It runs *before* code, not after.
- **Not a documentation generator.** The doc lives in your repo and is maintained by you and the agent together.
- **Not a substitute for clarity.** If you don't know what your invariants are, lexicon can help you discover them, but it can't invent them.

## Status

v0.11.0 — early. Cold-layer schema v0.3 (DDD-faithful) is the current target. v0.11.0 collapses the previous seven sibling skills into a single `lexicon` skill with six subcommands, centralizing shared reference docs (schema, checks, rules, design) in one place. The shape is plausible but unproven on real projects. Issues and PRs welcome.

For the design rationale, rejected alternatives, and open questions, see [`CLAUDE.md`](./CLAUDE.md). For version history, see [`CHANGELOG.md`](./CHANGELOG.md).

## License

MIT
