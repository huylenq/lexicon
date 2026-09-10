import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseModel, serializeModel } from "../server/model";

let root: string, id: string, xml: string;
test.beforeEach(async ({ request }) => {
  root = await mkdtemp(join(tmpdir(), "lexicon-model-browser-"));
  await cp(resolve(import.meta.dirname, "../examples/shop"), root, { recursive: true });
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
