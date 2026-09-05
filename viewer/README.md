# Lexicon reader

A local reader for the four-object domain model: contexts, concepts, relationships, and code links. Read the explanation, explore its connections, and inspect the implementation.

```sh
bun install --frozen-lockfile
bun run build:client
bun start
```

Open http://127.0.0.1:5374. Development uses `mise run viewer` from the repository root, with Vite on http://127.0.0.1:5373.

The production build is installable as a PWA. Open port 5374 and use **Install app** when offered, or the browser's install menu. Supporting desktop browsers can place the inline header alongside native window controls through Window Controls Overlay. Other browsers retain their standard app title bar. The header's empty space drags the window; its links and buttons remain clickable.

Keep `bun start` running to read projects and source. The service worker caches only the built app shell, including the graph assets. If the server is unavailable, the app opens with a reconnect message; model data, source code, and library changes are never cached. Updates activate after all existing app windows and tabs close. PWA caching is enabled only in production builds, so Vite development stays live.

The library includes a DentalML example plus your registered projects. DentalML source links use a sibling `dentalml` checkout. Add a project by its absolute folder path. Removal affects its library registration only.

- **Read:** context catalog, concept explanations, annotations, incoming/outgoing relationships, and implementation links.
- **Relationships:** select either endpoint to open that context or concept, or select the relationship name to read its explanation. Each is a separate link that also supports opening in a new tab.
- **Code:** an independently toggled, resizable workspace with line numbers, syntax coloring, declaration focus, and links back to every mapped domain object. Code links from Browse and Graph open this same pane. Domain navigation preserves the current code location; closing and reopening Code restores it, including its file view and scroll position. The pane has its own previous/next location controls. On narrow screens, Code fills the workspace and **Back to reader** returns to the explanation.
- **Find:** search names, descriptions, annotations, files, and symbols. `/` focuses search; Escape closes code or navigation.
- **History:** item and source selection live in the URL. Browser Back/Forward and Copy link preserve them.
- **Refresh:** reread the model from disk. Parsing is uncached.

## Graph

Use **Graph** in the header to open a resizable pane to the left of the reader. **Browse** controls navigation independently. Concepts appear inside their contexts; clicking a node or relationship opens its explanation without moving the camera. On narrow screens, a selection opens the reader and **Back to graph** returns to the same view.

- **Implementation:** select a context, concept, or relationship and choose **Expand code**. Identical declared file/symbol or file/line targets share a node, with every mapping's role and explanation preserved. Relationship code attaches at its edge label. Code nodes are grouped by file outside domain contexts. **Show all code** temporarily includes every target; switching it off restores individual expansions.
- **Reading code:** a code node opens the Code workspace without replacing the reader. A code connector opens its mapping explanation in the reader and its source in Code. Browse and Graph visibility never change code-link navigation. Targets are grouped by their declared paths and symbols; aliases are not resolved into canonical identities.
- **Explore:** search highlights matches while retaining the overall picture. **Locate** reveals and centers a selection. **Focus** shows its immediate neighborhood; **Back to overview** restores the previous camera. Click empty graph space, choose **Clear selection**, or press Escape within the graph to deselect without moving the camera.
- **Collapse:** the control on a context hides its concepts and summarizes boundary connections by direction and connection type. Counts open the underlying relationships or mappings. Explicitly expanded code stays visible.
- **Arrange:** drag concepts, code nodes, or group headings. Drag empty space to pan; hold Space to pan even over nodes and edges, with a hand cursor while held. Scroll zooms. The divider also supports Left/Right arrow keys. **Rearrange** and **Reset graph view** are in the graph's options menu. Graph nodes support Enter to read. Edges and labels stay below concept nodes until their connection or a neighboring item is selected.

Layout, camera, code expansion, collapsed contexts, pane split, and visibility are stored in this browser per project. Selections use browser history and URLs. These viewing changes do not modify the model. Missing endpoints remain visible as model notices; source failures appear when opening code.

Earlier XML models open through a read-only import adapter. See [MIGRATION.md](../MIGRATION.md). The model format is in [MODEL.md](../MODEL.md).

## Checks

```sh
bun run test
bun run typecheck
bun run build:client
bunx playwright install chromium
bun run test:browser
bun run check examples/dentalml --code-root /path/to/dentalml
```

The API binds to `127.0.0.1`. `LEXICON_VIEWER_API_PORT` changes port 5374. `LEXICON_VIEWER_DB` chooses a separate SQLite registry for tests; the default preserves `lexicon-viewer.db`. API source requests identify a declared file/symbol or file/line target independently of its domain mappings; earlier owner/index requests remain supported. The server accepts only targets declared in the model and confines the resolved file to the code root.

Browser checks build and serve the client on port 5384 with a separate in-memory registry. To use an installed Chrome instead of Playwright's Chromium, run `PLAYWRIGHT_CHANNEL=chrome bun run test:browser`.
