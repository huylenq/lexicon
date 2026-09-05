import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadModel, parseModel } from "../server/model";
import {
  anchorId,
  domainId,
  indexModel,
  mappingId,
  neighborhood,
  projectGraph,
  readSelection,
  targetId,
} from "../client/src/graph/model";
import { connectionPath } from "../client/src/graph/layout";

const xml = `<lexicon schema="2.0" id="shop"><name>Shop</name><description>Example.</description>
<context id="sales"><name>Sales</name><description>Sells.</description>
<concept id="order"><name>Order</name><description>A purchase.</description>
<code-link file="order.ts" symbol="Order" role="representation">Stores orders.</code-link>
<code-link file="order.ts" symbol="Order" role="validation">Validates orders.</code-link></concept>
<concept id="line"><name>Line</name><description>An item.</description></concept></context>
<context id="fulfillment"><name>Fulfillment</name><description>Delivers.</description>
<concept id="shipment"><name>Shipment</name><description>A delivery.</description>
<code-link file="order.ts" symbol="Order" role="usage">Reads order data.</code-link></concept></context>
<relationship id="contains" from="order" to="line"><name>contains</name><description>Owns lines.</description>
<code-link file="order.ts" symbol="Order" role="enforcement">Enforces membership.</code-link></relationship>
<relationship id="sends" from="order" to="shipment"><name>sends</name><description>Sends orders.</description></relationship>
<relationship id="fulfills" from="line" to="shipment"><name>fulfills</name><description>Fulfills items.</description></relationship>
<relationship id="returns" from="shipment" to="order"><name>returns</name><description>Returns results.</description></relationship>
<relationship id="boundary" from="sales" to="fulfillment"><name>supplies</name><description>Explicit boundary relationship.</description></relationship>
</lexicon>`;
const model = parseModel(xml);
const index = indexModel(model);
const options = { collapsed: [], expanded: [], allCode: false };

