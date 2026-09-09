import { expect, test } from "bun:test";
import { cardKey, openCard, removeCard, parseStack, replaceActiveCard, type ReaderCard, type ReaderStack } from "../client/src/readerState";

const empty: ReaderStack = { cards: [], active: null, visible: true, scrollTop: 0 };
const item = (id: string): ReaderCard => ({ kind: "item", id });
const keys = (stack: ReaderStack) => stack.cards.map(cardKey);

test("Preview replacement keeps its position among pinned cards", () => {
  let stack: ReaderStack = { ...empty, cards: [item("a"), item("b"), item("c")], preview: "item:b", active: "item:b" };
  stack = openCard(stack, item("d"));
  expect(keys(stack)).toEqual(["item:a", "item:d", "item:c"]);
  expect(stack.preview).toBe("item:d");
  expect(stack.active).toBe("item:d");
  stack = openCard(stack, item("d"));
  expect(keys(stack)).toEqual(["item:a", "item:d", "item:c"]);
  expect(stack.preview).toBe("item:d");
  expect(stack.active).toBe("item:d");
});

test("opening a Pinned card dismisses the Preview and preserves other pins", () => {
  let stack = openCard(openCard(empty, item("a"), "pinned"), item("b"));
  stack = openCard(stack, item("c"), "pinned");
  expect(keys(stack)).toEqual(["item:a", "item:c"]);
  expect(stack.preview).toBeUndefined();
  expect(stack.active).toBe("item:c");
});

test("returning to an existing Pinned card dismisses the Preview without duplicates", () => {
  const stack = openCard(openCard(empty, item("a"), "pinned"), item("b"));
  for (const mode of ["preview", "pinned"] as const) {
    const next = openCard(stack, item("a"), mode);
    expect(keys(next)).toEqual(["item:a"]);
    expect(next.preview).toBeUndefined();
    expect(next.active).toBe("item:a");
  }
});

test("pinning a Preview promotes it without a duplicate or moving it", () => {
  let stack: ReaderStack = { ...empty, cards: [item("a"), item("b")], preview: "item:a", active: "item:a" };
  stack = openCard(stack, item("a"), "pinned");
  expect(keys(stack)).toEqual(["item:a", "item:b"]);
  expect(stack.preview).toBeUndefined();
  stack = openCard(stack, item("c"));
  expect(keys(stack)).toEqual(["item:a", "item:b", "item:c"]);
  expect(stack.preview).toBe("item:c");
});

test("closing Preview clears its slot and keeps the remaining active card valid", () => {
  let stack = openCard(openCard(empty, item("a"), "pinned"), item("b"));
  stack = removeCard(stack, "item:b");
  expect(stack.preview).toBeUndefined();
  expect(stack.active).toBe("item:a");
  stack = removeCard(stack, "item:a");
  expect(stack.active).toBeNull();
  expect(stack.visible).toBe(false);
  expect(openCard(stack, item("c")).preview).toBe("item:c");
});

test("saved stacks discard invalid and duplicate cards while preserving visibility and valid Preview mode", () => {
  const saved = parseStack({
    cards: [item("a"), item("a"), null, { kind: "code", id: "source" }, item("b")],
    active: "missing", preview: "item:b", visible: false, scrollTop: -20,
  })!;
  expect(keys(saved)).toEqual(["item:a", "item:b"]);
  expect(saved.active).toBe("item:b");
  expect(saved.preview).toBe("item:b");
  expect(saved.visible).toBe(false);
  expect(saved.scrollTop).toBe(0);
  expect(parseStack({ ...saved, preview: "missing" })?.preview).toBeUndefined();
  expect(parseStack({ cards: [item("a")], active: "item:a" })?.preview).toBeUndefined();
  expect(parseStack(null)).toBeUndefined();
});

test("legacy route upgrades keep the active card's position and mode", () => {
  const replacement: ReaderCard = { kind: "mapping", id: "stable" };
  for (const mode of ["preview", "pinned"] as const) {
    const before = openCard(openCard(empty, item("a"), "pinned"), item("legacy"), mode);
    const after = replaceActiveCard(before, replacement);
    expect(keys(after)).toEqual(["item:a", "mapping:stable"]);
    expect(after.active).toBe("mapping:stable");
    expect(after.preview).toBe(mode === "preview" ? "mapping:stable" : undefined);
    expect(keys(before)).toEqual(["item:a", "item:legacy"]);
  }
});
