---
description: Ground the current task in the project's cold-layer model — read system.yaml, declare scope, surface vocabulary gaps. No writes.
argument-hint: ""
---

Read these two files, then follow them in order:

1. `${CLAUDE_PLUGIN_ROOT}/skills/lexicon/SKILL.md` — the dispatcher: core idea, prose under lexicon/docs/, and the standing rules every move obeys.
2. `${CLAUDE_PLUGIN_ROOT}/skills/lexicon/subcommands/ground.md` — the ground procedure.

If `${CLAUDE_PLUGIN_ROOT}` doesn't resolve, the bundle lives at `~/src/lexicon/skills/lexicon/`. Don't `find /` for these files, and don't call the Skill tool on `lexicon:ground` — that name loops back to this command.

The user wants to ground substantive work in the project's lexicon: read `lexicon/system.yaml` and the relevant context files, declare scope in conversation (task, bounded context, vocabulary in play, invariants depended on, files likely to change, out-of-scope), and surface any vocabulary gaps before code is written.
