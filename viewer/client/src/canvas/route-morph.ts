import type { Point } from "../graph/layout";

export const morphDuration = 180;
export const dragSettleDelay = 60;
export const mixPoint = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export function routeStops(points: Point[]) {
  const result = [0];
  for (let i = 1; i < points.length; i++) result.push(result[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const length = result.at(-1) || 1;
  return result.map(n => n / length);
}
export function sampleRoute(points: Point[], stops: number[], t: number) {
  const i = stops.findIndex(n => n >= t);
  if (i <= 0) return i === 0 ? points[0] : points.at(-1)!;
  return mixPoint(points[i - 1], points[i], (t - stops[i - 1]) / (stops[i] - stops[i - 1] || 1));
}

/** Remove accumulated interpolation samples with at most .05px error on every track. */
function simplifyTracks(tracks: Point[][]) {
  const stops = routeStops(tracks[0]);
  const keep = new Set([0, stops.length - 1]), pending = [[0, stops.length - 1]];
  while (pending.length) {
    const [a, b] = pending.pop()!;
    let worst = .05, split = -1;
    for (let i = a + 1; i < b; i++) {
      const t = (stops[i] - stops[a]) / (stops[b] - stops[a] || 1);
      for (const track of tracks) {
        const p = mixPoint(track[a], track[b], t);
        const error = Math.hypot(p.x - track[i].x, p.y - track[i].y);
        if (error > worst) { worst = error; split = i; }
      }
    }
    if (split !== -1) { keep.add(split); pending.push([a, split], [split, b]); }
  }
  const indices = [...keep].sort((a, b) => a - b);
  return tracks.map(track => indices.map(i => track[i]));
}

export const simplifyRoute = (points: Point[]) => simplifyTracks([points])[0];

/** One correspondence keeps a road's center, banks, and ruts aligned. */
export function matchRouteTracks(from: Point[][], to: Point[][]): [Point[][], Point[][]] {
  if (!from[0].length || !to[0].length) return [to, to];
  const source = simplifyTracks(from), a = routeStops(source[0]), b = routeStops(to[0]);
  const stops = [...new Set([0, ...a, ...b, 1])].sort((x, y) => x - y);
  return [source.map(track => stops.map(t => sampleRoute(track, a, t))), to.map(track => stops.map(t => sampleRoute(track, b, t)))];
}
export function matchRoutePoints(from: Point[], to: Point[]): [Point[], Point[]] {
  const [a, b] = matchRouteTracks([from], [to]);
  return [a[0], b[0]];
}
export function sameRoute(a: Point[], b: Point[]) {
  return a.length === b.length && a.every((p, i) => Math.abs(p.x - b[i].x) < .001 && Math.abs(p.y - b[i].y) < .001);
}

/** Spread endpoint movement along the whole curve; never pull just its first/last vertex. */
export function endpointOffset(from: Point[], to: Point[], t: number): Point {
  return { x: (to[0].x - from[0].x) * (1 - t) + (to.at(-1)!.x - from.at(-1)!.x) * t,
    y: (to[0].y - from[0].y) * (1 - t) + (to.at(-1)!.y - from.at(-1)!.y) * t };
}
export function routeFractionAt(point: Point, points: Point[], stops = routeStops(points)) {
  let nearest = Infinity, fraction = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const projected = mixPoint(a, b, t), distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (distance < nearest) { nearest = distance; fraction = stops[i - 1] + (stops[i] - stops[i - 1]) * t; }
  }
  return fraction;
}
export const offsetPoint = (p: Point, offset: Point): Point => ({ x: p.x + offset.x, y: p.y + offset.y });

/** Soften only intermediate bends; the first and last frames retain their exact geometry. */
export function softenRoute(points: Point[], radius: number) {
  if (points.length < 3 || radius < .01) return points;
  const result: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const before = Math.hypot(b.x - a.x, b.y - a.y), after = Math.hypot(c.x - b.x, c.y - b.y);
    if (before < .001 || after < .001) continue;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) / (before * after) < .001) { result.push(b); continue; }
    const r = Math.min(radius, before / 2, after / 2);
    const entry = mixPoint(b, a, r / before), exit = mixPoint(b, c, r / after);
    result.push(entry);
    for (let n = 1; n <= 6; n++) {
      const t = n / 6;
      result.push(mixPoint(mixPoint(entry, b, t), mixPoint(b, exit, t), t));
    }
  }
  result.push(points.at(-1)!);
  return result;
}
