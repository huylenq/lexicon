import { expect, test } from "bun:test";
import type { Editor, TLRecord, TLShape } from "tldraw";
import { dimensionRecords, combinedRecords, combinedLayout } from "../client/src/canvas/combined";
import { modelShapeId } from "../client/src/canvas/references";
import type { Model } from "../shared/model";

test("legacy migration preserves drawing groups, coordinates, assets and attachments", () => {
  const model = { items: [{ id: "domain", type: "context" }, { id: "architecture", type: "system" }] } as Model;
  const shape = (id: string, type: string, parentId = "page:old", props = {}) => ({
    id, typeName: "shape", type, parentId, x: 123, y: 456, meta: {}, props,
  });
  const target = modelShapeId("item:architecture");
  const records = [
    shape(target, "lexicon-object", "page:old", { graphId: "item:architecture" }),
    shape("shape:group", "group"), shape("shape:note", "note", "shape:group"),
    shape("shape:loose", "draw"), shape("shape:image", "image", target, { assetId: "asset:photo" }),
    { id: "binding:note", typeName: "binding", type: "lexicon-note", fromId: "shape:note", toId: target, props: { x: 20, y: 30 }, meta: {} },
  ] as TLRecord[];
  const before = JSON.stringify(records);
  const domain = dimensionRecords(records, model, "domain");
  const architecture = dimensionRecords(records, model, "architecture");
  expect(domain.filter(r => r.typeName === "shape").map(r => r.type)).toEqual(["lexicon-object", "draw"]);
  const note = architecture.find(r => r.typeName === "shape" && r.type === "note") as any;
  expect(note).toMatchObject({ x: 123, y: 456, parentId: "shape:flat-architecture:group" });
  expect(architecture.find(r => r.typeName === "binding")).toMatchObject({
    fromId: note.id, toId: modelShapeId("item:architecture", "architecture"), props: { x: 20, y: 30 },
  });
  expect(architecture.find(r => r.typeName === "shape" && r.type === "image")).toMatchObject({
    parentId: modelShapeId("item:architecture", "architecture"), props: { assetId: "asset:photo" },
  });
  expect(JSON.stringify(records)).toBe(before);
});


test("notes on architecture relationships follow both endpoints; mixed attachments remain in Domain", () => {
  const model = { items: [
    { id: "d", type: "context" }, { id: "a", type: "system" },
    { id: "r", type: "relationship", from: "a", to: "a" },
  ] } as Model;
  const records = [
    { id: modelShapeId("relation:r"), typeName: "shape", type: "lexicon-connection", parentId: "page:old", meta: {}, props: { graphId: "relation:r" } },
    { id: modelShapeId("item:d"), typeName: "shape", type: "lexicon-object", parentId: "page:old", meta: {}, props: { graphId: "item:d" } },
    { id: "shape:note", typeName: "shape", type: "note", parentId: "page:old", meta: {}, props: {} },
    { id: "binding:one", typeName: "binding", type: "lexicon-note", fromId: "shape:note", toId: modelShapeId("relation:r"), props: {}, meta: {} },
  ] as TLRecord[];
  expect(dimensionRecords(records, model, "architecture").some(r => r.typeName === "shape" && r.type === "note")).toBe(true);
  records.push({ id: "binding:two", typeName: "binding", type: "arrow", fromId: "shape:note", toId: modelShapeId("item:d"), props: {}, meta: {} } as TLRecord);
  expect(dimensionRecords(records, model, "architecture").some(r => r.typeName === "shape" && r.type === "note")).toBe(false);
  expect(dimensionRecords(records, model, "domain").some(r => r.typeName === "shape" && r.type === "note")).toBe(true);
});


test("Combined mirrors grouped drawings and bindings with only top-level offsets", () => {
  const model = { items: [{ id: "domain", type: "context" }, { id: "architecture", type: "system" }] } as Model;
  const shape = (id: string, type: string, parentId: string, props = {}) => ({ id, typeName: "shape", type, parentId, x: 123, y: 456, rotation: .2, meta: {}, props });
  const target = modelShapeId("item:architecture", "architecture");
  const records = [
    { ...shape(target, "lexicon-object", "page:lexicon-architecture", { graphId: "item:architecture" }), meta: { lexiconProjection: "architecture" } },
    shape("shape:group", "group", "page:lexicon-architecture"),
    shape("shape:drawing", "draw", "shape:group", { segments: [] }),
    shape("shape:image", "image", target, { assetId: "asset:photo" }),
    { id: "binding:arrow", typeName: "binding", type: "arrow", fromId: "shape:drawing", toId: target, props: { terminal: "start" }, meta: {} },
  ] as TLRecord[];
  const before = JSON.stringify(records);
  const result = combinedRecords(records, model, { domain: { x: 0, y: 0 }, architecture: { x: 1000, y: 200 } });
  const group: any = result.find(r => r.typeName === "shape" && r.type === "group");
  expect(group).toMatchObject({ x: 1123, y: 656, rotation: .2 });
  expect(result.find(r => r.typeName === "shape" && r.type === "draw")).toMatchObject({ parentId: group.id, x: 123, y: 456, rotation: .2 });
  expect(result.find(r => r.typeName === "shape" && r.type === "image")).toMatchObject({ parentId: modelShapeId("item:architecture", "combined"), props: { assetId: "asset:photo" } });
  expect(result.find(r => r.typeName === "binding")).toMatchObject({ toId: modelShapeId("item:architecture", "combined") });
  expect(JSON.stringify(records)).toBe(before);
});


