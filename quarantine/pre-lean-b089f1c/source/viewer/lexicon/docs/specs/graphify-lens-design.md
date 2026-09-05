---
status: draft
created: 2026-07-15
updated: 2026-07-15
scope: viewer/server (graphify artifact endpoint); viewer/client (new graph lens / pane)
context: viewer
source: repivot of laxicon/specs/graphify-adoption-design.md (curation-feed direction refuted 2026-07-15; this spec takes the untested display direction)
---

# Graphify lens — the territory graph as a first-class viewer surface

Surface graphify's extracted symbol graph (`graphify-out/graph.json`) directly on the lexicon viewer as a dedicated, optional lens — starting with code-symbol relationships (calls, imports, extends, contains) — and gradually incorporate the parts that earn their place. Graphify stays an artifact the viewer *reads*, never a toolchain the viewer *runs*.

## Motivation

The prior exploration (`laxicon/specs/graphify-adoption-design.md`) tested graphify as an **invisible curation feed** — communities seeding bounded contexts at bootstrap, graph deltas ranking drift for crystallize — and refuted both by measurement (0/6 contexts recovered, delta strictly worse than the git diff). What that run never tested is **display**: whether a human browsing the viewer benefits from seeing the territory graph itself.

There is a real gap for it to fill. The viewer's existing code lens is deliberately domain-selective: it renders only the symbols the cold layer pins via [[kernel/viewer-vocabulary/code-anchor]], with edges resolved by the LSP tier — precise, curated, and by design blind to the other 95% of the codebase. The cold layer is the map; nothing in the viewer shows the **territory** — the raw module/symbol relationship graph a newcomer orients in before any curation exists. Graphify produces exactly that, deterministically and cheaply: `graphify extract . --code-only` gave 767 nodes / 1,651 edges / 50 communities on `viewer/` in 4.0s and 24,932 / 49,720 / 1,034 on the honeywell workspace in 47s — tree-sitter only, zero LLM, zero API key, ~40 languages. The two artifacts are complementary altitudes, not competitors: the code lens answers *"how do the domain-significant classes relate?"*; the graphify lens answers *"what is actually there, and what touches what?"*

The measured numbers from the refuted direction remain binding as *constraints* here — they tell this spec what the lens must not pretend the graph is good for (contexts, drift ranking, resolution-grade call edges).

## Decision 1 — A sibling lens at module altitude; the code-intel stack is untouched

The graphify lens is a new, separate lens alongside the existing [[graph-model/lens]] set — it does not feed, merge into, or replace the code lens. The prior spec's Decision 1 (keep the viewer's tree-sitter + LSP code-intel stack) was *confirmed* by measurement: graphify reproduced 0/5 of the viewer's authoritative domain edges because it operates at module-dependency altitude while the code lens renders domain type-composition and LSP-resolved calls. Same reason, opposite consequence: because the altitudes don't overlap, the territory graph deserves its own surface instead of contaminating the curated one.

**Rejected — merging graphify edges into the code lens as a lower-confidence tier.** That was the deferred Decision 5 (provenance tier) of the old spec. The 0/5 altitude mismatch means merged edges would mostly be noise at the code lens's altitude, and graphify's confidence tags can't gate them: AST name-matched calls are stamped `EXTRACTED` even when the target name is ambiguous (22% of honeywell `calls` edges), so the tag is not a resolution signal. Cross-linking (Decision 5 below) is the honest integration; edge merging is not.

## Decision 2 — Artifact-only, probe-and-absent; the viewer never runs graphify

The server consumes `<project-root>/graphify-out/graph.json` when it exists. When it doesn't, the endpoint reports not-present and the client renders an empty state with a one-line generation hint (`uv tool install graphifyy && graphify extract . --code-only`). The viewer never shells out to the graphify CLI, never imports graphify internals, and gains no Python dependency — graphify absent, the viewer behaves exactly as today. This is the old spec's Decision 2 carried forward unchanged, and it mirrors how the LSP tier already degrades ([[context/graph-model]] health-gates it rather than requiring it).

Generation and refresh are the *user's* moves, run in their shell. When the artifact is stale the viewer says so (Decision 4) but does not fix it. One operational rule surfaces in the hint and any future docs: **refresh by re-running `extract`, never `update`** — measured, `graphify update` ignores `--code-only` and re-adds markdown/doc nodes, collapsing code-delta precision from 0.821 to 0.069.

**Rejected — server-side invocation ("generate" button).** Puts a Python toolchain + 40 grammar wheels on the render path — the exact dependency-weight objection that shaped the old Decision 1. **Rejected — embedding graphify's own `graph.html` in an iframe.** Zero integration: no shared peek, no theme, no [[kernel/viewer-vocabulary/fqid]] resolution, no filtering discipline; it would be a bookmark wearing a pane's clothes.

## Decision 3 — Server endpoint with server-side neighborhood extraction, fail-fast parsing

New endpoint family alongside `/api/projects/:id/lexicon`:

- `GET /api/projects/:id/graphify` → presence probe + summary: node/edge/community counts, relation-kind histogram, artifact mtime vs latest git commit time (staleness), and load warnings.
- `GET /api/projects/:id/graphify/neighborhood?node=<id>&hops=<n>&relations=<csv>` → the k-hop induced subgraph around a node, filtered by relation kind, with a hard result cap.
- `GET /api/projects/:id/graphify/search?q=` → label/norm_label match over nodes, capped, for the entry-point picker.

Neighborhood extraction is server-side because the artifact does not fit the wire at workspace scale: honeywell's graph is ~25k nodes / ~50k edges, and shipping the whole node-link JSON to the browser to filter there is both slow and against the anti-exhaustiveness discipline. The server parses `graph.json` once per mtime (same shape as [[lexicon-loading/mtime-cache]]), builds an adjacency index in memory, and answers subgraph queries from it.

