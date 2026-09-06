---
name: lexicon
description: Read or annotate a codebase as a human domain model. Use when the user wants to understand a system's concepts, responsibilities, relationships, or their implementation, or create and maintain lexicon/model.xml.
user-invocable: true
---

# Lexicon

Reduce the understanding someone must reconstruct from code. Contexts establish meaning, concepts name ideas, relationships explain connections, and code links show their implementation. Human judgment governs names, boundaries, and emphasis.

## Choose the workflow

- **Explain:** answer the person's question from the existing model and relevant source. Explain directly when no model exists. Exploratory questions do not authorize model changes.
- **Initialize:** when asked to create a first model, read [initialize.md](initialize.md), then apply [review.md](review.md). A general initialization asks “What is this system, and how should I think about it?” Establish its essential ideas before selecting detailed traces. Respect an explicitly narrower scope.
- **Refine:** read the current model and relevant source, then make the requested incremental changes. Preserve stable IDs and established judgment. Add, split, move, merge, or remove objects as needed; keep dependent relationships consistent. Apply [review.md](review.md) to the changed scope and its connections. Do not broaden a focused request into a fresh system survey or regenerate the model.

## Roots and editing

Inspect project instructions and existing artifacts before editing. For a linked Git worktree, inspect implementation in the selected checkout and check the primary worktree for model artifacts. Use the caller's explicit artifact root when supplied. Preserve unrelated work and project registrations.

Read the bundle's `MODEL.md` before authoring; it defines XML, naming, annotations, and code-link conventions. Contexts group consistent meaning and responsibility. A domain concept may span several files, and a file may implement several concepts. Explain discrepancies between domain names and code symbols. Use DDD classifications when they clarify identity, consistency, or responsibility.

For standalone skill use, write scoped edits to `<artifact-root>/lexicon/model.xml`. Embedded Lexicon chat uses the server's patch protocol instead; its read-only source and server-owned save rules govern delivery. Project prose stays where it is. Do not introduce personal models or a separate modeling-decision log.

## Check and hand back

Resolve `<skill-directory>` from this skill's supplied location. The launcher follows symlinks to the bundle checkout:

```sh
bun <skill-directory>/scripts/lexicon.ts root
bun <skill-directory>/scripts/lexicon.ts check <artifact-root> --code-root <code-root>
```

Install dependencies with `bun install --frozen-lockfile` in `<bundle>/viewer/` when needed. The launcher runs source without a build or global CLI installation. When iterating on Lexicon, reread this skill and its referenced workflow files from disk.

Run the checker after edits and inspect the result through the reader when available. Report coverage and correctness separately, including important unresolved questions, broken or unchecked links, and reviews not performed. Check whether Git ignores the artifact and report that without changing ignore rules. Counts and resolving links do not establish semantic quality.

For earlier XML, read `<bundle>/MIGRATION.md`; preview conversion and preserve the originals. Initialization creates a starting point that the team refines through use and existing Git review.
