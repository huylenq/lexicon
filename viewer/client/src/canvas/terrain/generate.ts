import type { Bounds, Point } from "../../../../shared/canvas-geometry";
import { towerFootprint, wallGeometry } from "./fortGeometry";
import { boxPolygon, boxesMeet, indexRoads, pointBounds, roadSurface } from "./roadIndex";
import { containsBox, pointInPolygon } from "../territory";

/** Presentation geometry only. Nothing generated here changes model or canvas positions. */
export const landmarks = ["auto", "house", "hall", "workshop", "archive", "tower", "garden", "none"] as const;
export const terrains = ["village", "woodland", "island", "highlands", "wetland"] as const;
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
export type LandscapeKind = "mountain" | "hill" | "spring" | "pond" | "grove" | "birch" | "shrubs" | "flowers" | "rocks" | "oak" | "pine" | "wheat";
export type LandscapeFeature = { id: string; kind: LandscapeKind; bounds: Bounds; variant: number; large: boolean };
export type GroundPatch = { id: string; kind: "grass" | "dry" | "earth" | "shade"; points: Point[]; marks: Point[] };
export type WallSection = { id: string; a: Point; b: Point; normal: Point; height: number; thickness: number; merlon: boolean };
export type FortTower = { id: string; at: Point; radius: number; height: number; kind: "round" | "square" | "roofed" | "bastion"; variant: number };
export type FortGate = { id: string; at: Point; tangent: Point; normal: Point; span: number; roadIds: string[]; main: boolean };
export type BoundaryReach = { id: string; points: Point[]; normal: Point; depth: number; variant: number };
export type BoundarySpritePlacement = { id: string; crop: number; bounds: Bounds; mirror: boolean };
export type BoundaryStructure = { kind: "rampart" | "treeline" | "cliff" | "marsh" | "shore";
  reaches: BoundaryReach[]; sprites: BoundarySpritePlacement[]; walls: WallSection[]; towers: FortTower[]; gates: FortGate[] };
export type District = { id: string; bounds: Bounds; boundary: Point[]; terrain: Terrain; ornaments: Ornament[];
  landscape: LandscapeFeature[]; ground: GroundPatch[]; edge: BoundaryStructure };
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
  if (t >= -.000001 && t <= 1.000001 && u >= -.000001 && u <= 1.000001)
    return { x: a.x + Math.max(0, Math.min(1, t)) * dx, y: a.y + Math.max(0, Math.min(1, t)) * dy };
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

type SceneCache = {
  districts: Map<string, { key: string; value: District }>;
  roads: Map<string, { key: string; value: MapScene["roads"][number] }>;
};

