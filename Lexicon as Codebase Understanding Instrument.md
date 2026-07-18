---
status: seed
maturity: seed
created: 2026-06-26
related:
  - "[[Tools for Model-Building Minds]]"
  - "[[Programming abstractions]]"
---

## Lexicon as a Codebase Understanding Instrument

This is the `~/src/lexicon` application of [[Tools for Model-Building Minds]].

Lexicon’s real object is not documentation. Its object is **codebase understanding**.

The cold layer is a medium for compressing a living codebase into a small, stable, inspectable mental model that both human and coding agent can share.

## Thesis

A mature codebase is larger than one mind’s working memory.

An engineer can read files, navigate symbols, run tests, and search text, but none of those directly answer:

> What are the load-bearing concepts and invariants of this system?

Lexicon’s bet is that codebase understanding needs a deliberate **model layer** above code:

- small enough to reload every session
- structured enough to catch drift
- close enough to code to stay honest
- explicit enough for human and agent to share vocabulary
- slow-growing enough to represent learning, not typing

The product is not the XML. The product is the moment when the codebase becomes thinkable.

## Observed project shape

Inspected paths:

- `/Users/huy/src/lexicon/README.md`
- `/Users/huy/src/lexicon/CLAUDE.md`
- `/Users/huy/src/lexicon/lexicon-prefs.md`
- `/Users/huy/src/lexicon/viewer/lexicon/system.xml`

Current repository state:

- repo: `/Users/huy/src/lexicon`
- branch: `main`, ahead of `origin/main` by 21 commits
- active modifications include the viewer graph/call-flow work:
  - `viewer/client/src/components/graph/GraphEdge.tsx`
  - `viewer/client/src/components/graph/GraphLensSelector.tsx`
  - `viewer/client/src/lib/graph/build-graph.ts`
  - `viewer/client/src/pages/GraphPage.tsx`
  - `viewer/server/code-intel.ts`
  - `viewer/server/call-flow.ts`
  - `viewer/server/lsp/`
  - `viewer/lexicon/`

The repo has two layers:

1. **Lexicon plugin** — a Claude Code skill and slash-command bundle for adding a cold layer to code projects.
2. **Lexicon viewer** — a local read-only web app for browsing a project’s cold layer and code anchors.

The viewer’s own cold layer describes itself as a “reading room, not an IDE”: single-project, read-only, cold-layer + codebase in one window, with catalog/detail/Monaco peek and graph views.

That phrase matters. Lexicon is not trying to make the code editable. It is trying to make the system readable at the right abstraction level.

## Cognitive problem

The failure mode in agentic coding is not simply lack of context.

It is **model drift under limited working memory**.

A human and an agent can both see files, but still lose the system because:

- names drift across turns
- local fixes violate global boundaries
- invariants are remembered as vibes instead of contracts
- architectural “why” evaporates from the chat
- the agent works from a local slice while the human expects global taste
- the human cannot reload the whole codebase either, so review becomes reactive

The README names the pain directly:

- cognitive / mental model gaps and drifts between human and agents
- attention-level surface for what needs human attention

The deeper statement:

> Code is executable reality, but not the whole mental model needed to change it safely.

## Why code alone is insufficient

Code answers “what happens?”

It is weaker at answering:

- what vocabulary should be used here?
- what boundary should not be crossed?
- what abstraction is load-bearing?
- what is deliberately omitted?
- what historical scar explains this shape?
- what invariant would make this change wrong even if tests pass?

Those are model facts. They may be implied by code, but implication is expensive to reconstruct every session.

Lexicon makes those facts explicit as a cold layer.

## The temperature model

Lexicon’s most important product idea is its temperature model:

| Layer | Changes at speed of | Purpose |
|---|---|---|
| Code | implementation | executable reality |
| Hot layer | active work | plans/specs for current change |
| Cold layer | learning | vocabulary, invariants, bounded contexts, why |

This maps directly onto cognitive work:

