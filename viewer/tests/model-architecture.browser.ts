import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseModel, serializeModel } from "../server/model";

let root: string, id: string, xml: string;
test.beforeEach(async ({ request }) => {
  root = await mkdtemp(join(tmpdir(), "lexicon-model-browser-"));
  await cp(resolve(import.meta.dirname, "../../examples/shop"), root, { recursive: true });
  // Local example layouts are user-owned and must not seed browser fixtures.
  await rm(join(root, "lexicon/canvas.json"), { force: true });
  await rm(join(root, "lexicon/.canvas.previous.json"), { force: true });
  xml = await readFile(join(root, "lexicon/model.xml"), "utf8");
  const response = await request.post("/api/projects", { data: { root } });
  expect(response.ok()).toBe(true);
  id = (await response.json()).id;
});
test.afterEach(async ({ request }) => {
  await request.delete(`/api/projects/${id}`);
  await rm(root, { recursive: true, force: true });
});

test("combined 2D keeps domain and architecture visible through locate and reload", async ({ page }) => {
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  const order = page.getByRole("button", { name: "concept: Order", exact: true });
  const ghosts = page.getByRole("group", { name: "Cross-dimension neighbors", exact: true });
  await order.hover();
  await expect(ghosts).toBeVisible();
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await expect(ghosts).toHaveCount(0);
  await order.hover();
  await expect(ghosts).toHaveCount(0);
  const card = (item: string) => page.locator(`[data-model-id="item:${item}"]`);
  await expect(card("order")).toBeVisible();
  await expect(card("checkout")).toBeVisible();
  await page.locator(".sidebar .nav-item").filter({ hasText: /^Order$/ }).click();
  await page.getByRole("button", { name: "Locate in canvas", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Combined", exact: true })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Combined", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await expect(card("order")).toBeVisible();
  await expect(card("checkout")).toBeVisible();
  await page.getByRole("radio", { name: "Domain", exact: true }).check();
  await order.hover();
  await expect(ghosts).toBeVisible();
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("Combined toggles cross-dimension connections and radial navigation", async ({ page }) => {
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  const toggle = page.getByRole("button", { name: "Cross-dimension relationships", exact: true });
  const cross = page.locator('.canvas-connection-label').filter({ hasText: /^creates$/ });
  const within = page.locator('.canvas-connection-label').filter({ hasText: /^contains$/ });
  const mappings = page.locator('.canvas-connection-label[data-connection-id^="mapping:"]');
  const ghosts = page.getByRole("group", { name: "Cross-dimension neighbors", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(cross).toBeVisible();
  await expect(mappings.first()).toBeVisible();
  const mappingCount = await mappings.count();
  await expect(page.locator('svg.canvas-connection').filter({ has: cross }).locator('[data-route-current] > path').first()).toHaveAttribute("stroke-dasharray", "6 5");
  await expect(page.locator('svg.canvas-connection').filter({ has: within }).locator('[data-route-current] > path').first()).not.toHaveAttribute("stroke-dasharray");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(cross).toBeHidden();
  await expect(mappings).toHaveCount(0);
  await expect(within).toBeVisible();
  await page.getByRole("button", { name: "concept: Order", exact: true }).hover();
  await expect(ghosts).toBeVisible();
  await ghosts.getByRole("button", { name: "Go to Order Handling", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Combined", exact: true })).toBeChecked();
  await expect(page.locator('main [data-reader-card].active h1')).toHaveText("Order Handling");
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await expect(cross).toBeHidden();
  await expect(mappings).toHaveCount(0);
  await toggle.click();
  await expect(cross).toBeVisible();
  await expect(mappings).toHaveCount(mappingCount);
  await expect(ghosts).toHaveCount(0);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("Locate reveals a hidden cross-dimension relationship", async ({ page }) => {
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  const toggle = page.getByRole("button", { name: "Cross-dimension relationships", exact: true });
  await toggle.click();
  await page.getByPlaceholder("Find...").fill("creates");
  await page.locator(".sidebar .nav-item").filter({ hasText: /^creates$/ }).click();
  await page.getByPlaceholder("Find...").fill("");
  await page.getByRole("button", { name: "Locate in canvas", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.canvas-connection-label').filter({ hasText: /^creates$/ })).toBeVisible();
});

for (const skin of ["Atlas · Ink", "Atlas · Village"]) test(`Combined ${skin} routes follow its own placements`, async ({ page }) => {
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("radio", { name: "Architecture", exact: true }).check();
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await page.getByRole("radio", { name: skin, exact: true }).check();
  const road = page.locator('[data-map-road="relation:customer-orders"] .map-road-ground');
  await expect(road).toBeVisible();
  const before = await road.getAttribute("d");
  const handle = page.getByRole("button", { name: "Drag Architecture", exact: true });
  await handle.focus();
  await handle.press("Shift+ArrowRight");
  await expect(road).not.toHaveAttribute("d", before!);
});

test("Combined mirrors plane drawings and current placements while protecting model nodes", async ({ page, request }) => {
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const note = page.locator('.tl-container [contenteditable="true"]');
  await note.fill("Domain drawing stays with its plane");
  await note.press("Escape");
  await page.getByRole("button", { name: "Selection actions", exact: true }).click();
  await page.getByRole("combobox", { name: "Note attachment", exact: true }).selectOption("order");
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(page.getByText("Attached to Order", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Selection actions", exact: true }).click();
  const store = async () => (await (await request.get(`/api/projects/${id}/canvas`)).json()).document?.snapshot.store || {};
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Add note", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Arrange", exact: true })).toBeDisabled();
  await expect(page.getByTestId("canvas").getByText("Domain drawing stays with its plane", { exact: true })).toBeVisible();
  const verifyMirror = async () => {
    const records: any = await store();
    const offsets = records['page:lexicon-combined']?.meta.combinedOffsets;
    const mirrors: any[] = Object.values(records).filter((r: any) => r.typeName === "shape" && r.meta.combinedSourceId);
    if (!offsets || !mirrors.length) return false;
    return mirrors.filter(shape => shape.type !== "lexicon-connection").every(shape => {
      const source = records[shape.meta.combinedSourceId];
      const offset = shape.parentId === 'page:lexicon-combined' ? offsets[shape.meta.combinedDimension] || { x: 0, y: 0 } : { x: 0, y: 0 };
      return source && Math.abs(shape.x - source.x - offset.x) < .01 && Math.abs(shape.y - source.y - offset.y) < .01;
    });
  };
  await expect.poll(verifyMirror).toBe(true);
  const bindingMatches = async () => {
    const records: any = await store();
    const binding: any = Object.values(records).find((r: any) => r.type === "lexicon-note" && r.meta.combinedSourceId);
    return binding && records[binding.toId]?.meta.lexiconProjection;
  };
  await expect.poll(bindingMatches).toBe("combined");
  const before: any = await store();
  // Edit the source after Combined has already been created.
  await page.getByRole("radio", { name: "Domain", exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  const order = page.locator('[data-model-id="item:order"]');
  const box = (await order.boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + box.height - 5); await page.mouse.down();
  await page.mouse.move(box.x + 68, box.y + box.height + 25, { steps: 10 }); await page.mouse.up();
  await expect.poll(async () => {
    const records: any = await store();
    return records['shape:lexicon-view:domain:item%3Aorder']?.x;
  }).not.toBe(before['shape:lexicon-view:domain:item%3Aorder'].x);
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect.poll(verifyMirror).toBe(true);
  const handle = page.getByRole("button", { name: "Drag Domain", exact: true });
  await handle.focus(); await handle.press("Shift+ArrowRight");
  await expect.poll(verifyMirror).toBe(true);
  await page.reload();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect.poll(verifyMirror).toBe(true);
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await page.screenshot({ path: test.info().outputPath("combined-plane-drawings.png") });
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("Combined separates and moves dimensions without changing ordinary placements", async ({ page, request }) => {
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  const store = async () => (await (await request.get(`/api/projects/${id}/canvas`)).json()).document?.snapshot.store;
  const placements = (records: any, scope: string = "domain") => Object.values(records || {})
    .filter((shape: any) => shape.type === "lexicon-object" && shape.meta.lexiconProjection === scope)
    .map((shape: any) => [shape.props.graphId, shape.x, shape.y]).sort();
  await expect.poll(async () => placements(await store()).length).toBeGreaterThan(0);
  const ordinary = placements(await store());
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  if (await page.locator('main').isVisible()) await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
  const card = (item: string) => page.locator(`[data-model-id="item:${item}"]`);
  const gap = async () => {
    const a = (await card("ordering").boundingBox())!, b = (await card("shop").boundingBox())!;
    return a && b ? b.x - (a.x + a.width) : -Infinity;
  };
  await expect.poll(gap).toBeGreaterThan(0);
  await expect(page.locator(".combined-handles").getByRole("heading", { name: /Domain/ })).toBeVisible();
  await expect(page.locator(".combined-handles").getByRole("heading", { name: /Architecture/ })).toBeVisible();
  const region = (dimension: string) => page.locator(`.combined-region[data-dimension="${dimension}"]`);
  const domainRegion = (await region("domain").boundingBox())!;
  const architectureRegion = (await region("architecture").boundingBox())!;
  expect(architectureRegion.x).toBeGreaterThan(domainRegion.x + domainRegion.width);
  await expect.poll(async () => placements(await store(), "combined").length).toBeGreaterThan(0);
  const before = placements(await store(), "combined");
  const target = (await page.getByRole("button", { name: "Drag Architecture", exact: true }).boundingBox())!;
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2 + 70, target.y + target.height / 2 + 45, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => placements(await store(), "combined")).not.toEqual(before);
  const moved = placements(await store(), "combined");
  await page.getByRole("button", { name: /^Undo —/ }).click();
  await expect.poll(async () => placements(await store(), "combined")).toEqual(before);
  await page.getByRole("button", { name: /^Redo —/ }).click();
  await expect.poll(async () => placements(await store(), "combined")).toEqual(moved);
  const delta = (item: string) => {
    const a = before.find((row: any) => row[0] === `item:${item}`)!;
    const b = moved.find((row: any) => row[0] === `item:${item}`)!;
    return [Number(b[1]) - Number(a[1]), Number(b[2]) - Number(a[2])];
  };
  expect(delta("customer")[0]).toBeCloseTo(delta("shop")[0]);
  expect(delta("customer")[1]).toBeCloseTo(delta("shop")[1]);
  for (const child of ["checkout", "repository", "order"]) {
    expect(moved.find((row: any) => row[0] === `item:${child}`)).toEqual(before.find((row: any) => row[0] === `item:${child}`));
  }
  await page.getByRole('button', { name: 'Separate dimensions', exact: true }).click();
  await expect.poll(gap).toBeGreaterThan(0);
  await expect.poll(async () => placements(await store())).toEqual(ordinary);
  await page.getByRole('radio', { name: 'Domain', exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole('radio', { name: 'Combined', exact: true }).check();
  await expect.poll(gap).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Fit model', exact: true }).click();
  await expect.poll(gap).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await page.screenshot({ path: test.info().outputPath("combined-separated.png") });
  expect(placements(await store())).toEqual(ordinary);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("read domain and architecture through the same search, relationship, source, and history controls", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator(".canvas-pane")).toHaveAttribute("data-map", "false");
  await expect(page.getByRole("radio", { name: "Domain", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Standard", exact: true })).toBeChecked();
  const active = page.locator("main [data-reader-card].active");
  await page.locator(".sidebar .nav-item").filter({ hasText: /^Order$/ }).click();
  await expect(active.locator("h1")).toHaveText("Order");
  await page.getByPlaceholder("Find...").fill("creates");
  await page.locator(".sidebar .nav-item").filter({ hasText: /^creates$/ }).click();
  await page.getByPlaceholder("Find...").fill("");
  await expect(active.locator("h1")).toHaveText("Order Handling creates Order");
  await active.locator(".relationship-endpoints").getByRole("link", { name: "Open Order Handling", exact: true }).click();
  await expect(active.locator("h1")).toHaveText("Order Handling");
  await expect(active.getByRole("navigation", { name: "Containing object" })).toHaveCount(0);
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(active.locator("h1")).toHaveText("Order Handling creates Order");
  await page.getByRole("button", { name: "Go forward", exact: true }).click();
  await expect(active.locator("h1")).toHaveText("Order Handling");
  await active.locator(".source-links button").first().click();
  await expect(page.locator(".source-scroll")).toContainText("class Checkout");
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Find...").fill("Repository");
  await page.locator(".sidebar .nav-item").filter({ hasText: /^Order Repository$/ }).click();
  await expect(active.locator("h1")).toHaveText("Order Repository");
  await page.setViewportSize({ width: 430, height: 900 });
  await expect(active.locator("h1")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(430);
  await page.screenshot({ path: "../output/model-mobile.png" });
  expect(errors).toEqual([]);
});

test("nested boundaries and shared canvas survive filters, a drawing move, and reload without semantic edits", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("radio", { name: "Standard", exact: true }).check();
  await page.getByRole("radio", { name: "Architecture", exact: true }).check();
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const card = (item: string) => page.locator(`[data-model-id="item:${item}"]`);
  await expect(card("checkout")).toBeVisible();
  for (const [parent, child] of [["shop", "api"], ["api", "checkout"], ["api", "repository"]]) {
    const a = (await card(parent).boundingBox())!, b = (await card(child).boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(a.x);
    expect(b.y).toBeGreaterThanOrEqual(a.y);
    expect(b.x + b.width).toBeLessThanOrEqual(a.x + a.width + 1);
    expect(b.y + b.height).toBeLessThanOrEqual(a.y + a.height + 1);
  }
  await page.screenshot({ path: "../output/model-combined.png" });
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const note = page.locator('.tl-container [contenteditable="true"]');
  await note.fill("Modeling trial: same identities in both views.");
  await note.press("Escape");
  const canvas = async () => (await (await request.get(`/api/projects/${id}/canvas`)).json()).document;
  await expect.poll(canvas).not.toBeNull();
  const before = await canvas();
  await page.getByRole("radio", { name: "Domain", exact: true }).check();
  await expect(card("checkout")).toBeHidden();
  await expect(page.locator(".canvas-pane")).toHaveAttribute("data-map", "false");
  await page.getByRole("radio", { name: "Architecture", exact: true }).check();
  await expect(card("order")).toBeHidden();
  await expect(card("checkout")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Standard", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Atlas · Ink", exact: true })).toBeEnabled();
  await expect(page.getByRole("radio", { name: "Atlas · Village", exact: true })).toBeEnabled();
  await expect(page.getByRole("group", { name: "Dimension", exact: true }).getByRole("radio")).toHaveCount(4);
  await expect.poll(canvas).toEqual(before);
  await page.getByRole("radio", { name: "Planes", exact: true }).click();
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  await expect(page.getByRole("radio", { name: "Domain", exact: true })).toBeDisabled();
  await expect(page.getByRole("radio", { name: "Architecture", exact: true })).toBeDisabled();
  await expect(page.locator(".plane-sheet")).toHaveCount(3);
  await page.getByRole("radio", { name: "2D", exact: true }).click();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(page.getByRole("radio", { name: "Architecture", exact: true })).toBeChecked();
  const beforeMove = await canvas();
  // A visual move changes layout while semantic ownership stays in XML.
  const heading = (await page.getByRole("button", { name: "component: Order Handling", exact: true }).boundingBox())!;
  await page.mouse.move(heading.x + heading.width / 2, heading.y + heading.height / 2);
  await page.mouse.down();
  await page.mouse.move(heading.x + heading.width / 2 + 35, heading.y + heading.height / 2 + 35, { steps: 8 });
  await page.mouse.up();
  await expect.poll(canvas).not.toEqual(beforeMove);
  const records = Object.values((await canvas()).snapshot.store) as any[];
  const object = (item: string) => records.find(r => r.type === "lexicon-object" && r.props.graphId === `item:${item}`);
  expect(object("checkout").parentId).toBe(object("api").id);
  expect(object("api").parentId).toBe(object("shop").id);
  await page.reload();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  expect(JSON.stringify(await canvas())).toContain("Modeling trial");
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
  expect(errors).toEqual([]);
});

test("invalid containment produces a visible model notice", async ({ page }) => {
  await writeFile(join(root, "lexicon/model.xml"), xml.replace('<component id="checkout">', '<component id="checkout" parent="ordering">'));
  await page.goto(`/p/${id}`);
  await page.locator(".overview-link").click();
  const notice = page.locator("main [data-reader-card].active .issues");
  await expect(notice).toBeVisible();
  await notice.locator("summary").click();
  await expect(notice).toContainText("Unknown attribute parent");
});

for (const skin of ["Ink", "Village"]) test(`Architecture Atlas ${skin} keeps nested territories, landmarks, roads, and saved edits`, async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("radio", { name: "Architecture", exact: true }).check();
  await page.getByRole("radio", { name: `Atlas · ${skin}`, exact: true }).check();
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const landmark = page.locator('[data-map-landmark="item:checkout"]');
  await expect(landmark).toHaveAttribute("data-landmark-kind", "workshop");
  await expect(page.locator('[data-map-landmark="item:customer"]')).toHaveAttribute("data-landmark-kind", "traveler");
  await expect(page.locator('[data-map-district="item:shop"]')).toBeVisible();
  await expect(page.locator('[data-map-district="item:api"]')).toBeVisible();
  await expect(page.locator('[data-map-road="relation:saves-order"]')).toBeVisible();
  const containment = () => page.locator('[data-map-district="item:shop"] .map-district').evaluate(el => {
    const parent = el as SVGPathElement;
    const child = document.querySelector('[data-map-district="item:api"] .map-district') as SVGPathElement;
    return Array.from({ length: 160 }, (_, i) => child.getPointAtLength(child.getTotalLength() * i / 160))
      .every(point => parent.isPointInFill(point));
  });
  expect(await containment()).toBe(true);
  await page.getByRole("button", { name: "container: Shop API", exact: true }).click();
  await expect(page.getByLabel("Terrain", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit border", exact: true }).click();
  await expect(page.getByRole("button", { name: "Finish border editing", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Finish border editing", exact: true }).click();
  const node = page.getByRole("button", { name: "component: Order Handling", exact: true });
  await node.click();
  await page.getByLabel("Landmark", { exact: true }).selectOption("archive");
  await page.getByLabel("Landmark", { exact: true }).press("Escape");
  const before = await landmark.getAttribute("transform");
  await page.keyboard.press("ArrowRight");
  await expect(landmark).not.toHaveAttribute("transform", before!);
  expect(await containment()).toBe(true);
  await page.getByRole("button", { name: /^Undo —/ }).click();
  await expect(landmark).toHaveAttribute("transform", before!);
  await expect(landmark).toHaveAttribute("data-landmark-kind", "archive");
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  await page.reload();
  await expect(landmark).toHaveAttribute("data-landmark-kind", "archive");
  await page.getByRole("radio", { name: "Standard", exact: true }).check();
  await expect(landmark).toHaveCount(0);
  await page.getByRole("radio", { name: `Atlas · ${skin}`, exact: true }).check();
  await expect(landmark).toHaveAttribute("transform", before!);
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  if (await page.locator("main").isVisible()) await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await page.screenshot({ path: info.outputPath(`architecture-atlas-${skin.toLowerCase()}.png`) });
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await page.screenshot({ path: info.outputPath(`architecture-atlas-${skin.toLowerCase()}-dark.png`) });
  await node.click();
  const active = page.locator('main [data-reader-card].active');
  await expect(active.locator("h1")).toHaveText("Order Handling");
  await active.locator(".source-links button").first().click();
  await expect(page.locator(".source-scroll")).toContainText("class Checkout");
  await page.setViewportSize({ width: 430, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(430);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
  expect(errors).toEqual([]);
});

test("a flow opens a sequence with participant, relationship, source, search, and history navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/p/${id}?item=place-order`);
  const active = page.locator("main [data-reader-card].active");
  const sequence = page.getByRole("region", { name: "Sequence diagram: Place an Order", exact: true });
  await expect(sequence).toBeVisible();
  await expect(sequence.locator(".flow-participant")).toHaveCount(4);
  await expect(sequence.locator(".flow-steps > li")).toHaveCount(3);
  await expect(sequence.locator(".flow-message")).toHaveText([
    "1. Submit product quantities via HTTP POST /orders", "2. Create and validate the order", "3. Save the accepted order",
  ]);
  await sequence.getByRole("link", { name: "Open participant: Order Handling", exact: true }).click();
  await expect(active.locator("h1")).toHaveText("Order Handling");
  await expect(active.getByRole("navigation", { name: "Containing object" })).toHaveCount(0);
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(sequence).toBeVisible();
  await page.getByRole("button", { name: "Go forward", exact: true }).click();
  await expect(active.locator("h1")).toHaveText("Order Handling");
  await active.locator(".related-flows button").filter({ has: page.getByRole("heading", { name: "Flow Place an Order", exact: true }) }).click();
  await sequence.getByRole("link", { name: "Step 3: Order Handling to Order Repository: Save the accepted order", exact: true }).click();
  await expect(active.locator("h1")).toHaveText("Order Handling saves accepted orders through Order Repository");
  await active.locator(".source-links button").first().click();
  await expect(page.locator(".source-scroll")).toContainText("repository.save(order)");
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Find...").fill("Submit product quantities");
  await page.locator(".sidebar .nav-item").filter({ hasText: /^Place an Order$/ }).click();
  await expect(sequence).toBeVisible();
  await page.getByPlaceholder("Find...").fill("no-such-flow-or-object");
  await expect(page.locator(".sidebar .hint")).toBeVisible();
  await page.getByPlaceholder("Find...").fill("");
  await page.screenshot({ path: "../output/model-flow.png" });
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await expect(sequence).toBeVisible();
  expect(await sequence.locator(".flow-arrow > path").first().evaluate(el => getComputedStyle(el).stroke)).toBe("rgb(244, 244, 244)");
  await page.screenshot({ path: "../output/model-flow-dark.png" });
  await page.getByRole("button", { name: "Use light theme", exact: true }).click();
  await page.setViewportSize({ width: 430, height: 900 });
  await expect(sequence).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(430);
  expect(await sequence.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await sequence.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await expect(sequence.getByRole("link", { name: "Open participant: Order Repository" })).toBeInViewport();
  await page.screenshot({ path: "../output/model-flow-mobile.png" });
  await page.reload();
  await expect(sequence.locator(".flow-message")).toHaveCount(3);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
  expect(errors).toEqual([]);
});

test("repeated, reverse, and self interactions keep separate arrows and long labels", async ({ page }) => {
  const model = parseModel(xml), flow = model.items.find(i => i.type === "flow")!;
  const longLabel = "Read the supplied quantities and validate every requested product before accepting the order";
  model.items.push(
    { type: "relationship", id: "reverse", from: "repository", to: "checkout", name: "notifies", description: "Rendering fixture.", annotations: [], codeLinks: [] },
    { type: "relationship", id: "self", from: "repository", to: "repository", name: "continues", description: "Rendering fixture.", annotations: [], codeLinks: [] },
  );
  flow.steps.push(
    { id: "again", relationship: "handles-order", label: longLabel },
    { id: "notify", relationship: "reverse", label: "Notify the caller" },
    { id: "continue", relationship: "self", label: "Continue local processing" },
  );
  await writeFile(join(root, "lexicon/model.xml"), serializeModel(model));
  await page.goto(`/p/${id}?item=place-order`);
  const sequence = page.locator("main [data-reader-card].active .flow-sequence");
  await expect(sequence.locator(".flow-steps > li")).toHaveCount(6);
  await expect(sequence.locator(".flow-participant")).toHaveCount(4);
  const repeated = sequence.locator('[data-step-id="again"] a');
  await expect(repeated).toContainText(longLabel);
  const reverse = await sequence.locator('[data-step-id="notify"] svg > path').getAttribute("d");
  const coordinates = reverse!.match(/[\d.]+/g)!.map(Number);
  expect(coordinates[0]).toBeGreaterThan(coordinates[2]);
  await expect(sequence.locator('[data-step-id="continue"] svg > path')).toHaveAttribute("d", / V 26 H /);
  expect(await repeated.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test("broken flow references produce a readable notice and retain the unresolved step", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await writeFile(join(root, "lexicon/model.xml"), xml.replace('relationship="saves-order"', 'relationship="missing"'));
  await page.goto(`/p/${id}?item=place-order`);
  const active = page.locator("main [data-reader-card].active");
  await expect(active.locator(".flow-missing")).toContainText("Unavailable relationship or Architecture participant: missing");
  await active.locator(".issues summary").click();
  await expect(active.locator(".issues")).toContainText("Step save must reference a relationship: missing");
  expect(errors).toEqual([]);
});

test("chat refines one flow step, rejects a dangling reference, and restores exact XML with undo", async ({ page }) => {
  await page.goto(`/p/${id}?item=place-order`);
  await page.getByRole("button", { name: "Agent", exact: true }).click();
  const chat = page.getByRole("complementary", { name: "Project conversation" });
  await expect(chat.locator(".chat-attachment")).toContainText("Place an Order");
  const input = chat.getByRole("textbox", { name: "Message the coding agent" });
  await input.fill("Refine flow step save to Store the validated order.");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(chat.getByText("Model updated", { exact: true })).toBeVisible();
  const active = page.locator("main [data-reader-card].active");
  await expect(active.locator('[data-step-id="save"]')).toContainText("Store the validated order");
  const changed = await readFile(join(root, "lexicon/model.xml"), "utf8");
  const before = parseModel(xml), after = parseModel(changed);
  expect(after.items.filter(i => i.type !== "flow")).toEqual(before.items.filter(i => i.type !== "flow"));
  expect(after.items.find(i => i.type === "flow")?.steps.map(step => step.id)).toEqual(["submit", "create", "save"]);
  await input.fill("Break flow reference in step save.");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(chat.locator(".chat-error")).toContainText("must reference a relationship");
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(changed);
  await chat.getByRole("button", { name: "Undo edit" }).click();
  await expect(active.locator('[data-step-id="save"]')).toContainText("Save the accepted order");
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("Planes keeps the canvas shell and shared reader controls", async ({ page }) => {
  await page.goto(`/p/${id}?item=order`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  const shell = await page.locator('.canvas-pane').elementHandle();
  await page.getByRole('radio', { name: 'Planes', exact: true }).click();
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  expect(await shell!.evaluate(element => element.isConnected)).toBe(true);
  await expect(page.locator('.canvas-pane')).toHaveCount(1);
  await expect(page.locator('.canvas-pane .toolbar')).toHaveCount(1);
  const active = page.locator('main [data-reader-card].active');
  await expect(active.locator('h1')).toHaveText('Order');
  await page.getByPlaceholder("Find...").fill("creates");
  await page.locator(".sidebar .nav-item").filter({ hasText: /^creates$/ }).click();
  await page.getByPlaceholder("Find...").fill("");
  await expect(active.locator('h1')).toHaveText('Order Handling creates Order');
  await active.locator('.source-links button').first().click();
  await expect(page.locator('.source-scroll')).toContainText('class Checkout');
  await page.getByRole('radio', { name: '2D', exact: true }).click();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  expect(await shell!.evaluate(element => element.isConnected)).toBe(true);
  await expect(active.locator('h1')).toHaveText('Order Handling creates Order');
  await expect(page.locator('.source-scroll')).toContainText('class Checkout');
});

test("canvas presentation buttons stay in place when view-specific controls appear", async ({ page }) => {
  await page.goto(`/p/${id}?presentation=planes`);
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  for (const width of [1600, 430, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const mode = page.getByRole("group", { name: "Canvas presentation", exact: true });
    const before = (await mode.boundingBox())!;
    for (const name of ["2D", "Planes", "2D", "Planes"]) {
      await page.getByRole("radio", { name, exact: true }).click();
      await expect(page.locator(name === "Planes" ? '.planes-stage[data-ready="true"]' : '.canvas-stage[data-ready="true"]')).toBeVisible();
      if (name === "2D") {
        await page.getByRole("radio", { name: "Domain", exact: true }).check();
        for (const skin of ["standard", "ink", "village"]) {
          await page.getByRole("radio", { name: skin === "standard" ? "Standard" : skin === "ink" ? "Atlas · Ink" : "Atlas · Village", exact: true }).check();
          await expect(page.getByRole("radio", { name: "2D", exact: true })).toBeChecked();
          await expect(page.locator(".canvas-pane")).toHaveAttribute("data-presentation", "flat");
        }
        await page.getByRole("radio", { name: "Atlas · Village", exact: true }).press("ArrowLeft");
        await expect(page.getByRole("radio", { name: "Atlas · Ink", exact: true })).toBeChecked();
        await expect(page.getByRole("radio", { name: "Domain", exact: true })).toBeChecked();
        await expect(page.getByRole("radio", { name: "2D", exact: true })).toBeChecked();
      } else {
        for (const label of ["Domain", "Architecture", "Standard", "Atlas · Ink", "Atlas · Village"]) {
          await expect(page.getByRole("radio", { name: label, exact: true })).toBeVisible();
          await expect(page.getByRole("radio", { name: label, exact: true })).toBeDisabled();
        }
      }
      const after = (await mode.boundingBox())!;
      expect(after.x).toBeCloseTo(before.x, 0);
      expect(after.y).toBeCloseTo(before.y, 0);
      expect(after.width).toBeCloseTo(before.width, 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  }
});

test("frameless planes pan together without editing the model and lower cards remain selectable", async ({ page }) => {
  await page.goto(`/p/${id}?presentation=planes`);
  const stage = page.locator('.planes-stage[data-ready="true"]');
  await expect(stage).toBeVisible();
  if (await page.locator('main').isVisible()) await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
  const order = page.getByRole('button', { name: 'concept: Order', exact: true });
  const before = await order.boundingBox();
  const bounds = (await stage.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width - 100, bounds.y + bounds.height - 80);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 400, bounds.y + bounds.height - 150, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await order.boundingBox())!.x - before!.x)).toBeGreaterThan(40);
  expect(await readFile(join(root, 'lexicon/model.xml'), 'utf8')).toBe(xml);
  await page.getByRole('button', { name: 'Fit model', exact: true }).click();
  await page.getByRole('button', { name: 'person: Customer', exact: true }).click();
  await expect(page.locator('main [data-reader-card].active h1')).toHaveText('Customer');
});

test("3D view gestures rotate, separate, and reset without changing the model", async ({ page }) => {
  await page.goto(`/p/${id}?presentation=planes`);
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  if (await page.locator('main').isVisible()) await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
  await expect(page.locator('.planes-view-controls')).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
  const readerBounds = (await page.locator('#main-content').boundingBox())!;
  const helpBounds = (await page.getByRole('button', { name: '3D control cheatsheet', exact: true }).boundingBox())!;
  expect(helpBounds.x + helpBounds.width).toBeLessThan(readerBounds.x);
  await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
  await page.getByRole('button', { name: '3D control cheatsheet', exact: true }).click();
  await expect(page.locator('.planes-stage .planes-help')).toBeVisible();
  await expect(page.getByText('Pan', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '3D control cheatsheet', exact: true }).click();
  const scene = page.locator('.planes-scene');
  const initial = await scene.getAttribute('style');
  const stage = (await page.locator('.planes-stage').boundingBox())!;
  const gesture = async (button: "left" | "right" = "left") => {
    await page.mouse.move(stage.x + stage.width - 100, stage.y + 120);
    await page.mouse.down({ button });
    await page.mouse.move(stage.x + stage.width - 260, stage.y + 190, { steps: 12 });
    await page.mouse.up({ button });
  };
  await page.keyboard.down('Alt');
  await gesture();
  await page.keyboard.up('Alt');
  await expect(scene).not.toHaveAttribute('style', initial!);
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await gesture();
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  const snappedOrbit = (await scene.getAttribute('style'))!;
  for (const axis of ['X', 'Y']) {
    const angle = Number(snappedOrbit.match(new RegExp('rotate' + axis + '\\((-?[0-9.]+)deg'))![1]);
    expect(Math.abs(angle % 15)).toBe(0);
  }
  const orbit = await scene.getAttribute('style');
  const surface = page.locator('[data-plane="domain"] .plane-surface');
  const beforePan = await surface.getAttribute('style');
  await gesture('right');
  await expect(scene).toHaveAttribute('style', orbit!);
  await expect(surface).not.toHaveAttribute('style', beforePan!);
  const afterRightPan = await surface.getAttribute('style');
  await page.keyboard.down('Shift');
  await gesture();
  await page.keyboard.up('Shift');
  await expect(scene).toHaveAttribute('style', orbit!);
  await expect(surface).not.toHaveAttribute('style', afterRightPan!);
  const plane = page.locator('[data-plane="domain"]');
  const separation = await plane.getAttribute('style');
  await page.keyboard.down('Control');
  await gesture();
  await page.keyboard.up('Control');
  await expect(plane).not.toHaveAttribute('style', separation!);
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await gesture();
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await expect(scene).not.toHaveAttribute('style', orbit!);
  const snappedRoll = Number((await scene.getAttribute('style'))!.match(/rotateZ\((-?[0-9.]+)deg/)![1]);
  expect(Math.abs(snappedRoll % 15)).toBe(0);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(scene).toHaveAttribute('style', /rotateX\(45deg\) rotateY\(0deg\) rotateZ\(0deg\)/);
  await expect(plane).toHaveAttribute('data-sheet-z', '69');
  await expect(plane).toHaveAttribute('data-sheet-y', '0');
  const resetPlane = await plane.getAttribute('style');
  const resetScale = (await scene.getAttribute('style'))!.match(/scale\([^)]+\)/)![0];
  await page.keyboard.down('Alt');
  await page.mouse.move(stage.x + stage.width - 100, stage.y + 120);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width - 96, stage.y + 122, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(plane).toHaveAttribute('style', resetPlane!);
  expect((await scene.getAttribute('style'))!.match(/scale\([^)]+\)/)![0]).toBe(resetScale);
  const rotated = Number((await scene.getAttribute('style'))!.match(/rotateY\((-?[0-9.]+)deg/)![1]);
  expect(rotated).toBeCloseTo(1.6);

  expect(await readFile(join(root, 'lexicon/model.xml'), 'utf8')).toBe(xml);
});


test("planes share canvas scale and wheel zoom anchors the projected scene to the pointer", async ({ page }) => {
  await page.goto(`/p/${id}?presentation=planes`);
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  if (await page.locator('main').isVisible()) await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
  const surfaces = page.locator('[data-plane="domain"] .plane-surface, [data-plane="architecture"] .plane-surface');
  await expect(page.locator('.plane-sheet')).toHaveCount(3);
  await expect(surfaces).toHaveCount(2);
  await expect.poll(async () => surfaces.evaluateAll(nodes => nodes.map(n => (n as HTMLElement).dataset.canvasZoom))).toEqual([
    await surfaces.first().getAttribute('data-canvas-zoom'), await surfaces.first().getAttribute('data-canvas-zoom'),
  ]);
  const stage = (await page.locator('.planes-stage').boundingBox())!;
  const pointer = { x: stage.width * .7, y: stage.height * .4 };
  const before = await surfaces.first().boundingBox();
  const renderBefore = Number(await surfaces.first().getAttribute("data-render-zoom"));
  await page.mouse.move(stage.x + pointer.x, stage.y + pointer.y);
  await page.mouse.wheel(0, -180);
  const camera = page.locator('.planes-camera');
  await expect(camera).not.toHaveAttribute('style', 'transform: translate(0px, 0px) scale(1);');
  const matrix = await camera.evaluate(node => { const m = new DOMMatrix(getComputedStyle(node).transform); return { x:m.e, y:m.f, z:m.a }; });
  expect(matrix.z).toBeGreaterThan(1);
  await expect.poll(async () => Number(await surfaces.first().getAttribute("data-render-zoom")) / renderBefore).toBeCloseTo(matrix.z, 2);
  expect(Math.abs(matrix.x + pointer.x * matrix.z - pointer.x)).toBeLessThan(1);
  expect(Math.abs(matrix.y + pointer.y * matrix.z - pointer.y)).toBeLessThan(1);
  const after = await surfaces.first().boundingBox();
  expect(after!.width / before!.width).toBeCloseTo(matrix.z, 2);
  expect(await readFile(join(root, 'lexicon/model.xml'), 'utf8')).toBe(xml);
});

test("planes middle-drag pans without zooming", async ({ page }) => {
  await page.goto(`/p/${id}?presentation=planes`);
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  if (await page.locator('main').isVisible()) await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
  const node = page.getByRole('button', { name: 'concept: Order', exact: true });
  const zoom = () => page.locator('.planes-camera').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
  const before = (await node.boundingBox())!;
  const z = await zoom();
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(before.x + before.width / 2 + 80, before.y + before.height / 2 + 40, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  const after = (await node.boundingBox())!;
  expect(await zoom()).toBeCloseTo(z, 4);
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(20);
  expect(await readFile(join(root, 'lexicon/model.xml'), 'utf8')).toBe(xml);
});

test("moving a Planes node does not open the reader, but a following click does", async ({ page }) => {
  await page.goto(`/p/${id}?presentation=planes`);
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  if (await page.locator('main').isVisible()) await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
  const node = page.getByRole('button', { name: 'concept: Order', exact: true });
  const bounds = (await node.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 70, bounds.y + bounds.height / 2 + 30, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('main')).not.toBeVisible();
  await expect.poll(async () => Math.abs((await node.boundingBox())!.x - bounds.x)).toBeGreaterThan(20);
  await page.getByLabel("Plane options", { exact: true }).click();
  await page.getByLabel("All connections", { exact: true }).uncheck();
  await page.getByLabel("Plane options", { exact: true }).click();
  await node.click();
  await expect(page.locator('main [data-reader-card].active h1')).toHaveText('Order');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => Number(await page.locator('.plane-editor').first().getAttribute('data-render-scale'))).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Locate in canvas', exact: true }).click();
  await expect(page.locator('.planes-camera')).toHaveAttribute('style', 'transform: translate(0px, 0px) scale(1);');
  await expect(page.locator('.planes-stage')).toHaveAttribute('data-view', 'both');
  const locatedNode = (await node.boundingBox())!;
  const stageBounds = (await page.locator('.planes-stage').boundingBox())!;
  expect(Math.abs(locatedNode.x + locatedNode.width / 2 - stageBounds.x - stageBounds.width / 2)).toBeLessThan(5);
});


test("Planes redraws text at high viewer zoom", async ({ page }) => {
  await page.goto(`/p/${id}?presentation=planes`);
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  if (await page.locator('main').isVisible()) await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
  const node = page.getByRole('button', { name: 'concept: Order', exact: true });
  const b = (await node.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.wheel(0, -700);
  await expect.poll(async () => Number(await page.locator('.plane-editor').first().getAttribute('data-render-scale'))).toBeGreaterThan(4);
  await page.waitForTimeout(1200); // Allow the compositor to rasterize the higher-resolution planes.
  await page.screenshot({ path: test.info().outputPath('planes-high-zoom.png') });
});


test("2D drawings stay on their dimension page through switching and reload", async ({ page, request }) => {
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  const add = async (text: string) => {
    await page.getByRole("button", { name: "Add note", exact: true }).click();
    const input = page.locator('.tl-container [contenteditable="true"]');
    await input.fill(text);
    await input.press("Escape");
  };
  await add("Domain drawing");
  await page.getByRole("button", { name: /^Undo —/ }).click();
  await expect(page.locator(".tl-shape").getByText("Domain drawing", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Redo —/ }).click();
  await expect(page.locator(".tl-shape").getByText("Domain drawing", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Architecture", exact: true }).check();
  await expect(page.locator(".tl-shape").getByText("Domain drawing", { exact: true })).toHaveCount(0);
  await add("Architecture drawing");
  await expect.poll(async () => {
    const store = (await (await request.get(`/api/projects/${id}/canvas`)).json()).document?.snapshot.store || {};
    return Object.values(store).filter((r: any) => r.type === "note").map((r: any) => r.parentId).sort();
  }).toEqual(["page:lexicon-architecture", "page:lexicon-domain"]);
  await page.reload();
  await expect(page.locator(".tl-shape").getByText("Architecture drawing", { exact: true })).toBeVisible();
  await expect(page.locator(".tl-shape").getByText("Domain drawing", { exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "Domain", exact: true }).check();
  await expect(page.locator(".tl-shape").getByText("Domain drawing", { exact: true })).toBeVisible();
  await expect(page.locator(".tl-shape").getByText("Architecture drawing", { exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await expect(page.locator(".tl-shape").getByText("Domain drawing", { exact: true })).toHaveCount(1);
  await expect(page.locator(".tl-shape").getByText("Architecture drawing", { exact: true })).toHaveCount(1);
  await add("Combined drawing");
  await page.getByRole("radio", { name: "Domain", exact: true }).check();
  await expect(page.locator(".tl-shape").getByText("Combined drawing", { exact: true })).toHaveCount(1);
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await expect(page.locator(".tl-shape").getByText("Combined drawing", { exact: true })).toBeVisible();
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  await page.reload();
  await expect(page.locator(".tl-shape").getByText("Combined drawing", { exact: true })).toBeVisible();
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("legacy shared drawings migrate once and retain their original recovery page", async ({ page, request }) => {
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const input = page.locator('.tl-container [contenteditable="true"]');
  await input.fill("Legacy architecture note");
  await input.press("Escape");
  await page.getByRole("button", { name: "Selection actions", exact: true }).click();
  await page.getByRole("combobox", { name: "Note attachment", exact: true }).selectOption("checkout");
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  const canvas = async () => (await (await request.get(`/api/projects/${id}/canvas`)).json()).document;
  await expect.poll(async () => Object.values((await canvas())?.snapshot.store || {}).some((r: any) => r.type === "lexicon-note")).toBe(true);
  const document = await canvas();
  await page.goto("about:blank");
  const store: Record<string, any> = {};
  const legacyId = (value: string) => value.replace("shape:lexicon-view:domain:", "shape:lexicon:").replace("page:lexicon-domain", "page:legacy");
  for (const record of Object.values(document.snapshot.store) as any[]) {
    if (record.typeName === "page" && record.id !== "page:lexicon-domain") continue;
    const next = { ...record, id: legacyId(record.id) };
    if (record.typeName === "shape") {
      next.parentId = legacyId(record.parentId);
      next.meta = { ...record.meta }; delete next.meta.lexiconProjection;
    }
    if (record.typeName === "binding") { next.fromId = legacyId(record.fromId); next.toId = legacyId(record.toId); }
    store[next.id] = next;
  }
  document.snapshot.store = store;
  await writeFile(join(root, "lexicon/canvas.json"), JSON.stringify(document));
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator(".tl-shape").getByText("Legacy architecture note", { exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "Architecture", exact: true }).check();
  await expect(page.locator(".tl-shape").getByText("Legacy architecture note", { exact: true })).toHaveCount(1);
  await expect.poll(async () => (await canvas())?.snapshot.store["page:legacy"]?.name).toBe("Legacy canvas (recovery)");
  const saved = await canvas();
  const notes = Object.values(saved.snapshot.store).filter((r: any) => r.type === "note") as any[];
  expect(notes).toHaveLength(2);
  const oldNote = notes.find(r => r.parentId === "page:legacy");
  const migratedNote = notes.find(r => r.parentId === "page:lexicon-architecture");
  expect(migratedNote).toMatchObject({ x: oldNote.x, y: oldNote.y, props: oldNote.props });
  const binding: any = Object.values(saved.snapshot.store).find((r: any) => r.typeName === "binding" && r.fromId === migratedNote.id);
  expect(saved.snapshot.store[binding.toId].meta.lexiconProjection).toBe("architecture");
  await page.reload();
  await expect(page.locator(".tl-shape").getByText("Legacy architecture note", { exact: true })).toHaveCount(1);
  expect(Object.values((await canvas()).snapshot.store).filter((r: any) => r.type === "note")).toHaveLength(2);
});


test("Combined active drawing plane saves native content in source coordinates", async ({ page, request }) => {
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  const store = async () => (await (await request.get(`/api/projects/${id}/canvas`)).json()).document?.snapshot.store || {};
  const notes = async (dimension: string) => Object.values(await store()).filter((r: any) => r.typeName === "shape" && r.type === "note" && r.parentId === `page:lexicon-${dimension}`) as any[];
  const add = async (text: string) => {
    await page.getByRole("button", { name: "Add note", exact: true }).click();
    const note = page.locator('.tl-container [contenteditable="true"]');
    await note.fill(text); await note.press("Escape");
  };
  await page.getByRole("button", { name: "Drag Architecture", exact: true }).click();
  await expect(page.getByRole("status", { name: "Drawing plane", exact: true })).toHaveText("Architecture");
  await add("Architecture from Combined");
  await expect.poll(async () => (await notes("architecture")).length).toBe(1);
  await expect.poll(async () => (await notes("domain")).length).toBe(0);
  const verifyPosition = async () => {
    const records: any = await store();
    const source: any = Object.values(records).find((r: any) => r.type === "note" && r.parentId === "page:lexicon-architecture");
    const mirror = source && records[source.meta.combinedMirrorId];
    const offset = records['page:lexicon-combined']?.meta.combinedOffsets?.architecture;
    return !!mirror && !!offset && Math.abs(mirror.x - source.x - offset.x) < .01 && Math.abs(mirror.y - source.y - offset.y) < .01;
  };
  await expect.poll(verifyPosition).toBe(true);
  await page.getByRole("button", { name: "Selection actions", exact: true }).click();
  await page.getByRole("combobox", { name: "Note attachment", exact: true }).selectOption("checkout");
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(page.getByText("Attached to Order Handling", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Selection actions", exact: true }).click();
  await expect.poll(async () => {
    const records: any = await store();
    return Object.values(records).filter((r: any) => r.typeName === "binding" && r.type === "lexicon-note" && records[r.toId]?.meta.lexiconProjection === "architecture").length;
  }).toBe(1);
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.getByRole("button", { name: "Drag Domain", exact: true }).click();
  await expect(page.getByRole("status", { name: "Drawing plane", exact: true })).toHaveText("Domain");
  await add("Domain from Combined");
  await expect.poll(async () => (await notes("domain")).length).toBe(1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+z");
  // Text editing is a separate undo step; undo through creation.
  await page.keyboard.press("Meta+z");
  await expect.poll(async () => (await notes("domain")).length).toBe(0);
  await page.keyboard.press("Meta+Shift+z");
  await page.keyboard.press("Meta+Shift+z");
  await expect.poll(async () => (await notes("domain")).length).toBe(1);
  await page.getByRole("radio", { name: "Architecture", exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator(".tl-shape").getByText("Architecture from Combined", { exact: true })).toHaveCount(1);
  await expect(page.locator(".tl-shape").getByText("Domain from Combined", { exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect.poll(verifyPosition).toBe(true);
  await page.reload();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag Domain", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".tl-shape").getByText("Architecture from Combined", { exact: true })).toHaveCount(1);
  await expect.poll(async () => (await notes("architecture")).length).toBe(1);
  await expect.poll(verifyPosition).toBe(true);
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("d");
  const stage = (await page.locator('.canvas-stage').boundingBox())!;
  await page.mouse.move(stage.x + stage.width - 180, stage.y + 220); await page.mouse.down();
  await page.mouse.move(stage.x + stage.width - 90, stage.y + 280, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => Object.values(await store()).filter((r: any) => r.type === "draw" && r.parentId === "page:lexicon-domain").length).toBe(1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("v");
  await page.mouse.click(stage.x + stage.width - 130, stage.y + 253);
  await page.keyboard.press("Backspace");
  await expect.poll(async () => Object.values(await store()).filter((r: any) => r.type === "draw").length).toBe(0);
  await page.keyboard.press("Meta+z");
  await expect.poll(async () => Object.values(await store()).filter((r: any) => r.type === "draw" && r.parentId === "page:lexicon-domain").length).toBe(1);
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.screenshot({ path: test.info().outputPath("combined-active-drawing-plane.png") });
  await page.setViewportSize({ width: 430, height: 900 });
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await expect(page.getByRole("button", { name: "Drag Architecture", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Drag Architecture", exact: true }).click();
  await expect(page.getByRole("button", { name: "Drag Architecture", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const badge = await page.getByRole("status", { name: "Drawing plane", exact: true }).boundingBox();
  const tools = await page.locator(".tlui-main-toolbar__left > .tlui-main-toolbar__tools").boundingBox();
  expect(badge!.x + badge!.width).toBeLessThanOrEqual(tools!.x);
  expect(Math.abs(badge!.y + badge!.height / 2 - tools!.y - tools!.height / 2)).toBeLessThan(3);
  await expect(page.locator('.combined-region[data-dimension="architecture"]')).toHaveAttribute("data-active", "true");
  await page.screenshot({ path: test.info().outputPath("combined-active-plane-narrow.png") });
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("Combined remains stable while another view polls the same canvas", async ({ page, context, request }) => {
  await page.goto(`/p/${id}`);
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  const other = await context.newPage();
  await other.goto(`/p/${id}`);
  await other.getByRole("radio", { name: "Architecture", exact: true }).check();
  await expect(other.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(other.locator('[data-save-status="saved"]')).toBeVisible();
  const revisions: any[] = [];
  for (let n = 0; n < 5; n++) {
    await page.waitForTimeout(3100);
    revisions.push((await (await request.get(`/api/projects/${id}/canvas`)).json()).revision);
  }
  expect(new Set(revisions.slice(1)).size).toBe(1);
});

for (const width of [1600, 600]) test(`radial Reader hover is temporary and leaves navigation untouched at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "concept: Order", exact: true }).hover();
  const neighbor = page.getByRole("button", { name: "Go to Order Handling", exact: true });
  const preview = page.getByRole("region", { name: "Neighbor Reader preview" });
  const before = await page.evaluate(() => ({ url: location.href, history: history.state, storage: JSON.stringify(sessionStorage) }));
  await neighbor.hover();
  await expect(preview).toBeVisible();
  await expect(preview.locator("h1")).toHaveText("Order Handling");
  await preview.hover();
  await page.waitForTimeout(400);
  await expect(preview).toBeVisible();
  expect(await page.evaluate(() => ({ url: location.href, history: history.state, storage: JSON.stringify(sessionStorage) }))).toEqual(before);
  const bounds = await preview.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  await page.screenshot({ path: `../output/radial-reader-preview-${width}.png` });
  await page.mouse.move(5, 5);
  await expect(preview).toBeHidden();
  await page.getByRole("button", { name: "concept: Order", exact: true }).hover();
  await neighbor.focus();
  await expect(preview).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(preview.getByRole("button", { name: "Read card: Order Handling", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(preview.getByRole("button", { name: "Pin Order Handling", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
  await expect(neighbor).toBeFocused();
  await neighbor.hover();
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Pin Order Handling", exact: true }).click();
  await expect(preview).toBeHidden();
  await expect(page.locator('main [data-reader-card].active h1')).toHaveText("Order Handling");
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});
