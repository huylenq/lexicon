import { expect, test } from "bun:test";
import { atom, Mat, type Editor, type SvgExportContext } from "tldraw";
import { renderToStaticMarkup } from "react-dom/server";
import { crossingDrawings, type HopRoute } from "../client/src/canvas/edge-hops";
import { connectionDrawing, edgeCornerRadius, edgeCrossingHops, roundedRoute } from "../client/src/canvas/rounded-route";
import type { ConnectionShape } from "../shared/canvas-schema";
import { LexiconConnectionUtil } from "../client/src/canvas/shapes";
import { canvasPresentation } from "../client/src/canvas/presentation";
import { modelShapeId } from "../client/src/canvas/references";
const route = (id: string, points: { x: number; y: number }[], radius = 0): HopRoute => ({ id, x: 0, y: 0, drawing: roundedRoute(points, radius) });
const horizontal = () => route("horizontal", [{ x: 0, y: 50 }, { x: 100, y: 50 }]);
const vertical = (x = 50) => route(`vertical-${x}`, [{ x, y: 0 }, { x, y: 100 }]);
test("one upward bridge and separate underpass, independent of route order and direction", () => {
  for (const reversed of [false, true]) {
    const h = horizontal(), v = vertical();
    if (reversed) for (const edge of [h, v]) edge.drawing = roundedRoute([...edge.drawing.points].reverse(), 0);
    const result = crossingDrawings([h, v]);
    expect(crossingDrawings([v, h])).toEqual(result);
    expect(result.get(h.id)!.path).toContain("50 44");
    expect(result.get(h.id)!.hitPaths).toHaveLength(1);
    expect(result.get(v.id)!.hitPaths).toHaveLength(2);
    for (const edge of [h, v]) {
      expect(result.get(edge.id)!.points[0]).toEqual(edge.drawing.points[0]);
      expect(result.get(edge.id)!.points.at(-1)).toEqual(edge.drawing.points.at(-1));
      expect(result.get(edge.id)!.path).not.toMatch(/NaN|Infinity/);
    }
  }
});
test("junctions, collinear overlaps, self-crossings, labels, and close crossings stay intact", () => {
  const h = horizontal();
  for (const edges of [[h, vertical(0)], [h, { ...horizontal(), id: "overlap" }], [h, vertical(50), vertical(60)]])
    for (const edge of edges) expect(crossingDrawings(edges).get(edge.id)).toBe(edge.drawing);
  expect(crossingDrawings([h, vertical()], [{ x: 40, y: 40, width: 20, height: 20 }]).get(h.id)).toBe(h.drawing);
  const self = route("self", [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }]);
  expect(crossingDrawings([self]).get(self.id)).toBe(self.drawing);
});
test("rounded portions bridge crossings while distant straight portions retain rounding and hops", () => {
  const h = route("rounded", [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 150 }], 24);
  const result = crossingDrawings([h, vertical(90)]);
  expect(result.get(h.id)!.path).toBe(h.drawing.path);
  expect(result.get("vertical-90")!.hitPaths).toHaveLength(2);
  const gap = result.get("vertical-90")!.hitPaths!;
  const y = (gap[0].at(-1)!.y + gap[1][0].y) / 2;
  // Solve the actual rounded quadratic at x=90, not the original square corner.
  const t = 1 - Math.sqrt(10 / 24);
  expect(y).toBeCloseTo(50 + 24 * t * t, 6);
  const drawing = crossingDrawings([h, vertical()]).get(h.id)!;
  expect(drawing.path).toContain("Q 100 50 100 74");
  expect(drawing.path).toContain("50 44");
});
test("translated copies share page-space crossings without changing local endpoints", () => {
  const h = { ...horizontal(), x: -150, y: 80 }, v = { ...vertical(), x: -150, y: 80 };
  expect(crossingDrawings([h, v]).get(h.id)).toEqual(crossingDrawings([horizontal(), vertical()]).get(h.id));
  v.x += 100;
  expect(crossingDrawings([h, v]).get(h.id)).toBe(h.drawing);
});
test("diagonal crossings keep exact gaps with stable ordering and reversed directions", () => {
  const definitions = [
    [route("diagonal", [{ x: 0, y: 0 }, { x: 100, y: 100 }]), horizontal(), "diagonal"],
    [route("diagonal", [{ x: 0, y: 0 }, { x: 100, y: 100 }]), vertical(), "vertical-50"],
    [route("a-diagonal", [{ x: 0, y: 0 }, { x: 100, y: 100 }]), route("b-diagonal", [{ x: 0, y: 100 }, { x: 100, y: 0 }]), "b-diagonal"],
  ] as const;
  for (const [a, b, underId] of definitions) for (const reversed of [false, true]) {
    const edges = [a, b].map(edge => ({ ...edge, drawing: roundedRoute(reversed ? [...edge.drawing.points].reverse() : edge.drawing.points, 0) }));
    const drawings = crossingDrawings(edges);
    expect(crossingDrawings([...edges].reverse())).toEqual(drawings);
    const gap = drawings.get(underId)!.hitPaths!;
    expect(gap).toHaveLength(2);
    const before = gap[0].at(-1)!, after = gap[1][0];
    expect((before.x + after.x) / 2).toBeCloseTo(50, 6);
    expect((before.y + after.y) / 2).toBeCloseTo(50, 6);
    for (const edge of edges) {
      const drawing = drawings.get(edge.id)!;
      expect(drawing.points[0]).toEqual(edge.drawing.points[0]);
      expect(drawing.points.at(-1)).toEqual(edge.drawing.points.at(-1));
      expect(drawing.path).not.toMatch(/NaN|Infinity/);
      const [start, end] = edge.drawing.points;
      for (const point of drawing.points) expect((point.x - start.x) * (end.y - start.y) - (point.y - start.y) * (end.x - start.x)).toBeCloseTo(0, 6);
    }
    expect(drawings.get(edges.find(edge => edge.id !== underId)!.id)!.hitPaths).toHaveLength(1);
  }
});
test("diagonal junctions, collinear overlaps, labels, and self-crossings stay intact", () => {
  const d = route("diagonal", [{ x: 0, y: 0 }, { x: 100, y: 100 }]);
  for (const other of [vertical(0), { ...d, id: "collinear" }]) {
    const result = crossingDrawings([d, other]);
    expect(result.get(d.id)).toBe(d.drawing);
    expect(result.get(other.id)).toBe(other.drawing);
  }
  const h = horizontal(), covered = crossingDrawings([d, h], [{ x: 40, y: 40, width: 20, height: 20 }]);
  expect(covered.get(d.id)).toBe(d.drawing);
  expect(covered.get(h.id)).toBe(h.drawing);
  const self = route("self", [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }]);
  expect(crossingDrawings([self]).get(self.id)).toBe(self.drawing);
});
test("multiple crossings split vertical hit geometry without reconnecting gaps", () => {
  const h1 = { ...horizontal(), y: -15 }, h2 = { ...horizontal(), id: "h2", y: 15 }, v = vertical();
  const drawing = crossingDrawings([h1, h2, v]).get(v.id)!;
  expect(drawing.hitPaths).toHaveLength(3);
  expect(drawing.hitPaths!.map(points => points.map(p => p.y))).toEqual([[0, 26.5], [31.5, 56.5], [61.5, 100]]);
});
test("scene cache reuses drawings and invalidates on moves, hide, delete, and preferences", () => {
  const savedHops = edgeCrossingHops.get(), savedRadius = edgeCornerRadius.get();
  try {
    edgeCrossingHops.set(true); edgeCornerRadius.set(0);
    const shapes = [horizontal(), vertical()].map(edge => ({ id: `shape:${edge.id}`, type: "lexicon-connection", x: 0, y: 0,
      props: { ...edge.drawing, labelX: 0, labelY: -50, labelWidth: 40, graphId: edge.id } }) as unknown as ConnectionShape);
    const state = atom("Test route scene", shapes);
    const editor = { getCurrentPageShapes: () => state.get(), isShapeHidden: () => false,
      getShapePageTransform: (s: ConnectionShape) => Mat.Translate(s.x, s.y),
      getPointInShapeSpace: (s: ConnectionShape, p: { x: number; y: number }) => ({ x: p.x - s.x, y: p.y - s.y }),
    } as unknown as Editor;
    const first = connectionDrawing(shapes[0], editor);
    expect(first.path).toContain("Q");
    expect(connectionDrawing(shapes[0], editor)).toBe(first);
    state.set(shapes.map(s => ({ ...s, meta: { unrelated: true } })));
    expect(connectionDrawing(shapes[0], editor)).toBe(first);
    state.set([shapes[0], { ...shapes[1], x: 200 }]);
    expect(connectionDrawing(shapes[0], editor).path).not.toContain("Q");
    state.set(shapes);
    expect(connectionDrawing(shapes[0], editor).path).toContain("Q");
    edgeCrossingHops.set(false);
    expect(connectionDrawing(shapes[0], editor).path).not.toContain("Q");
    edgeCrossingHops.set(true);
    editor.isShapeHidden = s => (typeof s === "string" ? s : s.id) === shapes[1].id;
    state.set([...shapes]);
    expect(connectionDrawing(shapes[0], editor).path).not.toContain("Q");
    state.set([shapes[0]]);
    expect(connectionDrawing(shapes[0], editor).path).not.toContain("Q");
  } finally { edgeCrossingHops.set(savedHops); edgeCornerRadius.set(savedRadius); }
});

