import { expect, test } from "bun:test";
import { Box, type Editor, type TLPageId, type TLRecord, type TLShape } from "tldraw";
import { canvasAgentAnchors } from "../client/src/canvas/agentAnchors";
import { combinedPage, combinedRecords, flatPageIds } from "../client/src/canvas/combined";
import { modelShapeId } from "../client/src/canvas/references";
import type { CanvasPlane } from "../client/src/graph/planes";
import type { Model } from "../shared/model";
import { canvasSchema } from "../shared/canvas-schema";

const model = { items: [{ id: "domain", type: "context" }, { id: "architecture", type: "system" }] } as Model;
const offsets = { domain: { x: -1600, y: 100 }, architecture: { x: 1100, y: -500 }, source: { x: 2500, y: 300 } };
const node = (id: string, plane: CanvasPlane, x: number, y: number): TLShape => canvasSchema.types.shape.create({
  id: modelShapeId(id, plane), type: "lexicon-object", parentId: flatPageIds[plane],
  x, y, props: { graphId: id, w: 160, h: 80, group: false, territory: null }, meta: { lexiconProjection: plane },
}) as TLShape;
const records = [node("item:domain", "domain", 100, 200), node("item:architecture", "architecture", 600, 400), node("file:app.ts", "source", 50, 80)];

function editorFor(shapes: TLRecord[], page: TLPageId, camera = { x: 0, y: 0, z: 1 }) {
  const current = shapes.filter((shape): shape is TLShape => shape.typeName === "shape");
  const byId = new Map(current.map(shape => [shape.id, shape]));
  const ancestry = (shape: TLShape) => {
    const parents = [shape];
    let parent = byId.get(shape.parentId as TLShape["id"]);
    while (parent) { parents.push(parent); parent = byId.get(parent.parentId as TLShape["id"]); }
    return parents;
  };
  return {
    getCurrentPageId: () => page,
    getCurrentPageShapes: () => current.filter(shape => ancestry(shape).at(-1)!.parentId === page),
    getPage: () => ({ meta: { combinedOffsets: offsets } }),
    isShapeHidden: (shape: TLShape) => ancestry(shape).some(parent => parent.meta.lexiconHidden),
    getShapePageBounds: (shape: TLShape) => {
      const parents = ancestry(shape);
      const size = shape.type === "lexicon-object" ? shape.props : { w: 200, h: 80 };
      return new Box(parents.reduce((x, parent) => x + parent.x, 0), parents.reduce((y, parent) => y + parent.y, 0), size.w, size.h);
    },
    pageToViewport: (point: { x: number; y: number }) => ({ x: (point.x + camera.x) * camera.z, y: (point.y + camera.y) * camera.z }),
  } as unknown as Editor;
}

test("project homes and model anchors follow each plane's Combined translation", () => {
  const combined = canvasAgentAnchors(editorFor(combinedRecords(records, model, offsets), combinedPage), "architecture");
  for (const plane of ["domain", "architecture", "source"] as const) {
    const source = canvasAgentAnchors(editorFor(records, flatPageIds[plane]));
    expect(source.homeDimension).toBe(plane);
    expect(combined.homes[plane]).toEqual({ x: source.home.x + offsets[plane].x, y: source.home.y + offsets[plane].y });
    if (plane !== "source") expect(combined.anchors[plane]).toEqual({ x: source.anchors[plane].x + offsets[plane].x, y: source.anchors[plane].y + offsets[plane].y });
  }
  expect(combined.homeDimension).toBe("architecture");
  expect(combined.home).toEqual(combined.homes.architecture!);
});