Parsing is minimal zod over the NetworkX node-link shape actually observed — nodes `{id, label, source_file, source_location, community, norm_label}`, edges under `links` as `{source, target, relation, confidence}` — and **fail-fast**: a malformed or unrecognized `graph.json` is a hard load error surfaced as a warning-bearing "present but unreadable" response, not a silent empty graph. Known artifact defect handled at load: graphify mints node IDs from path+name and collides on pairs like `env.py` / `_env.py` (12 nodes silently dropped on honeywell); the loader can't recover the dropped nodes but must count and surface the collision warnings rather than pretend the graph is complete.

## Decision 4 — Client starts with neighborhood browsing, never the hairball

The lens opens on a search/entry-point picker (seeded with the highest-degree nodes as suggestions), and renders the k-hop neighborhood of the chosen node with relation-kind filters (`calls`, `imports`, `contains`, `extends`/`implements`, `references`). Expansion is click-driven, one hop at a time, with a visible node cap. It reuses the existing graph substrate — ELK layout, plain-SVG nodes, the lens plumbing in `viewer/client/src/lib/graph/build-graph.ts` — as a new lens whose builder consumes the neighborhood endpoint instead of the [[lexicon-loading/resolved-graph]]. Graphify nodes get their own node kind and visual treatment so they are never mistakable for cold-layer atoms.

Display caveats baked in from the measurements: **communities are decoration, not identity** — Louvain community IDs renumber globally on every rebuild (113 → 150 across one update), so they may tint node backgrounds per render but never key colors, filters, or saved UI state. **Confidence tags are shown as provenance, not trusted as resolution** (Decision 1's 22% ambiguity number). **Staleness is a badge**: artifact mtime older than the latest commit renders a "graph is N commits behind" strip, with the re-extract hint.

**Rejected — rendering the full graph with progressive loading.** 25k nodes is a hairball at any zoom; graphify's own `graph.html` already exists for that experience and it is not orienting. The entire pitch of putting the territory in the *lexicon* viewer is selective traversal from a chosen point — the same anti-exhaustiveness rule the code lens enforces.

## Decision 5 — Gradual incorporation happens by cross-linking, gated per-part on real use

The "gradually incorporate what makes sense" tail, in increasing order of commitment — each phase gates on the previous one being used, not just built:

1. **Anchor → neighborhood jump.** From a cold-layer atom carrying a [[kernel/viewer-vocabulary/code-anchor]], a "view in territory" action opens the graphify lens centered on the node(s) whose `source_file` matches the anchor. Join is by file path (+ symbol name when it matches a node label); misses degrade to a file-level match or a plain "not in graph" notice.
2. **Neighborhood → atom back-link.** Graphify nodes whose file/symbol is claimed by a cold-layer anchor render a badge linking back to the owning atom — the territory view showing where the map has coverage. This is also an honest coverage visualization: sparse badges over a dense neighborhood is a signal the cold layer under-describes that area.
3. **`rationale_for` surfacing (the one GO from the old exploration).** Graphify's docstring/comment-derived `rationale_for` edges (5,740 on honeywell) carry real architectural "why" under heavy boilerplate. Surface them read-only in the atom dossier for anchored files, as *candidate* rationale a human may lift via `crystallize`'s `add-rationale` — never auto-written (Rule 5).

**Rejected — any write path from this lens into the cold layer.** Graphify vocabulary (node labels, community names, relation kinds) stays quarantined from the ubiquitous language; the lens is read-only territory display, consistent with [[kernel/viewer-vocabulary/invariant/read-only]]. If territory browsing keeps revealing vocabulary the cold layer lacks, that flows through the normal human-triggered `crystallize`, not through the lens.

## Phasing

| Phase | Delivers | Gate |
|---|---|---|
| P0 | Server: probe + summary endpoint, mtime-cached parse, collision/staleness warnings | Parses viewer + honeywell artifacts; malformed JSON fails loud; absent → clean not-present |
| P1 | Client: graphify lens — entry picker, k-hop neighborhood, relation filters, node cap, staleness badge | Orienting in a codebase via the lens beats opening graphify's `graph.html`; used more than once after novelty |
| P2 | Cross-link: anchor → neighborhood jump; node → atom back-link | The jump gets used during real ground/validate sessions, not just demos |
| P3 | `rationale_for` candidates in the atom dossier (read-only, filtered) | Signal-to-boilerplate after filtering is worth the dossier space; at least one candidate actually crystallized |

## Risks / open questions

- **Staleness is chronic, not incidental.** Nothing regenerates the artifact automatically, so the graph will usually be somewhat behind the code. The staleness badge makes it honest; whether users tolerate a habitually-stale territory view is the real P1 question.
- **Node identity across re-extracts.** IDs are path+name-derived, so renames and the collision defect mean a node the user was inspecting can vanish after a refresh. Treat every render as ephemeral; no persisted per-node UI state (unlike the manual layout the atom lenses enjoy).
- **Memory at workspace scale.** The honeywell adjacency index is ~50k edges — fine in Bun memory, but multi-project registries loading several large graphs may want an LRU on the parse cache.
- **Monorepo multi-root.** `graphify extract` per subfolder + `merge-graphs` is graphify's own answer to collisions; the viewer just reads whatever single `graphify-out/graph.json` sits at the project root. Whether to probe nested `graphify-out/` dirs is deferred until a real project needs it.
- **Vocabulary pressure.** "Territory" / "graphify lens" are used here descriptively and are not cold-layer atoms yet; if the feature lands, `crystallize` should mint the terms (candidate: a `graphify-lens` term under [[context/graph-model]]).