test("Combined-authored shapes and attachments retain mirror identities on rebuild", () => {
  const model = { items: [{ id: "a", type: "system" }] } as Model;
  const target = modelShapeId("item:a", "architecture");
  const records = [
    { id: target, typeName: "shape", type: "lexicon-object", parentId: "page:lexicon-architecture", x: 0, y: 0, props: { graphId: "item:a" }, meta: { lexiconProjection: "architecture" } },
    { id: "shape:combined-origin:authored", typeName: "shape", type: "note", parentId: "page:lexicon-architecture", x: -500, y: 40, props: {}, meta: { combinedMirrorId: "shape:authored" } },
    { id: "binding:combined-origin:authored", typeName: "binding", type: "lexicon-note", fromId: "shape:combined-origin:authored", toId: target, props: { x: -500, y: 40 }, meta: { combinedMirrorId: "binding:authored" } },
  ] as unknown as TLRecord[];
  records.push({ ...records[1], id: "shape:duplicate" } as TLRecord);
  const result = combinedRecords(records, model, { domain: { x: 0, y: 0 }, architecture: { x: 900, y: 20 } });
  expect(new Set(result.map(r => r.id)).size).toBe(result.length);
  expect(result.some(r => r.id === "shape:combined-copy:duplicate")).toBe(true);
  expect(result.find(r => r.typeName === "shape" && r.type === "note")).toMatchObject({ id: "shape:authored", x: 400, y: 60, meta: { combinedSourceId: "shape:combined-origin:authored", combinedDimension: "architecture" } });
  expect(result.find(r => r.typeName === "binding")).toMatchObject({ id: "binding:authored", fromId: "shape:authored", toId: modelShapeId("item:a", "combined") });
});

test("Combined owns each source target on Linked Sources and preserves its drawings and bindings", () => {
  const model = { items: [] } as unknown as Model;
  const target = "code:src/order.ts#Order", file = "file:src/order.ts";
  const node = (graphId: string, scope: string, parentId: string, x: number) => ({
    id: modelShapeId(graphId, scope), typeName: "shape", type: "lexicon-object", parentId,
    x, y: 40, props: { graphId }, meta: { lexiconProjection: scope },
  });
  const records = [
    node(file, "domain", "page:lexicon-domain", 900),
    node(target, "domain", modelShapeId(file, "domain"), 90),
    node(file, "architecture", "page:lexicon-architecture", 800),
    node(target, "architecture", modelShapeId(file, "architecture"), 80),
    node(file, "layers-source", "page:layers-source-links", 100),
    node(target, "layers-source", modelShapeId(file, "layers-source"), 10),
    { id: "shape:source-note", typeName: "shape", type: "note", parentId: "page:layers-source-links", x: 30, y: 50, props: {}, meta: {} },
    { id: "binding:source-note", typeName: "binding", type: "lexicon-note", fromId: "shape:source-note", toId: modelShapeId(target, "layers-source"), props: { x: 20, y: 10 }, meta: {} },
    // The retired filesystem annotation page is preserved, never composed.
    { id: "shape:map-note", typeName: "shape", type: "note", parentId: "page:layers-source", x: 10, y: 10, props: {}, meta: {} },
  ] as unknown as TLRecord[];
  const before = JSON.stringify(records);
  const result = combinedRecords(records, model, { domain: { x: 0, y: 0 }, architecture: { x: 1000, y: 0 }, source: { x: 2000, y: 200 } });
  expect(result.filter(r => r.typeName === "shape" && r.type === "lexicon-object")).toHaveLength(2);
  expect(result.find(r => r.id === modelShapeId(file, "combined"))).toMatchObject({ x: 2100, y: 240, meta: { combinedDimension: "source", combinedSourceId: modelShapeId(file, "layers-source") } });
  expect(result.find(r => r.id === modelShapeId(target, "combined"))).toMatchObject({ x: 10, y: 40, parentId: modelShapeId(file, "combined") });
  expect(result.find(r => r.typeName === "shape" && r.type === "note")).toMatchObject({ x: 2030, y: 250, meta: { combinedDimension: "source" } });
  expect(result.find(r => r.typeName === "binding")).toMatchObject({ fromId: "shape:combined-copy:source-note", toId: modelShapeId(target, "combined") });
  expect(result.some(r => r.id.includes("map-note"))).toBe(false);
  expect(JSON.stringify(records)).toBe(before);
});


test("Combined reads current mirror geometry without laying out the graph again", () => {
  const file = "file:src/order.ts", target = "code:Order";
  const nodes = [{ id: file, kind: "file" as const, title: "order.ts", subtitle: "" },
    { id: target, kind: "code" as const, parentId: file, title: "Order", subtitle: "" }];
  const shapes = new Map(nodes.map((node, i) => [modelShapeId(node.id, "combined"), {
    type: "lexicon-object", x: i ? 16 : 2300, y: i ? 52 : -120,
    props: { w: i ? 214 : 300, h: i ? 44 : 240 }, meta: { combinedSourceId: `shape:original-${i}` },
  } as unknown as TLShape]));
  const editor = { getShape: (id: TLShape["id"]) => shapes.get(id) } as Pick<Editor, "getShape">;
  expect(combinedLayout(editor, nodes)).toEqual({
    [file]: { x: 2300, y: -120, width: 300, height: 240 },
    [target]: { x: 16, y: 52, width: 214, height: 44 },
  });
  // A fresh mirror of an edited page must win over any previous layout cache.
  shapes.set(modelShapeId(file, "combined"), { ...shapes.get(modelShapeId(file, "combined"))!, x: 2800 });
  expect(combinedLayout(editor, nodes)?.[file].x).toBe(2800);
  // Incomplete projections still need normal preparation.
  shapes.delete(modelShapeId(target, "combined"));
  expect(combinedLayout(editor, nodes)).toBeUndefined();
});
