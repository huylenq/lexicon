import { expect, test } from "bun:test";
import type { TLRecord } from "tldraw";
import { dimensionRecords } from "../client/src/canvas/combined";
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
