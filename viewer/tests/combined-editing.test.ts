import { expect, test } from "bun:test";
import { HistoryManager, createTLStore, Editor, type TLShape, type TLShapeId } from "tldraw";
import { canvasSchema } from "../shared/canvas-schema";
import { enableCombinedDrawing } from "../client/src/canvas/combinedEditing";
import { internalWrite, isHistoryReplay } from "../client/src/canvas/internalWrite";
import type { CanvasPlane } from "../client/src/graph/planes";
import { modelShapeId } from "../client/src/canvas/references";
import { combinedPage, flatPageIds } from "../client/src/canvas/combined";

function fixture() {
  const store = createTLStore({ schema: canvasSchema });
  const page = canvasSchema.types.page.create({ id: combinedPage, name: "Combined", index: "a1" as any,
    meta: { combinedOffsets: { domain: { x: 0, y: 0 }, architecture: { x: 1000, y: 0 }, source: { x: 2000, y: 100 } } } });
  store.put([page, ...(["domain", "architecture", "source"] as const).map((dimension, i) =>
    canvasSchema.types.page.create({ id: flatPageIds[dimension], name: dimension, index: `a${i + 2}` as any }))]);
  const history = new HistoryManager({ store });
  let active: CanvasPlane = "architecture";
  // Exercise the real store callbacks and history; only canvas geometry is stubbed.
  const editor = {
    store, history, sideEffects: store.sideEffects,
    isReplayingHistory: () => isHistoryReplay(Object.assign(Object.create(Editor.prototype), { history })),
    getCurrentPageId: () => combinedPage,
    getAncestorPageId: (shape: { parentId: string }) => shape.parentId,
    getShape: (id: TLShapeId) => { const record = store.get(id); return record?.typeName === "shape" ? record : undefined; },
    getPage: (id: typeof combinedPage) => store.get(id),
    getIsReadonly: () => false,
  } as unknown as Editor;
  enableCombinedDrawing(editor, () => active);
  const group = (id: string, dimension: CanvasPlane, x = 100) =>
    canvasSchema.types.shape.create({ id: id as TLShapeId, type: "group", parentId: combinedPage,
      index: "a1" as any, x, y: 400, props: {},
      meta: { combinedDimension: dimension, combinedSourceId: `shape:source-${id.slice(6)}` } });
  return { store, history, editor, page, group, activate: (dimension: typeof active) => { active = dimension; } };
}

test("dimension undo and redo restore model positions together with offsets", () => {
  const { store, history, editor, page } = fixture();
  const node = canvasSchema.types.shape.create({ id: "shape:model" as TLShapeId, type: "lexicon-object",
    parentId: combinedPage, index: "a1" as any, x: 1100, y: 0,
    props: { graphId: "item:architecture", w: 190, h: 70, group: false, territory: null },
    meta: { combinedDimension: "architecture", combinedSourceId: "shape:source" } });
  internalWrite(editor, () => store.put([node]));
  Editor.prototype.markHistoryStoppingPoint.call(editor, "move dimension");
  const moved = { ...node, x: 1200 };
  const movedPage = { ...page, meta: { combinedOffsets: { architecture: { x: 1100, y: 0 } } } };
  internalWrite(editor, () => store.put([movedPage, moved]));
  history.undo();
  expect(store.get(node.id)).toEqual(node);
  expect(store.get(page.id)).toEqual(page);
  history.redo();
  expect(store.get(node.id)).toEqual(moved);
  expect(store.get(page.id)).toEqual(movedPage);
});

test("undoing deletion after selecting another plane preserves drawing identity and ownership", () => {
  const { store, history, editor, group, activate } = fixture();
  const drawing = group("shape:drawing", "architecture");
  store.put([drawing]);
  const original = store.get(drawing.id)! as TLShape;
  const sourceId = original.meta.combinedSourceId as TLShapeId;
  const source = store.get(sourceId);
  Editor.prototype.markHistoryStoppingPoint.call(editor, "delete drawing");
  store.remove([drawing.id]);
  expect(store.get(sourceId)).toBeUndefined();
  activate("domain");
  history.undo();
  expect(store.get(drawing.id)).toEqual(original);
  expect(store.get(sourceId)).toEqual(source);
  history.redo();
  expect(store.get(drawing.id)).toBeUndefined();
  expect(store.get(sourceId)).toBeUndefined();
});

test("rejecting a foreign parent preserves the complete drawing and its source", () => {
  const { store, editor, group, activate } = fixture();
  activate("domain");
  const drawing = group("shape:drawing", "domain", 600);
  store.put([drawing]);
  const original = store.get(drawing.id)! as TLShape;
  const sourceId = original.meta.combinedSourceId as TLShapeId;
  const source = store.get(sourceId);
  const parent = group("shape:foreign", "architecture", 500);
  internalWrite(editor, () => store.put([parent]));
  store.put([{ ...original, parentId: parent.id as TLShapeId, x: 100, y: 100, rotation: 1 }]);
  expect(store.get(drawing.id)).toEqual(original);
  expect(store.get(sourceId)).toEqual(source);
});


test("Linked Sources drawing edits retain page ownership through undo and redo", () => {
  const { store, history, editor, group, activate } = fixture();
  activate("source");
  const drawing = group("shape:source-drawing", "source", 2100);
  store.put([drawing]);
  const original = store.get(drawing.id)! as TLShape;
  const sourceId = original.meta.combinedSourceId as TLShapeId;
  expect(store.get(sourceId)).toMatchObject({ parentId: flatPageIds.source, x: 100, y: 300 });
  Editor.prototype.markHistoryStoppingPoint.call(editor, "move source drawing");
  store.put([{ ...original, x: 2200 }]);
  expect(store.get(sourceId)).toMatchObject({ x: 200 });
  activate("domain");
  history.undo();
  expect(store.get(sourceId)).toMatchObject({ parentId: flatPageIds.source, x: 100 });
  history.redo();
  expect(store.get(sourceId)).toMatchObject({ parentId: flatPageIds.source, x: 200 });
});

