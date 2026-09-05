---
description: Author, evolve, or file a spec — a markdown design/architecture doc that links into the cold layer.
argument-hint: "[slug]"
---

Read these two files, then follow them in order:

1. `${CLAUDE_PLUGIN_ROOT}/skills/lexicon/SKILL.md` — the dispatcher: core idea, prose under lexicon/docs/, and the standing rules every move obeys.
2. `${CLAUDE_PLUGIN_ROOT}/skills/lexicon/subcommands/spec.md` — the spec procedure.

If `${CLAUDE_PLUGIN_ROOT}` doesn't resolve, the bundle lives at `~/src/lexicon/skills/lexicon/`. Don't `find /` for these files, and don't call the Skill tool on `lexicon:spec` — that name loops back to this command.

The user wants to write or update a spec — a higher-than-code, lower-than-cold-layer design/architecture document. Specs are markdown under `lexicon/docs/specs/`, defer their vocabulary to the cold layer (link atoms via `[[fqid]]`), and are updated in place. Read the subcommand body for the full shape.
