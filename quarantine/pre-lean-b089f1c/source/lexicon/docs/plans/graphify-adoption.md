# Graphify adoption — execution plan

**Spec:** [graphify-adoption-design.md](../specs/graphify-adoption-design.md) — graphify as an upstream candidate feed (bootstrap seeding, drift signal, rationale mining), consumed via `graph.json` only. Not a code-intel replacement (spec Decision 1).

## P0 — spike: validate the precision claim and the delta signal

Everything downstream depends on P0's numbers. If graphify's edges are noisier than assumed, D1 hardens; if its delta is no better than the git diff, P2 dies here.

- [x] `uv tool install graphifyy` and run `graphify extract ./viewer --code-only` (AST-only, zero API key) — 767 nodes / 1651 edges / 50 communities in 4.0s
- [x] Same on the honeywell workspace (multi-root Python) — 24,932 nodes / 49,720 edges / 1034 communities in 47s
- [x] Diff graphify edges against the viewer's derived `codeEdges` for the anchored-atom subset — **0/5 authoritative domain edges reproduced** (different altitude: module-dependency graph vs domain type-composition/call graph); name-matched `calls` stamped `EXTRACTED` not `INFERRED`; 22% of honeywell `calls` target ambiguous names
- [~] Measure `graphify update` on a commit-sized change — **deferred** (requires `graphify-out/` in the live repo; declined to avoid polluting working trees). Delta quality is P2's gate; measure there.
- [x] Sanity-check god-nodes/communities against `viewer/lexicon/` contexts — communities recover real subsystems (loader+schema ≈ lexicon-loading, LSP supervisor cluster); god-nodes ~50% domain / ~50% utility+config noise
- [x] Write findings back into the spec as a `> **Validated 2026-07-15:**` note — done (spec "P0 spike results" section)

**Gate outcome:** D1 confirmed & strengthened (code-intel stack unchanged). **P1 GO**; **P2 conditional-GO** pending its own delta-vs-git-diff measurement. See spec.

## P1 — bootstrap seeding (spec Decision 3)

- [x] Amend `skills/lexicon/subcommands/bootstrap.md`: optional graphify phase — probe for CLI / existing `graphify-out/`, offer a one-shot build, else skip silently (new **Phase 2b**)
- [x] Candidate mapping: god-nodes → term candidates (filter utility/config hubs); Leiden communities → context candidates (drop config-only clusters); `rationale_for` edges → `rationale:` material (filter docstring boilerplate). P0 findings baked into the filters.
- [x] Hard cap (≈10–15/bucket) on candidates surfaced (guard: candidate flood); all flow through the existing one-decision-per-turn interview — no auto-population (Rule 5). Hooks added in Phases 3, 4, 8, 9.
- [x] Trial on a fresh non-lexicon project; compare seeded triage vs cold-scan baseline — ran against the curated honeywell cold layer

**Gate outcome:** **FAILED.** Seeding did not beat the cold-scan baseline and is materially worse for context proposal — 0/6 curated contexts map 1:1 (contexts are directory globs a layout scan reproduces for free; Louvain fragments each into 11–47 communities and cross-merges the two dos contexts), 4/44 terms surface as god-nodes, ~6/10 gods are utility/CLI/config noise. God-node centrality ≈ frequency baseline; no edge. beats-baseline: **NO.** The Phase 2b/3/4/8/9 implementation landed earlier in the session and was **reverted 2026-07-15** on the user's call once the gate failed — `bootstrap.md` is back to its pre-session state. See spec P1/P2 results.

## P2 — drift feed for crystallize / validate / ground (spec Decision 4)

- [ ] Amend `crystallize.md` + `validate.md`: when `graphify-out/` exists and is fresh (graph mtime vs git log — refuse stale, fail-fast), join changed graph nodes against cold-layer `code-anchor`s to rank atoms for review; git diff since `.last-crystallized` stays the primary input — **not done; delta failed its gate (below), edit intentionally skipped**
- [ ] Amend `ground.md`: surface the graph-vs-marker staleness gap as the "want to crystallize first?" nudge (CLAUDE.md open question — nudge without volunteering) — **not done; same reason**
- [x] Trial on a deliberately sprawling window (weeks of un-crystallized work); confirm impact-ranked triage loses less than chronological — measured the delta on a 10-commit honeywell window (OLD `97ab0fb` → NEW `a5656bf`)

**Gate outcome:** **FAILED.** `graphify update` ran in 2.286s; code-only precision 0.821 / recall 0.833 (raw 0.069 precision, contaminated because `update` ignores `--code-only` and re-adds markdown nodes). The delta cannot beat the git diff: strictly worse for scoping (git diff is exact, free, already read by `crystallize`; delta recalls 10/12 files and needs code-node filtering) and unreliable for ranking (weak impact in the zero-LLM path; community IDs renumber 113→150 every update). pays-off: **NO.** crystallize/validate/ground edits intentionally not made. See spec P1/P2 results.

## P3 — provenance tier for the code lens (deferred)

Do not start until a real project hits the language gap (spec Decision 5). When it does: graphify `EXTRACTED` structure edges as the lowest tier in model-health's edge-provenance ladder, viewer-side loader consuming `graph.json` for uncovered languages only.

## Standing constraints (from the spec — hold across all phases)

- Consume `graph.json` / `GRAPH_REPORT.md` only; never import graphify internals or hard-depend on the CLI
- Graphify absent → every move behaves exactly as today
- Nothing graphify produces lands in the cold layer without the user's explicit yes (Rule 5)
- Graphify's graph vocabulary stays quarantined from the ubiquitous language

## Promotion recommendation

**Do not promote to `viewer/lexicon/specs/<slug>-design.md`.** Every viewer-facing bet this spec placed on graphify was refuted by measurement. Decision 1 (keep the viewer's code-intel/LSP stack) is the only decision the run *confirms*, and it is a decision to change nothing — it needs no viewer-side spec. Decision 3 (bootstrap seeding) and Decision 4 (drift feed) both failed their gates; Decision 5 (provenance tier) stays deferred and untested. There is no validated, viewer-affecting capability to graduate.

The spec's right home is where it already sits: a laxicon (plugin-repo) exploration that reached a well-measured **negative** result. Its lasting value is the recorded refutation — the numbers telling a future iteration *not* to reach for graphify community/centrality structure over plain directory layout and the git diff.

**User sign-off still required before anything moves — this run recorded results only:**
- Accept the negative result and shelve graphify adoption — or re-scope to the one P0 finding that was GO (the `rationale_for` docstring stream as an `add-rationale` candidate feed, with filtering). Everything else is refuted.
- No `git mv` / promotion to `established/` or to the viewer — none is warranted; explicit approval required before any such move.
- Explicit approval to **commit** these spec/plan edits. Nothing has been committed, moved, or pushed.
- ~~Decide the fate of the landed P1 bootstrap-seeding implementation~~ — **done: reverted 2026-07-15** on the user's call; `bootstrap.md` is back to its pre-session (HEAD) state.
