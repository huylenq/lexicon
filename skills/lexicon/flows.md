# Flows

A flow describes one scenario as an ordered list of interactions. Its sequence diagram reuses existing participants and relationships. This follows the [C4 dynamic diagram](https://c4model.com/diagrams/dynamic) approach and Structurizr's [ordered relationship occurrences](https://docs.structurizr.com/dsl/cookbook/dynamic-view/).

Use the existing Explain / Initialize / Refine workflow. Trace the requested path in source before modeling it. Check the entrypoint, calls, their order, conditions, and outcome. Reuse participants and relationships; add a relationship only when the inspected interaction needs one. A containment or implementation mapping does not by itself prove a runtime interaction. Explain domain names that differ from code symbols.

In `schema="3.0"`, add a root-level flow with the usual name, description, annotations, and code links:

```xml
<flow id="place-order">
  <name>Place an Order</name>
  <description>The successful path from submission to saving an accepted order.</description>
  <step id="submit" relationship="customer-orders">Submit product quantities</step>
  <step id="create" relationship="handles-order">Create and validate the order</step>
  <step id="save" relationship="saves-order">Save the accepted order</step>
</flow>
```

Those relationship IDs must already exist or be added in the same edit. Each supplies the endpoints. Step text names the action in this scenario; it may differ from the relationship's broader name. The example's supporting source and annotations are in `viewer/examples/shop/lexicon/model.xml`.

Flow IDs are project-wide. Step IDs are unique within their flow and survive reordering. The XML step order supplies interaction order; do not add an order field to relationships. The same relationship can occur several times with distinct step IDs. Steps belong to their flow; participants retain their structural parents.

Embedded patches upsert a complete `type: "flow"` item with `steps: [{id, relationship, label}]`. Preserve unchanged steps, annotations, code links, and IDs. Removing a referenced relationship requires updating its flows in the same patch. The server handles validation, saving, and undo.

Start with one path and one lifeline per object. Qualify intended versus observed behavior in flow annotations and ground the sequence with code links. Replies, branches, loops, concurrency, timing, and instance aliases are outside the current model. Use another named scenario for an alternate path. Agents author no diagram geometry or viewpoint definitions.
