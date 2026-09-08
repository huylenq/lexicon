import { describe, expect, test } from "bun:test";
import { distanceToSegment, dockRoad, boundaryStructureFor, generateMap, inside, landmarkFor, landmarkPlacement, roadGeometry, type MapNode, type MapRoad } from "../client/src/canvas/terrain/generate";
import { pointInPolygon } from "../client/src/canvas/territory";
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

describe("classic landscape", () => {
  test("large and small features clear labels, buildings, notes, and road corridors", () => {
    const road: MapRoad = { id: "crossing", points: [{ x: -300, y: 430 }, { x: 1000, y: 430 }], kind: "road" };
    const note = { x: 380, y: 260, w: 100, h: 130 };
    const scene = generateMap("landscape", nodes, [road], [note]);
    const district = scene.districts[0];
    expect(district.landscape.some(f => f.large)).toBe(true);
    expect(new Set(district.landscape.map(f => f.kind)).size).toBeGreaterThan(5);
    expect(new Set(district.ground.map(p => p.kind)).size).toBeGreaterThan(2);
    for (const feature of district.landscape) {
      const b = feature.bounds, center = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      for (const obstacle of [context.label, order.bounds, note])
        expect(b.x + b.w + 8 <= obstacle.x || b.x - 8 >= obstacle.x + obstacle.w || b.y + b.h + 8 <= obstacle.y || b.y - 8 >= obstacle.y + obstacle.h).toBe(true);
      const points = scene.roads[0].geometry.points;
      const distance = Math.min(...points.slice(1).map((p, i) => distanceToSegment(center, points[i], p)));
      expect(distance).toBeGreaterThanOrEqual(Math.hypot(b.w, b.h) / 2 + 18);
    }
  });

  test("habitats follow context translation and terrain choices while islands contain the entire artwork", () => {
    const scene = generateMap("landscape", nodes, []);
    const translated = generateMap("landscape", nodes.map(n => translate(n, 37, -19)), []);
    const before = scene.districts[0].landscape, after = translated.districts[0].landscape;
    expect(after.map(f => [f.id, f.kind, f.variant])).toEqual(before.map(f => [f.id, f.kind, f.variant]));
    for (let i = 0; i < before.length; i++) {
      expect(after[i].bounds.x - 37).toBeCloseTo(before[i].bounds.x, 8);
      expect(after[i].bounds.y + 19).toBeCloseTo(before[i].bounds.y, 8);
    }
    const highlands = generateMap("landscape", [{ ...context, terrain: "highlands" }, order], []).districts[0];
    expect(highlands.landscape.some(f => f.kind === "mountain")).toBe(true);
    expect(highlands.landscape.some(f => f.kind === "pond" || f.kind === "spring")).toBe(false);
    const wetland = generateMap("landscape", [{ ...context, terrain: "wetland" }, order], []).districts[0];
    expect(wetland.landscape.some(f => f.kind === "spring")).toBe(true);
    expect(wetland.landscape.some(f => f.kind === "mountain")).toBe(false);
    const island = generateMap("landscape", [{ ...context, terrain: "island" }, order], []).districts[0];
    for (const f of island.landscape) {
      const b = f.bounds;
      for (const p of [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x, y: b.y + b.h }, { x: b.x + b.w, y: b.y + b.h }])
        expect(pointInPolygon(p, island.boundary)).toBe(true);
    }
  });
});


