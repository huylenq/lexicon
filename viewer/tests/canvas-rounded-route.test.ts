import { expect, test } from "bun:test";
import { roundedRoute, cornerRadius, connectionDrawing, edgeCornerRadius, setEdgeCornerRadius } from "../client/src/canvas/rounded-route";
import { relationshipRoute } from "../client/src/canvas/routes";
import type { ConnectionShape } from "../shared/canvas-schema";

test("rounding retains endpoints and clamps neighboring bends on short segments", () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 10 }, { x: 200, y: 10 }];
  const original = structuredClone(points);
  const route = roundedRoute(points, 24);
  expect(route.path).toContain("L 95 0 Q 100 0 100 5");
  expect(route.path).toContain("Q 100 10 105 10");
  expect(route.points[0]).toEqual(points[0]);
  expect(route.points.at(-1)).toEqual(points.at(-1));
  expect(points).toEqual(original);
  expect(roundedRoute(points, 0).path).not.toContain("Q");
  expect(cornerRadius(Infinity)).toBe(0);
  expect(cornerRadius(-1)).toBe(0);
  expect(cornerRadius(500)).toBe(128);
});

test("straight, duplicate, and reversed segments remain finite; mappings keep their curves", () => {
  const points = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }];
  expect(roundedRoute(points, 24).path).not.toMatch(/Q|NaN|Infinity/);
  const shape = { props: { path: "M 0 0 Q 50 30 100 0", points }, meta: { lexiconCornerRadius: 24 } } as unknown as ConnectionShape;
  expect(connectionDrawing(shape)).toEqual({ path: shape.props.path, points });
});

test("maximum rounding clears routed obstacles and self-loop endpoints", () => {
  const a = { x: 0, y: 100, width: 120, height: 100 }, b = { ...a, x: 700 };
  const obstacle = { x: 300, y: 60, width: 160, height: 200 };
  for (const [source, target] of [[a, b], [b, a], [a, a]]) {
    const route = roundedRoute(relationshipRoute(source, target, 0, source === target, [obstacle]).points, 128);
    expect(route.path).toContain("Q");
    for (const p of route.points) for (const box of [source, target, obstacle])
      expect(p.x > box.x && p.x < box.x + box.width && p.y > box.y && p.y < box.y + box.height).toBe(false);
  }
});

test("rounding preserves label clearance in every bend orientation", () => {
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const points = [{ x: 96, y: 220 }, { x: 96, y: 96 }, { x: 300, y: 96 }]
      .map(p => ({ x: sx * p.x, y: sy * p.y }));
    const box = { x: sx === 1 ? 96 : -204, y: sy === 1 ? 96 : -134, width: 108, height: 38 };
    const inside = (p: { x: number; y: number }) => p.x > box.x && p.x < box.x + box.width
      && p.y > box.y && p.y < box.y + box.height;
    expect(roundedRoute(points, 24).points.some(inside)).toBe(true);
    expect(roundedRoute(points, 24, [box]).points.some(inside)).toBe(false);
    const distant = { ...box, x: box.x + 1000 };
    expect(roundedRoute(points, 24, [distant])).toEqual(roundedRoute(points, 24));
  }
});

test("one visual preference overrides old per-edge metadata without changing shapes", () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  const shapes = [0, 8, 24].map(radius => ({
    props: { path: "M 0 0 L 100 0 L 100 100", points },
    meta: { lexiconCornerRadius: radius },
  }) as unknown as ConnectionShape);
  const original = structuredClone(shapes), previous = edgeCornerRadius.get();
  try {
    setEdgeCornerRadius(16);
    for (const shape of shapes) expect(connectionDrawing(shape).path).toContain("Q");
    expect(new Set(shapes.map(shape => connectionDrawing(shape).path)).size).toBe(1);
    setEdgeCornerRadius(0);
    for (const shape of shapes) expect(connectionDrawing(shape).path).toBe(shape.props.path);
    expect(shapes).toEqual(original);
  } finally { setEdgeCornerRadius(previous); }
});
