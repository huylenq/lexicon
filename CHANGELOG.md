# Changelog

## Unreleased — Project canvas

- Add a tldraw canvas with custom model references and relationships, attached notes, sketches, media, and selection export. Keep the graph available during rollout.
- Save a versioned `lexicon/canvas.json` and content-addressed assets with revision checks, atomic writes, a previous version, browser recovery, and conflict review.
- Preserve a never-saved draft's missing merge base when another browser creates the project canvas; require review before replacing that file.
- Preserve concept containment; add context resizing, reference copies, searchable note links, and explicit model annotation and ownership commands with validated undo.
- Add optional stable IDs to code links and migrate earlier canvas references without rewriting model XML.
- Pin tldraw 5.4.0 and serve its assets locally. Built-canvas validation still requires the appropriate SDK license; local development checks run without a key.

See [Project canvas](viewer/CANVAS.md) for storage, recovery, and validation details.

## 2.0.0 — Human model of code

- Consolidate around Context, Concept, Relationship, and Code Link in `lexicon/model.xml`.
- Add annotations with evidence qualifiers and code links on relationships.
- Replace the viewer with Read, Map, search, and declaration-linked source.
- Include a DentalML canal-measurement example.
- Consolidate agent guidance into one skill for explaining and modeling a codebase.
- Support earlier XML through read-only import and explicit conversion.
- Preserve the previous implementation as browsable source in [quarantine](quarantine/pre-lean-b089f1c/README.md).

Earlier releases are recorded in the [historical changelog](quarantine/pre-lean-b089f1c/source/CHANGELOG.md) and Git history.
