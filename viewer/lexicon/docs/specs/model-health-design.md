---
status: proposed
created: 2026-06-27
updated: 2026-06-27
scope: viewer/server (new model-health.ts, schema/loader edge-provenance, /api endpoint); skills/lexicon/validators/ (standalone agent-callable check); skills/lexicon/subcommands/validate.md (wire deterministic pass)
context: viewer
---

# Model Health — make the cold layer mechanically checkable

The keystone of the manifesto. Today the cold layer is *prose trusted*: a `<code-anchor symbol=>` is parsed and stored but never verified, the six structural checks are interpretive, and `skills/lexicon/validators/` is empty. Meanwhile the viewer already owns a deterministic code-intel backend (tree-sitter structure + LSP call-flow, multi-root, health-gated) that can resolve symbols and derive edges — but it feeds *only* the graph view. Model Health closes that gap: one deterministic pass that turns "trust me, this anchor is real / this boundary holds" into a checkable fact.

This is the piece that makes the whole bet self-reinforcing. The code lens is domain-selective — it renders nothing without a curated node set — and the node set depends on a manual anchoring discipline nobody keeps because anchors rot silently. A mechanical check makes anchoring *verifiable*, which makes it *worth doing*, which fills the node set, which makes the lens (and every other manifesto feature) render.

## Motivation

Four facts about the model can be checked mechanically, and none are today:

1. **Does each anchor still resolve?** `CodeAnchor` carries `{file, symbol?, lineStart?, lineEnd?}` (`server/schema.ts:34`). The symbol is the durable identity; line numbers are a cache that rots (Decision 2 of `code-lens-design.md`). Nothing confirms the symbol still exists in the file.
2. **Do the derived edges contradict the declared model?** The backend derives `extends/implements/uses/calls` edges (`server/code-intel.ts`, `server/call-flow.ts`); the cold layer declares `<seam kind=>` and `<boundary-rule from to>`. The diff between them — code crosses a boundary with no seam, a `separate-ways` violated, a seam declared with no code behind it — is check #4 made deterministic, and the unique artifact no IDE can produce because no IDE has the declared half.
3. **Which atoms earn their place?** An atom with a code-mapping category but no anchor, or an anchored atom with no derived edge and no inbound reference, is a label spending the cold layer's ~500-line attention budget without pulling weight.
4. **What is the provenance of each edge?** Manifesto idea H wants edge confidence (tree-sitter vs LSP-resolved vs degraded/name-matched). `CodeEdge` (`server/schema.ts:368`) is `{source, target, kind}` — it drops this, so a fan-out name-match edge is indistinguishable from an LSP-confirmed one. Anchor health and contradiction confidence both need it.

## Decision 1 — One deterministic pass, four checks, advisory not authoritative

