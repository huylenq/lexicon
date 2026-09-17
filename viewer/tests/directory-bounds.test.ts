import { expect, test } from "bun:test";
import type { Editor } from "tldraw";
import type { ObjectShape } from "../shared/canvas-schema";
import { directoryFrame, sourceFileFrame } from "../client/src/canvas/sizing";

test("nested directory bounds expand and shrink with files without changing saved sizes", () => {
  const shape = (id: string, parentId: string, x: number, y: number, group: boolean) => ({
    id, parentId, type: "lexicon-object", x, y,
    props: { graphId: id, group, w: 300, h: 100 }, meta: { lexiconLabel: id },
  } as unknown as ObjectShape);
  const root = shape("directory:src", "page:test", 0, 0, true);
  const nested = shape("directory:src/api", root.id, 40, 80, true);
  const file = shape("file:src/api/chat.ts", nested.id, 28, 65, true);
  const shapes = [root, nested, file];
  const editor = {
    getSortedChildIdsForParent: (id: string) => shapes.filter(s => s.parentId === id).map(s => s.id),
    getShape: (id: string) => shapes.find(s => s.id === id),
    textMeasure: { measureText: () => ({ w: 100, h: 20 }) },
  } as unknown as Editor;
  const before = directoryFrame(editor, root);
  file.x -= 500;
  file.y -= 400;
  const moved = directoryFrame(editor, root);
  expect(moved.x).toBe(before.x - 500);
  expect(moved.y).toBe(before.y - 400);
  file.props.w += 600;
  expect(directoryFrame(editor, root)).toEqual(moved);
  file.props.w -= 600;
  file.x += 500;
  file.y += 400;
  expect(directoryFrame(editor, root)).toEqual(before);
  expect(root.props.w).toBe(300);
  expect(nested.props.w).toBe(300);
});

test("file and directory frames enclose symbols on every side and shrink on restoration", () => {
  const directory = { id: "shape:directory", parentId: "page:test", type: "lexicon-object", x: 0, y: 0,
    props: { graphId: "directory:src", group: true, w: 500, h: 300 }, meta: {} } as unknown as ObjectShape;
  const file = { ...directory, id: "shape:file", parentId: directory.id, x: 20, y: 44,
    props: { ...directory.props, graphId: "file:src/invoke.py", w: 300, h: 140 } } as ObjectShape;
  const target = { ...file, id: "shape:target", parentId: file.id, x: 10, y: 44,
    props: { ...file.props, graphId: "code:invoke_agent", group: false, w: 180, h: 28 } } as ObjectShape;
  const shapes = [directory, file, target];
  const editor = {
    getSortedChildIdsForParent: (id: string) => shapes.filter(s => s.parentId === id).map(s => s.id),
    getShape: (id: string) => shapes.find(s => s.id === id),
    textMeasure: { measureText: () => ({ w: 100, h: 20 }) },
  } as unknown as Editor;
  const original = sourceFileFrame(editor, file), outer = directoryFrame(editor, directory);
  for (const [x, y] of [[-891.836, 131.72], [700, 44], [10, -300], [10, 600]]) {
    Object.assign(target, { x, y });
    const f = sourceFileFrame(editor, file), d = directoryFrame(editor, directory);
    expect(f.x).toBeLessThanOrEqual(x - 10);
    expect(f.y).toBeLessThanOrEqual(y - 44);
    expect(f.x + f.w).toBeGreaterThanOrEqual(x + target.props.w + 10);
    expect(f.y + f.h).toBeGreaterThanOrEqual(y + target.props.h + 10);
    expect(d.x).toBeLessThanOrEqual(file.x + f.x);
    expect(d.y).toBeLessThanOrEqual(file.y + f.y);
    expect(d.x + d.w).toBeGreaterThanOrEqual(file.x + f.x + f.w);
    expect(d.y + d.h).toBeGreaterThanOrEqual(file.y + f.y + f.h);
    expect(file.props).toMatchObject({ w: 300, h: 140 });
  }
  Object.assign(target, { x: 10, y: 44 });
  expect(sourceFileFrame(editor, file)).toEqual(original);
  expect(directoryFrame(editor, directory)).toEqual(outer);
});
