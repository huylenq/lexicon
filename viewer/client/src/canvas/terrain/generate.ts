import type { Bounds, Point } from "../../../../shared/canvas-geometry";
import { containsBox, pointInPolygon } from "../territory";

/** Presentation geometry only. Nothing generated here changes model or canvas positions. */
export const landmarks = ["auto", "house", "hall", "workshop", "archive", "tower", "garden", "none"] as const;
export const terrains = ["village", "woodland", "island"] as const;
export const paths = ["road", "trail", "none"] as const;
export type Landmark = Exclude<(typeof landmarks)[number], "auto">;
export type Terrain = (typeof terrains)[number];
export type PathKind = (typeof paths)[number];
type MapContext = {
  id: string; kind: "context"; bounds: Bounds;
  boundary: Point[]; label: Bounds; origin: Point; terrain?: unknown;
};
type MapConcept = {
  id: string; kind: "concept"; bounds: Bounds; classification?: string; landmark?: unknown;
};
export type MapNode = MapContext | MapConcept;
export type MapRoad = { id: string; points: Point[]; kind: PathKind; entrances?: [boolean, boolean] };
export type RoadGeometry = {
  points: Point[]; outline: Point[]; banks: [Point[], Point[]];
  ruts: [Point[], Point[]]; texture: string; direction: Point & { angle: number };
};
export type Ornament = Point & { id: string; radius: number; variant: number; kind: "tree" | "field" };
export type District = { id: string; bounds: Bounds; boundary: Point[]; terrain: Terrain; ornaments: Ornament[] };
export type MapScene = {
  districts: District[];
  landmarks: { id: string; bounds: Bounds; kind: Landmark; variant: number }[];
  roads: (MapRoad & { geometry: RoadGeometry })[];
  bridges: { id: string; at: Point; angle: number }[];
};

export function choice<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback;
}
export function landmarkFor(node: Pick<MapConcept, "classification" | "landmark">): Landmark {
  const selected = choice(node.landmark, landmarks, "auto");
  if (selected !== "auto") return selected;
  switch (node.classification?.toLowerCase()) {
    case "aggregate": return "hall";
    case "service": return "workshop";
    case "event": return "tower";
    case "value": case "value object": return "garden";
    default: return "house";
  }
}

/** Bounds of the original SVG marks, including their chimneys, steps, and shadows. */
export function landmarkFootprint(kind: Landmark): Bounds {
  switch (kind) {
    case "garden": return { x: -34, y: -19, w: 68, h: 39 };
    case "tower": return { x: -23, y: -36, w: 48, h: 58 };
    case "hall": return { x: -39, y: -27, w: 81, h: 54 };
    case "archive": return { x: -39, y: -16, w: 81, h: 43 };
    case "workshop": return { x: -26, y: -28, w: 74, h: 55 };
    case "house": return { x: -26, y: -23, w: 55, h: 50 };
    case "none": return { x: 0, y: 0, w: 0, h: 0 };
  }
}

export function landmarkPlacement(bounds: Bounds, kind: Landmark) {
  const footprint = landmarkFootprint(kind);
  const origin = { x: bounds.x + bounds.w / 2 - (footprint.x + footprint.w / 2), y: bounds.y + 6 - footprint.y };
  const w = kind === "hall" || kind === "archive" ? 38 : kind === "garden" ? 30 : kind === "tower" ? 20 : 25;
  const h = kind === "garden" ? 15 : kind === "tower" || kind === "hall" || kind === "archive" ? 16 : 18;
  return { origin, bounds, body: { x: origin.x - w, y: origin.y - h, w: w * 2, h: h * 2 } };
}

