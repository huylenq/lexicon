import { expect, test } from "bun:test";
import { landLabelCurve } from "../client/src/canvas/terrain/labels";
import { pointInPolygon } from "../client/src/canvas/territory";

test("land lettering follows broad coast changes and keeps its drag ribbon inside the clearing", () => {
  const frame = { x: 30, y: 80, w: 320, h: 72 };
  const coast = [{ x: 0, y: 30 }, { x: 200, y: 0 }, { x: 400, y: 60 },
    { x: 400, y: 400 }, { x: 0, y: 400 }];
  const curve = landLabelCurve(coast, frame);
  const changed = landLabelCurve(coast.map(p => ({ x: p.x, y: p.y + p.x * .4 })), frame);
  expect(changed.path).not.toBe(curve.path);
  for (const p of curve.hit) {
    expect(p.x).toBeGreaterThanOrEqual(frame.x);
    expect(p.x).toBeLessThanOrEqual(frame.x + frame.w);
    expect(p.y).toBeGreaterThanOrEqual(frame.y);
    expect(p.y).toBeLessThanOrEqual(frame.y + frame.h);
  }
  for (const [i, p] of curve.points.entries()) {
    if (i) expect(p.x).toBeGreaterThan(curve.points[i - 1].x);
    expect(pointInPolygon({ x: p.x, y: p.y - 8 }, curve.hit)).toBe(true);
  }
  const offset = { x: -700, y: 900 };
  const moved = landLabelCurve(coast.map(p => ({ x: p.x + offset.x, y: p.y + offset.y })),
    { ...frame, x: frame.x + offset.x, y: frame.y + offset.y });
  moved.points.forEach((p, i) => {
    expect(p.x - offset.x).toBeCloseTo(curve.points[i].x);
    expect(p.y - offset.y).toBeCloseTo(curve.points[i].y);
  });
});
