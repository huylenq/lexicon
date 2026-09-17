import type { Box, Point } from "../graph/layout";
import type { RelationshipRoute, SceneRelationship } from "./scene-routing";

const sameBox = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const port = (p: Point, from: Box, to: Box): Point => ({
  x: to.x + (p.x - from.x) * to.width / (from.width || 1),
  y: to.y + (p.y - from.y) * to.height / (from.height || 1),
});

/** Keep the settled ports and trunk. Only incident endpoint segments move. */
export function previewRelationship(edge: SceneRelationship, previous: SceneRelationship, route: RelationshipRoute): RelationshipRoute {
  if (sameBox(edge.source, previous.source) && sameBox(edge.target, previous.target)) return route;
  const dx = edge.source.x - previous.source.x, dy = edge.source.y - previous.source.y;
  if (edge.target.x - previous.target.x === dx && edge.target.y - previous.target.y === dy &&
    edge.source.width === previous.source.width && edge.source.height === previous.source.height &&
    edge.target.width === previous.target.width && edge.target.height === previous.target.height) {
    return { x: route.x + dx, y: route.y + dy, points: route.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
  }
  const old = route.points;
  const a = port(old[0], previous.source, edge.source), b = port(old.at(-1)!, previous.target, edge.target);
  let points: Point[];
  if (old.length < 3) {
    const horizontal = old[0].y === old.at(-1)!.y;
    const middle = horizontal ? (old[0].x + old.at(-1)!.x) / 2 : (old[0].y + old.at(-1)!.y) / 2;
    points = horizontal ? [a, { x: middle, y: a.y }, { x: middle, y: b.y }, b]
      : [a, { x: a.x, y: middle }, { x: b.x, y: middle }, b];
  } else {
    points = old.map(p => ({ ...p }));
    points[0] = a;
    points[points.length - 1] = b;
    if (old[0].y === old[1].y) points[1].y = a.y;
    else points[1].x = a.x;
    if (old.at(-1)!.y === old.at(-2)!.y) points[points.length - 2].y = b.y;
    else points[points.length - 2].x = b.x;
  }
  points = points.filter((p, i) => !i || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  // Keep the label where it was unless its segment moved away from it.
  let label = points[0], distance = Infinity;
  for (let i = 1; i < points.length; i++) {
    const u = points[i - 1], v = points[i];
    const p = { x: Math.max(Math.min(u.x, v.x), Math.min(route.x, Math.max(u.x, v.x))),
      y: Math.max(Math.min(u.y, v.y), Math.min(route.y, Math.max(u.y, v.y))) };
    const d = (p.x - route.x) ** 2 + (p.y - route.y) ** 2;
    if (d < distance) { distance = d; label = p; }
  }
  return { points, ...label };
}
