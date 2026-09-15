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

/** Screen-space satellites; try nearby angles before accepting an occupied slot. */
export function radialPositions(anchor: RadialBox, count: number, obstacles: RadialBox[], viewport: RadialBox, names?: { w: number; h: number }[]) {
  const obstacleArea = indexRadialObstacles(obstacles);
  const placed: RadialBox[] = [];
  const positions: { x: number; y: number; nameSide?: "left" | "right"; nameWidth?: number }[] = [];
  for (let i = 0; i < count; i++) {
    const ring = Math.floor(i / 12), n = Math.min(12, count - ring * 12);
    const angle = -Math.PI / 2 + (i % 12) * Math.PI * 2 / n;
    let best: RadialBox | undefined, bestFootprint: RadialBox | undefined, bestSide: "left" | "right" = "right", score = Infinity;
    // Search the whole circumference and expand outward when nearby space is busy.
    // Reject collisions before comparing distance, so a close occupied slot never wins.
    for (let expansion = 0; expansion < 6; expansion++) for (let step = 0; step < 48; step++) {
      const offset = (step % 2 ? 1 : -1) * Math.ceil(step / 2) * Math.PI / 24;
      const r = gap + size / 2 + (ring + expansion) * (size + 8);
      const x = Math.round(anchor.x + anchor.w / 2 + Math.cos(angle + offset) * (anchor.w / 2 + r) - size / 2);
      const y = Math.round(anchor.y + anchor.h / 2 + Math.sin(angle + offset) * (anchor.h / 2 + r) - size / 2);
      const candidate = { x, y, w: size, h: size };
      for (const side of (names ? ["right", "left"] : ["right"]) as ("left" | "right")[]) {
      const name = names?.[i];
      const footprint = name ? { x: side === "left" ? x + 15 - name.w : x, y, w: name.w + 15, h: Math.max(size, name.h) } : candidate;
      const padded = { x: footprint.x - 5, y: footprint.y - 5, w: footprint.w + 10, h: footprint.h + 10 };
      const outside = footprint.w * footprint.h - overlap(footprint, viewport);
      const collisions = overlap(padded, anchor) + placed.reduce((sum, p) => sum + overlap(padded, p), 0)
        + obstacleArea(padded);
      const cost = outside * 1e7 + collisions * 1e4 + expansion * 40 + Math.abs(offset) * 15;
      if (cost < score) { best = candidate; bestFootprint = footprint; bestSide = side; score = cost; }
      }
    }
    // Only an impossibly crowded viewport needs the minimum-overlap fallback.
    best!.x = Math.max(viewport.x, Math.min(best!.x, viewport.x + viewport.w - size));
    best!.y = Math.max(viewport.y, Math.min(best!.y, viewport.y + viewport.h - size));
    placed.push(bestFootprint!);
    positions.push({ x: best!.x, y: best!.y, ...(names ? { nameSide: bestSide, nameWidth: names[i].w } : {}) });
  }
  return positions;
}
