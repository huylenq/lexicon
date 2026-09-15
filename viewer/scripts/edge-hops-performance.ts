/** Run with `bun scripts/edge-hops-performance.ts`. Geometry timings, not browser frame times. */
import { atom, Mat, type Editor } from "tldraw";
import { connectionDrawing, edgeCornerRadius, edgeCrossingHops } from "../client/src/canvas/rounded-route";
import type { ConnectionShape } from "../shared/canvas-schema";

function benchmark(count: number, dense: boolean, rounding: number) {
  const shapes = Array.from({ length: count }, (_, i) => {
    const horizontal = i % 2 === 0, n = Math.floor(i / 2), length = dense ? count / 2 * 24 + 48 : 160;
    const points = horizontal ? [{ x: 0, y: 80 }, { x: length, y: 80 }, { x: length, y: 180 }]
      : [{ x: 80, y: 0 }, { x: 80, y: length }, { x: 180, y: length }];
    return { id: `shape:bench-${i}`, type: "lexicon-connection", x: dense ? (horizontal ? 0 : n * 24) : n % 20 * 240,
      y: dense ? (horizontal ? n * 24 : 0) : Math.floor(n / 20) * 240,
      props: { graphId: `r${i}`, points, path: points.map((p, j) => `${j ? "L" : "M"} ${p.x} ${p.y}`).join(" "),
        labelX: -100, labelY: -100, labelWidth: 60 } } as unknown as ConnectionShape;
  });
  const state = atom("Benchmark shapes", shapes);
  const editor = { getCurrentPageShapes: () => state.get(), isShapeHidden: () => false,
    getShapePageTransform: (s: ConnectionShape) => Mat.Translate(s.x, s.y),
    getPointInShapeSpace: (s: ConnectionShape, p: { x: number; y: number }) => ({ x: p.x - s.x, y: p.y - s.y }),
  } as unknown as Editor;
  const percentile = (samples: number[], fraction: number) => +samples.sort((a, b) => a - b)[Math.floor(samples.length * fraction)].toFixed(3);
  const results = [];
  edgeCornerRadius.set(rounding);
  for (const enabled of [false, true]) {
    edgeCrossingHops.set(enabled);
    const rebuild: number[] = [], cached: number[] = [];
    for (let frame = 0; frame < 70; frame++) {
      const moved = shapes.map((shape, i) => i === 0 ? { ...shape, y: shape.y + frame % 2 } : shape);
      state.set(moved);
      let start = performance.now();
      for (const shape of moved) connectionDrawing(shape, editor);
      const elapsed = performance.now() - start;
      start = performance.now();
      for (const shape of moved) connectionDrawing(shape, editor);
      if (frame >= 10) { rebuild.push(elapsed); cached.push(performance.now() - start); }
    }
    results.push({ enabled, rebuildMedianMs: percentile(rebuild, .5), rebuildP95Ms: percentile(rebuild, .95),
      cachedMedianMs: percentile(cached, .5), cachedP95Ms: percentile(cached, .95) });
  }
  return { count, dense, rounding, results };
}
console.log(JSON.stringify([benchmark(300, false, 0), benchmark(300, false, 16), benchmark(100, true, 0), benchmark(1000, false, 0)], null, 2));

process.exit(0);
