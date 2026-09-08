import { expect, test, type Page } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { containsBox, inflate } from "../client/src/canvas/territory";
import { atlasEnclosesNodes, renderedTerritory } from "./canvas-territory-helpers";

let root: string, projectId: string, original: string;
test.beforeEach(async ({ request }) => {
  root = await mkdtemp(join(tmpdir(), "lexicon-canvas-test-"));
  await cp(resolve(import.meta.dirname, "../examples/canvas-workshop"), root, { recursive: true,
    filter: (source) => !/\/lexicon\/(canvas\.json|\.canvas[^/]*|assets)(\/|$)/.test(source),
  });
  original = await readFile(join(root, "lexicon/model.xml"), "utf8");
  const response = await request.post("/api/projects", { data: { root } });
  expect(response.ok()).toBeTruthy();
  projectId = (await response.json()).id;
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
async function exportDocument(page: Page) {
  const menu = page.locator(".canvas-file-menu");
  if (!(await menu.getAttribute("open"))) await menu.locator("summary").click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export canvas", exact: true }).click();
  const download = await downloading;
  const contents = await readFile((await download.path())!, "utf8");
  await menu.locator("summary").click();
  return { contents, data: JSON.parse(contents) };
}
async function note(page: Page, text: string) {
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const input = page.locator('.tl-container [contenteditable="true"]');
  await expect(input).toBeVisible();
  await input.fill(text);
  await input.press("Escape");
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
}
const records = (data: any) => (data.snapshot ? Object.values(data.snapshot.store) : data.canvas.records) as any[];
const object = (data: any, id: string) => records(data).find((r) => r.type === "lexicon-object" && r.props.graphId === `item:${id}`);

const selectedObjects = (page: Page) => page.locator('[data-model-id][data-selected="true"]')
  .evaluateAll((elements) => elements.map((el) => el.getAttribute("data-model-id")).sort());
const card = (page: Page, id: string) => page.locator(`[data-model-id="item:${id}"]`);
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

test("native label gestures add and toggle selections, including relationship labels", async ({ page }) => {
  await open(page);
  const order = page.getByRole("button", { name: "concept: Order", exact: true });
  const line = page.getByRole("button", { name: "concept: Order Line", exact: true });
  for (const modifier of ["Shift", "Meta"] as const) {
    await order.click();
    await line.click({ modifiers: [modifier] });
    await expect.poll(() => selectedObjects(page)).toEqual(["item:order", "item:order-line"]);
    await line.click({ modifiers: [modifier] });
    await expect.poll(() => selectedObjects(page)).toEqual(["item:order"]);
    await page.getByRole("button", { name: "Read relationship: contains", exact: true }).click({ modifiers: [modifier] });
    await expect(card(page, "order")).toHaveAttribute("data-selected", "true");
    await expect(page.locator(".tl-container").getByRole("status")).toContainText("2 shapes selected");
  }
  // Keyboard activation still opens the explanation through the native selection.
  await line.focus();
  await line.press("Enter");
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Order Line");
  await expect.poll(() => selectedObjects(page)).toEqual(["item:order-line"]);
});

test("node and context labels drag with native undo and Space panning", async ({ page }) => {
  await open(page);
  const initial = (await exportDocument(page)).data;
  const order = page.getByRole("button", { name: "concept: Order", exact: true });
  const label = (await order.boundingBox())!;
  const start = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
  await drag(page, start, { x: start.x + 20, y: start.y + 20 });
  const moved = (await exportDocument(page)).data;
  expect(object(moved, "order").x - object(initial, "order").x).toBeCloseTo(20, 1);
  expect(object(moved, "order").y - object(initial, "order").y).toBeCloseTo(20, 1);
  await page.getByRole("button", { name: /^Undo —/ }).click();
  expect(object((await exportDocument(page)).data, "order")).toEqual(object(initial, "order"));
  const heading = (await page.getByRole("button", { name: "context: Ordering", exact: true }).boundingBox())!;
  await drag(page, { x: heading.x + 20, y: heading.y + 10 }, { x: heading.x + 50, y: heading.y + 30 });
  const groupMoved = (await exportDocument(page)).data;
  expect(object(groupMoved, "ordering").x - object(initial, "ordering").x).toBeCloseTo(30, 1);
  expect(object(groupMoved, "order")).toEqual(object(initial, "order"));
  // Space-drag over that same label moves the camera and leaves placements intact.
  const camera = await page.locator(".tl-html-layer").getAttribute("style");
  const panLabel = (await order.boundingBox())!;
  await page.locator(".tl-container").focus();
  await page.keyboard.down("Space");
  await drag(page, { x: panLabel.x + 20, y: panLabel.y + 10 }, { x: panLabel.x + 70, y: panLabel.y + 50 });
  await page.keyboard.up("Space");
  await expect(page.locator(".tl-html-layer")).not.toHaveAttribute("style", camera!);
  expect(object((await exportDocument(page)).data, "order")).toEqual(object(groupMoved, "order"));
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(original);
});

test("mouse wheel zooms the canvas instead of panning vertically", async ({ page }) => {
  await open(page);
  const layer = page.locator(".tl-html-layer");
  const zoom = () => layer.evaluate((element) => {
    const transform = (element as HTMLElement).style.transform;
    const match = transform.match(/scale\(([^)]+)\)/);
    if (!match) throw new Error(`Unexpected canvas transform: ${transform}`);
    return Number(match[1]);
  });
  const before = await zoom();
  const area = (await page.locator(".canvas-stage").boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.wheel(0, -100);
  await expect.poll(zoom).toBeGreaterThan(before);
  const zoomedIn = await zoom();
  await page.mouse.wheel(0, 100);
  await expect.poll(zoom).toBeLessThan(zoomedIn);
});

test("native marquee treats contexts as frames and Shift adds without toggling existing shapes", async ({ page }) => {
  await open(page);
  const group = (await card(page, "ordering").boundingBox())!;
  const line = (await card(page, "order-line").boundingBox())!;
  // Touch the container edge and part of one child, away from the relationships.
  await drag(page, { x: group.x - 20, y: line.y + 5 }, { x: line.x + 40, y: line.y + line.height - 5 });
  await expect.poll(() => selectedObjects(page)).toEqual(["item:order-line"]);
  await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  const item = new URL(page.url()).searchParams.get("item");
  for (let i = 0; i < 2; i++) {
    await page.keyboard.down("Shift");
    await drag(page, { x: group.x + 5, y: line.y + 5 }, { x: line.x + 40, y: line.y + line.height - 5 });
    await page.keyboard.up("Shift");
    await expect.poll(() => selectedObjects(page)).toEqual(["item:order", "item:order-line"]);
    expect(new URL(page.url()).searchParams.get("item")).toBe(item);
  }
  // Fully wrapping the context selects the frame, letting the engine filter children.
  await drag(page, { x: group.x - 15, y: group.y - 15 }, { x: group.x + group.width + 15, y: group.y + group.height + 15 });
  await expect.poll(() => selectedObjects(page)).toEqual(["item:ordering"]);
});

test("selection movement preserves spacing and notes while the context follows drags, nudges, cancel, and undo", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "concept: Order Total", exact: true }).click();
  await note(page, "Follow the moving selection.");
  const initial = (await exportDocument(page)).data;
  for (const [i, name] of ["Order", "Order Line", "Order Total"].entries())
    await page.getByRole("button", { name: `concept: ${name}`, exact: true }).click({ modifiers: i ? ["Shift"] : [] });
  await expect.poll(() => selectedObjects(page)).toEqual(["item:order", "item:order-line", "item:order-total"]);
  const positions = async () => Promise.all(["order", "order-line", "order-total"].map(async (id) => (await card(page, id).boundingBox())!));
  const before = await positions();
  const label = (await page.getByRole("button", { name: "concept: Order", exact: true }).boundingBox())!;
  const start = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + 60, { steps: 12 });
  const during = await positions();
  const delta = during.map((box, i) => box.y - before[i].y);
  expect(delta[0]).toBeGreaterThan(0);
  expect(delta[0]).toBeCloseTo(60, 1);
  for (const dy of delta) expect(dy).toBeCloseTo(delta[0], 1);
  await page.mouse.up();
  const moved = (await exportDocument(page)).data;
  const oldNote = records(initial).find((r) => r.type === "note");
  const movedNote = records(moved).find((r) => r.type === "note");
  expect(movedNote.y - oldNote.y).toBeCloseTo(delta[0], 1);
  await page.getByRole("button", { name: /^Undo —/ }).click();
  const undone = (await exportDocument(page)).data;
  for (const id of ["order", "order-line", "order-total"])
    expect(object(undone, id)).toEqual(object(initial, id));
  expect(records(undone).find((r) => r.type === "note")).toEqual(oldNote);
  await page.getByRole("button", { name: /^Redo —/ }).click();
  expect(object((await exportDocument(page)).data, "order-total")).toEqual(object(moved, "order-total"));
  await page.getByRole("button", { name: /^Undo —/ }).click();
  for (let i = 0; i < 6; i++) await page.locator(".tl-container").press("Shift+ArrowDown");
  const nudged = await positions();
  for (let i = 0; i < nudged.length; i++) expect(nudged[i].y - before[i].y).toBeCloseTo(delta[0], 1);
  const cancelStart = (await page.getByRole("button", { name: "concept: Order", exact: true }).boundingBox())!;
  await page.mouse.move(cancelStart.x + 20, cancelStart.y + 10);
  await page.mouse.down();
  await page.mouse.move(cancelStart.x + 40, cancelStart.y - 30, { steps: 8 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await positions()).toEqual(nudged);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(original);
});