describe("fortification structure", () => {
  const boundary = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
  test("road crossings open the wall and towers leave the approach clear", () => {
    const road: MapRoad = { id: "through", points: [{ x: -100, y: 170 }, { x: 600, y: 170 }], kind: "road" };
    const roads = [{ ...road, geometry: roadGeometry("through", road.points, "road") }];
    const fort = boundaryStructureFor("city", boundary, "village", roads, []);
    expect(fort.gates.length).toBe(2);
    expect(fort.walls.length).toBeGreaterThan(100);
    for (const gate of fort.gates) {
      expect(gate.roadIds).toEqual(["through"]);
      expect(gate.main).toBe(false);
      const path = roads[0].geometry.points;
      expect(Math.min(...path.slice(1).map((p, i) => distanceToSegment(gate.at, path[i], p)))).toBeLessThan(.0001);
      for (const wall of fort.walls)
        expect(distanceToSegment(gate.at, wall.a, wall.b)).toBeGreaterThan(gate.span / 2 - 1);
    }
    for (const tower of fort.towers) {
      const path = roads[0].geometry.points;
      expect(Math.min(...path.slice(1).map((p, i) => distanceToSegment(tower.at, path[i], p)))).toBeGreaterThanOrEqual(tower.radius + 12);
    }
    const departing: MapRoad = { id: "departure", points: [{ x: 0, y: 80 }, { x: -120, y: 80 }], kind: "road" };
    const departure = boundaryStructureFor("city", boundary, "village", [{ ...departing, geometry: roadGeometry("departure", departing.points, "road") }], []);
    expect(departure.gates).toHaveLength(1);
    expect(departure.gates[0].main).toBe(false);
    expect(departure.gates[0].roadIds).toEqual(["departure"]);
    expect(departure.gates[0].span).toBeLessThan(30);
  });
  test("an isolated context has a main gate, varied towers, and stable architecture under translation", () => {
    const fort = boundaryStructureFor("city", boundary, "village", [], []);
    expect(fort.gates.filter(g => g.main).length).toBe(1);
    expect(new Set(fort.towers.map(t => t.kind)).size).toBe(4);
    const moved = boundaryStructureFor("city", boundary.map(p => ({ x: p.x + 73, y: p.y - 39 })), "village", [], []);
    expect(moved.towers.map(t => [t.id, t.kind, t.radius, t.height])).toEqual(fort.towers.map(t => [t.id, t.kind, t.radius, t.height]));
    fort.towers.forEach((t, i) => {
      expect(moved.towers[i].at.x - 73).toBeCloseTo(t.at.x, 8);
      expect(moved.towers[i].at.y + 39).toBeCloseTo(t.at.y, 8);
    });
    const blocked = boundaryStructureFor("city", boundary, "village", [], [{ x: -30, y: -60, w: 460, h: 115 }]);
    expect(blocked.towers.every(t => t.at.y - t.height - 16 > 55)).toBe(true);
  });
});


test("terrain selects natural boundary structure and preserves crossing clearance", () => {
  const boundary = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
  const points = [{ x: -100, y: 170 }, { x: 600, y: 170 }];
  const road = { id: "cross", kind: "road" as const, points, geometry: roadGeometry("cross", points, "road") };
  for (const terrain of ["woodland", "highlands", "island", "wetland"] as const) {
    const edge = boundaryStructureFor("natural", boundary, terrain, [road], []);
    expect(edge.walls).toHaveLength(0);
    expect(edge.towers).toHaveLength(0);
    expect(edge.reaches.length).toBeGreaterThan(10);
    expect(edge.gates.every(g => !g.main)).toBe(true);
    expect(edge.sprites.length).toBeGreaterThan(10);
    for (const { bounds: b } of edge.sprites) {
      const center = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      expect(Math.min(...road.geometry.points.slice(1).map((q, i) => distanceToSegment(center, road.geometry.points[i], q))))
        .toBeGreaterThanOrEqual(Math.hypot(b.w, b.h) / 2 + 12);
    }
    const obstacle = { x: -60, y: -70, w: 520, h: 100 };
    const blocked = boundaryStructureFor("natural", boundary, terrain, [], [obstacle]);
    expect(blocked.sprites.every(({ bounds: b }) => b.y >= 34)).toBe(true);
    for (const r of edge.reaches) for (const p of r.points)
      expect(Math.min(...road.geometry.points.slice(1).map((q, i) => distanceToSegment(p, road.geometry.points[i], q)))).toBeGreaterThanOrEqual(26);
    const moved = boundaryStructureFor("natural", boundary.map(p => ({ x: p.x + 70, y: p.y - 40 })), terrain, [], []);
    const original = boundaryStructureFor("natural", boundary, terrain, [], []);
    expect(moved.reaches.map(r => [r.id, r.depth, r.variant])).toEqual(original.reaches.map(r => [r.id, r.depth, r.variant]));
    expect(moved.sprites.map(s => [s.id, s.crop, s.mirror, s.bounds.w, s.bounds.h])).toEqual(original.sprites.map(s => [s.id, s.crop, s.mirror, s.bounds.w, s.bounds.h]));
    moved.sprites.forEach((s, i) => {
      expect(s.bounds.x - 70).toBeCloseTo(original.sprites[i].bounds.x, 8);
      expect(s.bounds.y + 40).toBeCloseTo(original.sprites[i].bounds.y, 8);
    });
    moved.reaches.forEach((r, i) => r.points.forEach((p, j) => {
      expect(p.x - 70).toBeCloseTo(original.reaches[i].points[j].x, 8);
      expect(p.y + 40).toBeCloseTo(original.reaches[i].points[j].y, 8);
    }));
  }
});
