import { expect, test } from "bun:test";
import { parseModel } from "../server/model";
import { defaults } from "../client/src/graph/storage";
import { resolveCanvasView, withCanvasSkin } from "../client/src/canvas/viewState";

const model = (architecture: boolean) => parseModel(`<lexicon schema="3.2" id="test">
  <name>Test</name><description>View preferences.</description>
  <context id="domain"><name>Domain</name><description>Meaning.</description></context>
  ${architecture ? '<system id="system"><name>System</name><description>Structure.</description></system>' : ''}
</lexicon>`);

test("combined views preserve both dimensions when architecture is available", () => {
  const workspace = { ...defaults(), view: "all" as const };
  expect(resolveCanvasView(model(true), workspace).dimension).toBe("all");
  expect(resolveCanvasView(model(false), workspace).dimension).toBe("domain");
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
