import { expect, test } from "bun:test";
import { atom, Box, computed, type Editor } from "tldraw";
import type { ConnectionShape } from "../shared/canvas-schema";
import { LexiconConnectionUtil } from "../client/src/canvas/shapes";

test("zoom culling follows live route bounds after animation without a shape record change", () => {
  const shape = { id: "shape:edge", type: "lexicon-connection" } as ConnectionShape;
  const bounds = atom("Animated route bounds", new Box(0, 0, 100, 100));
  const viewport = atom("Zoomed viewport", new Box(1000, 1000, 200, 200));
  const editor = {
    getShapePageBounds: () => bounds.get(),
    getViewportPageBounds: () => viewport.get(),
  } as unknown as Editor;
  const util = new LexiconConnectionUtil(editor);
  const canCull = computed("Edge may be culled", () => util.canCull(shape));
  expect(canCull.get()).toBe(true);
  // The spatial index still knows the old bounds, but the animation has arrived.
  bounds.set(new Box(900, 1100, 400, 0));
  expect(canCull.get()).toBe(false); // Both endpoints are outside; the line crosses the viewport.
  viewport.set(new Box(1050, 1050, 100, 100));
  expect(canCull.get()).toBe(false);
  viewport.set(new Box(1400, 1050, 100, 100));
  expect(canCull.get()).toBe(true); // Truly off-screen edges still cull.
  bounds.set(new Box(1450, 900, 0, 400));
  expect(canCull.get()).toBe(false);
});
