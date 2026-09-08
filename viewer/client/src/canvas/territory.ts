import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";
import type { Bounds, Point, Territory, TerritoryEdit, TerritoryPreferences, TerritoryRegion } from "../../../shared/canvas-geometry";

const EPS = .00001;
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const inflate = (b: Bounds, pad: number): Bounds => ({ x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 });
export const corners = (b: Bounds): Point[] => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y },
  { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
export function pointBounds(points: Point[]): Bounds {
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return { x, y, w: Math.max(...points.map(p => p.x)) - x, h: Math.max(...points.map(p => p.y)) - y };
}
export function fitContextFrame(boxes: Bounds[], heading: { w: number; h: number }): Bounds {
  if (!boxes.length) return { x: 0, y: 0, w: Math.max(260, heading.w + 24), h: heading.h + 44 };
  const b = pointBounds(boxes.flatMap(corners));
  return { x: b.x - 28, y: b.y - heading.h - 22,
    w: Math.max(260, b.w + 56, heading.w + 24), h: b.h + heading.h + 50 };
}
function nearestOnSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  return mix(a, b, Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))));
}
export function nearestBorder(p: Point, points: Point[]) {
  return points.map((a, i) => nearestOnSegment(p, a, points[(i + 1) % points.length]))
    .reduce((a, b) => Math.hypot(p.x - a.x, p.y - a.y) < Math.hypot(p.x - b.x, p.y - b.y) ? a : b);
}
export function pointInPolygon(p: Point, points: Point[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i];
    if (Math.abs(cross(a, b, p)) < EPS && p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS &&
      p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function hitTime(a: Point, b: Point, c: Point, d: Point): number | undefined {
  const dx = b.x - a.x, dy = b.y - a.y, ex = d.x - c.x, ey = d.y - c.y;
  const det = dx * ey - dy * ex;
  if (Math.abs(det) < EPS) return;
  const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / det;
  const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / det;
  if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) return Math.max(0, Math.min(1, t));
}
export function containsBox(points: Point[], box: Bounds) {
  const c = corners(box);
  if (!c.every(p => pointInPolygon(p, points))) return false;
  // A bay can cut through a rectangle even when all four corners are inside.
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (a.x > box.x + EPS && a.x < box.x + box.w - EPS && a.y > box.y + EPS && a.y < box.y + box.h - EPS) return false;
    const times = [0, 1, ...c.flatMap((p, j) => {
      const t = hitTime(a, b, p, c[(j + 1) % 4]);
      return t === undefined ? [] : [t];
    })].sort((a, b) => a - b);
    for (let j = 1; j < times.length; j++) {
      const p = mix(a, b, (times[j - 1] + times[j]) / 2);
      if (p.x > box.x + EPS && p.x < box.x + box.w - EPS && p.y > box.y + EPS && p.y < box.y + box.h - EPS) return false;
    }
  }
  return true;
}
export function simplePolygon(points: Point[]) {
  if (points.length < 3 || points.length > 512 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < EPS) return false;
    area += a.x * b.y - a.y * b.x;
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const c = points[j], d = points[(j + 1) % points.length];
      if (hitTime(a, b, c, d) !== undefined) return false;
      if (Math.abs(cross(a, b, c)) < EPS && Math.abs(cross(a, b, d)) < EPS &&
        Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) + EPS &&
        Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) + EPS) return false;
    }
  }
  return Math.abs(area) > 64;
}
function hull(input: Point[]) {
  const points = [...input].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (points: Point[]) => {
    const result: Point[] = [];
    for (const p of points) {
      while (result.length > 1 && cross(result.at(-2)!, result.at(-1)!, p) <= EPS) result.pop();
      result.push(p);
    }
    return result.slice(0, -1);
  };
  return [...half(points), ...half([...points].reverse())];
}
function plot(box: Bounds, pad = 40) {
  const b = inflate(box, pad), c = pad * .65;
  return [{ x: b.x + c, y: b.y }, { x: b.x + b.w - c, y: b.y }, { x: b.x + b.w, y: b.y + c },
    { x: b.x + b.w, y: b.y + b.h - c }, { x: b.x + b.w - c, y: b.y + b.h },
    { x: b.x + c, y: b.y + b.h }, { x: b.x, y: b.y + b.h - c }, { x: b.x, y: b.y + c }];
}
function noise(seed: string, i: number) {
  let hash = 2166136261;
  for (const c of `${seed}:${i}`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}
/** Broad coasts follow the content hull; shallow bays use the spare space between plots. */
export function generateTerritory(seed: string, boxes: Bounds[], heading: { w: number; h: number }): Territory {
  const frame = fitContextFrame(boxes, heading), label = { x: frame.x + 12, y: frame.y + 6 };
  const protectedBoxes = [...boxes.map(b => inflate(b, 8)), { ...label, ...heading }];
  const outline = hull(protectedBoxes.flatMap(b => plot(b)));
  let points = [...outline];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length], length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 110) continue;
    // Direction-based noise changes continuously as an edge turns and does not
    // reseed distant bays when another part of the hull gains a vertex.
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const variation = .5 + .25 * Math.sin(angle * 3 + noise(seed, 0) * Math.PI * 2)
      + .25 * Math.sin(angle * 5 + noise(seed, 1) * Math.PI * 2);
    const middle = mix(a, b, .4 + variation * .2);
    const depth = Math.min(70, length * .12) * (.7 + variation * .3);
    const at = points.indexOf(a) + 1;
    for (let fraction = 1; fraction >= .125; fraction /= 2) {
      const p = { x: middle.x - (b.y - a.y) / length * depth * fraction,
        y: middle.y + (b.x - a.x) / length * depth * fraction };
      const candidate = [...points.slice(0, at), p, ...points.slice(at)];
      if (simplePolygon(candidate) && protectedBoxes.every(b => containsBox(candidate, b))) { points = candidate; break; }
    }
  }
  return { points, label };
}