Model Health is a single backend module (`server/model-health.ts`) producing a typed `ModelHealthReport`. It is **advisory**: the loader (`server/loader.ts`) remains the source of truth for structural validity (this answers the standing open question in CLAUDE.md — advisory, faster cross-check). The pass reuses the existing backend (`anchorsFromGraph`, the supervisor's `goToDefinition`, tree-sitter declaration extraction) — it adds analysis, not a new code-intelligence stack.

```typescript
interface ModelHealthReport {
  anchors: AnchorFinding[];      // dangling | drifted | healthy
  contradictions: Contradiction[]; // boundary-leak | separate-ways-violation | acl-bypass | unsupported-seam
  deadWeight: DeadWeightFinding[]; // atom not pulling weight
  generatedAt: string;
}
```

## Decision 2 — `CodeEdge` gains `provenance`; this is the one type change, and it is additive

⚠ **Touches the foundation type.** `CodeEdge` becomes:

```typescript
interface CodeEdge {
  source: string;
  target: string;
  kind: "extends" | "implements" | "uses" | "calls";
  provenance: "tree-sitter" | "lsp" | "degraded"; // NEW
}
```

`tree-sitter` = syntactic structure edge; `lsp` = LSP-resolved (disambiguated structure or call-hierarchy `calls`); `degraded` = name-match fan-out where no provider resolved (the D3 ceiling). Additive and low-blast-radius, but it threads through `code-intel.ts`/`call-flow.ts` (set it at emit), `loader.ts` (`graph.codeEdges`), the `/code-edges` endpoint, `build-graph.ts` (`GraphEdge` may surface it as styling), and `code-intel.test.ts`. **Not a cold-layer schema bump** — `CodeEdge` is a derived in-memory/wire type, never serialized to XML, so no migration delta and no `SCHEMA_VERSION` change. The curation/derivation split (Decision 2 of `code-lens-design.md`) is preserved: provenance describes *derivation*, never enters the curated layer.

## Decision 3 — Two providers, one output schema (honors D6)

`code-lens-design.md` Decision 6 mandates two consumers with two providers: the viewer server owns its code-intel; the agent must not depend on the viewer process running. Model Health respects this with **two entry points sharing the `ModelHealthReport` schema**:

- **Viewer:** `GET /api/projects/:id/model-health` reuses `server/model-health.ts` and the live supervisor. Feeds the read-only Model Health view (see `model-code-overlay-design.md`).
- **Agent:** a standalone script in `skills/lexicon/validators/` (the dir's first real occupant) the agent runs via Bash during `validate`/`crystallize`. It is tree-sitter-only by default (the spike proved tree-sitter runs with zero env), so it works without a provisioned LSP; LSP-dependent checks (call-edge contradictions) degrade to "not checked," never to silently-wrong.

Sharing *code* between viewer/server (bun/TS) and `validators/` (standalone) is desirable but not required for v0; sharing the *output schema and section format* is required so both write the same report shape.

## Decision 4 — Anchor resolution: symbol is identity, lines are a cache

For each `<code-anchor symbol=>`: confirm a declaration of `symbol` exists in `file` (tree-sitter declaration scan; LSP `goToDefinition`/`documentSymbol` when available). Classify:

- **healthy** — symbol found; if `lineStart/lineEnd` present and stale, emit a `drifted` sub-flag with the corrected range (a cache refresh, not an error).
- **drifted** — symbol found in a *different* file than declared (moved), or line range materially off.
- **dangling** — file missing, or symbol not found anywhere resolvable. The silent-rot case `schema.md` warns about, now loud.

Anchors with no `symbol=` (file-only) are checked for file existence only.

## Decision 5 — Boundary contradiction is a join over (derived edges × declared seams)

For each derived `CodeEdge` whose endpoints' `ownerContextId` differ (cross-context), look up declared `<seam>` / `<boundary-rule>` between those two contexts and classify:

| Finding | Condition |
|---|---|
| `boundary-leak` | cross-context edge exists, **no** seam or boundary-rule between the contexts |
| `separate-ways-violation` | a seam `kind="separate-ways"` exists, yet edges cross |
| `acl-bypass` | an `anticorruption-layer` seam exists, but the edge bypasses the ACL module (target ≠ the ACL's owning module) |
| `unsupported-seam` | a seam is declared, but **no** derived edge supports it (stale/aspirational boundary) |

Confidence rides on edge `provenance`: an `lsp` `calls` edge crossing a `separate-ways` boundary is high-confidence; a `degraded` name-match is flagged as *possible*. **Most cross-context edges are fine** — only contradictions against a *declared* rule surface. This is the "items deliberately not flagged" discipline made structural.

## Decision 6 — Dead-weight is conservative; concept terms are exempt

A `<term category="concept">` legitimately has no code anchor (CLAUDE.md). Dead-weight applies only to code-mapping categories (`entity|value|service|event`) and to anchored atoms:

- **unanchored-code-term** — category ∈ {entity,value,service,event} with no `<symbols>`.
- **orphan-atom** — anchored, but no derived edge touches it **and** no inbound `[[ref]]`/`narrativeRef` points at it. A node with no graph presence at all.

This polices *under*-selectivity (atoms that don't pull weight), the inverse of node-set explosion. Conservative by design — false-positiving a real concept as dead-weight erodes trust faster than missing one.

## Decision 7 — Output matches the existing report grammar

The agent-side script appends a **`## Model health`** section to `lexicon/validate.md` (whose structure is fixed in `validate.md:195`), with sub-sections `### Anchor resolution`, `### Boundary contradictions`, `### Dead weight`, and the mandatory `### Items deliberately not flagged`. `validate`'s structural pass runs this script *first* and short-circuits the semantic pass's heuristic anchor-grep with the deterministic result. Findings are **never auto-applied** — they go to the user as triage, and corrections route through `crystallize` (preserving Rule 6 and the read-only/terminal split).

## ⚠ Foundation contradictions

- **Viewer must not become an editor.** The Model Health *view* shows findings and may render a *suggested* `crystallize` mutation as copy-paste text, but never applies it — `read-only` invariant (`viewer-vocabulary/invariant/read-only`) and the terminal-owned crystallize split hold. Resist any "fix it here" button.
- **Do not let the backend write atoms.** Boundary contradictions can *suggest* a `seam kind="unknown"`, but creating the atom is a `crystallize` mutation the human confirms — Rule 5 / Decision 2 of `code-lens-design.md`.
- **`CodeEdge.provenance` is the only type change** and is non-serialized; if a future iteration is tempted to persist provenance or edges into XML, that is the code-mirror Decision 2 forbids.

## Phasing

| Phase | Deliverable | Gate |
|---|---|---|
| **P0** | `CodeEdge.provenance` threaded end-to-end; `code-intel.test.ts` asserts provenance per tier. | Existing graph unbroken; every edge carries provenance. |
| **P1** | Anchor resolution check in `server/model-health.ts` + `/api/.../model-health`; standalone `validators/anchor-health.ts`. | On the honeywell seed: dangling/drifted/healthy classified; a deliberately-broken anchor in a test fixture is caught deterministically. |
| **P2** | Boundary-contradiction join + dead-weight check. | A planted cross-context leak in the honeywell seed surfaces as `boundary-leak`; a declared-but-unsupported seam surfaces as `unsupported-seam`. |
| **P3** | `validate.md` wiring (run script first, short-circuit heuristic anchor pass, append `## Model health`). | `validate` on the honeywell seed emits a deterministic Model health section. |

## Risks & open questions

- **Noise on a real repo.** honeywell has many cross-context edges; without the declared-rule filter the contradiction list explodes. The filter (only flag against a *declared* rule) is the trim discipline — verify it holds at honeywell scale.
- **Concept false-positives.** Dead-weight must exempt `category="concept"`; watch for entity-category terms that are genuinely abstract.
- **LSP unavailability at the agent.** The `validators/` script is tree-sitter-only; call-edge contradictions are viewer-only until/unless the agent gets a provisioned LSP. State this in the report ("call-flow contradictions: not checked (no LSP)") rather than implying coverage.
- **Shared code vs duplication** between viewer/server and `validators/`. v0 shares the schema only; revisit if drift between the two implementations bites.

## Vocabulary to crystallize

New terms for the viewer cold layer at completion: *model health*, *anchor resolution* (healthy/drifted/dangling), *boundary contradiction* (the four kinds), *edge provenance*, *dead weight* (unanchored-code-term / orphan-atom). Noted for `crystallize`.
