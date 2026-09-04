# Graphify lens — execution plan

**Started:** 2026-07-15 · **Status:** draft
**Spec:** [../../specs/graphify-lens-design.md](../../specs/graphify-lens-design.md) — the territory graph (`graphify-out/graph.json`) as a dedicated, optional viewer lens. Artifact-only, read-only, module altitude, never merged into the code lens.

## P0 — Server: presence probe + summary endpoint, mtime-cached parse, fail-fast

- [x] New `viewer/server/graphify.ts`: hand-rolled fail-fast parse of the NetworkX node-link shape (nodes `{id, label, source_file, source_location, community, norm_label}`, `links` as `{source, target, relation, confidence}`) — no zod, matching `loader.ts`'s hand-rolled validation idiom; malformed/unrecognized JSON → `{ status: "unreadable", error }`, never a silent empty graph.
- [x] mtime-cache the parse per `<project-root>/graphify-out/graph.json` mirroring `loader.ts`'s `Map<string, {mtime, …}>` pattern; build an in-memory adjacency + degree index once per mtime for k-hop queries.
- [x] Count and surface the path+name ID-collision defect (dangling edge endpoints = dropped nodes) as a load warning; compute staleness = artifact mtime + `built_at_commit` vs HEAD (git, best-effort, degrades to null off-repo).
- [x] Wire `GET /api/projects/:id/graphify` (probe + summary: node/edge/community counts, relation-kind histogram, staleness, warnings) into `viewer/server/index.ts` alongside the `/lexicon` route; absent artifact → `{ status: "absent" }`, no error.
- [x] Commit a small `graphify-out/graph.json` fixture under `viewer/test-fixtures/graphify/` (per-scenario subdirs: `small/`, `malformed/`, `absent/`); add `viewer/server/graphify.test.ts` (11 tests) covering parse, collision-count, staleness, fail-fast, absent, neighborhood, search.
- **Gate:** PASS — parses viewer-scale (802 nodes, 3ms) + honeywell-scale (24,932 nodes / 49,720 edges, 60ms); malformed fails loud; absent → clean not-present.

## P1 — Client: graphify lens (entry picker, k-hop neighborhood, relation filters, node cap, staleness badge)

