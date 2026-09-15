import type { Box, Point } from "../graph/layout";
import { bezierPoint, bezierSamples, bezierSlice, cross, distanceAt, parameterAt, refineCrossing, subtract, type CurveSample } from "./edge-beziers";

export type EdgeDrawing = { path: string; points: Point[]; hitPaths?: Point[][] };
export type HopRoute = { id: string; x: number; y: number; drawing: EdgeDrawing };
export const hopRadius = 6;
const clearance = hopRadius + 3, underpassHalfGap = 2.5, cellSize = 128;
type Command = { kind: string; values: number[] };
type Run = { route: HopRoute; command: number; a: Point; b: Point; horizontal: boolean };
type Mark = { at: number; hop: boolean; lo?: number; hi?: number };
type Piece = { route: HopRoute; command: number; controls: Point[]; samples?: CurveSample[]; box: Box; curved: boolean };
const bounds = (a: Point, b: Point): Box => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) });
const overlaps = (a: Box, b: Box) => a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;

/** Index occupied cells, so distant route segments and labels are never compared. */
export class EdgeSpatialGrid<T> {
  cells = new Map<string, T[]>();
  entries: { box: Box; item: T }[] = [];
  overflow: { box: Box; item: T }[] = [];
  large(box: Box) {
    return (Math.floor((box.x + box.width) / cellSize) - Math.floor(box.x / cellSize) + 1)
      * (Math.floor((box.y + box.height) / cellSize) - Math.floor(box.y / cellSize) + 1) > 4096;
  }
  visit(box: Box, visit: (key: string) => void) {
    for (let x = Math.floor(box.x / cellSize); x <= Math.floor((box.x + box.width) / cellSize); x++)
      for (let y = Math.floor(box.y / cellSize); y <= Math.floor((box.y + box.height) / cellSize); y++) visit(`${x}:${y}`);
  }
  add(box: Box, item: T) {
    const entry = { box, item };
    this.entries.push(entry);
    // Very long authored lines must not allocate millions of empty grid cells.
    if (this.large(box)) { this.overflow.push(entry); return; }
    this.visit(box, key => { const items = this.cells.get(key); if (items) items.push(item); else this.cells.set(key, [item]); });
  }
  query(box: Box) {
    const found = new Set<T>();
    for (const entry of this.large(box) ? this.entries : this.overflow) if (overlaps(box, entry.box)) found.add(entry.item);
    if (this.large(box)) return found;
    this.visit(box, key => { for (const item of this.cells.get(key) || []) found.add(item); });
    return found;
  }
}

// Router lines, rounded corners, and quadratic/cubic source mappings.
function commands(path: string): Command[] {
  return [...path.matchAll(/([MLQC])\s*([^MLQC]*)/g)].map(match => ({ kind: match[1],
    values: (match[2].match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || []).map(Number) }));
}

/** Horizontal runs hop upward; vertical runs get a small underpass gap.
 * Existing curves bridge their crossings without changing their control points. */