test("very long authored lines use bounded grid storage", () => {
  const h = route("long-h", [{ x: -1e8, y: 50 }, { x: 1e8, y: 50 }]);
  const v = route("long-v", [{ x: 50, y: -1e8 }, { x: 50, y: 1e8 }]);
  expect(crossingDrawings([h, v]).get(h.id)!.path).toContain("50 44");
});

const curveRoute = (id: string, path: string, start = { x: 0, y: 0 }, end = { x: 100, y: 100 }): HopRoute => ({
  id, x: 0, y: 0, drawing: { path, points: [start, end] },
});
test("two curved edges use stable over/under order and preserve the cut curve exactly", () => {
  const a = curveRoute("a-upper", "M 0 0 Q 100 0 100 100");
  const b = curveRoute("b-under", "M 0 100 Q 100 100 100 0", { x: 0, y: 100 }, { x: 100, y: 0 });
  const result = crossingDrawings([a, b]);
  expect(crossingDrawings([b, a])).toEqual(result);
  expect(result.get(a.id)!.path).toBe(a.drawing.path);
  const under = result.get(b.id)!;
  expect(under.hitPaths).toHaveLength(2);
  expect(under.path.match(/Q/g)).toHaveLength(2);
  for (const p of under.points) {
    const t = 1 - Math.sqrt(Math.max(0, 1 - p.x / 100));
    expect(p.y).toBeCloseTo(100 - 100 * t * t, 6);
  }
  expect(under.points[0]).toEqual(b.drawing.points[0]);
  expect(under.points.at(-1)).toEqual(b.drawing.points.at(-1));
});
test("cubic mappings bridge lines and can themselves receive exact cubic cuts", () => {
  const c = curveRoute("cubic", "M 0 0 C 100 0 100 100 200 100", { x: 0, y: 0 }, { x: 200, y: 100 });
  const v = vertical(100), result = crossingDrawings([c, v]);
  expect(result.get(c.id)!.path).toBe(c.drawing.path);
  expect(result.get(v.id)!.hitPaths).toHaveLength(2);
  const gap = result.get(v.id)!.hitPaths!;
  expect((gap[0].at(-1)!.y + gap[1][0].y) / 2).toBeCloseTo(50, 6);
  const upper = curveRoute("a-upper", "M 0 0 Q 100 0 100 100");
  const under = curveRoute("z-cubic", "M 0 80 C 50 80 150 80 200 80", { x: 0, y: 80 }, { x: 200, y: 80 });
  const cut = crossingDrawings([under, upper]).get(under.id)!;
  expect(cut.hitPaths).toHaveLength(2);
  expect(cut.path.match(/C/g)).toHaveLength(2);
  expect(cut.points.every(p => Math.abs(p.y - 80) < 1e-6)).toBe(true);
});
test("curved tangencies, shared endpoints, and covered crossings do not create gaps", () => {
  const tangent = curveRoute("tangent", "M 0 50 Q 50 -50 100 50", { x: 0, y: 50 }, { x: 100, y: 50 });
  const line = route("line", [{ x: -50, y: 0 }, { x: 150, y: 0 }]);
  expect(crossingDrawings([tangent, line]).get(line.id)).toBe(line.drawing);
  const a = curveRoute("a", "M 0 0 Q 100 0 100 100"), b = vertical(75);
  expect(crossingDrawings([a, b], [{ x: 65, y: 15, width: 20, height: 20 }]).get(b.id)).toBe(b.drawing);
  const endpoint = vertical(100);
  expect(crossingDrawings([a, endpoint]).get(endpoint.id)).toBe(endpoint.drawing);
});