- [x] Add `GET /api/projects/:id/graphify/neighborhood?node=&hops=&relations=&cap=&hideTests=` (k-hop induced subgraph, hard node cap + truncation flag; `hideTests` filters test-file nodes **before** the cap so tests don't eat the budget, and reports `hiddenTests` count) and `GET .../graphify/search?q=&cap=` (label/norm_label match, domain-degree-ranked, capped) in `graphify.ts` + `index.ts`.
- [x] New lens builder `viewer/client/src/lib/graph/graphify-lens.ts` (pure, unit-tested) mapping a neighborhood response → `GraphModel`; registered `"graphify"` in `LENSES` (`build-graph.ts`); added `imports`/`references` `EdgeKind`s + `EDGE_STYLE` styling; raw relations collapse to styling buckets, declared relation rides in the edge label.
- [x] Graphify nodes carry kind `"graphify"` (never an `EntityKind`) with a distinct treatment (dashed rounded rect, compact single-line mono label, hop fade, seed accent, `◆` coverage badge placeholder for P2) in a dedicated `GraphifyCanvas.tsx`. Source-file moved OUT of the always-rendered body (shown below the seed/selected node + a hover `<title>` on every node) to shrink the rect and ease overlap. Layout via a dedicated **two-pass `layoutGraphify`** in `layout.ts` — `stress` for shape then `sporeOverlap` for overlap removal (stress alone piled the wide label rects: measured 459 overlapping pairs on the invoke_agent 112-node star → **0** after sporeOverlap; radial was worse (3916 overlaps) and crashed on one seed).
- [x] `GraphifyLens.tsx` surface: entry-point picker (domain-ranked seeds — `topNodes` drops fileless builtins and ranks by domain-relation degree, excluding `contains` scaffolding, so the list reads as project symbols not stdlib god-nodes; captioned "Most-connected project symbols — pick one to explore its neighborhood") + label search (domain-degree-ranked, full match set), double-click one-hop re-seed, hops 1/2/3, **"hiding tests / showing tests" toggle (default ON, shows the hidden count)**, hard node cap + truncation notice, relation-kind filter toggles, staleness badge ("graph is N commits behind" + re-extract hint), absent/unreadable/empty states with generation hint `uv tool install graphifyy && graphify extract . --code-only`. Mounted from `GraphPage` (early return) + `Territory` entry in `GraphLensSelector`; api.ts methods + types added.
- [x] Node selection → detail rail → code peek. Clicking a node opens a graphify-flavored `GraphifyNodeRail.tsx` (distinct from the atom dossier: "TERRITORY NODE" header, dashed/mono) showing label + norm_label, source_file:location, degree (raw + domain), community (marked unstable, never identity), and a relation summary grouped by kind + direction with neighbor chips (click → select) and per-group confidence mix as muted provenance — fed by a new `GET /graphify/node` endpoint (`nodeDetail`, full-adjacency, not the induced subset). "Peek" reuses the shared `usePeek` → `PeekDrawer` (Monaco) machinery and the existing clamped `/file` read (no forked peek, no new raw read); `source_location` "L<n>" parsed defensively (`parseSourceLocation`), `source_file` normalized (`normalizeSourceFile` — dana-os paths are already project-root-relative). Empty source_file (builtins) → metadata-only rail, no peek. Comment-marked slots left for P2 (atom back-link) and P3 (rationale_for) to land in this rail.
- [x] Communities never key colors/filters/persisted state (not used as identity — hop drives emphasis instead); confidence carried as data, not a resolution signal; every render ephemeral (no persisted per-node state).
- **Gate:** orienting via the lens beats `graph.html`; used more than once — **pending user live-server verification** (client cannot be booted here; typecheck is green).

## P2 — Cross-link: anchor → neighborhood jump; node → atom back-link

- [ ] Add a "view in territory" action on cold-layer atoms carrying a `code-anchor` (in `AtomDossier.tsx`/atom UI) that opens the graphify lens centered on nodes whose `source_file` matches the anchor; join by file path (+ symbol name when it matches a node label), degrade to file-level or "not in graph".
- [ ] Render a back-link badge on graphify nodes whose file/symbol is claimed by a cold-layer anchor, linking to the owning atom; sparse badges over a dense neighborhood read as an honest coverage signal.
- **Gate:** the jump gets used during real ground/validate sessions, not just demos.

## P3 — `rationale_for` candidates in the atom dossier (read-only, filtered)

- [ ] Surface graphify `rationale_for` edges for anchored files read-only in `AtomDossier.tsx` as *candidate* rationale a human may lift via `crystallize`'s `add-rationale`; heavy boilerplate filter; never auto-written (Rule 5).
- **Gate:** signal-to-boilerplate after filtering is worth the dossier space; at least one candidate actually crystallized.

## Standing constraints

- Artifact-only: the viewer never shells out to the graphify CLI, imports graphify internals, or gains a Python dependency; graphify absent → the viewer behaves exactly as today.
- Fail-fast on malformed/unrecognized `graph.json`: hard load error surfaced as a warning, never a silent empty graph.
- Refresh guidance is always re-extract (`graphify extract . --code-only`), never `graphify update` (`update` ignores `--code-only`, collapsing code-delta precision 0.821 → 0.069).
- Louvain community IDs renumber globally every rebuild — communities are decoration only; never key colors, filters, or saved UI state on them.
- No write path from this lens into the cold layer; every crystallize-candidate flows through the normal human-triggered `crystallize`.
- Graphify vocabulary (node labels, community names, relation kinds) stays quarantined from the ubiquitous language; "territory"/"graphify lens" are descriptive, not cold-layer atoms until `crystallize` mints them.
- Treat every render as ephemeral — node IDs are path+name-derived, so renames and the collision defect can vanish an inspected node after refresh; no persisted per-node UI state.

## Out of scope

- Full-graph / hairball rendering with progressive loading (25k nodes is not orienting; that is what graphify's `graph.html` is for).
- Server-side graph generation (a "generate" button putting the Python toolchain on the render path).
- Merging graphify edges into the code lens as a lower-confidence tier (0/5 altitude mismatch; confidence tags are not a resolution signal).
- Probing nested `graphify-out/` dirs for monorepo multi-root; the viewer reads only the single artifact at project root, deferred until a real project needs it.
