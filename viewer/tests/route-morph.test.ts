import { expect, test } from "bun:test";
import { matchRoutePoints, mixPoint, sameRoute } from "../client/src/canvas/route-morph";

test("a detour morph preserves endpoints and both sets of bends", () => {
  const from = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
  const to = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 0 }];
  const [a, b] = matchRoutePoints(from, to);
  expect(a.length).toBe(b.length);
  for (const point of to) expect(b).toContainEqual(point);
  expect(a[0]).toEqual(from[0]);
  expect(a.at(-1)).toEqual(from.at(-1));
  const middle = a.map((p, i) => mixPoint(p, b[i], .5));
  expect(middle[0]).toEqual(from[0]);
  expect(middle.at(-1)).toEqual(from.at(-1));
  expect(middle.some(p => p.y === 50)).toBe(true);
});

test("repeated interruption keeps correspondence bounded and finite", () => {
  let points = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
  for (let i = 1; i < 200; i++) {
    const to = [{ x: 0, y: 0 }, { x: i, y: 100 }, { x: 200, y: 0 }];
    const [a, b] = matchRoutePoints(points, to);
    points = a.map((p, n) => mixPoint(p, b[n], .2));
    expect(points.length).toBeLessThanOrEqual(101);
    expect(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  }
});

test("equivalent fresh arrays and floating point noise do not restart a morph", () => {
  expect(sameRoute([{ x: 10, y: 20 }], [{ x: 10.000001, y: 20 }])).toBe(true);
  expect(sameRoute([{ x: 10, y: 20 }], [{ x: 11, y: 20 }])).toBe(false);
});

import { routeMorph } from "../client/src/canvas/useRouteMorph";
import { roadFrame, roadMorph } from "../client/src/canvas/terrain/road-morph";
import { roadGeometry } from "../client/src/canvas/terrain/generate";

test("attached endpoints cannot spring backward when a drag is released", () => {
  const from = { points: [{ x: 0, y: 0 }, { x: 200, y: 0 }], label: { x: 100, y: 0 } };
  const to = { points: [{ x: 100, y: 0 }, { x: 200, y: 0 }], label: { x: 150, y: 0 } };
  const attached = routeMorph.attach(from, to);
  const tween = routeMorph.prepare(attached, to);
  for (const t of [0, .1, .25, .5, .9, 1]) {
    expect(tween(t).points[0]).toEqual(to.points[0]);
    expect(tween(t).points.at(-1)).toEqual(to.points.at(-1));
  }
});

test("intermediate detours soften corners without changing either endpoint frame", () => {
  const from = { points: [{ x: 0, y: 0 }, { x: 200, y: 0 }], label: { x: 100, y: 0 } };
  const to = { points: [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 0 }], label: { x: 100, y: 100 } };
  const tween = routeMorph.prepare(from, to), middle = tween(.5).points;
  expect(tween(0)).toBe(from);
  expect(tween(1)).toBe(to);
  for (let i = 1; i < middle.length - 1; i++) {
    const a = middle[i - 1], b = middle[i], c = middle[i + 1];
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    const length = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y);
    if (length > .001) expect(Math.acos(Math.min(1, Math.max(-1, dot / length)))).toBeLessThan(Math.PI / 6);
  }
});

const pointDistance = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
};
test("Atlas contours and texture remain continuous when a detour changes the bend count", () => {
  const from = roadFrame(roadGeometry("example", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }], "road"));
  const to = roadFrame(roadGeometry("example", [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 200 }], "road"));
  const tween = roadMorph.prepare(from, to);
  expect(tween(0)).toBe(from);
  expect(tween(1)).toBe(to);
  for (const [t, expected] of [[.000001, from], [.999999, to]] as const) {
    const shown = tween(t);
    shown.tracks.forEach((track, n) => {
      for (const p of track) expect(Math.min(...expected.tracks[n].slice(1).map((b, i) => pointDistance(p, expected.tracks[n][i], b)))).toBeLessThan(.06);
    });
    for (let i = 0; i < expected.marks.length; i++) for (let j = 0; j < 2; j++)
      expect(Math.hypot(shown.marks[i][j].x - expected.marks[i][j].x, shown.marks[i][j].y - expected.marks[i][j].y)).toBeLessThan(.001);
  }
});

test("large endpoint moves do not fold a straight attachment back on itself", () => {
  const from = { points: Array.from({ length: 21 }, (_, i) => ({ x: i * 10, y: 0 })), label: { x: 100, y: 0 } };
  const to = { points: [{ x: 150, y: 0 }, { x: 200, y: 0 }], label: { x: 175, y: 0 } };
  const attached = routeMorph.attach(from, to);
  expect(attached.label).toEqual(to.label);
  for (let i = 1; i < attached.points.length; i++) expect(attached.points[i].x).toBeGreaterThanOrEqual(attached.points[i - 1].x);
});