- the mind cannot hold the whole codebase
- so it needs stable compression artifacts
- but those artifacts must not churn with every edit
- and they must update when real learning happens

Cold layer is **crystallized understanding**.

Hot layer is **working set scaffolding**.

Code is **reality check**.

## What Lexicon already nails

### 1. Ubiquitous language as shared working memory

The load-bearing DDD idea is not ceremony. It is vocabulary alignment.

If the same nouns appear in code, cold layer, and conversation, the human-agent pair can maintain a shared model across long sessions.

### 2. Ground before work

`/lexicon:ground` forces the agent to reload the small model before touching code. This is exactly the working-memory extension move.

### 3. Crystallize after learning

`/lexicon:crystallize` reads git diff since `lexicon/.last-crystallized` and absorbs durable learning into the cold layer. This avoids the failure mode where every insight dies in chat.

### 4. Validate against drift

`/lexicon:validate` turns the cold layer from “docs” into a maintained model that can go stale and be checked.

### 5. Viewer as model-reading room

The viewer treats the cold layer as a navigable graph with code anchors, not as a markdown graveyard. This is the right direction: codebase understanding needs a surface, not only files.

## Product principles

### 1. Optimize for model reload, not documentation coverage

The cold layer should be small enough that an agent and human can reload it at the beginning of work.

A complete doc nobody reads is worse than a partial model that reliably enters working memory.

### 2. Every atom should earn its place by reducing cognitive load

A term, invariant, context, seam, or surface belongs only if it helps future work avoid confusion, drift, or unsafe local reasoning.

### 3. Link abstractions to code reality

A concept without code anchors is suspect.

A code anchor without conceptual explanation is just navigation.

The value is the connection.

### 4. Preserve the propose-confirm-apply discipline

Cold-layer edits should stay deliberate. If the model changes too easily, it becomes another noisy artifact rather than a crystallized understanding layer.

### 5. Make contradictions visible

When code and cold layer disagree, do not hide it under summaries. Surface it as a model/code contradiction:

- code drifted from intended model
- model is stale
- vocabulary is wrong
- boundary was never real

### 6. Prefer bounded-context thinking over file-tree thinking

Files are storage. Contexts are cognitive boundaries.

The viewer should help the user see concepts, invariants, seams, and flows — not just directories.

## Feature candidates

### A. Model reload card

Before work starts, produce a small card:

- active bounded contexts
- key terms
- invariants likely to matter
- known seams
- deliberate omissions
- files most relevant to this scope

Goal: get the right model into working memory fast.

### B. Vocabulary drift detector

Compare a diff/conversation/spec against cold-layer terms.

Surface:

- new nouns that may deserve terms
- renamed concepts
- overloaded words
- ambiguous synonyms
- code identifiers that violate ubiquitous language

### C. Boundary violation lens

Use cold-layer context/module ownership to flag edits that cross a boundary.

Not “block the change,” but ask:

> Is this a legitimate seam change or a local patch leaking across contexts?

### D. Call-flow / behavior lens

The active viewer work around `call-flow.ts` and graph/canvas components points at an important next step: model not only static concepts but runtime behavior.

A codebase mental model needs both:

- conceptual graph: terms, contexts, invariants
- execution graph: calls, events, flows, data movement

The product opportunity is showing where these two graphs align or diverge.

### E. Concept-to-code trace

For any term/invariant/context, show:

- defining text
- code anchors
- call-flow participation
- tests that exercise it
- recent commits that touched it
- open contradictions or TODOs

### F. Change impact model

Given a proposed change, ask:

- which terms are affected?
- which invariants may be invalidated?
- which bounded contexts does it cross?
- what cold-layer atom would need to change if this is accepted?

### G. Crystallization diff UI

The viewer is currently read-only, and that is good. But it can still render a proposed crystallization before the terminal applies it:

- mutation set preview
- affected atoms
- code evidence
- old/new model text
- “needs Huy decision” markers

