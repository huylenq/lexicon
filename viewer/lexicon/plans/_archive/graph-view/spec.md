# Path B: Graph view for the lexicon viewer

This plan is a self-contained brief for implementing a graph visualization of a lexicon-conform project in `lexicon-viewer`. It assumes you (the agent reading this) are arriving fresh to the codebase. Read it end-to-end before writing code.

## What lexicon-viewer is

A local dev tool for browsing a lexicon-conform project's **cold layer** (DDD-style ubiquitous language: bounded contexts, terms, invariants, ADRs, surfaces and regions) and **codebase** in the same window. Built in this repo at `viewer/`:

- **Backend**: Bun runtime + Hono routing + `bun:sqlite` for the multi-project registry. Reads YAML files from a project's `lexicon/` directory, validates with zod, exposes a typed graph as `/api/projects/:id/lexicon`.
- **Frontend**: Vite + React 18 + Tailwind v4 + Monaco editor (`@monaco-editor/react`). Three-pane shell: left "card catalog" sidebar, center "specimen" detail, right "peek drawer" with Monaco for code references.

Today's UI is **list-and-detail**: pick an entity from the sidebar, read its prose + marginalia, click any code anchor to open a Monaco peek beside it. Beautiful for reading a single entity in depth; weak at showing the **shape** of the model. Path B adds a graph view that does the latter.

### What's already shipped (v0)

- Project list (`/`) with add/remove
- Project shell (`/p/:id/*`) with sidebar + detail + peek drawer
- Entity detail components for: System, BoundedContext, Term, Invariant, Seam, BoundaryRule, Decision (ADR), Surface, Region
- Typed reference links (clickable `RefLink` component) — drives navigation
- Monaco peek drawer with `lexicon-ink` theme, line-range highlighting, multiple peeks stacking vertically
- Aesthetic system: **Fraunces** display serif + **IBM Plex Mono** body mono, ink (`#0e1014`) on vellum (`#e8e2d5`) with oxide-red (`#b8472d`) accent, sharp geometry (no rounded corners), 1px oxide-red underline for in-prose references, drop-cap-style first letter for entity bodies. The aesthetic is **editorial-meets-blueprint** — typeset reference work, not generic devtool dashboard.

### Sample data

A self-referential sample lexicon ships at `viewer/sample-lexicon/lexicon/`. It models lexicon itself: 50 entities across 4 bounded contexts, 6 ADRs, 1 surface with 5 regions. Code anchors point at the real skill files via a `skills` symlink. Use this for development; the project root for testing is `/Users/huy/src/lexicon/viewer/sample-lexicon`.

## The cold-layer model (schema v0.1)

See `viewer/server/schema.ts` for the zod schema and `skills/lex-overview/SKILL.md` § Schema specification for the normative spec. The graph view needs to render these entity kinds:

| Kind | What it is | Belongs to |
|---|---|---|
| `system` | Project root | — |
| `bounded-context` | One DDD bounded context | `system` |
| `term` | Glossary entry (the UL atom) | one context, OR cross-cutting (system-level) |
| `invariant` | Statement that must hold | one context, OR cross-cutting |
| `seam` | Structural joint between contexts | one context (with `participants` listing peers) |
| `boundary-rule` | Directional normative rule (from → to) | one context |
| `decision` | ADR | independent (with optional `affects` pointing at terms/invariants/contexts) |
| `surface` | A UI surface (route/screen/window) | independent |
| `region` | A named zone inside a surface | one surface |

### Typed edges that exist in the graph

| Edge | Source | Target | Meaning |
|---|---|---|---|
| `contains` | `bounded-context` | term/invariant/seam/boundary-rule | Containment |
| `contains` | `surface` | region | Containment |
| `disambiguates-from` | term | term | "NOT to be confused with" |
| `affects` | decision (ADR) | term/invariant/context | ADR touches this entity |
| `supersedes` / `superseded-by` | decision | decision | ADR chain |
| `seam-participant` | seam | bounded-context | Seam connects these contexts |
| `boundary-rule-from` / `boundary-rule-to` | boundary-rule | bounded-context | Directional rule |

The graph view needs to render at least: containment (visually as nesting or grouping), disambiguates-from (term-to-term), affects (ADR-to-entity), and supersedes (ADR chain).

### Shape of the data delivered to the client

