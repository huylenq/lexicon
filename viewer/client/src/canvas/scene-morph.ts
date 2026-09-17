import type { ConnectionShape } from '../../../shared/canvas-schema';
import { atom, type Editor } from 'tldraw';
import { isPrimary } from './references';
import { morphDuration } from './route-morph';
import { routeMorph, type RouteFrame } from './useRouteMorph';

/** Animate centerlines together before computing crossings from their displayed positions. */
export function createSceneMorph(editor: Editor) {
  const revision = atom('Displayed connection frame', 0);
  const routes = new Map<string, { target: RouteFrame; shown: RouteFrame; start: number; interpolate?: (t: number) => RouteFrame }>();
  let frame: number | undefined;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const refresh = () => revision.set(revision.get() + 1);
  media.addEventListener('change', refresh);
  editor.disposables.add(() => { if (frame !== undefined) cancelAnimationFrame(frame); media.removeEventListener('change', refresh); });
  return (shapes: ConnectionShape[]) => {
    revision.get();
    const dragging = editor.inputs.getIsDragging(), now = performance.now();
    const active = new Set<string>(shapes.map(s => s.id));
    for (const id of routes.keys()) if (!active.has(id)) routes.delete(id);
    let moving = false;
    const result = shapes.map(shape => {
      if (!isPrimary(shape)) return { shape, animating: false };
      const target: RouteFrame = { points: shape.props.points.map(p => ({ x: p.x + shape.x, y: p.y + shape.y })),
        label: { x: shape.x + shape.props.labelX, y: shape.y + shape.props.labelY } };
      let state = routes.get(shape.id);
      if (!state || dragging || media.matches) {
        state = { target, shown: target, start: now };
        routes.set(shape.id, state);
      } else if (!routeMorph.same(state.target, target)) {
        state.interpolate = routeMorph.prepare(state.shown, target);
        state.target = target; state.start = now;
      }
      if (state.interpolate) {
        const t = Math.min(1, (now - state.start) / morphDuration);
        state.shown = state.interpolate(1 - (1 - t) ** 3);
        if (t === 1) state.interpolate = undefined;
      }
      const animating = !!state.interpolate;
      moving ||= animating;
      if (!animating) return { shape, animating };
      const points = state.shown.points.map(p => ({ x: p.x - shape.x, y: p.y - shape.y }));
      return { animating, shape: { ...shape, props: { ...shape.props, points,
        path: points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' '),
        labelX: state.shown.label.x - shape.x, labelY: state.shown.label.y - shape.y } } };
    });
    if (moving && frame === undefined) frame = requestAnimationFrame(() => { frame = undefined; refresh(); });
    else if (!moving && frame !== undefined) { cancelAnimationFrame(frame); frame = undefined; }
    return result;
  };
}
