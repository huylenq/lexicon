---
name: lex-migrate
description: "Schema and structural migration for lexicon-using projects. Two modes: (A) convert a v0.x markdown lexicon (system.md / views/*.md / decisions/*.md) into v0.1 YAML; (B) bring a v0.1 YAML lexicon up to v0.2 conformance — lift informal `battery:` blocks into `overlays`, formalize `[[fqid]]` inline links, draft `narrative` at scopes that warrant it, enrich `deliberateOmissions` with `triggers`/`relatedAtoms`. Trigger when the user says 'migrate lexicon', 'convert lexicon to YAML', 'upgrade lexicon to v0.1', 'upgrade lexicon to v0.2', 'lexicon doesn't have narrative / overlays / inline links', when system.yaml references `battery:` or other non-canonical top-level keys, or when lex-ground / lex-bootstrap / lex-audit detects structural violations of the v0.2 schema. Surfaces unconverted artifacts as a triage report. Read lex-overview first."
---

# Lexicon: migrate

This skill is the home for **schema and structural migrations** of a project's cold layer. It runs in one of two modes:

- **Mode A — markdown → v0.1 YAML.** Converts a v0.x markdown cold layer (`lexicon/system.md`, `lexicon/views/*.md`, `lexicon/decisions/*.md`) into the v0.1 YAML files (`lexicon/system.yaml`, `lexicon/contexts/*.yaml`, `lexicon/decisions/*.yaml`, `lexicon/surfaces/*.yaml`).
- **Mode B — v0.1 → v0.2 structural conformance.** Brings a YAML cold layer up to v0.2: lifts non-canonical top-level keys into the schema's homes (`battery:` → `overlays:`), formalizes prose-link shorthand (`(→ slug)` and bare `[[…]]` blobs) as resolvable `[[fqid]]` interlinks, drafts `narrative` at scopes that warrant it (system; bounded-contexts with ≥4 atoms; ADRs whose argument spans multiple atoms), enriches `deliberateOmissions` with `triggers` / `relatedAtoms` when the prose already names them.

Both modes are **forward-only** and apply edits **deliberately** — the agent proposes the full mutation set in conversation, the user reviews, edits apply. Anything ambiguous is preserved as-is and listed in the migration report.

If you haven't loaded `lex-overview` yet this session, read it first — the schema you're targeting is defined there.

## Picking a mode

Read the project's `lexicon/` directory before deciding:

| Project state | Mode |
|---|---|
| Has `lexicon/system.md` (no YAML) | **A**: markdown → v0.1 YAML |
| Has `lexicon/system.yaml` with `schemaVersion: "0.1"` *and* (a) non-canonical top-level keys, (b) `[[fqid]]` patterns in prose without schema support, (c) `(→ slug)` style arrow refs in prose, (d) long `purpose:` fields where a `narrative:` was clearly attempted inline, or (e) the user explicitly asks to upgrade to v0.2 | **B**: v0.1 → v0.2 structural |
| Has `lexicon/system.yaml` clean on v0.1 and the user doesn't ask to upgrade | **Refuse** with a one-liner ("Already on YAML, conforming to v0.1. Nothing to migrate. Run `lex-audit` if you want a backward-flow check.") |
| Has both `system.md` and `system.yaml` | **Stop** and surface — inconsistent state, user must pick canonical |

When in doubt between B and "refuse", lean toward surfacing what you found ("I see `battery:` and three `(→ context-slug)` prose patterns; want me to lift these into v0.2 conformance?") and let the user decide.

## When to run this

Run when:

- The user explicitly asks ("migrate lexicon", "convert lexicon to YAML", "upgrade lexicon to v0.1", "upgrade lexicon to v0.2", "make this conform to the v0.2 schema").
- `lex-ground` or `lex-bootstrap` detects `lexicon/system.md` (Mode A trigger) and the user agrees to migrate first.
- `lex-ground` / `lex-audit` reports specific v0.2 violations (Mode B trigger) and the user agrees to conform.

Don't run when:

- There's nothing to migrate (no `system.md`, no `system.yaml`) — the project either doesn't use lexicon or was started fresh. Refer to `lex-bootstrap`.
- The user wants to keep using markdown (Mode A) — that's a fine choice. Don't half-migrate.
- The cold layer is on v0.1 and the user is happy with v0.1 prose. Mode B is opt-in; don't push it.

---

# Mode A — markdown → v0.1 YAML

Convert a v0.x markdown cold layer into v0.1 YAML files. Mechanical; no improvisation of meaning. If a project on Mode A also happens to satisfy a v0.2 trigger (rare, since Mode A is for pre-YAML projects), run Mode A first, then propose Mode B as a follow-up — don't fold them.