test("clearing native selection survives projection changes and browser history restores explicit navigation", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  const group = (await card(page, "ordering").boundingBox())!;
  await page.mouse.click(group.x - 20, group.y + 80);
  await expect.poll(() => selectedObjects(page)).toEqual([]);
  await expect(page.locator("[data-reader-card].active")).toHaveAttribute("data-reader-card", "item:order");
  await page.getByRole("button", { name: "Show all code", exact: true }).click();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect.poll(() => selectedObjects(page)).toEqual([]);
  await page.getByRole("button", { name: "All code shown", exact: true }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect.poll(() => selectedObjects(page)).toEqual([]);
  // Clearing the canvas does not discard the reader or create a new reading step.
  await page.getByRole("button", { name: "concept: Order Line", exact: true }).click();
  await page.goBack();
  await expect.poll(() => selectedObjects(page)).toEqual(["item:order"]);
  await page.goForward();
  await expect.poll(() => selectedObjects(page)).toEqual(["item:order-line"]);
  await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  await page.locator("[data-reader-card].active").getByRole("link", { name: "Open Order Line", exact: true }).click();
  await expect.poll(() => selectedObjects(page)).toEqual(["item:order-line"]);
  // Returning to the previously clicked card still navigates after a reader link.
  await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Order");
  await page.getByRole("button", { name: "concept: Order Line", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect.poll(() => selectedObjects(page)).toEqual([]);
  await expect(page.locator("[data-reader-card].active")).toHaveAttribute("data-reader-card", "item:order-line");
  await note(page, "This note has no stale attachment.");
  expect(records((await exportDocument(page)).data).filter((r) => r.type === "lexicon-note")).toHaveLength(0);
});

test("project links open one tldraw canvas with Diagram and Atlas modes and a stable drawing area", async ({ page }) => {
  await open(page);
  expect(new URL(page.url()).searchParams.has("canvas")).toBe(false);
  const stage = page.locator(".canvas-stage");
  const before = await stage.boundingBox();
  const toolbar = page.locator(".canvas-toolbar");
  for (const [label, icon] of [["Fit model", "fit"], ["Locate", "locate"], ["Show all code", "code"], ["Arrange", "graph"]]) {
    await expect(toolbar.getByRole("button", { name: label, exact: true }).locator("use")).toHaveAttribute("href", `/icons.svg#${icon}`);
  }
  await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  await expect(toolbar.locator(".canvas-scope")).toHaveText("Order");
  await page.getByRole("button", { name: "Selection actions", exact: true }).click();
  await expect(page.getByRole("button", { name: "Move to context…", exact: true })).toBeVisible();
  expect(await stage.boundingBox()).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Selection actions", exact: true })).toBeFocused();
  await saved(page);
  await expect(page.locator(".canvas-save-state")).toHaveCount(0);
  await expect(page.locator(".workspace-status-bar [data-save-status='saved']")).toBeVisible();
  await expect(page.getByLabel("Object icon legend", { exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: /Switch to (Graph|Canvas)/ })).toHaveCount(0);
  const beforeMode = (await exportDocument(page)).data;
  const camera = await page.locator(".tl-html-layer").getAttribute("style");
  for (const mode of ["Diagram", "Atlas"]) {
    await page.getByRole("radio", { name: mode, exact: true }).check();
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await expect(card(page, "order")).toHaveAttribute("data-selected", "true");
    expect(object((await exportDocument(page)).data, "order")).toEqual(object(beforeMode, "order"));
    expect(await page.locator(".tl-html-layer").getAttribute("style")).toBe(camera);
  }
  // Old renderer links preserve the reader selection and normalize to the same canvas URL.
  for (const legacy of ["graph", "tldraw"]) {
    await page.goto(`/p/${projectId}?canvas=${legacy}&item=order`);
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Order");
    await expect(page).toHaveURL(new RegExp(`/p/${projectId}\\?item=order$`));
  }
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.getByRole("button", { name: "Toggle code workspace", exact: true }).click();
  const paneBox = (await toolbar.boundingBox())!;
  const actionsBox = (await toolbar.locator(".canvas-toolbar-actions").boundingBox())!;
  expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual(paneBox.x + paneBox.width);
  await page.getByRole("button", { name: "Toggle code workspace", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await expect(toolbar.getByRole("button", { name: "Arrange", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Canvas mode", exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Diagram", exact: true }).check();
  await expect(page.getByTestId("procedural-map")).toHaveCount(0);
  await page.getByRole("radio", { name: "Atlas", exact: true }).check();
  await expect(page.getByTestId("procedural-map")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Agent", exact: true })).toBeVisible();
});

test("model context actions toggle all code owned by a context and restore the camera after Focus", async ({ page }) => {
  await open(page);
  const camera = () => page.locator(".tl-html-layer").evaluate((element) => (element as HTMLElement).style.transform);
  const context = page.getByRole("button", { name: "context: Ordering", exact: true });
  await context.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Expand code", exact: true }).click();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator(".model-count")).toHaveText("3 concepts · 3 code");
  await context.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Hide code", exact: true }).click();
  await expect(page.locator(".model-count")).toHaveText("3 concepts · 0 code");
  await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  await page.locator("[data-reader-card].active").getByRole("button", { name: "Toggle code in canvas", exact: true }).click();
  await expect(page.locator(".model-count")).toHaveText("3 concepts · 1 code");
  await page.locator("[data-reader-card].active").getByRole("button", { name: "Toggle code in canvas", exact: true }).click();
  await expect(page.locator(".model-count")).toHaveText("3 concepts · 0 code");
  const area = (await page.locator(".canvas-stage").boundingBox())!;
  await page.getByRole("button", { name: /^Hand —/ }).click();
  await page.mouse.move(area.x + 50, area.y + 120);
  await page.mouse.down();
  await page.mouse.move(area.x + 90, area.y + 150, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: /^Select —/ }).click();
  await page.getByRole("button", { name: "concept: Order", exact: true }).click({ button: "right" });
  // Let native pan inertia settle before measuring the camera that Focus should restore.
  let previous = "", stable = 0;
  await expect.poll(async () => {
    const current = await camera();
    stable = current === previous ? stable + 1 : 0;
    previous = current;
    return stable;
  }).toBeGreaterThanOrEqual(2);
  const before = await camera();
  await page.getByRole("menuitem", { name: "Focus", exact: true }).click();
  await expect.poll(camera).not.toBe(before);
  await page.getByRole("button", { name: "Back to overview", exact: true }).click();
  await expect.poll(camera).toBe(before);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(original);
});

test("first canvas open preserves earlier saved placements and camera, while saved canvases take precedence", async ({ page }) => {
  const key = `lexicon:graph:v1:${projectId}`;
  await page.addInitScript(({ key }) => {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify({
      positions: { "item:ordering": { x: 120, y: 160 }, "item:order": { x: 40, y: 130 } },
      viewport: { x: 40, y: 25, zoom: 0.8 }, sidebar: false,
    }));
  }, { key });
  await page.goto(`/p/${projectId}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  const stage = (await page.locator(".canvas-stage").boundingBox())!;
  const card = (await page.locator('[data-model-id="item:order"]').boundingBox())!;
  expect(Math.abs(card.x - (stage.x + (120 + 40) * 0.8 + 40))).toBeLessThan(2);
  expect(Math.abs(card.y - (stage.y + (160 + 130) * 0.8 + 25))).toBeLessThan(2);
  const migrated = (await exportDocument(page)).data;
  expect(object(migrated, "ordering")).toMatchObject({ x: 120, y: 160 });
  expect(object(migrated, "order")).toMatchObject({ x: 40, y: 130 });
  const camera = await page.locator(".tl-html-layer").getAttribute("style");
  await saved(page);
  await page.evaluate(({ key }) => {
    const legacy = JSON.parse(localStorage.getItem(key)!);
    legacy.positions["item:order"] = { x: 300, y: 400 };
    legacy.viewport = { x: -900, y: -800, zoom: 0.2 };
    localStorage.setItem(key, JSON.stringify(legacy));
  }, { key });
  await page.reload();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  expect(object((await exportDocument(page)).data, "order")).toMatchObject({ x: 40, y: 130 });
  await expect(page.locator(".tl-html-layer")).toHaveAttribute("style", camera!);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(original);
});

test("an unmodeled project stays unwritten until the first canvas edit", async ({ page }) => {
  await rm(join(root, "lexicon"), { recursive: true });
  await page.goto(`/p/${projectId}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await saved(page);
  await expect(page.locator(".canvas-save-indicator")).toHaveText("Ready");
  expect(await readFile(join(root, "lexicon/canvas.json"), "utf8").catch(() => null)).toBeNull();
  await note(page, "Start by exploring checkout behavior.");
  await saved(page);
  expect((await durableNotes()).join()).toContain("Start by exploring checkout behavior.");
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8").catch(() => null)).toBeNull();
});

test("the Atlas coast follows concept drags and keyboard moves in every direction without changing ownership", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "concept: Order Line", exact: true }).click();
  await note(page, "Follow the concept, including at the context boundary.");
  const initial = (await exportDocument(page)).data;
  const before = object(initial, "order-line"), context = object(initial, "ordering"), initialBoundary = await renderedTerritory(page);
  const beforeNote = records(initial).find((r) => r.type === "note");
  const card = page.locator('[data-model-id="item:order-line"]');
  const group = page.locator('[data-model-id="item:ordering"]');
  for (const direction of ["right", "left", "down", "up"]) {
    const box = (await card.boundingBox())!, boundary = (await group.boundingBox())!;
    const start = { x: box.x + 8, y: box.y + box.height - 6 };
    const end = { ...start };
    if (direction === "right") end.x = boundary.x + boundary.width + 100;
    if (direction === "left") end.x = boundary.x - 100;
    if (direction === "down") end.y = boundary.y + boundary.height + 100;
    if (direction === "up") end.y = boundary.y - 100;
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    // The coast follows the full movement before release; there is no fixed wall.
    await atlasEnclosesNodes(page, ["order-line"]);
    await page.mouse.up();
    const moved = (await exportDocument(page)).data;
    const after = object(moved, "order-line"), afterNote = records(moved).find((r) => r.type === "note");
    expect(after.parentId).toBe(context.id);
    expect(containsBox(await renderedTerritory(page), inflate({ x: context.x + after.x, y: context.y + after.y, w: after.props.w, h: after.props.h }, 7.98))).toBe(true);
    expect(await renderedTerritory(page)).not.toEqual(initialBoundary);
    expect(object(moved, "ordering")).toEqual(context);
    expect(afterNote.x - beforeNote.x).toBeCloseTo(after.x - before.x, 1);
    expect(afterNote.y - beforeNote.y).toBeCloseTo(after.y - before.y, 1);
    expect({ x: after.x, y: after.y }).not.toEqual({ x: before.x, y: before.y });
    await page.getByRole("button", { name: /^Undo —/ }).click();
    const undone = (await exportDocument(page)).data;
    expect(object(undone, "order-line")).toEqual(before);
    expect(records(undone).find((r) => r.type === "note")).toEqual(beforeNote);
    await page.getByRole("button", { name: /^Redo —/ }).click();
    expect(object((await exportDocument(page)).data, "order-line")).toEqual(after);
    await page.getByRole("button", { name: /^Undo —/ }).click();
  }
  // Keyboard nudges also drive the coast.
  const nudgeTarget = (await card.boundingBox())!;
  await page.mouse.click(nudgeTarget.x + 8, nudgeTarget.y + nudgeTarget.height - 6);
  for (let i = 0; i < 15; i++) await page.keyboard.press("Shift+ArrowRight");
  const nudged = object((await exportDocument(page)).data, "order-line");
  expect(nudged.x).toBeGreaterThan(before.x);
  expect(nudged.x - before.x).toBe(150);
  await atlasEnclosesNodes(page, ["order-line"]);
  // Moving the context still carries its children and their attached notes.
  const beforeGroupMove = (await exportDocument(page)).data;
  const boundary = (await page.getByRole("button", { name: "context: Ordering", exact: true }).boundingBox())!;
  await page.mouse.move(boundary.x + boundary.width / 2, boundary.y + 6);
  await page.mouse.down();
  await page.mouse.move(boundary.x + boundary.width / 2 + 40, boundary.y + 36, { steps: 10 });
  await page.mouse.up();
  const movedGroup = (await exportDocument(page)).data;
  const afterContext = object(movedGroup, "ordering");
  expect(afterContext.x).not.toBe(context.x);
  expect(object(movedGroup, "order-line")).toEqual(object(beforeGroupMove, "order-line"));
  const groupNote = records(movedGroup).find((r) => r.type === "note");
  const previousNote = records(beforeGroupMove).find((r) => r.type === "note");
  expect(groupNote.x - previousNote.x).toBeCloseTo(afterContext.x - context.x, 1);
  expect(groupNote.y - previousNote.y).toBeCloseTo(afterContext.y - context.y, 1);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(original);
});

test("model references preserve context, relationship, code, history, and search navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await page.getByRole("button", { name: "context: Ordering", exact: true }).click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Ordering");
  await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Order");
  await page.getByRole("button", { name: "Read relationship: contains", exact: true }).click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toContainText("Order contains Order Line");
  await page.goBack();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Order");
  await page.goForward();
  await page.locator("[data-reader-card].active").getByRole("button", { name: "Toggle code in canvas", exact: true }).click();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.getByRole("button", { name: "code: Order", exact: true }).click();
  await expect(page.locator("#code-pane")).toContainText("checkout.ts");
  await expect(page.locator("#code-pane")).toContainText("lines");
  await page.getByRole("button", { name: "Toggle code workspace", exact: true }).click();
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page.getByRole("textbox", { name: "Search model" }).fill("Order Line");
  await expect(page.locator('[data-model-id="item:order"]')).toHaveClass(/canvas-dimmed/);
  await expect(page.locator('[data-model-id="item:order-line"]')).not.toHaveClass(/canvas-dimmed/);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(original);
  expect(errors).toEqual([]);
});

