import { describe, expect, test } from "bun:test";
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
