---
name: laxicon
description: "Use when a repository's primary/default worktree has lexicon/docs/ (or a leftover laxicon/ directory), or when asked to capture an idea, maintain a project wiki, or author a spec or plan. Prose lives under lexicon/docs/; this is not a sibling product of the typed Lexicon cold layer."
version: 0.4.0
author: Huy Le
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Laxicon, Documentation, Architecture, Planning]
    related_skills: [lexicon, using-lexicon]
---

# Laxicon — prose under `lexicon/docs/`

The sibling `laxicon/` directory is retired. Project prose lives at:

```text
lexicon/
  system.xml          # optional cold layer (typed, crystallize-gated)
  contexts/
  surfaces/
  docs/               # all markdown
    wiki/
    specs/
    plans/
    ideas/
```

This skill is the authoring contract for `lexicon/docs/`. The typed cold layer still belongs to the `lexicon` skill.

## Shared artifact worktree

Read and write `lexicon/` only under the repository's primary/default worktree (first path from `git worktree list --porcelain`). Never create knowledge directories in a linked feature worktree. A leftover `laxicon/` is the old name for `lexicon/docs/`; read it if it still exists, but do not create a new one.

## What to write where

- **`docs/wiki/`** — explanation a human should be able to read: background, rejected alternatives, the narrative why. Optional. Wikilinks (`[[Page]]`) are welcome because this tree is often vault-linked.
- **`docs/specs/`** — durable design/architecture intent. Link cold-layer atoms with `[[fqid]]` instead of defining a glossary. Update the same file in place.
- **`docs/plans/`** — disposable execution notes. Delete or leave in git when the work lands.
- **`docs/ideas/`** — pre-commitment thinking. If it is worth a spec, write the spec; do not run a promotion ritual.

Other folders under `docs/` stay project-defined.

## What is not required

No frontmatter schema. No `status:` state machine. No idea→spec promotion checklist. No spec adoption gate. No evidence-back-propagation rule. Git is the log. The human reviews the files the same way they review code.

Agents may write and update these files under the current task. Distill stable vocabulary or invariants into `system.xml` / `contexts/` only through `crystallize`.

## Before acting

1. Resolve the shared artifact worktree. Inspect existing `lexicon/docs/` (or leftover `laxicon/`) before creating anything.
2. Write in the project's language. Do not copy chat transcript into the repo.
3. Do not recreate `laxicon/` as a sibling of `lexicon/`.

The canonical source is `~/src/lexicon/skills/laxicon/SKILL.md`. Runtime adapters must point here.