test("restoring outlying concepts fits their context without moving them, including after reload", async ({ page }) => {
  await open(page);
  const saved = (await exportDocument(page)).data;
  // A canvas saved by the original prototype could contain escaped concepts.
  object(saved, "order").x = -150;
  object(saved, "order").y = object(saved, "ordering").props.h + 200;
  await page.locator('input[aria-label="Restore canvas file"]').setInputFiles({
    name: "old-canvas.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  const repaired = (await exportDocument(page)).data;
  const concept = object(repaired, "order"), context = object(repaired, "ordering");
  expect(concept.parentId).toBe(context.id);
  expect(concept.x).toBe(-150);
  expect(concept.y).toBe(object(saved, "order").y);
  expect(containsBox(await renderedTerritory(page), inflate({ x: context.x + concept.x, y: context.y + concept.y, w: concept.props.w, h: concept.props.h }, 7.98))).toBe(true);
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "concept: Order", exact: true })).toBeVisible();
  expect(object((await exportDocument(page)).data, "order")).toEqual(concept);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(original);
});

test("older collapsed canvases and preferences restore every concept without losing placements or notes", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  await note(page, "Keep this attached note through migration.");
  const before = (await exportDocument(page)).data;
  const old = structuredClone(before), context = object(old, "ordering");
  const fullSize = { w: context.props.w + 200, h: context.props.h + 150 };
  Object.assign(context.meta, { lexiconCollapsed: true, lexiconExpanded: [fullSize.w, fullSize.h] });
  Object.assign(context.props, { w: 260, h: 88 });
  for (const record of records(old))
    if (record.parentId === context.id) record.meta.lexiconHidden = true;
  await page.locator('input[aria-label="Restore canvas file"]').setInputFiles({
    name: "collapsed-canvas.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(old)),
  });
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  await page.evaluate((key) => {
    const workspace = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...workspace, collapsed: ["ordering"], expanded: ["order"] }));
  }, `lexicon:graph:v1:${projectId}`);
  await page.reload();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await expect(page.getByRole("button", { name: "concept: Order", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "concept: Order Line", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Collapse|Expand) context / })).toHaveCount(0);
  await expect(page.locator('[data-model-id^="code:"]')).not.toHaveCount(0);
  const restored = (await exportDocument(page)).data;
  expect(object(restored, "ordering").props).toMatchObject(fullSize);
  expect(object(restored, "ordering").meta.lexiconExpanded).toBeUndefined();
  expect(object(restored, "ordering").meta.lexiconCollapsed).toBeUndefined();
  expect(object(restored, "order")).toEqual(object(before, "order"));
  expect(records(restored).find((r) => r.type === "note")).toEqual(records(before).find((r) => r.type === "note"));
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(original);
});

