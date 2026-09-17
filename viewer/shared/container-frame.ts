import type { Bounds } from "./canvas-geometry";

/** Shared by automatic layout and rendered container boundaries. */
export function fitContainerFrame(boxes: Bounds[], heading: { w: number; h: number }): Bounds {
  if (!boxes.length) return { x: 0, y: 0, w: Math.max(260, heading.w + 24), h: heading.h + 44 };
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  const right = Math.max(...boxes.map(b => b.x + b.w)), bottom = Math.max(...boxes.map(b => b.y + b.h));
  return { x: x - 28, y: y - heading.h - 22,
    w: Math.max(260, right - x + 56, heading.w + 24), h: bottom - y + heading.h + 50 };
}
