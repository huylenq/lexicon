import { expect, test } from "bun:test";
import { readerLayout, readerRailHeight, readerTilePosition } from "../client/src/readerGeometry";

test("tile columns change at the CSS grid boundaries and remain usable on narrow screens", () => {
  for (const [width, columns] of [[250, 1], [471, 1], [472, 2], [699, 2], [700, 3]]) {
    const layout = readerLayout(width, 900);
    expect(layout.columns).toBe(columns);
    const first = readerTilePosition(0, layout, "top");
    const last = readerTilePosition(columns - 1, layout, "top");
    expect(first.x).toBe(12);
    expect(last.x + layout.tileWidth).toBeCloseTo(width - 12);
    expect(readerTilePosition(0, layout, "bottom").x).toBe(last.x);
  }
});

test("both edge rails and navigation share the same capped row heights", () => {
  const layout = readerLayout(700, 900);
  expect(readerRailHeight(0, layout)).toBe(0);
  expect(readerRailHeight(3, layout)).toBe(60);
  expect(readerRailHeight(4, layout)).toBe(104);
  expect(readerRailHeight(100, layout)).toBe(192);
  expect(layout.collapsedHeight).toBe(168);
  expect(readerTilePosition(99, layout, "top").rowOffset).toBe(144);
  const short = readerLayout(390, 120);
  expect(short.collapsedHeight).toBe(36);
  expect(readerRailHeight(100, short)).toBe(60);
});