## Pre-flight checks

1. Confirm `lexicon/system.md` exists and `lexicon/system.yaml` does not. If both exist, stop — the project is in an inconsistent state and the user has to resolve which is canonical before migration can proceed.
2. Confirm the user has explicitly asked or agreed. Migration creates new files and the user should understand what's happening.
3. Recommend committing first. The migration is mechanical and reversible via `git checkout`, but a clean starting commit makes review easier.

## Phase 1 — Inventory the markdown lexicon

Walk `lexicon/` and bucket every file:

| Source | Target |
|---|---|
| `lexicon/system.md` | `lexicon/system.yaml` + zero-or-more `lexicon/contexts/*.yaml` |
| `lexicon/views/<slug>.md` | `lexicon/contexts/<slug>.yaml` |
| `lexicon/views/design-system.md` | `lexicon/contexts/design-system.yaml` + `lexicon/surfaces/*.yaml` for any surfaces named inside |
| `lexicon/decisions/ADR-<NNNN>-<slug>.md` | `lexicon/decisions/ADR-<NNNN>-<slug>.yaml` |
| `lexicon/retros/*.md` | **unchanged** (retros remain markdown for now) |
| `lexicon/audits/*.md` | **unchanged** (audits remain markdown for now) |
| `lexicon/bootstrap.md` | **unchanged** (triage report stays markdown) |
| `lexicon/plans/**` | **unchanged** |
| `lexicon/.last-crystallized` | **unchanged** |

Anything else (custom files, sub-directories not listed above) is logged in the migration report; don't touch it.

## Phase 2 — Parse `system.md`

The v0.x system.md template's section structure was reasonably consistent:

| Markdown section | Maps to YAML |
|---|---|
| `# System: <name>` | `name:` |
| `## Purpose` | `purpose:` |
| `## Glossary` | `crossCuttingTerms:` (each `- **Term**: definition` entry becomes one term) |
| `## Bounded contexts` | `contexts:` index. Each `### <Context name>` subsection becomes a `bounded-context` file (Phase 3). |
| `### Boundary rules` (under Bounded contexts) | `boundaryRules:` on whichever context the rule belongs to, or cross-cutting if it spans many |
| `## Invariants` | `crossCuttingInvariants:` |
| `## Architecture seams` | seams on relevant contexts; cross-cutting only if they truly span everything |
| `## Design system` | becomes `lexicon/contexts/design-system.yaml`, plus `lexicon/surfaces/*.yaml` for the `### Surfaces & regions` subsection (Phase 4) |
| `## Decisions worth knowing` | parsed for ADR cross-references; the section itself doesn't survive (decisions live in their own files) |
| `## Things deliberately not specified` | `deliberateOmissions:` |

### Parsing glossary entries

The convention was `- **<Term>**: <definition>` (sometimes with trailing "NOT to be confused with X."). Extract each:

- `id:` is the kebab-case slug of `<Term>`.
- `name:` is `<Term>` as written.
- `definition:` is the prose after the colon, with any "NOT to be confused with X" clause split out into `disambiguatesFrom: [<slug-of-X>]`.

### Parsing invariant entries

Same shape — `- **<Invariant name>**: <statement>. <Why it matters; what breaks if it's violated.>`. Split the body on the first sentence boundary if the markdown intermixes statement and rationale; otherwise leave the whole body in `statement:` and the user can split during the triage.

### Code anchors

The v0.x markdown didn't have a stable code-anchor format. If you find ad-hoc patterns like `(see src/foo.ts:42)` inside a definition, extract them as `symbols:` entries. Don't infer anchors from raw grep — only convert what was explicitly written.

## Phase 3 — Parse each `views/<slug>.md`

The v0.x view template mirrors the system.md shape but scoped:

| Markdown section | Maps to YAML |
|---|---|
| `# View: <Context name>` | `name:` |
| `## Scope` | `purpose:` |
| `## Glossary (terms owned by this view)` | `terms:` |
| `## References (terms used here but owned elsewhere)` | **discarded** — references are inferred at read-time from `disambiguatesFrom` and other refs; no need to list. Log discarded references in the migration report so the user can verify nothing important was lost. |
| `## Invariants` | `invariants:` |
| `## Architecture seams` | `seams:` |
| `## Decisions worth knowing` | parsed for cross-references; section discarded |
| `## Things deliberately not specified` | **discarded** — only `system.yaml` carries the project-wide deliberate-omissions list. View-scoped omissions are usually really invariants stated negatively; surface them in the report for the user to decide. |

