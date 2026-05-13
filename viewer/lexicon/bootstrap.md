# Bootstrap report
Run on: 2026-05-13
Distillation status: **complete** (one-on-one interview run in-session)

## What was created

- `lexicon/system.yaml` — 4 contexts indexed (lexicon-loading, project-registry, graph-model, design-system), 5 cross-cutting terms (`lexicon-conform project`, `cold layer`, `fqid`, `code anchor`, `peek`), 3 cross-cutting invariants (`viewer is read-only`, `one project active at a time`, `editorial-meets-blueprint aesthetic`).
- `lexicon/contexts/lexicon-loading.yaml` — 6 terms (`ResolvedGraph`, `ResolvedEntity`, `EntityRef`, `LoadIssue`, `ref resolution`, `mtime cache`); 4 invariants (fqid uniqueness, loader-never-throws, refresh invalidates cache, dangling-refs-are-warnings).
- `lexicon/contexts/project-registry.yaml` — 3 terms (`Project`, `project root`, `path clamp`); 3 invariants (rootPath absolute + existing, file-escape rejected, rootPath unique).
- `lexicon/contexts/graph-model.yaml` — 6 terms (`lens`, `GraphNode`, `GraphEdge`, `cluster node`, `affects routing`, `LayoutResult`); 3 invariants (lens set is closed, layout deterministic, filter changes re-run layout); 1 seam (ResolvedGraph → GraphModel).
- `lexicon/contexts/design-system.yaml` — 7 terms (`design tokens`, `RefLink`, `InlineCode`, `CodeAnchorBadge`, `PeekDrawer`, `Marginalia`, `lexicon-ink Monaco theme`); 3 invariants (tokens are source of color, peek persists across surfaces, shared primitives not raw HTML).
- `lexicon/surfaces/projects-page.yaml` — 4 regions (Masthead, Register form, Registered list, Footer).
- `lexicon/surfaces/reading-room.yaml` — 5 regions (Top strip, Context sidebar, Entity detail, Marginalia rail, Peek drawer).
- `lexicon/surfaces/graph-view.yaml` — 4 regions (Filter bar, Canvas, Detail rail, Layout options panel).
- `lexicon/decisions/ADR-0001-elk-plus-custom-svg.yaml` — migrated from `PATH-B § Library choice` (decide ELK + custom SVG over Cytoscape/react-flow/d3-force; affects graph-model and design-system).
- `lexicon/{retros,audits,plans/_archive}/` — empty, ready to populate.

Total: ~30 entities across 9 YAML files. Largest file is `lexicon-loading.yaml` (167 lines); `system.yaml` is 115 lines — well under the 500-line soft ceiling.

## Doc audit summary

- 9 existing docs scanned across `viewer/`: `README.md`, `PLANS.md`, `PATH-B…G-*.md`, plus inferred coverage from skills/`lex-*` directory.
- Bucketed: **cold-layer candidates** = the PATH-B "What lexicon-viewer is" + "cold-layer model" sections; **ADR-like** = 1 (PATH-B § Library choice → ADR-0001); **hot-feature** = 6 (all PATH files); **reference** = 2 (README, viewer/PATH header sections about running/setup — left in place); **stale** = 0.

## Distillation outcomes

- **Inconsistencies**: 2 total, 0 resolved with YAML edits (both are doc-only drift), 2 deferred to README/PATH maintenance (see below).
- **Drift flags**: 0.
- **Evidence gaps**: ~4 considered; 1 promoted to a full new context (`design-system` — user-confirmed), 1 promoted to a new invariant (`peek persists across surfaces` — user-confirmed), 2 culled (`LexiconFile` zod union — implementation detail; `sample-lexicon` — a fixture path, not domain vocabulary).
- **Unresolved invariants**: none. The three cross-cutting invariants and all per-context invariants were authored from current code evidence.
- **Bounded-context gaps**: 1 surfaced and resolved (design-system added). A possible fifth "viewer-shell" context for routing/top-strip plumbing was considered and declined — that work is thin enough to live as cross-surface region definitions rather than its own context.
- **ADR `affects:` fields**: 1 migrated ADR, `affects` field filled and updated mid-distillation when design-system was added.
- **File moves**: 7 recommended (PATH-B..G + PLANS.md), 7 accepted and applied via `git mv` into `lexicon/plans/<slug>/spec.md` (+ `plans/README.md` for the index). Internal cross-references fixed in the same pass.

## Deferred items (need follow-up)

1. **README stale dev-script claim**. The viewer `README.md` says `bun dev` runs Bun + Vite together on `:5273`. Reality: `bun dev` runs the Bun server on `:8787`; the Vite hot-reload client is `bun run dev:client` on `:5273`. Fix when convenient.
2. **PATH-B stale `1..9` keyboard hint**. `viewer/lexicon/plans/graph-view/spec.md` describes `1..9` as kind-filter shortcuts; the actual `FILTERABLE_KINDS` is 7 entries (`1..7`), matching the viewer `README.md`. The plan doc is out of date; fix when the graph-view path ships or when the doc is next touched.

## Design system findings

- **Token sources detected**: `client/src/styles/index.css` `@theme` block (ink, ink-2/3/4, rule, vellum, vellum-2/3, oxide, oxide-2, saffron; `--radius-card: 0`, `--radius-pill: 2px`).
- **Component library at**: `client/src/components/` (no Storybook; conventions documented via the new `design-system` context).
- **a11y tooling detected**: **none**. No `eslint-plugin-jsx-a11y`, no `axe-core`, no Storybook a11y addon. The `tokens-are-source-of-color` invariant is set `validationMode: linter` aspirationally; today nothing enforces it automatically. Worth pulling in a lightweight a11y / token-discipline linter when convenient.
- **Surfaces emitted**: 3 (projects-page, reading-room, graph-view).
- **Regions**: 13 total — 4 inline (all in `projects-page`), 9 component (across `reading-room` and `graph-view`).
- **Items pending design-owner forward**: 0 (Huy is the design owner).

## Possibly stale (your call — not addressed in distillation)

- None. The `viewer/` directory is fresh enough that there is no abandoned doc to flag.

## How to resume

Distillation completed in-session. No state to resume. Next regular steps:

- Run `lex-ground` at the start of any substantive coding work in `viewer/`.
- Run `lex-retro` at stopping points; retros land in `viewer/lexicon/retros/`.
- When you say "crystallize", `lex-crystallize` will absorb accumulated retros into the cold layer.
- Run `lex-audit` periodically (or before a planning session) to catch backward-flow drift.
