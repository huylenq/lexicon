# The Lexicon model

A project supplies a stable ID, name, description, and four kinds of object. The native file is `lexicon/model.xml`, with `<lexicon schema="2.0">` as its root.

| Object | XML | Meaning |
|---|---|---|
| Context | `<context id="…">` | A scope with a consistent meaning and responsibility. |
| Concept | `<concept id="…" classification="…">` inside a context | A domain idea owned by that context. Classification is optional. |
| Relationship | `<relationship id="…" from="…" to="…">` at the project root | A named, directed connection between concepts or contexts. |
| Code Link | `<code-link file="…" symbol="…" role="…">explanation</code-link>` on any of the above | A correspondence to implementation, with its role explained. |

Contexts, concepts, and relationships each require `<name>` and `<description>`. Their IDs are project-wide, unique, stable, and whitespace-free. Relationships use those IDs directly; display-name changes preserve links. Moving a concept changes its owning context while retaining its ID.

Use spaced concept names with the first character of every word capitalized, such as `Order Line` and `Purchase Information`. Preserve proper nouns and acronyms. Relationship names use natural verb phrases, such as `supplies results to`. Context names remain natural phrases, such as `Order Management`. This is an authoring preference, not a validation requirement; explicit user terminology takes precedence. Preserve existing names unless renaming is requested. Casing applies to display names only: keep stable IDs, exact code-link files and symbols, descriptive labels, and prose unchanged. Project names retain their chosen spelling.

A relationship's name is the relation: “contains,” “supplies results to,” or “translates.” Both endpoints must identify a context or concept. Repeated relationships can carry different meanings, rules, or code evidence.

## Annotations and DDD

Attach `<annotation kind="rule|rationale|explanation|…">text</annotation>` to a context, concept, or relationship. Kind is a short descriptive label. Optional `evidence="observed|intended|enforced"` distinguishes a reading of behavior, a proposed consistency rule, and an explicit check. Keep the qualification beside the claim.

Concept classification is an optional label. DDD classifications such as `entity`, `value`, `service`, `event`, and `aggregate` help when their semantics explain the domain. Context relationships can describe shared kernels and upstream/downstream or translation boundaries. Explain the coordination in the relationship's description.

An aggregate is represented by a concept classified `aggregate`, relationships to its members, and an annotation describing its consistency rules. State which rules the implementation enforces. A shared-kernel relationship should explain the model being shared and the coordination it requires. Data transfer alone establishes a dependency.

## Code links

A link requires a repository-relative file, a role, and explanation text. Add a `symbol` for a declaration, or a positive, one-based `line` for a location. With both present, the symbol is authoritative. Without either, the reader opens the file.

Roles are descriptive labels: definition, representation, implementation, enforcement, usage. Explain discrepancies between a domain name and its code name. A concept may link to several files; a file may implement several concepts. Relationships also carry links.

The reader locates Python and TypeScript/TSX declarations. Qualify repeated names, such as `Order.total`. Missing or ambiguous symbols are shown explicitly; unsupported languages open at file level with a notice. The checker counts those unsupported symbol links as unchecked. Source reads resolve symlinks and stay inside the selected code root. Text files have a 2 MB reading limit.

## Minimal example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<lexicon schema="2.0" id="shop">
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
