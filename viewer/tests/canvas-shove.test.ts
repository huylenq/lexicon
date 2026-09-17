import { expect, test } from "bun:test";
import { shoveBodies, SHOVE_MAX_CHECKS, type ShoveBody } from "../client/src/canvas/shove";

const box = (id: string, x: number, y = 0): ShoveBody => ({ id, x, y, w: 100, h: 60 });
const right = { x: 10, y: 0 };

test("contact propagates through a row without moving the dragged item or distant items", () => {
  const input = [box("a", 70), box("b", 120), box("c", 240), box("d", 900)];
  const result = shoveBodies(input, new Set(["a"]), right);
  expect([...result.moved]).toEqual([["b", { x: 66, y: 0 }], ["c", { x: 62, y: 0 }]]);
  expect(input[1].x).toBe(120);
  expect(result.limited).toBe(false);
});

test("all four directions separate contacts", () => {
  for (const direction of [right, { x: -10, y: 0 }, { x: 0, y: 10 }, { x: 0, y: -10 }]) {
    const result = shoveBodies([box("a", 0), box("b", 0)], new Set(["a"]), direction);
    expect(result.moved.get("b")).toEqual({ x: Math.sign(direction.x) * 116, y: Math.sign(direction.y) * 76 });
  }
});

test("multi-selected and locked bodies stay fixed; displaced neighbors clear them", () => {
  const input = [box("a", 70), box("b", 120), box("c", 260), { ...box("lock", 400), fixed: true }];
  const result = shoveBodies(input, new Set(["a", "c"]), right);
  expect([...result.moved.keys()]).toEqual(["b"]);
  expect(result.moved.get("b")).toEqual({ x: 396, y: 0 });
});

test("only a touched chain resolves; existing remote overlaps remain authored", () => {
  expect(shoveBodies([box("a", 0), box("b", 900), box("c", 900)], new Set(["a"]), right).moved.size).toBe(0);
});

test("spatial lookup keeps contact checks local in a 10,000 item plane", () => {
  const input = Array.from({ length: 10_000 }, (_, i) => box(String(i), i % 100 * 180, Math.floor(i / 100) * 140));
  input[0].x = 100;
  const result = shoveBodies(input, new Set(["0"]), right);
  expect(result.moved.size).toBe(1);
  expect(result.checks).toBeLessThan(40);
});

test("oversized grouping bounds use the overflow index", () => {
  const result = shoveBodies([{ ...box("group", -10_000), w: 20_000, h: 20_000 }, box("peer", 9990)], new Set(["group"]), right);
  expect(result.moved.get("peer")).toEqual({ x: 26, y: 0 });
});

test("separated oversized selections cannot bypass the work budget", () => {
  const input = Array.from({ length: 2000 }, (_, i) => ({ ...box(String(i), i * 30_000), w: 20_000, h: 20_000 }));
  const result = shoveBodies(input, new Set(input.map(b => b.id)), right);
  expect(result.checks).toBe(SHOVE_MAX_CHECKS);
  expect(result.limited).toBe(true);
  expect(result.moved.size).toBe(0);
});

test("dense contact chains terminate within the work budget and preserve fixed bodies", () => {
  const input = Array.from({ length: 1000 }, (_, i) => box(String(i), 0));
  input[1].fixed = true;
  const result = shoveBodies(input, new Set(["0"]), right);
  expect(result.limited).toBe(true);
  expect(result.checks).toBe(SHOVE_MAX_CHECKS);
  expect(result.moved.has("0")).toBe(false);
  expect(result.moved.has("1")).toBe(false);
});
