import { expect, test } from "bun:test";
import type { Editor } from "tldraw";
import type { ObjectShape } from "../shared/canvas-schema";
import { arrangeGraph, type Positions } from "../client/src/graph/layout";
import type { Projection } from "../client/src/graph/model";
import { directoryFrame, sourceFileFrame, objectSizes } from "../client/src/canvas/sizing";

const graph: Projection = { nodes: [
  { id: "directory:src", kind: "directory", title: "src", subtitle: "" },
  { id: "directory:src/nested", kind: "directory", title: "nested", subtitle: "", parentId: "directory:src" },
  ...Array.from({ length: 6 }, (_, i) => ({ id: `file:${i}`, kind: "file" as const,
    title: i === 4 ? "a-long-file-heading-that-wraps.ts" : `file${i}.ts`, subtitle: "",
    parentId: i < 4 ? "directory:src/nested" : "directory:src" })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `code:${i}`, kind: "code" as const,
    title: `symbol${i}`, subtitle: "", parentId: `file:${i}` })),
  { id: "file:root", kind: "file", title: "root.ts", subtitle: "" },
], connections: [], omitted: 0 };

async function arranged(saved: Positions = {}) {
  let shapes: ObjectShape[] = [];
  const editor = {
    textMeasure: { measureText: (title: string) => ({ w: title.length > 20 ? 220 : 100, h: title.length > 20 ? 40 : 20 }) },
    getShape: (id: string) => shapes.find(s => s.id === id),
    getSortedChildIdsForParent: (id: string) => shapes.filter(s => s.parentId === id).map(s => s.id),
  } as unknown as Editor;
  const sizes = Object.fromEntries(graph.nodes.map(n => {
    const s = objectSizes(editor, n.title, n.kind).reserve;
    return [n.id, { width: s.w, height: s.h }];
  }));
  const layout = await arrangeGraph(graph, saved, sizes);
  shapes = graph.nodes.map(n => ({ id: n.id, parentId: n.parentId || "page:test", type: "lexicon-object",
    x: layout[n.id].x, y: layout[n.id].y, meta: { lexiconLabel: n.title },
    props: { graphId: n.id, group: n.kind !== "code", w: layout[n.id].width, h: layout[n.id].height },
  } as unknown as ObjectShape));
  const boxes = shapes.filter(s => s.props.group).map(s => {
    const f = s.props.graphId.startsWith("file:") ? sourceFileFrame(editor, s) : directoryFrame(editor, s);
    expect(f.w).toBe(layout[s.id].width);
    expect(f.h).toBe(layout[s.id].height);
    return { id: s.id, parentId: s.parentId, x: s.x + f.x, y: s.y + f.y, w: f.w, h: f.h };
  });
  return { layout, boxes };
}

test("Arrange separates rendered files and nested directories, including empty files and wrapped headings", async () => {
  const { boxes } = await arranged();
  for (const a of boxes) for (const b of boxes) {
    if (a.id === b.id || a.parentId !== b.parentId) continue;
    expect(a.x + a.w + 19 <= b.x || b.x + b.w + 19 <= a.x ||
      a.y + a.h + 19 <= b.y || b.y + b.h + 19 <= a.y).toBe(true);
  }
});

test("new source containers avoid saved visible bounds without moving saved origins or targets", async () => {
  const saved = { "directory:src": { x: -200, y: 300 }, "file:0": { x: -30, y: -40 },
    "code:0": { x: -500, y: -600 } };
  const { layout, boxes } = await arranged(saved);
  for (const [id, position] of Object.entries(saved)) expect(layout[id]).toMatchObject(position);
  const fixed = boxes.find(b => b.id === "file:0")!;
  for (const b of boxes.filter(b => b.parentId === fixed.parentId && b.id !== fixed.id)) {
    expect(fixed.x + fixed.w <= b.x || b.x + b.w <= fixed.x ||
      fixed.y + fixed.h <= b.y || b.y + b.h <= fixed.y).toBe(true);
  }
});
