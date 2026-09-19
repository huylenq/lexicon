import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { parseModel, serializeModel } from "../server/model";
import { applyPatch } from "../server/model-edit";
import { flowsFor, type Flow } from "../shared/model";
import { projectSequence } from "../client/src/graph/flow";
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
  expect(saved.items.filter(item => item.type === "flow")).toEqual([
    first, ...model().items.filter((item): item is Flow => item.type === "flow" && item.id !== first.id), second,
  ]);
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

test("a domain-only model remains valid but cannot supply runtime Flow participants", () => {
  const oldXml = '<lexicon schema="3.3" id="demo"><name>Demo</name><description>Example.</description><context id="c"><name>Context</name><description>Meaning.</description><concept id="a"><name>A</name><description>First participant.</description></concept><concept id="b"><name>B</name><description>Second participant.</description></concept></context><relationship id="r" from="a" to="b"><name>calls</name><description>An interaction.</description></relationship></lexicon>';
  const old = parseModel(oldXml);
  expect(serializeModel(old)).toContain('schema="3.3"');
  expect(() => applyPatch(old, { upsert: [{ ...flow(), codeLinks: [], steps: [{ id: "call", relationship: "r", label: "Start work" }] }] })).toThrow("Architecture participants");
  expect(old).toEqual(parseModel(oldXml));
});

test("the static graph reuses flow participants while sequence references preserve their hierarchy", () => {
  const current = model(), index = indexModel(current), graph = projectGraph(index, { });
  expect(graph.nodes.some(node => node.id === "item:place-order")).toBe(false);
  expect(graph.nodes.find(node => node.id === "item:checkout")?.parentId).toBe("item:api");
  const focus = neighborhood(index, graph, { kind: "item", id: "place-order" });
  for (const id of ["customer", "api", "checkout", "repository"]) expect(focus.nodes.has(`item:${id}`)).toBe(true);
  for (const id of ["api", "checkout", "handles-order"]) expect(flowsFor(current, id).map(flow => flow.id)).toEqual(["place-order", "reject-order"]);
  expect(flowsFor(current, "repository").map(flow => flow.id)).toEqual(["place-order"]);
  expect(flowsFor(current, "order-lines")).toEqual([]);
});


test("step code references roundtrip and remain bound to stable Flow-owned IDs when links reorder", () => {
  const current = model(), before = flow();
  const reordered = { ...before, codeLinks: [...before.codeLinks].reverse() };
  const after = applyPatch(current, { upsert: [reordered] });
  const restored = parseModel(serializeModel(after)).items.find(i => i.id === before.id) as Flow;
  expect(restored).toEqual(reordered);
  const projection = projectSequence(indexModel(after), restored, true);
  expect(projection.rows[1].callSite?.link).toMatchObject({ file: "src/api.ts", line: 8 });
  expect(projection.lanes.find(l => l.actor.id === "checkout")?.code?.link.symbol).toBe("Checkout.place");
  expect(() => applyPatch(current, { upsert: [{ ...before, codeLinks: before.codeLinks.filter(l => l.id !== "sequence") }] })).toThrow("must reference a code link");
});

test("step code roles reject dangling, foreign, documentary, whole-file and malformed references", () => {
  for (const field of ["caller", "callee", "callSite"]) {
    for (const reference of ["missing", "implementation", "", 7, null, {}, []]) {
      const changed = { ...flow(), steps: [{ ...flow().steps[0], [field]: reference }] };
      expect(() => applyPatch(model(), { upsert: [changed] })).toThrow();
    }
    for (const link of [
      { id: "bad", kind: "code", file: "src/api.ts", role: "implementation", description: "Whole file." },
      { id: "bad", kind: "document", file: "README.md", line: 1, role: "specification", description: "Policy." },
    ]) {
      const changed = { ...flow(), codeLinks: [...flow().codeLinks, link], steps: [{ ...flow().steps[0], [field]: "bad" }] };
      expect(() => applyPatch(model(), { upsert: [changed] })).toThrow("symbol or line target");
    }
  }
  expect(parseModel(xml.replace('callee="entry"', 'callee="unknown"')).issues.some(i => i.message.includes("callee must reference"))).toBe(true);
});

test("participant restrictions apply when a referenced relationship changes; cross-dimension relationships remain legal", () => {
  const current = model(), relationship = current.items.find(i => i.id === "handles-order")!;
  expect(() => applyPatch(current, { upsert: [{ ...relationship, to: "order" }] })).toThrow("Architecture participants");
  expect(current.items.find(i => i.id === "creates-order")).toMatchObject({ from: "checkout", to: "order" });
  expect(current.issues).toEqual([]);
});

test("code sequence groups internal calls by responsibility and preserves unspecified humans and occurrence order", () => {
  const current = model(), index = indexModel(current);
  const rejected = current.items.find(i => i.id === "reject-order") as Flow;
  const plain = projectSequence(index, rejected, false), expanded = projectSequence(index, rejected, true);
  expect(plain.lanes.map(l => l.actor.id)).toEqual(["customer", "api", "checkout"]);
  expect(plain.rows[2].fromLane).toBe(plain.rows[2].toLane);
  expect(expanded.rows.map(r => r.step)).toEqual(plain.rows.map(r => r.step));
  expect(expanded.groups.find(g => g.actor.id === "checkout")?.lanes.map(l => l.code?.link.symbol)).toEqual(["Checkout.place", "Order.constructor"]);
  expect(expanded.rows[2].fromLane).not.toBe(expanded.rows[2].toLane);
  expect(expanded.lanes[0].code).toBeUndefined();
  expect(expanded.rows[0].step.label).toContain("HTTP POST");
  const repeated = projectSequence(index, { ...rejected, steps: [...rejected.steps, { ...rejected.steps[2], id: "again" }] }, true);
  expect(repeated.lanes).toEqual(expanded.lanes);
  expect(repeated.rows).toHaveLength(4);
});

test("unavailable participant and code references remain explicit in sequence projection", () => {
  const current = model(), broken = { ...flow(), steps: [{ ...flow().steps[0], caller: "gone" }] };
  expect(projectSequence(indexModel(current), broken, true).rows[0].missingCode).toEqual(["caller"]);
  const domain = { ...broken, steps: [{ id: "invalid", label: "Invalid", relationship: "creates-order" }] };
  const projection = projectSequence(indexModel(current), domain, true);
  expect(projection.lanes).toEqual([]);
  expect(projection.rows[0].relationship).toBeUndefined();
});