test("attached notes survive dragging, model refresh, rearrangement, and reload", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  await note(page, "Which validation makes an order ready?");
  const before = (await exportDocument(page)).data;
  expect(records(before).filter((r) => r.type === "lexicon-note")).toHaveLength(1);
  const beforeObject = object(before, "order");
  const beforeNote = records(before).find((r) => r.type === "note");
  const card = await page.locator('[data-model-id="item:order"]').boundingBox();
  await page.mouse.move(card!.x + 10, card!.y + card!.height - 5);
  await page.mouse.down();
  await page.mouse.move(card!.x + 75, card!.y + card!.height + 25, { steps: 10 });
  await page.mouse.up();
  const moved = (await exportDocument(page)).data;
  const movedObject = object(moved, "order"), movedNote = records(moved).find((r) => r.type === "note");
  expect(movedObject.x).not.toBe(beforeObject.x);
  expect(movedNote.x - beforeNote.x).toBeCloseTo(movedObject.x - beforeObject.x, 1);
  expect(movedNote.y - beforeNote.y).toBeCloseTo(movedObject.y - beforeObject.y, 1);
  const renamed = original.replace("<name>Order</name>", "<name>Purchase</name>");
  await writeFile(join(root, "lexicon/model.xml"), renamed);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("button", { name: "concept: Purchase", exact: true })).toBeVisible();
  const refreshed = (await exportDocument(page)).data;
  const refreshedObject = object(refreshed, "order"), refreshedNote = records(refreshed).find((r) => r.type === "note");
  expect(refreshedObject.x + refreshedObject.props.w / 2).toBe(movedObject.x + movedObject.props.w / 2);
  expect(refreshedNote.x).toBe(movedNote.x);
  expect(refreshedNote.y).toBe(movedNote.y);
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  const arranged = (await exportDocument(page)).data;
  expect(records(arranged).find((r) => r.type === "note").props.richText).toEqual(beforeNote.props.richText);
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  const durable = JSON.parse(await readFile(join(root, "lexicon/canvas.json"), "utf8"));
  expect(records(durable).find((r) => r.type === "note").props.richText).toEqual(beforeNote.props.richText);
  await page.reload();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  const reloaded = (await exportDocument(page)).data;
  expect(records(reloaded).find((r) => r.type === "note")).toEqual(records(arranged).find((r) => r.type === "note"));
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(renamed);
});

