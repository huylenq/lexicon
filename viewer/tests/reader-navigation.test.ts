import { expect, test } from "bun:test";
import { cardParams, routeCard } from "../client/src/readerNavigation";
import type { ReaderCard } from "../client/src/readerState";

test("card links round-trip every reader selection while retaining the independent Code location", () => {
  const current = new URLSearchParams({ item: "old", selection: '{"kind":"item","id":"stale"}',
    focus: "code", shape: "shape:old", code: "code:source", codeMapping: "source-owner", codePane: "closed", query: "context" });
  const before = current.toString();
  const cards: ReaderCard[] = [
    { kind: "overview" }, { kind: "item", id: "concept" }, { kind: "mapping", id: '["concept","definition"]' },
    { kind: "bundle", relationships: ["b", "a"], mappings: ["mapping"] },
  ];
  for (const card of cards) {
    const next = cardParams(current, card);
    expect(routeCard(next)).toEqual(card);
    expect(next.get("code")).toBe("code:source");
    expect(next.get("codeMapping")).toBe("source-owner");
    expect(next.get("codePane")).toBe("closed");
    expect(next.get("query")).toBe("context");
    expect(next.has("focus") || next.has("shape")).toBe(false);
  }
  expect(current.toString()).toBe(before);
  expect(routeCard(cardParams(current))).toEqual({ kind: "overview" });
});
