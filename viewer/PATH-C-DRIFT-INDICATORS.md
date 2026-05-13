# Path C: Drift indicators

Continuous, calm code↔doc drift detection surfaced as ambient UI state. One Claude Code session.

## Read first

- `viewer/PATH-B-GRAPH-VIEW.md` § "What lexicon-viewer is" — viewer architecture and stack.
- `viewer/server/schema.ts` — `CodeAnchor`, `ResolvedEntity`, `LoadIssue`.
- `skills/lex-audit/SKILL.md` Phase 1, Phase 2 — the backward-flow checks this path makes continuous.

## The goal

Today the loader validates the YAML and surfaces parse/reference issues. It does **not** validate that the *code* the YAML claims about still exists. Lex-audit's job is exactly this, but it runs on demand. Path C turns the cheap subset of audit into a continuous UI signal so the user sees drift the moment they open the project — not "audit later."

Three classes of anchor exist in the schema, and each gets a validation:

1. `Term.symbols` / `Invariant.constrainsCode` — `{file, lineStart?, lineEnd?, symbol?}`. Validate: file exists; if `symbol` is set, the symbol's identifier appears in the file at any line; if `lineStart` is set, the file is at least that long.
2. `Region.implementation.inline` — `{file, lineStart, lineEnd}`. Validate: file exists, range still falls inside the file, and the block at that range still "looks like" a region (heuristic: non-trivial content, not whitespace, ideally a JSX/Vue/Svelte/widget construct on the opening line — but loose since this is cross-platform).
3. `Region.implementation.component` — `{import, file?}`. Validate: when `file` is set, file exists. When only `import` is set, leave as `not-validatable` (no LSP yet).
4. `BoundedContext.modules` — list of globs/paths. Validate: at least one file matches.

Each anchor gets a status:

- `ok` — resolves cleanly.
- `missing-file` — the file doesn't exist anymore.
- `missing-symbol` — file exists but the named symbol can't be found.
- `out-of-range` — `lineStart`/`lineEnd` is past EOF.
- `stale-line` — range exists but content at that range looks unrelated (heuristic; surface gently).
- `not-validatable` — no enough information to check (e.g. component anchor without `file`).

Surface these continuously, calmly, no red badges everywhere — *editorial* not *alarmist*.

## Non-goals

