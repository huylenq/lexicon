import { expect, test } from "bun:test";
import type { Editor } from "tldraw";
import { mergeWholeFileReferences } from "../client/src/canvas/whole-file";
import { modelShapeId } from "../client/src/canvas/references";
import { sourceFileFrame } from "../client/src/canvas/sizing";

test("whole-file upgrades preserve precise anchors against final derived bounds after all legacy rows are removed", () => {
  const shape = (graphId: string, parentId: string, x: number, y: number, w: number, h: number, group = false): any => ({
    id: modelShapeId(graphId), type: "lexicon-object", parentId, x, y,
    props: { graphId, w, h, group }, meta: { lexiconLabel: graphId },
  });
  const file = shape("file:source.ts", "page:test", 200, 100, 5000, 5000, true);
  const target = shape("code:real", file.id, -100, -60, 400, 400);
  const old = shape("code:whole", file.id, 10, 60, 200, 40);
  const other = shape("document:whole", file.id, 900, 1000, 200, 40);
  const note = { ...shape("note", "page:test", 700, 800, 200, 100), type: "note" };
  const shapes = new Map([file, target, old, other, note].map(s => [s.id, s]));
  const binding: any = { id: "binding:arrow", type: "arrow", fromId: "shape:arrow", toId: old.id,
    props: { normalizedAnchor: { x: .2, y: .3 }, isPrecise: true, isExact: true } };
  const noteBinding: any = { id: "binding:note", type: "lexicon-note", fromId: note.id, toId: old.id, props: { x: 0, y: 0 } };
  const bindings = [binding, noteBinding];
  const origin = (s: any): { x: number; y: number } => {
    const p = shapes.get(s.parentId), offset = p ? origin(p) : { x: 0, y: 0 };
    return { x: s.x + offset.x, y: s.y + offset.y };
  };
  const editor = {
    getCurrentPageShapes: () => [...shapes.values()], getShape: (id: string) => shapes.get(id),
    getSortedChildIdsForParent: (id: string) => [...shapes.values()].filter(s => s.parentId === id).map(s => s.id),
    getSelectedShapeIds: () => [],
    getBindingsToShape: (id: string, type: string) => bindings.filter(b => b.toId === id && b.type === type).map(b => structuredClone(b)),
    getShapeGeometry: (s: any) => ({ bounds: s === file ? sourceFileFrame(editor, s) : { x: 0, y: 0, w: s.props.w, h: s.props.h } }),
    getShapePageTransform: (s: any) => { const o = origin(s); return { applyToPoint: (p: any) => ({ x: o.x + p.x, y: o.y + p.y }) }; },
    getPointInShapeSpace: (s: any, p: any) => { const o = origin(s); return { x: p.x - o.x, y: p.y - o.y }; },
    updateBinding: (update: any) => { const b = bindings.find(b => b.id === update.id); Object.assign(b, { ...update, props: { ...b.props, ...update.props } }); },
    deleteShape: (id: string) => shapes.delete(id),
    textMeasure: { measureText: () => ({ w: 100, h: 20 }) },
  } as unknown as Editor;
  const before = editor.getShapePageTransform(old).applyToPoint({ x: 40, y: 12 });
  mergeWholeFileReferences(editor, [{ id: file.props.graphId, title: "source.ts", kind: "file", subtitle: "",
    wholeFileTargets: [old.props.graphId, other.props.graphId] }], modelShapeId);
  const frame = sourceFileFrame(editor, file), anchor = binding.props.normalizedAnchor;
  const after = editor.getShapePageTransform(file).applyToPoint({ x: frame.x + anchor.x * frame.w, y: frame.y + anchor.y * frame.h });
  expect(after.x).toBeCloseTo(before.x);
  expect(after.y).toBeCloseTo(before.y);
  expect(binding.toId).toBe(file.id);
  expect(shapes.has(old.id)).toBe(false);
  expect(shapes.has(other.id)).toBe(false);
  expect(noteBinding).toMatchObject({ toId: file.id, props: { x: 500, y: 700 } });
  expect(file.props).toMatchObject({ w: 5000, h: 5000 });
});
