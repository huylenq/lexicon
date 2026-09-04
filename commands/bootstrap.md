---
description: Set up lexicon in this project — draft the cold-layer XML from existing docs and code, then run the distillation interview.
argument-hint: ""
---

Read these two files, then follow them in order:

1. `${CLAUDE_PLUGIN_ROOT}/skills/lexicon/SKILL.md` — the dispatcher: core idea, prose under lexicon/docs/, and the standing rules every move obeys.
2. `${CLAUDE_PLUGIN_ROOT}/skills/lexicon/subcommands/bootstrap.md` — the bootstrap procedure (Phases 1–10).

If `${CLAUDE_PLUGIN_ROOT}` doesn't resolve, the bundle lives at `~/src/lexicon/skills/lexicon/`. Don't `find /` for these files, and don't call the Skill tool on `lexicon:bootstrap` — that name loops back to this command.

The user wants to set up lexicon in this project: scan existing docs and code, draft a first-cut `lexicon/system.xml` and per-context files, archive ADR-shaped docs and lift their content into `rationale:` fields, then walk the user through distillation one decision at a time.
