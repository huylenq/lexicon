import { expect, test } from "bun:test";
import { parseDraftSource } from "../client/src/draftSource";
import { codeParams } from "../client/src/sourceNavigation";

test("draft evidence history retains exact candidate identity while ordinary navigation clears it", () => {
  const draft = { agentId: "task", draftId: "candidate-2", itemId: "order", side: "after" as const, linkIndex: 1 };
  const location = { target: 'code:["rules.md","heading","approval"]', draft };
  const params = codeParams(new URLSearchParams({ item: "order", codeMapping: "saved-mapping" }), location);
  expect(parseDraftSource(params.get("codeDraft"))).toEqual(draft);
  expect(params.get("code")).toBe(location.target);
  expect(params.get("item")).toBe("order");
  expect(params.has("codeMapping")).toBe(false);
  const saved = codeParams(params, { target: "saved-target", mapping: "saved-mapping" });
  expect(saved.has("codeDraft")).toBe(false);
  expect(saved.get("codeMapping")).toBe("saved-mapping");
});

test("malformed draft source references cannot become arbitrary reader requests", () => {
  const reference = { agentId: "task", draftId: "draft", itemId: "order", side: "before" as const, linkIndex: 0 };
  for (const change of [{ linkIndex: -1 }, { linkIndex: 1.2 }, { side: "saved" }, { agentId: "" }, { draftId: null }])
    expect(parseDraftSource(JSON.stringify({ ...reference, ...change }))).toBeUndefined();
  expect(parseDraftSource("not-json")).toBeUndefined();
  expect(parseDraftSource(JSON.stringify({ ...reference, file: "/outside" }))).toEqual(reference);
});
