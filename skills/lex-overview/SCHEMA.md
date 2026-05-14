# Lexicon cold-layer schema

This file is the **normative specification** of the cold-layer YAML schema. `lex-overview`'s `SKILL.md` loads this file as part of the overview; every other lexicon skill consumes it transitively by virtue of loading `lex-overview` first. Don't read or modify this file in isolation — read `SKILL.md` alongside it for the workflow context that gives the schema meaning.

When the schema bumps, this is one of the two source-of-truth surfaces that must update (the other is the viewer's executable schema at `viewer/server/schema.ts`). A new migration delta under `skills/lex-migrate/migrations/v<old>-to-v<new>.md` is also required so existing projects can upgrade — see `CLAUDE.md` at the repo root for the full schema-bump checklist.

## Schema specification

The current cold-layer schema is **v0.3**. Every YAML file declares `schemaVersion: "0.3"` at the top.

> **Loader compatibility:** v0.3 is breaking. Files declaring `"0.1"` or `"0.2"` are recognized by the loader, which emits a single `LoadIssue` per file pointing at `lex-migrate`. The loader does **not** attempt partial resolution. Projects on older schemas (including pre-v0.1 markdown) are brought forward by `lex-migrate`; per-version transitions are documented in `skills/lex-migrate/migrations/v<old>-to-v<new>.md`, not here. **This file is the current spec only; historical deltas belong in migration files.**

The full design rationale for the v0.2 → v0.3 bump (what changed and why, what was deliberately not added, what was deferred) lives in `DESIGN-v0.3.md` at the repo root.

## Conceptual model (DDD vocabulary)

The schema is a faithful encoding of Eric Evans' Domain-Driven Design building blocks, with two intentional deviations:

- **Surfaces & regions** (UI layout vocabulary) are a lexicon invention bridging DDD with design-system thinking. Evans is backend; lexicon treats UI vocabulary as first-class for projects that put pixels in front of humans.
- **Repositories and Factories are not modeled.** They are tactical-pattern bookkeeping in code, not modeling vocabulary. The model knows about `Customer`, not `CustomerRepository`.

Everything else follows Evans: ubiquitous language inside bounded contexts; entities, value objects, services, and domain events as term categories; aggregates with roots; shared kernels for inter-context coordination; the eight context-map relationship kinds as the seam `kind` enum; subdomains classified as core / supporting / generic, plus an `overlay` tier for installation-specific contexts that don't fit Evans' three (a lexicon extension to handle platform-vs-installation overlays).

### Notes on selected fields

A few fields warrant authoring guidance the entity shapes alone don't convey:

- **`narrative`** (on `system`, `bounded-context`) — multi-paragraph prose that carries the throughline *above* the atom layout: lifecycle, disambiguation argument, how a request moves through this context. Typically 3–5 paragraphs. Atoms keep their crisp definitions; narrative is the layer above them. A project that doesn't need narrative (single-context CLI tool, ~10 atoms total) leaves the field absent — it's optional everywhere.
- **`rationale`** (on `invariant`, `term`, `seam`, `aggregate`, `module`, `shared-kernel`, `boundary-rule`) — the **argument that justifies the model choice**, not a description of the choice. An invariant whose statement says "X must hold" and whose rationale repeats "because X must hold" carries no signal — rewrite or delete. Historical narrative ("we picked this in March because of a deadline") belongs in a development journal, which this schema deliberately does not have; rationale captures the timeless argument, not the chronology.
- **`overlays`** (on `system`) — first-class slot for the platform-vs-installation overlay (a platform is domain-agnostic, but this particular installation adds a medical / legal / retail set of components, resources, and invariants). One overlay = `{id, name, description?, items?, invariants?}`. Backend-only / single-installation projects leave the field empty, same as `surfaces/`.
- **`deliberateOmissions[].triggers`, `.relatedAtoms`** — `triggers: [<string>]` says "revisit when X happens"; `relatedAtoms: [<fqRef>]` points at the atoms the omission gestures at (e.g. a `term/macro` whose only purpose is to mark the absent-but-named concept). Both optional.
- **`[[fqid]]` inline links** — valid in any prose-bearing field. Form: `[[fqid]]` or `[[fqid|display label]]`. The fqid resolves with the same fallback chain as structured refs (owner-scoped first, then common shorthands, then qualified split). Dangling links surface as warning `LoadIssue`s — same severity as a dangling `disambiguatesFrom`. **Authoring rule:** when prose in a narrative or rationale names another atom, use `[[fqid]]` so the link graph stays machine-traversable. Reserve plain backticks for code identifiers, not entity references.

### Shared rules

- **IDs are slugs** (`^[a-z0-9][a-z0-9-]*$`). Scoped within their owner (bounded context, shared kernel, or surface); a slug must be unique within its owner file. Across owners the canonical form is `<owner-slug>/<entity-slug>` (fully qualified). Kernel-owned atoms use `kernel/<kernel-slug>/<entity-slug>` for **terms** and `kernel/<kernel-slug>/invariant/<invariant-slug>` for **invariants** — the explicit `invariant/` segment matters and is a common source of dangling-ref bugs when authoring prose by hand. Use the resolver's owner-scoped fallback (a bare sibling slug inside a kernel resolves to the same kernel) to keep cross-references short.
- **Names are display strings**, mutable. Rename by changing `name`; never change the slug to "fix" a name — that breaks references. If the slug genuinely no longer fits, that's a deliberate `lex-crystallize` operation (rename → cascade).
- **Refs** in fields like `disambiguatesFrom`, `supersedes` (where it remains), `participants`, `relatedAtoms`, `members`, `consumers` may be written as a short slug when unambiguous in context, or as `<owner-slug>/<entity-slug>` when qualification is needed. Resolvers try both.
- **Prose-bearing fields** (`definition`, `statement`, `rationale`, `body`, `purpose`, `narrative`, `role`, `description`, `identityRule`, `equality`, `returns`, `emittedWhen`, `payload`, the `reason` on a deliberate omission, the `description` on an overlay) carry the human voice. The schema names the slot; it doesn't constrain the content. Multi-line YAML literals (`|` or `>`) are normal. Any prose field may carry `[[fqid]]` interlinks.
- **`status: deprecated`** is the soft-delete on terms / invariants / seams / aggregates / modules / shared-kernels. Hard delete is allowed when the entity is mistakenly created; git is the audit trail.

### File kinds

| `kind:` | File location | Aggregate |
|---|---|---|
| `system` | `lexicon/system.yaml` | Root; contexts index, shared kernels, overlays, deliberate omissions |
| `bounded-context` | `lexicon/contexts/<slug>.yaml` | One context; its owned terms, invariants, seams, boundary rules, aggregates, modules |
| `surface` | `lexicon/surfaces/<slug>.yaml` | One UI surface; its regions |

The `lexicon/decisions/` directory is not part of v0.3. ADR-shaped content is captured as `rationale` on the atoms the argument touches; historical-decision capture is deferred to a future skill.

### Entity shapes (annotated)

```yaml
# system.yaml
schemaVersion: "0.3"
kind: system
id: <project-slug>
name: <Project name>
purpose: |
  One paragraph: what this system does, for whom. Stays as a teaser even
  when `narrative` is present.
narrative: |                    # optional — the throughline
  Multi-paragraph prose tying the contexts and shared kernels into a story.
  Use `[[fqid]]` interlinks: `[[context/foo]]`, `[[kernel/identity]]`,
  `[[kernel/identity/user-id]]`.
contexts:                       # list of <context-slug>s (or context/<slug>)
  - <slug>
sharedKernels:                  # named shared sub-models across ≥2 contexts
  - id: <slug>
    name: <Display>
    description: |
      What this kernel covers; what swapping it out would change.
    participatingContexts:
      - <context-ref>
    rationale: |
      Why these contexts share this model rather than each owning their
      own or routing through an ACL.
    terms:                      # see term shape below; category-aware
      - id: <slug>
        name: <Display>
        category: value         # entity | value | service | event | concept
        definition: |
          ...
        # category-specific fields optional; see term shape
    invariants:                 # see invariant shape below
      - id: <slug>
        name: <Display>
        statement: |
          ...
        rationale: |
          ...
overlays:                       # optional — installation-specific tier
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
    triggers:                   # optional — what would prompt a revisit
      - <Short, concrete signal>
    relatedAtoms:               # optional — atoms this gestures at
      - <fqRef>
```

```yaml
# contexts/<slug>.yaml
schemaVersion: "0.3"
kind: bounded-context
id: <slug>                      # must match filename slug
name: <Display>
subdomain: core                 # optional: core | supporting | generic | overlay
purpose: |
  One-paragraph framing — stays as a teaser even when `narrative` is present.
narrative: |                    # optional — the local lifecycle / flow
  Multi-paragraph prose walking the context's atoms in story order. Use
  `[[fqid]]` interlinks; owner-scoped lookups resolve sibling slugs without
  qualification — `[[seam/foo]]` finds the seam in this same context.
codeModules:                    # optional: code globs/paths this context owns
  - src/<module>/**
terms:
  - id: <slug>
    name: <Display>
    category: entity            # entity | value | service | event | concept
    definition: |
      ...
    disambiguatesFrom: [<ref>, ...]
    symbols:                    # optional code anchors
      - file: <repo-relative path>
        lineStart: <int>        # optional
        lineEnd: <int>          # optional
        symbol: <human label>   # optional
    rationale: |                # optional — why this term is in the model
      ...
    # category-specific fields (all optional; render conditionally)
    identityRule: |             # entity only
      What gives an instance its stable identity.
    equality: |                 # value only
      When two instances are interchangeable.
    operatesOn: [<term-ref>, ...]  # service only
    returns: |                  # service only
      ...
    emittedWhen: |              # event only
      The triggering condition.
    payload: |                  # event only
      What the event carries.
    consumers: [<ref>, ...]     # event only — contexts or service-terms that react
invariants:
  - id: <slug>
    name: <Display>
    statement: |
      ...
    rationale: |
      ...
    validationMode: code|linter|principle
    constrainsCode: [<anchor>, ...]
aggregates:                     # optional — transactional-consistency clusters
  - id: <slug>
    name: <Display>
    root: <term-ref>            # must be an entity-category term
    members: [<term-ref>, ...]  # entity + value terms inside the boundary
    invariants: [<invariant-ref>, ...]  # the transactional invariants
    rationale: |
      Why this cluster, why this root.
modules:                        # optional — Evans-sense concept clusters
  - id: <slug>
    name: <Display>
    description: |
      ...
    members: [<ref>, ...]       # terms, invariants, aggregates in this cluster
    rationale: |
      Why this grouping — what cohesion holds these atoms together.
seams:
  - id: <slug>
    name: <Display>
    kind: anticorruption-layer  # see seam kind enum below
    description: |
      ...
    rationale: |                # optional — why this kind, why this direction
      ...
    # asymmetric kinds (customer-supplier, conformist, anticorruption-layer,
    # open-host-service) carry upstream + downstream:
    upstream: <context-ref>
    downstream: <context-ref>
    # symmetric kinds (shared-kernel, published-language, partnership,
    # separate-ways) carry participants instead:
    participants: [<context-ref>, ...]
boundaryRules:
  - id: <slug>
    rule: |
      <Plain-language directional rule>
    from: <context-ref>
    to: <context-ref>
    rationale: |                # optional — why this rule
      ...
```

```yaml
# surfaces/<slug>.yaml
schemaVersion: "0.3"
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

### Seam kind enum

The eight Evans context-map relationships, plus `unknown` for un-triaged seams:

| `kind` | Direction | Meaning |
|---|---|---|
| `shared-kernel` | symmetric | References a `shared-kernel` entity; both sides maintain a shared sub-model in lockstep |
| `customer-supplier` | asymmetric | Upstream commits to downstream's needs; coordinated planning |
| `conformist` | asymmetric | Downstream takes upstream's model as-is, no translation |
| `anticorruption-layer` | asymmetric | Downstream translates upstream's model at the boundary to protect its own |
| `open-host-service` | asymmetric | Upstream publishes a well-defined integration surface for any downstream |
| `published-language` | symmetric | Both sides agree on a shared interchange format |
| `partnership` | symmetric | Both sides coordinate planning together |
| `separate-ways` | symmetric | Explicit non-integration; the contexts deliberately ignore each other |
| `unknown` | either | Default for un-triaged seams; surfaced by loader as a warning |

For asymmetric kinds the loader expects `upstream` and `downstream`. For symmetric kinds it expects `participants`. For `unknown` either shape is accepted.

The canonical examples ship at `${SKILL_DIR}/templates/*.yaml.example` next to `lex-bootstrap`'s SKILL.md. Examples are reference shapes; the spec above is normative.

## Anchoring discipline

The schema's optional fields (`symbols`, `constrainsCode`, `validationMode`, `disambiguatesFrom`, `rationale`) are *optional in the parser, expected in practice*. Skipping them turns the cold layer into a glossary divorced from the code — a doc that ages without the project, the exact failure mode lexicon is built to prevent.

Treat the fields as defaults-to-fill, not nice-to-haves:

- **`symbols` on a term** — every term that maps to a code identifier gets at least one anchor. The anchor is what makes the term verifiable: a reader (human or agent) can jump from the glossary to the implementation and check whether they still align. A term about a class or function with no `symbols` is a smell — either the term is purely conceptual (category=concept, no code analog) or the anchor is missing.
- **`constrainsCode` + `validationMode` on an invariant** — if the invariant is enforceable by code or linter, list the call sites/files and set `validationMode: code` or `linter`. If it's a judgment call only humans uphold, set `validationMode: principle` and document it as such. Empty `validationMode` is the worst of both worlds: the reader can't tell whether to look for tooling or to trust the team.
- **`rationale` on the atoms that carry it** — without rationale, a seam kind is a label without an argument; an aggregate is a cluster without a justification; a shared kernel is "stuff we share" without "why we share it." Rationale is what makes the model defensible. Missing rationale isn't a parse error; it's a thinking debt.
- **`disambiguatesFrom` on a term** — whenever two terms collide (same word, different meanings; same shape, different scope), record the pair. The graph view renders these as visible edges, and the reader sees the distinction before they conflate the concepts.

### Term category discipline

Every term has a `category`. Defaulting to `concept` is fine for purely scaffolding vocabulary, but for a term that maps to actual code, picking the right category matters:

- **`entity`** — the thing has stable identity that survives attribute changes. A `Customer` with a renamed email is still the same customer. Carry `identityRule` to record what gives that identity.
- **`value`** — interchangeable by attributes. Two `Money` instances with the same `(amount, currency)` are the same money. Carry `equality` to state the equality semantics.
- **`service`** — a stateless operation acting on entities and values. Domain services only; application/infrastructure services are code-organization concerns and don't earn a model slot. Carry `operatesOn` and `returns`.
- **`event`** — a fact that happened at a point in time, named in past tense (`OrderPlaced`, `PaymentSettled`). Carry `emittedWhen`, `payload`, and (if known) `consumers`.
- **`concept`** — scaffolding vocabulary: workflow names, design phases, lexicon-internal terms. No code analog expected.

`lex-audit` checks for a smell: if ≥80% of terms in a project are `category: concept` after migration, the schema's gain is being left on the table — surface the list and invite recategorization.

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
