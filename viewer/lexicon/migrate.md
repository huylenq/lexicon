# Migration report

## v0.1 → v0.2 detection sweep — 2026-05-14

Project was already on v0.2 (system + all 4 contexts + ADR-0001 on `"0.2"`;
3 surfaces still on `"0.1"`, which the loader accepts — surfaces gained no
v0.2-specific fields, so no schema bump was warranted). Chain was empty; the
orchestrator's "run the latest delta's detection phase anyway" pass surfaced
only minor prose drift.

### Lifted
- (none — no non-canonical top-level keys present)

### Formalized prose links
- (none — every entity reference in prose was already in `[[fqid]]` form;
  no `(→ slug)`, `(see slug)`, or `cf. slug` shorthand survived)

### Narratives drafted
- (none — system, all 4 bounded contexts, and ADR-0001 already carry narrative)

### Enriched omissions
- (none — all 3 `deliberateOmissions` entries already carry `triggers` and
  `relatedAtoms`)

### Stale plan-file references rewritten
- `plans/graph-view/spec.md` → `plans/_archive/graph-view/spec.md`
  (graph-view plan has shipped and been archived). 3 occurrences:
  - `lexicon/system.yaml` — `crossCuttingInvariants/editorial-aesthetic.rationale`
  - `lexicon/contexts/graph-model.yaml` — `invariants/layout-deterministic.rationale`
  - `lexicon/contexts/design-system.yaml` — `invariants/peek-persists-across-surfaces.rationale`
- "The Path B graph view…" → "The graph view…"
  (`Path B` was a planning-era label; the graph view is now just the graph view).
  1 occurrence: `lexicon/decisions/ADR-0001-elk-plus-custom-svg.yaml`'s
  `context` prose.

### Schema bumped
- (none — all touched files were already on `"0.2"`)

### Unresolved / follow-up
- (none — no findings deferred)

## v0.2 → v0.3 DDD-faithful schema — 2026-05-14

Performed by the main agent during the v0.3 schema bump, then refined after
the round-1 validator caught Phase-4 short-circuits. This migration is
substantive (not just version-bump) and would normally run via `lex-migrate`
on a pilot project; here the bundle author migrated the viewer's own lexicon
directly so the viewer could self-render under the new schema.

### Archived
- 1 ADR archived under `lexicon/_pre-migrate-archive/decisions/`:
  - `ADR-0001-elk-plus-custom-svg.yaml` (preserved verbatim, schemaVersion "0.2")
- 0 ADR sections lifted into structured rationale fields; the ADR's
  decision-narrative content was absorbed into the prose `rationale:` block
  on the `editorial-aesthetic` invariant (in the viewer-vocabulary kernel)
  rather than split across multiple atoms.

### Shared kernels emitted
- `kernel/viewer-vocabulary` — 5 terms, 3 invariants, 4 participating
  contexts. A pragmatic kernel covering viewer-wide concepts (fqid format,
  code-anchor shape, read-only / single-project-active / editorial-aesthetic
  commitments); see kernel description for the strict-DDD caveat.

### Renames
- (none — no `modules: [<string>]` field present on any v0.2 bounded-context)

### Term categorization
- ~22 context-owned terms across 4 contexts, plus 5 kernel terms. Distribution:
  - lexicon-loading (6): 4 value (ResolvedGraph, ResolvedEntity, EntityRef, LoadIssue),
    1 service (ref-resolution), 1 concept (mtime-cache)
  - project-registry (3): 1 entity (Project), 1 value (project-root), 1 service (path-clamp)
  - graph-model (6): 5 value, 1 concept (affects-routing — deprecated)
  - design-system (7): all concept (UI primitives)
  - viewer-vocabulary kernel (5): 1 concept, 2 value, 2 concept

### Seam classification
- 1 seam classified: `graph-model/resolved-graph-to-model` → `conformist`
  (upstream=lexicon-loading, downstream=graph-model)
- 0 seams left at `unknown`

### Subdomain classification
- 4 contexts classified: lexicon-loading=core, graph-model=core,
  project-registry=supporting, design-system=supporting

### Aggregates / Evans-modules
- 0 emitted. `Project` (in project-registry) is a candidate root for a
  future aggregate (path-clamp could be the invariant boundary); deferred
  to a `lex-crystallize` pass.

### Schema bumped
- 9 active files: `"0.2"` → `"0.3"` (system.yaml, 4 contexts, 3 surfaces, 1 archived ADR untouched)

### Delta refinements (round-1 pilot feedback)
- After this migration, round-1 pilots on eir and dany surfaced six delta-spec
  gaps which were applied to `skills/lex-migrate/migrations/v0.2-to-v0.3.md`:
  Phase-3 "split by codomain" + weak-kernel anti-pattern; Phase-4 enforcement
  guard + value-without-equality discipline + autonomous-mode escape;
  Phase-5 demote-to-non-seam branch; Phase-1 multi-atom default +
  prose-link rewrite for archived ADRs; expanded validate phase (prose drift
  scan, operatesOn category coherence, mirror seam detection, uncategorized
  term count). Loader fix: kernel-owner-scope fallback for `disambiguatesFrom`.

### Unresolved / follow-up
- The `viewer-vocabulary` kernel is admitted pragmatic, not strict-DDD —
  a future `lex-crystallize` could refactor it into per-context promotion
  with a published-language seam between contexts that share `fqid`/code-anchor
  vocabulary. Not blocking.
- `affects-routing` term is marked `status: deprecated` but the underlying
  layout-routing code is vestigial in the codebase. A polish pass can rip
  both. Tracked, not blocking.
