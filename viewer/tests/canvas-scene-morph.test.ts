import { expect, test, spyOn } from 'bun:test';
import type { Editor } from 'tldraw';
import type { ConnectionShape } from '../shared/canvas-schema';
import { createSceneMorph } from '../client/src/canvas/scene-morph';
import { modelShapeId } from '../client/src/canvas/references';
import { crossingDrawings } from '../client/src/canvas/edge-hops';

test('settling crossed routes animates their centerlines and keeps the underpass at the displayed crossing', () => {
  const oldWindow = globalThis.window, oldRAF = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  let now = 0, dragging = true, reduced = false;
  const clock = spyOn(performance, 'now').mockImplementation(() => now);
  const disposables = new Set<() => void>();
  Object.assign(globalThis, { window: { matchMedia: () => ({ get matches() { return reduced; }, addEventListener() {}, removeEventListener() {} }) },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
  const shape = (id: string, points: { x: number; y: number }[]) => ({ id: modelShapeId(id), type: 'lexicon-connection', x: 0, y: 0, meta: {},
    props: { graphId: id, points, path: points.map((p,i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' '), labelX: -100, labelY: -100, labelWidth: 30 } }) as ConnectionShape;
  const h = shape('h', [{ x: 0, y: 50 }, { x: 100, y: 50 }]);
  const v = shape('v', [{ x: 50, y: 0 }, { x: 50, y: 120 }]);
  try {
    const animate = createSceneMorph({ inputs: { getIsDragging: () => dragging }, disposables } as unknown as Editor);
    animate([h, v]);
    const target = shape('h', [{ x: 0, y: 80 }, { x: 100, y: 80 }]);
    dragging = false;
    expect(animate([target, v])[0].animating).toBe(true);
    now = 60;
    const shown = animate([target, v]);
    const y = shown[0].shape.props.points[0].y;
    expect(y).toBeGreaterThan(50); expect(y).toBeLessThan(80);
    const drawn = crossingDrawings(shown.map(({ shape: s }) => ({ id: s.id, x: s.x, y: s.y, drawing: { path: s.props.path, points: s.props.points } })));
    expect(drawn.get(h.id)!.path).toContain('Q');
    const gap = drawn.get(v.id)!.hitPaths!;
    expect(gap).toHaveLength(2);
    expect((gap[0].at(-1)!.y + gap[1][0].y) / 2).toBeCloseTo(y - 6, 6);
    now = 200;
    expect(animate([target, v])[0]).toEqual({ shape: target, animating: false });
    reduced = true;
    expect(animate([h, v])[0]).toEqual({ shape: h, animating: false });
    reduced = false; dragging = true;
    expect(animate([target, v])[0]).toEqual({ shape: target, animating: false });

    // Reallocating an L-shaped route's sides creates a diagonal intermediate
    // centerline even though its endpoints and both settled routes are fixed.
    const before = shape('moving', [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
    const after = shape('moving', [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }]);
    const fixed = shape('fixed', [{ x: -20, y: 30 }, { x: 120, y: 30 }]);
    animate([before, fixed]);
    dragging = false;
    animate([after, fixed]);
    for (const elapsed of [0, 20, 60, 100, 180]) {
      now = 200 + elapsed;
      const frame = animate([after, fixed]);
      const drawings = crossingDrawings(frame.map(({ shape: s }) => ({ id: s.id, x: s.x, y: s.y, drawing: { path: s.props.path, points: s.props.points } })));
      const moving = drawings.get(before.id)!;
      expect(moving.hitPaths).toHaveLength(2);
      expect(drawings.get(fixed.id)!.hitPaths).toHaveLength(1);
      expect(moving.points[0]).toEqual(before.props.points[0]);
      expect(moving.points.at(-1)).toEqual(before.props.points.at(-1));
      if (elapsed === 0 || elapsed === 180) expect(drawings.get(fixed.id)!.path).toContain('Q');
      else {
        const gap = moving.hitPaths!;
        expect(gap[0].at(-1)!.y).toBeLessThan(30);
        expect(gap[1][0].y).toBeGreaterThan(30);
      }
    }
  } finally {
    for (const dispose of disposables) dispose();
    clock.mockRestore();
    Object.assign(globalThis, { window: oldWindow, requestAnimationFrame: oldRAF, cancelAnimationFrame: oldCancel });
  }
});
