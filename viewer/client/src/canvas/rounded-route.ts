import type { ConnectionShape } from "../../../shared/canvas-schema";
import { atom, computed, type Editor, type SvgExportContext } from "tldraw";
import { crossingDrawings, EdgeSpatialGrid, type EdgeDrawing, type HopRoute } from "./edge-hops";
import { labelBox } from "./route-labels";
import type { Box, Point } from "../graph/layout";
import { canvasPresentation, type CanvasPresentation } from "./presentation";
import { isPrimary } from "./references";
import { choice, paths } from "./terrain/generate";

/** Matches the Standard path hidden by Atlas's road renderer. */
export function isAtlasRoad(shape: ConnectionShape, view: CanvasPresentation) {
  return view.mapEnabled && view.connections.get(shape.props.graphId)?.kind === "relationship"
    && isPrimary(shape) && choice(shape.meta.lexiconPath, paths, "road") !== "none";
}

export const maxCornerRadius = 256;
export function cornerRadius(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(maxCornerRadius, value)) : 0;
}

const preferenceKey = "lexicon.edgeCornerRadius";
function savedCornerRadius() {
  try { return cornerRadius(Number(localStorage.getItem(preferenceKey))); } catch { return 0; }
}
export const edgeCornerRadius = atom("Edge corner radius preference", savedCornerRadius());
export function setEdgeCornerRadius(value: number) {
  const radius = cornerRadius(value);
  edgeCornerRadius.set(radius);
  try { localStorage.setItem(preferenceKey, String(radius)); } catch { /* Works without storage. */ }
}
if (typeof window !== "undefined") window.addEventListener("storage", event => {
  if (event.key === preferenceKey || event.key === null) edgeCornerRadius.set(savedCornerRadius());
});

/** Small presentation-only bends; retain the router's endpoints and straight approaches. */
export function roundedRoute(points: Point[], radius: number, obstacles: Box[] = []) {
  const sampled: Point[] = [];
  if (!points.length) return { path: "", points: sampled };
  let path = `M ${points[0].x} ${points[0].y}`;
  sampled.push(points[0]);
  const line = (p: Point) => { path += ` L ${p.x} ${p.y}`; sampled.push(p); };
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const incoming = { x: b.x - a.x, y: b.y - a.y }, outgoing = { x: c.x - b.x, y: c.y - b.y };
    const before = Math.hypot(incoming.x, incoming.y), after = Math.hypot(outgoing.x, outgoing.y);
    const rightAngle = (incoming.x === 0 || incoming.y === 0) && (outgoing.x === 0 || outgoing.y === 0)
      && incoming.x * outgoing.x + incoming.y * outgoing.y === 0;
    // Each end owns at most half a segment, so adjacent bends never overlap.
    let r = rightAngle ? Math.min(cornerRadius(radius), before / 2, after / 2) : 0;
    if (r) {
      // The quadratic stays inside this corner square. Shrink the square until
      // it clears labels, preserving their existing four-pixel margin.
      const sx = Math.sign(-incoming.x || outgoing.x), sy = Math.sign(-incoming.y || outgoing.y);
      for (const box of obstacles) {
        const xs = [sx * (box.x - b.x), sx * (box.x + box.width - b.x)];
        const ys = [sy * (box.y - b.y), sy * (box.y + box.height - b.y)];
        if (Math.max(...xs) <= 0 || Math.max(...ys) <= 0) continue;
        r = Math.min(r, Math.max(0, Math.min(...xs), Math.min(...ys)));
      }
    }
    if (!r) { line(b); continue; }
    const start = { x: b.x - incoming.x * r / before, y: b.y - incoming.y * r / before };
    const end = { x: b.x + outgoing.x * r / after, y: b.y + outgoing.y * r / after };
    line(start);
    path += ` Q ${b.x} ${b.y} ${end.x} ${end.y}`;
    // Subpixel curve approximation for native hit testing.
    for (let step = 1; step <= 8; step++) {
      const t = step / 8, u = 1 - t;
      sampled.push({ x: u * u * start.x + 2 * u * t * b.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * b.y + t * t * end.y });
    }
  }
  if (points.length > 1) line(points.at(-1)!);
  return { path, points: sampled };
}

const hopsKey = "lexicon.edgeCrossingHops";
function savedHops() {
  try { return localStorage.getItem(hopsKey) !== "false"; } catch { return true; }
}
export const edgeCrossingHops = atom("Edge crossing hops preference", savedHops());
export function setEdgeCrossingHops(enabled: boolean) {
  edgeCrossingHops.set(enabled);
  try { localStorage.setItem(hopsKey, String(enabled)); } catch { /* Works without storage. */ }
}
if (typeof window !== "undefined") window.addEventListener("storage", event => {
  if (event.key === hopsKey || event.key === null) edgeCrossingHops.set(savedHops());
});

