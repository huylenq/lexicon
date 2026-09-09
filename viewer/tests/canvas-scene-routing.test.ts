import { describe, expect, test } from "bun:test";
import { createRelationshipRouter, routeRelationships, type SceneRelationship } from "../client/src/canvas/scene-routing";
import { routeRuns, segmentBlocked } from "../client/src/canvas/obstacle-routing";

import { clearRouteLabel, labelBox } from "../client/src/canvas/route-labels";

const source = { x: 0, y: 100, width: 120, height: 100 };
const target = { ...source, x: 700 };
const obstacle = { id: "block", x: 300, y: 60, width: 160, height: 200 };
const edges: SceneRelationship[] = ["a", "b", "c"].map((id, i) => ({ id, sourceId: "source", targetId: "target", source, target, lane: i - 1, labelWidth: 90 }));
function sharedLength(a: ReturnType<typeof routeRuns>, b: ReturnType<typeof routeRuns>) {
  let length = 0;
  for (const u of a) for (const v of b) {
    if (u.a.y === u.b.y && v.a.y === v.b.y && Math.abs(u.a.y - v.a.y) < 0.01)
      length += Math.max(0, Math.min(Math.max(u.a.x, u.b.x), Math.max(v.a.x, v.b.x)) - Math.max(Math.min(u.a.x, u.b.x), Math.min(v.a.x, v.b.x)));
    if (u.a.x === u.b.x && v.a.x === v.b.x && Math.abs(u.a.x - v.a.x) < 0.01)
      length += Math.max(0, Math.min(Math.max(u.a.y, u.b.y), Math.max(v.a.y, v.b.y)) - Math.max(Math.min(u.a.y, u.b.y), Math.min(v.a.y, v.b.y)));
  }
  return length;
}
describe("scene relationship lanes", () => {
  test("parallel detours have distinct ports and do not share long runs", () => {
    const routes = [...routeRelationships(edges, [obstacle]).values()];
    expect(new Set(routes.map(r => JSON.stringify(r.points[0]))).size).toBe(3);
    expect(new Set(routes.map(r => JSON.stringify(r.points.at(-1)))).size).toBe(3);
    for (const route of routes) for (const { a, b } of routeRuns(route.points)) {
      expect((a.x === b.x) !== (a.y === b.y)).toBe(true);
      expect(segmentBlocked(a, b, [source, target, obstacle])).toBe(false);
    }
    for (let i = 0; i < routes.length; i++) for (let j = 0; j < i; j++)
      expect(sharedLength(routeRuns(routes[i].points), routeRuns(routes[j].points))).toBeLessThan(1);
  });
  test("model ordering does not change routes, labels, or port order", () => {
    expect([...routeRelationships([...edges].reverse(), [obstacle])]).toEqual([...routeRelationships(edges, [obstacle])]);
  });
  test("opposing relationships arrive at distinct arrowheads", () => {
    const reversed = { ...edges[1], sourceId: "target", targetId: "source", source: target, target: source };
    const routes = [...routeRelationships([edges[0], reversed], [obstacle]).values()];
    expect(routes[0].points[0]).not.toEqual(routes[1].points.at(-1));
    expect(routes[0].points.at(-1)).not.toEqual(routes[1].points[0]);
    expect(sharedLength(routeRuns(routes[0].points), routeRuns(routes[1].points))).toBeLessThan(1);
  });
  test("different endpoint pairs sharing a corridor separate and restoring geometry restores lanes", () => {
    const scene = [edges[0], { ...edges[1], sourceId: "lower", source: { ...source, y: 300 } }];
    const original = [...routeRelationships(scene, [obstacle])];
    expect([...routeRelationships(scene, [{ ...obstacle, x: 360 }])]).toEqual(original);
    const moved = [...routeRelationships(scene, [{ ...obstacle, y: 20 }])];
    expect(moved).not.toEqual(original);
    expect([...routeRelationships(scene, [obstacle])]).toEqual(original);
    expect(sharedLength(routeRuns(original[0][1].points), routeRuns(original[1][1].points))).toBeLessThan(1);
  });
});

