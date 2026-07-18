# lexicon

Plain text / documentation is the medium of alignment (not a spec-driven development workflow, this is not it). The main pains lexicon aimed to solve are:

- Cognitive / mental models gaps and drifts between human and agents.
- An ideal surface for attention-level that needs human.

Rationale:

> Code is the executable spec. Above the code, a small **cold-layer doc** captures what code can't express well: vocabulary, invariants, bounded contexts, and the "why"s. Lexicon makes sure the human and the agent stay aligned on that doc — through grounding before work, and crystallization (which reads the git diff since the last one) when a body of work lands.

Built on Eric Evans' [Domain-Driven Design](https://en.wikipedia.org/wiki/Domain-driven_design): ubiquitous language inside bounded contexts, entities and value objects and services and events as term categories, aggregates with roots, shared kernels for inter-context coordination, the eight context-map relationship kinds as typed seams, subdomains classified core / supporting / generic. Built for the messy reality of working with coding agents on real codebases. When the project has a UI surface, the same discipline extends to design vocabulary — tokens, component names, layout primitives, named layout zones (surfaces & regions), and accessibility contracts live in the same cold doc, with no separate workflow.

## What it does

Lexicon ships as **two Claude Code skills**: an awareness primer (`using-lexicon`) and an action skill (`lexicon`) with **six subcommands**, each exposed as a slash command for tab-completion ergonomics. The substance lives in `skills/lexicon/`; reference files (schema, structural checks, rules) are centralized in `skills/lexicon/reference/` and read by whichever subcommand needs them.

`using-lexicon` is the **awareness layer**, modeled on superpowers' `using-superpowers`. It does no work itself — invoke it once (or let it auto-fire when a lexicon project opens) and it parks a standing disposition for the rest of the session: it knows what the cold layer is for and which move fits which moment, and it **offers the right move proactively but advisorily — never as a gate**. It exists so you don't have to be the dispatcher, remembering which of the six verbs to fire when. The verbs themselves live in the action skill:

| Subcommand | Fires when | Does |
|---|---|---|
| `/lexicon:bootstrap` | Once, at setup time | Scans existing docs and code, drafts a first-cut `system.xml`, archives ADR-shaped content (with optional rationale-lift onto affected atoms), sets up `lexicon/` structure, then interviews you to resolve gaps / drift flags / inconsistencies — one decision per conversational turn |
| `/lexicon:ground` | Before substantive coding work | Reads `lexicon/system.xml` and the relevant context files, declares scope (terms, invariants, bounded context) **in conversation**, surfaces vocabulary gaps. No file writes. |
| `/lexicon:crystallize` | **You trigger it** ("crystallize", "update lexicon", "feature X is done") | Reads the git diff since the last crystallization, runs the structural checks over it, proposes a typed mutation set inline in chat, applies it directly on your yes. This is where session drift is caught and absorbed — git history is the session log, so there's no separate per-session retro step |
| `/lexicon:spec` | You write or finalize a design/architecture doc | Authors and files **markdown specs** under `lexicon/specs/` — per-feature design/architecture docs that sit above code and below the cold layer. They defer vocabulary to the cold layer (link atoms via `[[fqid]]`) instead of carrying a glossary; the viewer renders them with cross-links. Two-tier lifecycle: an active `<slug>-design.md` decision log (+ a transient `<slug>.progress.md` cold-session handoff) → an established `established/<slug>.md` as-built doc. On your confirmation that work is done, promotion pairs with `crystallize` |
| `/lexicon:validate` | Periodically (quarterly, on demand) or when schema bumps | Two-pass check: structural pass detects schema-version drift and offers to apply the migration delta chain; semantic pass re-validates the cold layer against current code (stale glossary, dead invariants, untyped seams, hygiene rot). Writes a triage report to `lexicon/validate.md` |
| `/lexicon:meta-evolve` | **You trigger it** (`/lexicon:meta-evolve`) after correcting something a lexicon subcommand produced | The self-evolve channel for the bundle itself: takes the session conversation as the primary signal, amends the responsible `~/src/lexicon/skills/lexicon/<path>`, leaves the bundle repo uncommitted so accumulated edits stay visible |

Cold-layer edits (`system.xml`, per-context files) go through `crystallize` — propose, agree, apply. There's no separate proposal file or merge queue: the proposal happens in chat and the edit happens immediately.

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

