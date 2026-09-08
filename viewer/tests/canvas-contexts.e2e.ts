import { expect, test, type Page } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inflate } from "../client/src/canvas/territory";
import { uncoveredArea } from "./canvas-polygon-oracle";
import { atlasEnclosesNodes, renderedTerritory, renderedTerritoryControls, territoryScreenPoint } from "./canvas-territory-helpers";
import { distanceToSegment } from "../client/src/canvas/terrain/generate";

let root: string, projectId: string, xml: string;
test.beforeEach(async ({ request }) => {
  root = await mkdtemp(join(tmpdir(), "lexicon-context-test-"));
  await cp(resolve(import.meta.dirname, "../examples/canvas-workshop"), root, { recursive: true,
    filter: source => !/\/lexicon\/(canvas\.json|\.canvas[^/]*|assets)(\/|$)/.test(source) });
  xml = await readFile(join(root, "lexicon/model.xml"), "utf8");
  projectId = (await (await request.post("/api/projects", { data: { root } })).json()).id;
});
test.afterEach(async ({ request }) => {
  await request.delete(`/api/projects/${projectId}`);
  await rm(root, { recursive: true, force: true });
});
async function open(page: Page) {
  await page.goto(`/p/${projectId}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
}
async function canvasDocument(page: Page) {
  const menu = page.locator(".canvas-file-menu");
  await menu.locator("summary").click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export canvas", exact: true }).click();
  const data = JSON.parse(await readFile((await (await downloading).path())!, "utf8"));
  await menu.locator("summary").click();
  return data;
}
async function snapshot(page: Page) { return Object.values((await canvasDocument(page)).snapshot.store) as any[]; }
const object = (records: any[], id: string) => records.find(r => r.type === "lexicon-object" && r.props.graphId === `item:${id}`);
const card = (page: Page, id: string) => page.locator(`[data-model-id="item:${id}"]`);
async function enclosesNodes(page: Page) {
  const frame = (await card(page, "ordering").boundingBox())!;
  for (const id of ["order", "order-line", "order-total"]) {
    const node = (await card(page, id).boundingBox())!;
    expect(node.x).toBeGreaterThan(frame.x);
    expect(node.y).toBeGreaterThan(frame.y + 35);
    expect(node.x + node.width).toBeLessThan(frame.x + frame.width);
    expect(node.y + node.height).toBeLessThan(frame.y + frame.height);
  }
}

test("Diagram and Atlas automatically encompass inner nodes; node undo restores the derived coast", async ({ page }) => {
  await open(page);
  const initialBoundary = await renderedTerritory(page);
  await page.getByRole("radio", { name: "Diagram", exact: true }).check();
  await expect(card(page, "ordering")).toHaveAttribute("data-context-boundary", "rectangle");
  await enclosesNodes(page);
  const before = await snapshot(page), context = object(before, "ordering");
  const label = (await page.getByRole("button", { name: "concept: Order", exact: true }).boundingBox())!;
  const start = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 180, start.y - 140, { steps: 12 });
  await enclosesNodes(page);
  await page.mouse.up();
  const moved = await snapshot(page), changed = object(moved, "order");
  expect(changed.x).toBeLessThan(0);
  expect(changed.y).toBeLessThan(0);
  expect(object(moved, "ordering").x).toBe(context.x);
  expect(object(moved, "ordering").y).toBe(context.y);
  expect(object(moved, "order-line")).toEqual(object(before, "order-line"));
  await page.getByRole("radio", { name: "Atlas", exact: true }).check();
  await expect(card(page, "ordering")).toHaveAttribute("data-context-boundary", "territory");
  const territory = await renderedTerritory(page);
  expect(territory).not.toEqual(initialBoundary);
  await atlasEnclosesNodes(page);
  expect(object(moved, "ordering")).toEqual(context);
  expect(object(await snapshot(page), "order")).toEqual(changed);
  await page.getByRole("button", { name: /^Undo —/ }).click();
  const undone = await snapshot(page);
  expect(object(undone, "order")).toEqual(object(before, "order"));
  expect(await renderedTerritory(page)).toEqual(initialBoundary);
  await page.getByRole("button", { name: /^Redo —/ }).click();
  expect(await renderedTerritory(page)).toEqual(territory);
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  expect(object(await snapshot(page), "order")).toEqual(changed);
  await page.getByRole("radio", { name: "Diagram", exact: true }).check();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await enclosesNodes(page);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("Atlas border handles and Reshape to contents preserve nodes, support undo, and persist", async ({ page }, info) => {
  await open(page);
  await page.getByRole("button", { name: "context: Ordering", exact: true }).click();
  const before = await snapshot(page), context = object(before, "ordering"), territory = await renderedTerritory(page);
  const point = territory.reduce((a, b) => a.x > b.x ? a : b);
  await page.getByRole("button", { name: "Edit border", exact: true }).click();
  const start = await territoryScreenPoint(page, point);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 90, start.y + 30, { steps: 10 }); await page.mouse.up();
  const edited = await snapshot(page), changed = object(edited, "ordering");
  const editedBoundary = await renderedTerritory(page);
  expect(editedBoundary).not.toEqual(territory);
  expect(changed.props.territory.edits).toHaveLength(1);
  expect(changed.x).toBe(context.x); expect(changed.y).toBe(context.y);
  for (const id of ["order", "order-line", "order-total"]) expect(object(edited, id)).toEqual(object(before, id));
  await expect(card(page, "ordering")).toHaveCSS("outline-style", "none");
  await expect(card(page, "ordering").locator(".canvas-territory-selection path").first()).not.toHaveCSS("stroke", "none");
  await page.getByRole("button", { name: "Finish border editing", exact: true }).click();
  await page.getByRole("button", { name: "Reshape to contents", exact: true }).click();
  expect(object(await snapshot(page), "ordering").props.territory).toBeNull();
  expect(await renderedTerritory(page)).toEqual(territory);
  await page.getByRole("button", { name: /^Undo —/ }).click();
  expect(object(await snapshot(page), "ordering").props.territory).toEqual(changed.props.territory);
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  expect(object(await snapshot(page), "ordering").props.territory).toEqual(changed.props.territory);
  expect(await renderedTerritory(page)).toEqual(editedBoundary);
  await page.screenshot({ path: info.outputPath("editable-territory.png") });
});

test("context roads meet their coast and empty contexts and renamed inner nodes fit in both modes", async ({ page }) => {
  const long = "Purchase Information With Detailed Fulfillment And Pricing Responsibilities";
  const model = xml.replace("<name>Order Line</name>", `<name>${long}</name>`).replace("</lexicon>",
    '<context id="delivery"><name>Delivery</name><description>An empty context.</description></context>' +
    '<relationship id="handoff" from="ordering" to="delivery"><name>hands off to</name><description>Context handoff.</description></relationship></lexicon>');
  await writeFile(join(root, "lexicon/model.xml"), model);
  await open(page);
  const records = await snapshot(page);
  const endPoints = await page.locator('[data-map-road="relation:handoff"] .map-road-ground').getAttribute("d");
  expect(endPoints).toBeTruthy();
  // Both banks start at the coast, offset by half the road width around its center.
  const banks = await page.locator('[data-map-road="relation:handoff"] .map-road-bank').evaluateAll(elements =>
    elements.map(el => {
      const path = el as SVGPathElement, a = path.getPointAtLength(0), b = path.getPointAtLength(path.getTotalLength());
      return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
    }));
  for (const [i, id] of ["ordering", "delivery"].entries()) {
    const points = await renderedTerritory(page, id);
    const endpoint = { x: (banks[0][i].x + banks[1][i].x) / 2, y: (banks[0][i].y + banks[1][i].y) / 2 };
    expect(Math.min(...points.map((p: any, j: number) => distanceToSegment(endpoint, p, points[(j + 1) % points.length])))).toBeLessThan(1);
  }
  await page.getByRole("radio", { name: "Diagram", exact: true }).check();
  await enclosesNodes(page);
  await expect(card(page, "delivery")).toHaveAttribute("data-context-boundary", "rectangle");
  await expect(page.getByRole("button", { name: "context: Delivery", exact: true })).toBeVisible();
  const before = await snapshot(page);
  await page.getByRole("button", { name: "Show all code", exact: true }).click();
  const after = await snapshot(page);
  expect(object(after, "ordering").props.territory).toEqual(object(before, "ordering").props.territory);
  await enclosesNodes(page);
  await writeFile(join(root, "lexicon/model.xml"), model.replace("<name>Order</name>", "<name>A Purchase With Detailed Price And Fulfillment Information</name>"));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("button", { name: "concept: A Purchase With Detailed Price And Fulfillment Information", exact: true })).toBeVisible();
  await enclosesNodes(page);
  const refreshed = await snapshot(page), changed = object(refreshed, "order"), previous = object(after, "order");
  expect(changed.x + changed.props.w / 2).toBe(previous.x + previous.props.w / 2);
  expect(changed.y + changed.props.h / 2).toBe(previous.y + previous.props.h / 2);
  expect(object(refreshed, "order-total")).toEqual(object(after, "order-total"));
  await page.getByRole("radio", { name: "Atlas", exact: true }).check();
  await atlasEnclosesNodes(page);
});


test("border editing survives code expansion and model refresh, and ends on selection or mode changes", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "context: Ordering", exact: true }).click();
  const edit = page.getByRole("button", { name: "Edit border", exact: true });
  const finish = page.getByRole("button", { name: "Finish border editing", exact: true });
  await edit.click();
  await page.getByRole("button", { name: "Show all code", exact: true }).click();
  await snapshot(page);
  await expect(finish).toBeVisible();
  await writeFile(join(root, "lexicon/model.xml"), xml.replace("<name>Order</name>", "<name>Purchase Order</name>"));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("button", { name: "concept: Purchase Order", exact: true })).toBeVisible();
  await expect(finish).toBeVisible();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  // A native handle drag proves rendering and hit tests retained the same editing state.
  const points = await renderedTerritory(page), point = points.reduce((a, b) => a.x > b.x ? a : b);
  const start = await territoryScreenPoint(page, point);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 40, start.y + 10, { steps: 10 }); await page.mouse.up();
  expect(object(await snapshot(page), "ordering").props.territory.edits).toHaveLength(1);
  await atlasEnclosesNodes(page);
  await page.getByRole("button", { name: "concept: Purchase Order", exact: true }).click();
  await expect(finish).toHaveCount(0);
  await page.getByRole("button", { name: "context: Ordering", exact: true }).click();
  await expect(edit).toBeVisible();
  await edit.click();
  await page.getByRole("radio", { name: "Diagram", exact: true }).check();
  await expect(finish).toHaveCount(0);
  await page.getByRole("radio", { name: "Atlas", exact: true }).check();
  await expect(edit).toBeVisible();
});

test("restoring malformed border preferences leaves the current canvas and saved file intact", async ({ page }) => {
  await open(page);
  const before = await canvasDocument(page);
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  const file = join(root, "lexicon/canvas.json"), saved = await readFile(file, "utf8");
  const malformed = structuredClone(before);
  object(Object.values(malformed.snapshot.store), "ordering").props.territory = {
    edits: [{ id: "broken", add: [[[]]], cut: [] }], legacy: null,
  };
  await page.locator('input[aria-label="Restore canvas file"]').setInputFiles({
    name: "invalid-territory.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(malformed)),
  });
  await expect(page.getByText(/Invalid canvas record/)).toBeVisible();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  expect((await canvasDocument(page)).snapshot.store).toEqual(before.snapshot.store);
  expect(await readFile(file, "utf8")).toBe(saved);
  await atlasEnclosesNodes(page);
});

test("a preferred bay yields during native movement and returns after moving back, including across reload", async ({ page }, info) => {
  await open(page);
  const document = await canvasDocument(page), records = Object.values(document.snapshot.store) as any[];
  const order = object(records, "order"), line = object(records, "order-line"), total = object(records, "order-total");
  Object.assign(order, { x: 400 - order.props.w / 2, y: 0 });
  Object.assign(line, { x: 0, y: 400 });
  Object.assign(total, { x: 800 - total.props.w, y: 400 });
  object(records, "ordering").props.territory = null;
  await page.locator('input[aria-label="Restore canvas file"]').setInputFiles({
    name: "spacious-context.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(page.getByRole("button", { name: "Undo restore", exact: true, includeHidden: true })).toBeAttached();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const initial = await snapshot(page), context = object(initial, "ordering"), before = object(initial, "order");
  await page.getByRole("button", { name: "context: Ordering", exact: true }).click();
  await page.getByRole("button", { name: "Edit border", exact: true }).click();
  const coast = await renderedTerritoryControls(page);
  const bay = coast.filter(p => p.x > context.x + 250 && p.x < context.x + 550 && p.y > context.y + 350)
    .sort((a, b) => b.y - a.y)[0];
  expect(bay).toBeTruthy();
  const start = await territoryScreenPoint(page, bay), end = await territoryScreenPoint(page, { x: bay.x, y: bay.y - 160 });
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 14 }); await page.mouse.up();
  await page.getByRole("button", { name: "Finish border editing", exact: true }).click();
  const sculpted = await renderedTerritory(page), preferences = object(await snapshot(page), "ordering").props.territory;
  await page.screenshot({ path: info.outputPath("bay-vacant.png") });
  expect(preferences.edits).toHaveLength(1);
  const visitor = { x: context.x + before.x, y: context.y + before.y + 400, w: before.props.w, h: before.props.h };
  expect(uncoveredArea(sculpted, inflate(visitor, 7.98))).toBeGreaterThan(1);
  await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  await expect(card(page, "order")).toHaveAttribute("data-selected", "true");
  await snapshot(page);
  const label = (await page.getByRole("button", { name: "concept: Order", exact: true }).boundingBox())!;
  const from = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
  const target = await territoryScreenPoint(page, { x: context.x + before.x + before.props.w / 2, y: context.y + before.y + 400 + before.props.h / 2 });
  // Use the label's offset from the reserved footprint when moving the native node.
  const origin = await territoryScreenPoint(page, { x: context.x + before.x + before.props.w / 2, y: context.y + before.y + before.props.h / 2 });
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(from.x + target.x - origin.x, from.y + target.y - origin.y, { steps: 16 });
  await atlasEnclosesNodes(page);
  await page.mouse.up();
  const occupied = await renderedTerritory(page), moved = object(await snapshot(page), "order");
  await page.screenshot({ path: info.outputPath("bay-occupied.png") });
  expect(moved.y - before.y).toBeCloseTo(400, 1);
  expect(occupied).not.toEqual(sculpted);
  expect(object(await snapshot(page), "ordering").props.territory).toEqual(preferences);
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  expect(await renderedTerritory(page)).toEqual(occupied);
  await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  for (let i = 0; i < 40; i++) await page.locator(".tl-container").press("Shift+ArrowUp");
  expect(object(await snapshot(page), "order").y).toBeCloseTo(before.y, 1);
  expect(await renderedTerritory(page)).toEqual(sculpted);
  expect(object(await snapshot(page), "ordering").props.territory).toEqual(preferences);
  await atlasEnclosesNodes(page);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});