describe("domain graph projection", () => {
  test("starts with all domain concepts grouped by ownership, preserving authored edges", () => {
    const graph = projectGraph(index, options);
    expect(graph.nodes.filter((n) => n.kind === "concept")).toHaveLength(3);
    expect(graph.nodes.find((n) => n.id === domainId("order"))?.parentId).toBe(
      domainId("sales"),
    );
    expect(graph.connections).toHaveLength(5);
    expect(graph.nodes.some((n) => n.kind === "code")).toBe(false);
  });
  test("shares targets while retaining every mapping, role, and relationship owner", () => {
    const graph = projectGraph(index, { ...options, allCode: true });
    expect(index.targets.size).toBe(1);
    expect(index.mappings.size).toBe(4);
    expect(graph.nodes.filter((n) => n.kind === "code")).toHaveLength(1);
    expect(graph.connections.filter((e) => e.kind === "mapping")).toHaveLength(
      4,
    );
    const relation = graph.connections.find((e) =>
      e.relationships.includes("contains"),
    )!;
    expect(
      graph.connections.find((e) =>
        e.mappings.includes(mappingId("contains", 0)),
      )?.source,
    ).toBe(anchorId(relation.id));
    expect(
      [...index.targets.values()][0].mappings.map((m) => m.link.role),
    ).toEqual(["representation", "validation", "usage", "enforcement"]);
  });
  test("identity honors symbol precedence and preserves file, symbol, and line distinctions", () => {
    const base = {
      file: "order.ts",
      role: "definition",
      description: "Example",
    };
    expect(targetId({ ...base, symbol: "Order", line: 3 })).toBe(
      targetId({ ...base, symbol: "Order", line: 80 }),
    );
    expect(
      new Set(
        [
          base,
          { ...base, line: 3 },
          { ...base, symbol: "3" },
          { ...base, symbol: "Order" },
          { ...base, file: "other.ts", symbol: "Order" },
        ].map(targetId),
      ).size,
    ).toBe(5);
  });
  test("collapsed summaries preserve direction and keep authored context relations distinct", () => {
    const graph = projectGraph(index, {
      ...options,
      collapsed: ["sales", "fulfillment"],
    });
    expect(graph.nodes.filter((n) => n.kind === "concept")).toHaveLength(0);
    const outgoing = graph.connections.find(
      (e) => e.summary && e.source === domainId("sales"),
    )!;
    expect(outgoing.relationships).toEqual(["sends", "fulfills"]);
    expect(outgoing.selection).toEqual({
      kind: "bundle",
      relationships: ["sends", "fulfills"],
      mappings: [],
    });
    expect(
      graph.connections.find((e) => e.relationships.includes("returns"))
        ?.source,
    ).toBe(domainId("fulfillment"));
    expect(
      graph.connections.find((e) => e.relationships.includes("boundary"))
        ?.summary,
    ).toBe(false);
  });
  test("explicitly expanded internal relationship code survives collapse and is inspectable", () => {
    const graph = projectGraph(index, {
      ...options,
      expanded: ["contains"],
      collapsed: ["sales"],
    });
    const code = graph.connections.find((e) => e.kind === "mapping")!;
    expect(code.source).toBe(domainId("sales"));
    expect(code.mappings).toEqual([mappingId("contains", 0)]);
    expect(code.summary).toBe(true);
    expect(graph.nodes.filter((n) => n.kind === "code")).toHaveLength(1);
  });
  test("broken endpoints and duplicate IDs do not create dangling graph edges", () => {
    const invalid = parseModel(
      xml
        .replace('to="shipment"', 'to="missing"')
        .replace('id="line"', 'id="order"'),
    );
    const graph = projectGraph(indexModel(invalid), options);
    expect(graph.omitted).toBeGreaterThan(0);
    expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(graph.nodes.length);
    const ids = new Set(graph.nodes.map((n) => n.id));
    expect(
      graph.connections.every((e) => ids.has(e.source) && ids.has(e.target)),
    ).toBe(true);
  });
  test("code focus includes every visible owner and relationship geometry", () => {
    const graph = projectGraph(index, { ...options, allCode: true });
    const area = neighborhood(index, graph, {
      kind: "code",
      id: [...index.targets.keys()][0],
    });
    expect(area.nodes.has(domainId("order"))).toBe(true);
    expect(area.nodes.has(domainId("shipment"))).toBe(true);
    expect(area.edges.has("relation:contains")).toBe(true);
    expect(area.nodes.has(domainId("sales"))).toBe(true);
  });
  test("malformed selections fail closed; summary selections round-trip through URLs", () => {
    expect(
      readSelection('{"kind":"bundle","relationships":null,"mappings":[]}'),
    ).toBeUndefined();
    expect(readSelection('{"kind":"code","id":4}')).toBeUndefined();
    const selection = {
      kind: "bundle" as const,
      relationships: ["sends", "fulfills"],
      mappings: [],
    };
    expect(readSelection(JSON.stringify(selection))).toEqual(selection);
  });
});

describe("layout and worked example", () => {
  test("parallel edges and self-links have distinct, finite geometry", () => {
    const box = { x: 0, y: 0, width: 220, height: 76 };
    const other = { ...box, x: 400 };
    expect(connectionPath(box, other, -0.5).path).not.toBe(
      connectionPath(box, other, 0.5).path,
    );
    expect(connectionPath(box, box, 0, true).path).not.toContain("NaN");
    expect(connectionPath(box, box, 0, true).x).toBeGreaterThan(box.width);
  });
  test("DentalML has all 18 mappings represented by six shared targets", async () => {
    const dental = indexModel(
      await loadModel(resolve(import.meta.dir, "../examples/dentalml")),
    );
    const graph = projectGraph(dental, { ...options, allCode: true });
    expect(graph.omitted).toBe(0);
    expect(dental.mappings.size).toBe(18);
    expect(graph.nodes.filter((n) => n.kind === "code")).toHaveLength(6);
    expect(graph.connections.filter((e) => e.kind === "mapping")).toHaveLength(
      18,
    );
  });
});
