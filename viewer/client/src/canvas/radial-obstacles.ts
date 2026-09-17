import type { RadialBox } from './radial-layout';

const samples = new WeakMap<SVGPathElement, { key: string; points: DOMPoint[] }>();

/** Sample the painted route, not its bounding rectangle (which includes empty space). */
export function routeObstacles(path: SVGPathElement): RadialBox[] {
  const matrix = path.getScreenCTM();
  if (!matrix || !path.getClientRects().length) return [];

  const scale = Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
  const key = `${path.getAttribute('d')}:${scale}`;
  let cached = samples.get(path);
  if (cached?.key !== key) {
    const length = path.getTotalLength();
    const count = Math.max(1, Math.ceil(length * scale / 8));
    cached = { key, points: Array.from({ length: count + 1 }, (_, i) => path.getPointAtLength(length * i / count)) };
    samples.set(path, cached);
  }
  const boxes: RadialBox[] = [];
  let previous = cached.points[0].matrixTransform(matrix);
  for (let i = 1; i < cached.points.length; i++) {
    const point = cached.points[i].matrixTransform(matrix);
    boxes.push({ x: Math.min(previous.x, point.x) - 3, y: Math.min(previous.y, point.y) - 3,
      w: Math.abs(point.x - previous.x) + 6, h: Math.abs(point.y - previous.y) + 6 });
    previous = point;
  }
  return boxes;
}
