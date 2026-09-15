import type { RadialBox } from './radial-layout';

/** Sample the painted route, not its bounding rectangle (which includes empty space). */
export function routeObstacles(path: SVGPathElement): RadialBox[] {
  const matrix = path.getScreenCTM();
  if (!matrix || !path.getClientRects().length) return [];
  const length = path.getTotalLength();
  const scale = Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
  const count = Math.max(1, Math.ceil(length * scale / 8));
  const boxes: RadialBox[] = [];
  let previous = path.getPointAtLength(0).matrixTransform(matrix);
  for (let i = 1; i <= count; i++) {
    const point = path.getPointAtLength(length * i / count).matrixTransform(matrix);
    boxes.push({ x: Math.min(previous.x, point.x) - 3, y: Math.min(previous.y, point.y) - 3,
      w: Math.abs(point.x - previous.x) + 6, h: Math.abs(point.y - previous.y) + 6 });
    previous = point;
  }
  return boxes;
}