test("raised hops never collide with nearby curves or parallel lines", () => {
  for (const nearby of [
    curveRoute("mapping", "M 0 45 Q 50 45 100 45", { x: 0, y: 45 }, { x: 100, y: 45 }),
    curveRoute("mapping", "M 0 40 C 30 48 70 48 100 40", { x: 0, y: 40 }, { x: 100, y: 40 }),
    route("parallel", [{ x: 0, y: 45 }, { x: 100, y: 45 }]),
  ]) {
    const h = horizontal(), v = vertical(), result = crossingDrawings([h, v, nearby]);
    expect(result.get(h.id)!.path).toBe(h.drawing.path);
    if (nearby.id === "mapping") expect(result.get(nearby.id)!.path).toBe(nearby.drawing.path);
    expect(crossingDrawings([nearby, v, h])).toEqual(result);
  }
  // Nearby geometry outside the bridge envelope must not disable it.
  const distant = curveRoute("mapping", "M 0 30 Q 50 30 100 30", { x: 0, y: 30 }, { x: 100, y: 30 });
  expect(crossingDrawings([horizontal(), vertical(), distant]).get("horizontal")!.path).toContain("50 44");
});

function exportFixture() {
  const shapes = [horizontal(), vertical()].map(edge => ({ id: modelShapeId(edge.id), type: "lexicon-connection", x: 0, y: 0, meta: {},
    props: { ...edge.drawing, labelX: 0, labelY: -50, labelWidth: 40, graphId: edge.id } }) as unknown as ConnectionShape);
  const state = atom("Export fixture", shapes);
  const editor = { getCurrentPageShapes: () => state.get(), isShapeHidden: () => false,
    getShapePageTransform: (s: ConnectionShape) => Mat.Translate(s.x, s.y),
    getPointInShapeSpace: (s: ConnectionShape, p: { x: number; y: number }) => ({ x: p.x - s.x, y: p.y - s.y }),
  } as unknown as Editor;
  return { shapes, editor, state };
}

