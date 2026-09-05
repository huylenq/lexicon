# Lexicon reader

A local reader for the four-object domain model: contexts, concepts, relationships, and code links. Read the explanation, explore its connections, and inspect the implementation.

```sh
bun install --frozen-lockfile
bun run build:client
bun start
```

Open http://127.0.0.1:5374. Development uses `mise run viewer` from the repository root, with Vite on http://127.0.0.1:5373.

The library includes a DentalML example plus your registered projects. DentalML source links use a sibling `dentalml` checkout. Add a project by its absolute folder path. Removal affects its library registration only.

- **Read:** context catalog, concept explanations, annotations, incoming/outgoing relationships, implementation links.
- **Map:** focused rows of named relationships with clickable endpoints.
- **Code:** declared source with line numbers, syntax coloring, symbol highlighting, and the explanation for the link.
- **Find:** search names, descriptions, annotations, files, and symbols. `/` focuses search; Escape closes code or navigation.
- **History:** item, view, and source selection live in the URL. Browser Back/Forward and Copy link preserve them.
- **Refresh:** reread the model from disk. Parsing is uncached.

Earlier XML models open through a read-only import adapter. See [MIGRATION.md](../MIGRATION.md). The model format is in [MODEL.md](../MODEL.md).

## Checks

```sh
bun run test
bun run typecheck
bun run build:client
bun run check examples/dentalml --code-root /path/to/dentalml
```

The API binds to `127.0.0.1`. `LEXICON_VIEWER_API_PORT` changes port 5374. `LEXICON_VIEWER_DB` chooses a separate SQLite registry for tests; the default preserves `lexicon-viewer.db`. API source requests identify an item and its code-link index, and the server confines the resolved file to the code root.
