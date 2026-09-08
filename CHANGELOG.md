# Changelog

## Unreleased — Project canvas

- Use tldraw as the sole canvas, with custom model references and relationships, attached notes, sketches, media, and selection export. Remove the ReactFlow renderer, dependency, and header switch; earlier renderer links retain their selections and open the canvas.
- Add **Diagram / Atlas** modes on the same canvas. Atlas generates ink districts, landmarks, and winding dirt roads from model identities and current positions, with saved appearance choices and native undo. Roads remain selectable along their bends, and selected nodes use one outline in both modes.
- Fit node frames to their artwork and labels in Atlas and to their text in Diagram. Roads narrow into landmark entrances, stay connected through moves and appearance changes, and leave nameplates clear. Renaming a fitted node preserves its center and attached notes.
- Remove context collapse and its bundled connections. Contexts always show their concepts and authored relationships; earlier collapsed canvases restore their full frames and preserve placements and notes.
- Fit Diagram rectangles and Atlas polygons automatically around their inner nodes and labels during movement. Atlas border handles save local shape preferences: sculpted bays yield to nodes and return when space allows. **Reshape to contents** clears preferences; roads and selection follow the actual coast. Node moves, border edits, undo, and reload preserve positions and authored preferences.
- Share one editor-owned presentation state across canvas rendering and native geometry, preserving border editing through model refresh and code expansion. Keep territory derivation separate from ink decoration, and reject malformed border regions before restoring or saving a canvas.
- Let a completed tap reopen the selected object on mobile after returning from the reader, without changing native drag or modifier-selection behavior. Fit a saved canvas on first visit when this browser has no personal camera, including when the canvas finishes loading behind the reader.
- Share the icon toolbar and semantic legend, move routine save status to the footer, and expose selection actions in a popover. Restore context code toggling and the previous camera after Focus.
- Migrate compatible Graph placements and camera on first open; existing canvases and recovery drafts take precedence.
- Save a versioned `lexicon/canvas.json` and content-addressed assets with revision checks, atomic writes, a previous version, browser recovery, and conflict review.
- Preserve a never-saved draft's missing merge base when another browser creates the project canvas; require review before replacing that file.
- Preserve context ownership during canvas gestures; add reference copies, searchable note links, and explicit model annotation and ownership commands with validated undo.
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
