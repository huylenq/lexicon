import type { Box, Point } from "../graph/layout";

export const clearance = 24;
export const expand = (b: Box & { padding?: number }): Box => {
  const gap = b.padding ?? clearance;
  return { x: b.x - gap, y: b.y - gap, width: b.width + 2 * gap, height: b.height + 2 * gap };
};
export function segmentBlocked(a: Point, b: Point, boxes: Box[]) {
  return boxes.some(r => a.x === b.x
    ? a.x > r.x && a.x < r.x + r.width && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.height
    : a.y > r.y && a.y < r.y + r.height && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.width);
}
export const laneSpacing = 16;
export type Run = { a: Point; b: Point; padding?: number };
export const routeRuns = (points: Point[]): Run[] => points.slice(1).map((b, i) => ({ a: points[i], b }));

/** Penalize long shared/nearby runs much more than a single perpendicular crossing. */
export function trafficCost(a: Point, b: Point, runs: Run[], spacing = laneSpacing) {
  const horizontal = a.y === b.y;
  let cost = 0;
  for (const run of runs) {
    const parallel = horizontal === (run.a.y === run.b.y);
    if (parallel) {
      const gap = Math.abs(horizontal ? a.y - run.a.y : a.x - run.a.x);
      if (gap >= spacing - 0.001) continue;
      const overlap = horizontal
        ? Math.min(Math.max(a.x, b.x), Math.max(run.a.x, run.b.x)) - Math.max(Math.min(a.x, b.x), Math.min(run.a.x, run.b.x))
        : Math.min(Math.max(a.y, b.y), Math.max(run.a.y, run.b.y)) - Math.max(Math.min(a.y, b.y), Math.min(run.a.y, run.b.y));
      cost += Math.max(0, overlap) * 24 * (1 - gap / spacing);
    } else {
      const h = horizontal ? { a, b } : run, v = horizontal ? run : { a, b };
      if (v.a.x > Math.min(h.a.x, h.b.x) && v.a.x < Math.max(h.a.x, h.b.x) &&
        h.a.y > Math.min(v.a.y, v.b.y) && h.a.y < Math.max(v.a.y, v.b.y)) cost += 48;
    }
  }
  return cost;
}
const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Coordinate-compressed orthogonal visibility grid; heading is part of A* state. */
function search(start: Point, end: Point, boxes: Box[], runs: Run[], spacing: number): Point[] | undefined {
  const xs = [...new Set([start.x, end.x, ...boxes.flatMap(b => [b.x, b.x + b.width]), ...runs.filter(r => r.a.x === r.b.x).flatMap(r => [r.a.x - spacing, r.a.x + spacing])])].sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, ...boxes.flatMap(b => [b.y, b.y + b.height]), ...runs.filter(r => r.a.y === r.b.y).flatMap(r => [r.a.y - spacing, r.a.y + spacing])])].sort((a, b) => a - b);
  const width = xs.length;
  const index = (p: Point) => ys.indexOf(p.y) * width + xs.indexOf(p.x);
  const point = (id: number) => ({ x: xs[id % width], y: ys[Math.floor(id / width)] });
  const goal = index(end);
  type Entry = { state: number; cost: number; score: number };
  const heap: Entry[] = [];
  const push = (entry: Entry) => {
    let i = heap.length;
    heap.push(entry);
    while (i) {
      const parent = (i - 1) >> 1;
      if (heap[parent].score <= entry.score) break;
      heap[i] = heap[parent]; i = parent;
    }
    heap[i] = entry;
  };
  const pop = () => {
    const first = heap[0], last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
        if (heap[child].score >= last.score) break;
        heap[i] = heap[child]; i = child;
      }
      heap[i] = last;
    }
    return first;
  };
  const costs = new Map<number, number>(), parents = new Map<number, number>();
  for (const direction of [0, 1]) {
    const state = index(start) * 2 + direction;
    costs.set(state, 0); push({ state, cost: 0, score: distance(start, end) });
  }
  // Grid segments are visited in both directions and with two incoming headings.
  // Cache their geometry cost; bucket obstacles and traffic by grid row/column.
  const segmentCosts = new Map<string, number>();
  const rowBoxes = new Map<number, Box[]>(), columnBoxes = new Map<number, Box[]>();
  const rowRuns = new Map<number, Run[]>(), columnRuns = new Map<number, Run[]>();
  const segmentCost = (id: number, next: number, a: Point, b: Point) => {
    const key = id < next ? `${id}:${next}` : `${next}:${id}`;
    const cached = segmentCosts.get(key);
    if (cached !== undefined) return cached;
    const horizontal = a.y === b.y, coordinate = horizontal ? a.y : a.x;
    const boxCache = horizontal ? rowBoxes : columnBoxes, runCache = horizontal ? rowRuns : columnRuns;
    let nearbyBoxes = boxCache.get(coordinate);
    if (!nearbyBoxes) {
      nearbyBoxes = boxes.filter(r => horizontal ? coordinate > r.y && coordinate < r.y + r.height : coordinate > r.x && coordinate < r.x + r.width);
      boxCache.set(coordinate, nearbyBoxes);
    }
    let nearbyRuns = runCache.get(coordinate);
    if (!nearbyRuns) {
      nearbyRuns = runs.filter(r => {
        if (horizontal === (r.a.y === r.b.y)) return Math.abs(coordinate - (horizontal ? r.a.y : r.a.x)) < spacing;
        return horizontal ? coordinate > Math.min(r.a.y, r.b.y) && coordinate < Math.max(r.a.y, r.b.y)
          : coordinate > Math.min(r.a.x, r.b.x) && coordinate < Math.max(r.a.x, r.b.x);
      });
      runCache.set(coordinate, nearbyRuns);
    }
    const cost = segmentBlocked(a, b, nearbyBoxes) ? Infinity : distance(a, b) + trafficCost(a, b, nearbyRuns, spacing);
    segmentCosts.set(key, cost);
    return cost;
  };
  while (heap.length) {
    const current = pop();
    if (current.cost !== costs.get(current.state)) continue;
    const id = Math.floor(current.state / 2), a = point(id);
    if (id === goal) {
      const path: Point[] = [];
      let state: number | undefined = current.state;
      while (state !== undefined) { path.push(point(Math.floor(state / 2))); state = parents.get(state); }
      return path.reverse();
    }
    const x = id % width, y = Math.floor(id / width);
    for (const [next, direction] of [[x > 0 ? id - 1 : -1, 0], [x + 1 < width ? id + 1 : -1, 0], [y > 0 ? id - width : -1, 1], [y + 1 < ys.length ? id + width : -1, 1]]) {
      if (next < 0) continue;
      const b = point(next);
      const travel = segmentCost(id, next, a, b);
      if (!Number.isFinite(travel)) continue;
      const state = next * 2 + direction;
      const cost = current.cost + travel + (direction === current.state % 2 ? 0 : 32);
      if (cost >= (costs.get(state) ?? Infinity)) continue;
      costs.set(state, cost); parents.set(state, current.state);
      push({ state, cost, score: cost + distance(b, end) });
    }
  }
}