- Real LSP integration. Plain text search and `node:fs/promises` are enough for v0. LSP is its own future plan.
- Auto-fixing. The viewer reads-only; corrections go through `lex-crystallize`.
- Background polling. Validation runs on `loadLexicon` (same trigger as today's parsing) and on the explicit "Refresh" button.

## Concrete v0 scope

### Server

- Extend `ResolvedEntity` with `anchorValidations?: AnchorValidation[]` where `AnchorValidation = { anchor: CodeAnchor, status: '...', detail?: string }`. One entry per `CodeAnchor` on the entity (across `symbols`, `constrainsCode`, plus a synthesized one for `Region.implementation.inline`).
- Add `BoundedContext.moduleMatches?: { glob, count }[]` so the context can show "this context's modules glob matches N files."
- Validation runs as a third pass in `viewer/server/loader.ts` after `resolve(...)`. It:
  - Reads each anchor's `file` once (cache the read; many entities share `skills/lex-overview/SKILL.md` etc.).
  - Counts lines for range checks.
  - Does substring search for `symbol` (case-sensitive, word-boundary regex). Don't try to parse the file's language.
  - For `Region.implementation.inline`, sample the first non-blank line in the range and apply a loose "looks like an element/widget" heuristic — opening with `<`, `view`, `Widget`, `func`, `def`, `Composable`, etc. If none match, classify as `stale-line` (low confidence).
  - For `BoundedContext.modules`, use `Bun.glob` (Bun 1.2+) — it's idiomatic and synchronous-friendly. Don't go full `fast-glob`.
- Validation issues do **not** stop the response; they ride along with the existing `issues: LoadIssue[]`.
- Performance: validation should be parallelizable per-file. Use `Promise.all` over a per-file map. The cache key for the validation pass is the same `(projectRoot, latestMtime)` the parse cache uses, so cached responses don't re-validate.

### Client

- Add `lib/anchor-status.ts` with a `STATUS_LABEL` and `STATUS_COLOR` map; `ok` is vellum-3 (invisible-ish); `missing-file` / `out-of-range` are oxide; `missing-symbol` / `stale-line` are saffron.
- `CodeAnchorBadge` gets a small status pill on the left edge — a 6px square in the status color. Hover reveals the status text. `ok` renders as a 1px outline only (calm; not loud).
- `EntityDetail`'s marginalia "Code" section sorts anchors by status (problems first).
- `ContextSidebar` adds a summary row at the top: `H entities · D drift` where `D` is the count of entities with at least one non-ok anchor. Click it → navigate to a new `/p/:id/drift` route.
- `/p/:id/drift` is a list view of entities with non-ok anchors, grouped by status, ordered by severity. Reuse the existing card-inset styling. Each card links to the entity detail.
- ProjectsPage's project-list entry gets a small `D` badge next to the entity count when `D > 0`.

### Lib

- `lib/types.ts` — add the `AnchorValidation` union and extend `ResolvedEntity`.

## Files to touch / create

```
viewer/
  server/
    loader.ts                ← add validation pass + per-file cache
    schema.ts                ← AnchorValidation types
    index.ts                 ← (optional) /api/projects/:id/drift if you want server-side aggregation
  client/src/
    lib/
      types.ts               ← mirror AnchorValidation
      anchor-status.ts       ← new — STATUS_LABEL, STATUS_COLOR, ordering helpers
    components/
      CodeAnchorBadge.tsx    ← add status pill
      EntityDetail.tsx       ← sort anchors in marginalia by status
      ContextSidebar.tsx     ← add drift summary row
    pages/
      DriftPage.tsx          ← new — /p/:id/drift list view
      ProjectsPage.tsx       ← add D badge per project
    App.tsx                  ← add /p/:id/drift route
```

## Implementation order

1. Server: extend `ResolvedEntity` schema, write the validation pass, plumb through the API. Smoke test by `curl` on the sample lexicon (most anchors resolve cleanly; the sample has a few that don't because line numbers may have shifted — that's actually a good test fixture for the path).
2. Client: types, status map, badge pill. Verify rendering on a Term with a known dangling anchor (synthesize one in the sample lexicon if needed).
3. Sidebar summary + drift list page.
4. ProjectsPage D badge.
5. Smoke test in browser.

## Aesthetic continuity

- Status pills are tiny color squares, not rounded badges with numbers.
- The "D drift" sidebar row uses `smallcap` + oxide for the number, no exclamation marks or warning icons.
- The drift page reads as a *triage list*, not a *bug tracker*. Same `card-inset` cards as the rest of the viewer. No CTAs urging the user to "fix" — surfacing is the work.

## Done state

- Run on sample-lexicon (50 entities): every anchor's status renders. The few stale line numbers in the sample lexicon's region tags show as `out-of-range` or `stale-line`, *not* as parse errors.
- Synthesize one missing-file anchor (point a Term's `symbols` at `nope.ts`); verify it renders as `missing-file`, appears in the drift list, and triggers the project-list D badge.
- Refresh button revalidates; cache invalidates cleanly.
- ProjectShell's "REFRESH" link in the top strip continues to work; drift state updates after refresh.
- Verify the calm-not-alarmist aesthetic holds. Send the user a screenshot if uncertain.

## Caveats

- The "looks like an element/widget" heuristic for inline regions is intentionally loose. Don't try to parse JSX/Swift/Flutter — that's LSP territory. False-positive `stale-line` flags should be infrequent on real projects but possible; the calibration mechanism (`lexicon-prefs.md`) is the right place to dampen them later.
- `Bun.glob` is the right primitive for `BoundedContext.modules`. Fall back to a manual recursive scan if you're targeting older Bun for some reason.
- Don't introduce a background watcher in this path — Path G handles filesystem watching as a separate concern.

When this ships, lexicon-viewer goes from "shows what the YAML says" to "shows whether the YAML still matches the code." That's the audit feedback loop made continuous.
