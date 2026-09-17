import { useLayoutEffect, useRef, useState } from "react";
import type { Point } from "../graph/layout";
import { endpointOffset, matchRoutePoints, mixPoint, morphDuration, offsetPoint, routeFractionAt, routeStops, sameRoute, simplifyRoute, softenRoute } from "./route-morph";

type Morph<T> = { same: (a: T, b: T) => boolean; attach: (shown: T, target: T) => T; prepare: (from: T, to: T) => (t: number) => T };
/** Drag previews are already orthogonal. Animate only settled geometry changes. */
export function useGeometryMorph<T>(value: T, morph: Morph<T>, dragging: boolean, enabled = true) {
  const target = useRef(value), shown = useRef(value);
  const frame = useRef<number>();
  const moving = useRef(false), latest = useRef(morph);
  latest.current = morph;
  const [, render] = useState(0);
  const redraw = () => render(n => n + 1);
  const cancel = () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
  };
  const snap = () => { cancel(); moving.current = false; shown.current = target.current; };
  const start = () => {
    cancel();
    const interpolate = latest.current.prepare(shown.current, target.current), startTime = performance.now();
    moving.current = true;
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startTime) / morphDuration));
      shown.current = interpolate(1 - (1 - progress) ** 3);
      moving.current = progress < 1;
      frame.current = progress < 1 ? requestAnimationFrame(tick) : undefined;
      redraw();
    };
    tick(startTime);
  };
  useLayoutEffect(() => {
    const changed = !morph.same(target.current, value);
    target.current = value;
    if (dragging || !enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (changed || moving.current) { snap(); redraw(); }
      return;
    }
    if (changed) start();
  });
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => { if (media.matches) { snap(); redraw(); } };
    media.addEventListener("change", stop);
    return () => { cancel(); media.removeEventListener("change", stop); };
  }, []);
  return { value: enabled && !dragging ? shown.current : value, animating: enabled && !dragging && moving.current };
}

export type RouteFrame = { points: Point[]; label: Point };
export const routeMorph: Morph<RouteFrame> = {
  same: (a, b) => sameRoute(a.points, b.points) && sameRoute([a.label], [b.label]),
  attach(from, to) {
    if (!from.points.length || !to.points.length) return to;
    if (sameRoute([from.points[0], from.points.at(-1)!], [to.points[0], to.points.at(-1)!])) return from;
    const base = simplifyRoute(from.points), stops = routeStops(base);
    return { points: base.map((p, i) => offsetPoint(p, endpointOffset(from.points, to.points, stops[i]))),
      label: offsetPoint(from.label, endpointOffset(from.points, to.points, routeFractionAt(from.label, base, stops))) };
  },
  prepare(from, to) {
    const [a, b] = matchRoutePoints(from.points, to.points);
    return t => t === 0 ? from : t === 1 ? to : {
      points: softenRoute(a.map((p, i) => mixPoint(p, b[i], t)), 18 * Math.sin(Math.PI * t)),
      label: mixPoint(from.label, to.label, t),
    };
  },
};
const zero = { x: 0, y: 0 };
export function useRouteMorph(points: Point[], label = zero, origin = zero, dragging = false, enabled = true) {
  const world = { points: points.map(p => offsetPoint(p, origin)), label: offsetPoint(label, origin) };
  const morph = useGeometryMorph(world, routeMorph, dragging, enabled);
  return { points: morph.value.points.map(p => ({ x: p.x - origin.x, y: p.y - origin.y })),
    label: { x: morph.value.label.x - origin.x, y: morph.value.label.y - origin.y }, animating: morph.animating };
}
