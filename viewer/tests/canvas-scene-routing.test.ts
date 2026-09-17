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
  test("ports use interior slots on every side and follow neighboring node order", () => {
    const box = { x: 300, y: 300, width: 300, height: 120 };
    for (const side of ["top", "bottom", "left", "right"]) for (const count of [1, 2, 3, 4]) {
      const vertical = side === "left" || side === "right";
      const scene: SceneRelationship[] = Array.from({ length: count }, (_, i) => ({
        id: `edge-${count - i}`, sourceId: `neighbor-${i}`, targetId: "card",
        source: vertical
          ? { x: side === "left" ? -300 : 900, y: 300 + i * 10, width: 60, height: 60 }
          : { x: 300 + i * 10, y: side === "top" ? -300 : 900, width: 60, height: 60 },
        target: box, lane: 0, labelWidth: 0,
      }));
      const routes = routeRelationships(scene, []);
      scene.forEach((edge, i) => {
        const point = routes.get(edge.id)!.points.at(-1)!;
        expect(vertical ? point.y : point.x).toBeCloseTo(
          (vertical ? box.y : box.x) + (vertical ? box.height : box.width) * (i + 1) / (count + 1),
        );
        expect(vertical ? point.x : point.y).toBe(
          side === "left" ? box.x : side === "right" ? box.x + box.width : side === "top" ? box.y : box.y + box.height,
        );
      });
    }
  });
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


describe("drag previews", () => {
  test("endpoint previews leave the settled cache untouched and retain remote routes", () => {
    const router = createRelationshipRouter();
    const far = { ...edges[0], id: "far", sourceId: "f1", targetId: "f2",
      source: { ...source, y: 700 }, target: { ...target, y: 700 } };
    const scene = [edges[0], far];
    const initial = router.route(scene, [obstacle]);
    const stats = { ...router.stats };
    for (let x = 1; x <= 100; x++) {
      const moved = [{ ...edges[0], source: { ...source, x: -x } }, far];
      const preview = router.preview(moved);
      expect(preview.get("far")).toBe(initial.get("far"));
      expect(preview.get("a")!.points[0].x).toBe(initial.get("a")!.points[0].x - x);
      expect(preview.get("a")!.points.at(-1)).toEqual(initial.get("a")!.points.at(-1));
    }
    expect(router.stats).toEqual(stats);
    expect(router.preview(scene).get("a")).toBe(initial.get("a"));
    const moved = [{ ...edges[0], source: { ...source, x: -100 } }, far];
    const settled = router.route(moved, [obstacle], true);
    expect(router.stats).toEqual({ reused: 1, routed: 1 });
    expect(settled.get("far")).toBe(initial.get("far"));
    router.route(moved, [obstacle], true);
    expect(router.stats).toEqual({ reused: 2, routed: 0 });
  });

  test("previews translate self loops and resize ports without drift", () => {
    const router = createRelationshipRouter();
    const loop = { ...edges[0], targetId: "source", target: source };
    const initial = router.route([loop], []).get(loop.id)!;
    const translated = { ...source, x: source.x + 50, y: source.y + 30 };
    const preview = router.preview([{ ...loop, source: translated, target: translated }]).get(loop.id)!;
    expect(preview.points).toEqual(initial.points.map(p => ({ x: p.x + 50, y: p.y + 30 })));
    expect(preview.x).toBeCloseTo(initial.x + 50);
    expect(preview.y).toBeCloseTo(initial.y + 30);
    const resized = { ...source, width: source.width * 2, height: source.height * 2 };
    const next = router.preview([{ ...loop, source: resized, target: resized }]).get(loop.id)!;
    for (const i of [0, next.points.length - 1]) {
      expect(next.points[i]).toEqual({ x: source.x + (initial.points[i].x - source.x) * 2,
        y: source.y + (initial.points[i].y - source.y) * 2 });
    }
  });

  test("moving one neighbor freezes other ports and keeps incident previews orthogonal", () => {
    const router = createRelationshipRouter();
    const other = { ...edges[1], sourceId: "neighbor", source: { ...source, y: 300 } };
    const scene = [edges[0], other];
    const initial = router.route(scene, [obstacle]);
    for (const position of [{ x: 850, y: 100 }, { x: 700, y: -300 }, { x: 700, y: 500 }]) {
      const moved = [{ ...edges[0], source: { ...source, ...position } }, other];
      const preview = router.preview(moved);
      expect(preview.get(other.id)).toBe(initial.get(other.id));
      const route = preview.get(edges[0].id)!;
      expect(route.points.at(-1)).toEqual(initial.get(edges[0].id)!.points.at(-1));
      for (const { a, b } of routeRuns(route.points)) expect(a.x === b.x || a.y === b.y).toBe(true);
    }
  });

  test("an isolated moving obstacle is deferred until settlement", () => {
    const router = createRelationshipRouter();
    const initial = router.route(edges, [obstacle]);
    expect(router.preview(edges)).toEqual(initial);
    const moved = { ...obstacle, y: 20 };
    const settled = router.route(edges, [moved], true);
    expect(router.stats.routed).toBeGreaterThan(0);
    for (const route of settled.values()) for (const run of routeRuns(route.points))
      expect(segmentBlocked(run.a, run.b, [moved])).toBe(false);
  });
});
