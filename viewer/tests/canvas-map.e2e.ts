import { expect, test, type Page } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let root: string, projectId: string, xml: string;
test.beforeEach(async ({ request }) => {
  root = await mkdtemp(join(tmpdir(), "lexicon-map-test-"));
  await cp(resolve(import.meta.dirname, "../examples/canvas-workshop"), root, { recursive: true,
    filter: source => !/\/lexicon\/(canvas\.json|\.canvas[^/]*|assets)(\/|$)/.test(source) });
  xml = await readFile(join(root, "lexicon/model.xml"), "utf8");
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
const landmark = (page: Page, id: string) => page.locator(`[data-map-landmark="item:${id}"]`);
test("map follows native moves and undo, keeps appearance across reload, and toggles independently", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await open(page);
  await expect(landmark(page, "order")).toHaveAttribute("data-landmark-kind", "hall");
  const unaffected = await landmark(page, "order-total").getAttribute("transform");
  const label = page.getByRole("button", { name: "concept: Order", exact: true });
  await label.click();
  await expect(page.locator('[data-model-id="item:order"]')).toHaveCSS("outline-style", "solid");
  await expect(page.locator('[data-model-id="item:order"]')).toHaveCSS("box-shadow", "none");
  await expect(label).toHaveCSS("outline-style", "none");
  await page.getByLabel("Landmark", { exact: true }).selectOption("archive");
  await expect(landmark(page, "order")).toHaveAttribute("data-landmark-kind", "archive");
  const initial = await landmark(page, "order").getAttribute("transform");
  // Escape returns from the appearance control to native canvas keyboard movement.
  await page.getByLabel("Landmark", { exact: true }).press("Escape");
  await expect(page.locator('[data-model-id="item:order"]')).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(landmark(page, "order")).not.toHaveAttribute("transform", initial!);
  await expect(landmark(page, "order-total")).toHaveAttribute("transform", unaffected!);
  await page.getByRole("button", { name: /^Undo —/ }).click();
  await expect(landmark(page, "order")).toHaveAttribute("transform", initial!);
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  await page.reload();
  await expect(landmark(page, "order")).toHaveAttribute("data-landmark-kind", "archive");
  const camera = await page.locator("[data-map-camera]").getAttribute("transform");
  const selected = await page.locator('[data-model-id="item:order"]').getAttribute("data-selected");
  await page.getByRole("radio", { name: "Diagram", exact: true }).check();
  await expect(page.getByTestId("procedural-map")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "concept: Order", exact: true })).toBeVisible();
  expect(await page.locator('[data-model-id="item:order"]').getAttribute("data-selected")).toBe(selected);
  await page.reload();
  await expect(page.getByRole("radio", { name: "Diagram", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Atlas", exact: true })).not.toBeChecked();
  await page.getByRole("radio", { name: "Diagram", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Atlas", exact: true })).toBeChecked();
  await expect(landmark(page, "order")).toHaveAttribute("data-landmark-kind", "archive");
  await expect(landmark(page, "order")).toHaveAttribute("transform", initial!);
  await expect(page.locator("[data-map-camera]")).toHaveAttribute("transform", camera!);
  await page.screenshot({ path: info.outputPath("procedural-village.png") });
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
  expect(errors).toEqual([]);
});

test("Atlas road surfaces follow native selection and Diagram restores its connectors", async ({ page }) => {
  await writeFile(join(root, "lexicon/model.xml"), xml.replace("</lexicon>", '<relationship id="rechecks" from="order" to="order"><name>rechecks</name><description>Review this order again.</description></relationship></lexicon>'));
  await open(page);
  const road = page.locator('[data-map-road="relation:rechecks"]');
  const label = page.getByRole("button", { name: "Read relationship: rechecks", exact: true });
  const connector = page.locator('.canvas-connection').filter({ has: label });
  await expect(connector).toHaveAttribute("data-atlas-road", "true");
  await expect(connector.locator(":scope > path").first()).toBeHidden();
  const point = await road.locator(".map-road-rut").first().evaluate(element => {
    const path = element as SVGPathElement;
    const p = path.getPointAtLength(path.getTotalLength() * .4);
    const screen = p.matrixTransform(path.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.click(point.x, point.y);
  await expect(page.locator("main h1")).toContainText("rechecks");
  await expect(page.getByLabel("Path", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Diagram", exact: true }).check();
  await expect(road).toHaveCount(0);
  await expect(connector.locator(":scope > path").first()).toBeVisible();
  await page.getByRole("radio", { name: "Atlas", exact: true }).check();
  await expect(road).toBeVisible();
  await expect(page.locator("main h1")).toContainText("rechecks");
});

test("roads meet visible landmarks after moves and reloads, and both modes fit their node content", async ({ page, request }, info) => {
  await cp(resolve(import.meta.dirname, "../examples/dentalml/lexicon/model.xml"), join(root, "lexicon/model.xml"));
  await open(page);
  const card = page.locator('[data-model-id="item:length-result"]');
  const checkDocking = () => page.locator('[data-map-road="relation:owns-length"]').evaluate(element => {
    const banks = [...element.querySelectorAll<SVGPathElement>(".map-road-bank")];
    const ends = banks.map(path => path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM()!));
    const end = { x: (ends[0].x + ends[1].x) / 2, y: (ends[0].y + ends[1].y) / 2 };
    const garden = document.querySelector('[data-map-landmark="item:length-result"] .map-ground')!.getBoundingClientRect();
    return Math.max(garden.left - end.x, end.x - garden.right, garden.top - end.y, end.y - garden.bottom);
  });
  await expect.poll(checkDocking).toBeLessThan(1);
  await page.getByRole("button", { name: "concept: Length result", exact: true }).click();
  const width = await card.evaluate(element => parseFloat(getComputedStyle(element).width));
  expect(width).toBeLessThan(140);
  const road = page.locator('[data-map-road="relation:owns-length"] .map-road-ground');
  const before = await road.getAttribute("d");
  await page.locator(".tl-container").focus();
  await page.keyboard.press("ArrowRight");
  await expect(road).not.toHaveAttribute("d", before!);
  await expect.poll(checkDocking).toBeLessThan(1);
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  const saved = await (await request.get(`/api/projects/${projectId}/canvas`)).json();
  await page.getByRole("radio", { name: "Diagram", exact: true }).check();
  const fit = await card.evaluate(element => {
    const frame = element.getBoundingClientRect(), content = element.querySelector(".object-name")!.getBoundingClientRect();
    const scale = frame.width / parseFloat(getComputedStyle(element).width);
    return { x: (frame.width - content.width) / scale, y: (frame.height - content.height) / scale };
  });
  expect(fit.x).toBeGreaterThan(18);
  expect(fit.x).toBeLessThan(26);
  expect(fit.y).toBeGreaterThan(18);
  expect(fit.y).toBeLessThan(26);
  const connectorEnd = await page.locator('.canvas-connection').filter({ has: page.locator('[data-connection-id="relation:owns-length"]') }).locator(":scope > path").first().evaluate(element => {
    const path = element as SVGPathElement, p = path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM()!);
    const rect = document.querySelector('[data-model-id="item:length-result"]')!.getBoundingClientRect();
    return Math.min(Math.abs(p.x - rect.left), Math.abs(p.x - rect.right), Math.abs(p.y - rect.top), Math.abs(p.y - rect.bottom));
  });
  expect(connectorEnd).toBeLessThan(1);
  await page.getByRole("radio", { name: "Atlas", exact: true }).check();
  await expect.poll(checkDocking).toBeLessThan(1);
  expect(await (await request.get(`/api/projects/${projectId}/canvas`)).json()).toEqual(saved);
  await page.reload();
  await expect.poll(checkDocking).toBeLessThan(1);
  await expect(card).toHaveAttribute("data-selected", "true");
  await page.setViewportSize({ width: 430, height: 932 });
  await page.getByRole("button", { name: "Back to canvas", exact: true }).click();
  await page.getByRole("radio", { name: "Diagram", exact: true }).check();
  await expect(page.getByRole("button", { name: "concept: Canal index", exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Atlas", exact: true }).check();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await expect.poll(checkDocking).toBeLessThan(1);
  await page.screenshot({ path: info.outputPath("docked-roads-mobile.png") });
});

test("long names wrap inside fitted Diagram and Atlas frames", async ({ page }) => {
  const title = "Purchase request reconciliation and fulfillment authorization";
  await writeFile(join(root, "lexicon/model.xml"), xml.replace("<name>Order</name>", `<name>${title}</name>`));
  await open(page);
  for (const mode of ["Diagram", "Atlas"]) {
    await page.getByRole("radio", { name: mode, exact: true }).check();
    const result = await page.locator('[data-model-id="item:order"]').evaluate(element => {
      const frame = element.getBoundingClientRect(), text = element.querySelector(".object-name-text")!.getBoundingClientRect();
      const style = getComputedStyle(element.querySelector(".object-name-text")!);
      const scale = frame.width / parseFloat(getComputedStyle(element).width);
      return { lines: text.height / scale / parseFloat(style.lineHeight),
        overflow: Math.max(frame.left - text.left, text.right - frame.right, frame.top - text.top, text.bottom - frame.bottom) };
    });
    expect(result.lines).toBeGreaterThan(1.8);
    expect(result.overflow).toBeLessThan(0);
  }
});

test("context and path metaphors survive model refresh and code expansion", async ({ page, request }, info) => {
  await open(page);
  await page.getByRole("button", { name: "context: Ordering", exact: true }).click();
  await page.getByLabel("Terrain", { exact: true }).selectOption("island");
  await expect(page.locator('[data-map-district="item:ordering"]')).toHaveAttribute("data-terrain", "island");
  await page.getByRole("button", { name: "Read relationship: contains", exact: true }).click();
  await page.getByLabel("Path", { exact: true }).selectOption("trail");
  await expect(page.locator('[data-map-road="relation:contains"]')).toHaveAttribute("data-path-kind", "trail");
  await page.getByRole("button", { name: "Show all code", exact: true }).click();
  await expect(page.locator('[data-map-road^="mapping:"]')).toHaveCount(0);
  await expect(page.locator('[data-map-road="relation:contains"]')).toHaveAttribute("data-path-kind", "trail");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(landmark(page, "order")).toBeAttached();
  await expect(page.locator('[data-map-district="item:ordering"]')).toHaveAttribute("data-terrain", "island");
  await expect(page.locator('[data-map-road="relation:contains"]')).toHaveAttribute("data-path-kind", "trail");
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  const response = await request.get(`/api/projects/${projectId}/canvas`);
  expect(response.ok()).toBeTruthy();
  const saved = await response.json();
  const records = Object.values(saved.document.snapshot.store) as any[];
  expect(records.find(r => r.props?.graphId === "item:ordering").meta.lexiconTerrain).toBe("island");
  expect(records.filter(r => r.typeName === "shape" && !["lexicon-object", "lexicon-connection"].includes(r.type))).toEqual([]);
  await page.screenshot({ path: info.outputPath("procedural-island.png") });
});

test("a real model keeps its map aligned through pan and zoom, search, and dark mode", async ({ page }, info) => {
  await cp(resolve(import.meta.dirname, "../examples/dentalml/lexicon/model.xml"), join(root, "lexicon/model.xml"));
  await open(page);
  await expect(page.locator("[data-map-district]")).toHaveCount(3);
  await expect(page.locator("[data-map-landmark]")).toHaveCount(8);
  const marker = landmark(page, "selected-tooth");
  const initial = await marker.getAttribute("transform");
  const alignment = () => marker.evaluate(element => {
    const matrix = (element as SVGGraphicsElement).getScreenCTM()!;
    const card = document.querySelector('[data-model-id="item:selected-tooth"]')!.getBoundingClientRect();
    // The house's full footprint is centered in its fitted frame, with a 6px gutter.
    return Math.max(Math.abs(matrix.e + 1.5 * matrix.a - (card.x + card.width / 2)), Math.abs(matrix.f - (card.y + 29 * matrix.a)));
  });
  // SVG and HTML screen geometry should agree within one rendered pixel.
  await expect.poll(alignment).toBeLessThan(1);
  const camera = await page.locator("[data-map-camera]").getAttribute("transform");
  const area = (await page.locator(".canvas-stage").boundingBox())!;
  await page.mouse.move(area.x + 150, area.y + 150);
  await page.locator(".tl-container").focus();
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(area.x + 200, area.y + 190, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect(page.locator("[data-map-camera]")).not.toHaveAttribute("transform", camera!);
  await expect.poll(alignment).toBeLessThan(1);
  const pannedCamera = await page.locator("[data-map-camera]").getAttribute("transform");
  await page.mouse.wheel(0, -100);
  await expect(page.locator("[data-map-camera]")).not.toHaveAttribute("transform", pannedCamera!);
  await expect.poll(alignment).toBeLessThan(1);
  await expect(marker).toHaveAttribute("transform", initial!);
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  // A road crosses this landmark's bounds: the landmark must win the native hit test.
  await page.getByRole("button", { name: "concept: Canal index", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("Canal index");
  await expect(page.locator('[data-model-id="item:canal-index"]')).toHaveAttribute("data-selected", "true");
  await page.screenshot({ path: info.outputPath("dentalml-map.png") });
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  const search = page.getByRole("textbox", { name: "Search model" });
  await search.fill("Canal index");
  await expect(marker).toHaveAttribute("opacity", "0.18");
  await expect(landmark(page, "canal-index")).toHaveAttribute("opacity", "1");
  await search.fill("");
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.getByTestId("procedural-map")).toHaveCSS("--map-ground", "#20241f");
  await page.screenshot({ path: info.outputPath("dentalml-map-dark.png") });
});
