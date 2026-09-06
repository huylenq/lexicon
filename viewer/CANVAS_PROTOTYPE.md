# Canvas prototype

This worktree adds a tldraw canvas alongside the React Flow graph. Use **Try Canvas / Canvas** in the header to switch. Browse, the reader, Code, and Agent remain in the same workspace.

```sh
cd /Users/huy/src/lexicon-tldraw-prototype/viewer
bun install --frozen-lockfile
bun run dev:canvas
```

Open [the checkout workshop](http://127.0.0.1:5393/p/canvas-workshop?canvas=tldraw) or [DentalML](http://127.0.0.1:5393/p/dentalml?canvas=tldraw). The checkout example includes its source, so all code links work without another checkout. It is a teaching fixture with one context, three concepts, and two relationships.

The prototype uses client port 5393, API port 5394, and its own `viewer/lexicon-canvas-prototype.db` registry. `LEXICON_CANVAS_PORT`, `LEXICON_VIEWER_API_PORT`, and `LEXICON_VIEWER_DB` can override these. Existing project registrations are preserved.

## Try it

1. Select Order, read its rule, then select the `contains` relationship and expand its code link.
2. With a model object selected, click **+ Note** and write a question. Drag the object or its context: the note follows. The standard **Note** tool creates an independent note.
3. Draw, add an image through **Media**, or connect shapes with the **Arrow** tool. These marks remain freeform content.
4. Collapse and expand the context. Use **Arrange** to lay out model objects again. Notes and images are preserved; attached notes follow their objects. **Fit model** centers visible model objects. tldraw's zoom menu also offers canvas navigation.
5. Export the canvas from **File**, then restore that export. **Undo restore** returns to the canvas as it was before importing.

The main model references can be moved and selected. Their names, ownership, and connections come from `model.xml`; canvas gestures cannot delete or rewrite those definitions. Duplicating a model card creates another visual reference. A reference whose object has been removed from the model displays a missing-object notice.

## Storage and editing

tldraw saves shapes, bindings, images, and session state in this browser's IndexedDB, using the project source root and model ID as the key. Its writes are batched. Export creates a `.lexicon-canvas.json` file containing the document and embedded image assets. Restore accepts exports from the same project and validates them before loading.

Model refreshes reconcile references by ID and preserve manual positions. Model projection and layout updates are excluded from canvas undo history. Canvas undo handles freeform edits and placement; Agent's existing **Undo edit** handles changes to the model file.

This prototype does not automatically write a shared companion file, synchronize between teammates, or promote notes into XML annotations. Export files require Lexicon's custom shapes and cannot be opened directly in an unmodified tldraw editor. The current model still identifies code mappings by owner and list index; durable annotations on mappings need a stronger identity before a production migration.

## Implementation

- `client/src/canvas/CanvasPane.tsx` connects the canvas to reader navigation, search, code expansion, and local persistence.
- `client/src/canvas/shapes.tsx` defines model cards, relationship shapes, and note attachments.
- `client/src/canvas/projection.ts` adapts the existing graph projection, ELK layout, and edge routing.
- `playwright.canvas.config.ts` runs canvas checks against an isolated development server and temporary projects.

```sh
bun run test
bun run typecheck
bun run build:client
PLAYWRIGHT_CHANNEL=chrome bun run test:browser
PLAYWRIGHT_CHANNEL=chrome bun run test:canvas
```

The pinned SDK is tldraw 5.4.0. Development runs without a production key and retains tldraw's license notice. A production build needs an appropriate license through `VITE_TLDRAW_LICENSE_KEY`; the prototype does not change or bypass that requirement. See [tldraw's license terms](https://tldraw.dev/community/license).