`GET /api/projects/:id/lexicon` returns `{ project, graph }` where `graph` is a `ResolvedGraph`:

```ts
interface ResolvedGraph {
  system: ResolvedEntity | null;
  entities: Record<string /* fqid */, ResolvedEntity>;
  byKind: Record<EntityKind, string[]>;
  issues: LoadIssue[];
  projectRoot: string;
}
```

`fqid` is a fully-qualified id: `system/lexicon`, `context/cold-layer`, `cold-layer/term`, `inference/invariant/queue-fifo`, `decision/ADR-0003`, `surface/skill-bundle`, `surface/skill-bundle/overview-rulebook`. Use these as React keys and graph node IDs.

See `viewer/client/src/lib/types.ts` for the full TypeScript shape — same structure as the server's `schema.ts`.

## The Path B goal

Add a **graph view** as a peer to the current detail view. The user can flip between them. The graph is the answer to: *"show me the model, not the prose."*

### What the graph view must do (v0 of Path B)

1. **Render bounded contexts as containers** — outlined regions with the context name. Each container holds its owned terms, invariants, seams, and boundary rules as nested nodes.
2. **Render the system root** as a backdrop or sidebar element holding cross-cutting terms / invariants.
3. **Render ADRs as floating glyphs** with dotted edges to entities they `affect`. ADRs that supersede other ADRs render with a chain edge (timeline-like or stacked).
4. **Render surfaces as a separate panel/region** with regions nested inside, edges to any cross-references with components/regions in `design-system` context.
5. **Render edges as styled lines**:
   - `disambiguates-from`: solid oxide-red, bidirectional or with double-headed arrow.
   - `seam`: dashed line between contexts.
   - `boundary-rule`: directed arrow with the rule as a midpoint label.
   - `affects`: dotted line ADR → entity.
   - `supersedes`: a chain along the ADR list (one ADR pointing back to its predecessor).
6. **Click on a node** → select it. Selection populates a **detail rail** (right-side panel, similar shape to the current `EntityDetail` but compact) without leaving the graph. Double-click → navigate to `/p/:id/<fqid>` (the existing detail page) and exit graph view.
7. **Hover on a node** → highlight neighbors. Non-neighbors dim to ~30% opacity. Hover off → restore.
8. **Filter controls** along the top (or in a left sidebar):
   - Toggle by entity kind (terms / invariants / ADRs / surfaces / etc.)
   - Toggle by context (show only one or two contexts)
   - Toggle by edge type (just disambiguation, just ADR-affects, etc.)
9. **Keyboard shortcuts**: `g` to enter graph view from detail, `escape` to exit back to detail, `1..9` to toggle entity-kind filters, `/` to focus filter search.

### What the graph view should NOT do in v0 of Path B

- Free-form drag to reposition nodes. Layout is computed by the algorithm; the user shouldn't have to fight it.
- Editing. Read-only.
- Animation-heavy transitions. The aesthetic is editorial, not Apple Keynote.
- Pan/zoom with momentum. A simple drag-pan + wheel-zoom (with sensible defaults) is enough.
- Saving graph layouts. Layouts are deterministic per graph state; reproducibility comes for free.

### Aesthetic continuity (load-bearing — read this twice)

The current viewer's aesthetic is the differentiator. **Don't import a generic graph component and ship it with rounded purple nodes.** Stay true to the editorial-meets-blueprint direction:

- **Type**: Fraunces for entity display names (small caps for context container labels), IBM Plex Mono for IDs and metadata badges. Same `text-h3` / `smallcap` / `mono text-micro` sizes already in `client/src/styles/index.css`.
- **Color**: ink background (`var(--color-ink)`), vellum text (`var(--color-vellum)`), oxide-red for active/selected (`var(--color-oxide)`), saffron (`var(--color-saffron)`) sparingly for warnings/ADR glyphs.
- **Geometry**: sharp corners (`--radius-card: 0`). Strokes 1px. Hairline rules (`--color-rule`). No drop shadows on nodes; minimal use of fills (mostly outlined boxes with the ink background showing through).
- **Edges**: solid for disambiguation (oxide), dashed for seams (vellum-3), dotted for ADR-affects (saffron at 50%), directed arrows are simple triangles, not blob arrowheads.
- **Containment**: bounded contexts render as outlined regions with the context name displayed as a chiseled label at the top-left. The convention is *a typeset diagram*, not *a network graph*.
- **Atmosphere**: the existing `.grain` overlay class adds a subtle noise texture to make the canvas feel like paper rather than a screen — apply it to the graph canvas container.

