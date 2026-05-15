---
description: Absorb accumulated retros into the cold layer. Propose typed mutations inline; apply on the user's yes.
argument-hint: "[feature-name]"
---

Invoke the `lexicon` skill with subcommand `crystallize`.

The user wants to absorb the accumulated retros into the cold-layer YAML. Read retros newer than `lexicon/.last-crystallized`, cross-check against git diff, propose a typed mutation set (create / update / rename / move / deprecate / add-anchor / add-rationale / set-category / set-seam-kind / set-status / delete) inline in conversation, and apply on the user's explicit yes. If the user named a specific feature, run feature-scoped (filter retros) and don't update the marker afterward.
