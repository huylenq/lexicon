# lexicon-viewer plans

Each plan file is scoped to a single Claude Code session. Pick one, hand off to a fresh session with `Read viewer/lexicon/plans/<slug>/spec.md and implement it`.

Plans are independent — they can ship in any order, except where a "Depends on" note says otherwise.

## Shipped

- **[Graph view](./_archive/graph-view/spec.md)** — Graph view as a peer to the detail view. Three lenses: ownership, decisions, surfaces. ELK.js layout + custom SVG. Shipped in `5dd7cac`; subsequent commits added the layout-options panel, Phosphor icon glyphs, blueprint/cyanotype theme pivot, and resize-handle extraction.

## Visualization paths

| Plan | What it ships | Status |
|---|---|---|
| [Drift indicators](./drift-indicators/spec.md) | Continuous code↔doc anchor validation. Status pills on code anchors; `/p/:id/drift` triage list; project-list health badges. | planned |
| [Pending crystallization](./pending-crystallization/spec.md) | Surface the gap between retros (forward-flow drift) and the user pulling `lex-crystallize`. Three groupings: by entity, by retro, by check kind. | planned |
| [Search palette](./search-palette/spec.md) | Cmd-K palette across all entity prose. In-memory inverted index, kind filters, recency boost. | planned |
| [Git history](./git-history/spec.md) | Render git history of any entity inline. Commit timeline with diff hunks; ADR status timeline. | planned |
| [Polish bundle](./polish-bundle/spec.md) | Region owner label, self-host Monaco workers, filesystem watcher for auto-refresh, hover-expand for truncated sidebar names. | planned |

## Out of scope (waiting on upstream changes)

- **Per-entity drift timelines** ("flagged in 5 of last 10 retros"). Requires structured-retro evolution, which is a lexicon-skill change (future version past v0.9). Without structured retros, the drift-flag parser would have to read every historical retro markdown — slow and brittle. Revisit when retros become typed records.
- **Snapshot-at-past-commit** ("show me the whole graph as of three months ago"). Could be done by checking out an old version of `lexicon/` and re-running the loader, but the bookkeeping (multiple project roots, ephemeral checkouts) makes this a real feature, not a path. Worth its own design pass when there's evidence the user wants it.

## How the paths compose

The five paths plus polish are **mostly orthogonal** — they touch overlapping files but don't compete for the same concept. Once they all ship, the viewer has:

1. **Two views**: reading (detail) and graph. (B)
2. **Two ambient signals**: drift indicators and pending crystallizations. (C, D)
3. **Two ways to find things**: sidebar (catalog) and palette (jump). (E)
4. **Two temporal modes**: current and historical. (F)
5. **Removed friction**: live refresh, self-hosted assets, accurate labels. (G)

That's a coherent v1.0 of lexicon-viewer.

## When to write a new plan file

When you find a feature idea that:

1. Doesn't fit cleanly into an existing path's scope.
2. Is implementable in one session of focused work (rough heuristic: < 8 files touched, < 1000 lines diff).
3. Has enough open questions that a fresh session would need 5+ minutes of orientation.

Write it as `PATH-<next-letter>-<KEBAB-NAME>.md` next to the others, following the structure of Path B (the most complete and the model the others copy): *Read first → Goal → Non-goals → Scope (server/client/lib) → Files → Implementation order → Done state → Caveats*.

If an idea is *smaller* than that, it's a polish item — bundle it into a follow-up Path G-style file rather than minting a path of its own.