/** Round the editable cage into a shared visible/hittable coast. Short quadratic
 * arcs stay local to each corner; reduce rounding when a sculpted bay is tight. */
export function roundTerritory(control: Territory, boxes: Bounds[], heading: { w: number; h: number }): Territory {
  const protectedBoxes = [...boxes.map(b => inflate(b, 8)), { ...control.label, ...heading }];
  const steps = Math.min(8, Math.floor(512 / control.points.length) - 1);
  if (steps < 2) return control;
  for (let radius = 36; radius >= 1; radius /= 2) {
    const points = control.points.flatMap((p, i, ring) => {
      const before = ring[(i + ring.length - 1) % ring.length], after = ring[(i + 1) % ring.length];
      const incoming = Math.hypot(p.x - before.x, p.y - before.y), outgoing = Math.hypot(p.x - after.x, p.y - after.y);
      const clearance = Math.min(...protectedBoxes.map(b => Math.hypot(
        Math.max(b.x - p.x, 0, p.x - b.x - b.w), Math.max(b.y - p.y, 0, p.y - b.y - b.h))));
      const reach = Math.min(radius, incoming * .35, outgoing * .35, clearance * .9);
      if (reach < .1) return [p];
      const a = mix(p, before, reach / (incoming || 1)), b = mix(p, after, reach / (outgoing || 1));
      // Normal outlines use eight samples per arc; bound work for dense imported cages.
      return Array.from({ length: steps + 1 }, (_, j) => {
        const t = j / steps;
        return { x: (1 - t) ** 2 * a.x + 2 * t * (1 - t) * p.x + t * t * b.x,
          y: (1 - t) ** 2 * a.y + 2 * t * (1 - t) * p.y + t * t * b.y };
      });
    });
    if (simplePolygon(points) && protectedBoxes.every(b => containsBox(points, b))) return { ...control, points };
  }
  return control;
}
const asPolygon = (points: Point[]): Polygon => [points.map(p => [p.x, p.y])];
const toRegion = (polygons: MultiPolygon): TerritoryRegion => polygons.map(polygon =>
  polygon.map(ring => ring.map(([x, y]) => ({ x, y }))));
const fromRegion = (region: TerritoryRegion): MultiPolygon => region.map(polygon =>
  polygon.map(ring => ring.map(({ x, y }) => [x, y])));
const ringPoints = (polygon: Polygon) => polygon[0].slice(0, -1).map(([x, y]) => ({ x, y }));
const area = (points: Point[]) => Math.abs(points.reduce((sum, a, i) => {
  const b = points[(i + 1) % points.length];
  return sum + a.x * b.y - a.y * b.x;
}, 0));