Editing can remain outside the viewer while comprehension improves inside it.

### H. Code lens as flagship

The strongest concrete direction is the current code-lens idea:

> The cold layer owns the significant node set; tooling derives live code edges.

This is exactly the right cognition split. Human/agent curation decides which concepts matter; tree-sitter, LSP, and call-flow analysis derive how those concepts currently relate in code.

The code lens should show:

- structural edges: `extends`, `implements`, `uses`
- behavior edges: `calls`
- edge source and confidence: tree-sitter, LSP-resolved, degraded/name-matched
- anchor health: missing files, missing symbols, ambiguous symbols, stale line ranges
- mismatch warnings: concept documented but not traceable; central code symbol unanchored

### I. Context-map evidence

The next high-leverage architecture lens is a bounded-context map backed by observed code evidence:

- bounded contexts as primary nodes
- seams as typed edges: shared-kernel, anticorruption-layer, conformist, customer-supplier, separate-ways
- imports/calls overlaid as observed evidence
- mismatch warnings:
  - code crosses a boundary but no seam exists
  - seam exists but no code relation supports it
  - declared separate-ways but code still calls across the boundary

## Non-goals

- Not comprehensive generated docs.
- Not a replacement for tests.
- Not an IDE.
- Not a generic code search UI.
- Not automatic architecture invention by an LLM.
- Not a graph where every symbol becomes a node.
- Not a workflow where the cold layer churns on every small diff.

## Next experiments

### 1. Run Lexicon on itself as a cognition benchmark

Use `viewer/lexicon/system.xml` as the seed and ask:

> Can a new agent understand the viewer faster with this cold layer than without it?

Measure by time-to-safe-change and number of wrong-boundary proposals.

### 2. Build a call-flow lens tied to cold-layer concepts

The current modified files suggest this is already in motion. Make the lens answer:

- which runtime flows instantiate this concept?
- which concepts are only documented but not traceable?
- which code paths cross context seams?

### 3. Add “model delta” to crystallize

When crystallizing, distinguish:

- vocabulary addition
- invariant refinement
- boundary correction
- concept split/merge
- deliberate omission
- stale atom removal

This helps the human see what kind of understanding changed.

### 4. Create a codebase-understanding benchmark fixture

Use `viewer/test-fixtures/` to build scenarios:

- renamed concept drift
- boundary leak
- wrong abstraction
- stale invariant
- unanchored term

Then validate that Lexicon catches them.

### 5. Make the viewer reveal cognitive load

Show when a context is too large, too under-anchored, too disconnected, or has too many unnamed seams.

The viewer should not just display the model. It should show where the model is weak.

### 6. Dogfood stale-doc/model drift

Subagent exploration found likely stale viewer docs/model areas:

- `viewer/README.md` still appears to describe YAML/ADR-era language, while current code/schema use XML v1.0 and specs-as-Markdown.
- `viewer/lexicon/contexts/graph-model.xml` may lag the current three-lens shape: `ownership`, `surfaces`, `code`.
- `viewer/lexicon/surfaces/graph-view.xml` may still mention older decisions/affects/supersedes remnants.

This is not just cleanup. It is a perfect Lexicon dogfood case: the model drifted from the code, so the tool should make that drift visible and crystallizable.

### 7. Build deterministic anchor validation

Use the current `viewer/server/code-intel.ts`, `viewer/server/call-flow.ts`, and `viewer/server/lsp/` direction to validate cold-layer anchors:

- symbol exists
- file exists
- line ranges are still plausible
- duplicate anchors point to the same symbol
- symbol lookup is ambiguous
- anchored concepts participate in derived code edges

This would make `skills/lexicon/validators/` real instead of aspirational.

## The sharper product sentence

Lexicon is a system for turning a codebase from “too many files” into a small, shared, inspectable mental model.

The user should not leave saying:

> I found the file.

They should leave saying:

> I understand the shape of the system and what would make this change unsafe.

That is codebase understanding.
