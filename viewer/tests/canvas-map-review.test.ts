import { expect, test } from "bun:test";
import polygonClipping, { type Polygon } from "polygon-clipping";
import { boundaryStructureFor, createMapGenerator, generateMap, roadGeometry, type MapNode, type MapRoad } from "../client/src/canvas/terrain/generate";
import { towerFootprint, towerSpriteBounds, wallGeometry } from "../client/src/canvas/terrain/fortGeometry";
import { boxPolygon, indexRoads } from "../client/src/canvas/terrain/roadIndex";
import type { Point } from "../shared/canvas-geometry";

const rectangle = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
const asPolygon = (points: Point[]): Polygon => [points.map(p => [p.x, p.y])];
const area = (points: number[][]) => Math.abs(points.reduce((sum, p, i) => {
  const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1];
}, 0)) / 2;

// Use a polygon-clipping oracle, independent of the production clearance test.
test("projected towers and every wall surface clear parallel, crossing and outside roads", () => {
  for (const points of [
    [{ x: -100, y: 170 }, { x: 600, y: 170 }],
    [{ x: -100, y: 270 }, { x: 600, y: 270 }],
    [{ x: -100, y: 285 }, { x: 600, y: 285 }],
    [{ x: -100, y: 310 }, { x: 600, y: 310 }],
    [{ x: 390, y: -100 }, { x: 350, y: 400 }],
  ]) {
    const road = { id: "through", points, kind: "road" as const, geometry: roadGeometry("through", points, "road") };
    const edge = boundaryStructureFor("city", rectangle, "village", [road], []);
    expect(edge.walls.length).toBeGreaterThan(30);
    const surfaces = [...edge.walls.flatMap(w => Object.values(wallGeometry(w))),
      ...edge.towers.flatMap(t => [boxPolygon(towerSpriteBounds(t)), boxPolygon(towerFootprint(t))])];
    for (const surface of surfaces) {
      if (surface.length < 3 || area(surface.map(p => [p.x, p.y])) < 1e-8) continue;
      const overlap = polygonClipping.intersection(asPolygon(surface), asPolygon(road.geometry.outline));
      expect(overlap.reduce((sum, p) => sum + area(p[0]), 0)).toBeLessThan(1e-7);
    }
  }
});

function context(id: string, x: number): MapNode {
  return { id, kind: "context", bounds: { x, y: 0, w: 400, h: 300 }, origin: { x, y: 0 },
    boundary: rectangle.map(p => ({ ...p, x: p.x + x })), label: { x: x + 30, y: 20, w: 100, h: 30 }, terrain: "woodland" };
}
const concept = (x: number): MapNode => ({ id: "concept", kind: "concept", bounds: { x, y: 100, w: 60, h: 40 } });

test("district cache reuses distant artwork and invalidates neighboring clearance, roads, terrain and model", () => {
  const generate = createMapGenerator();
  const a = context("a", 0), neighbor = context("neighbor", 460), far = context("far", 1600);
  const input = [a, neighbor, far, concept(330)];
  const first = generate("seed", input, []);
  const same = generate("seed", structuredClone(input), []);
  same.districts.forEach((d, i) => expect(d).toBe(first.districts[i]));
  const movedInput = [a, neighbor, far, concept(360)];
  const moved = generate("seed", movedInput, []);
  expect(moved).toEqual(generateMap("seed", movedInput, []));
  for (const d of moved.districts) {
    const previous = first.districts.find(p => p.id === d.id)!;
    if (d.id === "far") expect(d).toBe(previous); else expect(d).not.toBe(previous);
  }
  const road: MapRoad = { id: "local", kind: "road", points: [{ x: -20, y: 230 }, { x: 300, y: 230 }] };
  const withRoad = generate("seed", movedInput, [road]);
  expect(withRoad).toEqual(generateMap("seed", movedInput, [road]));
  expect(withRoad.districts.find(d => d.id === "far")).toBe(moved.districts.find(d => d.id === "far"));
  const sameRoad = generate("seed", structuredClone(movedInput), structuredClone([road]));
  expect(sameRoad.roads[0]).toBe(withRoad.roads[0]);
  const changed = [context("a", 0), neighbor, far, concept(360)];
  if (changed[0].kind === "context") changed[0].terrain = "village";
  expect(generate("seed", changed, [road])).toEqual(generateMap("seed", changed, [road]));
  const note = [{ x: 510, y: 180, w: 100, h: 70 }];
  expect(generate("seed", changed, [road], note)).toEqual(generateMap("seed", changed, [road], note));
  expect(generate("other-model", input, [])).toEqual(generateMap("other-model", input, []));
  expect(generate("seed", [], []).districts).toHaveLength(0);
  expect(generate("seed", input, [])).toEqual(first);
});

test("local road selection includes long segments with distant endpoints and near-envelope banks", () => {
  const roads = [
    { id: "cross", points: [{ x: -10000, y: 150 }, { x: 10000, y: 150 }] },
    { id: "near", points: [{ x: -10, y: -20 }, { x: 410, y: -20 }] },
    { id: "far", points: [{ x: 4000, y: 3000 }, { x: 4500, y: 3300 }] },
  ].map(r => ({ ...r, kind: "road" as const, geometry: roadGeometry(r.id, r.points, "road") }));
  expect(indexRoads(roads).near({ x: 0, y: 0, w: 400, h: 300 }).map(r => r.id)).toEqual(["cross", "near"]);
});
