---
description: Check the cold layer against current schema (structural) and current code (semantic). Apply schema fixes; triage semantic drift.
argument-hint: "[targeted-phase]"
---

Read these two files, then follow them in order:

1. `${CLAUDE_PLUGIN_ROOT}/skills/lexicon/SKILL.md` — the dispatcher: core idea, the laxicon sibling, and the standing rules every move obeys.
2. `${CLAUDE_PLUGIN_ROOT}/skills/lexicon/subcommands/validate.md` — the validate procedure.

If `${CLAUDE_PLUGIN_ROOT}` doesn't resolve, the bundle lives at `~/src/lexicon/skills/lexicon/`. Don't `find /` for these files, and don't call the Skill tool on `lexicon:validate` — that name loops back to this command.

The user wants a two-pass validation of this project's cold layer:

- **Structural pass** — detect the current `schemaVersion`, compute the migration delta chain to the latest, and (on the user's yes) apply each delta from `${CLAUDE_SKILL_DIR}/migrations/` in order.
- **Semantic pass** — run the six structural checks backward (glossary validation, UL ownership, invariant validation, bounded-context validation, hygiene, distillation completion) against current code. Triage list only — never auto-applied; findings become input to a later `crystallize`.

Write a unified report at `lexicon/validate.md`. If the user specified a targeted phase ("just migrate", "audit only", "check hygiene"), run only that and note the scope in the report.
