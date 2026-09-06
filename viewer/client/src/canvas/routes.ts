import type { Box, Point } from "../graph/layout";

/** Orthogonal canvas routes. Lanes separate parallel relations without moving nodes. */
export function relationshipRoute(source: Box, target: Box, lane = 0, self = false) {
  const a = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const b = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const port = (size: number) => Math.tanh(lane / 2) * size * 0.3;
  const gapX = Math.abs(b.x - a.x) - (source.width + target.width) / 2;
  const gapY = Math.abs(b.y - a.y) - (source.height + target.height) / 2;
  let points: Point[];
  if (self || (gapX <= 0 && gapY <= 0)) {
    const start = { x: source.x + source.width, y: a.y + (self ? -source.height / 4 : port(source.height)) };
    const end = { x: target.x + target.width, y: b.y + (self ? target.height / 4 : port(target.height)) };
    const outside = Math.max(start.x, end.x) + 80 + Math.tanh(lane / 2) * 50;
    points = [start, { x: outside, y: start.y }, { x: outside, y: end.y }, end];
  } else if (gapX > gapY) {
    const direction = Math.sign(b.x - a.x);
    const start = { x: a.x + direction * source.width / 2, y: a.y + port(source.height) };
    const end = { x: b.x - direction * target.width / 2, y: b.y + port(target.height) };
    const middle = (start.x + end.x) / 2 + Math.tanh(lane / 2) * gapX * 0.3;
    points = [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end];
  } else {
    const direction = Math.sign(b.y - a.y);
    const start = { x: a.x + port(source.width), y: a.y + direction * source.height / 2 };
    const end = { x: b.x + port(target.width), y: b.y - direction * target.height / 2 };
    const middle = (start.y + end.y) / 2 + Math.tanh(lane / 2) * gapY * 0.3;
    points = [start, { x: start.x, y: middle }, { x: end.x, y: middle }, end];
  }
  const label = { x: (points[1].x + points[2].x) / 2, y: (points[1].y + points[2].y) / 2 };
  // Zero-length segments confuse arrow direction and polyline hit testing.
  points = points.filter((point, i) => !i || point.x !== points[i - 1].x || point.y !== points[i - 1].y);
  return { points, ...label };
}
