import type { ConnectionShape } from "../../../shared/canvas-schema";
import { atom, computed, type Editor, type SvgExportContext } from "tldraw";
import { crossingDrawings, EdgeSpatialGrid, type EdgeDrawing, type HopRoute } from "./edge-hops";
import { labelBox } from "./route-labels";
import type { Box, Point } from "../graph/layout";
import { canvasPresentation, type CanvasPresentation } from "./presentation";
import { isPrimary } from "./references";
import { createSceneMorph } from "./scene-morph";
import { choice, pathFor, paths } from "./terrain/generate";

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
    const axis = (dx: number, dy: number) => Math.abs(dx) < 0.01 || Math.abs(dy) < 0.01;
    const rightAngle = before > 0.01 && after > 0.01 && axis(incoming.x, incoming.y) && axis(outgoing.x, outgoing.y)
      && Math.abs(incoming.x * outgoing.x + incoming.y * outgoing.y)
        <= Math.abs(incoming.x * outgoing.y - incoming.y * outgoing.x);
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

function pageBox(points: Point[]): Box {
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y };
}

function pageLabel(transform: { applyToPoint(p: Point): Point }, x: number, y: number, width: number) {
  const box = labelBox({ x, y }, width);
  const corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]
    .map(([lx, ly]) => transform.applyToPoint({ x: lx, y: ly }));
  return { corners, box: pageBox(corners) };
}

function createDrawingScene(editor: Editor, exportedShapes?: () => ConnectionShape[]) {
  let previousKey = "", previous = new Map<string, EdgeDrawing>();
  let previousSettledKey = "";
  let previousTargets: { shape: ConnectionShape; transform: ReturnType<Editor["getShapePageTransform"]>; origin: Point; unrotated: boolean; drawing: EdgeDrawing }[] = [];
  const animate = exportedShapes || typeof window === "undefined" ? undefined : createSceneMorph(editor);
  return computed("Diagram crossing drawings", () => {
    const radius = edgeCornerRadius.get(), hops = edgeCrossingHops.get();
    // SVG exports draw Standard geometry and have their own included shape set.
    const view = canvasPresentation(editor).get();
    const shapes = (exportedShapes ? exportedShapes() : editor.getCurrentPageShapes()).filter((s): s is ConnectionShape =>
      s.type === "lexicon-connection" && !editor.isShapeHidden(s) && (!!exportedShapes || !isAtlasRoad(s, view)));
    const prepared = shapes.map(shape => {
      const transform = editor.getShapePageTransform(shape);
      const origin = transform.applyToPoint({ x: 0, y: 0 });
      const unrotated = Math.abs(transform.rotation()) < .000001;
      return { shape, transform, origin, unrotated };
    });
    const settledKey = JSON.stringify([radius, prepared.map(({ shape, transform }) => [shape.id, shape.props, transform])]);
    let targets = previousTargets;
    if (settledKey !== previousSettledKey) {
      const settledLabels = prepared.map(({ shape, transform }) =>
        pageLabel(transform, shape.props.labelX, shape.props.labelY, shape.props.labelWidth));
      const labelIndex = new EdgeSpatialGrid<(typeof settledLabels)[number]>();
      for (const label of settledLabels) labelIndex.add(label.box, label);
      targets = prepared.map(entry => {
        const { shape, transform, origin, unrotated } = entry;
        const routeBounds = pageBox(shape.props.points.map(p => transform.applyToPoint(p)));
        const obstacles = radius && shape.props.points.length > 2 ? [...labelIndex.query(routeBounds)].map(({ corners, box }) => unrotated
          ? { ...box, x: box.x - origin.x, y: box.y - origin.y }
          : pageBox(corners.map(p => editor.getPointInShapeSpace(shape, p)))) : [];
        return { ...entry, drawing: baseDrawing(shape, radius, obstacles) };
      });
      previousSettledKey = settledKey;
      previousTargets = targets;
    }
    // Morph interpolates already-rounded samples; do not round the mixed polyline.
    const roundedShapes = targets.map(({ shape, drawing }) => ({
      ...shape, props: { ...shape.props, points: drawing.points, path: drawing.path },
    }));
    const displayed = animate ? animate(roundedShapes) : roundedShapes.map(shape => ({ shape, animating: false }));
    const entries = displayed.map(({ shape, animating }, i) => ({ ...targets[i], shown: shape, animating }));
    // Camera, selection, hover, and unrelated document changes reuse the scene.
    const key = JSON.stringify([radius, hops, entries.map(({ shown, transform, animating, drawing }) =>
      [shown.id, shown.props, transform, animating, drawing.path])]);
    if (key === previousKey) return previous;
    const pageLabels = entries.map(({ shown, transform }) =>
      pageLabel(transform, shown.props.labelX, shown.props.labelY, shown.props.labelWidth));
    const result = new Map<string, EdgeDrawing>(), routes: HopRoute[] = [];
    for (const { shown, origin, unrotated, drawing, animating } of entries) {
      const displayedDrawing = animating
        ? { path: pathFor(shown.props.points), points: shown.props.points, animating: true,
          label: { x: shown.props.labelX, y: shown.props.labelY } }
        : drawing;
      result.set(shown.id, displayedDrawing);
      if (hops && unrotated) routes.push({ id: shown.id, x: origin.x, y: origin.y, drawing: displayedDrawing });
    }
    if (hops) for (const [id, drawing] of crossingDrawings(routes, pageLabels.map(label => label.box))) result.set(id, drawing);
    for (const { shown, animating } of entries) {
      if (!animating) continue;
      const drawing = result.get(shown.id)!;
      result.set(shown.id, { ...drawing, animating: true, label: { x: shown.props.labelX, y: shown.props.labelY } });
    }
    // Unchanged paths keep their identity, so moving one edge does not repaint the page.
    for (const [id, drawing] of result) {
      const saved = previous.get(id);
      if (saved?.path === drawing.path && !!saved.hitPaths === !!drawing.hitPaths && saved.animating === drawing.animating
          && saved.label?.x === drawing.label?.x && saved.label?.y === drawing.label?.y) result.set(id, saved);
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
  if (!editor) return baseDrawing(shape, radius);
  let scene = scenes.get(editor);
  if (!scene) { scene = createDrawingScene(editor); scenes.set(editor, scene); }
  return scene.get().get(shape.id) || baseDrawing(shape, radius);
}
