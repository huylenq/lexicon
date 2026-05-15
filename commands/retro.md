---
description: Log a session retro at a natural stopping point. Always runs; structural-drift flags fire only when triggered.
argument-hint: ""
---

Invoke the `lexicon` skill with subcommand `retro`.

The user wants to close the loop on this session: run the six structural checks (vocabulary, vocabulary consistency, invariants, boundaries, decisions, declared-scope match) against the session diff, then write `lexicon/retros/<iso-timestamp>.md` with flags inline. Don't dump the retro contents into chat — file is the artifact, chat is the pointer.