/** Per-view cache, bounded to the current model. No global or persisted geometry. */
export function createMapGenerator() {
  const cache: SceneCache = { districts: new Map(), roads: new Map() };
  return (seed: string, nodes: MapNode[], roads: MapRoad[], obstacles: Bounds[] = []) => buildMap(seed, nodes, roads, obstacles, cache);
}
export function generateMap(seed: string, input: MapNode[], roads: MapRoad[], obstacles: Bounds[] = []): MapScene {
  return buildMap(seed, input, roads, obstacles);
}
function buildMap(seed: string, input: MapNode[], inputRoads: MapRoad[], extraObstacles: Bounds[], cache?: SceneCache): MapScene {
  const nodes = input.filter(n => finiteBounds(n.bounds)).sort((a, b) => a.id.localeCompare(b.id));
  const roads = inputRoads.filter(r => r.kind !== "none" && r.points.length > 1 && r.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(r => {
      const key = JSON.stringify([seed, r]), cached = cache?.roads.get(r.id);
      if (cached?.key === key) return cached.value;
      const value = { ...r, geometry: roadGeometry(`${seed}:${r.id}`, r.points, r.kind, r.entrances) };
      cache?.roads.set(r.id, { key, value });
      return value;
    });
  const roadIndex = indexRoads(roads);
  const obstacles = [...extraObstacles.filter(finiteBounds), ...nodes.map(n => n.kind === "context" ? n.label : n.bounds)];
  const districts = nodes.filter(n => n.kind === "context").map(node => {
    const b = node.bounds, terrain = choice(node.terrain, terrains, "village");
    const boundary = node.boundary;
    // Includes every scenery and projected-art clearance envelope, even when a
    // caller supplies a contour extending beyond the context bounds.
    const envelope = pointBounds([...boxPolygon(b), ...boundary], 200);
    const localRoads = roadIndex.near(envelope);
    const localObstacles = obstacles.filter(o => boxesMeet(envelope, o));
    const localForeign = nodes.filter(n => n.kind === "context" && n.id !== node.id && boxesMeet(envelope, n.bounds));
    const key = cache ? JSON.stringify([seed, node, localObstacles, localForeign.map(n => n.bounds),
      localRoads.map(r => cache.roads.get(r.id)!.key)]) : "";
    const cached = cache?.districts.get(node.id);
    if (cached?.key === key) return cached.value;
    const ornaments: Ornament[] = [];
    const area = { x: b.x - 50, y: b.y - 50, w: b.w + 100, h: b.h + 100 };
    const blockers = localObstacles.filter(o => overlaps(area, o));
    const foreign = localForeign.filter(n => overlaps(area, n.bounds));
    const nearbyRoads = localRoads.filter(r => r.geometry.points.some((p, i) => i > 0 && overlaps(area, {
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
      const radius = 5 + rand() * 10;
      const p = { x: origin.x + cx * step + 10 + rand() * 22, y: origin.y + cy * step + 10 + rand() * 22 };
      const within = pointInPolygon(p, boundary);
      if (terrain === "island" && !containsBox(boundary, { x: p.x - radius, y: p.y - radius, w: radius * 2, h: radius * 2 })) continue;
      const habitat = randomFor(`${seed}:${node.id}:ink-habitat:${Math.floor(cx / 3)}:${Math.floor(cy / 3)}`)();
      if (rand() > (terrain === "woodland" ? .3 + habitat * .6 : (within ? .08 : .15) + habitat * .55)) continue;
      if (blockers.some(o => inside(p, o, radius + 8)) || foreign.some(n => inside(p, n.bounds, radius + 14))) continue;
      if (nearbyRoads.some(r => r.geometry.points.some((q, i) => i > 0 && distanceToSegment(p, r.geometry.points[i - 1], q) < radius + 18))) continue;
      ornaments.push({ ...p, id, radius, variant: rand(), kind: terrain === "village" && rand() > .68 ? "field" : "tree" });
    }
    const scenery = landscapeFor(seed, node, terrain, localObstacles, localRoads, localForeign.map(n => n.bounds));
    const edge = boundaryStructureFor(`${seed}:${node.id}`, boundary, terrain, localRoads, localObstacles);
    const value = { id: node.id, bounds: b, boundary, terrain, ornaments, ...scenery, edge };
    cache?.districts.set(node.id, { key, value });
    return value;
  });
  if (cache) {
    const districtIds = new Set(districts.map(d => d.id)), roadIds = new Set(roads.map(r => r.id));
    for (const id of cache.districts.keys()) if (!districtIds.has(id)) cache.districts.delete(id);
    for (const id of cache.roads.keys()) if (!roadIds.has(id)) cache.roads.delete(id);
  }
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


/** Large features define local habitats; smaller scenery grows in uneven clusters.
 * All anchors and appearance streams are local to a context, independent of traversal order. */
function landscapeFor(seed: string, node: MapContext, terrain: Terrain, allObstacles: Bounds[], roads: MapScene["roads"], foreign: Bounds[]) {
  const landscape: LandscapeFeature[] = [], ground: GroundPatch[] = [];
  const area = { x: node.bounds.x - 115, y: node.bounds.y - 100, w: node.bounds.w + 230, h: node.bounds.h + 200 };
  const padded = (b: Bounds, pad: number) => ({ x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 });
  const blockers = [...allObstacles, ...foreign].filter(b => overlaps(area, b));
  const segments = roads.flatMap(road => road.geometry.points.slice(1).map((b, i) => ({ a: road.geometry.points[i], b })))
    .filter(({ a, b }) => overlaps(area, { x: Math.min(a.x, b.x) - 30, y: Math.min(a.y, b.y) - 30, w: Math.abs(a.x - b.x) + 60, h: Math.abs(a.y - b.y) + 60 }));
  const clear = (bounds: Bounds) => {
    if (terrain === "island" && !containsBox(node.boundary, bounds)) return false;
    if (blockers.some(b => overlaps(padded(bounds, 9), b))) return false;
    const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }, radius = Math.hypot(bounds.w, bounds.h) / 2;
    return !segments.some(({ a, b }) => distanceToSegment(center, a, b) < radius + 18);
  };
  const cells = (step: number, limit: number, visit: (cx: number, cy: number) => void) => {
    const x = Math.floor((area.x - node.origin.x) / step), y = Math.floor((area.y - node.origin.y) / step);
    const nx = Math.min(limit, Math.ceil(area.w / step) + 1), ny = Math.min(limit, Math.ceil(area.h / step) + 1);
    for (let cy = y; cy < y + ny; cy++) for (let cx = x; cx < x + nx; cx++) visit(cx, cy);
  };
  cells(150, 32, (cx, cy) => {
    const id = `${node.id}:land:${cx}:${cy}`, rand = randomFor(`${seed}:${id}`);
    const x = node.origin.x + (cx + .15 + rand() * .7) * 150;
    const y = node.origin.y + (cy + .15 + rand() * .7) * 150;
    if (!inside({ x, y }, area)) return;
    const rx = 80 + rand() * 65, ry = 40 + rand() * 50;
    const points = Array.from({ length: 14 }, (_, i) => {
      const angle = i / 14 * Math.PI * 2, r = .45 + rand() * .55;
      return { x: x + Math.cos(angle) * rx * r, y: y + Math.sin(angle) * ry * r };
    });
    const marks = Array.from({ length: 20 }, () => ({ x: x + (rand() - .5) * rx * 1.6, y: y + (rand() - .5) * ry * 1.6 })).filter(p => pointInPolygon(p, points));
    if (terrain !== "island" || containsBox(node.boundary, { x: x - rx, y: y - ry, w: rx * 2, h: ry * 2 }))
      ground.push({ id, kind: (["grass", "dry", "earth", "shade"] as const)[Math.floor(rand() * 4)], points, marks });
    if (rand() > .68) return;
    const kinds = terrain === "highlands" ? ["mountain", "mountain", "hill", "rocks"] as const
      : terrain === "wetland" ? ["spring", "pond", "spring", "hill"] as const
      : terrain === "island" ? ["hill", "spring", "pond", "rocks"] as const : ["mountain", "hill", "spring", "pond"] as const;
    const kind = kinds[Math.floor(randomFor(`${seed}:${id}:kind`)() * kinds.length)];
    const w = 82 + rand() * 38, h = kind === "mountain" ? w * .76 : w * .58;
    const bounds = { x: x - w / 2, y: y - h / 2, w, h };
    if (!clear(bounds) || landscape.some(f => overlaps(padded(bounds, 14), f.bounds))) return;
    landscape.push({ id, kind, bounds, variant: rand(), large: true });
  });
  cells(37, 85, (cx, cy) => {
    const id = `${node.id}:growth:${cx}:${cy}`, rand = randomFor(`${seed}:${id}`);
    const habitat = randomFor(`${seed}:${node.id}:habitat:${Math.floor(cx / 4)}:${Math.floor(cy / 4)}`)();
    if (rand() > (terrain === "woodland" ? .2 + habitat * .65 : .08 + habitat * .48)) return;
    const x = node.origin.x + (cx + rand()) * 37, y = node.origin.y + (cy + rand()) * 37;
    if (!inside({ x, y }, area)) return;
    const choices: LandscapeKind[] = terrain === "highlands" ? ["pine", "rocks", "shrubs", "grove"]
      : terrain === "wetland" ? ["birch", "grove", "shrubs", "flowers"]
      : habitat > .55 ? ["oak", "birch", "grove", "pine", "shrubs"] : ["flowers", "shrubs", "rocks", "wheat"];
    const kind = choices[Math.floor(rand() * choices.length)];
    const w = 13 + rand() * (kind === "grove" ? 31 : 23), h = w * (["flowers", "shrubs", "rocks", "wheat"].includes(kind) ? .65 : 1);
    const bounds = { x: x - w / 2, y: y - h / 2, w, h };
    if (!clear(bounds) || landscape.some(f => overlaps(padded(bounds, f.large ? 8 : 2), f.bounds))) return;
    landscape.push({ id, kind, bounds, variant: rand(), large: false });
  });
  landscape.sort((a, b) => a.bounds.y + a.bounds.h - b.bounds.y - b.bounds.h || a.id.localeCompare(b.id));
  return { landscape, ground };
}

/** Terrain chooses physical boundary structure; skins choose how to depict it.
 * Crossings, clearance and seeded variation remain independent of the renderer. */
export function boundaryStructureFor(seed: string, boundary: Point[], terrain: Terrain, roads: MapScene["roads"], obstacles: Bounds[]): BoundaryStructure {
  const kind = ({ village: "rampart", woodland: "treeline", highlands: "cliff", wetland: "marsh", island: "shore" } as const)[terrain];
  const reaches: BoundaryReach[] = [], sprites: BoundarySpritePlacement[] = [];
  const walls: WallSection[] = [], towers: FortTower[] = [], gates: (FortGate & { distance: number })[] = [];
  const edges = boundary.map((a, i) => ({ a, b: boundary[(i + 1) % boundary.length], length: 0, start: 0 }));
  let perimeter = 0;
  for (const e of edges) { e.start = perimeter; e.length = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y); perimeter += e.length; }
  if (perimeter < 1) return { kind, reaches, sprites, walls, towers, gates };
  const winding = Math.sign(edges.reduce((sum, { a, b }) => sum + a.x * b.y - b.x * a.y, 0)) || 1;
  const station = (distance: number) => {
    const d = ((distance % perimeter) + perimeter) % perimeter;
    const e = edges.find(e => e.start + e.length > d) || edges.at(-1)!;
    const tangent = { x: (e.b.x - e.a.x) / (e.length || 1), y: (e.b.y - e.a.y) / (e.length || 1) };
    return { at: { x: e.a.x + tangent.x * (d - e.start), y: e.a.y + tangent.y * (d - e.start) }, tangent,
      normal: { x: tangent.y * winding, y: -tangent.x * winding } };
  };
  const circularDistance = (a: number, b: number) => Math.min(Math.abs(a - b), perimeter - Math.abs(a - b));
  for (const road of roads) for (let i = 1; i < road.geometry.points.length; i++) for (const e of edges) {
    const hit = intersection(road.geometry.points[i - 1], road.geometry.points[i], e.a, e.b);
    if (!hit) continue;
    const distance = e.start + Math.hypot(hit.x - e.a.x, hit.y - e.a.y);
    const existing = gates.find(g => circularDistance(g.distance, distance) < 30);
    if (existing) {
      existing.span = Math.max(existing.span, circularDistance(existing.distance, distance) * 2 + 28);
      if (!existing.roadIds.includes(road.id)) existing.roadIds.push(road.id);
      continue;
    }
    const s = station(distance), roadAngle = road.geometry.points[i - 1];
    const dx = road.geometry.points[i].x - roadAngle.x, dy = road.geometry.points[i].y - roadAngle.y, length = Math.hypot(dx, dy) || 1;
    // A shallow approach needs a wider opening than a perpendicular one.
    const incidence = Math.abs((dx * s.normal.x + dy * s.normal.y) / length);
    gates.push({ ...s, id: `${seed}:gate:${road.id}:${gates.length}`, distance,
      span: Math.min(64, 24 / Math.max(.4, incidence)), roadIds: [road.id], main: false });
  }
  const clear = (b: Bounds) => !obstacles.some(o => overlaps({ x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 }, o));
  if (terrain !== "village") {
    // Broad coherent bends and irregular reaches, independent of polygon tessellation.
    // Keep every projected mark clear of model objects and crossing roads.
    const count = Math.min(300, Math.ceil(perimeter / 46)), step = perimeter / count;
    const phase = randomFor(`${seed}:edge`)() * Math.PI * 2;
    const drift = (d: number) => 3 + 5 * Math.sin(d / perimeter * Math.PI * 6 + phase)
      + 2 * Math.sin(d / perimeter * Math.PI * 18 + phase);
    for (let i = 0; i < count; i++) {
      const rand = randomFor(`${seed}:reach:${i}`), variant = rand(), s = station((i + .5) * step);
      const depth = (terrain === "highlands" ? 12 : 7) + rand() * (terrain === "highlands" ? 16 : 10);
      const points = Array.from({ length: 7 }, (_, j) => {
        const distance = (i + j / 6) * step, p = station(distance), offset = drift(distance);
        return { x: p.at.x + p.normal.x * offset, y: p.at.y + p.normal.y * offset };
      });
      const xs = points.map(p => p.x), ys = points.map(p => p.y);
      const bounds = { x: Math.min(...xs) - 16, y: Math.min(...ys) - 24,
        w: Math.max(...xs) - Math.min(...xs) + 32, h: Math.max(...ys) - Math.min(...ys) + 24 + depth };
      if (!clear(bounds) || roads.some(r => r.geometry.points.slice(1).some((p, j) =>
        points.some(q => distanceToSegment(q, r.geometry.points[j], p) < 26)))) continue;
      // Raster footprints have their own clearance: Ink keeps its existing marks.
      for (let j = 0; j < (terrain === "highlands" ? 3 : 2); j++) {
        if (terrain === "island" && rand() < .38) continue;
        const at = points[terrain === "highlands" ? 1 + j * 2 : j === 0 ? 1 : 4], w = 32 + rand() * 14;
        const h = terrain === "woodland" ? 29 + rand() * 10 : terrain === "highlands" ? 23 + rand() * 10 : terrain === "island" ? 17 + rand() * 6 : 22 + rand() * 10;
        const b = { x: at.x - w / 2, y: at.y + 8 - h, w, h };
        const center = { x: b.x + w / 2, y: b.y + h / 2 };
        if (!clear(b) || roads.some(r => r.geometry.points.slice(1).some((p, k) =>
          distanceToSegment(center, r.geometry.points[k], p) < Math.hypot(w, h) / 2 + 12))) continue;
        const crop = terrain === "woodland" ? Math.floor(rand() * 4) : terrain === "highlands" ? 4 + Math.floor(rand() * 4)
          : terrain === "wetland" ? 8 + Math.floor(rand() * 2) : 10 + Math.floor(rand() * 2);
        sprites.push({ id: `${seed}:edge-sprite:${i}:${j}`, crop, bounds: b, mirror: rand() > .5 });
      }
      reaches.push({ id: `${seed}:reach:${i}`, points, normal: s.normal, depth, variant });
    }
    return { kind, reaches, sprites, walls, towers, gates: gates.map(({ distance: _, ...g }) => g) };
  }
  if (!gates.length) {
    const candidates = Array.from({ length: Math.min(240, Math.ceil(perimeter / 12)) }, (_, i) => {
      const distance = i / Math.min(240, Math.ceil(perimeter / 12)) * perimeter;
      return { distance, ...station(distance) };
    }).filter(s => s.normal.y > .45 && clear({ x: s.at.x - 34, y: s.at.y - 47, w: 68, h: 60 }));
    const entrance = candidates.sort((a, b) => b.at.y - a.at.y)[0];
    if (entrance) gates.push({ ...entrance, id: `${seed}:main-gate`, span: 30, roadIds: [], main: true });
  }
  const surface = roadSurface(roads);
  const nominalHeight = 18;
  const thickness = 8;
  const nearGate = (distance: number, pad: number) => gates.some(g => circularDistance(g.distance, distance) < g.span / 2 + pad);
  const count = Math.min(1600, Math.ceil(perimeter / 8)), step = perimeter / count;
  for (let i = 0; i < count; i++) {
    const distance = (i + .5) * step;
    if (nearGate(distance, step / 2 + 3)) continue;
    const a = station(i * step).at, b = station((i + 1) * step).at, s = station(distance);
    let height = nominalHeight;
    if (!clear({ x: Math.min(a.x, b.x) - thickness / 2, y: Math.min(a.y, b.y) - height - thickness / 2,
      w: Math.abs(b.x - a.x) + thickness, h: Math.abs(b.y - a.y) + height + thickness })) height = 4;
    const wall = { id: `${seed}:wall:${i}`, a, b, normal: s.normal, height, thickness, merlon: i % 2 === 0 };
    if (surface.touches(Object.values(wallGeometry(wall)))) {
      wall.height = 4;
      if (surface.touches(Object.values(wallGeometry(wall)))) continue;
    }
    walls.push(wall);
  }
  const towerAt = (id: string, at: Point, kind: FortTower["kind"], radius: number, height: number, variant: number) => {
    const tower = { id, at, kind, radius, height, variant };
    const bounds = towerFootprint(tower);
    if (!clear(bounds) || towers.some(t => Math.hypot(t.at.x - at.x, t.at.y - at.y) < t.radius + radius + 14)) return;
    if (roads.some(r => r.geometry.points.slice(1).some((p, i) => distanceToSegment(at, r.geometry.points[i], p) < radius + 12))) return;
    if (!surface.touches([boxPolygon(bounds)])) towers.push(tower);
  };
  for (const gate of gates) for (const sign of [-1, 1]) {
    const s = station(gate.distance + sign * (gate.span / 2 + 10));
    towerAt(`${gate.id}:${sign}`, s.at, "square", 10, 28, .3);
  }
  const towerCount = Math.min(36, Math.max(3, Math.round(perimeter / 150)));
  for (let i = 0; i < towerCount; i++) {
    const rand = randomFor(`${seed}:tower:${i}`), distance = (i + .2 + rand() * .35) / towerCount * perimeter;
    if (nearGate(distance, 42)) continue;
    const variant = rand(), s = station(distance);
    const kind = (["round", "roofed", "square", "bastion"] as const)[i % 4];
    towerAt(`${seed}:tower:${i}`, s.at, kind, kind === "bastion" ? 15 : 10 + variant * 3,
      kind === "bastion" ? 22 : 27 + variant * 10, variant);
  }
  return { kind, reaches, sprites, walls, towers, gates: gates.map(({ distance: _, ...g }) => g) };
}
