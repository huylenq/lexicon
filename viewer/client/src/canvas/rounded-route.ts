import type { ConnectionShape } from "../../../shared/canvas-schema";
import { atom, type Editor } from "tldraw";
import { labelBox } from "./route-labels";
import type { Box, Point } from "../graph/layout";

export const maxCornerRadius = 128;
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

export function connectionDrawing(shape: ConnectionShape, editor?: Editor) {
  const radius = edgeCornerRadius.get();
  const obstacles: Box[] = [];
  if (radius && editor) for (const other of editor.getCurrentPageShapes()) {
    if (other.type !== "lexicon-connection" || editor.isShapeHidden(other)) continue;
    const box = labelBox({ x: other.props.labelX, y: other.props.labelY }, other.props.labelWidth);
    const transform = editor.getShapePageTransform(other);
    const corners = [[box.x, box.y], [box.x + box.width, box.y],
      [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]
      .map(([x, y]) => editor.getPointInShapeSpace(shape, transform.applyToPoint({ x, y })));
    const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
    obstacles.push({ x, y, width: Math.max(...corners.map(p => p.x)) - x, height: Math.max(...corners.map(p => p.y)) - y });
  }
  // Mapping curves keep their existing geometry, including when copied or restored.
  return radius && !/[QC]/i.test(shape.props.path)
    ? roundedRoute(shape.props.points, radius, obstacles) : { path: shape.props.path, points: shape.props.points };
}