/** Extend the route into a landmark's wall or garden gate, skirting the label below it. */
export function dockRoad(input: Point[], start?: ReturnType<typeof landmarkPlacement>, end?: ReturnType<typeof landmarkPlacement>, self = false) {
  if (self && start) {
    // A self relationship needs two entrances and room to turn beyond the building.
    const b = start.body, x = b.x + b.w - 2, y = b.y + b.h / 2;
    const outside = Math.max(...input.map(p => p.x), start.bounds.x + start.bounds.w + 60);
    return [{ x, y: y - b.h / 4 }, { x: x + 26, y: y - b.h / 4 },
      { x: outside, y: b.y - 24 }, { x: outside, y: b.y + b.h + 24 },
      { x: x + 26, y: y + b.h / 4 }, { x, y: y + b.h / 4 }];
  }
  const dock = (points: Point[], landmark?: ReturnType<typeof landmarkPlacement>) => {
    if (!landmark || points.length < 2) return points;
    const { body, bounds } = landmark;
    let rest = points.slice(1);
    while (rest.length > 1 && inside(rest[0], bounds, 12)) rest = rest.slice(1);
    const toward = rest[0], cx = body.x + body.w / 2, cy = body.y + body.h / 2;
    const horizontal = Math.abs(toward.x - cx) / body.w > Math.abs(toward.y - cy) / body.h;
    let approach: Point[];
    if (!horizontal && toward.y > body.y + body.h) {
      // A south approach goes around the nameplate, then meets a side entrance.
      const sign = toward.x < cx ? -1 : 1;
      const x = sign < 0 ? bounds.x - 16 : bounds.x + bounds.w + 16;
      const y = Math.max(bounds.y + bounds.h + 16, toward.y);
      approach = [{ x: cx + sign * (body.w / 2 - 2), y: cy }, { x, y: cy }, { x, y }, { x: toward.x, y }];
    } else if (horizontal) {
      const sign = toward.x < cx ? -1 : 1;
      approach = [{ x: cx + sign * (body.w / 2 - 2), y: cy }, { x: toward.x, y: cy }];
    } else {
      approach = [{ x: cx, y: body.y + 2 }, { x: cx, y: toward.y }];
    }
    return [...approach, ...rest].filter((p, i, all) => !i || Math.hypot(p.x - all[i - 1].x, p.y - all[i - 1].y) > .001);
  };
  const fitted = dock([...dock(input, start)].reverse(), end).reverse();
  const clean: Point[] = [];
  for (const p of fitted) {
    // Docking can shorten an end segment past its old corner. Remove redundant
    // collinear points, including reversals, before rounding the road's banks.
    while (clean.length > 1) {
      const a = clean[clean.length - 2], b = clean[clean.length - 1];
      if (Math.abs((b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x)) > .0001) break;
      clean.pop();
    }
    if (!clean.length || Math.hypot(p.x - clean.at(-1)!.x, p.y - clean.at(-1)!.y) > .001) clean.push(p);
  }
  return clean;
}

