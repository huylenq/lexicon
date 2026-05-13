# lexicon-viewer

Local dev tool for browsing a lexicon-conform project (cold-layer YAML + codebase) in the browser. Editorial-meets-blueprint UI with Light Table-style Monaco code peeks.

```
bun install
bun dev          # http://localhost:5273
```

The dev script runs Bun (API on :8787) and Vite (client on :5273 proxying /api → :8787) together.

## Views

Each project opens with two peer views, switchable from the top strip or the keyboard.

### Reading room

The default. Sidebar catalog of contexts / terms / invariants / ADRs / surfaces; center column reads one entity in depth with marginalia; right column is the Monaco peek drawer for code anchors.

### Graph view

A typeset diagram of the model — three lenses, each answering a different question.

- **Ownership** *(default)* — bounded contexts as outlined containers with their terms / invariants / seams / boundary rules nested inside. A `Cross-cutting` cluster holds system-level entries; a `Decisions` cluster floats alongside with `affects` edges fanning out to the entities each ADR touches.
- **Decisions** — ADRs laid out as a timeline (oldest at top), with `supersedes` chains. Affected entities sit below their ADR as satellites.
- **Surfaces** — surfaces as containers, regions nested inside.

Edges are styled by relation: solid oxide-red for `disambiguates-from`, dashed vellum for seams, dotted saffron for ADR `affects`, vellum arrow for `supersedes`.

#### Interactions

- **Click** a node → populate the right detail rail. The rail mirrors the reading-room sections (definition, statement, status, affects, supersedes, code anchors) in a compact form and includes a link back to the full entity page.
- **Hover** a node → highlight neighbors; non-neighbors dim to ~30%.
- **Double-click** → exit the graph and open the entity in the reading room.
- **Drag** the canvas to pan; mouse-wheel to zoom about the cursor. The graph fits the viewport on first paint.

#### Keyboard shortcuts

- `g` — switch to graph view (from anywhere).
- `Escape` — exit graph back to the reading room.
- `/` — focus the find box (jumps to the first matching node).
- `1`..`7` — toggle entity-kind filters (terms, invariants, seams, boundary rules, ADRs, surfaces, regions).

#### Filters

The top strip carries the lens selector plus three filter groups:

- **Kinds** — toggle entity kinds; layout re-runs.
- **Contexts** — restrict the graph to selected bounded contexts (and/or `Cross-cutting`).
- **Edges** — toggle which edge classes are drawn (`disambiguates`, `affects`, `supersedes`).

Filtering re-runs the layout deterministically — there's no animation in or out; the diagram simply reshapes.
