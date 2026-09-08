import type { Bounds, Point } from "../../../../shared/canvas-geometry";
import type { FortTower, WallSection } from "./generate";

export const shifted = (p: Point, n: Point, amount: number, rise = 0): Point => ({ x: p.x + n.x * amount, y: p.y + n.y * amount - rise });

/** These are the actual rendered surfaces, shared with road clearance. */
export function wallGeometry(wall: WallSection) {
  const { a, b, normal: n, thickness: w, height: h } = wall;
  const ao = shifted(a, n, w / 2), bo = shifted(b, n, w / 2);
  const ai = shifted(a, n, -w / 2), bi = shifted(b, n, -w / 2);
  const at = shifted(ao, n, 0, h), bt = shifted(bo, n, 0, h);
  const ait = shifted(ai, n, 0, h), bit = shifted(bi, n, 0, h);
  const front = n.y >= 0 ? [ao, bo, bt, at] : [ai, bi, bit, ait];
  const walk = [at, bt, bit, ait];
  const plinth = [ao, bo, shifted(bo, n, 0, h * .25), shifted(ao, n, 0, h * .25)];
  const merlon = wall.merlon && h > 5 ? [at, bt, shifted(bt, n, 0, 5), shifted(at, n, 0, 5)] : [];
  const cap = merlon.length ? [shifted(at, n, 0, 5), shifted(bt, n, 0, 5), shifted(bt, n, -3, 5), shifted(at, n, -3, 5)] : [];
  return { front, walk, plinth, merlon, cap };
}

export function towerSpriteBounds(t: Pick<FortTower, "at" | "radius" | "height">): Bounds {
  return { x: t.at.x - t.radius - 3, y: t.at.y - t.height - 12, w: t.radius * 2 + 6, h: t.height + 17 };
}

/** Includes the sprite plus the shadow, roof and flag of the vector fallback. */
export function towerFootprint(t: Pick<FortTower, "at" | "radius" | "height">): Bounds {
  const b = towerSpriteBounds(t), top = t.at.y - t.height - 21;
  return { x: b.x - 2, y: top, w: b.w + 9, h: Math.max(b.y + b.h, t.at.y + t.radius * .7 + 4) - top };
}
