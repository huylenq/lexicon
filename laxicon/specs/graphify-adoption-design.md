---
status: refuted
closed: 2026-07-15
created: 2026-07-15
updated: 2026-07-15
p0-validated: 2026-07-15
p1-validated: 2026-07-15
p2-validated: 2026-07-15
scope: skills/lexicon/subcommands/{bootstrap,crystallize,validate}.md; viewer/server (optional provenance tier only)
source: exploration of https://github.com/Graphify-Labs/graphify (cloned to /tmp/graphify, 2026-07-15)
---

# Graphify adoption — an external knowledge-graph extractor as lexicon's candidate feed

Adopt [graphify](https://github.com/Graphify-Labs/graphify) (MIT, Python CLI + agent skill) as an **upstream candidate feed** for lexicon's curation moves — bootstrap seeding, crystallize/validate drift signal, rationale mining — consumed strictly through its `graph.json` artifact. Explicitly **not** as a replacement for the viewer's code-intel backend.

> **Status: refuted (2026-07-15).** This spec is kept as the record of a measured negative result, not as an active design. Decisions 3 and 4 failed their gates (see the inline refutation notes and the P1/P2 results block); the P1 implementation was reverted; Decision 1 — keep the viewer's code-intel stack, change nothing — is the only decision that survives. Lexicon uses no graphify. Do not promote; do not re-explore without new evidence that invalidates the numbers below.
>
> This is a laxicon spec: exploratory, repo-root scoped (the plugin repo carries no cold layer by design). If the work commits to the viewer, the viewer-facing decisions graduate to a proper `viewer/lexicon/specs/<slug>-design.md`. Fqid references below (`[[…]]`) point into `viewer/lexicon/` and are notation here, not viewer-resolvable links.

## What graphify is (exploration findings)

A YC-backed OSS tool: `/graphify .` maps a whole project (code, docs, PDFs, media) into a knowledge graph. Code is parsed **locally with tree-sitter across ~40 languages** — deterministic, zero LLM; docs/media go through an LLM semantic pass. Outputs land in `graphify-out/`: `graph.json` (schema-validated: nodes `{id, label, source_file, source_location}`, edges `{source, target, relation, confidence}`), an interactive `graph.html`, `GRAPH_REPORT.md`. On top: `query`/`path`/`explain` CLI + MCP server, Leiden community detection, god-node centrality, incremental `update`/`watch`/git hooks, an `affected` command, a graph merge driver, and exporters (Obsidian, SVG, GraphML, Neo4j/FalkorDB). Every edge carries a confidence tag: `EXTRACTED` (explicit in source), `INFERRED` (derived by resolution), `AMBIGUOUS`.

## Motivation

Graphify and lexicon are opposite halves of one problem. Graphify is the **territory dump** — exhaustive, machine-derived, updates at the speed of typing. Lexicon is the **curated map** — small, human-confirmed, updates at the speed of learning. Nothing in graphify does curation; nothing in lexicon should redo extraction that a dedicated OSS extractor already does deterministically. The opportunity is the interface between them: three lexicon moves currently do their own cold scans that graphify's precomputed graph could feed.

1. **`bootstrap` seeding.** The subcommand's strongest ubiquitous-language signal is doc vocabulary cross-referenced against code identifiers ranked by connectivity. Graphify computes exactly that: god-nodes (degree centrality) → glossary candidates; Leiden communities → bounded-context candidates; its doc↔code `references` edges → the cross-reference. Bootstrap becomes "triage a ranking" instead of a from-scratch scan.
2. **Drift signal for `crystallize`/`validate`.** `graphify update` (AST-only, free, git-hookable) diffs the graph deterministically. Changed nodes → cold-layer atoms whose `code-anchor`s reference those files/symbols → the exact re-verify list. Sharper and cheaper than re-deriving "what moved" from the raw git diff, and it directly serves the CLAUDE.md open question about stale cold layers: the graph-vs-marker gap is a mechanical staleness metric `ground` can surface.
3. **Rationale mining.** Graphify lifts `# WHY:` / `# NOTE:` / `# HACK:` comments and ADR/RFC citations into first-class nodes linked to the code they explain — a ready-made candidate stream for `crystallize`'s `add-rationale` mutations.

## Decision 1 — Candidate feed, not code-intel backend. The viewer's derived-edge stack stays.

The naive take ("graphify has tree-sitter + call edges, retire `viewer/server/code-intel.ts` + `lsp/`") is wrong, and the code-lens spec is why. Its Decision 3 names the syntactic→semantic boundary: tree-sitter can *find* a call site but cannot *resolve* its target — that requires name resolution (LSP). Graphify's cross-file `calls`/`uses` edges are resolved by name-matching within the parsed set, which is why they're tagged `INFERRED` — the exact ceiling the viewer's LSP tier (tsserver + pyright, health-gated, per-root supervisor) was built and validated to close (see `viewer/lexicon/specs/code-lens.progress.md`: same-name disambiguation shipped). Swapping a precision-first, domain-selective, LSP-disambiguated backend for a recall-first name-matched graph is a regression on the edges the code lens exists to render.

Two further reasons, independent of precision:

- **Dependency weight on the render path.** The viewer is a Bun/TS app; graphify is a Python toolchain + 40 tree-sitter grammar wheels. Acceptable as an *optional* tool the skill invokes when present; unacceptable as a hard dependency of the viewer's core render.
- **Roadmap coupling.** Graphify is VC-backed and moving fast (Penpax on top). MIT de-risks the legal side, not the churn side.

**Rejected — replace `code-intel.ts`/`call-flow.ts`/`lsp/` with `graph.json` consumption.** Precision regression (`INFERRED` name-match vs LSP-resolved), Python hard-dependency, and it discards a working, spike-validated, fixture-tested implementation for no capability the lens needs.

## Decision 2 — Consume the artifact, never the internals

All integration reads `graphify-out/graph.json` (schema enforced by graphify's own `validate.py`) and `GRAPH_REPORT.md`. No imports of graphify's Python modules, no coupling to its CLI flag surface beyond the handful of invocations named here (`extract`, `update`, `query`). Graphify is discovered, not required: each integration point probes for the CLI / an existing `graphify-out/` and degrades to today's behavior when absent. This keeps lexicon's zero-Python property for every user who doesn't opt in.

**Rejected — vendoring or pip-depending.** The artifact interface is the stable surface; the internals are theirs to churn.

## Decision 3 — Bootstrap seeding is triage input, never auto-population

> **Refuted 2026-07-15.** The P1 trial against the curated honeywell cold layer showed seeding does not beat a plain cold code-scan, and for context proposal it is materially worse: 0/6 curated contexts map 1:1 (the contexts are directory globs a layout scan reproduces for free, while Louvain fragments each into 11–47 communities and *merges* the two distinct dos contexts because they share a directory), only 4/44 curated terms surface as god-nodes, and ~6/10 gods are utility/CLI/config plumbing. The optional bootstrap-seeding phase (`bootstrap.md` Phase 2b + hooks) was implemented earlier in the same session, then **reverted 2026-07-15** on the user's call once this measurement landed — `bootstrap.md` is back to its pre-session state. The safe triage discipline below still holds in principle, but the candidate feed it would triage is a measured regression against directory layout, so it is not worth carrying. See the P1 / P2 results block below.

`bootstrap` gains an optional graphify phase: if the CLI is present (or the user okays a one-shot run), build the graph, then read god-nodes and communities as *candidates* — glossary terms from high-centrality identifiers that also appear in docs, bounded contexts from community structure, `rationale:` material from WHY/NOTE nodes. Every candidate still flows through bootstrap's existing one-decision-per-turn distillation interview. Nothing lands in the cold layer without the user's yes.

This is the guard against the failure mode the whole design forbids: extraction infecting curation. `graph.json` is exhaustive by construction; the cold layer is lossy by design (~500 lines). Auto-populating would break Rule 5 (cold-layer edits route through explicit approval) and recreate the code-mirror that code-lens Decision 2 exists to prevent. Graphify proposes; the human disposes.

## Decision 4 — Drift feed for crystallize/validate, complementing (not replacing) model-health

> **Validated 2026-07-15.** Refuted and not implemented. The P2 delta measurement on a 10-commit honeywell window (`graphify update` in 2.286s; code-only precision 0.821 / recall 0.833) showed the graph delta cannot beat the git diff. For scoping it is strictly worse — the git diff is exact, free, and `crystallize` already reads it, whereas the delta recalls only 10/12 changed files and needs code-node filtering to shed the doc contamination `graphify update` reintroduces (it ignores the `--code-only` policy and re-extracts markdown nodes). For ranking it adds nothing dependable — impact is weak in the zero-LLM path (one lone top-10% hub among the changed nodes, degrees dominated by containment/import edges) and community IDs renumber globally on every incremental update (113→150 here), so "crosses N communities" is not reproducible. The crystallize/validate/ground edits were intentionally **not** made; the git diff stays the sole scoping input. See the P1 / P2 results block below.

`crystallize` and `validate` keep the git diff since `.last-crystallized` as the primary input — that discipline is load-bearing and stays. Where a `graphify-out/` exists and is current, both moves may additionally read the graph delta to *rank and scope* the work: changed graph nodes joined against cold-layer `code-anchor`s yield the atoms most likely drifted, so a sprawling multi-week diff gets triaged by impact instead of chronology (this addresses the "sprawling neglected period" open question).

Division of labor with model-health (`viewer/server/model-health.ts`, model-health-design.md): model-health answers *"does this anchor still resolve; do derived edges contradict declared seams?"* — precision checks against the viewer's own backend. Graphify's delta answers *"which regions of the codebase moved since the marker?"* — a cheap breadth signal. Breadth ranks; precision verifies.

## Decision 5 — Language-breadth provenance tier for the code lens (deferred)

For projects in languages the viewer's `grammars.ts` doesn't cover (currently TS + Python), graphify's `EXTRACTED` structure edges could back the code lens as a third, lowest-confidence provenance tier — which slots exactly into model-health's Decision-4 edge-provenance ladder (LSP-resolved > tree-sitter > name-matched). Deferred: no real project has hit the language gap yet, and shipping it would front-load the Python dependency question Decision 2 defers. Name the failure before building the mechanism.

## Phasing

| Phase | What | Gate |
|---|---|---|
| P0 — spike | Run graphify on `viewer/` and the honeywell workspace; diff its `EXTRACTED`/`INFERRED` edges against the viewer's derived `codeEdges` (precision/recall per kind); measure `update` latency and delta quality | Numbers confirm/refute D1's precision claim and D4's delta usefulness |
| P1 — bootstrap seeding | Optional graphify phase in `subcommands/bootstrap.md`: probe, build, triage god-nodes/communities/why-nodes through the existing interview | A real bootstrap on a fresh project where seeded candidates beat the cold-scan baseline |
| P2 — drift feed | `crystallize`/`validate` read the graph delta (when present) to rank atoms for review; `ground` surfaces the graph-vs-marker staleness gap | A sprawling crystallization triaged by impact, confirmed less lossy than chronological |
| P3 — provenance tier | Graphify edges as the third code-lens tier for uncovered languages | Deferred until a real project hits the language gap |

## P0 spike results

> **Validated 2026-07-15.** `uv tool install graphifyy`; `graphify extract <path> --code-only` (AST-only, zero API key, zero LLM) on `viewer/` and the honeywell-forge-cognition-workspace multi-root Python monorepo. Full data in the session scratchpad; headline numbers below.

**Latency / scale (zero LLM, code-only):** viewer 93 files → 767 nodes / 1651 edges / 50 communities in **4.0s**; honeywell → 24,932 nodes / 49,720 edges / 1034 communities in **47s**. The free AST path is real and fast.

**Decision 1 — confirmed and *strengthened*.** The naive "retire the viewer's tree-sitter/LSP stack" take fails harder than the spec first argued. Graphify's edge model sits at a **different altitude**: its dominant relations are file-level `imports`/`contains` plus symbol `calls`/`references`. On the viewer's curated 28-anchor subset it reproduced **0 of the 5** authoritative domain edges (`ResolvedEntity uses EntityRef/CodeAnchor/fqid`, `ResolvedGraph uses ResolvedEntity/LoadIssue`, `PeekProvider calls peek`) — it emitted file `imports` and one unrelated `references` instead. Graphify draws a **module-dependency graph**; the code lens draws a **domain-selective type-composition + resolved-call graph**. Not "noisier edges" — *different* edges, and near-zero overlap on exactly what the lens renders.

**The confidence tag is not a resolution signal** (correcting the spec's original assumption that name-matched cross-file edges carry `INFERRED`): AST name-matched `calls` are stamped **`EXTRACTED`**. 7.6% of viewer `calls` and **22%** of honeywell `calls` target an **ambiguous name** (≥2 files) yet ride as high-confidence `EXTRACTED`. Nothing distinguishes a resolved call from a same-name guess — the exact D3 ceiling the viewer's per-root pyright/tsserver tier closes. Observed directly: the viewer's resolved pass *dropped* `resolved-entity uses entity-ref` (same-name collision with the `fqid` atom, both anchoring symbol `EntityRef`); graphify keeps both silently and can't even represent the two-atoms-one-symbol distinction. Plus a completeness cost from `path+name` ID minting: honeywell dropped **12 nodes** to `env.py`/`_env.py`-style ID collisions and fuzzy-deduped 15 more (graphify itself recommends per-subfolder extract + `merge-graphs`). → **No change to the viewer's code-intel stack.**

**P1 (bootstrap seeding) — GO.** Leiden communities recover real subsystems: community 0 = loader+schema (≈ the `lexicon-loading` context), community 2 = pyright/tsserver/provider/roots/supervisor (≈ the LSP supervisor), community 1 = model-health/code-intel/call-flow. They map recognizably onto the viewer's four curated contexts, so community structure is a usable *context-candidate* feed. God-nodes are ~50% domain (`loadLexicon`, `EntityKind`, `PyrightProvider`, `GraphPage`) / ~50% utility-hub + config noise (`attr`, `firstChild`, `renderProse`; `compilerOptions` and a 41-node `tsconfig.json` community). Confirms D3's "triage a ranking, never auto-populate" and the candidate-flood risk — a hard cap plus utility/config-hub filtering is mandatory, not optional.

**Rationale mining — GO, with a caveat.** honeywell yielded **5,740 `rationale_for` edges** in code-only mode (docstring/module-header → symbol). Real architectural "why" is present (`"Opt-in host adapters — NEVER imported by the dos core"`, `"Per spec §7 (audit-readiness)"`), but the stream is docstring-dominated, not the `# WHY:`/`# HACK:` comments the spec named. Usable as an `add-rationale` candidate feed **with filtering**, not raw.

**Deferred:** the exact `graphify update` delta-quality micro-benchmark. `update` requires `graphify-out/` under the source path, and running it would write into the user's live `viewer/`/honeywell repos — declined to avoid polluting their working trees. Full code-only re-extract (4s viewer) is the incremental upper bound. Delta-vs-git-diff usefulness is **P2's own gate**; measure it there before P2 commits (this is the "does P2 pay for itself?" open question below, still open).

## P1 / P2 results

> **Trialed 2026-07-15.** P1 seeding measured against the curated honeywell cold layer (6 bounded contexts, 44 terms); P2 delta measured on the honeywell graph across a 10-commit window (OLD `97ab0fb` → NEW `a5656bf`, 12 changed `.py` files). Both gates **failed**; neither downstream edit was made. Full data in the session scratchpad; headline numbers below.

**P1 (bootstrap seeding) — REFUTED. Does not beat a plain cold code-scan, and for context proposal it is materially worse. beats-baseline: NO.**

- *Context recall:* 4/6 contexts have a usable dominant-community anchor but **0/6 map 1:1** — every curated context smears across 11–47 Louvain communities (1,034 communities over ~25k nodes, clustering by src/test file coupling, not by conceptual boundary). Recoverable-with-anchor: facility-config (comm 4, purity 0.96 but only 17% of the 893-node context), star-agents (comm 110/115/345, purity ~0.96, ~61% together), auth-plane (comm 28, purity 0.58), deployment-profile (comm 280+646, full coverage but a tiny 20-node context). **Misses:** dos-selector and dos-engine both live under `dos_spine/src/.../dos` and are co-partitioned into the *same* shared mega-communities (comm 3/6/12/30, purity 0.13–0.41) — fragmented **and** mutually indistinguishable. The curated selector/engine split is a conceptual boundary inside one directory that community structure cannot see.
- *Term recall:* **4/44** curated terms surface as god-nodes (only 10 gods exist total): WorldState (dos-engine), TenantScopedSession (auth/facility-envelope), AutonomousFacility (facility-config), HoneywellForgeIoT (≈ curated HoneywellForgeResource). Missed because centrality ≠ conceptual importance — Watts, Connie, Atlas, Selector, Route, Threshold, Miss, Stage, Skill, Encoder, EngineSpec, Executor are all low-degree despite being named domain terms.
- *Noise ratio:* ~6/10 gods are non-curated hubs — hard utility/CLI/config plumbing (CLIError, `compile_query()`, TopologyQuery — the cypher/CLI machinery that is most-referenced *because* it is infrastructure) plus in-context-but-unnamed plumbing (LlmEngine, EngineRegistry, ToolRegistry). Only 4/10 gods are actual curated domain terms.
- *Why it loses:* the curated bounded contexts are literally directory globs (`hfc_core/facility`, `dos_spine/dos/engine`, `django_edge/auth`), so a Phase-2 directory-layout scan reproduces all 6 almost exactly — the same module-path signal the human curator used, for free and without fragmentation. Graphify's Louvain communities over-partition each directory-context into 11–47 fragments keyed on src/test coupling and *merge* the two conceptually-distinct dos contexts because they share a directory. The clean sub-clusters it does produce (comm 4 = facility, comm 110/115 = orion agents) are fully subsumed by directory layout, which yields them for free. On terms, god-nodes = top degree-centrality ≈ raw reference frequency, so seeding is statistically equivalent to a frequency baseline and inherits its failure. No edge over frequency for terms; a regression against directory layout for contexts.

**P2 (drift feed) — REFUTED. The graph delta cannot beat the git diff; the crystallize/validate/ground edits were not made. pays-off: NO.**

- *Wall time:* `graphify update` OLD→NEW ran in **2.286s**.
- *Delta precision:* **0.821 code-only** (32/39 changed code-nodes map to a git-diff file; the 7 non-matches are 5 synthetic null-`source_file` nodes + 2 in `langgraph.json`, itself a diff file, just not `.py`). **Raw all-node precision = 0.069** (33/479) — see caveat.
- *Delta recall:* **0.833** (10/12 git-diff code files produced ≥1 changed graph node; missed `graph.py` and `tools/topology.py`, whose edits were signature/import-level and yielded no node add/move). Same 10/12 under both raw and code-only filtering.
- *Major caveat:* `graphify update` does **not** honor the `--code-only` policy the graph was built with — it re-extracted 436 markdown `document` nodes absent from the code-only OLD graph, so a literal node-id symmetric diff (the raw procedure) reports 479 changed nodes, 418 of them markdown headings in files the git diff never touched → the misleading 0.069. Filtering to `file_type==code` yields the fair 0.821 / 0.833.
- *Value-add verdict:* for **scoping** the delta is strictly worse — the git diff is exact, free, and `crystallize` already reads it, whereas the delta recalls only 10/12 changed files and needs code-node filtering to avoid doc contamination. For **ranking**, the only thing the flat file list lacks is impact, but in the zero-LLM code-only path impact is unreliable: only one changed node is a top-10% hub (`build_llm`, deg 8 vs graph max 41), degrees are dominated by structural containment/import edges rather than real call fan-in, and community count renumbered 113→150 across the incremental update (Louvain re-runs globally), so "crosses N communities" is not reproducible and cannot serve as a bounded-context-boundary signal. Net: the delta re-derives a slightly lossy version of the git file list without adding dependable ranking/impact information.

## Risks / open questions

- **Cadence drift between two markers.** `.last-crystallized` and `graphify-out/` freshness are separate clocks; a stale graph feeding P2 ranks by an old world. Mitigation: P2 checks graph mtime against the git log and refuses to rank from a stale graph (fail-fast, no silent fallback).
- **Candidate flood at bootstrap.** God-node lists on a big repo are long; the interview must stay one-decision-per-turn with a hard cap, or the review budget collapses (same discipline as validate's "items deliberately not flagged").
- **Naming collision.** Graphify's "knowledge graph" vocabulary (nodes, communities, god-nodes) must not leak into lexicon's ubiquitous language — the cold layer's atoms are curated terms, not graph nodes. Keep graphify vocabulary quarantined to the integration prose.
- **Does P2 pay for itself? Resolved 2026-07-15 — no.** Measured on a 10-commit honeywell window: the graph delta (`graphify update` in 2.286s; code-only precision 0.821 / recall 0.833) is strictly worse than the git diff for scoping and adds no dependable ranking signal. Impact is weak in the zero-LLM path (a single top-10% hub among the changed nodes, degrees dominated by containment/import edges) and community IDs renumber globally on every incremental update (113→150 here), so "crosses N communities" is not reproducible. The git diff is the good-enough — and better — scoping signal `crystallize` already reads. P2 not implemented.