function simplify(points: Point[]) {
  const result: Point[] = [];
  for (const p of points) {
    if (result.length && distance(result.at(-1)!, p) === 0) continue;
    while (result.length >= 2) {
      const a = result.at(-2)!, b = result.at(-1)!;
      if (!((a.x === b.x && b.x === p.x && (b.y - a.y) * (p.y - b.y) >= 0) ||
        (a.y === b.y && b.y === p.y && (b.x - a.x) * (p.x - b.x) >= 0))) break;
      result.pop();
    }
    result.push(p);
  }
  return result;
}

export function avoidObstacles(preferred: Point[], source: Box, target: Box, obstacles: Box[], runs: Run[] = [], barriers: Box[] = [], spacing = laneSpacing, forceSearch = false) {
  const padded = [...obstacles.map(expand), ...barriers];
  if (!forceSearch && !preferred.some((p, i) => i && (segmentBlocked(preferred[i - 1], p, padded) || trafficCost(preferred[i - 1], p, runs, spacing) > 0))) return preferred;
  const start = preferred[0], end = preferred.at(-1)!;
  const stub = (p: Point, b: Box) => ({ x: p.x + (p.x === b.x ? -clearance : p.x === b.x + b.width ? clearance : 0), y: p.y + (p.y === b.y ? -clearance : p.y === b.y + b.height ? clearance : 0) });
  const a = stub(start, source), b = stub(end, target);
  // Overlapping cards may block an endpoint outright. Keep a visible fallback.
  const around = (boxes: Box[]) => segmentBlocked(start, a, boxes) || segmentBlocked(b, end, boxes)
    ? undefined : search(a, b, [...boxes, source, target], runs, spacing);
  // If labels make a tight endpoint inaccessible, still preserve card avoidance.
  const path = around(padded) || (barriers.length ? around(obstacles.map(expand)) : undefined);
  return path ? simplify([start, ...path, end]) : preferred;
}

export function routeLabel(points: Point[], width: number, obstacles: Box[], fallback: Point): Point {
  const longest = points.slice(1).map((b, i) => ({ a: points[i], b })).sort((u, v) => distance(v.a, v.b) - distance(u.a, u.b))[0];
  let best = longest ? { x: (longest.a.x + longest.b.x) / 2, y: (longest.a.y + longest.b.y) / 2 } : fallback;
  let score = -Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = distance(a, b);
    for (const t of [0.5, 0.25, 0.75]) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const box = { x: p.x - width / 2 - 4, y: p.y - 19, width: width + 8, height: 38 };
      if (obstacles.some(r => box.x < r.x + r.width && box.x + box.width > r.x && box.y < r.y + r.height && box.y + box.height > r.y)) continue;
      const value = Math.min(length, 400) + (a.y === b.y && length >= width + 16 ? 200 : 0) - Math.abs(t - 0.5) * 40;
      if (value > score) { score = value; best = p; }
    }
  }
  return best;
}
