---
description: Absorb accumulated work into the cold layer. Propose typed mutations inline; apply on the user's yes.
argument-hint: "[feature-name]"
---

Read these two files, then follow them in order:

1. `${CLAUDE_PLUGIN_ROOT}/skills/lexicon/SKILL.md` — the dispatcher: core idea, prose under lexicon/docs/, and the standing rules every move obeys.
2. `${CLAUDE_PLUGIN_ROOT}/skills/lexicon/subcommands/crystallize.md` — the crystallize procedure.

If `${CLAUDE_PLUGIN_ROOT}` doesn't resolve, the bundle lives at `~/src/lexicon/skills/lexicon/`. Don't `find /` for these files, and don't call the Skill tool on `lexicon:crystallize` — that name loops back to this command.

The user wants to absorb accumulated work into the cold-layer XML. Read the git diff newer than `lexicon/.last-crystallized` plus recent-session conversation, run the six structural checks over it, propose a typed mutation set (create / update / rename / move / deprecate / add-anchor / add-rationale / set-category / set-seam-kind / set-status / delete) inline in conversation, and apply on the user's explicit yes. If the user named a specific feature, run feature-scoped (filter the diff to that feature's paths) and don't update the marker afterward.
