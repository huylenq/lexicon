export type RadialBox = { x: number; y: number; w: number; h: number };
const size = 30, gap = 12;
const overlap = (a: RadialBox, b: RadialBox) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Index once per layout; small route segments are queried only near each slot. */
export function indexRadialObstacles(obstacles: RadialBox[]) {
  const cell = 64;
  const cells = new Map<string, number[]>(), large: number[] = [];
  const range = (b: RadialBox) => [Math.floor(b.x / cell), Math.floor(b.y / cell), Math.floor((b.x + b.w) / cell), Math.floor((b.y + b.h) / cell)];
  obstacles.forEach((b, id) => {
    const [x0, y0, x1, y1] = range(b);
    // Keep large panels out of the grid instead of duplicating them into thousands of cells.
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 256) { large.push(id); return; }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const key = `${x},${y}`, bucket = cells.get(key);
      if (bucket) bucket.push(id); else cells.set(key, [id]);
    }
  });
  const seen = new Uint32Array(obstacles.length);
  let query = 0;
  return (box: RadialBox) => {
    if (++query === 0xffffffff) { seen.fill(0); query = 1; }
    let area = 0;
    const [x0, y0, x1, y1] = range(box);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      for (const id of cells.get(`${x},${y}`) ?? []) {
        if (seen[id] === query) continue;
        seen[id] = query;
        area += overlap(box, obstacles[id]);
      }
    }
    for (const id of large) area += overlap(box, obstacles[id]);
    return area;
  };
}

/** Walk a rounded outline at a fixed distance from the source's edge. */
function orbitPoint(anchor: RadialBox, distance: number, radius: number) {
  const quarter = Math.PI * radius / 2;
  const lengths = [anchor.w, quarter, anchor.h, quarter, anchor.w, quarter, anchor.h, quarter];
  const perimeter = lengths.reduce((sum, length) => sum + length, 0);
  let t = ((distance % perimeter) + perimeter) % perimeter;
  const right = anchor.x + anchor.w, bottom = anchor.y + anchor.h;
  for (let segment = 0; segment < lengths.length; segment++) {
    if (t > lengths[segment]) { t -= lengths[segment]; continue; }
    if (segment === 0) return { x: anchor.x + t, y: anchor.y - radius };
    if (segment === 2) return { x: right + radius, y: anchor.y + t };
    if (segment === 4) return { x: right - t, y: bottom + radius };
    if (segment === 6) return { x: anchor.x - radius, y: bottom - t };
    const corner = (segment - 1) / 2;
    const angle = -Math.PI / 2 + corner * Math.PI / 2 + t / radius;
    return { x: (corner < 2 ? right : anchor.x) + Math.cos(angle) * radius,
      y: (corner < 1 || corner > 2 ? anchor.y : bottom) + Math.sin(angle) * radius };
  }
  return { x: anchor.x, y: anchor.y - radius };
}

/** Rotate a contiguous arc as one group; collisions never change individual radii. */
export function radialPositions(anchor: RadialBox, count: number, obstacles: RadialBox[], viewport: RadialBox, names?: { w: number; h: number }[]) {
  if (!count) return [];
  const obstacleArea = indexRadialObstacles(obstacles);
  const radius = gap + size / 2, pitch = size + 12;
  const perimeter = 2 * (anchor.w + anchor.h) + 2 * Math.PI * radius;
  const capacity = Math.max(1, Math.floor(perimeter / pitch));
  type Position = { x: number; y: number; nameSide?: "left" | "right"; nameWidth?: number };
  let best: Position[] = [], score = Infinity;
  for (let step = 0; step < 64; step++) {
    const offset = (step % 2 ? 1 : -1) * Math.ceil(step / 2) * Math.PI / 32;
    let cost = Math.abs(offset) * 15;
    const positions: Position[] = [];
    for (let i = 0; i < count; i++) {
      // Extra rings are only for neighbor counts that cannot fit on the first orbit.
      const ring = Math.floor(i / capacity), n = Math.min(capacity, count - ring * capacity);
      const point = orbitPoint(anchor, anchor.w / 2 + offset / (2 * Math.PI) * perimeter
        + (i % capacity - (n - 1) / 2) * pitch, radius + ring * pitch);
      const icon = { x: point.x - size / 2, y: point.y - size / 2, w: size, h: size };
      cost += (size * size - overlap(icon, viewport)) * 1e7 + overlap(icon, anchor) * 1e6 + obstacleArea(icon);
      const name = names?.[i];
      let nameSide: "left" | "right" = "right", nameCost = Infinity;
      if (name) for (const side of ["right", "left"] as const) {
        const footprint = { x: side === "left" ? icon.x + 15 - name.w : icon.x, y: icon.y, w: name.w + 15, h: Math.max(size, name.h) };
        const candidateCost = (footprint.w * footprint.h - overlap(footprint, viewport)) * 100
          + overlap(footprint, anchor) + obstacleArea(footprint);
        if (candidateCost < nameCost) { nameCost = candidateCost; nameSide = side; }
      }
      // Names unfold only on hover, so they are softer preferences than icon clearance.
      if (name) cost += nameCost * 0.1;
      positions.push({ x: icon.x, y: icon.y, ...(name ? { nameSide, nameWidth: name.w } : {}) });
    }
    if (cost < score) { best = positions; score = cost; }
  }
  return best;
}

/** Conservative bounds of every icon/name candidate evaluated by radialPositions. */
export function radialCandidateBounds(anchor: RadialBox, count: number, names: { w: number; h: number }[]): RadialBox {
  const radius = gap + size / 2, pitch = size + 12;
  const capacity = Math.max(1, Math.floor((2 * (anchor.w + anchor.h) + 2 * Math.PI * radius) / pitch));
  const rings = Math.floor(Math.max(0, count - 1) / capacity);
  const padding = radius + rings * pitch + size / 2 + Math.max(0, ...names.map(n => Math.max(n.w, n.h)));
  return { x: anchor.x - padding, y: anchor.y - padding, w: anchor.w + padding * 2, h: anchor.h + padding * 2 };
}
