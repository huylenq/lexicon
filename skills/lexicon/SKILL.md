---
name: lexicon
description: Read or annotate a codebase as a human model of domain meaning, architecture, and code. Use when the user wants to understand a system's concepts, responsibilities, relationships, or their implementation, create and maintain lexicon/model.xml, or operate a connected Lexicon viewer through model inspection, selection, and navigation.
user-invocable: true
---

# Lexicon

Reduce the understanding someone must reconstruct from code. Contexts establish meaning, concepts name ideas, relationships explain connections, and code links show their implementation. Human judgment governs names, boundaries, and emphasis.

Domain meaning, software architecture, and code are distinct dimensions of the same system. Keep domain and architecture boundaries independent; explain their correspondence with relationships and ground either in code links. Flows describe scenarios across existing participants. Canvas layers and pages present those meanings without defining them.

## Choose the workflow

Read [architecture.md](architecture.md) when the question needs software structure alongside domain meaning.
Read [flows.md](flows.md) when the question needs an ordered runtime scenario or sequence diagram.

- **Operate:** inspect the connected application or carry out a requested selection, focus, or fit. Read [integration.md](integration.md). Navigation changes viewing state; it does not authorize semantic edits.
- **Explain:** answer the person's question from the existing model and relevant source. Explain directly when no model exists. Exploratory questions do not authorize model changes.
- **Initialize:** when asked to create a first model, read [initialize.md](initialize.md), then apply [review.md](review.md). A general initialization asks “What is this system, and how should I think about it?” Establish its essential ideas before selecting detailed traces. Respect an explicitly narrower scope.
- **Refine:** read the current model and relevant source, then make the requested incremental changes. Preserve stable IDs and established judgment. Add, split, move, merge, or remove objects as needed; keep dependent relationships consistent. Apply [review.md](review.md) to the changed scope and its connections. Do not broaden a focused request into a fresh system survey or regenerate the model.

## Choose the execution path

- **Embedded chat:** follow the caller's server-applied operation, patch, or migration protocol. When the caller supplies application operations, use them for create/update, viewer navigation, and exact undo. The server binds the originating project, viewer, revision, and undo identity; never supply or override these bindings. Read-only source access and server-owned saves govern delivery, even if other integration tools are available.
- **Connected MCP:** for external agent use with Lexicon tools available, read [integration.md](integration.md). Inspect the chosen project and viewer session, use supported operations, and report their actual receipts. Resolve the current tool names and schemas from the connected catalog.
- **Standalone:** when operating directly on a codebase without a connected Lexicon integration, edit the model file and run the checker below. An explicit request to work directly on the file also selects this path when the caller's execution constraints allow it.

Do not switch to filesystem writes merely because an MCP operation failed or is unsupported. Explain the limitation and follow the recovery or handoff guidance in [integration.md](integration.md).

## Roots and editing

Inspect project instructions and existing artifacts before editing. For a linked Git worktree, inspect implementation in the selected checkout and check the primary worktree for model artifacts. Use the caller's explicit artifact root when supplied. Preserve unrelated work and project registrations.

Read the bundle's `MODEL.md` and [contract.md](contract.md) before authoring; it defines XML, naming, annotations, and code-link conventions. Contexts group consistent meaning and responsibility. A domain concept may span several files, and a file may implement several concepts. Explain discrepancies between domain names and code symbols. Use DDD classifications when they clarify identity, consistency, or responsibility.

For standalone skill use, write scoped edits to `<artifact-root>/lexicon/model.xml`. Connected MCP operations use the inspected project's server-owned artifact root and revision. Embedded chat delivers its structured patch for the server to apply. Project prose stays where it is. Do not introduce personal models or a separate modeling-decision log.

## Check and hand back

Resolve `<skill-directory>` from this skill's supplied location. The launcher follows symlinks to the bundle checkout:

```sh
bun <skill-directory>/scripts/lexicon.ts root
bun <skill-directory>/scripts/lexicon.ts check <artifact-root> --code-root <code-root>
```

Install dependencies with `bun install --frozen-lockfile` in `<bundle>/viewer/` when needed. The launcher runs source without a build or global CLI installation. When iterating on Lexicon, reread this skill and its referenced workflow files from disk.

After standalone edits, run the checker and inspect the result through the reader when available. For MCP edits, use the server receipt for save and validation status, inspect the resulting model, and check the visible result when requested. For embedded chat, report the proposed patch until the server confirms application. Pure inspection and navigation require no model checker. Report coverage and correctness separately, including important unresolved questions, broken or unchecked links, and reviews not performed. Check whether Git ignores the artifact and report that without changing ignore rules. Counts and resolving links do not establish semantic quality.

For any schema mismatch, keep the document intact and read [migrations/README.md](migrations/README.md). Explain questions without changes; an explicit migration uses the matching delta and current-schema validation. Embedded Chat keeps migration and ordinary incremental patches distinct. Initialization creates a starting point that the team refines through use and existing Git review.
