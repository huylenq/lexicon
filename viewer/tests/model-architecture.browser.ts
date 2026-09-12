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

test("read domain and architecture through the same search, relationship, source, and history controls", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator(".canvas-pane")).toHaveAttribute("data-map", "false");
  const active = page.locator("main [data-reader-card].active");
  await page.locator(".sidebar .nav-item").filter({ hasText: /^Order$/ }).click();
  await expect(active.locator("h1")).toHaveText("Order");
  await active.getByRole("link", { name: "Read relationship: creates", exact: true }).click();
  await expect(active.locator("h1")).toHaveText("Order Handling creates Order");
  await active.getByRole("link", { name: "Open Order Handling", exact: true }).click();
  await expect(active.locator("h1")).toHaveText("Order Handling");
  await expect(active.getByRole("navigation", { name: "Containing object" })).toHaveText("Shop API");
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(active.locator("h1")).toHaveText("Order Handling creates Order");
  await page.getByRole("button", { name: "Go forward", exact: true }).click();
  await expect(active.locator("h1")).toHaveText("Order Handling");
  await active.locator(".code-links button").first().click();
  await expect(page.locator(".code-scroll")).toContainText("class Checkout");
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
  await page.getByRole("combobox", { name: "Model view" }).selectOption("domain");
  await expect(card("checkout")).toBeHidden();
  await expect(page.locator(".canvas-pane")).toHaveAttribute("data-map", "true");
  await page.getByRole("combobox", { name: "Model view" }).selectOption("architecture");
  await expect(card("order")).toBeHidden();
  await expect(card("checkout")).toBeVisible();
  await page.getByRole("combobox", { name: "Model view" }).selectOption("all");
  await expect(card("order")).toBeVisible();
  await expect.poll(canvas).toEqual(before);
  // A visual move changes layout while semantic ownership stays in XML.
  const heading = (await page.getByRole("button", { name: "component: Order Handling", exact: true }).boundingBox())!;
  await page.mouse.move(heading.x + heading.width / 2, heading.y + heading.height / 2);
  await page.mouse.down();
  await page.mouse.move(heading.x + heading.width / 2 + 35, heading.y + heading.height / 2 + 35, { steps: 8 });
  await page.mouse.up();
  await expect.poll(canvas).not.toEqual(before);
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