test("cross-plane routes, expanded source links, and hidden or missing objects cannot displace a plane's agent home", () => {
  const route = { ...node("relation:cross-plane", "domain", -9000, -8000), type: "lexicon-connection" } as TLShape;
  const missing = { ...node("item:missing", "domain", -6000, -5000), meta: { lexiconProjection: "domain", lexiconMissing: true } };
  const hiddenParent = { ...node("item:hidden-context", "domain", -4000, -3000), meta: { lexiconProjection: "domain", lexiconHidden: true } };
  const child = { ...node("item:hidden-child", "domain", 20, 20), parentId: hiddenParent.id };
  const expanded = node("file:expanded.ts", "domain", -2000, -1000);
  const baseline = canvasAgentAnchors(editorFor(records, flatPageIds.domain));
  const actual = canvasAgentAnchors(editorFor([...records, route, missing, hiddenParent, child, expanded], flatPageIds.domain));
  expect(actual.homes).toEqual(baseline.homes);
  expect(actual.home).toEqual(baseline.home);
  expect(actual.anchors.domain).toEqual(baseline.anchors.domain);
  expect(actual.anchors.missing).toBeUndefined();
  expect(actual.historicalBounds.missing).toBeDefined();
  expect(actual.anchors["cross-plane"]).toBeDefined();
});

test("nested model objects use page geometry in Combined and camera changes only transform their position", () => {
  const parent = node("item:domain", "domain", 500, 600);
  const child = { ...node("item:concept", "domain", 30, 40), parentId: parent.id };
  const contents = combinedRecords([parent, child], model, offsets);
  const origin = canvasAgentAnchors(editorFor(contents, combinedPage));
  expect(origin.anchors.concept).toEqual({ x: 500 + 30 + offsets.domain.x + 160 + 20, y: 600 + 40 + offsets.domain.y });
  const camera = { x: 1800, y: -150, z: .35 };
  const zoomed = canvasAgentAnchors(editorFor(contents, combinedPage, camera));
  expect(zoomed.anchors.concept).toEqual({ x: (origin.anchors.concept.x + camera.x) * camera.z, y: (origin.anchors.concept.y + camera.y) * camera.z });
  expect(zoomed.home).toEqual({ x: (origin.home.x + camera.x) * camera.z, y: (origin.home.y + camera.y) * camera.z });
});

test("empty pages have a stable home and Combined falls back to a populated plane", () => {
  const camera = { x: 700, y: 300, z: .5 };
  expect(canvasAgentAnchors(editorFor([], flatPageIds.architecture, camera))).toMatchObject({ homeDimension: "architecture", home: { x: 210, y: 150 } });
  const combined = canvasAgentAnchors(editorFor(combinedRecords([records[1]], model, offsets), combinedPage));
  expect(combined.homeDimension).toBe("architecture");
  expect(combined.home).toEqual(combined.homes.architecture!);
});

test("agent placement origins do not move when the model's leftmost object changes", () => {
  const original = canvasAgentAnchors(editorFor(records, flatPageIds.domain));
  const moved = canvasAgentAnchors(editorFor([{ ...records[0], x: 900, y: 1200 } as TLShape], flatPageIds.domain));
  expect(moved.home).not.toEqual(original.home);
  expect(moved.origins).toEqual(original.origins);
  const camera = { x: 500, y: 200, z: .4 };
  const combined = canvasAgentAnchors(editorFor(combinedRecords(records, model, offsets), combinedPage, camera));
  expect(combined.origins.domain).toEqual({ x: (offsets.domain.x + camera.x) * camera.z, y: (offsets.domain.y + camera.y) * camera.z });
});

test("code review anchors follow authored source cards through Combined and ignore hidden or missing cards", () => {
  const missing = { ...node("file:missing.ts", "source", 500, 600), meta: { lexiconProjection: "source", lexiconMissing: true } };
  const hidden = { ...node("file:hidden.ts", "source", 300, 400), meta: { lexiconProjection: "source", lexiconHidden: true } };
  const contents = [...records, missing, hidden];
  const source = canvasAgentAnchors(editorFor(contents, flatPageIds.source));
  expect(source.sourceBounds).toEqual({ "app.ts": { x: 50, y: 80, width: 160, height: 80 } });
  expect(source.bounds["app.ts"]).toBeUndefined();
  const combined = canvasAgentAnchors(editorFor(combinedRecords(contents, model, offsets), combinedPage));
  expect(combined.sourceBounds["app.ts"]).toEqual({ x: 50 + offsets.source.x, y: 80 + offsets.source.y, width: 160, height: 80 });
});