/** A gesture records only its local difference, never the surrounding generated coast. */
export function territoryEdit(id: string, before: Point[], after: Point[]): TerritoryEdit | undefined {
  const add = toRegion(polygonClipping.difference(asPolygon(after), asPolygon(before)));
  const cut = toRegion(polygonClipping.difference(asPolygon(before), asPolygon(after)));
  return add.length || cut.length ? { id, add, cut } : undefined;
}

/** Preserve an older saved outline as preferences when its contents are available. */
export function migrateTerritory(preferences: TerritoryPreferences | null, automatic: Territory): TerritoryPreferences | null {
  if (!preferences?.legacy) return preferences;
  const edit = simplePolygon(preferences.legacy.points)
    ? territoryEdit("imported-border", automatic.points, preferences.legacy.points) : undefined;
  const edits = [...(edit ? [edit] : []), ...preferences.edits];
  return edits.length ? { edits, legacy: null } : null;
}

/** Content wins over sculpting. Reapply edits to a fresh outline on every change,
 * so an overridden bay returns and old automatic extensions cannot accumulate. */
export function applyTerritoryEdits(automatic: Territory, boxes: Bounds[], heading: { w: number; h: number }, edits: TerritoryEdit[]): Territory {
  if (!edits.length) return automatic;
  let geometry: MultiPolygon = [asPolygon(automatic.points)];
  for (const edit of edits) {
    if (edit.add.length) geometry = polygonClipping.union(geometry, fromRegion(edit.add));
    if (edit.cut.length) geometry = polygonClipping.difference(geometry, fromRegion(edit.cut));
  }
  const protectedBoxes = [...boxes.map(b => inflate(b, 8)), { ...automatic.label, ...heading }];
  geometry = polygonClipping.union(geometry, ...protectedBoxes.map(b => asPolygon(corners(b))));
  const labelCenter = { x: automatic.label.x + heading.w / 2, y: automatic.label.y + heading.h / 2 };
  // A preference in an abandoned part of the map may become dormant. Keep only
  // components containing current contents; reconnect a cut that would split them.
  const parts = geometry.map(ringPoints).filter(points => protectedBoxes.some(b =>
    pointInPolygon({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, points)))
    .sort((a, b) => Number(pointInPolygon(labelCenter, b)) - Number(pointInPolygon(labelCenter, a)) || area(b) - area(a));
  let points = parts[0];
  if (!points) return automatic;
  for (const part of parts.slice(1)) {
    const pair = part.map(a => ({ a, b: nearestBorder(a, points) })).reduce((a, b) =>
      Math.hypot(a.a.x - a.b.x, a.a.y - a.b.y) < Math.hypot(b.a.x - b.b.x, b.a.y - b.b.y) ? a : b);
    const corridor = hull([...plot({ ...pair.a, w: 1, h: 1 }, 20), ...plot({ ...pair.b, w: 1, h: 1 }, 20)]);
    const connected = polygonClipping.union(asPolygon(points), asPolygon(part), asPolygon(corridor));
    points = connected.length === 1 ? ringPoints(connected[0]) : hull([...points, ...part]);
  }
  // Fill holes; a context remains a single territory with an editable outer coast.
  if (!simplePolygon(points) || !protectedBoxes.every(b => containsBox(points, b)))
    points = hull([...points, ...protectedBoxes.flatMap(corners)]);
  return { ...automatic, points };
}

/** Allow a preferred edge to cross contents; the rendered result will yield to
 * their footprints. Only prevent crossing the rest of the preferred outline. */
export function moveBorderVertex(territory: Territory, index: number, goal: Point) {
  const initial = territory.points[index];
  if (!initial) return territory;
  const candidate = (t: number) => territory.points.map((p, i) => i === index ? mix(initial, goal, t) : p);
  let points = candidate(1);
  if (!simplePolygon(points)) {
    let low = 0, high = 1;
    for (let i = 0; i < 18; i++) {
      const mid = (low + high) / 2;
      if (simplePolygon(candidate(mid))) low = mid; else high = mid;
    }
    points = candidate(low);
  }
  return { ...territory, points };
}

/** Meet the actual coast along an approach from outside; nearest coast is a safe fallback. */
export function borderPort(points: Point[], toward: Point) {
  const b = pointBounds(points), center = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const hits = points.flatMap((a, i) => {
    const t = hitTime(toward, center, a, points[(i + 1) % points.length]);
    return t === undefined ? [] : [{ t, point: mix(toward, center, t) }];
  }).sort((a, b) => a.t - b.t);
  return hits[0]?.point || nearestBorder(toward, points);
}
