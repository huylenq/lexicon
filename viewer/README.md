# lexicon-viewer

Local reading room for a lexicon-conform project: cold-layer XML, markdown under `lexicon/docs/`, and the codebase in one window. Editorial UI, Monaco peeks for code anchors. Read-only — corrections go through `crystallize` in the terminal.

```
bun install
bun run --hot server/index.ts   # API + built client on :5374
bun run dev:client              # Vite HMR on :5373, proxies /api → :5374
```

Or from the plugin repo root: `mise run viewer`. Open **http://localhost:5373** while developing (live source). `:5374` is the API, and also serves `client/dist` if you've built.

The API used to sit on `:8787`. That port is Cursor's MCP OAuth callback, so the default is now **5374**. Override with `LEXICON_VIEWER_API_PORT` if you need to — a generic `PORT` is ignored so Cursor/Grok sessions cannot steal the bind.

## Views

Each project has two peer views, switchable from the top strip or the keyboard.

### Reading room

The default. Sidebar catalog by bounded context; centre column reads one entity; right rail is the Monaco peek drawer for code anchors. Markdown specs under `lexicon/docs/specs/` show up as `spec` entities and resolve `[[fqid]]` links into the cold layer.

### Graph view

A typeset diagram of the same model. Lenses:

- **Ownership** *(default)* — bounded contexts and shared kernels as containers, atoms nested inside.
- **Surfaces** — surfaces as containers, regions nested.
- **Code** — symbols the cold layer pins via code-anchors, edges from tree-sitter / LSP.
- **Territory** — leftover graphify neighborhood browser. Optional, artifact-only, not the engine. Candidate for removal.

## Keyboard

- `g` — graph view
- `Escape` — back to the reading room
- `/` — find
