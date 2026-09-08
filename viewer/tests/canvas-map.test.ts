import { describe, expect, test } from "bun:test";
import { distanceToSegment, dockRoad, generateMap, inside, landmarkFor, landmarkPlacement, roadGeometry, type MapNode, type MapRoad } from "../client/src/canvas/terrain/generate";
import { relationshipRoute } from "../client/src/canvas/routes";

const context: MapNode = { id: "ordering", kind: "context", bounds: { x: 100, y: 200, w: 500, h: 450 },
  origin: { x: 100, y: 200 }, label: { x: 100, y: 200, w: 500, h: 44 },
  boundary: [{ x: 100, y: 220 }, { x: 140, y: 200 }, { x: 570, y: 215 }, { x: 610, y: 280 },
    { x: 590, y: 590 }, { x: 540, y: 650 }, { x: 140, y: 635 }, { x: 95, y: 570 }] };
const order: MapNode = { id: "order", kind: "concept", classification: "aggregate", bounds: { x: 150, y: 280, w: 190, h: 70 } };
const nodes = [context, order];
function translate(node: MapNode, x: number, y: number): MapNode {
  const bounds = { ...node.bounds, x: node.bounds.x + x, y: node.bounds.y + y };
  return node.kind === "concept" ? { ...node, bounds } : { ...node, bounds,
    origin: { x: node.origin.x + x, y: node.origin.y + y },
    label: { ...node.label, x: node.label.x + x, y: node.label.y + y },
    boundary: node.boundary.map(p => ({ x: p.x + x, y: p.y + y })) };
}
describe("procedural map constraints", () => {
  test("node identity, not iteration order or neighbor count, determines the landmark", () => {
    const initial = generateMap("shop", nodes, []);
    const extra: MapNode = { ...translate(context, 1900, 0), id: "distant" };
    const next = generateMap("shop", [extra, order, context], []);
    expect(next.landmarks).toEqual(initial.landmarks);
    expect(next.districts.find(d => d.id === "ordering")).toEqual(initial.districts[0]);
    expect(generateMap("shop", [...nodes].reverse(), [])).toEqual(initial);
    expect(landmarkFor({ classification: "service" })).toBe("workshop");
    expect(landmarkFor({ classification: "service", landmark: "archive" })).toBe("archive");
    expect(landmarkFor({ landmark: "invalid" })).toBe("house");
  });

  test("moving a concept moves its landmark and only changes scenery near its footprint", () => {
    const before = generateMap("shop", nodes, []);
    const moved = { ...order, bounds: { ...order.bounds, x: order.bounds.x + 220 } };
    const after = generateMap("shop", [context, moved], []);
    expect(after.landmarks[0].bounds).toEqual(moved.bounds);
    expect(after.landmarks[0].variant).toBe(before.landmarks[0].variant);
    expect(after.districts[0].boundary).toEqual(before.districts[0].boundary);
    const original = new Map(before.districts[0].ornaments.map(o => [o.id, o]));
    for (const ornament of after.districts[0].ornaments) {
      if (original.has(ornament.id)) expect(ornament).toEqual(original.get(ornament.id)!);
      expect(inside(ornament, moved.bounds, ornament.radius + 8)).toBe(false);
    }
    expect(order.bounds.x).toBe(150);
  });

  test("context translation carries its geography and children without changing their appearance", () => {
    const before = generateMap("shop", nodes, []);
    const moved = nodes.map(n => translate(n, 37, -19));
    const after = generateMap("shop", moved, []);
    expect(after.districts[0].ornaments.map(o => ({ ...o, x: o.x - 37, y: o.y + 19 }))).toEqual(before.districts[0].ornaments);
    expect(after.landmarks[0].variant).toBe(before.landmarks[0].variant);
  });

  test("scenery clears freeform obstacles and long roads passing through a district", () => {
    const road: MapRoad = { id: "crossing", points: [{ x: -1000, y: 400 }, { x: 2000, y: 400 }], kind: "road" };
    const note = { x: 350, y: 470, w: 150, h: 90 };
    const map = generateMap("shop", nodes, [road], [note]);
    expect(map.districts[0].ornaments.length).toBeGreaterThan(5);
    for (const ornament of map.districts[0].ornaments) {
      expect(inside(ornament, note, ornament.radius + 8)).toBe(false);
      const track = map.roads[0].geometry.points;
      expect(Math.min(...track.slice(1).map((p, i) => distanceToSegment(ornament, track[i], p)))).toBeGreaterThanOrEqual(ornament.radius + 18);
    }
    expect(map.roads[0].points).toEqual(road.points);
  });

  test("roads keep their endpoints and identity while bending within the source route corridor", () => {
    const points = [{ x: 10, y: 10 }, { x: 170, y: 10 }, { x: 170, y: 180 }, { x: 320, y: 180 }];
    const road = roadGeometry("shop:contains", points, "road");
    expect(road.points[0]).toEqual(points[0]);
    expect(road.points.at(-1)).toEqual(points.at(-1));
    expect(roadGeometry("shop:contains", points, "road")).toEqual(road);
    expect(roadGeometry("shop:validates", points, "road").outline).not.toEqual(road.outline);
    const deviations = road.points.map(p => Math.min(...points.slice(1).map((end, i) => distanceToSegment(p, points[i], end))));
    expect(Math.max(...deviations)).toBeGreaterThan(4);
    expect(Math.max(...deviations)).toBeLessThan(30);
    const moved = roadGeometry("shop:contains", points.map(p => ({ x: p.x + 75, y: p.y - 23 })), "road");
    for (let i = 0; i < road.outline.length; i++) {
      expect(moved.outline[i].x - 75).toBeCloseTo(road.outline[i].x, 8);
      expect(moved.outline[i].y + 23).toBeCloseTo(road.outline[i].y, 8);
    }
    expect(points).toEqual([{ x: 10, y: 10 }, { x: 170, y: 10 }, { x: 170, y: 180 }, { x: 320, y: 180 }]);
  });

  test("short, repeated, and self-loop routes have finite banks, with narrower trails", () => {
    for (const points of [
      [{ x: 0, y: 0 }, { x: 0, y: 0 }],
      [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 90 }, { x: 0, y: 90 }],
    ]) {
      const road = roadGeometry("loop", points, "road");
      expect(road.outline.length).toBeGreaterThanOrEqual(4);
      expect(road.outline.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    }
    const points = [{ x: 0, y: 0 }, { x: 0, y: 160 }];
    const road = roadGeometry("same", points, "road"), trail = roadGeometry("same", points, "trail");
    const width = (r: typeof road) => Math.hypot(r.banks[0][3].x - r.banks[1][3].x, r.banks[0][3].y - r.banks[1][3].y);
    expect(width(trail)).toBeLessThan(width(road));
  });

  test("roads reach every landmark's body and taper into its entrance, including south approaches", () => {
    for (const kind of ["garden", "house", "hall", "archive", "tower", "workshop"] as const) {
      for (const target of [{ x: 330, y: 0 }, { x: -330, y: 0 }, { x: 330, y: 170 }, { x: -330, y: 170 }, { x: 0, y: 260 }, { x: 0, y: -260 }]) {
        const source = { x: 0, y: 0, w: 150, h: 92 }, destination = { ...source, ...target };
        const a = landmarkPlacement(source, kind), b = landmarkPlacement(destination, kind);
        const route = relationshipRoute({ ...source, width: source.w, height: source.h }, { ...destination, width: destination.w, height: destination.h });
        const fitted = dockRoad(route.points, a, b);
        for (let i = 1; i < fitted.length - 1; i++) {
          const p = fitted[i - 1], q = fitted[i], r = fitted[i + 1];
          expect(Math.abs((q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x))).toBeGreaterThan(.0001);
        }
        const road = roadGeometry("docked", fitted, "road", [true, true]);
        expect(inside(road.points[0], a.body)).toBe(true);
        expect(inside(road.points.at(-1)!, b.body)).toBe(true);
        for (const index of [0, road.points.length - 1])
          expect(Math.hypot(road.banks[0][index].x - road.banks[1][index].x, road.banks[0][index].y - road.banks[1][index].y)).toBeLessThan(10);
        for (const landmark of [a, b]) {
          const label = { x: landmark.bounds.x, y: landmark.bounds.y + landmark.bounds.h - 23, w: landmark.bounds.w, h: 23 };
          expect(road.points.some(p => inside(p, label))).toBe(false);
        }
      }
    }
  });

  test("self relationships keep a visible loop with distinct entrances", () => {
    for (const kind of ["garden", "house", "hall", "archive", "tower", "workshop"] as const) {
      const bounds = { x: 40, y: 60, w: 150, h: 92 }, box = { ...bounds, width: bounds.w, height: bounds.h };
      const building = landmarkPlacement(bounds, kind);
      const points = dockRoad(relationshipRoute(box, box, 0, true).points, building, building, true);
      const road = roadGeometry("self", points, "road", [true, true]);
      expect(road.points[0]).not.toEqual(road.points.at(-1));
      expect(inside(road.points[0], building.body)).toBe(true);
      expect(inside(road.points.at(-1)!, building.body)).toBe(true);
      expect(Math.max(...road.points.map(p => p.x))).toBeGreaterThan(bounds.x + bounds.w + 50);
      expect(Math.max(...road.points.map(p => p.y)) - Math.min(...road.points.map(p => p.y))).toBeGreaterThan(50);
    }
  });

  test("water crossings get bridges only where a real visible route intersects the island", () => {
    const road: MapRoad = { id: "delivery", points: [{ x: 0, y: 430 }, { x: 750, y: 430 }], kind: "road" };
    const island = { ...context, terrain: "island" };
    expect(generateMap("shop", [island], [road]).bridges).toHaveLength(2);
    expect(generateMap("shop", [context], [road]).bridges).toHaveLength(0);
    expect(generateMap("shop", [island], [{ ...road, kind: "none" }]).bridges).toHaveLength(0);
    expect(generateMap("shop", [], []).districts).toEqual([]);
    expect(generateMap("shop", [{ ...context, bounds: { ...context.bounds, x: NaN } }], []).districts).toEqual([]);
  });
});