Emit `lexicon/contexts/<slug>.yaml`. Filename slug matches `id:`.

## Phase 4 — Parse the design-system view

The v0.x `lexicon/views/design-system.md` (or the `## Design system` section in system.md if no separate view existed) has subsections:

| Subsection | Maps to |
|---|---|
| `### Tokens (canonical sources)` | Cross-cutting terms in `design-system.yaml`, one term per token category, with `symbols:` pointing at the canonical source file path. *Don't* parse individual hex codes — the canonical source owns values. |
| `### Component vocabulary` | Cross-cutting terms in `design-system.yaml`. |
| `### Layout primitives` | Same. |
| `### Surfaces & regions` | Each `**<Surface name>** (<route>):` heading becomes a `lexicon/surfaces/<slug>.yaml` file with the regions parsed from the bullets. The region implementation tag (`*Component*: <import>` or `*Inline*: <file>:<lineStart>–<lineEnd>`) maps directly to the `implementation:` sum type. |
| `### Interaction patterns` | Cross-cutting terms. |
| `### Accessibility invariants` | Invariants in `design-system.yaml`, `validationMode: linter` where the original implies tooling, else `principle`. |

If the project's design system is small (lives only as a section in system.md, no separate view, < 5 components total), don't create a `contexts/design-system.yaml` — let those entries stay as `crossCuttingTerms` in `system.yaml`. Surface this choice in the migration report.

## Phase 5 — Convert ADRs

For each `lexicon/decisions/ADR-<NNNN>-<slug>.md`:

| Markdown line/section | Maps to |
|---|---|
| `# ADR-<NNNN>: <title>` | `id:` (the `ADR-<NNNN>` part), `title:` |
| `Date: <iso>` | `date:` |
| `Status: <proposed/accepted/superseded by ADR-MMMM>` | `status:` enum, plus `supersededBy:` if the status names a superseder |
| `## Context` | `context:` |
| `## Decision` | `decision:` |
| `## Consequences` | `consequences:` |
| `## Alternatives considered` | `alternatives:` |

`affects:` is not in the v0.x format — leave empty and surface in the migration report as "ADR-NNNN has no `affects:` set; recommend filling during next audit or crystallize."

After all ADRs are converted, do a second pass to set bidirectional supersession: if ADR-A says it supersedes ADR-B (extracted from prose), set `supersededBy: ADR-A` on ADR-B. If the prose says "superseded by ADR-X" but ADR-X exists, set `supersedes: [ADR-Y]` on ADR-X. Surface any one-sided supersession (A says it supersedes B, but B's prose doesn't acknowledge) for user review.

## Phase 6 — Detect inferred contexts

Some v0.x projects kept all bounded contexts as subsections of `system.md` rather than as separate `views/*.md` files. After Phase 2, if `system.yaml` has more than one bounded context defined inline and any of those contexts owns ≥3 entries (terms / invariants / seams / rules combined), promote it to its own `lexicon/contexts/<slug>.yaml` (same emission logic as Phase 3, source is the relevant `system.md` subsection rather than a view file).

Contexts with no per-context detail (only a name and a one-paragraph purpose in the v0.x system.md) **still get a stub file** at `lexicon/contexts/<slug>.yaml`:

```yaml
schemaVersion: "0.1"
kind: bounded-context
id: <slug>
name: <Display>
purpose: |
  <The one-paragraph purpose from v0.x system.md.>
modules:
  - <best-guess module globs if v0.x prose mentions them>
```

Stub files are cheap and they pull two important properties into the cold layer: (a) `system.yaml`'s `contexts:` index resolves cleanly with no dangling references, and (b) the viewer renders the context as a real cluster on the graph (an empty cluster still communicates "this is a thing"). Do **not** invent an `inlineContexts` field on `system.yaml` to embed them inline — the v0.1 schema doesn't carry that field and the loader will silently drop it, making the contexts invisible.

## Phase 6b — Cross-context seams and boundary rules

v0.x `system.md` often had top-level "Cross-context architecture seams" or "Cross-context boundary rules" sections. The v0.1 schema scopes both to a single owning context:

- A **seam** lives on the bounded context where the *primary owner* of the joint sits, with `participants:` listing the other side(s).
- A **boundary rule** lives on the context named in its `from:` field.

Emission rule: pick one owning context per cross-cutting entry. Do not duplicate the same seam or rule into multiple files; do not preserve a top-level `crossCuttingSeams` / `crossCuttingBoundaryRules` array on `system.yaml`. The schema has no slot for either, and zod will strip them silently.

