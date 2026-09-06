# Changelog

## Unreleased — Project canvas

- Make Canvas the default, with custom model references and relationships, attached notes, sketches, media, and selection export. Keep an explicit Graph fallback and existing Canvas links.
- Share the icon toolbar and semantic legend, move routine save status to the footer, and expose selection actions in a popover. Restore context code toggling and the previous camera after Focus.
- Migrate compatible Graph placements and camera on first open; existing canvases and recovery drafts take precedence.
- Save a versioned `lexicon/canvas.json` and content-addressed assets with revision checks, atomic writes, a previous version, browser recovery, and conflict review.
- Preserve a never-saved draft's missing merge base when another browser creates the project canvas; require review before replacing that file.
- Preserve concept containment; add context resizing, reference copies, searchable note links, and explicit model annotation and ownership commands with validated undo.
- Normalize freeform typography to the model labels, including text editing and exported images.
- Add optional stable IDs to code links and migrate earlier canvas references without rewriting model XML.
- Pin tldraw 5.4.0 and serve its assets locally. Run canvas browser checks against the built client through the normal loopback launcher, which the SDK classifies as development without a key.

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
