import { expect, test } from 'bun:test';
import { radialPositions, indexRadialObstacles } from '../client/src/canvas/radial-layout';

test('radial icons surround the source with a traversable gap', () => {
  const positions = radialPositions({ x: 200, y: 200, w: 200, h: 60 }, 4, [], { x: 0, y: 0, w: 800, h: 600 });
  expect(positions).toEqual([{ x: 285, y: 158 }, { x: 412, y: 215 }, { x: 285, y: 272 }, { x: 158, y: 215 }]);
});
test('radial placement avoids a neighboring node where a nearby angle is free', () => {
  const [p] = radialPositions({ x: 200, y: 200, w: 200, h: 60 }, 1, [{ x: 280, y: 145, w: 40, h: 45 }], { x: 0, y: 0, w: 800, h: 600 });
  expect(p.x >= 320 || p.x + 30 <= 280).toBe(true);
});
test('radial icons remain within the viewport near an edge', () => {
  const positions = radialPositions({ x: 0, y: 0, w: 150, h: 40 }, 8, [], { x: 8, y: 8, w: 384, h: 584 });
  for (const p of positions) { expect(p.x).toBeGreaterThanOrEqual(8); expect(p.y).toBeGreaterThanOrEqual(8); expect(p.x + 30).toBeLessThanOrEqual(392); expect(p.y + 30).toBeLessThanOrEqual(592); }
});
test('crowded corner redistributes icons without stacking or covering the source', () => {
  const anchor = { x: 8, y: 8, w: 150, h: 40 };
  const positions = radialPositions(anchor, 12, [], { x: 8, y: 8, w: 384, h: 584 });
  const intersects = (a: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) =>
    a.x < b.x + b.w && a.x + 30 > b.x && a.y < b.y + b.h && a.y + 30 > b.y;
  positions.forEach((p, i) => {
    expect(intersects(p, anchor)).toBe(false);
    for (const other of positions.slice(0, i)) expect(intersects(p, { ...other, w: 30, h: 30 })).toBe(false);
  });
});
test('a blocked circumference expands beyond the surrounding nodes', () => {
  const anchor = { x: 300, y: 300, w: 100, h: 40 };
  const obstacles = [{ x: 250, y: 240, w: 200, h: 50 }, { x: 250, y: 350, w: 200, h: 50 }, { x: 250, y: 290, w: 40, h: 60 }, { x: 410, y: 290, w: 40, h: 60 }];
  const positions = radialPositions(anchor, 8, obstacles, { x: 0, y: 0, w: 800, h: 700 });
  for (const p of positions) for (const b of obstacles) expect(p.x + 30 <= b.x || p.x >= b.x + b.w || p.y + 30 <= b.y || p.y >= b.y + b.h).toBe(true);
});
test('incoming edge and its label leave both the satellite and revealed name clear', () => {
  const anchor = { x: 240, y: 180, w: 260, h: 56 };
  const obstacles = [
    { x: 367, y: 0, w: 6, h: 180 }, // incoming vertical route
    { x: 178, y: 73, w: 386, h: 38 }, // relationship label
    { x: 560, y: 177, w: 240, h: 57 }, // adjacent component
  ];
  const [p] = radialPositions(anchor, 1, obstacles, { x: 8, y: 8, w: 800, h: 500 }, [{ w: 170, h: 30 }]);
  const footprint = { x: p.nameSide === 'left' ? p.x + 15 - 170 : p.x, y: p.y, w: 185, h: 30 };
  for (const b of [anchor, ...obstacles]) expect(footprint.x + footprint.w <= b.x || footprint.x >= b.x + b.w || footprint.y + footprint.h <= b.y || footprint.y >= b.y + b.h).toBe(true);
});

test('spatial collision queries match full scans across cell boundaries and large panels', () => {
  const obstacles = [
    ...Array.from({ length: 2000 }, (_, i) => ({ x: (i % 100) * 8 - 300, y: Math.floor(i / 100) * 12 - 120, w: 14, h: 6 })),
    { x: -2000, y: -2000, w: 4000, h: 4000 },
    { x: 60, y: 60, w: 130, h: 130 },
  ];
  const area = indexRadialObstacles(obstacles);
  for (let i = 0; i < 100; i++) {
    const a = { x: i * 13 - 450, y: i * 7 - 250, w: 180, h: 45 };
    const expected = obstacles.reduce((sum, b) => sum + Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)), 0);
    expect(area(a)).toBe(expected);
  }
});
