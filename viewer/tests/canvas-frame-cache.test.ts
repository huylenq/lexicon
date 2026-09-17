import { expect, test } from "bun:test";
import type { Editor } from "tldraw";
import type { ObjectShape } from "../shared/canvas-schema";
import { FrameCache } from "../client/src/canvas/frameCache";
import { canvasPresentation } from "../client/src/canvas/presentation";
import { occupiedObjectFrame, visibleObjectFrame } from "../client/src/canvas/terrain/view";

for (const kind of ["directory", "context", "atlas"] as const) {
  test(`${kind}: cached nested frames match fresh geometry after movement and restoration`, () => {
    const shape = (name: string, parentId: string, group: boolean) => ({
      id: `shape:${name}`, parentId, type: "lexicon-object", x: 40, y: 80,
      props: { graphId: `${group ? kind === "directory" ? "directory" : "item" : "file"}:${name}`, group, w: 300, h: 100 },
      meta: { lexiconLabel: name },
    } as unknown as ObjectShape);
    const root = shape("root", "page:test", true), nested = shape("nested", root.id, true);
    const leaf = shape("leaf", nested.id, false), peer = shape("peer", root.id, true);
    const shapes = [root, nested, leaf, peer];
    const reads = new Map<string, number>();
    const editor = {
      getSortedChildIdsForParent: (id: string) => {
        reads.set(id, (reads.get(id) || 0) + 1);
        return shapes.filter(s => s.parentId === id).map(s => s.id);
      },
      getShape: (id: string) => shapes.find(s => s.id === id),
      isShapeHidden: () => false,
      textMeasure: { measureText: () => ({ w: 100, h: 20 }) },
    } as unknown as Editor;
    const view = canvasPresentation(editor);
    view.set({ ...view.get(), mapEnabled: kind === "atlas" });
    const frames = new FrameCache();
    const before = occupiedObjectFrame(editor, root, frames);
    const initialReads = new Map(reads);
    expect(occupiedObjectFrame(editor, root, frames)).toBe(before);
    expect(reads).toEqual(initialReads);
    // Both visible and occupied recursion share the nested frame measurement.
    expect(reads.get(nested.id)).toBe(2);
    leaf.x += 900;
    frames.invalidate(editor, [leaf.id]);
    const moved = occupiedObjectFrame(editor, root, frames);
    expect(moved.w).toBeGreaterThan(before.w);
    expect(reads.get(peer.id)).toBe(initialReads.get(peer.id));
    expect(moved).toEqual(occupiedObjectFrame(editor, root, new FrameCache()));
    leaf.x -= 900;
    frames.invalidate(editor, [leaf.id]);
    expect(occupiedObjectFrame(editor, root, frames)).toEqual(before);
    expect(root.props.w).toBe(300);
  });
}

test("occupied file bounds retain targets outside the authored visible frame", () => {
  const file = { id: "shape:file", parentId: "page:test", type: "lexicon-object", x: 0, y: 0,
    props: { graphId: "file:test.ts", group: true, w: 300, h: 100 }, meta: {} } as unknown as ObjectShape;
  const target = { ...file, id: "shape:target", parentId: file.id, x: 700,
    props: { ...file.props, graphId: "code:target", group: false, w: 100, h: 28 } } as ObjectShape;
  const editor = {
    getSortedChildIdsForParent: (id: string) => id === file.id ? [target.id] : [],
    getShape: (id: string) => id === target.id ? target : id === file.id ? file : undefined,
    isShapeHidden: () => false,
  } as unknown as Editor;
  expect(visibleObjectFrame(editor, file).w).toBe(300);
  expect(occupiedObjectFrame(editor, file, new FrameCache()).w).toBe(800);
  expect(file.props.w).toBe(300);
});
