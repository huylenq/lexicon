import type { Bounds, Point } from "../../../shared/canvas-geometry";

export type ShoveBody = Bounds & { id: string; fixed?: boolean };
export const SHOVE_GAP = 16;
export const SHOVE_MAX_CHECKS = 20_000;

/** Local, inelastic contact propagation. No velocities or idle simulation. */
export function shoveBodies(input: ShoveBody[], active: ReadonlySet<string>, direction: Point, gap = SHOVE_GAP) {
  const bodies = new Map(input.map(body => [body.id, { ...body }]));
  const moved = new Map<string, Point>();
  const cells = new Map<string, Set<string>>(), memberships = new Map<string, string[]>();
  const large = new Set<string>();
  const cellSize = 256;
  const keys = (b: Bounds) => {
    const x0 = Math.floor((b.x - gap) / cellSize), x1 = Math.floor((b.x + b.w + gap) / cellSize);
    const y0 = Math.floor((b.y - gap) / cellSize), y1 = Math.floor((b.y + b.h + gap) / cellSize);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 64) return null;
    const result: string[] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) result.push(`${x}:${y}`);
    return result;
  };
  const index = (body: ShoveBody) => {
    for (const key of memberships.get(body.id) || []) {
      const cell = cells.get(key)!;
      cell.delete(body.id);
      if (!cell.size) cells.delete(key);
    }
    large.delete(body.id);
    const next = keys(body);
    memberships.set(body.id, next || []);
    if (!next) { large.add(body.id); return; }
    for (const key of next) {
      let cell = cells.get(key);
      if (!cell) cells.set(key, cell = new Set());
      cell.add(body.id);
    }
  };
  for (const body of bodies.values()) index(body);
  function* candidates(body: ShoveBody) {
    const area = keys(body);
    if (!area) { yield* bodies.keys(); return; }
    yield* large;
    for (const key of area) yield* (cells.get(key) || []);
  }
  const queue = [...active].filter(id => bodies.has(id)), queued = new Set(queue);
  const enqueue = (id: string) => { if (!queued.has(id)) { queued.add(id); queue.push(id); } };
  // One direction per contact chain avoids oscillation and keeps dragging predictable.
  const horizontal = Math.abs(direction.x) >= Math.abs(direction.y);
  const sign = (horizontal ? direction.x : direction.y) < 0 ? -1 : 1;
  const fixed = (b: ShoveBody) => b.fixed || active.has(b.id);
  let checks = 0, limited = false;
  const budget = Math.max(256, Math.min(SHOVE_MAX_CHECKS, input.length * 32));
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const body = bodies.get(queue[cursor])!;
    queued.delete(body.id);
    // Snapshot only the bounded candidate set before movement changes the index.
    const nearby = new Set<string>();
    for (const id of candidates(body)) {
      if (id === body.id || nearby.has(id)) continue;
      if (checks + nearby.size >= budget) { limited = true; break; }
      nearby.add(id);
    }
    for (const id of nearby) {
      const other = bodies.get(id)!;
      checks++;
      if (fixed(body) && fixed(other)) continue;
      if (body.x + body.w + gap <= other.x || other.x + other.w + gap <= body.x ||
          body.y + body.h + gap <= other.y || other.y + other.h + gap <= body.y) continue;
      const target = fixed(other) ? body : other, obstacle = target === body ? other : body;
      const delta = horizontal
        ? { x: sign > 0 ? obstacle.x + obstacle.w + gap - target.x : obstacle.x - gap - target.w - target.x, y: 0 }
        : { x: 0, y: sign > 0 ? obstacle.y + obstacle.h + gap - target.y : obstacle.y - gap - target.h - target.y };
      target.x += delta.x; target.y += delta.y;
      const total = moved.get(target.id) || { x: 0, y: 0 };
      moved.set(target.id, { x: total.x + delta.x, y: total.y + delta.y });
      index(target); enqueue(target.id);
    }
    if (limited) break;
  }
  return { moved, checks, limited };
}