test("a flow opens a sequence with participant, relationship, source, search, and history navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/p/${id}?item=place-order`);
  const active = page.locator("main [data-reader-card].active");
  const sequence = active.getByRole("region", { name: "Sequence diagram: Place an Order", exact: true });
  await expect(sequence).toBeVisible();
  await expect(sequence.locator(".flow-participant")).toHaveCount(4);
  await expect(sequence.locator(".flow-steps > li")).toHaveCount(3);
  await expect(sequence.locator(".flow-message")).toHaveText([
    "1. Submit product quantities", "2. Create and validate the order", "3. Save the accepted order",
  ]);
  await sequence.getByRole("link", { name: "Open participant: Order Handling", exact: true }).click();
  await expect(active.locator("h1")).toHaveText("Order Handling");
  await expect(active.getByRole("navigation", { name: "Containing object" })).toHaveText("Shop API");
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(sequence).toBeVisible();
  await page.getByRole("button", { name: "Go forward", exact: true }).click();
  await expect(active.locator("h1")).toHaveText("Order Handling");
  await active.locator(".related-flows button").filter({ hasText: "Place an Order" }).click();
  await sequence.getByRole("link", { name: "Step 3: Order Handling to Order Repository: Save the accepted order", exact: true }).click();
  await expect(active.locator("h1")).toHaveText("Order Handling saves accepted orders through Order Repository");
  await active.locator(".code-links button").first().click();
  await expect(page.locator(".code-scroll")).toContainText("repository.save(order)");
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
  await expect(active.locator(".flow-missing")).toContainText("Unavailable relationship or participant: missing");
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

test("Layers keeps the canvas shell and shared reader controls", async ({ page }) => {
  await page.goto(`/p/${id}?item=order`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  const shell = await page.locator('.canvas-pane').elementHandle();
  await page.getByRole('radio', { name: 'Layers', exact: true }).check();
  await expect(page.locator('.layers-stage[data-ready="true"]')).toBeVisible();
  expect(await shell!.evaluate(element => element.isConnected)).toBe(true);
  await expect(page.locator('.canvas-pane')).toHaveCount(1);
  await expect(page.locator('.canvas-pane .toolbar')).toHaveCount(1);
  const active = page.locator('main [data-reader-card].active');
  await expect(active.locator('h1')).toHaveText('Order');
  await active.getByRole('link', { name: 'Read relationship: creates', exact: true }).click();
  await expect(active.locator('h1')).toHaveText('Order Handling creates Order');
  await active.locator('.code-links button').first().click();
  await expect(page.locator('.code-scroll')).toContainText('class Checkout');
  await page.getByRole('radio', { name: 'Diagram', exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  expect(await shell!.evaluate(element => element.isConnected)).toBe(true);
  await expect(active.locator('h1')).toHaveText('Order Handling creates Order');
  await expect(page.locator('.code-scroll')).toContainText('class Checkout');
});

test("frameless layers pan together without editing the model and lower cards remain selectable", async ({ page }) => {
  await page.goto(`/p/${id}?presentation=layers`);
  const stage = page.locator('.layers-stage[data-ready="true"]');
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
  await page.goto(`/p/${id}?presentation=layers`);
  await expect(page.locator('.layers-stage[data-ready="true"]')).toBeVisible();
  if (await page.locator('main').isVisible()) await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
  await expect(page.locator('.layers-view-controls')).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
  const readerBounds = (await page.locator('#main-content').boundingBox())!;
  const helpBounds = (await page.getByRole('button', { name: '3D control cheatsheet', exact: true }).boundingBox())!;
  expect(helpBounds.x + helpBounds.width).toBeLessThan(readerBounds.x);
  await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
  await page.getByRole('button', { name: '3D control cheatsheet', exact: true }).click();
  await expect(page.locator('.layers-stage .layers-help')).toBeVisible();
  await expect(page.getByText('Pan', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '3D control cheatsheet', exact: true }).click();
  const scene = page.locator('.layers-scene');
  const initial = await scene.getAttribute('style');
  const stage = (await page.locator('.layers-stage').boundingBox())!;
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
  const surface = page.locator('[data-plane="domain"] .layer-surface');
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


test("layers share canvas scale and wheel zoom anchors the projected scene to the pointer", async ({ page }) => {
  await page.goto(`/p/${id}?presentation=layers`);
  await expect(page.locator('.layers-stage[data-ready="true"]')).toBeVisible();
  if (await page.locator('main').isVisible()) await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
  const surfaces = page.locator('.layer-surface');
  await expect(surfaces).toHaveCount(2);
  await expect.poll(async () => surfaces.evaluateAll(nodes => nodes.map(n => (n as HTMLElement).dataset.canvasZoom))).toEqual([
    await surfaces.first().getAttribute('data-canvas-zoom'), await surfaces.first().getAttribute('data-canvas-zoom'),
  ]);
  const stage = (await page.locator('.layers-stage').boundingBox())!;
  const pointer = { x: stage.width * .7, y: stage.height * .4 };
  const before = await surfaces.first().boundingBox();
  const renderBefore = Number(await surfaces.first().getAttribute("data-render-zoom"));
  await page.mouse.move(stage.x + pointer.x, stage.y + pointer.y);
  await page.mouse.wheel(0, -180);
  const camera = page.locator('.layers-camera');
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

test("moving a Layers node does not open the reader, but a following click does", async ({ page }) => {
  await page.goto(`/p/${id}?presentation=layers`);
  await expect(page.locator('.layers-stage[data-ready="true"]')).toBeVisible();
  if (await page.locator('main').isVisible()) await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
  const node = page.getByRole('button', { name: 'concept: Order', exact: true });
  const bounds = (await node.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 70, bounds.y + bounds.height / 2 + 30, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('main')).not.toBeVisible();
  await expect.poll(async () => Math.abs((await node.boundingBox())!.x - bounds.x)).toBeGreaterThan(20);
  await page.getByLabel("Layer options", { exact: true }).click();
  await page.getByLabel("All connections", { exact: true }).uncheck();
  await page.getByLabel("Layer options", { exact: true }).click();
  await node.click();
  await expect(page.locator('main [data-reader-card].active h1')).toHaveText('Order');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => Number(await page.locator('.layer-editor').first().getAttribute('data-render-scale'))).toBeGreaterThan(1);
  await page.getByText('Locate in canvas', { exact: true }).click();
  await expect(page.locator('.layers-camera')).toHaveAttribute('style', 'transform: translate(0px, 0px) scale(1);');
  await expect(page.locator('.layers-stage')).toHaveAttribute('data-view', 'domain');
  const locatedNode = (await node.boundingBox())!;
  const stageBounds = (await page.locator('.layers-stage').boundingBox())!;
  expect(Math.abs(locatedNode.x + locatedNode.width / 2 - stageBounds.x - stageBounds.width / 2)).toBeLessThan(5);
});


test("Layers redraws text at high viewer zoom", async ({ page }) => {
  await page.goto(`/p/${id}?presentation=layers`);
  await expect(page.locator('.layers-stage[data-ready="true"]')).toBeVisible();
  if (await page.locator('main').isVisible()) await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
  const node = page.getByRole('button', { name: 'concept: Order', exact: true });
  const b = (await node.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.wheel(0, -700);
  await expect.poll(async () => Number(await page.locator('.layer-editor').first().getAttribute('data-render-scale'))).toBeGreaterThan(4);
  await page.waitForTimeout(1200); // Allow the compositor to rasterize the higher-resolution planes.
  await page.screenshot({ path: test.info().outputPath('layers-high-zoom.png') });
});
