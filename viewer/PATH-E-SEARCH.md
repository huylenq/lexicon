# Path E: Search palette

Cmd-K command palette across all entity prose in the loaded project. One Claude Code session.

## Read first

- `viewer/PATH-B-GRAPH-VIEW.md` § "What lexicon-viewer is" — viewer architecture.
- `viewer/server/schema.ts`, `viewer/client/src/lib/types.ts` — what fields exist on each entity (terms have `definition`, invariants have `statement` + `rationale`, ADRs have four prose blocks, etc.).

## The goal

The viewer's current navigation is sidebar-driven. Once a project has more than ~80 entities, the sidebar stops being a fast index — the user knows the name they want and needs to *jump* to it. Search is the answer.

This is not algolia. It's a small in-memory inverted index over the loaded `ResolvedGraph`, surfaced as a Cmd-K palette. The viewer is single-user, single-project-at-a-time; the index lives in the browser, rebuilds on each `loadLexicon`, and is gone when the tab closes.

## Non-goals

- Cross-project search. The palette searches only the currently-open project.
- Semantic / embedding search. Plain text matching is enough; v0 of lexicon-viewer is a reference tool, not a research surface.
- Search-and-replace. Read-only, like the rest of the viewer.

## Concrete v0 scope

### Palette UX

- Trigger: `cmd-k` (mac) / `ctrl-k` (others). Also a small "Search" button in `ProjectShell`'s top strip with the keyboard shortcut shown next to it.
- Overlay: centered modal, ink-2 background, 600px wide, opens with focus on the input.
- Input: monospace, large (1.25rem), no border, oxide caret. Placeholder: `Search Lexicon · names, definitions, ADRs…`
- Results: a list of cards under the input. Each card shows entity kind (smallcap glyph), name (Fraunces), fqid (mono small), and a single-line snippet of the matched prose with the matched substring highlighted (oxide background, ink text).
- Up/Down arrows move selection; Enter navigates; `escape` closes.
- Show the top 12 results. If more match, show a `+N more` note at the bottom — refine the query.
- Kind filter chips above the result list: `terms`, `invariants`, `decisions`, `surfaces`, `regions`, `contexts`. Click a chip to scope. Chips are calm — outlined, oxide when active.

### Ranking

A simple weighted score is enough for v0:

- Exact name match: 100.
- Name prefix match: 80.
- Name contains query: 50.
- ID (fqid) contains query: 40.
- Definition / statement / rationale / body contains query: 20.
- Other prose fields (context / decision / consequences / alternatives for ADRs): 10.

Boost recently-visited entities by +5 (cheap recency signal — see "session memory" below). Tie-break on entity-kind preference: terms > invariants > decisions > surfaces > regions > contexts (terms are the most likely thing a user wants).

### Implementation strategy

- **Index building**: when `ResolvedGraph` loads, iterate every entity once and build a flat array of `IndexEntry = { fqid, kind, name, fqidLower, nameLower, body: string }` where `body` is the concatenation of all prose fields lowercased. This is the search corpus.
- **Search**: on every keystroke (debounced 80ms), filter the index. The corpus is small (hundreds of entities even on big projects); linear scan beats lucene-in-the-browser.
- **Snippet generation**: when scoring on a body match, find the substring and return a 100-char window centered on the match. Use a simple `String.indexOf` after lowercasing the query.
- **Recency**: keep a small `recentFqids: string[]` in localStorage (per-project key, capped at 20). Update on every entity navigation. Boost matches that appear in the list.

### Server changes

None. The graph response already includes everything the index needs.

### Client structure

- `lib/search.ts` — `buildIndex(graph) → IndexEntry[]`, `search(index, query, kindFilter) → ScoredResult[]`, `getSnippet(text, query) → string`.
- `lib/recency.ts` — `getRecent(projectId)`, `recordVisit(projectId, fqid)`, both backed by `localStorage`.
- `components/SearchPalette.tsx` — the modal overlay, input, results list. Uses a portal so it renders above everything.
- `components/SearchTrigger.tsx` — small button for the top strip showing the kbd shortcut.
- `pages/ProjectPage.tsx` — global keydown listener for cmd-k; record visits in the `useEffect` that fires when `activeFqid` changes.

### Aesthetic

- The palette is a *floating index card*, not a Discord-style search bar. Sharp corners. 1px rule border. Slight inset shadow on the input itself (`inset 0 -1px 0 var(--color-rule)`) — the only place in the viewer with an inset shadow, to signal "this is the focus."
- Highlighting matched text: oxide background (`bg-oxide`), ink text. Strong but not loud because it's small.
- Selected result has a 2px oxide left rule (reusing the `.active-rule` class).
- The "+N more" footer is a smallcap line, no count badge.

## Files to touch / create

```
viewer/
  client/src/
    lib/
      search.ts              ← new — index + scoring + snippets
      recency.ts             ← new — localStorage helpers
    components/
      SearchPalette.tsx      ← new — modal + input + results
      SearchTrigger.tsx      ← new — top-strip button
    pages/
      ProjectPage.tsx        ← mount palette, global cmd-k listener, record visits
    styles/
      index.css              ← (optional) palette-specific tokens if reused styles aren't enough
```

## Implementation order

1. `search.ts` in isolation — write it against the sample lexicon's `ResolvedGraph`. Verify scoring manually for a few queries (`worker`, `crystalliz`, `ADR-0003`, `region`).
2. `SearchPalette` component using a portal. Wire to a local `useState({ open, query, results, selectedIdx, kindFilter })`.
3. Cmd-K listener in `ProjectPage`. Keydown handler at document level when the project shell is mounted, cleaned up on unmount.
4. Result navigation: arrow keys move `selectedIdx`, Enter calls `navigate(to)`.
5. Recency tracking.
6. Top-strip trigger button.
7. Polish: focus management (return focus to caller when closing), `escape` to close, click-outside to close.

## Done state

- `cmd-k` opens the palette from any project route. `cmd-k` again or `escape` closes.
- Typing "term" returns the Term entity at the top (exact name match), then Region (kind term... wait, region is also a term-named thing? — test this; if the substring "term" appears in many definitions, you'll get a long list. Confirm the ordering by exact-name beats substring).
- Typing "scope-match" doesn't match any entity name in the sample, but does match the invariant in `cold-layer.yaml`'s `cold-doc-stays-small` rationale — verify it appears with a snippet.
- Typing "ADR-0003" routes to the ADR.
- Kind filter `terms` removes everything except terms.
- Enter navigates and closes the palette; the visited entity records as recent; reopening the palette with empty query shows recents (use this as the empty-query state — better than blank).

## Caveats

- The index lives in the browser. If a project's `ResolvedGraph` is ever paginated server-side (not in v0), this whole approach revisits. Don't optimize for that case yet.
- Don't add fuzzy search (Levenshtein, trigrams) in v0. Lowercase substring + prefix matching is sharp enough; fuzziness encourages typos and confuses ranking. Add later if the user reports false negatives.
- The recency-boost is +5. Don't make it dominate; the user's *current* query is the strongest signal.
- localStorage key shape: `lexicon-viewer.recent.${projectId}`. Capped at 20 entries (FIFO eviction).

When this ships, navigation gets fast at any project size. The sidebar becomes a *catalog* (for browsing); the palette becomes the *jump-to* (for searching). Both modes coexist.
