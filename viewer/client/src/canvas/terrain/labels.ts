import type { Bounds, Point } from "../../../../shared/canvas-geometry";

/** Follow the broad upper coast, smoothing out bays so lettering stays upright.
 * The reserved label clearing keeps the text and drag ribbon away from landmarks. */
export function landLabelCurve(coast: Point[], frame: Bounds) {
  const left = frame.x + 14, right = frame.x + frame.w - 14, middle = (left + right) / 2;
  const topAt = (x: number) => {
    const crossings = coast.flatMap((a, i) => {
      const b = coast[(i + 1) % coast.length];
      if (a.x === b.x || x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x)) return [];
      return [a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x)];
    });
    return crossings.length ? Math.min(...crossings) : frame.y;
  };
  const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
  const l = topAt(left), r = topAt(right), m = topAt(middle);
  const tilt = clamp((r - l) * .3, 8);
  const bend = clamp((m - (l + r) / 2) * .4 - 22, 26);
  const baseline = frame.y + frame.h / 2 + 10;
  const start = { x: left, y: baseline - tilt }, end = { x: right, y: baseline + tilt };
  const control = { x: middle, y: baseline + bend };
  const points = Array.from({ length: 25 }, (_, i) => {
    const t = i / 24;
    return { x: left + (right - left) * t,
      y: (1-t)**2 * start.y + 2*(1-t)*t * control.y + t*t * end.y };
  });
  // Match the SVG's 44px invisible stroke, centered on the text's visual middle.
  const hit = [...points.map(p => ({ x: p.x, y: p.y - 30 })),
    ...[...points].reverse().map(p => ({ x: p.x, y: p.y + 14 }))];
  return { path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`, points, hit };
}
