import { expect, test } from "bun:test";
import { HistoryManager, createTLStore, Editor, type TLShape, type TLShapeId } from "tldraw";
import { canvasSchema } from "../shared/canvas-schema";
import { enableCombinedDrawing } from "../client/src/canvas/combinedEditing";
import { internalWrite, isHistoryReplay } from "../client/src/canvas/internalWrite";
import { combinedPage, flatPageIds } from "../client/src/canvas/combined";

function fixture() {
  const store = createTLStore({ schema: canvasSchema });
  const page = canvasSchema.types.page.create({ id: combinedPage, name: "Combined", index: "a1" as any,
    meta: { combinedOffsets: { domain: { x: 0, y: 0 }, architecture: { x: 1000, y: 0 } } } });
  store.put([page, ...(["domain", "architecture"] as const).map((dimension, i) =>
    canvasSchema.types.page.create({ id: flatPageIds[dimension], name: dimension, index: `a${i + 2}` as any }))]);
  const history = new HistoryManager({ store });
  let active: "domain" | "architecture" = "architecture";
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
  const group = (id: string, dimension: "domain" | "architecture", x = 100) =>
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

test("undoing deletion after selecting another layer preserves drawing identity and ownership", () => {
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
