# Path D: Pending-crystallization view

Surface the gap between forward-flow drift (logged by `lex-retro`) and the user pulling the `lex-crystallize` trigger. One Claude Code session.

## Read first

- `viewer/PATH-B-GRAPH-VIEW.md` § "What lexicon-viewer is" — viewer architecture.
- `skills/lex-retro/SKILL.md` — how retros are written. **Note:** retros are still markdown in v0.9; the structured-retro evolution is future work.
- `skills/lex-crystallize/SKILL.md` — what the user does with retros once they decide to absorb them.

## The goal

`lex-crystallize` runs only when the user says so. Between crystallizations, retros pile up in `lexicon/retros/` carrying drift flags that the cold layer hasn't yet absorbed. There's no way for the user to see *how big the pile is* without opening files.

Path D makes the pile visible: read retros newer than `.last-crystallized`, parse drift flags from the markdown (heuristic — see below), aggregate by mentioned entity, and render as a triage queue. The user looks at the page and decides whether it's time to crystallize.

This is not a replacement for `lex-crystallize`. It's the *summary* the user uses to decide when to run it.

## Non-goals

- Editing or applying crystallizations from the viewer. That's `lex-crystallize`'s job (and it runs in the agent's terminal, not in the web app).
- Parsing retros perfectly. Markdown retros have loose structure; do best-effort parsing and gracefully degrade. When the structured-retro evolution lands in a future lexicon version, this code becomes simpler.
- Auto-suggesting which retros to crystallize. The user decides.

## Concrete v0 scope

### Server

- New endpoint `GET /api/projects/:id/pending`:
  - Reads `lexicon/.last-crystallized` (ISO timestamp; absent = treat all retros as in-scope).
  - Lists `lexicon/retros/*.md` whose filename sorts newer than the marker.
  - For each retro file:
    - Parse front matter / session-summary heading.
    - Locate `## Structural drift` (or `## Drift flags`, `## Notes for future sweeps` — loose match).
    - Within that section, extract bulleted lines. For each bullet:
      - Try to match `**<entity-name>**` or `` `<entity-name>` ``, look up the slug in the current `ResolvedGraph` to identify which entity is flagged.
      - Extract the check kind from common patterns (`vocabulary`, `invariant`, `boundary`, `decision`, `scope-match` — see `lex-overview` § Structural checks for the six).
      - Capture the first ~140 chars of the bullet text as the flag's prose excerpt.
  - Return `{ marker, retros: [...], flags: [...] }` where `flags` are the parsed drift entries with `{ retroFile, retroTimestamp, entityFqid?, kind, excerpt }`.
- The parser should be tolerant: unrecognized bullet → keep `entityFqid: null`, classify as `kind: unparsed`, surface the raw text. Better to surface noise than to skip.
- Cache the response keyed by (project, marker, retro-directory-mtime); invalidate when the marker file or retros directory changes.

### Client

- New route `/p/:id/pending` and a "Pending" link in `ProjectShell`'s top strip (next to "REFRESH"). Show the count: `Pending · 12`.
- Page layout: marker timestamp at the top, then **grouped tabs**:
  - **By entity** (default): aggregate flags per entity; each entity card shows entity name + count + a flat list of flag excerpts. Click → entity detail (existing route).
  - **By retro**: list retros chronologically (newest first); under each, the flags it raised. Click → opens the retro markdown in the Monaco peek drawer (same component as code peeks; reuse).
  - **By check kind**: vocabulary / invariant / boundary / decision / scope-match / unparsed columns. Useful for "I want to focus on vocab drift this crystallization."
- Each flag card has a small `excerpt` paragraph and `retro` provenance (timestamp + file).
- The retro file is shown in Monaco when clicked from the "By retro" view — reuses `PeekProvider`, same peek shape as code anchors. Note the file: prefix to distinguish from code anchors in the peek header ("from retro <timestamp>" vs "from <entity>").
- Project-list page gets a `P · N` micro-badge per project when N > 0 (analogous to drift's D badge from Path C; pick a different glyph to avoid confusion if both paths are shipped).

### Lib

- `lib/pending.ts` — types for `PendingFlag`, `PendingResponse`. Grouping helpers (`groupByEntity`, `groupByRetro`, `groupByKind`).

## Files to touch / create

```
viewer/
  server/
    index.ts                 ← new /api/projects/:id/pending route
    pending.ts               ← new — retro parsing logic, kept separate from loader.ts for cleanness
  client/src/
    lib/
      api.ts                 ← fetchPending()
      pending.ts             ← types + grouping helpers
    components/
      PeekDrawer.tsx         ← extend Peek type to accept a "retro" origin label
    pages/
      PendingPage.tsx        ← new — grouped tabs, three views
      ProjectPage.tsx        ← add Pending link to top strip
      ProjectsPage.tsx       ← P badge per project
    App.tsx                  ← /p/:id/pending route
```

## Implementation order

1. Server: parser first, in isolation. Build it against `viewer/sample-lexicon/lexicon/retros/` — except the sample lexicon has no retros yet, so write 3–4 fixture retros first (each markdown, with a `## Structural drift` section and a few bullets that name entities from the sample). This becomes a useful test fixture for Path D itself.
2. API endpoint, smoke-test by curl.
3. Client types + fetch.
4. PendingPage with the three groupings. Start with "By entity" since it's the default.
5. Wire the retro-as-peek (modify `Peek` type to carry an origin discriminant; minor change).
6. Top-strip Pending link with count.
7. Project-list P badges.

## Aesthetic continuity

- Tabs are minimal: smallcap labels separated by `·`, oxide for active. No tab bar with rounded backgrounds.
- The "12 pending" indicator is a number in oxide on the masthead, not a notification badge.
- Empty state when there's nothing pending: a one-line italic note in vellum-3, *not* a green checkmark or "all clear" celebration.

## Done state

- Sample lexicon: write 3–4 fixture retros under `viewer/sample-lexicon/lexicon/retros/` with realistic drift flags. The "pending" view renders them grouped three ways.
- Set `viewer/sample-lexicon/lexicon/.last-crystallized` to a timestamp before one of the retros; verify only the post-marker retros count.
- Move the marker forward (manually edit); pending count drops to 0; verify empty state is calm.
- Open a retro in the peek drawer; it renders as markdown (Monaco's markdown mode is fine).
- Verify the unparsed-flag case: write a retro with a malformed bullet; it shows up in the "By kind" → unparsed column with the raw text.

## Caveats

- Retros are loose markdown. The parser will misclassify some bullets. That's *expected*; surfacing best-effort beats demanding perfect structure. When structured retros land (future lexicon version), revisit and simplify.
- Don't try to match entity names by fuzzy string similarity. Exact name or slug match only; everything else stays `entityFqid: null` and renders under "unparsed."
- The peek shape currently assumes code files (Monaco gets a language guess from extension). Markdown retros work fine because the extension is `.md` and Monaco has a markdown mode — no schema change needed beyond an origin-discriminant for the header.
- This path is independent of Path C. If both ship, the project-list project entries can carry both a `D` (drift) and `P` (pending) badge.

When this ships, the user sees the pile from the homepage and knows when it's time to run `lex-crystallize`. That's the second half of the forward-flow loop made visible.
