# The Lexicon model

A project has a stable ID, name, description, and one shared semantic document: `lexicon/model.xml`, rooted at `<lexicon schema="3.0">`. The parser, validator, edit protocol, and viewer use only this current schema. Other versions open a document-status screen with Agent available for discussion and explicit migration. See [Migration](MIGRATION.md).

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

Every item requires a name and description and may have annotations and code links. Item IDs are project-wide, unique, stable, and whitespace-free. Code links and steps belong to their owning item; they are not independent model items.

Domain Context and Concept draw on DDD. The four software-structure types follow [C4 abstractions](https://c4model.com/abstractions). A Context and a Software System have different meanings; explain their correspondence with an ordinary relationship where useful. The question determines which vocabulary is needed. A domain-only model remains a complete valid model.

## Containment and relationships

An element has at most one structural parent: Concept → Context, Container → System, Component → Container. XML nesting supplies `parent` in memory and in embedded patches. Root elements have no parent. Parentage implies grouping, without aggregate consistency, lifecycle ownership, or cascading deletion. Moving an element preserves its ID; removing its parent requires explicitly handling the children and dependent relationships.

Relationships may connect any Context, Concept, Person, System, Container, or Component, including across containment boundaries. Flows and relationships are not endpoints. A relationship named “contains” expresses a domain claim without changing structural parentage. For example, Order and Order Line belong to Ordering while an ordinary relationship describes membership. Do not author a second relationship merely to restate structural nesting.

Use spaced concept names with the first character of every word capitalized, such as `Order Line` and `Purchase Information`. Preserve proper nouns and acronyms. Relationship names use natural verb phrases, such as `supplies results to`. Context names remain natural phrases, such as `Order Management`. This is an authoring preference, not a validation requirement; explicit user terminology takes precedence. Preserve existing names unless renaming is requested. Casing applies to display names only: keep stable IDs, exact code-link files and symbols, descriptive labels, and prose unchanged. Project names retain their chosen spelling.

A relationship's name is the relation: “contains,” “supplies results to,” or “translates.” Both endpoints must identify structural elements. Repeated relationships can carry different meanings, rules, or code evidence.

## Annotations and DDD

Attach `<annotation kind="rule|rationale|explanation|…">text</annotation>` to any item. Kind is a short descriptive label. Optional `evidence="observed|intended|enforced"` distinguishes a reading of behavior, a proposed consistency rule, and an explicit check. Keep the qualification beside the claim.

Concept classification is an optional label. DDD classifications such as `entity`, `value`, `service`, `event`, and `aggregate` help when their semantics explain the domain. Context relationships can describe shared kernels and upstream/downstream or translation boundaries. Explain the coordination in the relationship's description.

An aggregate is represented by a concept classified `aggregate`, relationships to its members, and an annotation describing its consistency rules. State which rules the implementation enforces. A shared-kernel relationship should explain the model being shared and the coordination it requires. Data transfer alone establishes a dependency.

## Code links

A code link may have an `id`, unique within its owning object. Give new links stable IDs and preserve them when changing a file, symbol, role, or explanation. Canvas annotations and shared links use this identity. Links without IDs get a deterministic reference from their target and role; changing either can require reattaching their canvas annotations. Opening a model never writes IDs into XML.

A link requires a repository-relative file, a role, and explanation text. Add a `symbol` for a declaration, or a positive, one-based `line` for a location. With both present, the symbol is authoritative. Without either, the reader opens the file.

Roles are descriptive labels: definition, representation, implementation, enforcement, usage. Explain discrepancies between a domain name and its code name. A concept may link to several files; a file may implement several concepts. Relationships also carry links.

The reader locates Python and TypeScript/TSX declarations. Qualify repeated names, such as `Order.total`. Missing or ambiguous symbols are shown explicitly; unsupported languages open at file level with a notice. The checker counts those unsupported symbol links as unchecked. Source reads resolve symlinks and stay inside the selected code root. Text files have a 2 MB reading limit.

## Flows and sequence diagrams

A Flow has ordinary item fields plus one or more ordered steps. Each `<step id="…" relationship="…">action label</step>` references an existing relationship; its endpoints supply the participants. Step IDs are unique within their flow and survive reordering. A relationship can occur repeatedly with distinct step IDs and labels. Embedded patches use `steps: [{id, relationship, label}]` and replace the whole flow atomically.

A sequence diagram derives one lifeline per referenced element and one message per step. Order means interaction order, without duration, completion, reply pairing, concurrency, branching, or instance aliases. Use annotations for preconditions, outcomes, and evidence; author a separate scenario for an alternate path. Structural validation cannot establish that a relationship is an actual runtime interaction. Inspect the entrypoint and connecting code.

This approach follows [C4 dynamic diagrams](https://c4model.com/diagrams/dynamic) and [ordered relationship occurrences](https://docs.structurizr.com/dsl/cookbook/dynamic-view/). The combined DDD/C4/Flow language is Lexicon's design. See [flow authoring](skills/lexicon/flows.md) and the [Shop example](viewer/examples/shop/README.md).

## Model and presentation

One model supplies the reader, graph filters, and derived sequence diagrams. Combined, Domain, and Architecture are exploration filters, not a complete suite of scoped C4 diagrams. Atlas is available for the domain projection. Views and Beyond guides choosing and reviewing views; it introduces no persisted viewpoint records, framework registry, or configurable type system.

`lexicon/canvas.json` is a separate authored presentation document containing positions, notes, drawings, and asset references. It refers to semantic identities and does not define model meaning. Changing a view or drawing does not change XML. Conversation history and project registrations live in the local database; browser preferences, navigation, and recovery drafts have their own lifetimes. Schema migration preserves these artifacts and the model identity they reference.

## Minimal example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<lexicon schema="3.0" id="shop">
  <name>Shop</name>
  <description>Accept and fulfill customer purchases.</description>
  <context id="ordering">
    <name>Ordering</name>
    <description>Agree on the items and quantities a customer purchases.</description>
    <concept id="order" classification="aggregate">
      <name>Order</name>
      <description>A purchase whose items and total are considered together.</description>
      <annotation kind="rule" evidence="intended">The total follows the current items.</annotation>
      <code-link file="src/order.ts" symbol="Order" role="representation">Gathers the purchased items.</code-link>
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

Use two-space indentation and normal XML escaping. Descriptions and annotations contain plain text. Newlines are folded into spaces by the reader. The parser reports unknown structural elements, missing descriptions, duplicate identities, invalid evidence qualifiers, and unresolved endpoints. The checker also reads declared code targets.

Keep a project model in its chosen artifact root. The viewer first reads the registered folder; when it lacks a model, it checks the primary Git worktree. CLI callers specify roots explicitly. Source inspection stays rooted in the selected code checkout.

The shared TypeScript contract and executable validation are maintained together in `viewer/shared/model.ts` and `viewer/server/model.ts`. The [DentalML example](viewer/examples/dentalml/lexicon/model.xml) shows the format applied to canal measurement.

Structural and code-link checks establish that the model is well formed and its declared targets resolve. Semantic review asks whether those targets support the explanations. For an integration relationship, inspect the mechanism connecting both endpoints; finding each endpoint is insufficient. For an enforced rule, inspect the check and retain its conditions and failure outcome.

Annotations can explain lifecycle transitions, authority limits, uncertainty, and consistency rules without introducing new object types. Add structure when a worked example exposes meaning these objects cannot express clearly. The [initialization workflow](skills/lexicon/initialize.md) covers concept selection; [semantic review](skills/lexicon/review.md) assesses coverage separately from correctness.
