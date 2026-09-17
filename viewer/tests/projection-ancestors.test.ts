import { expect, test, spyOn } from "bun:test";
import type { Editor } from "tldraw";
import { createProjection } from "../client/src/canvas/projection";
import { modelShapeId } from "../client/src/canvas/references";
import * as layout from "../client/src/graph/layout";
import type { Projection } from "../client/src/graph/model";

test("restoring a nested source file retains every layout ancestor", async () => {
  const arrange = spyOn(layout, "arrangeGraph").mockImplementation(async (graph, saved = {}) => {
    const ids = new Set(graph.nodes.map(node => node.id));
    for (const node of graph.nodes)
      if (node.parentId) expect(ids.has(node.parentId)).toBe(true);
    return Object.fromEntries(graph.nodes.map(node => [node.id, {
      width: 280, height: 110, ...(saved[node.id] ?? { x: 0, y: 0 }),
    }]));
  });
  const shapes = new Map<string, any>();
  const editor = {
    inputs: { getIsDragging: () => false },
    getCurrentPageId: () => "page:test",
    getShape: (id: string) => shapes.get(id),
    getCurrentPageShapes: () => [...shapes.values()],
    getIsReadonly: () => false,
    run: (fn: () => void) => fn(),
    createShape: (shape: any) => shapes.set(shape.id, shape),
    updateShape: (shape: any) => shapes.set(shape.id, { ...shapes.get(shape.id), ...shape }),
    sendToBack: () => {},
    on: () => {}, off: () => {},
    textMeasure: { measureText: () => ({ w: 100, h: 20 }) },
    sideEffects: Object.fromEntries([
      "registerBeforeDeleteHandler", "registerBeforeChangeHandler", "registerAfterChangeHandler",
      "registerAfterCreateHandler", "registerAfterDeleteHandler", "registerOperationCompleteHandler",
    ].map(name => [name, () => () => {}])),
  } as unknown as Editor;
  const full: Projection = {
    nodes: [
      { id: "directory:src", kind: "directory", title: "src", subtitle: "" },
      { id: "directory:src/api", kind: "directory", title: "api", subtitle: "", parentId: "directory:src" },
      { id: "file:src/api/chat.ts", kind: "file", title: "chat.ts", subtitle: "", parentId: "directory:src/api" },
    ], connections: [], omitted: 0,
  };
  const projection = createProjection(editor, { "file:src/api/chat.ts": { x: 31, y: 47 } });
  try {
    expect(await projection.update(full, { nodes: [], connections: [], omitted: 0 })).toBe(true);
    expect(shapes.size).toBe(3);
    const file = shapes.get(modelShapeId("file:src/api/chat.ts"));
    expect(file).toMatchObject({ x: 31, y: 47, parentId: modelShapeId("directory:src/api") });
    for (const shape of shapes.values()) expect(shape.props.w).toBeGreaterThan(0);
  } finally { projection.dispose(); arrange.mockRestore(); }
});
