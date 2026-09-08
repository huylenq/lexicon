import polygonClipping, { type Ring } from "polygon-clipping";
import type { Bounds, Point } from "../shared/canvas-geometry";

/** Independent of the production containment predicate: measure the rectangle outside the coast. */
export function uncoveredArea(points: Point[], { x, y, w, h }: Bounds): number {
  const outside = polygonClipping.difference(
    [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]],
    [points.map((p): [number, number] => [p.x, p.y])],
  );
  const area = (ring: Ring) => Math.abs(ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length], origin = ring[0];
    return sum + (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
  }, 0)) / 2;
  return outside.reduce((sum, polygon) => sum + area(polygon[0]) - polygon.slice(1).reduce((holes, ring) => holes + area(ring), 0), 0);
}
