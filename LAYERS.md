# Layers promotion

Layers is a presentation inside the existing resizable tldraw canvas area. The reader, navigation, code workspace, and Agent remain the same. Domain meaning, software architecture, and code are distinct dimensions of one model. Domain and Architecture appear as parallel planes; source evidence is available through code links.

## Promotion stages

1. **Semantic and reader integration: implemented.** Manifesto, model contract, agent guidance, and shared dimension classification agree. Selection survives navigation between reader and Layers.
2. **Shared presentation: implemented.** Layers pages save in the project canvas, preserve existing pages and media, support a shared session undo history, and refresh model references in place. Failed saves retain local work and offer retry, export, and recovery.
3. **Broader interaction acceptance: next.** Exercise larger real models, keyboard navigation beyond undo/redo, touch gestures, and supported browsers before making Layers the default.
4. **Code dimension: future work.** Use worked examples to choose the source projection and its many-to-many mappings.

## Run and use

From `viewer/`, run `bun install --frozen-lockfile` and `bun run dev:layers`, then open <http://127.0.0.1:5407/p/shop?presentation=layers>. The runner uses an in-memory project registry; canvas saves go to the selected project's artifact root. `LEXICON_LAYERS_PORT` and `LEXICON_VIEWER_API_PORT` override the ports. Choose Layers in the canvas toolbar. Older `/layers/:projectId` links redirect into this same workspace.

Separation moves whole planes along their shared normal. Domain and Architecture focus either plane straight-on. Both canvas cameras use the same scale, fitted to the larger diagram. The shared canvas zoom slider changes both together. Mouse wheel and pinch zoom the complete 3D view around the pointer; dragging with Pan moves both canvas cameras. Hovering or selecting a connector outlines its endpoint objects and marks their surface attachments. Search, relationship details, source excerpts, and browser history use the same semantic identities as the reader.

The canvas toolbar has an icon-only Reset view button. A question-mark toggle at the bottom-left of the exposed canvas opens a horizontal 3D controls sheet docked to the bottom; it stays anchored to the canvas as adjacent panes resize. The overlay can stay open while using the canvas and closes through the same fixed question-mark toggle. Left-drag blank space to pan; right-drag, middle-drag, and Shift-left-drag pan anywhere, including over cards. Alt/Option-left-drag orbits, Ctrl-left-drag vertically separates planes, and Ctrl-Alt/Option-left-drag horizontally rolls when both dimensions are visible. Shift snaps orbit and roll to 15° increments; Shift-drag without Alt/Option still pans. Right-drag always pans. Card dragging edits placement; clicking opens the reader. Scroll or pinch zooms around the pointer. The Layers menu retains sliders for separation, tilt, rotation, roll, shared canvas zoom, and surface opacity. Reset restores the chosen camera preset (45° tilt, 0° rotation and roll, 138 separation) and fitted framing, preserving layer placement and visible dimensions. There are no bottom mode controls. Tilt stops at 85 degrees in either direction; rotation and roll wrap through a full turn.

Undo and Redo span gestures on both planes, including Arrange. Command/Ctrl-Z and Command/Ctrl-Shift-Z use that history outside text inputs. History is limited to 30 changes in the current session. A model refresh or an accepted external canvas version clears the history so old snapshots cannot undo newer source meaning or another writer's work. Tilt, separation, and selection are viewing state and do not enter layout history.

## Persistence and compatibility

`lexicon/canvas.json` contains the existing pages plus Domain and Architecture pages. Each view has stable visual reference IDs; the semantic item IDs remain unchanged. Existing ordinary-canvas placements, notes, bindings, and asset records stay on their original pages. Layers placements are independent of ordinary-canvas placements. Project assets use the existing asset endpoint.

The earlier browser-only Layers layout is imported when the project has no Layers pages. Its original browser copy is retained. Import remaps visual references, notes, attachments, and asset IDs without replacing the existing project records. An existing project Layers layout takes precedence.

Two tldraw editors mirror document records while keeping independent current pages, cameras, and selections. One instance of the existing canvas persistence service owns writes, revision checks, merge/conflict handling, polling, and IndexedDB recovery. Saving pauses while projections or undo snapshots are installed. The file receives normalized routes, authored geometry, and content; session state stays in the browser.

A failed save leaves the layout editable and offers Retry save and Export canvas. A conflicting version can be accepted while archiving local edits to recovery; the ordinary reader exposes the full recovery panel. Unreadable saved canvases are preserved and link to that panel. Refresh model keeps the last readable model on failure and reports the error beside the retained layout. Removed model items retain missing visual references and their attached content.

## Rendering

The CSS scene owns orientation and separation. Each tldraw editor uses an untransformed viewport for geometry and culling. Four DOM corner markers supply the perspective mapping for pointer events. Text measurement takes place outside the transformed scene; editor cleanup restores the measurement node before removing its temporary host. Viewer zoom also increases both editors’ rendering scale, with an inverse CSS scale preserving plane geometry and pointer mapping. Connection labels counter-rotate to face the viewer. Translucent plane backgrounds leave lower-plane cards visible and do not intercept their pointer input.

Cross-dimension connectors share the planes' CSS 3D scene. They join the architecture surface to the underside of the domain surface. Transparent space exposes their paths; foreground cards remain opaque. Visible segments and labels remain clickable. Direction follows the declared relationship.

## Validation and limits

147 tests, typecheck, and client build pass. Focused tests cover perspective coordinates, import preservation and attachment remapping, unchanged semantic IDs, and shared history branching/reset. The build retains the tldraw/ELK chunk-size warning.

Chromium checks on a disposable Shop project covered moves on both tilted planes, cross-plane undo/redo, keyboard undo, actual file saves, reload and reader round trips, source evidence, save failure and retry, conflict recovery, and model refresh. A renamed concept retained its center. An original-page note, image, and asset remained byte-for-byte equal as records after the round trip. An invalid model refresh retained the last readable scene and reported the error. Earlier checks covered separation extremes, focus modes, search, missing-project recovery, and narrow screens.

Large-model performance, Safari/Firefox, multi-touch, and the full freeform editing/export workflow within Layers remain unaccepted. Ordinary canvas export and asset storage are reused, but this stage does not add a code plane. The viewport/event adapter depends on tldraw 5.4 behavior and needs checking on SDK upgrades.

The canvas shell remains mounted across Diagram, Atlas, and Layers. All three use the same Canvas toolbar and presentation selector. Layers adds separation and tilt in the toolbar options menu; it has no app header or separate details panel. Save status uses the existing workspace status area.

Validation of the shared canvas shell: 147 unit tests and typecheck pass. The new browser regression preserves the actual canvas container across presentations and keeps the reader card and source pane. The full browser suite passed 67 checks; its Browse edge-background assertion also fails on an untouched 8ea340e baseline (13px inset, expected at most 1px). Desktop and 390px layouts were inspected in the integrated browser.

Each plane has a translucent background wrapping its current content with padding. The surface follows canvas zoom, pan, and edits; it does not clip or constrain objects. Each editor still renders an overscanned viewport with unbounded camera travel. Blank foreground space passes pointer input through to lower-plane cards. Fit resets both the shared canvas scale and the 3D viewer zoom. Only the overall app canvas clips at its viewport.