If anything in the chosen graph library forces a different aesthetic (rounded nodes, animated edges, default purple colors), customize aggressively or pick a different library. The aesthetic is the product.

## Library choice

Recommendation: **ELK.js** (Eclipse Layout Kernel, JS port) for layout + **custom SVG rendering** for the visuals. Rationale:

- ELK handles **compound graphs** (nested containers) well — exactly what we need for "bounded context contains terms."
- The `layered` algorithm gives directed-graph-like layouts; the `mrtree` algorithm gives hierarchical layouts; we can pick per-view.
- ELK is layout-only. **Rendering is yours** — which means full control over the aesthetic. No "fighting the library to remove its defaults."
- It's pure JS, no canvas/WebGL dependency. SVG renders the typography crisply, which matters because the entire point is letting Fraunces and Plex Mono carry the visual identity.

Alternatives considered (and why not):

- **Cytoscape.js**: full-featured but heavy, opinionated styling. Hard to make typographically distinctive.
- **react-flow / reaflow**: React-native graph libs. Good DX but their default node components carry strong aesthetic prior that fights ours.
- **d3-force**: low-level, full control, but force-directed layouts produce blobs that don't read as "ownership hierarchy." Would need significant constraint work to match the brief.
- **vis-network / dagre / mermaid**: each is either heavy, dated, or non-interactive.

If ELK turns out to be too slow on graphs of 200+ nodes (sample lexicon has ~50, real projects could be ~500), fall back to **dagre** for layered ordering and use custom logic for containment. Don't pick before measuring on a real project.

Install: `bun add elkjs`. Web Worker setup is recommended for layout to keep the UI responsive — see ELK.js README for the worker shim.

## Concrete data shaping

Given the `ResolvedGraph`, build a graph model the layout engine can consume:

```ts
interface GraphNode {
  id: string;            // fqid
  kind: EntityKind;
  name: string;
  // for compound graphs: parent fqid (context or surface that contains this)
  parent?: string;
  // visual hint
  width?: number;        // computed from name length + fixed padding
  height?: number;       // fixed by kind
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "disambiguates" | "seam" | "boundary-rule" | "affects" | "supersedes";
  label?: string;        // for boundary-rule midpoint
  directed: boolean;
}
```

Then turn this into ELK's input format (`children` for nested compound nodes, `edges` at the top level). See ELK's "Compound Graphs" docs.

### Filtering changes the graph model

When the user toggles off "show invariants," the graph data model removes invariant nodes and any edges incident on them. Don't try to fade-in-place — re-run layout. ELK is fast enough for this on graphs the size we expect.

### Layout choice per "lens"

A graph view that shows everything at once is overwhelming. Offer 2–3 **lenses** at v0 (radio button row in the filter bar):

1. **Ownership**: contexts as compound containers, terms/invariants/seams/rules nested inside. ADRs floating outside with `affects` edges. **Primary lens** — most informative.
2. **Decisions**: timeline-y vertical layout of ADRs with supersession chains visible. Affected entities radiate out as satellites. Good for "what decisions touched this term?"
3. **Surfaces**: surfaces as containers, regions nested. Cross-references to components from the `design-system` context shown as edges.

The current detail view already covers reading individual entities; the graph view should excel at *cross-cutting* views the detail view can't show.

## Routing and integration

- Add a route `/p/:id/graph` (and `/p/:id/graph/:lens` for direct linking to a specific lens).
- Add a small "Graph view" toggle in the project shell top strip (next to "REFRESH"). Default lens: ownership.
- When a node is double-clicked, navigate to `/p/:id/<fqid>`, exiting graph view. This is the bridge back to detail.
- The peek drawer is reused: graph view's detail rail shows the same entity content (smaller version), and clicking a code anchor opens the same Monaco peek panel on the right.

Keep the existing `PeekProvider` context wrapping the graph view so peeks persist if the user toggles between graph and detail. The Light Table moment must survive view changes.

## Implementation order (suggested)

1. **Day 1 — Plumbing**.
   - Add `elkjs` dep, set up a Web Worker for layout.
   - Add `/p/:id/graph` route, scaffold `GraphPage` component that loads the same `LexiconResponse` as `ProjectPage` and renders a placeholder div.
   - Add the view toggle in `ProjectShell`'s top strip.

