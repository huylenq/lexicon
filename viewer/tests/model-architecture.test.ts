import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { parseModel, serializeModel, validateModel } from "../server/model";
import { applyPatch, validateChangedLinks } from "../server/chat/model-edit";
import { indexModel, projectGraph, neighborhood, domainId } from "../client/src/graph/model";
import { parentOf, type Model } from "../shared/model";
import { handle } from "../../examples/shop/src/api";

const root = new URL("../../examples/shop/", import.meta.url).pathname;
const xml = await readFile(root + "lexicon/model.xml", "utf8");
const model = () => parseModel(xml);

test("one model roundtrips domain and architecture with containment authored only through nesting", () => {
  const current = model();
  expect(current.issues).toEqual([]);
  expect(parentOf(current.items.find(i => i.id === "order")!)).toBe("ordering");
  expect(parentOf(current.items.find(i => i.id === "checkout")!)).toBe("api");
  expect(parentOf(current.items.find(i => i.id === "api")!)).toBe("shop");
  expect(parseModel(serializeModel(current))).toEqual(current);
  expect(current.items.filter(i => i.type === "relationship")).toHaveLength(6);
  // A named domain relation is not another structural parent.
  expect(parentOf(current.items.find(i => i.id === "order-line")!)).toBe("ordering");
});

test("invalid ownership, cycles, and dangling links cannot be saved", () => {
  const current = model(), component = current.items.find(i => i.id === "checkout")!;
  for (const parent of ["ordering", "missing", "shop", "checkout"])
    expect(() => applyPatch(current, { upsert: [{ ...component, parent }] })).toThrow();
  expect(() => applyPatch(current, { remove: ["api"] })).toThrow();
  expect(() => applyPatch(current, { remove: ["order"] })).toThrow("Relationship endpoint");
  const invalid = { ...current, items: current.items.map(i => i.id === "checkout" ? { ...i, parent: "checkout" } : i) } as Model;
  expect(validateModel({ ...invalid, issues: [] }).issues.some(i => i.message.includes("cycle"))).toBe(true);
  expect(() => serializeModel(invalid)).toThrow();
  expect(model()).toEqual(current);
});

test("only the installed schema is readable and writable", () => {
  for (const schema of ["2.0", "3.0-prototype", "9.0"])
    expect(() => parseModel(xml.replace('schema="3.0"', `schema="${schema}"`))).toThrow("Expected");
  expect(() => serializeModel({ ...model(), schema: "2.0" } as unknown as Model)).toThrow("Only schema 3.0");
});

test("a parent move preserves identity, evidence and relationships without implicit cascading deletion", () => {
  const current = model(), component = current.items.find(i => i.id === "checkout")!;
  const next = applyPatch(current, { upsert: [
    { type: "container", id: "other-api", parent: "shop", name: "Other API", description: "Proposed alternate location.", annotations: [], codeLinks: [] },
    { ...component, parent: "other-api" },
  ] });
  expect(next.items.find(i => i.id === "checkout")?.codeLinks).toEqual(component.codeLinks);
  expect(next.items.filter(i => i.type === "relationship")).toEqual(current.items.filter(i => i.type === "relationship"));
  expect(parentOf(parseModel(serializeModel(next)).items.find(i => i.id === "checkout")!)).toBe("other-api");
});

test("views reuse identity without rewriting semantic records", async () => {
  const current = model(), before = serializeModel(current), index = indexModel(current);
  const options = { expanded: [], allCode: false };
  const all = projectGraph(index, options);
  const architecture = projectGraph(index, { ...options, view: "architecture" });
  const domain = projectGraph(index, { ...options, view: "domain" });
  expect(architecture.nodes.map(i => i.id)).not.toContain(domainId("order"));
  expect(domain.nodes.map(i => i.id)).not.toContain(domainId("api"));
  expect(all.connections.find(i => i.id === "relation:creates-order")).toBeDefined();
  expect(architecture.connections.find(i => i.id === "relation:creates-order")).toBeUndefined();
  expect(architecture.nodes.find(i => i.id === domainId("checkout"))).toEqual(all.nodes.find(i => i.id === domainId("checkout")));
  const focus = neighborhood(index, all, { kind: "item", id: "shop" });
  expect(focus.nodes.has(domainId("checkout"))).toBe(true);
  expect(serializeModel(current)).toBe(before);
});

test("the worked example's source links resolve and its claimed validation runs", async () => {
  await validateChangedLinks({ ...model(), items: [] }, model(), root);
  const request = (lines: unknown) => new Request("http://shop.test/orders", { method: "POST", body: JSON.stringify(lines) });
  const accepted = await handle(request([{ sku: "book", quantity: 2 }]));
  expect(accepted.status).toBe(201);
  expect((await accepted.json()).lines).toEqual([{ sku: "book", quantity: 2 }]);
  expect((await handle(request([{ sku: "book", quantity: -1 }]))).status).toBe(400);
});