If the v0.x prose genuinely names both sides as equally primary (no clear owner), pick the context that *creates* the joint (for boundary rules, that's the `from:` context). Flag the choice in the migration report so the user can move it if they disagree.

## Phase 6c — Battery / installation-specific blocks

Some v0.x system.md files carry a "Battery" or "Installation-specific" section that distinguishes platform UL from the specific deployment's components. The v0.1 schema has no `battery:` slot. Three legitimate destinations:

- **Cross-cutting `deliberateOmissions`** — "Multi-tenancy is deferred" *is* a deliberate omission; phrase the battery scope similarly ("This system ships with the medical-pipelines battery; alternative batteries are out of scope today").
- **A dedicated stub bounded context** — if the battery names ≥3 modules or has its own terms/invariants, emit it as `contexts/<battery-slug>.yaml` with a `purpose:` that says "Battery-level — specific to this installation."
- **Body prose on the relevant inline context stubs** — if the battery items each belong to a specific context (medical RAG → medical-knowledge-integration, format converters → ingestion-and-format-conversion), distribute them to the relevant context stubs' `purpose:` or `body:`.

Pick exactly one. Do **not** invent a top-level `battery:` array on `system.yaml`.

## Phase 7 — Validate the emitted YAML

After all files are emitted, parse them yourself and check:

- Every `disambiguatesFrom:` / `affects:` / `supersedes:` / `supersededBy:` ref resolves to an existing entity. Every entry in `system.yaml`'s `contexts:` index has a matching `contexts/<slug>.yaml` file.
- Every term ID is unique within its owning file.
- Every ADR ID is unique across `lexicon/decisions/`.
- Every `surfaces/<slug>.yaml`'s `id:` matches its filename.
- Schema version on every file is `"0.1"`.
- **No invented top-level keys.** The only top-level keys the schema accepts on `system.yaml` are: `schemaVersion`, `kind`, `id`, `name`, `purpose`, `body`, `contexts`, `crossCuttingTerms`, `crossCuttingInvariants`, `deliberateOmissions`. If migration was tempted to emit `inlineContexts`, `crossCuttingSeams`, `crossCuttingBoundaryRules`, `battery`, or anything else not on that list, fix it (see Phases 6, 6b, 6c) — zod strips unknown keys silently and the content goes invisible.

Dangling refs and validation failures go in the migration report; the user resolves them, not the agent.

## Phase 8 — Park the markdown originals

Don't delete the markdown files. Move them to `lexicon/_pre-migrate-archive/` so the user can:

- Compare YAML against original markdown.
- Recover anything the migration discarded (cross-context References sections, deliberate-omissions per view).
- Git-history-check what the migration did.

Once the user has accepted the migration and is on YAML in real use, they can `rm -rf lexicon/_pre-migrate-archive/` themselves. Don't delete on their behalf — that's data loss.

## Phase 9 — Write the migration report

Write `lexicon/migrate.md` (note: distinct from `bootstrap.md`):

```markdown
# Migration report
Migrated on: <iso timestamp>
From: v0.x markdown
To: v0.1 YAML

## What was emitted
- `lexicon/system.yaml` (<N> cross-cutting terms, <I> cross-cutting invariants, <C> contexts indexed)
- `lexicon/contexts/` with <K> context files: <list>
- `lexicon/decisions/` with <A> ADRs converted
- `lexicon/surfaces/` with <S> surface files (or "no surfaces; backend-only or no Design system section in source")

## Archived originals
- Moved to `lexicon/_pre-migrate-archive/`
- Feel free to delete after verifying the YAML matches your intent

## Validation findings
- Dangling refs: <N> (listed below)
- Duplicate IDs: <N>
- One-sided supersession: <N>

## Items needing follow-up
- ADRs missing `affects:` (all <A> of them, since v0.x didn't carry this field)
- Terms without `symbols:` (v0.x markdown didn't carry code anchors as structured data; even if the prose named a file, migration didn't extract it). List the count and recommend filling during the next `lex-audit` — see Anchoring discipline in `lex-overview`.
- Invariants without `constrainsCode:` and/or `validationMode:` — same reason. List the count and the same recommendation.
- View-scoped "deliberately not specified" entries discarded (<N> items, listed below for user to re-add if real invariants)
- Cross-context References sections discarded (<N> items — pure metadata, but listed below so you can verify)
- <Any other parsing ambiguities you encountered>

## Untouched files
- `lexicon/retros/`, `lexicon/audits/`, `lexicon/plans/`, `lexicon/bootstrap.md`, `lexicon/.last-crystallized` — left as-is
- Custom files: <list, if any>

## Next steps
1. Open the project in lexicon-viewer (or any YAML editor) and spot-check the emitted YAML.
2. Resolve any dangling refs and duplicate IDs.
3. Run `lex-audit` for a backward-flow check against current code.
4. If everything looks right, delete `lexicon/_pre-migrate-archive/`.
```

## Phase 10 — Tell the user

One-line chat summary:

> Migration complete. Emitted <N> YAML files across system / contexts / decisions / surfaces. Originals archived in `lexicon/_pre-migrate-archive/`. <V> validation issues to review. Report at `lexicon/migrate.md`.

Don't dump the report content into chat. The file is the artifact; chat is the pointer.

---

# Mode B — v0.1 → v0.2 structural conformance

The v0.1 schema atomized prose into typed records — every term has a definition, every invariant has a statement+rationale, every ADR has context/decision/consequences/alternatives. This worked but lost the *connective tissue* between atoms: the lifecycle prose, the disambiguation argument, the platform-vs-installation overlay, the "what does this ADR's argument touch" throughline. Mode B brings the cold layer up to v0.2 by lifting that connective tissue back into the schema where it belongs.

It applies to projects already on YAML. It is **not** a content rewrite — atoms stay atomic; their `definition`/`statement`/`rationale` stays. Mode B adds the layer *above* the atoms (`narrative`, `overlays`, enriched `deliberateOmissions`) and **formalizes prose-link conventions** that were already in spontaneous use.

## Pre-flight checks

1. Confirm `lexicon/system.yaml` exists and is parseable (zod-validates as v0.1 or v0.2). If the file fails to parse, stop and surface — fix the YAML first.
2. If `schemaVersion` is already `"0.2"` on every file *and* the structural-violation scan (Phase B-1) finds nothing, refuse: "Already on v0.2 with no structural violations; nothing for me to do."
3. Recommend committing first. Mode B edits multiple files; a clean starting commit makes the diff easy to review.

## Phase B-1 — Scan for structural violations

Read every file in `lexicon/` (system.yaml, contexts/*.yaml, decisions/*.yaml, surfaces/*.yaml). For each, look for these violation patterns and produce a per-file findings list. **Do not edit yet** — first surface everything to the user.

### 1. Non-canonical top-level keys

The only top-level keys the v0.2 schema accepts on `system.yaml` are: `schemaVersion`, `kind`, `id`, `name`, `purpose`, `narrative`, `body`, `contexts`, `crossCuttingTerms`, `crossCuttingInvariants`, `deliberateOmissions`, `overlays`. On `bounded-context` files: `schemaVersion`, `kind`, `id`, `name`, `purpose`, `narrative`, `modules`, `body`, `terms`, `invariants`, `seams`, `boundaryRules`. On `decision` files: schema fields plus `narrative`. On `surface` files: as v0.1.

Any other top-level key is a violation. The common one to look for: a `battery:` block on `system.yaml` (sometimes guarded by a comment like `# Non-canonical block — the loader strips it`). Less commonly: `inlineContexts`, `crossCuttingSeams`, `crossCuttingBoundaryRules`. All are signals the v0.1 schema lacked a slot for content the user had to keep.

### 2. Pre-formal prose-link patterns

Scan every prose-bearing field for any of:

- `[[<text>]]` — already in the v0.2 form, but possibly with a slug that won't resolve. Validate and surface dangling ones.
- `(→ <slug>)`, `(see <slug>)`, `→ <slug>`, `cf. <slug>` — arrow-style references the user wrote when no formal link existed. Candidates to formalize as `[[fqid]]`.
- Long inline references like ``context's `term-name`-backed flow``. These are typically prose; only formalize when the backtick-spanned name *is* a known atom slug. Don't be greedy.

For each candidate, check whether the named slug resolves against the project's entities. If yes, propose formalizing. If no, flag as "looks like a reference but the target isn't in the cold layer" — surface to user as either a missing atom or a typo.

### 3. Missing `narrative` at scopes that warrant it

A scope "warrants" a narrative when atoms outnumber the user's ability to hold them as one story in mind. Rules of thumb:

- **system.yaml** — narrative is warranted if the system has ≥3 contexts or ≥10 cross-cutting atoms total. Smaller systems usually fit in their `purpose` already.
- **bounded-context** — narrative is warranted if the context owns ≥4 atoms across `terms` + `invariants` + `seams` + `boundaryRules`. Below that, `purpose` carries the load.
- **decision** — narrative is warranted only when the ADR's argument *spans* atoms in a way the standard slots fragment. Look for: an ADR with `affects:` referencing ≥3 atoms across ≥2 contexts AND prose in `context`/`decision` that names other atoms. Most ADRs do not need a narrative; the structured slots are enough.

When the scope warrants but the field is absent, flag — do not draft yet. (Drafting is Phase B-4, where the user has already greenlit the scope list.)

### 4. Battery / platform-vs-installation indicators

Beyond an explicit `battery:` block (Violation 1), look for prose patterns that imply a platform-vs-installation overlay even when no structured slot was used:

- A `system.purpose:` that says "the platform is domain-agnostic; this build ships with…"
- A bounded-context with a name like `<domain>-knowledge-integration` whose `purpose` says "battery-level — specific to this installation"
- A `deliberateOmissions` entry like "Alternative batteries are out of scope"

These are signals to propose an `overlays:` entry, even if no `battery:` key existed.

### 5. Flat `deliberateOmissions` that could be enriched

For each `deliberateOmissions` entry, scan its `reason:` text for:

- Phrases like "deferred until X", "blocking the moment Y", "revisit when Z", "becomes a problem when…" → these are `triggers` candidates.
- Backtick-wrapped names or `[[…]]` patterns that resolve to atoms → these are `relatedAtoms` candidates.

Surface the candidate enrichments; do not apply yet. The user reviews them in the proposal phase.

### 6. Inline references to plan files / docs that no longer exist

If prose says `PATH-B`, `PATH-F`, `SLICE-3`, etc. — and the project now stores plans at `lexicon/plans/<slug>/spec.md` — flag the broken reference. The fix is a plain prose rewrite (`PATH-B § X` → `lexicon/plans/<slug>/spec.md`), not a structured link.

### Output of Phase B-1

A findings document. **Do not edit any file yet.** Show the user:

```
Structural conformance scan — <project name>

Non-canonical top-level keys:
  - lexicon/system.yaml: `battery:` block (N items, M invariants)

Pre-formal prose-link patterns:
  - lexicon/contexts/foo.yaml: 4 candidates
    · "(→ bar)" in foo.purpose → resolves to context/bar ✓
    · "see baz" in foo.invariants[2].rationale → unresolved
    · ...
  - lexicon/system.yaml: 2 candidates ...

Scopes warranting narrative (none present):
  - system/<name> (4 contexts, 18 cross-cutting atoms)
  - context/foo (6 atoms)
  - decision/ADR-0003 (affects 5 atoms across 3 contexts)

Battery / overlay indicators:
  - Explicit battery: block on system.yaml
  - context/<name>.purpose:1 says "battery-level"

Enrichable deliberateOmissions:
  - "Macros" — `reason` says "Deferred until copy-paste friction proves real" → trigger candidate

Stale plan-file references:
  - PATH-B, PATH-F (4 occurrences) — fix by rewriting prose
```

Surface this in chat and ask the user which findings to apply. They may want all, or only the structural ones (battery → overlays, schema bump), or only the prose-link formalization. Respect the answer.

## Phase B-2 — Lift non-canonical top-level keys

For each non-canonical top-level key flagged in Phase B-1, propose the structured destination. Apply in this order — known patterns first, then the generic prose-distribution fallback.

### Known patterns

- **`battery:` on `system.yaml`** → `overlays:` entry. Map: `battery.description` → `overlays[0].description`, `battery.items` → `overlays[0].items`, `battery.invariants` → `overlays[0].invariants`. Each battery invariant's prose may need to be split into `{statement, rationale}` to match the overlay-invariant shape; that's a one-time interpretive split, not an atom rewrite. Pick an `id:` slug (`battery`, `<domain>-battery`, or the explicit name if the user used one). The `name:` is the human display label.
- **`inlineContexts:` on `system.yaml`** → emit one `contexts/<slug>.yaml` per entry, add the slug to `system.contexts` index. Drop the inline block.
- **`crossCuttingSeams:` / `crossCuttingBoundaryRules:`** → move each entry to the context named in its `from:` (boundary rule) or to the primary participant (seam). Drop the top-level array. See Mode A Phase 6b for the same logic.

### Generic prose-distribution fallback

For any *other* non-canonical key whose value is structured-prose content (typical shapes: `array of {topic, body}`, `array of {topic, note}`, `array of {title, prose}`, or a single multi-line string), the destination depends on what the content claims to be:

- **Per-entry "guidance" / "policy" / "rubric" entries on a bounded-context file** — distribute into the bounded-context's `body:` field, one `## <topic>` heading per entry, prose underneath. The schema's `body` is a free-prose slot beneath `purpose` / `narrative`; it's the right home for "context-scoped policy and rubrics the schema doesn't model atomically."
- **Per-entry "deliberately not specified" entries on a bounded-context file** (often spelled `omissionsFromV0xView:` or similar) — there is no per-context `deliberateOmissions:` slot in v0.2. Two valid moves: (a) if the entries are system-wide concerns that happen to surface in this context, promote them to `system.deliberateOmissions` with appropriate `relatedAtoms` pointing into this context; (b) if they're truly context-scoped policy ("design-system doesn't enforce a11y contracts in code"), distribute them into the context's `body:` field under a `## Deliberately not specified` heading. Pick per-entry; don't batch.
- **System-level non-canonical keys not covered above** — distribute into `system.body:` as section prose, unless the content is clearly a new structural concern that warrants a *new* top-level key. In the latter case **stop** and surface to user: the schema may need an addition, which is a `lex-meta` call, not a migration.

### What "don't touch" still means

For any non-canonical key whose content is *not* prose-shaped (raw config blobs, structured data the user used as a scratch index, etc.), flag but don't lift. Surface to user with a "this looks like data, not prose; I don't know the right destination" note. Better to leave it visibly non-canonical than to hide it in `body:` where it won't render usefully.

### Recording the lifts

Every lift goes into the migrate.md report's Lifted section with: source key, destination, count of entries moved, and a one-line note on any interpretive splits (the battery-invariants → `{statement, rationale}` shape change is the canonical example). The user can spot-check.

Show the proposed diff for each lift. Apply only after the user says yes (or, for autonomous Mode B runs, after the user has greenlit the whole pass).

## Phase B-3 — Formalize prose-link patterns

For each pre-formal pattern flagged in Phase B-1 that resolves to a real atom:

- `(→ <slug>)` → `([[<fqid>]])` if used parenthetically, or just `[[<fqid>]]` if used inline. Preserve any surrounding punctuation.
- `cf. <slug>`, `see <slug>`, `→ <slug>` → `cf. [[<fqid>]]`, `see [[<fqid>]]`, `→ [[<fqid>]]` (preserve the lead-in word).
- Bare `[[<slug>]]` where `<slug>` is just a kebab-case word and the resolver finds the qualified form (`<context>/<slug>`) — leave the short form when unambiguous; rewrite to qualified form when not (the parser tolerates both, but qualified is robust against future renames).
- Backtick-wrapped names like ``the `foo` term`` where `foo` is a slug — *do not* auto-rewrite. Only formalize when the prose is clearly *referring to the atom*, not *naming the identifier*. Err on the side of leaving them; the user can crystallize later.

For each unresolved pattern: surface as a "looks like a reference to `<slug>` but no atom claims that slug — typo or missing atom?" and leave the prose untouched.

The `[[fqid]]` form follows the resolver's fallback chain: bare slug works when unambiguous; qualified `<context>/<slug>` works always. Use the shortest form that resolves.

## Phase B-4 — Draft `narrative` at warranting scopes

For each scope flagged in Phase B-1 as "warrants narrative but lacks it":

1. **Read the relevant file end to end.** Don't draft from a quick scan.
2. **Identify the throughline.** For a bounded-context: what's the lifecycle, the dependency flow, the "how a request moves through this context" story? For a system: how do contexts compose into one product? For an ADR: how does this decision touch atoms across contexts in one continuous argument?
3. **Draft 3–5 paragraphs.** Atoms keep their atomic definitions; narrative is the layer above. Use `[[fqid]]` interlinks liberally — the narrative's job is to make the link graph readable as prose. Aim for ~250–500 words per scope; longer means the narrative is duplicating atoms and should be trimmed.
4. **Avoid restating atoms.** "The system has `Pipeline`, `Spec`, `Run`, `Event`…" is not narrative — it's a glossary. Narrative says "*authoring* produces a `Pipeline`; *executing* turns it into a `Run`; *resuming* re-folds the event log." The verbs are load-bearing.
5. **Avoid hedging.** Narrative carries opinion. "We chose this because…", "the load-bearing trade is…", "if you're tempted to X, don't because Y." This is where the prose voice that v0.1 atomized gets put back.

Show the user each draft narrative inline. Apply on yes.

## Phase B-5 — Enrich `deliberateOmissions`

For each flagged enrichable omission:

- **`triggers:`** — extract concrete "revisit when" signals from the existing `reason:` text. Phrase each as a short, actionable string (e.g. "Copy-paste friction across pipelines", "User runs a tuning sweep that wants pipeline-level defaults"). 1–3 triggers per entry is plenty.
- **`relatedAtoms:`** — list the atoms the omission gestures at. The classic pattern: an omission about "Macros" gestures at `term/group-node` (the implemented sibling) and `term/macro` (the placeholder term, if one was kept to mark the absent concept). Resolve each against the atom map; flag unresolved.

Apply per-entry on user yes.

## Phase B-6 — Bump `schemaVersion`

For every file that received any v0.2-specific edit (a new `narrative`, a new `overlays`, an enriched omission, a `[[fqid]]` link in prose), update its `schemaVersion:` from `"0.1"` to `"0.2"`. Files that were not touched can keep their `"0.1"` — the loader accepts both, and untouched files don't claim to be v0.2.

## Phase B-7 — Validate

After all edits land, re-parse every file:

- zod-validates as v0.1 or v0.2.
- Every structured ref resolves (no new dangling refs introduced).
- Every `[[fqid]]` in prose resolves.
- No top-level keys outside the v0.2 allow-list.
- `system.overlays[].id` slugs are kebab-case and unique within the overlays list.
- `deliberateOmissions[].relatedAtoms[]` each resolve.

Any failure: surface, ask the user. Do not auto-revert — let the human see what broke.

## Phase B-8 — Update `migrate.md`

If `lexicon/migrate.md` already exists (from a prior Mode A run), append a new section dated today; don't overwrite. If it doesn't exist, create it with the section. Template:

```markdown
## v0.2 structural conformance — <iso date>

### Lifted
- `battery:` on `system.yaml` → `overlays.<id>` (N items, M invariants)
- `inlineContexts:` → N `contexts/<slug>.yaml` stub files
- (other non-canonical blocks)

### Formalized prose links
- N `(→ slug)` patterns → `[[fqid]]`
- N bare `[[slug]]` patterns validated; M qualified
- K unresolved candidates surfaced for user follow-up

### Narratives drafted
- system/<name>
- context/<slug>, context/<slug>, ...
- decision/ADR-NNNN (if any)

### Enriched omissions
- "<topic>" + triggers (N) + relatedAtoms (M)
- ...

### Schema bumped
- N files: "0.1" → "0.2"

### Unresolved / follow-up
- (list every flagged-but-not-applied finding for the user)
```

## Phase B-9 — Tell the user

One-line chat summary:

> v0.2 structural conformance complete. Lifted <N> non-canonical blocks, formalized <P> prose links, drafted narrative at <S> scopes, enriched <O> omissions, bumped <F> files to schemaVersion 0.2. Report appended to `lexicon/migrate.md`.

Don't dump the report into chat. The file is the artifact.

---

## What this skill is NOT

- **Not a redesign.** It preserves existing content as faithfully as possible. If the source was wrong, it stays wrong after migration — the user fixes it later via `lex-crystallize` or `lex-audit`. The exception is Mode B's `narrative` drafting, which is genuinely new prose; that ships only after the user yes's each draft.
- **Not an audit.** It doesn't check the cold layer against the code. That's `lex-audit`'s job; run it after migration if you want backward-flow validation.
- **Not a content rewrite.** Mode B in particular leaves atoms alone (`definition`, `statement`, `rationale` stay). It adds the layer *above* them and formalizes link patterns. If you find yourself wanting to rewrite an atom's prose during Mode B, stop — that's a `lex-crystallize` operation, not a migration.
- **Not lossy by silent choice.** Anything that can't be cleanly mapped (Mode A: View References sections, view-scoped deliberate omissions, ad-hoc cross-references in prose; Mode B: candidate links the resolver couldn't satisfy, custom keys the schema doesn't recognize) is preserved in place *and* listed in the migration report. The user makes the call.
- **Not bidirectional.** Both modes are forward-only. No `lex-unmigrate`. If you want to go back, that's `git revert`.

## On honesty about Mode A's conversion

The v0.x markdown was prose; v0.1 YAML is structured. Some markdown nuance — the way a paragraph hedges, the rhetorical structure of a "Why" section, the choice of bullet vs sentence — doesn't survive the conversion. That's the trade. The user gets stable IDs, typed refs, code anchors, and a graph in exchange for a slight flattening of the prose voice. The prose payload fields (`definition`, `statement`, `rationale`, etc.) carry as much voice as they can; some of the wrapping rhetoric is lost. Tell the user this in chat once after migration if they seem surprised:

> The conversion preserves the content but flattens some of the prose wrapping (rhetorical headers, transitional sentences). Spot-check the YAML against `_pre-migrate-archive/` if a specific entry feels thinner than the original.

Mode B is the partial walk-back: `narrative` puts a layer of prose voice back into the cold layer for projects that need it. v0.1 atomized too eagerly; v0.2 restores the throughline where atoms alone aren't enough.
