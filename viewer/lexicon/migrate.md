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
