import { expect, test } from "bun:test";
import { parseModel } from "../server/model";
import { defaults } from "../client/src/graph/storage";
import { resolveCanvasView, withCanvasSkin } from "../client/src/canvas/viewState";

const model = (architecture: boolean) => parseModel(`<lexicon schema="3.2" id="test">
  <name>Test</name><description>View preferences.</description>
  <context id="domain"><name>Domain</name><description>Meaning.</description></context>
  ${architecture ? '<system id="system"><name>System</name><description>Structure.</description></system>' : ''}
</lexicon>`);

test("Combined remains available with Domain and Linked Sources alone", () => {
  const workspace = { ...defaults(), view: "all" as const };
  expect(resolveCanvasView(model(true), workspace).dimension).toBe("all");
  expect(resolveCanvasView(model(false), workspace).dimension).toBe("all");
  expect(workspace.view).toBe("all");
});

test("Atlas skins remain available when switching between Domain and Architecture", () => {
  const workspace = withCanvasSkin({ ...defaults(), view: "domain" }, "village");
  expect(resolveCanvasView(model(true), workspace).skin).toBe("village");
  const architecture = { ...workspace, view: "architecture" as const };
  expect(resolveCanvasView(model(true), architecture).skin).toBe("village");
  expect(resolveCanvasView(model(true), architecture).atlasAvailable).toBe(true);
  expect(resolveCanvasView(model(true), { ...architecture, view: "domain" }).skin).toBe("village");
  const standard = withCanvasSkin(workspace, "standard");
  expect(resolveCanvasView(model(true), standard).skin).toBe("standard");
  expect(standard.atlasSkin).toBe("village");
  expect(workspace.map).toBe(true);
});

test("Source works without architecture and preserves the last semantic view and skin", () => {
  const workspace = { ...withCanvasSkin(defaults(), "village"), view: "architecture" as const, source: true };
  expect(resolveCanvasView(model(false), workspace).dimension).toBe("source");
  expect(resolveCanvasView(model(true), workspace).atlasAvailable).toBe(true);
  expect(resolveCanvasView(model(true), workspace).skin).toBe("village");
  expect(resolveCanvasView(model(true), { ...workspace, source: false })).toMatchObject({ dimension: "architecture", skin: "village" });
});

test("legacy drawing ownership migrates and retired source expansion preferences are discarded", async () => {
  const { readWorkspace } = await import("../client/src/graph/storage");
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: () => JSON.stringify({ drawingLayer: "source", expanded: ["order"], allCode: true, view: "domain" }),
  } });
  try {
    const workspace = readWorkspace("legacy");
    expect(workspace.drawingPlane).toBe("source");
    expect(workspace.view).toBe("domain");
    expect("expanded" in workspace).toBe(false);
    expect("allCode" in workspace).toBe(false);
    expect("drawingLayer" in workspace).toBe(false);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