/** Independent streams keep a new object from changing every later object's appearance. */
export function randomFor(key: string) {
  let state = 2166136261;
  for (const ch of key) state = Math.imul(state ^ ch.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function inside(p: Point, b: Bounds, pad = 0) {
  return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
}
const overlaps = (a: Bounds, b: Bounds) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function intersection(a: Point, b: Point, c: Point, d: Point): Point | undefined {
  const dx = b.x - a.x, dy = b.y - a.y, ex = d.x - c.x, ey = d.y - c.y;
  const det = dx * ey - dy * ex;
  if (Math.abs(det) < 0.0001) return;
  const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / det;
  const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / det;
  if (t > 0.001 && t < 0.999 && u >= 0 && u <= 1) return { x: a.x + t * dx, y: a.y + t * dy };
}
const finiteBounds = (b: Bounds) => [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0;

/** A stable dirt track within the existing route corridor, with the same endpoints. */
export function roadGeometry(seed: string, input: Point[], kind: PathKind, entrances: [boolean, boolean] = [false, false]): RoadGeometry {
  const route = input.filter((p, i) => !i || Math.hypot(p.x - input[i - 1].x, p.y - input[i - 1].y) > .001);
  const rand = randomFor(`${seed}:road`), phase = rand() * Math.PI * 2;
  const base: Point[] = route.length ? [{ ...route[0] }] : [{ x: 0, y: 0 }];
  const lerp = (a: Point, b: Point, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const lineTo = (end: Point) => {
    const start = base.at(-1)!;
    const steps = Math.min(80, Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 12)));
    for (let i = 1; i <= steps; i++) base.push(lerp(start, end, i / steps));
  };
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], c = route[i + 1];
    if (!c) { lineTo(b); break; }
    const before = Math.hypot(b.x - a.x, b.y - a.y), after = Math.hypot(c.x - b.x, c.y - b.y);
    const radius = Math.min(28, before * .3, after * .3);
    const entry = lerp(b, a, radius / before), exit = lerp(b, c, radius / after);
    lineTo(entry);
    for (let step = 1; step <= 6; step++) {
      const t = step / 6;
      base.push(lerp(lerp(entry, b, t), lerp(b, exit, t), t));
    }
  }
  if (base.length === 1) base.push({ x: base[0].x + .001, y: base[0].y });
  const distances = [0];
  for (let i = 1; i < base.length; i++) distances.push(distances[i - 1] + Math.hypot(base[i].x - base[i - 1].x, base[i].y - base[i - 1].y));
  const length = distances.at(-1)!;
  const normal = (points: Point[], i: number) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: -(b.y - a.y) / distance, y: (b.x - a.x) / distance };
  };
  const points = base.map((p, i) => {
    if (!i || i === base.length - 1) return p;
    const s = distances[i], n = normal(base, i);
    const taper = Math.min(1, s / 24, (length - s) / 24);
    const drift = (Math.sin(s / 43 + phase) * 5 + Math.sin(s / 19 + phase * 2) * 1.3) * taper;
    return { x: p.x + n.x * drift, y: p.y + n.y * drift };
  });
  const banks: [Point[], Point[]] = [[], []], ruts: [Point[], Point[]] = [[], []];
  const marks: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], n = normal(points, i), s = distances[i];
    const approach = Math.min(1, entrances[0] ? s / 44 : 1, entrances[1] ? (length - s) / 44 : 1);
    const width = Math.min(kind === "trail" ? 3.5 : 4 + 6 * approach, Math.max(1, length / 5));
    for (const [side, sign] of [[0, -1], [1, 1]] as const) {
      const roughness = 1 + Math.sin(s / 23 + phase + side) * .13 + Math.sin(s / 7 + phase * 3 + side) * .06;
      const offset = sign * width * roughness;
      banks[side].push({ x: p.x + n.x * offset, y: p.y + n.y * offset });
      ruts[side].push({ x: p.x + n.x * offset * .32, y: p.y + n.y * offset * .32 });
    }
    if (i > 1 && i < points.length - 2 && rand() < .5) {
      const offset = (rand() - .5) * width * 1.3;
      const x = p.x + n.x * offset, y = p.y + n.y * offset;
      marks.push(`M${x.toFixed(2)},${y.toFixed(2)} l${(-n.y * 2).toFixed(2)},${(n.x * 2).toFixed(2)}`);
    }
  }
  const end = points.at(-1)!, before = points.at(-2)!;
  const direction = { ...lerp(before, end, .35), angle: Math.atan2(end.y - before.y, end.x - before.x) * 180 / Math.PI };
  return { points, outline: [...banks[0], ...[...banks[1]].reverse()], banks, ruts, texture: marks.join(" "), direction };
}

