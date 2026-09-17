import { expect, test } from 'bun:test';
import { routeObstacles } from '../client/src/canvas/radial-obstacles';
import { radialCandidateBounds, radialPositions } from '../client/src/canvas/radial-layout';

test('route samples survive translation but refresh for zoom and changed paths', () => {
  let reads = 0, d = 'M0 0 L80 0';
  const matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const path = {
    getScreenCTM: () => matrix, getClientRects: () => [{}], getAttribute: () => d,
    getTotalLength: () => 80,
    getPointAtLength: (x: number) => { reads++; return { matrixTransform: (m: typeof matrix) => ({ x: x * m.a + m.e, y: x * m.b + m.f }) }; },
  } as unknown as SVGPathElement;
  const initial = routeObstacles(path);
  expect(reads).toBe(11);
  matrix.e = 100; matrix.f = -50;
  expect(routeObstacles(path)).toEqual(initial.map(b => ({ ...b, x: b.x + 100, y: b.y - 50 })));
  expect(reads).toBe(11);
  matrix.a = matrix.d = 2;
  routeObstacles(path);
  expect(reads).toBe(32);
  d = 'M0 0 L0 80';
  routeObstacles(path);
  expect(reads).toBe(53);
});

test('radial culling bounds contain every chosen icon and name even with many rings', () => {
  for (const count of [1, 8, 100]) {
    const anchor = { x: 400, y: 400, w: 30, h: 20 };
    const names = Array.from({ length: count }, () => ({ w: 300, h: 60 }));
    const area = radialCandidateBounds(anchor, count, names);
    const positions = radialPositions(anchor, count, [], { x: 0, y: 0, w: 1200, h: 1000 }, names);
    for (const p of positions) {
      const left = p.nameSide === 'left' ? p.x + 15 - 300 : p.x;
      expect(left).toBeGreaterThanOrEqual(area.x);
      expect(left + 315).toBeLessThanOrEqual(area.x + area.w);
      expect(p.y).toBeGreaterThanOrEqual(area.y);
      expect(p.y + 60).toBeLessThanOrEqual(area.y + area.h);
    }
  }
});

test('culling preserves the layout selected from all obstacles across varied rings and labels', () => {
  // Seeded scenes include distant routes and routes near every side of the orbit.
  // Comparing the final layout catches a bound that excludes any losing candidate
  // whose cost would otherwise change the winner, not just the winning footprint.
  let seed = 1024;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let scene = 0; scene < 45; scene++) {
    const anchor = { x: random() * 700, y: random() * 500, w: 20 + random() * 300, h: 10 + random() * 100 };
    const count = [1, 8, 60][scene % 3];
    const names = Array.from({ length: count }, () => ({ w: 20 + random() * 360, h: 20 + random() * 120 }));
    const bounds = radialCandidateBounds(anchor, count, names);
    const obstacles = Array.from({ length: 90 }, () => ({
      x: random() * 1600 - 400, y: random() * 1200 - 300,
      w: 6 + random() * 100, h: 6 + random() * 100,
    }));
    const culled = obstacles.filter(b => b.x + b.w >= bounds.x && b.x <= bounds.x + bounds.w &&
      b.y + b.h >= bounds.y && b.y <= bounds.y + bounds.h);
    const viewport = { x: 8, y: 8, w: 1000, h: 700 };
    expect(radialPositions(anchor, count, culled, viewport, names)).toEqual(radialPositions(anchor, count, obstacles, viewport, names));
  }
});
