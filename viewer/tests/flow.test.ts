import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { parseModel, serializeModel } from "../server/model";
import { applyPatch } from "../server/chat/model-edit";
import { flowsFor, type Flow } from "../shared/model";
import { indexModel, projectGraph, neighborhood } from "../client/src/graph/model";

const xml = await readFile(new URL("../../examples/shop/lexicon/model.xml", import.meta.url), "utf8");
const model = () => parseModel(xml);
const flow = (): Flow => model().items.find((item): item is Flow => item.type === "flow")!;

test("flow steps roundtrip in order with repeated relationships and flow-local IDs", () => {
  const first = flow();
  first.steps.push({ id: "again", relationship: first.steps[0].relationship, label: "Submit <another> order & wait" });
  const second = { ...first, id: "another-flow", steps: [...first.steps].reverse() };
  const next = applyPatch(model(), { upsert: [first, second] });
  const saved = parseModel(serializeModel(next));
  expect(saved.issues).toEqual([]);
  expect(saved.items.filter(item => item.type === "flow")).toEqual([first, second]);
  expect(saved.items.filter(item => item.type !== "flow")).toEqual(model().items.filter(item => item.type !== "flow"));
});

test("flow validation refuses empty, ambiguous, dangling, or non-relationship steps", () => {
  for (const steps of [[], [{ id: "", relationship: "customer-orders", label: "Submit" }],
    [{ ...flow().steps[0], label: "  " }], [flow().steps[0], flow().steps[0]],
    [{ ...flow().steps[0], relationship: "missing" }], [{ ...flow().steps[0], relationship: "api" }],
    [{ ...flow().steps[0], relationship: "place-order" }], [{ ...flow().steps[0], from: "api" }]])
    expect(() => applyPatch(model(), { upsert: [{ ...flow(), steps }] })).toThrow();
  for (const steps of [undefined, null, {}, [null], [{ id: "a", relationship: 3, label: "Action" }]])
    expect(() => applyPatch(model(), { upsert: [{ ...flow(), steps }] })).toThrow();
  const invalid = parseModel(xml.replace('relationship="saves-order"', 'relationship="missing"'));
  expect(invalid.issues.some(issue => issue.item === "place-order" && issue.message.includes("must reference a relationship"))).toBe(true);
  expect(() => serializeModel(invalid)).toThrow();
  expect(parseModel(xml.replace('relationship="saves-order"', 'relationship="saves-order" order="3"')).issues.some(i => i.message.includes("Unknown attribute order"))).toBe(true);
  expect(parseModel(xml.replace("Save the accepted order</step>", "<step>Save</step></step>")).issues.some(i => i.message.includes("plain text"))).toBe(true);
});

test("removing or changing a referenced relationship requires repairing dependent flows in the same patch", () => {
  const before = model();
  expect(() => applyPatch(before, { remove: ["saves-order"] })).toThrow("must reference a relationship");
  expect(() => applyPatch(before, { upsert: [{ type: "person", id: "saves-order", name: "Person", description: "Meaning", annotations: [], codeLinks: [] }] })).toThrow();
  const next = applyPatch(before, { remove: ["saves-order"], upsert: [{ ...flow(), steps: flow().steps.slice(0, -1) }] });
  expect(next.issues).toEqual([]);
  expect(before).toEqual(model());
});

test("flows are scenarios, not relationship endpoints or structural parents", () => {
  const before = model();
  const relation = before.items.find(i => i.id === "customer-orders")!;
  const concept = before.items.find(i => i.id === "order")!;
  expect(() => applyPatch(before, { upsert: [{ ...relation, to: "place-order" }] })).toThrow("Relationship endpoint");
  expect(() => applyPatch(before, { upsert: [{ ...concept, parent: "place-order" }] })).toThrow("owning context");
  expect(() => applyPatch(before, { upsert: [{ ...flow(), parent: "api" }] })).toThrow("Unknown field");
});

test("a domain-only flow uses the same schema without requiring architecture", () => {
  const oldXml = '<lexicon schema="3.0" id="demo"><name>Demo</name><description>Example.</description><context id="c"><name>Context</name><description>Meaning.</description><concept id="a"><name>A</name><description>First participant.</description></concept><concept id="b"><name>B</name><description>Second participant.</description></concept></context><relationship id="r" from="a" to="b"><name>calls</name><description>An interaction.</description></relationship></lexicon>';
  const old = parseModel(oldXml);
  expect(serializeModel(old)).toContain('schema="3.0"');
  const next = applyPatch(old, { upsert: [{ ...flow(), codeLinks: [], steps: [{ id: "call", relationship: "r", label: "Start work" }] }] });
  expect(next.schema).toBe("3.0");
  expect(parseModel(serializeModel(next)).issues).toEqual([]);
  expect(() => parseModel(serializeModel(next).replace('schema="3.0"', 'schema="2.0"'))).toThrow();
  expect(old).toEqual(parseModel(oldXml));
});

test("the static graph reuses flow participants while sequence references preserve their hierarchy", () => {
  const current = model(), index = indexModel(current), graph = projectGraph(index, { expanded: [], allCode: false });
  expect(graph.nodes.some(node => node.id === "item:place-order")).toBe(false);
  expect(graph.nodes.find(node => node.id === "item:checkout")?.parentId).toBe("item:api");
  const focus = neighborhood(index, graph, { kind: "item", id: "place-order" });
  for (const id of ["customer", "api", "checkout", "repository"]) expect(focus.nodes.has(`item:${id}`)).toBe(true);
  for (const id of ["api", "checkout", "handles-order"]) expect(flowsFor(current, id).map(flow => flow.id)).toEqual(["place-order"]);
  expect(flowsFor(current, "order-lines")).toEqual([]);
});
