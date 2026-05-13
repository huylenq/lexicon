# Path F: Git-history time travel

Render the git history of any entity inline — when it was introduced, what changed, who touched it. One Claude Code session.

## Read first

- `viewer/PATH-B-GRAPH-VIEW.md` § "What lexicon-viewer is" — viewer architecture.
- `viewer/server/loader.ts` — how YAML files map to entities; the `source.file` field on every `ResolvedEntity` is the git-tracked file.
- `viewer/server/index.ts` — current API surface (so you know which patterns to reuse).

## The goal

YAML files are git-tracked. Every entity is born in a commit, lives across commits, occasionally moves between files. Today's viewer is stateless: it shows the current YAML and that's it. Path F adds *temporal depth* — for any entity, show its commits chronologically, what changed each time, and the diff against now.

Two presentations:

1. **Entity history**: timeline of commits that touched the file containing this entity, filtered to commits whose diff mentions the entity's slug. Renders in the marginalia rail or as a collapsible section below the body.
2. **ADR "as of when"**: an ADR has `status: accepted` now, but it had `status: proposed` for two weeks first. ADRs are append-only by design, but their status mutates over time. Show the status timeline.

## Non-goals

- Mutations or rebasing from the viewer. Read-only.
- Full repository blame UI. Just the YAML-file-and-slug intersection.
- Cross-project history. Per-project only.
- Reconstructing the full graph as it existed at a past commit. *Could* be done by checking out an old version of `lexicon/` and re-running the loader, but that's a separate path (probably worth a real "time machine" feature later).

## Concrete v0 scope

### Server

- New endpoint `GET /api/projects/:id/history?fqid=<fqid>`:
  - Look up the entity in the cached `ResolvedGraph`; get `source.file` and the entity's slug (last segment of fqid).
  - Run `git -C <project_root> log --follow --format=%H%x00%aI%x00%aN%x00%s -- <source.file>` to get commits that touched the file.
  - For each commit (cap at 50 to stay snappy):
    - Run `git -C <project_root> show <commit> -- <source.file>` to get the diff.
    - Filter to commits whose diff contains the entity's slug (the slug appears in `id:` lines or as a string referenced from another field). Simple substring match on the diff text is fine for v0.
    - Capture the relevant diff hunks (a few lines on either side of the slug match).
  - Return `{ entity: <ref>, commits: [{ sha, date, author, subject, hunks: [...] }] }`.
- Cache by `(project, fqid, HEAD-sha)`. Invalidate on `refresh=1`.
- Use Bun's `$` template (`import { $ } from "bun"`) for shelling out — idiomatic and easy to plumb.
- **Safety**: this endpoint runs `git` on the project root. Make sure the project root is actually a git repo (`git -C <root> rev-parse --is-inside-work-tree`); return `{ git: false }` cleanly if not. Don't crash.

### Server (status timeline for ADRs)

- Same endpoint covers ADRs naturally — the slug match on ADR-NNNN finds every commit that touched the ADR file. The client renders ADR history specifically by extracting the `status:` field from each historical version. This requires running `git show <commit>:<source.file>` per commit (not the diff, the full file at that commit) and parsing the YAML. Add this as a secondary field on the response only when the entity kind is `decision`: `{ ..., statusTimeline: [{ sha, date, status }] }`.

### Client

- New `lib/api.ts` method: `fetchHistory(projectId, fqid)`.
- New `components/HistoryTimeline.tsx`:
  - Renders a vertical list of commits (newest at top), each commit a card with: smallcap `<author>` + `<short-sha>`, Fraunces `<subject>`, mono `<date>`, plus the diff hunks rendered in Monaco (small editor, language: `yaml`, decorations highlighting added/removed lines).
  - Empty state: `No history — file is uncommitted or git is not available.`
- `EntityDetail` gains a `<details>` section at the bottom labeled "History" — closed by default, opens on click. Calls `fetchHistory` lazily on first open.
- For ADRs, render the `statusTimeline` above the diff list as a small horizontal chip rail: `proposed → accepted → superseded`, with dates.

### Lib

- `lib/history.ts` — types, small utilities for short-sha formatting.

## Files to touch / create

```
viewer/
  server/
    index.ts                 ← new /api/projects/:id/history route
    history.ts               ← new — git command runners, parsing, status-timeline extractor
  client/src/
    lib/
      api.ts                 ← fetchHistory()
      history.ts             ← types + helpers
    components/
      EntityDetail.tsx       ← add collapsible History section
      HistoryTimeline.tsx    ← new — renders commits + diffs + ADR status rail
```

## Implementation order

1. Server: shell out to git, get the commit list for `viewer/sample-lexicon/lexicon/contexts/cold-layer.yaml`. Verify the slug-filter works (the sample has multiple terms in that file — picking one slug should narrow the commits).
2. Add the diff hunk extraction. Keep hunks short (5 lines of context).
3. Status-timeline extractor for ADRs.
4. API endpoint.
5. Client: `HistoryTimeline` component, render basic timeline first.
6. Add Monaco for the diff rendering (reuse `defineTheme(lexicon-ink)` from `PeekDrawer.tsx` — extract that into a shared `lib/monaco-theme.ts` while you're at it; both PeekDrawer and HistoryTimeline use it).
7. Wire into `EntityDetail` as a collapsible section.
8. ADR status chip rail.

## Aesthetic continuity

- Timeline cards use the same `card-inset` styling as the rest of the marginalia.
- Diff lines: added lines have a 1px oxide left rule + tinted background (use `peek-highlight-line` style but with green-ish would clash; stick with oxide — git diffs in oxide read as "the change happened here," not "this is bad").
- Author name in `smallcap`; short-sha in mono micro; subject in Fraunces.
- ADR status rail: arrows between statuses (`→`) in mono, statuses in italic Fraunces small.
- Don't include avatars, even if you find a way to fetch them. The viewer is text-first.

## Done state

- For a term in the sample lexicon, opening "History" shows the commit that introduced it (the `viewer/sample-lexicon/` initial commit). Single commit, calm timeline.
- For lexicon itself if you point the project root at `/Users/huy/src/lexicon` (the actual lexicon repo) and bootstrap it: terms have richer histories. Use this as your real-world test.
- For an ADR (try a real one in the lexicon repo's history), the status timeline shows `accepted` from creation (since none of the sample ADRs supersede each other yet). Synthesize a supersession in a test branch if you want to verify the transition rendering.
- Non-git project: register a project root that isn't a git repo, open an entity, expand history → empty state renders cleanly without errors.
- Files moved between commits (via `git mv`) are followed via `--follow`.

## Caveats

- `git log --follow` only follows single files. If an entity was *split* between files (e.g. a term moved from `system.yaml` to a new `contexts/<slug>.yaml`), the history splits visually and reads as "this entity has two ancestors." Mention this honestly in the empty-state copy: *"Showing history of the file that currently owns this entity. Earlier ownership in other files isn't shown."*
- Diff parsing is bespoke; keep it simple. Don't try to render binary diffs (won't happen for YAML).
- Bun's `$` template handles quoting; still, never interpolate user-controlled strings into shell arguments. The project root path is from SQLite (trusted), the fqid is parsed (trusted), but be careful if future paths take user input directly.
- This path **depends on commit hygiene**. If the user commits an entire crystallization as one commit titled "lex-crystallize", the history is one commit per absorption — not per-mutation. That's fine; the timeline still reads naturally.
- `--format` with NUL separators (`%x00`) makes parsing safe; don't use newline separators.

When this ships, lexicon entities gain temporal depth. The cold layer was always *evolving* — now the viewer shows the evolution.
