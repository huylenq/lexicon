# Flows

The bundle's `MODEL.md` governs Flow syntax and semantic composition. A Flow describes one runtime scenario as ordered interactions between Architecture participants: people, systems, containers, and components. Domain concepts explain affected meaning and rules through descriptions and relationships. Source links identify the code or specification supporting the scenario.

Use Explain / Initialize / Refine. Trace the requested path before modeling it: inspect the entrypoint, connecting operations, their order, conditions, and outcome. Reuse existing Architecture participants and interaction relationships. A containment, domain association, or implementation mapping does not by itself justify a message. For a document-only model, use the documented Architecture responsibilities, link the specification, and mark the behavior intended; leave code detail absent.

## Architecture and code detail

Start with Architecture participants. Add precise code only where it helps answer the question. In schema 3.3, a step can reference three code links owned by its Flow:

- `caller`: the function or method acting within the relationship's source participant.
- `callee`: the function or method receiving the interaction within its destination participant.
- `call-site` in XML, `callSite` in JSON: the operation that connects the two.

Each reference is an explicit code-link ID. Referenced links require `kind="code"` and a symbol or line target. Whole-file and document links can still provide broader evidence for the Flow. Do not invent missing code: a Person needs no caller symbol, and an external service's implementation may be unavailable. Explain differences between responsibility names and code symbols.

The sequence defaults to Architecture lifelines. **Show code** expands code targets into lifelines grouped by their Architecture participant. Repeated targets under the same participant share a lifeline. Source buttons open the exact target or call site in Source Reader. The grouping is an authored responsibility claim; a resolving file or symbol does not prove it.

For calls inside one Component, use an interaction relationship from that Component to itself. Caller and callee may identify different methods or classes within its responsibility. The Shop rejection scenario keeps both Checkout.place and Order.constructor under Order Handling. It does not promote the Order domain concept or every implementation class to a new Architecture element.

Internal computation can also remain a self-interaction, as in the canvas workshop's input check and price reduction. Name the action accurately. Use labels such as “HTTP POST /orders” or “publish OrderAccepted” for transport interactions; code detail must preserve that mechanism rather than imply a direct function call.

## Authoring

A Flow has ordinary item fields and one or more ordered steps. This fragment belongs inside a Flow whose relationship already connects Shop API to Order Handling:

```xml
<code-link kind="code" id="handler" file="src/api.ts" symbol="handle" role="caller">Accepts order requests.</code-link>
<code-link kind="code" id="place" file="src/checkout.ts" symbol="Checkout.place" role="callee">Creates and stores a valid order.</code-link>
<code-link kind="code" id="dispatch" file="src/api.ts" line="8" role="call-site">Calls Checkout.place after parsing JSON.</code-link>
<step id="create" relationship="handles-order" caller="handler" callee="place" call-site="dispatch">Create and validate the order</step>
```

Flow IDs are project-wide. Step IDs and code-link IDs are local to the Flow and survive reordering. A relationship can occur repeatedly with distinct step IDs and labels. Preserve participant containment. A label may specialize a relationship's broader claim; author a separate relationship when the interaction makes a different claim.

Atomic MCP patches upsert a complete `type: "flow"` item with `steps: [{id, relationship, label, caller?, callee?, callSite?}]`. Preserve unchanged fields and source links. The server validates and saves the whole Flow atomically. Removing or renaming a referenced relationship or code-link ID requires repairing dependent steps in the same edit. MCP updates preserve omitted fields but replace supplied arrays completely.

Order means interaction order. Replies, branches, loops, concurrency, timing, and runtime instance aliases remain outside the model. Code lifelines identify source targets, not individual runtime instances. Use another named scenario for an important alternate path.

Before authoring, state the trigger, relevant preconditions, and outcome. For each consequential step, justify the action, direction, Architecture responsibility, code targets where supplied, and sequence position using connecting source. Report unsupported claims and important omitted outcomes separately from structural validation. The [Shop example](../../examples/shop/README.md) includes successful and rejected requests; the [canvas workshop](../../examples/canvas-workshop/lexicon/model.xml) shows internal computation.