test("SVG exports calculate crossings only among included edges and isolate concurrent exports", async () => {
  const savedHops = edgeCrossingHops.get(), savedRadius = edgeCornerRadius.get();
  try {
    edgeCrossingHops.set(true); edgeCornerRadius.set(0);
    const { shapes: [h, v], editor } = exportFixture(), util = new LexiconConnectionUtil(editor);
    const context = () => ({ isDarkMode: true } as SvgExportContext);
    const both = context();
    const exports = await Promise.all([util.toSvg(v, context()), util.toSvg(v, both), util.toSvg(h, both), util.toSvg(h, context())]);
    const paths = exports.map(svg => renderToStaticMarkup(svg).match(/<path d="([^"]+)"/)![1]);
    expect(paths[0]).toBe(v.props.path);
    expect(paths[1]).toContain("L 50 41.5 M 50 46.5");
    expect(paths[2]).toContain("50 44");
    expect(paths[3]).toBe(h.props.path);
    // Exporting a subset must not change the live scene.
    expect(connectionDrawing(v, editor).hitPaths).toHaveLength(2);
  } finally { edgeCrossingHops.set(savedHops); edgeCornerRadius.set(savedRadius); }
});

test("Atlas excludes hidden Standard paths and invalidates crossings when skin or path style changes", () => {
  const savedHops = edgeCrossingHops.get(), savedRadius = edgeCornerRadius.get();
  try {
    edgeCrossingHops.set(true); edgeCornerRadius.set(0);
    const { shapes: [h, primaryV], editor, state } = exportFixture();
    const v = { ...primaryV, id: "shape:reference-copy" as ConnectionShape["id"] };
    state.set([h, v]);
    const presentation = canvasPresentation(editor);
    presentation.set({ ...presentation.get(), connections: new Map([[h.props.graphId, {
      id: h.props.graphId, kind: "relationship", source: "a", target: "b", label: "", selection: { kind: "item", id: "r" }, relationships: [], mappings: [],
    }]]) });
    expect(connectionDrawing(v, editor).hitPaths).toHaveLength(2);
    presentation.set({ ...presentation.get(), mapEnabled: true });
    expect(connectionDrawing(v, editor).path).toBe(v.props.path);
    state.set([{ ...h, meta: { lexiconPath: "none" } }, v]);
    expect(connectionDrawing(v, editor).hitPaths).toHaveLength(2);
    state.set([h, v]);
    expect(connectionDrawing(v, editor).path).toBe(v.props.path);
    presentation.set({ ...presentation.get(), mapEnabled: false });
    expect(connectionDrawing(v, editor).hitPaths).toHaveLength(2);
  } finally { edgeCrossingHops.set(savedHops); edgeCornerRadius.set(savedRadius); }
});
