---
description: Amend the lexicon bundle itself after correcting a lexicon output. Cross-repo write; does not commit.
argument-hint: "[optional prompt pointing at the moment]"
---

Invoke the `lexicon` skill with subcommand `meta-evolve`.

The user invoked `/lexicon:meta-evolve` explicitly to capture a lesson from this session into the bundle at `~/src/lexicon/skills/lexicon/`. This is the slash-only self-evolve channel — proceed with the bundle-edit triage (bundle-bug / taste / project-quirk / no-op), locate the responsible target file (SKILL.md, a subcommand, or a reference file), quote the current text verbatim, and propose an amendment inline. Apply on yes; leave the change uncommitted in the lexicon repo — the dirty working tree is the accumulation buffer.

If the user supplied a prompt after `/lexicon:meta-evolve`, treat it as a pointer to the specific angle they care about.
