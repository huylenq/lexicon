# Lexicon cold-layer schema

This file is the **normative specification** of the cold-layer XML schema. The `lexicon` SKILL.md and every subcommand that touches the cold layer references it; read it when you're emitting, mutating, or validating cold-layer XML.

When the schema bumps, this is one of the two source-of-truth surfaces that must update (the other is the viewer's executable schema at `viewer/server/schema.ts`). A new migration delta under `${CLAUDE_SKILL_DIR}/migrations/v<old>-to-v<new>.md` is also required so existing projects can upgrade — see `CLAUDE.md` at the repo root for the full schema-bump checklist.

A hand-authored XSD lives alongside this file at `${CLAUDE_SKILL_DIR}/reference/schema.xsd`. It is a real schema artifact (the kind `xmllint` or `monaco-xml` can consume directly), but v1.0 does not run it at load time — the TypeScript traversal in the viewer's loader is authoritative for runtime validation. The XSD mirrors this spec for the parts it can express (element containment, attribute requirements, simple ID/IDREF cross-refs); semantic rules that XSD can't express (e.g., "an aggregate's invariants must reference fields owned by entities in the aggregate") live in the TypeScript traversal only.

## Current version

The current cold-layer schema is **v1.0**. Every XML file declares `schema="1.0"` as an attribute on its root element.

> **Loader compatibility:** v1.0 is breaking. v0.3 YAML files are recognized by the loader, which emits a single `LoadIssue` per file pointing at the `conform` subcommand. The loader does **not** attempt partial resolution. Projects on older schemas (including pre-v1.0 YAML and pre-v0.1 markdown) are brought forward by `conform`'s structural pass; per-version transitions are documented in `${CLAUDE_SKILL_DIR}/migrations/v<old>-to-v<new>.md`, not here. **This file is the current spec only; historical deltas belong in migration files.**

The full design rationale for the YAML → XML representation flip in v1.0 (what changed and why, what was deliberately not added, what was deferred) lives in the repo-root `CLAUDE.md` and the migration delta. The pre-v1.0 design rationale (Evans-faithfulness, term categories, seam kinds, aggregates, shared kernels) is preserved in `${CLAUDE_SKILL_DIR}/reference/design.md`.

## Conceptual model (DDD vocabulary)

The schema is a faithful encoding of Eric Evans' Domain-Driven Design building blocks, with two intentional deviations:

- **Surfaces & regions** (UI layout vocabulary) are a lexicon invention bridging DDD with design-system thinking. Evans is backend; lexicon treats UI vocabulary as first-class for projects that put pixels in front of humans.
- **Repositories and Factories are not modeled.** They are tactical-pattern bookkeeping in code, not modeling vocabulary. The model knows about `Customer`, not `CustomerRepository`.

Everything else follows Evans: ubiquitous language inside bounded contexts; entities, value objects, services, and domain events as term categories; aggregates with roots; shared kernels for inter-context coordination; the eight context-map relationship kinds as the seam `kind` enum; subdomains classified as core / supporting / generic, plus an `overlay` tier for installation-specific contexts that don't fit Evans' three (a lexicon extension to handle platform-vs-installation overlays).

## XML format conventions

The v1.0 representation makes the ontology structural. Internalize these conventions before authoring or mutating files.

### Element name is the ontological type

Element names *are* the kind discriminator. No separate `kind` field. Root element identifies the file:

- `<system>` — the cold-layer root.
- `<bounded-context>` — one bounded context.
- `<surface>` — one UI surface.

Atom elements identify the entity kind: `<term>`, `<invariant>`, `<seam>`, `<boundary-rule>`, `<aggregate>`, `<module>`, `<shared-kernel>`, `<region>`. Container elements identify structure: `<overlay>`, `<deliberate-omission>`. Anchor elements identify code links: `<code-anchor>`.

Sub-discriminations that the v1.0 schema keeps as attributes (not as element names): term `category`, invariant `mode`, seam `kind`, subdomain classification. These are enum-typed attributes on their owning element. Promoting them to element types is a future-version concern.

### Attributes for identity and small enums; children for substance

Attributes carry: `id` (slug, required on identifiable atoms), `schema` (root only, "1.0"), enum-typed discriminators (`category`, `kind`, `mode`), structural attributes on anchors (`file`, `line-start`, `line-end`, `symbol`, `import`), reference targets (`to`, `ref`).

Children carry: prose (`<purpose>`, `<narrative>`, `<definition>`, `<statement>`, `<rationale>`, `<role>`, `<description>`, `<identity-rule>`, `<equality>`, `<returns>`, `<emitted-when>`, `<payload>`, `<reason>`, `<topic>`, `<trigger>`, `<name>`), structural slots (`<contexts>`, `<members>`, `<participants>`, …), and other atoms.

### Cross-references are uniform `<ref to="fqid"/>` elements

Every reference uses the same element shape: `<ref to="<fqid>"/>`. Self-closing. The `to` attribute carries the fqid; the wrapping context (either a structural slot like `<participating-contexts>` or an inline position inside prose) supplies the semantic interpretation.

Inside prose (mixed content):
```xml
<definition>
  A stable identifier, see <ref to="kernel/viewer-vocabulary/peek"/> for
  the related drawer concept.
</definition>
```

Inside a structural slot:
```xml
<participating-contexts>
  <ref to="lexicon-loading"/>
  <ref to="project-registry"/>
</participating-contexts>
```

The graph builder walks all `<ref>` nodes mechanically. The fqid syntax is unchanged from v0.3 — slugs, `kernel/<kernel-slug>/<term-slug>`, `<context-slug>/invariant/<slug>`, etc. The resolver's owner-scoped fallback chain still applies, so a bare `<ref to="foo"/>` inside a context resolves to that context's `foo` atom without qualification.

There is no `[[fqid]]` syntax in v1.0. Refs are structural everywhere.

### Wrappers only when grouping is semantic

Wrappers like `<contexts>`, `<participating-contexts>`, `<members>` exist because the list is a typed slot (the wrapper says "what kind of refs go here"). But `<term>` and `<invariant>` sit as direct siblings inside `<shared-kernel>` or `<bounded-context>` — no `<terms>` or `<invariants>` wrapper, because the element name disambiguates and the wrapper adds no ontology.

The exception: `<symbols>` wraps a list of `<code-anchor>` elements. The wrapper is retained for parser symmetry with v0.3 and because "this term's set of code anchors" is a meaningful grouping.

### Soft-delete via `status` attribute

`status="deprecated"` on `<term>`, `<invariant>`, `<seam>`, `<aggregate>`, `<module>`, `<shared-kernel>` is the soft-delete. Hard delete is allowed when the entity was mistakenly created; git is the audit trail.

## Canonical serialization conventions

The v1.0 templates, the migration delta's output, and any future write path (editor mode) all emit XML conforming to these rules. Reading code is permissive (xast accepts anything well-formed); writing code is strict.

- **Indent: 2 spaces.** No tabs.
- **One trailing newline at EOF.** No trailing whitespace on any line.
- **Attribute order on each element:** `id` first; then schema/structural attributes (`schema`, `category`, `kind`, `mode`, `status`, `subdomain`, `route`); then semantic attributes (`file`, `line-start`, `line-end`, `symbol`, `import`, `to`, `ref`); then `name=` last when present as an attribute (rare — most atoms carry `<name>` as a child).
- **Short elements on one line.** An element with no children (or a single self-closing child) and short attributes fits on one line: `<code-anchor file="src/foo.ts" symbol="bar"/>`, `<ref to="context/slug"/>`.
- **Prose-content elements multi-line.** `<definition>`, `<rationale>`, `<purpose>`, `<narrative>`, `<statement>`, `<role>`, `<description>`, `<identity-rule>`, `<equality>`, `<returns>`, `<emitted-when>`, `<payload>`, `<reason>`, `<topic>`, `<trigger>` always render with content indented and the closing tag on its own line, even when content is short — preserves diff clarity.
- **Inline `<ref/>` in prose stays inline.** No line breaks around inline refs within a prose-content element; the surrounding text flows.
- **Entity escapes for `<`, `>`, `&`** inside prose content (`&lt;`, `&gt;`, `&amp;`). Use sparingly — prose rarely needs literal angle brackets. CDATA sections are accepted by the parser but conventions discourage them for readability.

## Shared rules

- **IDs are slugs** (`^[a-z0-9][a-z0-9-]*$`). Scoped within their owner (bounded context, shared kernel, or surface); a slug must be unique within its owner file. Across owners the canonical form is `<owner-slug>/<entity-slug>` (fully qualified). Kernel-owned atoms use `kernel/<kernel-slug>/<entity-slug>` for **terms** and `kernel/<kernel-slug>/invariant/<invariant-slug>` for **invariants** — the explicit `invariant/` segment matters and is a common source of dangling-ref bugs when authoring prose by hand. Use the resolver's owner-scoped fallback (a bare sibling slug inside a kernel resolves to the same kernel) to keep cross-references short.
- **Names are display strings**, mutable. The `<name>` element carries the display string for an atom. Rename by changing `<name>`; never change the `id` attribute to "fix" a name — that breaks references. If the slug genuinely no longer fits, that's a deliberate `crystallize` operation (rename → cascade).
- **Refs** are uniformly `<ref to="<fqid>"/>`. The `to` attribute may be a bare slug when unambiguous in context, or a fully-qualified fqid when qualification is needed. Resolvers try both.
- **Prose-bearing elements** (`<definition>`, `<statement>`, `<rationale>`, `<purpose>`, `<narrative>`, `<role>`, `<description>`, `<identity-rule>`, `<equality>`, `<returns>`, `<emitted-when>`, `<payload>`, `<reason>`, `<topic>`, `<trigger>`) carry the human voice. The schema names the slot; it doesn't constrain the content. Mixed content (text interleaved with `<ref/>` elements) is the norm.

## File kinds

| Root element | File location | Aggregate |
|---|---|---|
| `<system>` | `lexicon/system.xml` | Root; contexts index, shared kernels, overlays, deliberate omissions |
| `<bounded-context>` | `lexicon/contexts/<slug>.xml` | One context; its owned terms, invariants, seams, boundary rules, aggregates, modules |
| `<surface>` | `lexicon/surfaces/<slug>.xml` | One UI surface; its regions |

The `lexicon/decisions/` directory is not part of v1.0 (and was not part of v0.3). ADR-shaped content is captured as `<rationale>` on the atoms the argument touches; historical-decision capture is deferred to a future skill.

## Entity shapes (annotated)

### `system.xml`

```xml
<system schema="1.0" id="<project-slug>">
  <name><Project name></name>

  <purpose>
    One paragraph: what this system does, for whom. Stays as a teaser even
    when narrative is present.
  </purpose>

  <narrative>
    Multi-paragraph prose tying the contexts and shared kernels into a
    story. Inline refs flow inside prose: <ref to="context/foo"/>,
    <ref to="kernel/identity"/>, <ref to="kernel/identity/user-id"/>.
  </narrative>

  <contexts>
    <ref to="<context-slug>"/>
  </contexts>

  <!-- Named shared sub-models across ≥2 contexts. -->
  <shared-kernel id="<kernel-slug>">
    <name><Display></name>
    <description>
      What this kernel covers; what swapping it out would change.
    </description>
    <participating-contexts>
      <ref to="<context-slug>"/>
    </participating-contexts>
    <rationale>
      Why these contexts share this model rather than each owning their
      own or routing through an ACL.
    </rationale>

    <!-- Optional multi-paragraph walk-through. Inline <ref/> elements
         become narrative edges to their targets, same as on
         <bounded-context>. -->
    <narrative>
      How participating contexts coordinate around the kernel's atoms,
      with inline <ref to="<kernel-slug>/<term-slug>"/> mentions.
    </narrative>

    <term id="<slug>" category="value">
      <name><Display></name>
      <definition>...</definition>
      <equality>When two instances are interchangeable.</equality>
    </term>

    <invariant id="<slug>" mode="principle">
      <name><Display></name>
      <statement>...</statement>
      <rationale>...</rationale>
    </invariant>
  </shared-kernel>

  <!-- Optional: installation-specific tier (lexicon's overlay extension). -->
  <overlay id="<slug>">
    <name><Display></name>
    <description>
      Why this overlay exists; what swapping it out would change.
      Inline refs welcome: <ref to="..."/>.
    </description>
    <items>
      <item>Free-form bulleted entry</item>
    </items>
    <invariant>
      <statement>...</statement>
      <rationale>...</rationale>
    </invariant>
  </overlay>

  <deliberate-omission>
    <topic><Short></topic>
    <reason>
      Why this is omitted, with inline <ref to="..."/> as needed.
    </reason>
    <trigger><Short, concrete signal></trigger>
    <related-atoms>
      <ref to="<fqid>"/>
    </related-atoms>
  </deliberate-omission>
</system>
```

### `contexts/<slug>.xml`

```xml
<bounded-context schema="1.0" id="<slug>" subdomain="core">
  <name><Display></name>

  <purpose>
    One-paragraph framing — stays as a teaser even when narrative is
    present.
  </purpose>

  <narrative>
    Multi-paragraph prose walking the context's atoms in story order.
    Owner-scoped lookups resolve sibling slugs without qualification — a
    bare <ref to="foo"/> inside this context finds this context's foo.
  </narrative>

  <!-- Optional: code globs/paths this context owns. -->
  <code-modules>
    <path>src/<module>/**</path>
  </code-modules>

  <term id="<slug>" category="entity">
    <name><Display></name>
    <definition>...</definition>
    <disambiguates-from>
      <ref to="<ref>"/>
    </disambiguates-from>
    <symbols>
      <code-anchor file="<repo-relative path>" line-start="<int>" line-end="<int>" symbol="<human label>"/>
    </symbols>
    <rationale>Optional — why this term is in the model.</rationale>
    <!-- Category-specific elements; all optional, render conditionally. -->
    <identity-rule>What gives an instance its stable identity. (entity only)</identity-rule>
    <equality>When two instances are interchangeable. (value only)</equality>
    <operates-on><ref to="<term-ref>"/></operates-on>          <!-- service only -->
    <returns>...</returns>                                       <!-- service only -->
    <emitted-when>The triggering condition.</emitted-when>       <!-- event only -->
    <payload>What the event carries.</payload>                   <!-- event only -->
    <consumers><ref to="<ref>"/></consumers>                     <!-- event only -->
  </term>

  <invariant id="<slug>" mode="code">
    <name><Display></name>
    <statement>...</statement>
    <rationale>...</rationale>
    <constrains-code>
      <code-anchor file="<path>" line-start="<int>" line-end="<int>" symbol="<label>"/>
    </constrains-code>
  </invariant>

  <!-- Optional: transactional-consistency clusters. -->
  <aggregate id="<slug>">
    <name><Display></name>
    <root><ref to="<term-ref>"/></root>           <!-- must point at entity-category term -->
    <members>
      <ref to="<term-ref>"/>                       <!-- entity + value terms only -->
    </members>
    <invariants>
      <ref to="<invariant-ref>"/>
    </invariants>
    <rationale>Why this cluster, why this root.</rationale>
  </aggregate>

  <!-- Optional: Evans-sense concept clusters. -->
  <module id="<slug>">
    <name><Display></name>
    <description>...</description>
    <members>
      <ref to="<ref>"/>
    </members>
    <rationale>Why this grouping — what cohesion holds these atoms together.</rationale>
  </module>

  <seam id="<slug>" kind="anticorruption-layer">
    <name><Display></name>
    <description>...</description>
    <rationale>Why this kind, why this direction.</rationale>
    <!-- Asymmetric kinds carry upstream + downstream: -->
    <upstream><ref to="<context-ref>"/></upstream>
    <downstream><ref to="<context-ref>"/></downstream>
    <!-- Symmetric kinds carry participants instead: -->
    <!--
    <participants>
      <ref to="<context-ref>"/>
    </participants>
    -->
  </seam>

  <boundary-rule id="<slug>">
    <rule>Plain-language directional rule.</rule>
    <from><ref to="<context-ref>"/></from>
    <to><ref to="<context-ref>"/></to>
    <rationale>Why this rule.</rationale>
  </boundary-rule>
</bounded-context>
```

### `surfaces/<slug>.xml`

```xml
<surface schema="1.0" id="<slug>" route="<route-or-screen-id>">
  <name><Display></name>

  <body>
    Optional prose: what this surface is for, when it appears, who
    navigates to it.
  </body>

  <region id="<slug>">
    <name><Display></name>
    <role>One-line description.</role>
    <!-- Implementation variant: extracted component. -->
    <component-impl import="@/ui/Sidebar" file="src/ui/Sidebar.tsx"/>
  </region>

  <region id="<other-slug>">
    <name><Display></name>
    <role>One-line description.</role>
    <!-- Implementation variant: inline block. -->
    <inline-impl file="src/pages/compose.tsx" line-start="973" line-end="987"/>
  </region>
</surface>
```

The two implementation variants are distinct element types (`<component-impl>` vs `<inline-impl>`), not an `<implementation>` wrapper with a `kind` attribute — this is one place where the element-name-as-ontology rule pays off cleanly. A region carries exactly one of the two.

## Seam kind enum

The eight Evans context-map relationships, plus `unknown` for un-triaged seams. Carried as the `kind` attribute on `<seam>`:

| `kind` | Direction | Meaning |
|---|---|---|
| `shared-kernel` | symmetric | References a `<shared-kernel>` entity; both sides maintain a shared sub-model in lockstep |
| `customer-supplier` | asymmetric | Upstream commits to downstream's needs; coordinated planning |
| `conformist` | asymmetric | Downstream takes upstream's model as-is, no translation |
| `anticorruption-layer` | asymmetric | Downstream translates upstream's model at the boundary to protect its own |
| `open-host-service` | asymmetric | Upstream publishes a well-defined integration surface for any downstream |
| `published-language` | symmetric | Both sides agree on a shared interchange format |
| `partnership` | symmetric | Both sides coordinate planning together |
| `separate-ways` | symmetric | Explicit non-integration; the contexts deliberately ignore each other |
| `unknown` | either | Default for un-triaged seams; surfaced by loader as a warning |

For asymmetric kinds the loader expects `<upstream>` and `<downstream>` children. For symmetric kinds it expects `<participants>`. For `unknown` either shape is accepted.

Canonical examples ship at `${CLAUDE_SKILL_DIR}/templates/*.xml.example`. Examples are reference shapes; the spec above is normative.

## Anchoring discipline

The schema's optional elements (`<symbols>`, `<constrains-code>`, the `mode` attribute, `<disambiguates-from>`, `<rationale>`) are *optional in the parser, expected in practice*. Skipping them turns the cold layer into a glossary divorced from the code — a doc that ages without the project, the exact failure mode lexicon is built to prevent.

Treat the elements as defaults-to-fill, not nice-to-haves:

- **`<symbols>` on a term** — every term that maps to a code identifier gets at least one `<code-anchor>`. The anchor is what makes the term verifiable: a reader (human or agent) can jump from the glossary to the implementation and check whether they still align. A term about a class or function with no `<symbols>` is a smell — either the term is purely conceptual (`category="concept"`, no code analog) or the anchor is missing.
- **`<constrains-code>` + `mode="code"|"linter"` on an invariant** — if the invariant is enforceable by code or linter, list the call sites/files and set `mode="code"` or `mode="linter"`. If it's a judgment call only humans uphold, set `mode="principle"` and document it as such. An empty `mode` is the worst of both worlds: the reader can't tell whether to look for tooling or to trust the team.
- **`<rationale>` on the atoms that carry it** — without rationale, a seam kind is a label without an argument; an aggregate is a cluster without a justification; a shared kernel is "stuff we share" without "why we share it." Rationale is what makes the model defensible. Missing rationale isn't a parse error; it's a thinking debt.
- **`<disambiguates-from>` on a term** — whenever two terms collide (same word, different meanings; same shape, different scope), record the pair. The graph view renders these as visible edges, and the reader sees the distinction before they conflate the concepts.

### Term category discipline

Every term has a `category` attribute. Defaulting to `concept` is fine for purely scaffolding vocabulary, but for a term that maps to actual code, picking the right category matters:

- **`entity`** — the thing has stable identity that survives attribute changes. A `Customer` with a renamed email is still the same customer. Carry `<identity-rule>` to record what gives that identity.
- **`value`** — interchangeable by attributes. Two `Money` instances with the same `(amount, currency)` are the same money. Carry `<equality>` to state the equality semantics.
- **`service`** — a stateless operation acting on entities and values. Domain services only; application/infrastructure services are code-organization concerns and don't earn a model slot. Carry `<operates-on>` and `<returns>`.
- **`event`** — a fact that happened at a point in time, named in past tense (`OrderPlaced`, `PaymentSettled`). Carry `<emitted-when>`, `<payload>`, and (if known) `<consumers>`.
- **`concept`** — scaffolding vocabulary: workflow names, design phases, lexicon-internal terms. No code analog expected.

`conform`'s hygiene sweep checks for a smell: if ≥80% of terms in a project are `category="concept"` after migration, the schema's gain is being left on the table — surface the list and invite recategorization.

### Names with code identifiers

A `<name>` element may contain backtick-wrapped runs to mark code-identifier substrings, markdown-style. Examples:

```xml
<term id="cn-helper" category="service">
  <name>`cn(...)`</name>
</term>

<term id="theme-inline" category="concept">
  <name>`@theme inline` ⇄ raw tokens</name>
</term>
```

The viewer renders backtick-wrapped runs in monospace, so the visual distinction between "an English phrase about code" and "a code identifier verbatim" survives into the UI. Use backticks deliberately when the name *is* (or contains) a code symbol; don't sprinkle them for emphasis.

This is a rendering convention, not a parser rule — the schema accepts any string. But authoring with the convention in mind gives the viewer something to do.
