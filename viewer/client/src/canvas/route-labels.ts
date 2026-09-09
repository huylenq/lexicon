import type { Box, Point } from "../graph/layout";
import { routeRuns, type Run } from "./obstacle-routing";

export const labelBox = (p: Point, width: number, padding = 4): Box => ({
  x: p.x - width / 2 - padding, y: p.y - 15 - padding,
  width: width + padding * 2, height: 30 + padding * 2,
});
const runBox = ({ a, b, padding = 2 }: Run): Box => ({
  x: Math.min(a.x, b.x) - padding, y: Math.min(a.y, b.y) - padding,
  width: Math.abs(a.x - b.x) + padding * 2, height: Math.abs(a.y - b.y) + padding * 2,
});

/** Subtract occupied intervals from each segment's possible label centers. */
export function clearRouteLabel(points: Point[], width: number, obstacles: Box[], traffic: Run[], previous?: Point): Point | undefined {
  const ownRuns = routeRuns(points);
  let best: Point | undefined, bestScore = -Infinity;
  for (const [index, run] of ownRuns.entries()) {
    const horizontal = run.a.y === run.b.y;
    const axis = (p: Point) => horizontal ? p.x : p.y;
    const cross = horizontal ? run.a.y : run.a.x;
    const half = horizontal ? width / 2 + 4 : 19;
    const crossHalf = horizontal ? 19 : width / 2 + 4;
    const low = Math.min(axis(run.a), axis(run.b)) + half;
    const high = Math.max(axis(run.a), axis(run.b)) - half;
    if (low > high) continue;
    let free = [[low, high]];
    const blockers = [...obstacles, ...traffic.map(runBox), ...ownRuns.filter((_, i) => i !== index).map(runBox)];
    for (const box of blockers) {
      const crossMin = horizontal ? box.y : box.x, crossSize = horizontal ? box.height : box.width;
      if (cross <= crossMin - crossHalf || cross >= crossMin + crossSize + crossHalf) continue;
      const min = (horizontal ? box.x : box.y) - half;
      const max = (horizontal ? box.x + box.width : box.y + box.height) + half;
      free = free.flatMap(([a, b]) => max <= a || min >= b ? [[a, b]] : [
        ...(a < min ? [[a, min]] : []), ...(max < b ? [[max, b]] : []),
      ]);
      if (!free.length) break;
    }
    for (const [a, b] of free) {
      const preferred = previous && (horizontal ? previous.y === cross : previous.x === cross);
      const center = preferred ? Math.max(a, Math.min(b, axis(previous!))) : (a + b) / 2;
      const p = horizontal ? { x: center, y: cross } : { x: cross, y: center };
      const unchanged = previous && p.x === previous.x && p.y === previous.y;
      const score = (unchanged ? 10000 : 0) + (horizontal ? 200 : 0) + Math.min(b - a, 400);
      if (score > bestScore) { best = p; bestScore = score; }
    }
  }
  return best;
}