describe("label clearance and gesture routing", () => {
  test("a self-loop leaves room for its label beside its landmark", () => {
    const edge = { ...edges[0], targetId: "source", target: source, strokePadding: 19, spacing: 40 };
    const art = { id: "source:art", x: -20, y: 80, width: 160, height: 150 };
    const route = routeRelationships([edge], { paths: [], labels: [art] }).get(edge.id)!;
    const label = labelBox(route, edge.labelWidth);
    expect(label.x >= art.x + art.width || label.x + label.width <= art.x ||
      label.y >= art.y + art.height || label.y + label.height <= art.y).toBe(true);
  });
  test("label clearance includes the painted width of neighboring roads", () => {
    const points = [{ x: 0, y: 0 }, { x: 300, y: 0 }];
    const nearby = { a: { x: 0, y: 30 }, b: { x: 300, y: 30 } };
    expect(clearRouteLabel(points, 80, [], [nearby])).toBeDefined();
    expect(clearRouteLabel(points, 80, [], [{ ...nearby, padding: 19 }])).toBeUndefined();
  });
  test("labels avoid cards, other labels, and other relationship strokes", () => {
    const routed = routeRelationships(edges, [obstacle]);
    const entries = [...routed];
    for (const [id, route] of entries) {
      const box = labelBox(route, 90, 0);
      const overlaps = (other: typeof box) => box.x < other.x + other.width && box.x + box.width > other.x && box.y < other.y + other.height && box.y + box.height > other.y;
      expect([source, target, obstacle].some(overlaps)).toBe(false);
      for (const [otherId, other] of entries) {
        if (otherId === id) continue;
        expect(overlaps(labelBox(other, 90, 0))).toBe(false);
        expect(routeRuns(other.points).some(r => segmentBlocked(r.a, r.b, [box]))).toBe(false);
      }
    }
  });
  test("label search finds a free interval missed by midpoint and quarter samples", () => {
    const p = clearRouteLabel([{ x: 0, y: 0 }, { x: 1000, y: 0 }], 100,
      [{ x: 100, y: -30, width: 780, height: 60 }], []);
    expect(p).toBeDefined();
    expect(p!.x).toBeGreaterThanOrEqual(934);
  });
  test("a moving isolated obstacle reroutes only intersected edges and settling restores canonical geometry", () => {
    const router = createRelationshipRouter();
    const far = { ...edges[0], id: "far", sourceId: "f1", targetId: "f2", source: { ...source, y: 700 }, target: { ...target, y: 700 } };
    const scene = [...edges, far];
    const initial = router.route(scene, [obstacle]);
    router.route(scene, [{ ...obstacle, x: 350 }], true);
    expect(router.stats.reused).toBe(scene.length);
    const moved = router.route(scene, [{ ...obstacle, y: 20 }], true);
    expect(moved.get("far")).toBe(initial.get("far"));
    expect(router.stats.reused).toBeGreaterThanOrEqual(1);
    expect(router.stats.routed).toBeGreaterThan(0);
    expect(router.route(scene, [obstacle])).toEqual(routeRelationships(scene, [obstacle]));
  });
  test("moving endpoints invalidates the route while a remote route retains its label", () => {
    const router = createRelationshipRouter();
    const far = { ...edges[0], id: "far", sourceId: "f1", targetId: "f2", source: { ...source, y: 700 }, target: { ...target, y: 700 } };
    const initial = router.route([edges[0], far], [obstacle]);
    const moved = router.route([{ ...edges[0], source: { ...source, x: -30 } }, far], [obstacle], true);
    expect(moved.get("far")).toBe(initial.get("far"));
    expect(moved.get("a")!.points[0].x).toBe(source.x + source.width - 30);
    expect(router.stats).toEqual({ reused: 1, routed: 1 });
  });
});

test("a short dogleg moves its bend to fit a long label without covering an arrow approach", () => {
  const edge = { ...edges[0], lane: 0, labelWidth: 130, target: { ...target, x: 330, y: 110 } };
  const route = routeRelationships([edge], []).get(edge.id)!;
  expect(clearRouteLabel(route.points, edge.labelWidth, [source, edge.target], [], route)).toEqual({ x: route.x, y: route.y });
  const label = labelBox(route, edge.labelWidth, 0);
  expect(label.x).toBeGreaterThan(source.x + source.width + 24);
  expect(label.x + label.width).toBeLessThan(edge.target.x - 24);
});
