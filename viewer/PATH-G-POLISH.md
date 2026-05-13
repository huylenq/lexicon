# Path G: Polish bundle

Four small-but-papercutty fixes the v0 viewer left on the table. Bundled because none is worth a session alone, together they fit one. Can be done in any order.

## Read first

- `viewer/PATH-B-GRAPH-VIEW.md` § "What lexicon-viewer is" — viewer architecture.
- `viewer/README.md` — running the dev server.

## Item 1 — Region owner label resolves to parent surface

Today, opening a `region` entity shows owner: **cross-cutting** in the marginalia. Technically true (regions don't belong to a bounded context) but wrong-feeling — every region belongs to *exactly one surface*, which is the actual conceptual owner.

**Fix**: in `EntityDetail.tsx`'s `Margin` component, special-case `entity.ref.kind === "region"`. The region's `surfaceId` field already points at its surface; resolve `graph.entities[`surface/${entity.surfaceId}`]` and render that as the owner via `<RefLink>`.

```ts
// in Margin, before the existing ownerNode computation:
const ownerNode =
  entity.ref.kind === "region" && entity.surfaceId
    ? <RefLink to={graph.entities[`surface/${entity.surfaceId}`]?.ref ?? { kind: "surface", fqid: `surface/${entity.surfaceId}`, name: entity.surfaceId }} />
  : entity.ownerContextId
    ? <RefLink to={…> // existing branch
  : …;
```

The "cross-cutting" italic fallback stays for actually-cross-cutting entities (system-level terms and invariants).

## Item 2 — Self-host Monaco workers

Today `@monaco-editor/react` loads Monaco from `cdn.jsdelivr.net` at runtime. For a local-only tool this is wrong on three counts: offline doesn't work, first-peek is slow (CDN cold start), and the user's network is unnecessarily involved.

**Fix**: vendor the Monaco AMD workers into Vite's build pipeline.

Three steps:

1. Install `monaco-editor` is already done. Vite needs to bundle the workers as assets.
2. In `client/main.tsx`, before any Monaco usage, configure the worker URLs to load from Vite's worker loader:

```ts
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};
```

3. Tell `@monaco-editor/react`'s loader to use the local Monaco instance instead of fetching from CDN:

```ts
import { loader } from "@monaco-editor/react";
loader.config({ monaco });
```

After these changes, `bun run build:client` will produce additional `.js` chunks for each worker, served from the same origin. Verify by opening the network tab on first peek — no requests to `cdn.jsdelivr.net`.

**Watch out**: bundle size grows substantially (Monaco's full workers are large). Verify the new bundle size; if it's painful, configure Monaco's `features` and `languages` lists to drop what's unused. For a viewer that peeks at typed code in a typed-code project, you usually want `typescript`, `javascript`, `markdown`, `yaml`, `python` and not much else.

## Item 3 — Filesystem watcher for auto-refresh

Today the user has to click "REFRESH" in the project shell to pick up changes to `lexicon/*.yaml`. For a dev tool watched live during a crystallize session, this is friction.

**Fix**: server watches the project's `lexicon/` directory; client subscribes via Server-Sent Events.

Server side:

- New endpoint `GET /api/projects/:id/events` that returns an `EventSource`-compatible stream. Use Hono's `streamSSE` helper (built-in in recent Hono versions, otherwise hand-roll).
- For each connected stream, set up a `fs.watch` on `<project_root>/lexicon/` with `{ recursive: true }`. Debounce changes (200ms) before pushing an event.
- Event shape: `{ type: "changed", paths: [...] }` or just `{ type: "changed" }`.
- Clean up the watcher when the client disconnects.

Client side:

- `ProjectShell` opens an `EventSource('/api/projects/${id}/events')` in a `useEffect`. On any `changed` message, call `api.loadLexicon(id, true)` to refresh.
- Show a small "live" indicator next to the REFRESH button — a small oxide dot when connected, vellum-3 when disconnected. Reconnect on disconnect (standard EventSource retry handles this).

**Watch out**: Bun's `fs.watch` semantics are slightly different from Node's. Test on the sample project; the watcher should fire on edits to YAML files, on additions, and on deletes. If recursive watching is flaky on macOS (it's a Node-level known issue), fall back to polling `stat` on each known YAML file every 2 seconds — uglier but reliable.

## Item 4 — Hover-expand for truncated sidebar names

The sidebar truncates long entity names (e.g., "Cold-layer edits do not hap…"). The `title` attribute already exposes the full text on hover, but the tooltip is browser-default ugly.

**Fix**: replace `title=…` with a small custom hover-expand on the truncated text.

Options, in order of preference:

1. **CSS-only**: on hover, the truncated element grows to its natural width and overflows its parent (using `position: absolute` on hover with `white-space: nowrap`). Works for short names; awkward for very long ones because they break out of the sidebar.
2. **Custom tooltip**: a small floating element rendered on hover, using a portal. Better visual control; more code.
3. **Drop truncation entirely**: let long names wrap to two lines. Simplest; slightly worse density.

Pick (1) for v0 — it's CSS-only and the names are usually short enough that overflow is fine. Save (2) for when (1) breaks. Implementation:

```css
@layer components {
  .truncate-hover-expand {
    @apply truncate;
    position: relative;
  }
  .truncate-hover-expand:hover {
    overflow: visible;
    white-space: nowrap;
    z-index: 10;
    background: var(--color-ink-2);
    padding-right: 0.5rem;
  }
}
```

Apply this class to the `SubList` items' `<Link>` in `ContextSidebar.tsx`.

## Files to touch / create

```
viewer/
  client/src/
    main.tsx                         ← Monaco worker setup
    components/
      EntityDetail.tsx               ← region owner fix
      ContextSidebar.tsx             ← truncate-hover-expand class
    styles/
      index.css                      ← .truncate-hover-expand component class
    pages/
      ProjectPage.tsx                ← EventSource subscription + "live" indicator
  server/
    index.ts                         ← /api/projects/:id/events SSE route
    watch.ts                         ← new — fs.watch setup, debounce, cleanup
```

## Implementation order

1. Region owner label (5 minutes; verify in the sample lexicon's Skill Bundle surface).
2. Hover-expand CSS (10 minutes; verify on long sidebar entries).
3. Monaco worker bundling — verify bundle size impact and offline behavior. This is the largest item; do it second-to-last because it affects build output.
4. Filesystem watcher — start with the server-side `fs.watch` + SSE, smoke-test by `curl -N` on the events endpoint while editing a YAML file. Then wire the client.

## Done state

- Open a `region` entity (any one in the Skill Bundle surface). Owner reads "Skill Bundle" with the **S**f glyph and is a clickable RefLink to the surface.
- Open the network tab, navigate around, open a code peek. No requests to `cdn.jsdelivr.net`. Bundle size in `bun run build:client` output is reported; note it (likely 1.5MB+ but local).
- Long sidebar names (e.g. "Cold-layer edits do not happen") expand on hover to show the full text without an ugly browser tooltip.
- Edit `viewer/sample-lexicon/lexicon/contexts/cold-layer.yaml`'s name field. The viewer auto-refreshes within ~1 second; the "live" indicator stays oxide. No manual REFRESH click needed.

## Caveats

- Monaco's full bundle is large enough that you may want to do a follow-up pass restricting features/languages. If you do, document the restricted set in `viewer/README.md`.
- SSE works fine over the local Bun + Hono setup but can be quirky behind reverse proxies. Not a v0 concern (local dev tool only).
- The hover-expand CSS approach can clip against the right edge of the sidebar when the name is very long. If this happens in practice, switch to a portal-based tooltip (option 2 above).
- The region-owner fix preserves the "cross-cutting" fallback for actually-cross-cutting entities. Don't accidentally remove it.

When this ships, the v0 viewer feels finished. Nothing transformative; just removed friction.