The plugin contributes two skills (`using-lexicon`, `lexicon`) and six slash commands (`bootstrap`, `ground`, `crystallize`, `spec`, `validate`, `meta-evolve`) — all namespaced as `/lexicon:<command>`. The action skill (`lexicon`) is `user-invocable: false`; the model auto-fires it based on its description when context warrants, or you invoke a subcommand explicitly via slash. The awareness skill (`using-lexicon`) is `user-invocable: true` — it auto-fires when a lexicon project opens and can also be invoked deliberately to make a session lexicon-aware.

## First use in a project

The first time you do substantive work in a project, the `lexicon` skill will detect there's no `lexicon/system.xml` and prompt you to run `/lexicon:bootstrap` — the dedicated, one-shot setup pass. Run it (either by saying "set up lexicon" or by accepting the prompt), and you'll get:

```
lexicon/
  system.xml               # drafted from existing docs + code, honest about gaps
  contexts/                # one file per bounded context (when ≥3 atoms)
  surfaces/                # UI surfaces + regions (only if the project has a UI)
  plans/_archive/          # archived plan folders
  _pre-migrate-archive/    # only if bootstrap archived ADR-shaped existing docs
```

After writing the draft, `bootstrap` immediately interviews you **one decision per conversational turn** to resolve TODO markers, drift flags, and inconsistencies — no separate "focused distillation session" to schedule later, no bulk-confirm shortcodes. You can say "pause" at any item boundary to stop and resume another time. The final **triage report** at `lexicon/bootstrap.md` reflects what was resolved vs. deferred.

If you don't want to use lexicon on a particular project, decline the prompt. The skill won't ask again that session. Drop a `.lexicon-skip` marker file at the repo root if you want the skip to persist across sessions.

## Project shape

```
lexicon/
  system.xml               # cold layer root: shared kernels, contexts index, overlays, deliberate omissions
  contexts/                # one file per bounded context (terms, invariants, seams, boundary rules, aggregates, modules)
    <slug>.xml
  surfaces/                # optional: UI surfaces with regions
    <slug>.xml
  specs/                   # optional: markdown design/architecture docs (created by spec)
    <slug>-design.md       # active design (decision log)
    <slug>.progress.md     # transient cold-session handoff
    established/<slug>.md  # as-built architecture doc
  bootstrap.md             # one-shot setup report (created by bootstrap)
  validate.md              # drift report (created by validate; overwritten each run)
  .last-crystallized       # marker: crystallize reads the git diff newer than this
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
    bootstrap.md  ground.md  crystallize.md  spec.md  validate.md  meta-evolve.md
  skills/
    using-lexicon/                   # awareness primer: parks the disposition, routes to lexicon
      SKILL.md
    lexicon/                         # action skill: runs the moves
      SKILL.md                        # entry, dispatch, standing rules
      reference/                      # single source of truth
        schema.md  checks.md  rules.md  design.md
      subcommands/                    # lifecycle bodies, loaded on demand
        bootstrap.md  ground.md  crystallize.md  spec.md  validate.md  meta-evolve.md
      migrations/                     # per-version deltas, used by validate
        v0.x-to-v0.1.md  v0.1-to-v0.2.md  v0.2-to-v0.3.md  v0.3-to-v1.0.md
      templates/                      # XML examples for bootstrap
      validators/                     # future deterministic schema validators
  viewer/                            # local web viewer for browsing cold layers
```

## What this is not

- **Not a planning tool.** Lexicon doesn't replace native plan mode. It complements it.
- **Not a code-review tool.** It runs *before* code, not after.
- **Not a documentation generator.** The doc lives in your repo and is maintained by you and the agent together.
- **Not a substitute for clarity.** If you don't know what your invariants are, lexicon can help you discover them, but it can't invent them.

## Status

Early. Cold-layer schema v1.0 (XML) is the current target. The skill is a single `lexicon` skill with six subcommands (`bootstrap`, `ground`, `crystallize`, `spec`, `validate`, `meta-evolve`), centralizing shared reference docs (schema, checks, rules, design) in one place. The per-session `retro` step was removed in favor of `crystallize` reading the git diff directly — git history is the session log. The shape is plausible but unproven on real projects. Issues and PRs welcome.

For the design rationale, rejected alternatives, and open questions, see [`CLAUDE.md`](./CLAUDE.md). For version history, see [`CHANGELOG.md`](./CHANGELOG.md).

## License

MIT