for (const dimension of ["domain", "architecture", "source"] as const) test(`Combined ${dimension} model movement writes through and replays without losing source metadata`, () => {
  const { store, history, editor, activate } = fixture();
  activate("domain");
  const source = canvasSchema.types.shape.create({ id: modelShapeId("item:model", dimension), type: "lexicon-object",
    parentId: flatPageIds[dimension], index: "a1" as any, x: 100, y: 80,
    props: { graphId: "item:model", w: 190, h: 70, group: false, territory: null },
    meta: { lexiconProjection: dimension } }) as TLShape;
  const offset = dimension === "architecture" ? { x: 1000, y: 0 } : dimension === "source" ? { x: 2000, y: 100 } : { x: 0, y: 0 };
  const mirror = { ...source, id: modelShapeId("item:model", "combined"), parentId: combinedPage,
    x: source.x + offset.x, y: source.y + offset.y,
    meta: { lexiconProjection: "combined", combinedDimension: dimension, combinedSourceId: source.id } };
  internalWrite(editor, () => store.put([source, mirror]));
  Editor.prototype.markHistoryStoppingPoint.call(editor, "move model");
  store.put([{ ...mirror, x: mirror.x + 60, y: mirror.y + 30 }]);
  expect(store.get(source.id)).toEqual({ ...source, x: 160, y: 110 });
  history.undo();
  expect(store.get(source.id)).toEqual(source);
  expect(store.get(mirror.id)).toEqual(mirror);
  history.redo();
  expect(store.get(source.id)).toEqual({ ...source, x: 160, y: 110 });
  store.remove([mirror.id]);
  expect(store.get(mirror.id)).toBeDefined();
});

for (const type of ["lexicon-object", "lexicon-connection"] as const) test(`Combined ${type} Atlas appearance writes through with undo`, () => {
  const { store, history, editor } = fixture();
  const source = canvasSchema.types.shape.create({ id: modelShapeId(type === "lexicon-object" ? "item:atlas" : "relation:atlas", "architecture"), type,
    parentId: flatPageIds.architecture, index: "a1" as any,
    props: type === "lexicon-object" ? { graphId: "item:atlas", w: 190, h: 70, group: false, territory: null }
      : { graphId: "relation:atlas", path: "", points: [], labelX: 0, labelY: 0, labelWidth: 100 },
    meta: { lexiconProjection: "architecture" } }) as TLShape;
  const mirror = { ...source, id: modelShapeId(type === "lexicon-object" ? "item:atlas" : "relation:atlas", "combined"), parentId: combinedPage,
    meta: { lexiconProjection: "combined", combinedDimension: "architecture", combinedSourceId: source.id } };
  internalWrite(editor, () => store.put([source, mirror]));
  Editor.prototype.markHistoryStoppingPoint.call(editor, "Atlas appearance");
  const appearance = { lexiconLandmark: "archive", lexiconTerrain: "woodland", lexiconPath: "trail" };
  store.put([{ ...mirror, meta: { ...mirror.meta, ...appearance } }]);
  expect(store.get(source.id)?.meta).toEqual({ ...source.meta, ...appearance });
  history.undo();
  expect(store.get(source.id)).toEqual(source);
  history.redo();
  expect(store.get(source.id)?.meta).toEqual({ ...source.meta, ...appearance });
});

test("duplicated Combined model references own separate source records through move, delete, and undo", () => {
  const { store, history, editor, activate } = fixture();
  activate("domain");
  const source = canvasSchema.types.shape.create({ id: modelShapeId("item:copy", "architecture"), type: "lexicon-object",
    parentId: flatPageIds.architecture, index: "a1" as any, x: 100, y: 80,
    props: { graphId: "item:copy", w: 190, h: 70, group: false, territory: null },
    meta: { lexiconProjection: "architecture" } }) as TLShape;
  const mirror = { ...source, id: modelShapeId("item:copy", "combined"), parentId: combinedPage, x: 1100,
    meta: { lexiconProjection: "combined", combinedDimension: "architecture", combinedSourceId: source.id } };
  internalWrite(editor, () => store.put([source, mirror]));
  const copyId = "shape:copy" as TLShapeId;
  store.put([{ ...mirror, id: copyId, x: 1160 }]);
  const copy = store.get(copyId)! as TLShape;
  const copySourceId = copy.meta.combinedSourceId as TLShapeId;
  expect(copySourceId).not.toBe(source.id);
  expect(store.get(copySourceId)).toMatchObject({ x: 160, parentId: flatPageIds.architecture });
  store.put([{ ...copy, x: 1260 }]);
  expect(store.get(copySourceId)).toMatchObject({ x: 260 });
  expect(store.get(source.id)).toEqual(source);
  expect(store.get(mirror.id)).toEqual(mirror);
  Editor.prototype.markHistoryStoppingPoint.call(editor, "delete copy");
  store.remove([copyId]);
  expect(store.get(copySourceId)).toBeUndefined();
  history.undo();
  expect(store.get(copySourceId)).toMatchObject({ x: 260 });
  expect(store.get(source.id)).toEqual(source);
});
