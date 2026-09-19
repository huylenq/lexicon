---
name: lexicon
description: Read or annotate a codebase as a human model of domain meaning, architecture, and code. Use when the user wants to understand a system's concepts, responsibilities, relationships, or their implementation, create and maintain lexicon/model.xml, or operate a connected Lexicon viewer through model inspection, selection, and navigation.
user-invocable: true
---

# Lexicon

Reduce the understanding someone must reconstruct from code. Contexts establish meaning, concepts name ideas, relationships explain connections, and source links connect them to implementation code or documentary evidence. Human judgment governs names, boundaries, and emphasis.

Domain meaning, software architecture, and code are distinct dimensions of the same system. Keep domain and architecture boundaries independent; explain their correspondence with relationships and ground either in source links. Flows describe ordered interactions between Architecture participants, with optional code detail grouped under those responsibilities. Domain concepts explain the meaning and rules of a scenario. Canvas planes and pages present those meanings without defining them. Linked Sources is the plane of authored link targets and shares the 2D editor with Domain and Architecture; Combined composes all three. Files browses the filtered filesystem through the standalone File Map, available as an opt-in development option; Source Reader opens code and documents. See the presentation vocabulary in `MODEL.md`.

## Choose the workflow

Read [architecture.md](architecture.md) when the question needs software structure alongside domain meaning.
Read [flows.md](flows.md) when the question needs an ordered runtime scenario or sequence diagram.

- **Operate:** inspect the connected application or carry out a requested selection, focus, or fit. Read [integration.md](integration.md). Navigation changes viewing state; it does not authorize semantic edits.
- **Explain:** answer the person's question from the existing model and relevant source. Explain directly when no model exists. Exploratory questions do not authorize model changes.
- **Initialize:** when asked to create a first model, read [initialize.md](initialize.md), then apply [review.md](review.md). A general initialization asks “What is this system, and how should I think about it?” Establish its essential ideas before selecting detailed traces. Respect an explicitly narrower scope.
- **Refine:** read the current model and relevant source, then make the requested incremental changes. Preserve stable IDs and established judgment. Add, split, move, merge, or remove objects as needed; keep dependent relationships consistent. Apply [review.md](review.md) to the changed scope and its connections. Do not broaden a focused request into a fresh system survey or regenerate the model.

## Use MCP

Use Lexicon MCP tools for all agent interaction with the model and viewer. Read [integration.md](integration.md) and inspect the live tool catalog. Embedded tasks receive a connection bound to their project, editing scope, viewer, and starting revision. Model-only edits stage a draft for user approval; Code + model edits save directly. External agents select explicit project and viewer IDs. Neither path executes reply code fences or uses a separate model-writing CLI.

If tools are missing or a call fails, explain the connection or validation issue and preserve the model. Do not switch to filesystem writes. Source inspection and the read-only checker below remain available within the caller's execution constraints.

## Roots and editing

Inspect project instructions and existing artifacts before editing. For a linked Git worktree, inspect implementation in the selected checkout and check the primary worktree for model artifacts. Use the caller's explicit artifact root when supplied. Preserve unrelated work and project registrations.

Read the bundle's `MODEL.md` and [contract.md](contract.md) before authoring; it defines XML, naming, annotations, and source-link conventions (retaining `code-link` XML and `codeLinks` API fields). Contexts group consistent meaning and responsibility. A domain concept may span several files, and a file may implement several concepts. Explain discrepancies between domain names and code symbols. Use DDD classifications when they clarify identity, consistency, or responsibility.

For document-backed modeling, inspect the relevant source documents and preserve their version, provenance, and scope. Give documentary links `kind="document"` and implementation links `kind="code"`; kind is independent of role and is never inferred by the viewer. Code links own tree-sitter/symbol capabilities; document links own heading and document-reading capabilities. Use source links with roles such as `specification`, `rationale`, or `reference`; Markdown supports file, line, or `heading` targets as defined in `MODEL.md`. A document establishes what is specified, not what code implements or enforces. When the user asks for a document-only model, do not inspect code or invent implementation links. For a PDF transcription, preserve page markers and distinguish faithful source text from synthesis.

MCP operations use the inspected project's server-owned artifact root and revision. Use `lexicon_patch` for initialization and atomic changes, `lexicon_edit` for a single create/update, and `lexicon_migrate` for explicitly requested migration or repair of an unavailable document. Project prose stays where it is. Do not introduce personal models or a separate modeling-decision log.

## Check and hand back

Resolve `<skill-directory>` from this skill's supplied location. The launcher follows symlinks to the bundle checkout:

```sh
bun <skill-directory>/scripts/lexicon.ts root
bun <skill-directory>/scripts/lexicon.ts check <artifact-root> --code-root <code-root>
```

Install dependencies with `bun install --frozen-lockfile` in `<bundle>/viewer/` when needed. The launcher runs source without a build or global CLI installation. When iterating on Lexicon, reread this skill and its referenced workflow files from disk.

Use the MCP server receipt for draft/save and validation status, inspect the resulting model, and check the visible result when requested. A Model-only receipt with `status: "draft"` confirms an unsaved candidate: explain what is ready for review and leave approval to the user in Lexicon. Later inspection and edits in that task include the draft; follow-ups can refine it. Code + model and standalone external calls save directly. Report persistence only after a saved receipt. Interrupted draft work remains available for review; completed direct saves remain applied. Pure inspection and navigation require no model checker. Report coverage and correctness separately, including important unresolved questions, broken or unchecked links, and reviews not performed. Check whether Git ignores the artifact and report that without changing ignore rules. Counts and resolving links do not establish semantic quality.

For any schema mismatch, keep the document intact and read [migrations/README.md](migrations/README.md). Explain questions without changes; an explicit migration uses the matching delta and current-schema validation. MCP keeps migration and ordinary incremental patches distinct. Initialization creates a starting point that the team refines through use and existing Git review.

## Project file scope

Before source discovery or adding evidence, read `<artifact-root>/lexicon/settings.json` when present. `files.include` is a list of source-root-relative globs (empty means all); `files.exclude` removes matching files. Without a settings file, exclusions default to `["**/*.lock", "**/.*/**"]` (lock files and dot-prefixed directories at any depth); explicitly saved exclusions replace this default. Include matches are combined with OR, then exclusions and Git ignore rules are applied. `*` stays within a directory; `**` spans directories. Do not discover or model excluded files. Existing model items and source links remain intact when scope changes.

Use the shared inventory instead of independently interpreting patterns:

```sh
bun <skill-directory>/scripts/lexicon.ts files <artifact-root> --code-root <code-root>
```

This command also excludes project-root `lexicon/` artifacts. Read those artifacts separately to maintain the model. Invalid settings must be corrected before discovery; do not silently fall back to an unfiltered scan.
