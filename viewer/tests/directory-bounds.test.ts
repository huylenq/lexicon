import { expect, test } from "bun:test";
import type { Editor } from "tldraw";
import type { ObjectShape } from "../shared/canvas-schema";
import { directoryFrame } from "../client/src/canvas/sizing";

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
  expect(directoryFrame(editor, root).w).toBe(moved.w + 600);
  file.props.w -= 600;
  file.x += 500;
  file.y += 400;
  expect(directoryFrame(editor, root)).toEqual(before);
  expect(root.props.w).toBe(300);
  expect(nested.props.w).toBe(300);
});