export function crossingDrawings(routes: HopRoute[], obstacles: Box[] = []) {
  const pieces: Piece[] = [], occupied = new EdgeSpatialGrid<Piece>();
  const parsed = new Map<string, Command[]>(), vertical = new EdgeSpatialGrid<Run>(), horizontal: Run[] = [];
  const blockers = new EdgeSpatialGrid<Box>();
  for (const box of obstacles) blockers.add(box, box);
  for (const route of routes) {
    const parts = commands(route.drawing.path);
    parsed.set(route.id, parts);
    let previous: Point | undefined;
    for (const [command, part] of parts.entries()) {
      const b = { x: part.values.at(-2)! + route.x, y: part.values.at(-1)! + route.y };
      if (previous && part.kind !== "M") {
        const controls = [previous, ...Array.from({ length: part.values.length / 2 }, (_, i) => ({ x: part.values[i * 2] + route.x, y: part.values[i * 2 + 1] + route.y }))];
        const min = { x: Math.min(...controls.map(p => p.x)), y: Math.min(...controls.map(p => p.y)) };
        const max = { x: Math.max(...controls.map(p => p.x)), y: Math.max(...controls.map(p => p.y)) };
        const piece = { route, command, controls, curved: part.kind !== "L", box: bounds(min, max) };
        pieces.push(piece); occupied.add(piece.box, piece);
      }
      if (part.kind === "L" && previous) {
        const a = previous, isHorizontal = a.y === b.y;
        if ((isHorizontal || a.x === b.x) && Math.hypot(b.x - a.x, b.y - a.y) > clearance * 2) {
          const run = { route, command, a, b, horizontal: isHorizontal };
          if (isHorizontal) horizontal.push(run); else vertical.add(bounds(a, b), run);
        }
      }
      previous = b;
    }
  }
  const marks = new Map<string, Map<number, Mark[]>>();
  const mark = (run: Run, at: number, hop: boolean) => {
    let route = marks.get(run.route.id);
    if (!route) marks.set(run.route.id, route = new Map());
    const list = route.get(run.command) || [];
    if (!list.some(m => m.at === at)) list.push({ at, hop });
    route.set(run.command, list);
  };
  for (const h of horizontal) {
    const crossings = new Map<number, Run[]>();
    for (const v of vertical.query(bounds(h.a, h.b))) {
      const x = v.a.x, y = h.a.y;
      if (h.route.id === v.route.id || x <= Math.min(h.a.x, h.b.x) + clearance || x >= Math.max(h.a.x, h.b.x) - clearance
        || y <= Math.min(v.a.y, v.b.y) + clearance || y >= Math.max(v.a.y, v.b.y) - clearance) continue;
      const box = { x: x - clearance, y: y - clearance, width: clearance * 2, height: clearance * 2 };
      if ([...blockers.query(box)].some(blocker => overlaps(box, blocker))) continue;
      const group = crossings.get(x) || [];
      group.push(v); crossings.set(x, group);
    }
    const positions = [...crossings.keys()].sort((a, b) => a - b);
    for (const [i, x] of positions.entries()) {
      if (x - positions[i - 1] < clearance * 2 || positions[i + 1] - x < clearance * 2) continue;
      const crossed = crossings.get(x)!;
      // Reserve the bridge's envelope before changing the route. A nearby curve
      // or parallel line must not acquire new crossings from the raised arc.
      const envelope = { x: x - hopRadius - 1, y: h.a.y - hopRadius - 1, width: hopRadius * 2 + 2, height: hopRadius + 2 };
      if ([...occupied.query(envelope)].some(piece => {
        if ([h, ...crossed].some(run => run.route.id === piece.route.id && run.command === piece.command)
          || !overlaps(envelope, piece.box)) return false;
        const samples = piece.samples ||= bezierSamples(piece.controls);
        return samples.slice(1).some((sample, i) => overlaps(envelope, bounds(samples[i].point, sample.point)));
      })) continue;
      mark(h, x - h.route.x, true);
      for (const v of crossed) mark(v, h.a.y - v.route.y, false);
    }
  }
  const bridges = curveCrossings(pieces, occupied, blockers, marks);
  return new Map(routes.map(route => [route.id, marks.has(route.id)
    ? draw(parsed.get(route.id)!, marks.get(route.id)!)
    : bridges.has(route.id) ? { ...route.drawing, hitPaths: [route.drawing.points] } : route.drawing]));
}

function draw(parts: Command[], marks: Map<number, Mark[]>): EdgeDrawing {
  let path = "", current: Point = { x: 0, y: 0 };
  const points: Point[] = [], hitPaths: Point[][] = [];
  const push = (p: Point) => { points.push(p); hitPaths.at(-1)!.push(p); current = p; };
  const move = (p: Point) => { path += `M ${p.x} ${p.y} `; hitPaths.push([]); push(p); };
  const line = (p: Point) => { path += `L ${p.x} ${p.y} `; push(p); };
  const bezier = (controls: Point[]) => {
    path += `${controls.length === 3 ? "Q" : "C"} ${controls.slice(1).map(p => `${p.x} ${p.y}`).join(" ")} `;
    if (controls.length === 3) {
      const [start, control, end] = controls;
      for (let step = 1; step <= 8; step++) {
        const t = step / 8, u = 1 - t;
        push({ x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
          y: u * u * start.y + 2 * u * t * control.y + t * t * end.y });
      }
    } else for (const sample of bezierSamples(controls).slice(1)) push(sample.point);
  };
  const curve = (control: Point, end: Point) => bezier([current, control, end]);
  for (const [i, part] of parts.entries()) {
    const v = part.values, end = { x: v.at(-2)!, y: v.at(-1)! };
    if (part.kind === "M") { move(end); continue; }
    if (part.kind === "Q" || part.kind === "C") {
      const controls = [current, ...Array.from({ length: v.length / 2 }, (_, n) => ({ x: v[n * 2], y: v[n * 2 + 1] }))];
      let from = 0;
      for (const gap of mergeIntervals((marks.get(i) || []).map(m => ({ lo: m.lo!, hi: m.hi!, hop: false })))) {
        if (gap.lo > from) bezier(bezierSlice(controls, from, gap.lo));
        move(bezierPoint(controls, gap.hi)); from = gap.hi;
      }
      if (from < 1) bezier(bezierSlice(controls, from, 1));
      continue;
    }
    const startPoint = current;
    const horizontal = Math.abs(end.x - current.x) >= Math.abs(end.y - current.y), fixed = horizontal ? current.y : current.x;
    const sign = Math.sign(horizontal ? end.x - current.x : end.y - current.y);
    const point = (at: number) => {
      if (startPoint.y === end.y) return { x: at, y: fixed };
      if (startPoint.x === end.x) return { x: fixed, y: at };
      const t = horizontal ? (at - startPoint.x) / (end.x - startPoint.x) : (at - startPoint.y) / (end.y - startPoint.y);
      return { x: startPoint.x + (end.x - startPoint.x) * t, y: startPoint.y + (end.y - startPoint.y) * t };
    };
    // Merge overlapping underpass gaps; crowded hops were excluded above.
    // The under-line crosses the bridge at its apex, above the original crossing.
    // Cut only enough for the strokes to clear each other at that point.
    const intervals = (marks.get(i) || []).map(m => m.lo !== undefined
      ? { lo: m.lo, hi: m.hi!, hop: false } : m.hop
      ? { lo: m.at - hopRadius, hi: m.at + hopRadius, hop: true }
      : { lo: m.at - hopRadius - underpassHalfGap, hi: m.at - hopRadius + underpassHalfGap, hop: false })
      .sort((a, b) => a.lo - b.lo);
    const merged = mergeIntervals(intervals);
    if (sign < 0) merged.reverse();
    for (const interval of merged) {
      const start = point(sign > 0 ? interval.lo : interval.hi), finish = point(sign > 0 ? interval.hi : interval.lo);
      line(start);
      if (interval.hop) {
        const top = { x: (start.x + finish.x) / 2, y: fixed - hopRadius };
        curve({ x: start.x, y: top.y }, top);
        curve({ x: finish.x, y: top.y }, finish);
      } else move(finish);
    }
    line(end);
  }
  return { path: path.trim(), points, hitPaths };
}