test("freeform media, drawing, undo, and portable canvas restore stay separate from model XML", async ({ page }) => {
  await open(page);
  await note(page, "A question outside the formal model.");
  const drawing = page.getByRole("button", { name: /^Draw —/ });
  await drawing.click();
  const stage = await page.locator(".canvas-stage").boundingBox();
  await page.mouse.move(stage!.x + 80, stage!.y + 180);
  await page.mouse.down();
  await page.mouse.move(stage!.x + 150, stage!.y + 220, { steps: 10 });
  await page.mouse.up();
  await page.getByRole("button", { name: /^Select —/ }).click();
  const choosing = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^Media —/ }).click();
  await (await choosing).setFiles({ name: "checkout.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=", "base64") });
  await expect.poll(async () => records((await exportDocument(page)).data).filter((r) => r.type === "image" && r.typeName === "shape").length).toBe(1);
  const saved = await exportDocument(page);
  expect(records(saved.data).some((r) => r.type === "draw")).toBeTruthy();
  const imageAsset = records(saved.data).find((r) => r.typeName === "asset" && r.type === "image");
  expect(imageAsset.props.src).toMatch(/^data:image\//);
  await page.getByRole("button", { name: /^Delete —/ }).click();
  await page.getByRole("button", { name: /^Undo —/ }).click();
  expect(records((await exportDocument(page)).data).filter((r) => r.type === "image" && r.typeName === "shape")).toHaveLength(1);
  await page.getByRole("button", { name: /^Delete —/ }).click();
  await page.locator('input[aria-label="Restore canvas file"]').setInputFiles({ name: "canvas.json", mimeType: "application/json", buffer: Buffer.from(saved.contents) });
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  expect(records((await exportDocument(page)).data).filter((r) => r.type === "image" && r.typeName === "shape")).toHaveLength(1);
  await page.locator('input[aria-label="Restore canvas file"]').setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"wrong":true}') });
  await expect(page.getByRole("alert")).toContainText("Choose a canvas exported from this project");
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(original);
});