2. **Day 2 — Ownership lens, no edges**.
   - Convert `ResolvedGraph` into `{ children: [...] }` for ELK (contexts → child terms / invariants / etc.).
   - Render ELK output as SVG: outlined rectangles for contexts, smaller rectangles for nested entities. Use Fraunces for labels, Plex Mono for IDs underneath.
   - Pan + wheel-zoom (use `d3-zoom` or hand-roll SVG transform).

3. **Day 3 — Edges**.
   - Add `disambiguates-from`, `seam`, `boundary-rule` edges to the ELK input.
   - Render edges per the aesthetic spec (solid oxide / dashed vellum / arrow at target).
   - Style ADRs as separate floating cards (use a second ELK layout pass for the ADR cluster, render alongside).
   - Render `affects` edges as dotted saffron lines.

4. **Day 4 — Interactivity**.
   - Click → select, populate detail rail.
   - Hover → highlight neighbors (CSS class toggles, no animation).
   - Double-click → navigate to detail page.
   - Keyboard shortcuts (`g`, `esc`).

5. **Day 5 — Filters and lenses**.
   - Filter bar across the top. Entity-kind toggles, context multiselect.
   - Add the **Decisions** lens (timeline of ADRs with supersession chains).
   - Add the **Surfaces** lens.

6. **Day 6 — Polish**.
   - Adjust ELK layout options until the ownership lens reads cleanly.
   - Grain overlay on canvas.
   - Empty / loading / error states match the editorial aesthetic.
   - Smoke test in browser with the sample-lexicon project.

You can compress this into 2–3 actual sessions if you batch related work, but the order matters — get the static layout right before adding interactivity.

## Files you'll touch / create

```
viewer/
  package.json                                ← add elkjs
  client/src/
    pages/
      GraphPage.tsx                           ← new
    components/
      graph/
        GraphCanvas.tsx                       ← new — SVG canvas with pan/zoom
        GraphNode.tsx                         ← new — node rendering per kind
        GraphEdge.tsx                         ← new — edge rendering per kind
        GraphFilterBar.tsx                    ← new — top filter strip
        GraphLensSelector.tsx                 ← new — radio for ownership/decisions/surfaces
        GraphDetailRail.tsx                   ← new — compact detail panel for selected node
      ProjectShell.tsx (existing, in ProjectPage.tsx)
                                              ← add view toggle, route to GraphPage
    lib/
      graph/
        elk-worker.ts                         ← new — worker shim for ELK
        build-graph.ts                        ← new — ResolvedGraph → graph model per lens
        layout.ts                             ← new — graph model → ELK input/output
    styles/
      index.css (existing)                    ← add graph-specific classes if needed
    App.tsx (existing)                        ← add /p/:id/graph route(s)
```

The backend doesn't need changes for v0 of Path B — all the data is already served by `/api/projects/:id/lexicon`.

## Aesthetic reference points (worth a look before coding)

- **Edward Tufte's *Envisioning Information*** — small multiples, layered structure, the principle that "above all do no harm" applies to visualization.
- **Bret Victor's *Up and Down the Ladder of Abstraction*** — how to let users move between concrete examples and abstract structure.
- **The Light Table IDE (Chris Granger, c. 2014)** — the peek mechanism. Already inspired the Monaco peek in v0; the graph view should preserve that "everything is at your fingertips" feel.
- **The original DDD context map** (Eric Evans, blue book) — bounded contexts drawn as outlined regions with the relationship types named on the edges. The graph's ownership lens should evoke this on first glance.

## Things to be careful about

1. **Compound graphs are not trees.** A term in one context can be referenced from another via `disambiguates-from`. Edges cross container boundaries. ELK handles this, but make sure your rendering does too — edges may pass through container outlines.

2. **The system root's cross-cutting entries.** Don't accidentally render them as orphans floating in space. They should sit in a labeled "Cross-cutting" pseudo-container alongside the bounded contexts.

3. **Large `affects` sets.** Some ADRs touch many entities. Their edges will fan out visually. Consider rendering long fans as a clustered glyph (ADR with a `+12` badge that expands on click) instead of drawing all the lines.