function mergeIntervals(intervals: { lo: number; hi: number; hop: boolean }[]) {
  const merged: typeof intervals = [];
  for (const interval of intervals.sort((a, b) => a.lo - b.lo)) {
    const previous = merged.at(-1);
    if (previous && !previous.hop && !interval.hop && interval.lo <= previous.hi) previous.hi = Math.max(previous.hi, interval.hi);
    else merged.push({ ...interval });
  }
  return merged;
}

function curveCrossings(pieces: Piece[], grid: EdgeSpatialGrid<Piece>, blockers: EdgeSpatialGrid<Box>, marks: Map<string, Map<number, Mark[]>>) {
  const bridges = new Set<string>();
  if (!pieces.some(p => p.curved)) return bridges;
  const seen = new Set<string>();
  for (const over of pieces.filter(piece => piece.curved)) for (const under of grid.query(over.box)) {
    // Curves pass over lines; two curves use stable identity, independent of paint order.
    if (over.route.id === under.route.id || (under.curved && over.route.id > under.route.id) || !overlaps(over.box, under.box)) continue;
    // Sample only candidate curves, once each; distant rounded corners need no subdivision.
    const overSamples = over.samples ||= bezierSamples(over.controls), underSamples = under.samples ||= bezierSamples(under.controls);
    for (let ai = 1; ai < overSamples.length; ai++) for (let bi = 1; bi < underSamples.length; bi++) {
      const a = { a: overSamples[ai - 1], b: overSamples[ai] }, b = { a: underSamples[bi - 1], b: underSamples[bi] };
      if (!overlaps(bounds(a.a.point, a.b.point), bounds(b.a.point, b.b.point))) continue;
      const da = subtract(a.b.point, a.a.point), db = subtract(b.b.point, b.a.point), determinant = cross(da, db);
      if (Math.abs(determinant) < 1e-8) continue;
      const delta = subtract(b.a.point, a.a.point), t = cross(delta, db) / determinant, u = cross(delta, da) / determinant;
      if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) continue;
      const hit = refineCrossing(over.controls, under.controls, a.a.t + (a.b.t - a.a.t) * t, b.a.t + (b.b.t - b.a.t) * u);
      if (!hit) continue;
      const key = `${over.route.id}:${over.command}:${under.route.id}:${under.command}:${hit.t.toFixed(5)}:${hit.u.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { point } = hit;
      const box = { x: point.x - clearance, y: point.y - clearance, width: clearance * 2, height: clearance * 2 };
      if ([...blockers.query(box)].some(blocker => overlaps(box, blocker))) continue;
      if ([over, under].some(piece => [piece.route.drawing.points[0], piece.route.drawing.points.at(-1)!].some(p =>
        Math.hypot(point.x - p.x - piece.route.x, point.y - p.y - piece.route.y) < clearance))) continue;
      const distance = distanceAt(underSamples, hit.u), halfGap = underpassHalfGap / hit.sine;
      // Keep cuts inside their drawing command, clear of a bend or route endpoint.
      if (distance <= halfGap || underSamples.at(-1)!.distance - distance <= halfGap) continue;
      let lo = parameterAt(underSamples, distance - halfGap), hi = parameterAt(underSamples, distance + halfGap);
      if (!under.curved) {
        const horizontal = Math.abs(under.controls[1].x - under.controls[0].x) >= Math.abs(under.controls[1].y - under.controls[0].y);
        const axis = (t: number) => { const p = bezierPoint(under.controls, t); return horizontal ? p.x - under.route.x : p.y - under.route.y; };
        const ends = [axis(lo), axis(hi)]; lo = Math.min(...ends); hi = Math.max(...ends);
      }
      let routeMarks = marks.get(under.route.id);
      if (!routeMarks) marks.set(under.route.id, routeMarks = new Map());
      const gaps = routeMarks.get(under.command) || [];
      if (gaps.some(gap => gap.hop && gap.at + hopRadius > lo && gap.at - hopRadius < hi)) continue;
      gaps.push({ at: 0, hop: false, lo, hi }); routeMarks.set(under.command, gaps);
      bridges.add(over.route.id);
    }
  }
  return bridges;
}
