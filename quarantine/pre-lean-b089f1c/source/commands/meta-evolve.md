---
description: Amend the lexicon bundle itself after correcting a lexicon output. Cross-repo write; does not commit.
argument-hint: "[optional prompt pointing at the moment]"
---

Read these two files, then follow them in order:

1. `${CLAUDE_PLUGIN_ROOT}/skills/lexicon/SKILL.md` — the dispatcher: core idea, prose under lexicon/docs/, and the standing rules every move obeys.
2. `${CLAUDE_PLUGIN_ROOT}/skills/lexicon/subcommands/meta-evolve.md` — the meta-evolve procedure.

If `${CLAUDE_PLUGIN_ROOT}` doesn't resolve, the bundle lives at `~/src/lexicon/skills/lexicon/`. Don't `find /` for these files, and don't call the Skill tool on `lexicon:meta-evolve` — that name loops back to this command.

The user invoked `/lexicon:meta-evolve` explicitly to capture a lesson from this session into the bundle at `~/src/lexicon/skills/lexicon/`. This is the slash-only self-evolve channel — proceed with the bundle-edit triage (bundle-bug / taste / project-quirk / no-op), locate the responsible target file (SKILL.md, a subcommand, or a reference file), quote the current text verbatim, and propose an amendment inline. Apply on yes; leave the change uncommitted in the lexicon repo — the dirty working tree is the accumulation buffer.

If the user supplied a prompt after `/lexicon:meta-evolve`, treat it as a pointer to the specific angle they care about.
