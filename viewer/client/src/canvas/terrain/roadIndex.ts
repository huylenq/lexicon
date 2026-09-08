import type { Bounds, Point } from "../../../../shared/canvas-geometry";
import type { MapScene } from "./generate";
import { pointInPolygon } from "../territory";

export function pointBounds(points: Point[], pad = 0): Bounds {
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const p of points) { x = Math.min(x, p.x); y = Math.min(y, p.y); right = Math.max(right, p.x); bottom = Math.max(bottom, p.y); }
  return { x: x - pad, y: y - pad, w: right - x + pad * 2, h: bottom - y + pad * 2 };
}
export const boxesMeet = (a: Bounds, b: Bounds) => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
export const boxPolygon = (b: Bounds): Point[] => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];

/** Broad-phase bounds are built once per road, rather than inside every district scan. */
export function indexRoads(roads: MapScene["roads"]) {
  const entries = roads.map(road => ({ road, bounds: pointBounds(road.geometry.points, 30),
    segments: road.geometry.points.slice(1).map((p, i) => pointBounds([road.geometry.points[i], p], 30)) }));
  return { near: (area: Bounds) => entries.filter(e => boxesMeet(area, e.bounds) && e.segments.some(b => boxesMeet(area, b))).map(e => e.road) };
}

function segmentsMeet(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const on = (p: Point, q: Point, r: Point) => Math.abs(cross(p, q, r)) < 1e-8 && boxesMeet(pointBounds([p, q]), pointBounds([r]));
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return (abC * abD < 0 && cdA * cdB < 0) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}
function polygonsMeet(a: Point[], b: Point[]) {
  return a.some(p => pointInPolygon(p, b)) || b.some(p => pointInPolygon(p, a)) ||
    a.some((p, i) => b.some((q, j) => segmentsMeet(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length])));
}

/** Test actual road bank strips, including wide roads, bends and endpoints. */
export function roadSurface(roads: MapScene["roads"]) {
  const strips = roads.flatMap(r => r.geometry.points.slice(1).map((_, i) => {
    const [left, right] = r.geometry.banks;
    const polygon = [left[i], left[i + 1], right[i + 1], right[i]];
    return { polygon, bounds: pointBounds(polygon) };
  }));
  return { touches(polygons: Point[][]) {
    for (const polygon of polygons) {
      if (!polygon.length) continue;
      const bounds = pointBounds(polygon);
      if (strips.some(s => boxesMeet(bounds, s.bounds) && polygonsMeet(polygon, s.polygon))) return true;
    }
    return false;
  } };
}