export function generateMap(seed: string, input: MapNode[], inputRoads: MapRoad[], extraObstacles: Bounds[] = []): MapScene {
  const nodes = input.filter(n => finiteBounds(n.bounds)).sort((a, b) => a.id.localeCompare(b.id));
  const roads = inputRoads.filter(r => r.kind !== "none" && r.points.length > 1 && r.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(r => ({ ...r, geometry: roadGeometry(`${seed}:${r.id}`, r.points, r.kind, r.entrances) }));
  const obstacles = [...extraObstacles.filter(finiteBounds), ...nodes.map(n => n.kind === "context" ? n.label : n.bounds)];
  const districts = nodes.filter(n => n.kind === "context").map(node => {
    const b = node.bounds, terrain = choice(node.terrain, terrains, "village");
    const boundary = node.boundary;
    const ornaments: Ornament[] = [];
    const area = { x: b.x - 50, y: b.y - 50, w: b.w + 100, h: b.h + 100 };
    const blockers = obstacles.filter(o => overlaps(area, o));
    const foreign = nodes.filter(n => n.kind === "context" && n.id !== node.id && overlaps(area, n.bounds));
    const nearbyRoads = roads.filter(r => r.geometry.points.some((p, i) => i > 0 && overlaps(area, {
      x: Math.min(p.x, r.geometry.points[i - 1].x) - 30, y: Math.min(p.y, r.geometry.points[i - 1].y) - 30,
      w: Math.abs(p.x - r.geometry.points[i - 1].x) + 60, h: Math.abs(p.y - r.geometry.points[i - 1].y) + 60,
    })));
    // Fixed local cells: resizing a district or moving a concept only changes affected cells.
    // Bound work for huge imported canvases; normal districts retain the same 46-unit lattice.
    const step = 46;
    const nx = Math.min(70, Math.ceil(area.w / step)), ny = Math.min(70, Math.ceil(area.h / step));
    const origin = node.origin, minX = Math.floor((area.x - origin.x) / step), minY = Math.floor((area.y - origin.y) / step);
    for (let cy = minY; cy < minY + ny; cy++) for (let cx = minX; cx < minX + nx; cx++) {
      const id = `${node.id}:${cx}:${cy}`, rand = randomFor(`${seed}:${id}`);
      const radius = 7 + rand() * 6;
      const p = { x: origin.x + cx * step + 10 + rand() * 22, y: origin.y + cy * step + 10 + rand() * 22 };
      const within = pointInPolygon(p, boundary);
      if (terrain === "island" && !containsBox(boundary, { x: p.x - radius, y: p.y - radius, w: radius * 2, h: radius * 2 })) continue;
      if (rand() > (terrain === "woodland" ? .85 : within ? .38 : .72)) continue;
      if (blockers.some(o => inside(p, o, radius + 8)) || foreign.some(n => inside(p, n.bounds, radius + 14))) continue;
      if (nearbyRoads.some(r => r.geometry.points.some((q, i) => i > 0 && distanceToSegment(p, r.geometry.points[i - 1], q) < radius + 18))) continue;
      ornaments.push({ ...p, id, radius, variant: rand(), kind: terrain === "village" && rand() > .68 ? "field" : "tree" });
    }
    return { id: node.id, bounds: b, boundary, terrain, ornaments };
  });
  const bridges: MapScene["bridges"] = [];
  for (const road of roads) for (let i = 1; i < road.geometry.points.length; i++) {
    const a = road.geometry.points[i - 1], b = road.geometry.points[i];
    for (const district of districts.filter(d => d.terrain === "island")) {
      for (let j = 0; j < district.boundary.length; j++) {
        const at = intersection(a, b, district.boundary[j], district.boundary[(j + 1) % district.boundary.length]);
        if (at && !bridges.some(bridge => Math.hypot(at.x - bridge.at.x, at.y - bridge.at.y) < 12))
          bridges.push({ id: `${road.id}:${district.id}:${i}:${j}`, at, angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI });
      }
    }
  }
  return {
    districts, roads, bridges,
    landmarks: nodes.filter(n => n.kind === "concept").map(n => ({
      id: n.id, bounds: n.bounds, kind: landmarkFor(n), variant: randomFor(`${seed}:${n.id}:building`)(),
    })),
  };
}

export function pathFor(points: Point[], close = false) {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") + (close ? " Z" : "");
}