4. **Sample-lexicon scale vs real-project scale.** Develop on `viewer/sample-lexicon` (50 entities) but pause to mentally model a real project of 300+ entities. Make sure your layout choices scale — for very large graphs, you probably want to collapse contexts to their headers and only expand on demand.

5. **The `Welcome` view fallback in `ProjectShell` currently renders when no `activeFqid` is set.** The graph view replaces that for the `/graph` route. Don't accidentally render both.

6. **Server file-reading clamps paths to project root.** If your graph adds new code-anchor opening flows, route them through the existing `api.fetchFile` / `usePeek` infrastructure. Don't bypass — the path clamp is a real safety check.

7. **`@monaco-editor/react` loads Monaco from a CDN by default.** This is a known v0 limitation. Don't introduce additional CDN dependencies in the graph view; everything else should be local.

8. **The aesthetic is the differentiator.** A correct-but-generic graph will feel like a downgrade from the detail view, because the detail view's typography and layout are doing real work. Spend disproportionate time on edge styling, node typography, hover-state subtlety. If something looks "fine" but not "designed," push it further.

## How to verify when you're done

1. Run `bun dev` from `viewer/`, open `http://localhost:8787`, click into the sample project.
2. Toggle to graph view. The ownership lens should show four bounded-context containers (Cold Layer / Hot Layer / Session Artifacts / Design System) plus a Cross-cutting container, with ~30 nested nodes total. ADRs should float outside with dotted edges to affected terms.
3. Hover on the **Component** term (in Design System). Its `disambiguates-from` edge to **Term** (in Cold Layer) should highlight; everything else should dim.
4. Click on **ADR-0003**. The detail rail should show "Remove proposal staging and session sharding" with status / affects / source.
5. Switch to the Decisions lens. ADRs should arrange in a vertical timeline; ADR-0005 should show a supersession arrow to ADR-0000 (which doesn't actually exist in the sample — sanity check that the missing-target case renders gracefully as a dangling stub or filtered-out).
6. Switch to the Surfaces lens. Skill Bundle should appear with its five regions nested inside.
7. Press `escape` from any lens. Should return to detail view (last-visited entity or the project welcome).

## Caveats from the v0 viewer that may bite you

- **Region owner label currently says "cross-cutting"** instead of resolving to its parent surface. Small bug; might want to fix in passing while building the detail rail. See `viewer/client/src/components/EntityDetail.tsx`.
- **Sidebar entity names truncate** when long. The graph view nodes will face the same problem; pick a truncation strategy (ellipsis + title tooltip) and apply it consistently.
- **The `.last-crystallized` marker is unused in the viewer.** Future work: visualize "what's pending crystallization" — entities mentioned in retros since the marker, not yet in the YAML. Out of scope for Path B v0 but worth keeping in mind.

## Where to ask for clarification

If anything in this brief is ambiguous to you (the agent picking this up), ask the user before guessing. The aesthetic decisions especially are not commodity — the user has strong opinions and pushed back hard during the v0 build. Surface unknowns rather than improvising.

## Done state

The graph view ships when:

- All three lenses render the sample lexicon cleanly at first paint.
- Selection / hover / double-click interactions work.
- Filter controls behave (toggle off a kind → those nodes disappear and edges reflow).
- The aesthetic reads as "extension of the existing viewer," not "bolted-on graph component."
- A smoke test on a hypothetical 300-entity project (you can synthesize one by duplicating the sample) doesn't make layout take more than ~1 second.
- A `CHANGELOG-VIEWER.md` (or addition to viewer's `README.md`) documents the graph view, its keyboard shortcuts, and the three lenses.

Path B is then complete and lexicon-viewer ships v0.1.

## See also

The graph view is one of several "maxx the visualization" paths. Sibling plans:

- **[Drift indicators](../drift-indicators/spec.md)** — continuous code↔doc anchor validation, status pills, project-level health.
- **[Pending crystallization](../pending-crystallization/spec.md)** — surface the gap between retros (forward-flow drift) and the user pulling `lex-crystallize`.
- **[Search palette](../search-palette/spec.md)** — Cmd-K palette across all entity prose.
- **[Git history](../git-history/spec.md)** — render git history of any entity inline, with ADR status timelines.
- **[Polish bundle](../polish-bundle/spec.md)** — papercut fixes bundle (region owner, self-host Monaco, FS watcher, hover-expand truncated names).

See **[the plans index](../README.md)** for the full list and how the paths compose.
