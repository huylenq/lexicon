# Lexicon cold-layer schema

This file is the **normative specification** of the cold-layer YAML schema. `lex-overview`'s `SKILL.md` loads this file as part of the overview; every other lexicon skill consumes it transitively by virtue of loading `lex-overview` first. Don't read or modify this file in isolation — read `SKILL.md` alongside it for the workflow context that gives the schema meaning.

When the schema bumps, this is one of the two source-of-truth surfaces that must update (the other is the viewer's executable schema at `viewer/server/schema.ts`). A new migration delta under `skills/lex-migrate/migrations/v<old>-to-v<new>.md` is also required so existing projects can upgrade — see `CLAUDE.md` at the repo root for the full schema-bump checklist.

## Schema specification

The current cold-layer schema is **v0.2**. Every YAML file declares `schemaVersion: "0.2"` at the top. New work emits v0.2.

> **Loader compatibility:** the loader still accepts `schemaVersion: "0.1"` files — every v0.2 addition is an optional field, so v0.1 files validate unchanged. Projects on older schemas (including pre-v0.1 markdown) are brought forward by `lex-migrate`; per-version transitions are documented in `skills/lex-migrate/migrations/v<old>-to-v<new>.md`, not here. **This file is the current spec only; historical deltas belong in migration files.**

### Notes on selected fields

A few fields warrant authoring guidance the entity shapes alone don't convey:

- **`narrative`** (on `system`, `bounded-context`, `decision`) — multi-paragraph prose that carries the throughline *above* the atom layout: lifecycle, disambiguation argument, why-this-decision-touched-those-invariants story. Typically 3–5 paragraphs. Atoms keep their crisp definitions; narrative is the layer above them. A project that doesn't need narrative (single-context CLI tool, ~10 atoms total) leaves the field absent — it's optional everywhere.
- **`overlays`** (on `system`) — first-class slot for the platform-vs-installation overlay (a platform is domain-agnostic, but this particular installation adds a medical / legal / retail set of components, resources, and invariants). One overlay = `{id, name, description?, items?, invariants?}`. Backend-only / single-installation projects leave the field empty, same as `surfaces/`.
- **`deliberateOmissions[].triggers`, `.relatedAtoms`** — `triggers: [<string>]` says "revisit when X happens"; `relatedAtoms: [<fqRef>]` points at the atoms the omission gestures at (e.g. a `term/macro` whose only purpose is to mark the absent-but-named concept). Both optional.
- **`[[fqid]]` inline links** — valid in any prose-bearing field. Form: `[[fqid]]` or `[[fqid|display label]]`. The fqid resolves with the same fallback chain as structured refs (owner-scoped first, then common shorthands, then qualified split). Dangling links surface as warning `LoadIssue`s — same severity as a dangling `disambiguatesFrom`. **Authoring rule:** when prose in a narrative or rationale names another atom, use `[[fqid]]` so the link graph stays machine-traversable. Reserve plain backticks for code identifiers, not entity references.

### Shared rules

- **IDs are slugs** (`^[a-z0-9][a-z0-9-]*$`). Scoped within their bounded context (relative); a slug must be unique within its owner file. Across contexts the canonical form is `<context-slug>/<entity-slug>` (fully qualified).
- **Names are display strings**, mutable. Rename by changing `name`; never change the slug to "fix" a name — that breaks references. If the slug genuinely no longer fits, that's a deliberate `lex-crystallize` operation (rename → cascade).
- **Refs** in fields like `disambiguatesFrom`, `affects`, `supersedes`, `contexts`, `relatedAtoms` may be written as a short slug when unambiguous in context, or as `<context-slug>/<entity-slug>` when qualification is needed. Resolvers try both.
- **Prose-bearing fields** (`definition`, `statement`, `rationale`, `body`, `purpose`, `narrative`, `role`, `context`, `decision`, `consequences`, `alternatives`, the `reason` on a deliberate omission, the `description` on an overlay) carry the human voice. The schema names the slot; it doesn't constrain the content. Multi-line YAML literals (`|` or `>`) are normal. Any prose field may carry `[[fqid]]` interlinks.
- **`status: deprecated`** is the soft-delete. Hard delete is allowed when the entity is mistakenly created; git is the audit trail.

### File kinds

| `kind:` | File location | Aggregate |
|---|---|---|
| `system` | `lexicon/system.yaml` | Root; cross-cutting terms/invariants, contexts index, deliberate omissions |
| `bounded-context` | `lexicon/contexts/<slug>.yaml` | One context; its owned terms, invariants, seams, boundary rules |
| `decision` | `lexicon/decisions/ADR-<NNNN>-<slug>.yaml` | One ADR, append-only |
| `surface` | `lexicon/surfaces/<slug>.yaml` | One UI surface; its regions |

### Entity shapes (annotated)

```yaml
# system.yaml
schemaVersion: "0.2"
kind: system
id: <project-slug>
name: <Project name>
purpose: |
  One paragraph: what this system does, for whom. Stays as a teaser even
  when `narrative` is present.
narrative: |                    # optional, v0.2 — the throughline
  Multi-paragraph prose tying the contexts and cross-cutting atoms into
  a story. Use `[[fqid]]` interlinks: `[[context/foo]]`, `[[term/bar]]`,
  `[[decision/ADR-0001]]`, `[[some-cross-cutting-term]]`.
contexts:                       # list of <context-slug>s (or context/<slug>)
  - <slug>
crossCuttingTerms:              # terms that span ≥3 contexts
  - id: <slug>
    name: <Display>
    definition: |
      ...
    disambiguatesFrom: [<ref>, ...]    # optional
    symbols:                            # optional code anchors
      - file: <repo-relative path>
        lineStart: <int>                # optional
        lineEnd: <int>                  # optional
        symbol: <human label>           # optional
crossCuttingInvariants:
  - id: <slug>
    name: <Display>
    statement: |
      ...
    rationale: |
      ...
overlays:                       # optional, v0.2 — installation-specific tier
  - id: <slug>                  # e.g. medical-battery, retail-battery
    name: <Display>
    description: |              # may carry [[fqid]] interlinks
      Why this overlay exists; what swapping it out would and wouldn't change.
    items:                      # optional free-form bulleted list
      - <string>
    invariants:                 # optional, scoped to this overlay
      - statement: |
          ...
        rationale: |
          ...
deliberateOmissions:
  - topic: <Short>
    reason: |
      Why this is omitted, with optional [[fqid]] interlinks.
    triggers:                   # optional v0.2 — what would prompt a revisit
      - <Short, concrete signal>
    relatedAtoms:               # optional v0.2 — atoms this gestures at
      - <fqRef>
```

```yaml
# contexts/<slug>.yaml
schemaVersion: "0.2"
kind: bounded-context
id: <slug>                      # must match filename slug
name: <Display>
purpose: |
  One-paragraph framing — stays as a teaser even when `narrative` is present.
narrative: |                    # optional, v0.2 — the local lifecycle / flow
  Multi-paragraph prose walking the context's atoms in story order. Use
  `[[fqid]]` interlinks; owner-scoped lookups resolve sibling slugs without
  qualification — `[[seam/foo]]` finds the seam in this same context.
modules:                        # optional: code globs/paths this context owns
  - src/<module>/**
terms:
  - id: <slug>
    name: <Display>
    definition: |
      ...
    disambiguatesFrom: [<ref>, ...]
    symbols: [...]              # as above
invariants:
  - id: <slug>
    name: <Display>
    statement: |
      ...
    rationale: |
      ...
    validationMode: code|linter|principle
    constrainsCode: [<anchor>, ...]
seams:
  - id: <slug>
    name: <Display>
    description: |
      ...
    participants: [<context-ref>, ...]
boundaryRules:
  - id: <slug>
    rule: |
      <Plain-language directional rule>
    from: <context-ref>
    to: <context-ref>
```

```yaml
# decisions/ADR-<NNNN>-<slug>.yaml
schemaVersion: "0.2"
kind: decision
id: ADR-<NNNN>
title: <Short title>
date: <YYYY-MM-DD>
status: proposed|accepted|superseded
supersedes: [ADR-<MMMM>, ...]   # optional
supersededBy: ADR-<MMMM>        # optional, set when later ADR supersedes this one
affects: [<ref>, ...]           # optional: terms/invariants/contexts touched
narrative: |                    # optional, v0.2 — the why-this-touched-those story
  Use when the argument spans atoms the structured slots fragment: an ADR
  whose `affects` list contains an invariant + a seam + a term all forming
  one continuous argument. Use `[[fqid]]` to weave them.
context: |
  ...
decision: |
  ...
consequences: |
  ...
alternatives: |
  ...
```

```yaml
# surfaces/<slug>.yaml
schemaVersion: "0.2"
kind: surface
id: <slug>
name: <Display>
route: <route-or-screen-id>     # optional
body: |
  ...
regions:
  - id: <slug>
    name: <Display>
    role: |
      One-line description.
    implementation:
      kind: component             # OR kind: inline
      import: "@/ui/Sidebar"      # when kind: component
      file: <repo-relative path>  # required when kind: inline
      lineStart: <int>            # required when kind: inline
      lineEnd: <int>              # required when kind: inline
```

The canonical examples ship at `${SKILL_DIR}/templates/*.yaml.example` next to `lex-bootstrap`'s SKILL.md. Examples are reference shapes; the spec above is normative.

## Anchoring discipline

The schema's optional fields (`symbols`, `constrainsCode`, `validationMode`, `affects`, `disambiguatesFrom`) are *optional in the parser, expected in practice*. Skipping them turns the cold layer into a glossary divorced from the code — a doc that ages without the project, the exact failure mode lexicon is built to prevent.

Treat the fields as defaults-to-fill, not nice-to-haves:

- **`symbols` on a term** — every term that maps to a code identifier gets at least one anchor. The anchor is what makes the term verifiable: a reader (human or agent) can jump from the glossary to the implementation and check whether they still align. A term about a class or function with no `symbols` is a smell — either the term is purely conceptual (rare in real code), or the anchor is missing.
- **`constrainsCode` + `validationMode` on an invariant** — if the invariant is enforceable by code or linter, list the call sites/files and set `validationMode: code` or `linter`. If it's a judgment call only humans uphold, set `validationMode: principle` and document it as such. Empty `validationMode` is the worst of both worlds: the reader can't tell whether to look for tooling or to trust the team.
- **`affects` on an ADR** — every ADR lists the terms, invariants, and contexts it touches. This is the edge that makes "what decided this?" queryable. An ADR with no `affects` is a story without a subject; it'll get lost when the cold layer grows past memory.
- **`disambiguatesFrom` on a term** — whenever two terms collide (same word, different meanings; same shape, different scope), record the pair. The graph view renders these as visible edges, and the reader sees the distinction before they conflate the concepts.

### Names with code identifiers

A `name` field may contain backtick-wrapped runs to mark code-identifier substrings, markdown-style. Examples:

```yaml
- id: cn-helper
  name: "`cn(...)`"
- id: theme-inline
  name: "`@theme inline` ⇄ raw tokens"
```

The viewer renders backtick-wrapped runs in monospace, so the visual distinction between "an English phrase about code" and "a code identifier verbatim" survives into the UI. Use backticks deliberately when the name *is* (or contains) a code symbol; don't sprinkle them for emphasis.

This is a rendering convention, not a parser rule — the schema accepts any string. But authoring with the convention in mind gives the viewer something to do.