function baseDrawing(shape: ConnectionShape, radius: number, obstacles: Box[] = []): EdgeDrawing {
  // Legacy curved references keep their existing geometry, including copies and restores.
  return radius && !/[QC]/i.test(shape.props.path)
    ? roundedRoute(shape.props.points, radius, obstacles) : { path: shape.props.path, points: shape.props.points };
}

function createDrawingScene(editor: Editor, exportedShapes?: () => ConnectionShape[]) {
  let previousKey = "", previous = new Map<string, EdgeDrawing>();
  return computed("Diagram crossing drawings", () => {
    const radius = edgeCornerRadius.get(), hops = edgeCrossingHops.get();
    // SVG exports draw Standard geometry and have their own included shape set.
    const view = canvasPresentation(editor).get();
    const shapes = (exportedShapes ? exportedShapes() : editor.getCurrentPageShapes()).filter((s): s is ConnectionShape =>
      s.type === "lexicon-connection" && !editor.isShapeHidden(s) && (!!exportedShapes || !isAtlasRoad(s, view)));
    const entries = shapes.map(shape => ({ shape, transform: editor.getShapePageTransform(shape) }));
    // Camera, selection, hover, and unrelated document changes reuse the scene.
    const key = JSON.stringify([radius, hops, entries.map(({ shape, transform }) => [shape.id, shape.props, transform])]);
    if (key === previousKey) return previous;
    const labels = entries.map(({ shape, transform }) => {
      const box = labelBox({ x: shape.props.labelX, y: shape.props.labelY }, shape.props.labelWidth);
      return [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]
        .map(([x, y]) => transform.applyToPoint({ x, y }));
    });
    const boxFor = (corners: Point[]): Box => {
      const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
      return { x, y, width: Math.max(...corners.map(p => p.x)) - x, height: Math.max(...corners.map(p => p.y)) - y };
    };
    const labelIndex = new EdgeSpatialGrid<{ corners: Point[]; box: Box }>();
    const pageLabels = labels.map(corners => ({ corners, box: boxFor(corners) }));
    for (const label of pageLabels) labelIndex.add(label.box, label);
    const result = new Map<string, EdgeDrawing>(), routes: HopRoute[] = [];
    for (const { shape, transform } of entries) {
      const origin = transform.applyToPoint({ x: 0, y: 0 });
      const unrotated = Math.abs(transform.rotation()) < .000001;
      const routeBounds = boxFor(shape.props.points.map(p => transform.applyToPoint(p)));
      const obstacles = radius && shape.props.points.length > 2 ? [...labelIndex.query(routeBounds)].map(({ corners, box }) => unrotated
        ? { ...box, x: box.x - origin.x, y: box.y - origin.y }
        : boxFor(corners.map(p => editor.getPointInShapeSpace(shape, p)))) : [];
      const drawing = baseDrawing(shape, radius, obstacles);
      result.set(shape.id, drawing);
      // Standard model routes are axis-aligned. Rotated copies retain their drawing.
      if (hops && unrotated) {
        routes.push({ id: shape.id, x: origin.x, y: origin.y, drawing });
      }
    }
    if (hops) for (const [id, drawing] of crossingDrawings(routes, pageLabels.map(label => label.box))) result.set(id, drawing);
    // Unchanged paths keep their identity, so moving one edge does not repaint the page.
    for (const [id, drawing] of result) {
      const saved = previous.get(id);
      if (saved?.path === drawing.path && !!saved.hitPaths === !!drawing.hitPaths) result.set(id, saved);
    }
    previousKey = key; previous = result;
    return result;
  });
}
const scenes = new WeakMap<Editor, ReturnType<typeof createDrawingScene>>();

const exportScenes = new WeakMap<SvgExportContext, {
  shapes: ReturnType<typeof atom<ConnectionShape[]>>;
  drawing: ReturnType<typeof createDrawingScene>;
}>();

/** tldraw invokes every toSvg before awaiting their results. Collect that batch
 * in its export context, then calculate crossings only among included edges. */
export async function connectionExportDrawing(shape: ConnectionShape, editor: Editor, context: SvgExportContext) {
  let scene = exportScenes.get(context);
  if (!scene) {
    const shapes = atom<ConnectionShape[]>("Exported connections", []);
    scene = { shapes, drawing: createDrawingScene(editor, () => shapes.get()) };
    exportScenes.set(context, scene);
  }
  if (!scene.shapes.get().some(s => s.id === shape.id)) scene.shapes.set([...scene.shapes.get(), shape]);
  await Promise.resolve();
  return scene.drawing.get().get(shape.id) || baseDrawing(shape, edgeCornerRadius.get());
}

export function connectionDrawing(shape: ConnectionShape, editor?: Editor): EdgeDrawing {
  const radius = edgeCornerRadius.get();
  if (!editor || (!radius && !edgeCrossingHops.get())) return baseDrawing(shape, radius);
  let scene = scenes.get(editor);
  if (!scene) { scene = createDrawingScene(editor); scenes.set(editor, scene); }
  return scene.get().get(shape.id) || baseDrawing(shape, radius);
}
