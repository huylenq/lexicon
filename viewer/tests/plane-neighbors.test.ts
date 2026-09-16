import { expect, test } from "bun:test";
import { parseModel } from "../server/model";
import { indexModel, projectGraph, targetId } from "../client/src/graph/model";
import { isCrossPlaneRelationship, planeNeighbors, selectionPlane } from "../client/src/graph/planeNeighbors";
import { fileSelectionId } from "../shared/files";

const index = indexModel(parseModel(`<lexicon schema="3.2" id="planes"><name>Planes</name><description>Navigation</description>
<context id="orders"><name>Orders</name><description>Orders</description>
<concept id="order"><name>Order</name><description>Order</description>
<code-link kind="code" file="order.ts" symbol="Order" role="definition">Definition</code-link>
<code-link kind="code" file="order.ts" symbol="Order" role="validation">Validation</code-link>
<code-link kind="document" file="policy.md" heading="rules" role="specification">Rules</code-link>
</concept><concept id="line"><name>Line</name><description>Line</description></concept></context>
<system id="system"><name>System</name><description>System</description>
<code-link kind="code" file="order.ts" symbol="Order" role="implementation">Implementation</code-link></system>
<relationship id="implements" from="system" to="order"><name>implements</name><description>Meaning</description></relationship>
<relationship id="contains" from="order" to="line"><name>contains</name><description>Membership</description>
<code-link kind="code" file="order.ts" line="12" role="enforcement">Check</code-link></relationship>
</lexicon>`));
const item = (id: string) => ({ kind: "item" as const, id });

test("cross-plane radials deduplicate source roles and retain semantic neighbors", () => {
  const neighbors = planeNeighbors(index, item("order"));
  expect(neighbors.map(n => n.title)).toEqual(["System", "Order", "rules"]);
  expect(neighbors.map(n => n.plane)).toEqual(["architecture", "source", "source"]);
  expect(neighbors[2].subtitle).toBe("policy.md");
  expect(planeNeighbors(index, item("orders"))).toEqual([]); // No implicit descendant expansion.
});

test("targets, file cards and mappings navigate back to their precise owners", () => {
  const code = [...index.targets.values()].find(t => t.link.kind === "code" && t.link.symbol === "Order")!;
  expect(planeNeighbors(index, { kind: "code", id: code.id }).map(n => n.selection)).toEqual([item("order"), item("system")]);
  const mapping = [...index.mappings.values()].find(m => m.target === code.id)!;
  expect(planeNeighbors(index, { kind: "mapping", id: mapping.id })).toEqual(planeNeighbors(index, { kind: "code", id: code.id }));
  expect(planeNeighbors(index, { kind: "code", id: fileSelectionId("order.ts") }).map(n => n.selection)).toEqual([item("order"), item("system"), item("contains")]);
  const relationship = planeNeighbors(index, item("contains"));
  expect(relationship).toHaveLength(1);
  expect(relationship[0].id).toBe(targetId(index.items.get("contains")!.codeLinks[0]));
  expect(planeNeighbors(index, relationship[0].selection)[0].selection).toEqual(item("contains"));
  expect(selectionPlane(index, item("contains"))).toBe("domain");
  expect(selectionPlane(index, item("absent"))).toBeUndefined();
});

test("source nodes exist only on Linked Sources and Combined, including unresolved references", () => {
  for (const view of ["domain", "architecture"] as const) {
    const graph = projectGraph(index, { view });
    expect(graph.nodes.some(n => n.kind === "code" || n.kind === "file")).toBe(false);
    expect(graph.connections.some(e => e.kind === "mapping")).toBe(false);
  }
  const source = projectGraph(index, { view: "source" });
  expect(source.nodes.filter(n => n.kind === "code")).toHaveLength(index.targets.size);
  expect(source.connections).toEqual([]);
  expect(projectGraph(index, { view: "all" }).connections.filter(e => e.kind === "mapping")).toHaveLength(index.mappings.size);
});


test("relationship navigation distinguishes a single-plane edge from a cross-plane correspondence", () => {
  expect(isCrossPlaneRelationship(index, item("implements"))).toBe(true);
  expect(isCrossPlaneRelationship(index, item("contains"))).toBe(false);
  expect(isCrossPlaneRelationship(index, item("absent"))).toBe(false);
});
