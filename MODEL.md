# The Lexicon model

A project has a stable ID, name, description, and one shared semantic document: `lexicon/model.xml`, rooted at `<lexicon schema="3.2">`. The parser, validator, edit protocol, and viewer use only this current schema. Other versions open a document-status screen with Agent available for discussion and explicit migration. See [Migration](MIGRATION.md).

| Item | XML | Meaning |
|---|---|---|
| Context | `<context id="…">` at root | A scope of consistent domain meaning and responsibility |
| Concept | `<concept id="…" classification="…">` inside a context | A domain idea; classification is optional |
| Person | `<person id="…">` at root | A user role |
| Software System | `<system id="…">` at root | A software system of interest or an external system |
| Container | `<container id="…">` inside a system | An application or data store |
| Component | `<component id="…">` inside a container | Functionality behind an interface |
| Relationship | `<relationship id="…" from="…" to="…">` at root | An explained directed connection between structural elements |
| Flow | `<flow id="…">` at root | One named scenario containing ordered relationship occurrences |

Every item requires a name and description and may have annotations and source links. Item IDs are project-wide, unique, stable, and whitespace-free. Source links and steps belong to their owning item; they are not independent model items.

Domain Context and Concept draw on DDD. The four software-structure types follow [C4 abstractions](https://c4model.com/abstractions). A Context and a Software System have different meanings; explain their correspondence with an ordinary relationship where useful. The question determines which vocabulary is needed. A domain-only model remains a complete valid model.

## Dimensions and presentation vocabulary

Domain and Architecture describe modeled meaning and software structure. Source links connect model items to code or documentary evidence. Linked Sources presents the referenced targets. Files presents the filtered filesystem. Views and canvas placement do not change these semantics.

| Feature | UI name | Scope |
|---|---|---|
| Domain plane | Domain | Modeled concepts, language, and rules |
| Architecture plane | Architecture | Modeled software responsibilities and structure |
| Source plane | Linked Sources | Targets referenced by authored source links |
| Filesystem browser | Files | The filtered physical project structure |
| LOC tiles | File Map | A visualization within Files |
| Code and document pane | Source Reader | The selected source content |
| Authored evidence mappings | Source Links | Connections with roles and explanations |

| Term | Meaning |
|---|---|
| Dimension | Domain meaning, software architecture, or source evidence; each describes a different aspect of the system |
| Relationship | An authored connection between model elements, within or across domain and architecture |
| Source link | An authored mapping owned by a model item, with a target, role, and explanation; stored as `code-link` |
| Source target | A referenced code or document location, identified by its kind, file, and locator |
| View | A presentation chosen to answer a question about the shared model |
| Plane | A visual grouping for Domain, Architecture, or Linked Sources, shown individually in 2D or alongside other planes in Combined and Planes |
| Page | A tldraw presentation container holding shapes and layout |

Domain and architecture membership follows an element's existing type. Source targets are reached through SourceLinks; they are not a new Element type. Relationships can cross dimensions, and Flows order occurrences of relationships. Neither is assigned wholesale to one dimension.

Linked Sources derives its file and target objects exclusively from authored source links, with no separate filesystem or parser index. Links that reference the same target share one target object while retaining each link's owner, identity, role, and explanation. File grouping preserves precise symbol, heading, line, and whole-file targets. A target remains addressable when its source is stale, missing, or ambiguous; displaying it does not establish that it resolves.

Files shows the physical structure of the selected checkout within the project discovery scope. Source links connect locations in that structure to model items. Opening an unlinked file does not create a source link or add a target to Linked Sources. Files and directories are not semantic model elements, and the filesystem view is separate from the model planes.

Project filters govern source discovery and the scope used for generation and refinement. They do not remove existing model items, authored links, or projected targets. An authored link can remain readable even when its file is excluded from discovery. See [Project settings](#project-settings) for filtering rules.

## Semantic type hierarchy

```text
ModelItem
├── Element
│   ├── DomainElement
│   │   ├── Context
│   │   └── Concept
│   └── ArchitectureElement
│       ├── Person
│       ├── SoftwareSystem
│       ├── Container
│       └── Component
├── Relationship
└── Behavior
    └── Flow
```

`Element` is named `ModelElement` in TypeScript. These categories are fixed unions, not XML wrappers or user-defined types. All items have identity; Elements specifically identify the participants that relationships may connect. Behavior describes occurrences involving those participants. A scenario is the meaning of a Flow, not an additional type.

### Choosing and composing constructs

| Construct | Semantic obligation | Composition |
|---|---|---|
| Context | Explain the scope in which domain terms and responsibilities have consistent meaning; a directory alone is insufficient | Root element; owns Concepts |
| Concept | Explain a domain idea, its distinguishing identity or value, responsibility, and relevant lifetime; a code symbol alone is insufficient | Exactly one Context parent |
| Person | Explain a user role and its involvement with the system | Root architecture element |
| SoftwareSystem | Explain the software boundary and the outcome or responsibility it provides | Root architecture element; owns Containers |
| Container | Explain an application or data store and its responsibility within the system | Exactly one SoftwareSystem parent; owns Components |
| Component | Explain functionality behind an interface within an application or data store; a domain classification does not establish a Component | Exactly one Container parent |
| Relationship | Explain a directed connection, what connects the endpoints, and applicable conditions | Exactly two Element endpoints; may cross domain, architecture, and containment boundaries |
| Flow | Explain one scenario's trigger, relevant preconditions, ordered interactions, and outcome | Owns one or more ordered FlowSteps referencing Relationships |

Annotations and SourceLinks are owned metadata on any item. FlowSteps are owned occurrences, not Elements or independent ModelItems. Containment does not imply a runtime call, aggregate membership, or consistency enforcement. Domain and architecture elements may correspond through an explained Relationship without sharing identity or parentage.

### Relationship meaning and scenario obligations

State the connection's meaning in its name and description. Domain associations explain membership, classification, or other business meaning. Dependencies explain what one responsibility needs from another and through what mechanism. Implementation correspondences explain how software realizes a domain idea. Runtime interactions explain an action from one participant toward another under relevant conditions. These are review distinctions, not an exclusive enum or new XML attributes; a connection may need more than one explanation.

A Flow step must describe an interaction supported by the referenced Relationship's direction and participants. A connection such as “is classified by” or “implements” does not alone justify a message. Do not turn every static connection into a scenario step. If the observed interaction makes a different claim, author a distinct, supported Relationship. Reuse a Relationship when the claim is the same and only its occurrence or action wording differs.

Use the Flow description and annotations to state its trigger, preconditions where relevant, and outcome. Ground consequential steps and ordering in connecting source, not merely declarations of the participants. Explain domain participants' implementation correspondence when tracing a runtime scenario. Capture an important refusal or failure as a separate named Flow when it helps answer the question. Do not invent branches or claim that the successful path covers all behavior.

### Enforcement and semantic review

The parser and validator enforce legal syntax, identity, containment, endpoint types, and step references. The source-link checker establishes target resolution. Neither proves the meaning of a connection, runtime ordering, or scenario coverage. Agent review must assess those claims against source and qualify intended, observed, and enforced behavior beside the claim. Report structural validity, source-supported correctness, and coverage separately. Unsupported meaning must not be presented as verified merely because the document passes validation.

## Containment and relationships

An element has at most one structural parent: Concept → Context, Container → System, Component → Container. XML nesting supplies `parent` in memory and in embedded patches. Root elements have no parent. Parentage implies grouping, without aggregate consistency, lifecycle ownership, or cascading deletion. Moving an element preserves its ID; removing its parent requires explicitly handling the children and dependent relationships.

Relationships may connect any Context, Concept, Person, System, Container, or Component, including across containment boundaries. Flows and relationships are not endpoints. A relationship named “contains” expresses a domain claim without changing structural parentage. For example, Order and Order Line belong to Ordering while an ordinary relationship describes membership. Do not author a second relationship merely to restate structural nesting.

Use spaced concept names with the first character of every word capitalized, such as `Order Line` and `Purchase Information`. Preserve proper nouns and acronyms. Relationship names use natural verb phrases, such as `supplies results to`. Context names remain natural phrases, such as `Order Management`. This is an authoring preference, not a validation requirement; explicit user terminology takes precedence. Preserve existing names unless renaming is requested. Casing applies to display names only: keep stable IDs, exact code-link files and symbols, descriptive labels, and prose unchanged. Project names retain their chosen spelling.

A relationship's name is the relation: “contains,” “supplies results to,” or “translates.” Both endpoints must identify structural elements. Repeated relationships can carry different meanings, rules, or code evidence.

## Annotations and DDD

Attach `<annotation kind="rule|rationale|explanation|…">text</annotation>` to any item. Kind is a short descriptive label. Optional `evidence="observed|intended|enforced"` distinguishes a reading of behavior, a proposed consistency rule, and an explicit check. Keep the qualification beside the claim.

Concept classification is an optional label. DDD classifications such as `entity`, `value`, `service`, `event`, and `aggregate` help when their semantics explain the domain. Context relationships can describe shared kernels and upstream/downstream or translation boundaries. Explain the coordination in the relationship's description.

An aggregate is represented by a concept classified `aggregate`, relationships to its members, and an annotation describing its consistency rules. State which rules the implementation enforces. A shared-kernel relationship should explain the model being shared and the coordination it requires. Data transfer alone establishes a dependency.

## Source links

Source links connect model items to implementation code or supporting documents. Schema 3.2 requires an explicit migration from earlier schemas. Older viewers reject the new schema so they cannot silently discard source kinds or locators during edits. `SourceLink` is the union of `CodeLink` and `DocumentLink`; each has an explicit, required `kind`. Documents add evidence without becoming a new domain or architecture element.

### Taxonomy

Kind, locator, role, and evidence qualification answer different questions:

| Aspect | CodeLink | DocumentLink |
|---|---|---|
| Required kind | `code` | `document` |
| Meaning | Implementation source | Written evidence, specifications, or rationale |
| Locators | Whole file, `symbol`, or `line`; symbol takes precedence when both are present | Whole file, `heading`, or `line`; heading and line are mutually exclusive |
| Reader capabilities | Raw source and supported tree-sitter declaration lookup; future symbol navigation belongs here | Rendered Markdown and heading navigation, or raw text for other text documents |
| Typical roles | definition, representation, implementation, enforcement, usage | specification, rationale, reference |

`kind` is authored, not inferred from a filename or role. The file extension chooses a supported syntax grammar for code or a document renderer after kind has been established. A Markdown file marked `code` opens as source; a TypeScript file marked `document` opens as documentary text without symbol lookup. Document links reject `symbol`; code links reject `heading`. Markdown heading support is limited to `.md`, `.markdown`, and `.mdown`; other text documents support file and line locators. Binary documents such as PDFs still require transcription.

Roles remain descriptive strings, independent of kind. Evidence qualification (`intended`, `observed`, `enforced`) remains an annotation on the model claim. Neither a source kind nor a role proves that behavior is implemented or enforced.

```xml
<code-link kind="code" id="approval-check" file="src/approval.ts"
           symbol="approve" role="enforcement">Checks the approval threshold.</code-link>
<code-link kind="document" id="approval-policy" file="docs/policy.md"
           heading="approval" role="specification">States the approval requirement.</code-link>
```

The persisted element remains `<code-link>` and the API array remains `codeLinks`, containing `SourceLink` values. They are compatibility field names, not declarations that every member is a CodeLink. The resolver returns `CodeExcerpt | DocumentExcerpt` and dispatches on `kind` before applying source-specific capabilities.

Code and document targets at the same file/line are distinct. Code target identities and Markdown heading identities stay unchanged; document file and line targets use `document-file` and `document-line` locator tags. The viewer resolves unambiguous old document target URLs and remaps canvas references, including attached bindings. An explicit mapping ID disambiguates old URLs when both kinds now target the same location.

A source link may have an `id`, unique within its owning object. Give new links stable IDs and preserve them when changing a file, locator, role, or explanation. Canvas annotations and shared links use this identity. Links without IDs get a deterministic reference from their target and role; changing either can require reattaching their canvas annotations. Opening a model never writes IDs into XML.

A link requires `kind`, a repository-relative file, a role, and explanation text. For code, add a `symbol` for a declaration, or a positive, one-based `line` for a location. With both present, the symbol is authoritative. For documents, choose a Markdown `heading` or a `line`. Without a locator, the reader opens the whole file.

Roles are descriptive labels: definition, representation, implementation, enforcement, usage, specification, rationale, or reference. Use documentary roles for requirements and design explanations; a document alone does not establish observed behavior or an enforced check. Explain discrepancies between a domain name and its code name. A concept may link to several files; a file may implement several concepts. Relationships also carry links.

The reader locates Python and TypeScript/TSX declarations. Qualify repeated names, such as `Order.total`. Missing or ambiguous symbols are shown explicitly; unsupported languages open at file level with a notice. The checker counts those unsupported symbol links as unchecked. Source reads resolve symlinks and stay inside the selected code root. Text files have a 2 MB reading limit.

### Markdown documents

Document links to local `.md`, `.markdown`, and `.mdown` files open as rendered CommonMark/GFM with a heading navigator and a raw-text view. A `line` target opens raw text at that line. An optional `heading` selects a document section; it is exclusive with `symbol` and `line`. Keep `file` as a path, without a fragment:

```xml
<code-link kind="document" id="approval-spec" file="docs/requirements.md"
           heading="human-approval" role="specification">
  Defines when a reviewer must approve the proposed action.
</code-link>
```

Heading anchors come from visible heading text: lowercase; remove punctuation except underscores and hyphens; replace whitespace with hyphens. Unicode letters and numbers are retained. Empty anchors become `section`; repeated or colliding anchors receive `-1`, `-2`, and so on in document order. For example, `## Human **Approval**` becomes `human-approval`. ATX and setext headings are supported; headings inside code fences are ignored. Renaming a heading can break its anchor; a stable link `id` preserves the mapping identity when its target is repaired. Missing headings are reported by the reader and fail CLI/edit validation.

Rendered documents do not execute raw HTML or load images. Same-document heading links navigate within the pane; external HTTP(S)/mailto links are explicit links, and other relative links display as text. Declared source links resolve inside the selected project source root. Files browsing separately opens inventoried files within that root. Both paths enforce the existing 2 MB text-file limit and reject binary content; browsing a file does not author an evidence mapping. PDF files need a faithful Markdown transcription before linking; preserve PDF provenance and page markers in that transcription.

For a document-only model, state the source document, version, and scope. Label prescribed behavior as intended and retain gaps or contradictions. Use implementation/enforcement claims only when supported by inspected code or checks; linking a policy that says a control is required does not prove that control exists.

## Flows and sequence diagrams

A Flow has ordinary item fields plus one or more ordered steps. Each `<step id="…" relationship="…">action label</step>` references an existing relationship; its endpoints supply the participants. Step IDs are unique within their flow and survive reordering. A relationship can occur repeatedly with distinct step IDs and labels. Embedded patches use `steps: [{id, relationship, label}]` and replace the whole flow atomically.

A sequence diagram derives one lifeline per referenced element and one message per step. Order means interaction order, without duration, completion, reply pairing, concurrency, branching, or instance aliases. Use annotations for preconditions, outcomes, and evidence; author a separate scenario for an alternate path. Structural validation cannot establish that a relationship is an actual runtime interaction. Inspect the entrypoint and connecting code.

This approach follows [C4 dynamic diagrams](https://c4model.com/diagrams/dynamic) and [ordered relationship occurrences](https://docs.structurizr.com/dsl/cookbook/dynamic-view/). The combined DDD/C4/Flow language is Lexicon's design. See [flow authoring](skills/lexicon/flows.md) and the [Shop example](examples/shop/README.md).

## Model and presentation

One model supplies the reader, canvas views, and derived sequence diagrams. Domain, Architecture, and Linked Sources can each be viewed in 2D. Combined composes all three in 2D, while Planes separates them spatially to expose correspondence. These views preserve the same semantic identities. Position, proximity, and plane order imply no containment, dependency, or runtime direction. They are exploration views rather than a complete suite of scoped C4 diagrams.

Pages hold presentation content; their names and positions do not determine semantic membership. Combined mirrors the individual 2D planes' arrangements and authored drawings. Moving a plane in Combined changes its presentation offset. New drawings belong to the active drawing plane, and edits to drawings update their owning page. Linked Sources contributes shared file and target objects, with source connections preserving the authored mappings from their model owners. Domain and Architecture navigate to these targets without expanding them inline.

Selection, focus, connection visibility, and navigation remain viewing state. Views and Beyond guides choosing and reviewing views; it introduces no persisted viewpoint records, framework registry, or configurable type system. Rendering, gestures, skins, and the experimental Files / File Map view are documented in the [canvas guide](viewer/CANVAS.md) and [Planes guide](PLANES.md).

`lexicon/canvas.json` is a separate authored presentation document containing positions, notes, drawings, and asset references. It refers to semantic identities and does not define model meaning. Changing a view or drawing does not change XML. Conversation history and project registrations live in the local database; browser preferences, navigation, and recovery drafts have their own lifetimes. Schema migration preserves these artifacts and the model identity they reference.

## Minimal example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<lexicon schema="3.2" id="shop">
  <name>Shop</name>
  <description>Accept and fulfill customer purchases.</description>
  <context id="ordering">
    <name>Ordering</name>
    <description>Agree on the items and quantities a customer purchases.</description>
    <concept id="order" classification="aggregate">
      <name>Order</name>
      <description>A purchase whose items and total are considered together.</description>
      <annotation kind="rule" evidence="intended">The total follows the current items.</annotation>
      <code-link kind="code" file="src/order.ts" symbol="Order" role="representation">Gathers the purchased items.</code-link>
    </concept>
    <concept id="order-line" classification="value">
      <name>Order Line</name>
      <description>The quantity and agreed price of one purchased item.</description>
    </concept>
  </context>
  <relationship id="order-members" from="order" to="order-line">
    <name>contains</name>
    <description>The order owns its purchased lines.</description>
  </relationship>
</lexicon>
```

The sample code target is illustrative. Replace it with inspected source before claiming the link is established.

## Authoring and checks

Use two-space indentation and normal XML escaping. Descriptions contain plain text with optional inline item references (see below). Annotations contain plain text. Newlines are folded into spaces by the reader. The parser reports unknown structural elements, missing descriptions, duplicate identities, invalid evidence qualifiers, and unresolved endpoints. The checker also reads declared code targets.

Keep a project model in its chosen artifact root. The viewer first reads the registered folder; when it lacks a model, it checks the primary Git worktree. CLI callers specify roots explicitly. Source inspection stays rooted in the selected code checkout.

Exclude the project-root `lexicon/` directory from source discovery and new source evidence by default, including during generation and refinement. Its model and presentation artifacts describe the system; they are not independent implementation evidence. Read them to maintain or migrate the model, or when the user explicitly requests a document there. File inventory excludes this directory even when tracked by Git; existing authored links remain readable. Nested source modules such as `src/lexicon/` are unaffected.

The shared TypeScript contract and executable validation are maintained together in `viewer/shared/model.ts` and `viewer/server/model.ts`. The [Shop example](examples/shop/lexicon/model.xml) shows the format applied across domain meaning, software structure, and ordered flows.

Structural and source-link checks establish that the model is well formed and its declared targets resolve. Semantic review asks whether those targets support the explanations. For an integration relationship, inspect the mechanism connecting both endpoints; finding each endpoint is insufficient. For an enforced rule, inspect the check and retain its conditions and failure outcome.

Annotations can explain lifecycle transitions, authority limits, uncertainty, and consistency rules without introducing new object types. Add structure when a worked example exposes meaning these objects cannot express clearly. The [initialization workflow](skills/lexicon/initialize.md) covers concept selection; [semantic review](skills/lexicon/review.md) assesses coverage separately from correctness.

### Inline connections in descriptions

Explain an item's connections as part of its description: what it needs from another item, how their responsibilities meet, and why that matters. Use `[[item-id]]` to display the referenced item's current name, or `[[item-id|wording]]` to fit the sentence. References can target any model item, including relationships and flows, using stable project-wide IDs.

```xml
<description>A purchase groups [[order-line|purchased lines]] so quantities and agreed prices can be considered together. The [[order-members|membership relationship]] explains ownership of those lines.</description>
```

The viewer renders references with the target's existing type or classification icon and item navigation. List previews show readable text; opening the item exposes clickable references. An unavailable target remains readable with a dotted underline and an unavailable-item hint. References are plain-text enrichment, so existing XML storage and schema remain unchanged.

An inline mention does not create a Relationship, graph edge, containment claim, or Flow step. Author a Relationship when the connection itself needs an identity, evidence, annotations, or reuse in a Flow. Descriptions should elaborate the reason, conditions, or consequences of a connection, rather than enumerate linked neighbors or repeat mechanical edge labels. Do not force a reference into every description when no connection helps explain the item.

## Project settings

`lexicon/settings.json` stores shared project configuration beside the model, independently of XML and canvas presentation. The first setting filters source discovery for the skill and the viewer's file inventory:

```json
{"files":{"include":["src/**","docs/**/*.md"],"exclude":["**/*.test.ts"]}}
```

Globs are relative to the selected source root. Any include can match; empty includes mean all files. Exclusions win, and Git ignore rules apply even to tracked files. Root `lexicon/` artifacts remain outside source discovery. Missing settings include all files and default `files.exclude` to `["**/*.lock", "**/.*/**"]`, excluding `.lock` files and dot-prefixed directories at any depth. Dotfiles outside those directories remain included. Explicitly saved exclusions replace this default; saving an empty list allows lock files and dot-prefixed directories. Invalid settings report an error. Existing authored model items and links remain readable; changing scope does not rewrite the model. Linked worktrees use settings from the resolved artifact root. Project settings in the viewer saves this file and refreshes the file inventory. The skill's `files` command enumerates the same scope. Discovery descends into embedded Git repositories and initialized submodules; ancestor ignore rules, each repository's ignore rules, and project globs all apply to paths relative to the selected source root.
