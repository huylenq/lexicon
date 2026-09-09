import { describe, expect, test } from "bun:test";
import { segmentBlocked } from "../client/src/canvas/obstacle-routing";
import { relationshipRoute } from "../client/src/canvas/routes";

const source = { x: 100, y: 100, width: 190, height: 70 };
describe("orthogonal relationship routes", () => {
  for (const [name, x, y] of [
    ["below", 100, 350], ["above", 100, -150],
    ["right", 450, 100], ["left", -250, 100],
    ["diagonal", 450, 350], ["overlapping", 120, 120],
  ] as const) {
    test(`${name}: axis-aligned segments, boundary ports, and label on route`, () => {
      const target = { ...source, x, y };
      const route = relationshipRoute(source, target);
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1], b = route.points[i];
        expect((a.x === b.x) !== (a.y === b.y)).toBe(true);
      }
      const onBoundary = (p: { x: number; y: number }, box: typeof source) =>
        p.x >= box.x && p.x <= box.x + box.width &&
        p.y >= box.y && p.y <= box.y + box.height &&
        (p.x === box.x || p.x === box.x + box.width || p.y === box.y || p.y === box.y + box.height);
      expect(onBoundary(route.points[0], source)).toBe(true);
      expect(onBoundary(route.points.at(-1)!, target)).toBe(true);
      expect(route.points.some((b, i) => {
        if (!i) return false;
        const a = route.points[i - 1];
        return route.x >= Math.min(a.x, b.x) && route.x <= Math.max(a.x, b.x) &&
          route.y >= Math.min(a.y, b.y) && route.y <= Math.max(a.y, b.y);
      })).toBe(true);
    });
  }
  test("parallel routes and self-loops have distinct lanes", () => {
    for (const self of [false, true]) {
      const target = self ? source : { ...source, y: 350 };
      const routes = [-1, 0, 1].map((lane) => relationshipRoute(source, target, lane, self));
      expect(new Set(routes.map((route) => JSON.stringify(route.points))).size).toBe(3);
      if (self) for (const route of routes) {
        expect(route.x).toBeGreaterThan(source.x + source.width);
        expect(route.points[0].y).not.toBe(route.points.at(-1)!.y);
      }
    }
  });
});

describe("obstacle routing", () => {
  const a = { x: 0, y: 100, width: 100, height: 60 };
  const b = { ...a, x: 600 };
  const obstacle = { x: 250, y: 50, width: 180, height: 180 };
  test("detours around intervening cards with clear labels and stable boundary ports", () => {
    const route = relationshipRoute(a, b, 0, false, [obstacle], 120);
    const baseline = relationshipRoute(a, b);
    expect(route.points[0]).toEqual(baseline.points[0]);
    expect(route.points.at(-1)).toEqual(baseline.points.at(-1));
    expect(route.points).not.toEqual(baseline.points);
    for (let i = 1; i < route.points.length; i++) {
      const p = route.points[i - 1], q = route.points[i];
      expect((p.x === q.x) !== (p.y === q.y)).toBe(true);
      expect(segmentBlocked(p, q, [obstacle, a, b])).toBe(false);
    }
    expect(route.y + 15 <= obstacle.y || route.y - 15 >= obstacle.y + obstacle.height || route.x + 60 <= obstacle.x || route.x - 60 >= obstacle.x + obstacle.width).toBe(true);
    expect(relationshipRoute(a, b, 0, false, [obstacle], 120)).toEqual(route);
  });
  test("an unrelated card entering and leaving the corridor changes and restores the route", () => {
    const clear = relationshipRoute(a, b, 0, false, [{ ...obstacle, y: 500 }]);
    const blocked = relationshipRoute(a, b, 0, false, [obstacle]);
    expect(blocked.points).not.toEqual(clear.points);
    expect(relationshipRoute(a, b, 0, false, []).points).toEqual(clear.points);
  });
  test("self loops avoid obstacles and impossible overlapping endpoints remain finite", () => {
    const block = { x: 150, y: 80, width: 100, height: 100 };
    const loop = relationshipRoute(a, a, 0, true, [block]);
    for (let i = 1; i < loop.points.length; i++) expect(segmentBlocked(loop.points[i - 1], loop.points[i], [block, a])).toBe(false);
    const route = relationshipRoute(a, b, 0, false, [{ ...a, x: 50 }]);
    expect(route.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});
