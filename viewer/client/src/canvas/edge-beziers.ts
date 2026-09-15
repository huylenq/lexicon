import type { Point } from "../graph/layout";
export type CurveSample = { point: Point; t: number; distance: number };
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
export const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export function bezierPoint(controls: Point[], t: number): Point {
  let row = controls;
  while (row.length > 1) row = row.slice(1).map((p, i) => mix(row[i], p, t));
  return row[0];
}
export function bezierTangent(controls: Point[], t: number): Point {
  return bezierPoint(controls.slice(1).map((p, i) => ({ x: (p.x - controls[i].x) * (controls.length - 1), y: (p.y - controls[i].y) * (controls.length - 1) })), t);
}
function split(controls: Point[], t: number): [Point[], Point[]] {
  let row = controls;
  const left = [row[0]], right = [row.at(-1)!];
  while (row.length > 1) {
    row = row.slice(1).map((p, i) => mix(row[i], p, t));
    left.push(row[0]); right.unshift(row.at(-1)!);
  }
  return [left, right];
}
/** Exact control points for a portion of the original quadratic or cubic. */
export function bezierSlice(controls: Point[], from: number, to: number) {
  return from === 0 ? split(controls, to)[0] : split(split(controls, from)[1], (to - from) / (1 - from))[0];
}
/** Subpixel samples for intersection candidates, distance lookup, and hit geometry. */
export function bezierSamples(controls: Point[]): CurveSample[] {
  const result: CurveSample[] = [{ point: controls[0], t: 0, distance: 0 }];
  const visit = (points: Point[], lo: number, hi: number, depth: number) => {
    const chord = subtract(points.at(-1)!, points[0]), length = Math.hypot(chord.x, chord.y);
    const polygonLength = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
    const deviation = Math.max(0, ...points.slice(1, -1).map(p => Math.abs(cross(subtract(p, points[0]), chord)) / (length || 1)));
    if (depth < 12 && (deviation > .1 || polygonLength - length > .1)) {
      const [left, right] = split(points, .5), mid = (lo + hi) / 2;
      visit(left, lo, mid, depth + 1); visit(right, mid, hi, depth + 1);
    } else {
      const previous = result.at(-1)!, point = points.at(-1)!;
      result.push({ point, t: hi, distance: previous.distance + Math.hypot(point.x - previous.point.x, point.y - previous.point.y) });
    }
  };
  visit(controls, 0, 1, 0);
  return result;
}
export function distanceAt(samples: CurveSample[], t: number) {
  const i = Math.max(1, samples.findIndex(p => p.t >= t)), a = samples[i - 1], b = samples[i];
  return a.distance + (b.distance - a.distance) * (t - a.t) / (b.t - a.t);
}
export function parameterAt(samples: CurveSample[], distance: number) {
  const i = samples.findIndex(p => p.distance >= distance);
  if (i <= 0) return i === 0 ? 0 : 1;
  const a = samples[i - 1], b = samples[i];
  return a.t + (b.t - a.t) * (distance - a.distance) / (b.distance - a.distance || 1);
}
/** Refine a sampled intersection on the actual Bezier curves. */
export function refineCrossing(a: Point[], b: Point[], t: number, u: number) {
  for (let i = 0; i < 6; i++) {
    const delta = subtract(bezierPoint(b, u), bezierPoint(a, t));
    const da = bezierTangent(a, t), db = bezierTangent(b, u), determinant = cross(da, db);
    if (Math.abs(determinant) < 1e-8) return;
    t += cross(delta, db) / determinant; u += cross(delta, da) / determinant;
    if (t < 0 || t > 1 || u < 0 || u > 1) return;
  }
  const point = bezierPoint(a, t), other = bezierPoint(b, u);
  if (Math.hypot(point.x - other.x, point.y - other.y) > .01) return;
  const da = bezierTangent(a, t), db = bezierTangent(b, u);
  const sine = Math.abs(cross(da, db)) / (Math.hypot(da.x, da.y) * Math.hypot(db.x, db.y));
  // Touching tangents and near-parallel overlaps do not make a clear crossing.
  if (!Number.isFinite(sine) || sine < .15) return;
  return { point, t, u, sine };
}
