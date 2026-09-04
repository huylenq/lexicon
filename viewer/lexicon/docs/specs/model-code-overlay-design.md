---
status: proposed
created: 2026-06-27
updated: 2026-06-27
scope: viewer/client (graph overlay mode, contradiction highlighting, anchor-health badges, per-atom dossier panel); consumes /api model-health + code-edges
context: viewer
---

# Model↔Code overlay — the read-only comprehension surface

The viewer already renders two edge layers over the **same fqid node identity**: the `ownership` lens (declared conceptual edges — `disambiguates`, `seam`, `narrative`) and the `code` lens (derived execution edges — `extends/implements/uses/calls`). Decision 5 of `code-lens-design.md` got cross-lens linking for free by sharing node identity. The unbuilt high-value piece is the **diff between the two graphs**: where the curated model and the derived reality align, and — more interesting — where they don't. This is manifesto ideas C/D/I/H realized as one interactive read-only surface, sitting on top of the deterministic `model-health-design.md` pass.

## Motivation

The contradiction surface is the actual product (per the brainstorm thesis): no IDE produces it because no IDE has the declared half. The deterministic pass *computes* contradictions; this spec *renders* them where a human is already looking — on the graph, on the node, in the atom's detail. Three things are invisible today and shouldn't be:

1. **Conceptual vs execution divergence.** A declared `seam` with no code behind it; a heavy `calls` cluster crossing a boundary with no declared seam. Both lenses exist; the overlay is the comparison.
2. **Anchor health on the node.** A node whose anchor dangles looks identical to a healthy one.
3. **The full story of one atom.** Clicking an atom should show its definition, its anchors (healthy/drifted/dangling), its derived edges in/out with provenance, the contradictions it participates in, and recent commits touching its anchored files (manifesto idea E, "concept-to-code trace").

## Decision 1 — Overlay is a mode on the code lens, not a fourth lens

The code lens already merges `graph.codeEdges`. Add an **overlay toggle** that, when on, also draws the ownership lens's conceptual edges over the same nodes, visually distinct (conceptual = hairline/dashed per the editorial aesthetic; execution = solid, weighted by provenance). This reuses `buildModel` for both edge sets over one node set rather than introducing a new lens with its own layout. A new top-level lens would duplicate node layout and fight the shared-identity property that makes the comparison meaningful.

**Rejected — a combined "everything" lens by default.** Drawing all edge kinds at once is the worse-IDE failure mode. Overlay is opt-in and edge-kind-filterable (the existing `edgeFilter` already supports this).

## Decision 2 — Contradictions are an edge/region styling layer, fed by model-health

Consume `GET /api/projects/:id/model-health`. Render:

- **`boundary-leak`** — the offending execution edge drawn in the alert accent (oxide→red), labelled with the two contexts it crosses.
- **`separate-ways-violation` / `acl-bypass`** — same, with a distinct marker (the declared rule it breaks shown on hover).
- **`unsupported-seam`** — the declared seam edge drawn ghosted/struck-through (declared, no code behind it).

Confidence from edge `provenance`: `degraded` (name-match) contradictions render as *possible* (dotted alert), `lsp` as *confirmed* (solid alert). This keeps the surface honest about what's a real boundary breach vs a fan-out artifact.

## Decision 3 — Anchor-health badges on nodes

Each node shows a small health glyph from model-health's `anchors`: healthy (none / subtle), drifted (amber, "anchor moved"), dangling (red, "anchor broken"). A node anchored to a vanished symbol is the single most actionable signal in the whole viewer — it means the curated model has silently fallen out of sync with code.

## Decision 4 — Per-atom dossier panel (manifesto E)

Clicking any node opens a dossier (reuse/extend the existing detail pane) that assembles, read-only:

- defining prose (`definition`/`statement`) + `rationale`
- anchors with resolution status (from model-health) and a peek link (existing `PeekDrawer`)
- derived edges **in and out**, grouped by kind, each tagged with provenance
- contradictions this atom participates in
- recent commits touching the anchored files (`git log -n … -- <files>` via a small server endpoint) — the "historical scar" the manifesto wants
- a **suggested `crystallize` action** as copy-paste terminal text when the atom is unhealthy (e.g. "anchor drifted → run `crystallize`, propose `add-anchor …`"). Copy-paste, never apply.

## Decision 5 — Everything stays read-only; corrections route to the terminal

⚠ The dossier's "suggested action" is **text the user copies into their terminal**, not a button that mutates anything. This is the load-bearing `read-only` invariant and the terminal-owned crystallize split. The viewer surfaces *what is wrong* and *what to type*; `crystallize` (with full conversational context) decides and applies.

## ⚠ Foundation contradictions

- **Manifesto idea G ("crystallization diff UI in the viewer") is deferred — it contradicts the architecture as built.** A live preview of a pending crystallization would require the viewer to see the in-flight proposal, which exists only in the terminal conversation; there is no channel between them, and building one would pull the viewer toward write-adjacent territory the `read-only` invariant forecloses. The dossier's copy-paste suggestion is the honest substitute. Revisit only if crystallize ever moves out of the terminal (a trigger already noted in the viewer's `deliberate-omission` for in-viewer editing).
- **Surfaces lens edges are still stubbed** (`build-graph.ts:344`). The overlay targets the ownership↔code comparison; surfaces overlay is out of scope here.

## Phasing

| Phase | Deliverable | Gate |
|---|---|---|
| **P0** | Overlay toggle: conceptual + execution edges over one node set, visually distinct, edge-kind filterable. | On the honeywell seed, both edge layers render together without layout thrash. |
| **P1** | Contradiction styling from `/model-health`; provenance-weighted confidence. | A planted boundary leak shows as a red cross-context edge; an unsupported seam shows ghosted. |
| **P2** | Anchor-health badges on nodes. | A deliberately-broken anchor shows a red node glyph. |
| **P3** | Per-atom dossier (anchors+status, in/out edges+provenance, contradictions, recent commits, copy-paste suggestion). | Clicking an atom on the honeywell seed shows its full trace; suggestion is copy-paste only. |

## Risks & open questions

- **Visual overload.** Two edge layers + contradiction styling + badges on a honeywell-scale graph can become unreadable. The selectivity discipline (small curated node set) is the mitigation; if the seed is well-trimmed the overlay stays legible.
- **Aesthetic.** Contradiction/alert styling must extend the editorial-meets-blueprint identity (`editorial-aesthetic` invariant), not bolt on a generic red. The accent already exists (oxide); push it, don't import a warning palette.
- **Git endpoint cost.** Recent-commits-per-atom should be lazy (on dossier open), cached per file set.

## Vocabulary to crystallize

*overlay mode*, *contradiction styling*, *anchor-health badge*, *atom dossier*. Noted for `crystallize`.
