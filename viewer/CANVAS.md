# Project canvas

Canvas is the default for ordinary project links. Use **Canvas / Graph** in the header to switch surfaces; `?canvas=graph` opens the Graph fallback explicitly. Existing `?canvas=tldraw` links remain valid. Browse, Read, Code, and Chat remain independent panes.

For the normal local viewer, run `bun run build:client` followed by `bun run start` from `viewer/`, then open port 5374.

For an isolated development workshop:

```sh
cd viewer
bun install --frozen-lockfile
bun run dev:canvas
```

Open [the checkout workshop](http://127.0.0.1:5393/p/canvas-workshop?canvas=tldraw). It includes source for all five code links. This command uses client port 5393, API port 5394, and a separate `lexicon-canvas-prototype.db` registry. Override them with `LEXICON_CANVAS_PORT`, `LEXICON_VIEWER_API_PORT`, and `LEXICON_VIEWER_DB`. Restart the command after server changes; the client reloads through Vite.

## Files and recovery

| Content | Storage |
| --- | --- |
| Contexts, concepts, relationships, code links, formal annotations | `lexicon/model.xml` |
| Shared placements, notes, drawings, reference copies, attachments | `lexicon/canvas.json` |
| Images and video | `lexicon/assets/<content hash>.<extension>` |
| Camera, selection, search, collapsed contexts, pane preferences | This browser |
| Unsaved canvas recovery | This browser's IndexedDB, per tab and artifact root |

Opening an unmodeled project leaves its files untouched until the first canvas edit. Canvas autosave writes a versioned companion file in the resolved artifact root. Linked code worktrees use the same artifact-root resolution as the model. Commit `canvas.json` and its assets together to share them or move the project. Generated relationship routes and hidden-state flags are normalized before saving, so camera changes and context collapse do not rewrite the shared document. Shape labels are cached for export and missing references; the current model supplies their meaning.

A save checks the file's content revision, acquires an exclusive local file lock, writes and flushes a temporary file, and renames it into place. `.canvas.previous.json` retains the preceding valid version. An abandoned save lock can recover after its owning process exits. A corrupt or newer-format canvas is preserved and blocks autosave. **Recover previous canvas** restores a validated backup and archives the replaced bytes as `.canvas-recovered-<time>.json`.

Failed saves remain visibly unsaved. Restart the local server to reopen a project after it stops. The browser records recovery drafts, restores this tab's pending edits after reload, and offers drafts from other tabs. Keep the tab open or export if both the project save and browser recovery fail. Closing without waiting for the save indicator can lose edits that have not reached either storage system. This is local recovery, not a backup service.

Two tabs combine independent record changes using a three-way merge. Edits to the same shape or incompatible attachments require **Review versions**. The review shows the project content and offers a portable export, loading the project version, or replacing the reviewed revision with the current canvas. Loading another version archives the local draft. A newer intervening save is checked again. This is file reconciliation, not multiplayer presence or real-time collaboration.

## Use the canvas

Select a model object and click **Add note** to attach a note. It follows the object and its context. The native **Note**, **Text**, **Draw**, **Arrow**, **Media**, and other tldraw tools create freeform content. Semantic relationships and code mappings use custom relationship shapes; native arrows do not create model relationships.

Freeform text uses a compact scale alongside the model: Small is 13.5 px beside 14 px model labels, with larger sizes available for emphasis. The shared tldraw theme keeps text measurement, editing, and exports consistent.

The toolbar uses Lexicon's shared icons and selection title; the footer shares its semantic legend. Routine save status appears in the footer. Right-click a model object for **Focus** or **Expand code / Hide code**. Expanding a context includes its concepts and internal relationships. **Back to overview** restores the preceding camera.

**Notes** lists and searches canvas notes and text, including the names of their attached objects. Select a result to locate it; its URL includes the shape ID. **Copy note link** copies that location. Open **Selection actions** with a note selected to attach it to a model object, detach it, or reattach it without changing its text.

Main model references cannot be renamed, deleted, rewired, or reparented by canvas gestures. Concepts stay inside their owning context during dragging and keyboard movement. Resizing a context keeps its children in place and prevents the boundary from shrinking through them. Duplicating or pasting a model card creates a labeled reference copy with an independent position. Missing model objects and relationships retain their references and attached notes for review; those missing references can be deleted.

In **Selection actions**, **Move to context** explicitly changes a concept's owner. **Add to model** previews a note as an annotation on a chosen object, with a kind and optional evidence qualification. Both actions use the existing model validator, revision checks, artifact-root rules, and Chat undo history. Built-in example models remain read-only. Canvas undo affects canvas edits; **Undo model edit** restores exact XML and refuses to overwrite a newer edit. Further semantic changes are available through Chat's incremental model-edit workflow.

Model refresh reconciles references by stable identity. New code links should have an `id` unique within their owner; preserve it when changing their target. Older links get deterministic target-and-role identities, so reordering or editing an explanation preserves attachments. Changing an unidentified link's target or role can leave a missing reference. Opening a model never adds IDs to XML. Old index-based canvas references and URLs migrate on read.

**Arrange** resets the model layout while retaining freeform content. Attached notes follow their targets. **Fit model** frames the visible model; tldraw's navigation menu also fits all canvas content. Code shapes are created as their links are opened, and previously placed code references are retained.

## Export and import

**File → Export canvas** creates a portable `.lexicon-canvas.json` with embedded media. **Restore canvas** validates its schema, model ID, records, and attachments before replacing the working canvas. It accepts the original prototype format and current version 2 files. **Undo restore** returns to the pre-import document. Imports can come from another path or machine with the same model ID.

**Selection actions → Export selection** downloads a PNG. Selecting a context includes its children and the relationships between them. Custom model cards and relationships have SVG export renderers, so they appear beside notes, drawings, and media.

Media uploads support PNG, JPEG, GIF, WebP, AVIF, MP4, and WebM, up to 25 MB each. The server checks content hashes and confines files to the artifact root. Assets are retained after shape deletion for undo, recovery, and Git history; automatic garbage collection is intentionally absent. A missing asset is reported rather than silently dropped. Shared canvas JSON is limited to 20 MB and 20,000 records; embedded export/import files are limited to 50 MB.

When no saved canvas or recovery snapshot exists, the first projection imports compatible Graph placements and camera from this browser. Contexts expand to contain migrated children; invalid child positions are clamped inside the boundary. The original Graph viewing state is retained, and a saved canvas always takes precedence on later opens.

The original prototype's browser database is read once when the project has no companion file, using the pinned SDK's IndexedDB format. Local media is copied into the project, and the original database is retained. Export from the original browser if its media is no longer available. Lexicon exports require Lexicon's custom shapes and cannot be opened directly in an unmodified tldraw editor.

## Validation and rollout

The implementation has a few explicit boundaries:

| Responsibility | Files |
| --- | --- |
| Canvas UI, selection, and model actions | `client/src/canvas/CanvasPane.tsx`, `CanvasInspector.tsx` |
| Shape rendering, model projection, and stable reference IDs | `shapes.tsx`, `projection.ts`, `references.ts` |
| React boot state and editor save lifecycle | `useProjectCanvas.ts`, `persistence.ts` |
| Local API calls, portable files, and browser recovery | `api.ts`, `files.ts`, `recovery.ts` |
| Shared document capture and reference migration | `document.ts` |
| File format, limits, record schemas, and merge rules | `shared/canvas.ts`, `canvas-schema.ts`, `canvas-merge.ts` |
| Project file storage and semantic command rules | `server/canvas.ts`, `server/canvas-command.ts` |

Each editor owns one persistence controller and disposes it on unmount. A saved revision and its merge base must stay paired; a draft with no prior save has a null base and requires review if a project file appears elsewhere. Projection calls `ready()` after applying a snapshot so generated references are reconciled before autosave. Canvas model commands use Chat's existing revision checks, file writer, and undo history.

Keep the `lexicon-canvas-prototype.db` development registry filename and original browser database keys compatible with existing local data. The workshop launcher now uses `LEXICON_CANVAS_WORKSHOP`; the server still accepts its earlier `LEXICON_CANVAS_PROTOTYPE` name.

```sh
bun run test
bun run typecheck
bun run build:client
PLAYWRIGHT_CHANNEL=chrome bun run test:browser
PLAYWRIGHT_CHANNEL=chrome bun run test:canvas
```

Canvas browser checks build the client and run the normal `bun run start` server on isolated port 5395 with temporary projects. They open ordinary project URLs with Canvas as the default. The original reader checks use port 5384 and an isolated registry. See `tests/canvas-storage.test.ts` for file, schema, concurrency, and media contracts, and `tests/canvas.e2e.ts` for browser interactions and recovery. API checks cover explicit canvas-to-model commands and exact undo.

Validation on 2026-09-06: 52 unit/API tests, 31 reader browser tests, and 21 canvas browser tests passed, as did typecheck and the client build. Canvas checks use the built client and normal local launcher. They cover default and fallback links, shared controls, code toggling, Focus camera restoration, Graph layout migration, unmodeled projects, and the existing persistence, recovery, model-edit, and export contracts. The 300-concept fixture (20 contexts, 280 relationships) loaded in about 0.6 seconds on the development machine. The toolbar, footer, and contextual actions were reviewed in the live Django Oscar canvas. Earlier validation resolved all 90 links in that isolated fixture and visually checked selection export.

The SDK and its schema, validators, and asset package are pinned to tldraw 5.4.0. Update them together, add schema migrations before changing custom props, and rerun storage and browser checks against existing files. Fonts, icons, and translations are served locally. The canvas and ELK remain separate lazy bundles; their size is a rollout cost to measure on target machines.

The normal local viewer uses a loopback HTTP URL. The pinned SDK classifies this host as development even when serving the built client, so this local launch works without a production key and retains the SDK watermark. `VITE_TLDRAW_LICENSE_KEY` is available for an appropriately licensed runtime. Lexicon does not alter the SDK's license checks; validation here covers the local launch, not a hosted deployment. See [tldraw's licensing documentation](https://tldraw.dev/community/license) for its terms.