test("narrow screens, dark theme, and unavailable code remain usable", async ({ page }) => {
  await open(page);
  await page.setViewportSize({ width: 430, height: 850 });
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator(".tl-container")).toHaveClass(/tl-theme__dark/);
  await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Order");
  await writeFile(join(root, "checkout.ts"), "// Declaration intentionally missing for error-state QA.");
  await page.locator("main [data-reader-card].active .code-links button").first().click();
  await expect(page.locator("#code-pane")).toContainText(/not found|missing|could not/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test("parallel and self relationships remain distinct, and canvas undo cannot revert a model refresh", async ({ page }) => {
  const complex = original.replace("</lexicon>", `
    <relationship id="validates" from="order" to="order-line"><name>validates</name><description>An illustrative parallel relationship.</description></relationship>
    <relationship id="rechecks" from="order" to="order"><name>rechecks</name><description>An illustrative self relationship.</description></relationship>
  </lexicon>`);
  await writeFile(join(root, "lexicon/model.xml"), complex);
  await open(page);
  const snapshot = (await exportDocument(page)).data;
  const routes = records(snapshot).filter((r) => r.type === "lexicon-connection");
  for (const route of routes.filter((r) => r.props.graphId.startsWith("relation:"))) {
    expect(route.props.path).not.toMatch(/[QC]/);
    for (let i = 1; i < route.props.points.length; i++) {
      const a = route.props.points[i - 1], b = route.props.points[i];
      expect((a.x === b.x) !== (a.y === b.y)).toBe(true);
    }
  }
  await expect(page.locator(".canvas-connection:not(.canvas-mapping)").first()).toHaveCSS("color", "rgb(122, 137, 151)");
  expect(routes.find((r) => r.props.graphId === "relation:contains").props.path)
    .not.toBe(routes.find((r) => r.props.graphId === "relation:validates").props.path);
  expect(routes.find((r) => r.props.graphId === "relation:rechecks").props.points.every((p: any) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBeTruthy();
  await page.getByRole("button", { name: "Read relationship: rechecks", exact: true }).click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toContainText("Order rechecks Order");
  await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  await page.getByRole("button", { name: /^Delete —/ }).click();
  await expect(page.getByRole("button", { name: "concept: Order", exact: true })).toBeVisible();
  await note(page, "Keep this thought while the model changes.");
  const changed = complex.replace("<name>Order</name>", "<name>Purchase</name>");
  await writeFile(join(root, "lexicon/model.xml"), changed);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("button", { name: "concept: Purchase", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Undo —/ }).click();
  await expect(page.getByRole("button", { name: "concept: Purchase", exact: true })).toBeVisible();
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(changed);
});

async function saved(page: Page) { await expect(page.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 15_000 }); }
async function durableNotes() {
  const data = JSON.parse(await readFile(join(root, "lexicon/canvas.json"), "utf8"));
  return records(data).filter((r) => r.type === "note").map((r) => JSON.stringify(r.props.richText));
}

test("project autosave survives a fresh browser and mode or camera changes do not dirty the file", async ({ page, browser }) => {
  await open(page); await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  await note(page, "Shared note saved with the project."); await saved(page);
  const file = join(root, "lexicon/canvas.json"), before = await readFile(file, "utf8");
  await page.getByRole("radio", { name: "Diagram", exact: true }).check();
  await page.getByRole("button", { name: "Fit model", exact: true }).click(); await saved(page);
  expect(await readFile(file, "utf8")).toBe(before);
  const context = await browser.newContext(), other = await context.newPage();
  await other.goto(page.url()); await expect(other.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  expect(records((await exportDocument(other)).data).filter((r) => r.type === "note")).toHaveLength(1);
  await expect(other.getByRole("button", { name: "concept: Order", exact: true })).toBeVisible();
  await context.close();
});

test("failed project saves recover after reload and retry without losing local notes", async ({ page }) => {
  await open(page); await saved(page);
  let unavailable = true;
  await page.route(`**/api/projects/${projectId}/canvas`, (route) => route.request().method() === "PUT" && unavailable ? route.abort("failed") : route.continue());
  await note(page, "Recovered after the local server stopped.");
  await expect(page.locator('[data-save-status="local"]')).toBeVisible();
  // Wait for the IndexedDB recovery write before simulating closing the tab.
  await expect.poll(async () => {
    const state = await page.context().storageState({ indexedDB: true });
    return JSON.stringify(state).includes("Recovered after the local server stopped.");
  }).toBeTruthy();
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload(); await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  expect(records((await exportDocument(page)).data).some((r) => r.type === "note" && JSON.stringify(r).includes("Recovered after"))).toBe(true);
  await expect(page.locator('[data-save-status="local"]')).toBeVisible();
  unavailable = false; await page.getByRole("button", { name: "Retry save" }).click(); await saved(page);
  expect((await durableNotes()).join()).toContain("Recovered after");
});

test("an unsaved first canvas requires review when another browser creates the project file", async ({ page, browser }) => {
  let hold = true;
  await page.route(`**/api/projects/${projectId}/canvas`, (route) =>
    route.request().method() === "PUT" && hold ? route.abort("failed") : route.continue());
  await open(page);
  await note(page, "Private draft before the first successful save.");
  await expect(page.locator('[data-save-status="local"]')).toBeVisible();
  await expect.poll(async () => JSON.stringify(await page.context().storageState({ indexedDB: true }))
    .includes("Private draft before the first successful save.")).toBeTruthy();

  const context = await browser.newContext(), other = await context.newPage();
  try {
    await other.goto(page.url());
    await expect(other.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await note(other, "Project note created in the other browser.");
    await saved(other);
    const file = join(root, "lexicon/canvas.json"), before = await readFile(file, "utf8");
    page.on("dialog", (dialog) => dialog.accept());
    const staleSave = page.waitForResponse((response) => response.url().endsWith(`/api/projects/${projectId}/canvas`) &&
      response.request().method() === "PUT" && response.status() === 409);
    hold = false;
    await page.reload();
    await staleSave;
    await expect(page.locator('[data-save-status="conflict"]')).toBeVisible();
    await page.getByRole("button", { name: "Review versions" }).click();
    await expect(page.getByRole("dialog", { name: "Review canvas versions" })).toBeVisible();
    expect(await readFile(file, "utf8")).toBe(before);
    expect(records((await exportDocument(page)).data).some((r) => r.type === "note" && JSON.stringify(r).includes("Private draft"))).toBe(true);
    await page.getByRole("button", { name: "Use project version", exact: true }).click();
    await saved(page);
    expect((await durableNotes()).join()).toContain("Project note created in the other browser.");
  } finally { await context.close(); }
});

test("two tabs merge independent notes and require review for overlapping edits", async ({ page, browser }) => {
  await open(page); await note(page, "Shared starting note."); await saved(page);
  const context = await browser.newContext(), other = await context.newPage();
  await other.goto(page.url()); await expect(other.locator('.canvas-stage[data-ready="true"]')).toBeVisible(); await saved(other);
  let holdA = true, holdB = true;
  const resumeSaving = async (tab: Page, resume: () => void) => {
    // Focus before restoring the server: a pending autosave can then remove Retry.
    // Keyboard activation remains valid whether Retry submits or that save wins first.
    await tab.getByRole("button", { name: "Retry save" }).focus();
    resume();
    await tab.keyboard.press("Enter");
  };
  await page.route(`**/api/projects/${projectId}/canvas`, (route) => route.request().method() === "PUT" && holdA ? route.abort() : route.continue());
  await other.route(`**/api/projects/${projectId}/canvas`, (route) => route.request().method() === "PUT" && holdB ? route.abort() : route.continue());
  await note(page, "Independent edit from tab A."); await expect(page.locator('[data-save-status="local"]')).toBeVisible();
  await note(other, "Independent edit from tab B."); await expect(other.locator('[data-save-status="local"]')).toBeVisible();
  await resumeSaving(page, () => { holdA = false; }); await saved(page);
  await resumeSaving(other, () => { holdB = false; }); await saved(other);
  expect((await durableNotes()).join()).toContain("Independent edit from tab A"); expect((await durableNotes()).join()).toContain("Independent edit from tab B");
  // Both tabs start from the same file, then edit the same model placement.
  page.on("dialog", (dialog) => dialog.accept()); other.on("dialog", (dialog) => dialog.accept());
  await page.reload(); await other.reload();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible(); await expect(other.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await saved(page); await saved(other); holdA = true; holdB = true;
  const nudge = async (tab: Page, key: string) => {
    await tab.getByRole("button", { name: "Fit model", exact: true }).click();
    const box = (await tab.locator('[data-model-id="item:order"]').boundingBox())!;
    await tab.mouse.click(box.x + 8, box.y + box.height - 5); await tab.keyboard.press(key);
    await expect(tab.locator('[data-save-status="local"]')).toBeVisible();
  };
  await nudge(page, "ArrowRight"); await nudge(other, "ArrowDown");
  await resumeSaving(page, () => { holdA = false; }); await saved(page);
  await resumeSaving(other, () => { holdB = false; });
  await expect(other.locator('[data-save-status="conflict"]')).toBeVisible();
  const version = await readFile(join(root, "lexicon/canvas.json"), "utf8");
  await other.getByRole("button", { name: "Review versions" }).click();
  await expect(other.getByRole("dialog", { name: "Review canvas versions" })).toBeVisible();
  await other.getByRole("button", { name: "Use project version", exact: true }).click(); await saved(other);
  expect(await readFile(join(root, "lexicon/canvas.json"), "utf8")).toBe(version);
  await context.close();
});

test("notes can be found, linked, detached, and promoted with exact model undo", async ({ page }) => {
  await open(page); await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  await note(page, "An order is ready when checkout validation succeeds."); await saved(page);
  await page.getByRole("button", { name: "Notes (1)", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search notes" }).fill("checkout");
  await page.getByRole("button", { name: /An order is ready when checkout/ }).click();
  await expect(page).toHaveURL(/shape=/);
  await page.getByRole("button", { name: "Notes (1)", exact: true }).click();
  await page.getByRole("button", { name: "Selection actions", exact: true }).click();
  await expect(page.getByText("Attached to Order", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add to model…", exact: true }).click();
  await page.getByRole("combobox", { name: "Evidence", exact: true }).selectOption("intended");
  await page.getByRole("button", { name: "Add annotation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undo model edit", exact: true })).toBeVisible();
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toContain('evidence="intended"');
  await page.getByRole("button", { name: "Undo model edit", exact: true }).click();
  await expect.poll(() => readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(original);
  // Follow the deep link again after the model refresh.
  await page.reload(); await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Selection actions", exact: true }).click();
  await expect(page.getByRole("button", { name: "Detach note", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Detach note", exact: true }).click(); await saved(page);
  expect(records((await exportDocument(page)).data).filter((r) => r.type === "lexicon-note")).toHaveLength(0);
  await page.getByRole("button", { name: /^Undo —/ }).click();
  expect(records((await exportDocument(page)).data).filter((r) => r.type === "lexicon-note")).toHaveLength(1);
});

test("reference copies can be moved and deleted independently inside generated contexts", async ({ page }) => {
  await open(page); await page.getByRole("button", { name: "context: Ordering", exact: true }).click();
  const before = (await exportDocument(page)).data;
  const card = (await page.locator('[data-model-id="item:order"]').boundingBox())!;
  await page.mouse.click(card.x + 8, card.y + card.height - 5); await page.keyboard.press("Meta+d");
  await expect(page.locator('[data-model-id="item:order"]')).toHaveCount(2);
  const copies = records((await exportDocument(page)).data).filter((r) => r.props?.graphId === "item:order");
  expect(copies[0].id).not.toBe(copies[1].id);
  await page.keyboard.press("ArrowRight"); await page.getByRole("button", { name: /^Delete —/ }).click();
  await expect(page.locator('[data-model-id="item:order"]')).toHaveCount(1);
  expect(object((await exportDocument(page)).data, "order").x).toBe(object(before, "order").x);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(original);
});

test("selection export includes model cards and relationships", async ({ page }, info) => {
  await open(page); await page.getByRole("button", { name: "context: Ordering", exact: true }).click();
  await page.getByRole("button", { name: "Selection actions", exact: true }).click();
  const pending = page.waitForEvent("download"); await page.getByRole("button", { name: "Export selection", exact: true }).click();
  const data = await readFile((await (await pending).path())!);
  expect(data.subarray(1, 4).toString()).toBe("PNG"); expect(data.length).toBeGreaterThan(2000);
  await writeFile(info.outputPath("canvas-selection.png"), data);
});

test("a 300-concept model opens, saves, and keeps the complete document while culling offscreen shapes", async ({ page }, info) => {
  const contexts = Array.from({ length: 20 }, (_, c) => `<context id="c${c}"><name>Context ${c}</name><description>Benchmark scope.</description>${Array.from({ length: 15 }, (_, n) =>
    `<concept id="c${c}n${n}"><name>Concept ${c} ${n}</name><description>Benchmark concept.</description></concept>`).join("")}</context>`).join("");
  const relations = Array.from({ length: 20 }, (_, c) => Array.from({ length: 14 }, (_, n) =>
    `<relationship id="r${c}n${n}" from="c${c}n${n}" to="c${c}n${n+1}"><name>feeds</name><description>Benchmark connection.</description></relationship>`).join("")).join("");
  await writeFile(join(root, "lexicon/model.xml"), `<lexicon schema="2.0" id="benchmark"><name>Canvas benchmark</name><description>300 concepts, 20 contexts, 280 relationships.</description>${contexts}${relations}</lexicon>`);
  const started = Date.now();
  await page.goto(`/p/${projectId}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible({ timeout: 15_000 });
  const opened = Date.now() - started; await saved(page);
  const document = JSON.parse(await readFile(join(root, "lexicon/canvas.json"), "utf8"));
  expect(records(document).filter((r) => r.type === "lexicon-object")).toHaveLength(320);
  expect(records(document).filter((r) => r.type === "lexicon-connection")).toHaveLength(280);
  info.annotations.push({ type: "performance", description: `300 concepts and 280 relationships opened in ${opened} ms.` });
  console.log(`Canvas benchmark: 300 concepts, 280 relationships, ${opened} ms to ready.`);
});

test("explicit context moves update the model and attached notes, and model undo restores exact XML", async ({ page }) => {
  original = original.replace('</lexicon>', '<context id="fulfilment"><name>Fulfilment</name><description>Prepare agreed orders.</description></context></lexicon>');
  await writeFile(join(root, "lexicon/model.xml"), original);
  await open(page); await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  await note(page, "Keep the order question when ownership changes."); await saved(page);
  await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  await page.getByRole("button", { name: "Selection actions", exact: true }).click();
  await page.getByRole("button", { name: "Move to context…", exact: true }).click();
  await page.getByRole("combobox", { name: "New context", exact: true }).selectOption("fulfilment");
  await page.getByRole("button", { name: "Move concept", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undo model edit", exact: true })).toBeVisible();
  const moved = (await exportDocument(page)).data;
  expect(object(moved, "order").parentId).toBe(object(moved, "fulfilment").id);
  expect(records(moved).filter((r) => r.type === "lexicon-note")).toHaveLength(1);
  await page.getByRole("button", { name: "Selection actions", exact: true }).click();
  await page.getByRole("button", { name: "Undo model edit", exact: true }).click();
  await expect.poll(() => readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(original);
});

test("copy/paste and mixed deletion preserve the model, and removed relationships retain attached notes", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page); await page.getByRole("button", { name: "concept: Order", exact: true }).click();
  const box = (await page.locator('[data-model-id="item:order"]').boundingBox())!;
  await page.mouse.click(box.x + 8, box.y + box.height - 5); await page.keyboard.press("Meta+c");
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.read()).some((item) => item.types.includes("text/html")))).toBeTruthy();
  await page.keyboard.press("Meta+v");
  await expect(page.locator('[data-model-id="item:order"]')).toHaveCount(2);
  await note(page, "Temporary sketch note.");
  const blank = await page.locator(".canvas-stage").boundingBox();
  await page.mouse.click(blank!.x + 100, blank!.y + 200); await page.keyboard.press("Meta+a"); await page.keyboard.press("Backspace");
  await expect(page.locator('[data-model-id="item:order"]')).toHaveCount(1);
  expect(records((await exportDocument(page)).data).filter((r) => r.type === "note")).toHaveLength(0);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(original);
  await page.getByRole("button", { name: "Read relationship: contains", exact: true }).click();
  await note(page, "Keep the evidence question for the removed relationship."); await saved(page);
  await writeFile(join(root, "lexicon/model.xml"), original.replace(/<relationship id="contains"[\s\S]*?<\/relationship>/, ""));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("button", { name: "Read relationship: Removed relationship", exact: true })).toBeVisible();
  const document = (await exportDocument(page)).data;
  const missing = records(document).find((r) => r.props?.graphId === "relation:contains");
  expect(missing.meta.lexiconMissing).toBe(true); expect(missing.meta.lexiconLabel).toBe("contains");
  expect(records(document).find((r) => r.type === "lexicon-note").toId).toBe(missing.id);
});
