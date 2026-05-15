---
description: Check the cold layer against current schema (structural) and current code (semantic). Apply schema fixes; triage semantic drift.
argument-hint: "[targeted-phase]"
---

Invoke the `lexicon` skill with subcommand `conform`.

The user wants a two-pass conformance check on this project's cold layer:

- **Structural pass** — detect the current `schemaVersion`, compute the migration delta chain to the latest, and (on the user's yes) apply each delta from `${CLAUDE_SKILL_DIR}/migrations/` in order.
- **Semantic pass** — run the six structural checks backward (glossary validation, UL ownership, invariant validation, bounded-context validation, hygiene, distillation completion, retro cross-check). Triage list only — never auto-applied; findings become input to a later `crystallize`.

Write a unified report at `lexicon/conform.md`. If the user specified a targeted phase ("just migrate", "audit only", "check hygiene"), run only that and note the scope in the report.
