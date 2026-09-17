import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let root: string, id: string, xml: string;
test.beforeEach(async ({ request }) => {
  root = await mkdtemp(join(tmpdir(), "lexicon-flow-code-"));
  await cp(resolve(import.meta.dirname, "../../examples/shop"), root, { recursive: true });
  await rm(join(root, "lexicon/canvas.json"), { force: true });
  await rm(join(root, "lexicon/.canvas.previous.json"), { force: true });
  xml = await readFile(join(root, "lexicon/model.xml"), "utf8");
  const response = await request.post("/api/projects", { data: { root } });
  expect(response.ok()).toBe(true);
  id = (await response.json()).id;
});
test.afterEach(async ({ request, page }) => {
  await page.goto("about:blank");
  await request.delete(`/api/projects/${id}`);
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
});

test("flow code expands internal calls under Architecture and opens exact source without replacing the Flow", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/p/${id}?item=reject-order`);
  const active = page.locator("main [data-reader-card].active");
  const sequence = page.getByRole("region", { name: "Sequence diagram: Reject Invalid Quantities" });
  await expect(sequence.locator(".flow-participant")).toHaveCount(3);
  await expect(sequence.locator('[data-step-id="validate"] svg > path')).toHaveAttribute("d", / V 26 H /);
  const toggle = page.getByRole("checkbox", { name: "Show code" });
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toBeChecked();
  await expect(toggle).toBeFocused();
  const handling = sequence.locator('[data-participant="checkout"]');
  await expect(handling.getByRole("button", { name: "Open code: Checkout.place", exact: true })).toBeVisible();
  await expect(handling.getByRole("button", { name: "Open code: Order.constructor", exact: true })).toBeVisible();
  await expect(sequence.locator(".flow-lifelines > span")).toHaveCount(4);
  await expect(sequence.locator('[data-step-id="validate"] svg > path')).not.toHaveAttribute("d", / V 26 H /);
  await expect(sequence.locator('[data-participant="customer"]')).toContainText("User role");
  await expect(sequence.locator('[data-step-id="submit"]')).toContainText("HTTP POST /orders");
  await sequence.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await page.screenshot({ path: "../output/flow-code-internal.png" });
  await handling.getByRole("button", { name: "Open code: Order.constructor", exact: true }).click();
  await expect(page.locator(".source-scroll")).toContainText("constructor(readonly id: string");
  await expect(active.locator("h1")).toHaveText("Reject Invalid Quantities");
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(toggle).toBeChecked();
  await sequence.getByRole("button", { name: "Open call site for step 3: src/checkout.ts:6", exact: true }).click();
  await expect(page.locator(".source-scroll")).toContainText("new Order(crypto.randomUUID(), lines)");
  await expect(page).toHaveURL(/line%22%2C6/);
  await expect(active.locator("h1")).toHaveText("Reject Invalid Quantities");
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
  expect(errors).toEqual([]);
});

test("flow code supports search, domain navigation, history, dark theme, and a narrow screen", async ({ page }) => {
  await page.goto(`/p/${id}?item=ordering`);
  const active = page.locator("main [data-reader-card].active");
  await expect(active.locator("h1")).toHaveText("Ordering");
  await expect(page.getByRole("complementary", { name: "Flow sequence", exact: true })).toHaveCount(0);
  await page.locator(".sidebar .nav-item").filter({ hasText: /^Order$/ }).click();
  await expect(active.locator("h1")).toHaveText("Order");
  await page.getByPlaceholder("Find...").fill("Order.constructor");
  await page.locator(".sidebar .nav-item").filter({ hasText: /^Reject Invalid Quantities$/ }).click();
  await page.getByPlaceholder("Find...").fill("");
  await page.getByRole("checkbox", { name: "Show code" }).check();
  const sequence = page.getByRole("region", { name: "Sequence diagram: Reject Invalid Quantities" });
  await sequence.getByRole("link", { name: "Open participant: Order Handling", exact: true }).click();
  await expect(active.locator("h1")).toHaveText("Order Handling");
  await expect(sequence).toBeVisible();
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(active.locator("h1")).toHaveText("Reject Invalid Quantities");
  await page.getByRole("checkbox", { name: "Show code" }).check();
  await page.locator(".sidebar .nav-item").filter({ hasText: /^Order$/ }).click();
  await expect(sequence).toBeHidden();
  await expect(page.locator('.sequence-pane[hidden]')).toHaveCount(1);
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(sequence).toBeVisible();
  await page.getByRole("checkbox", { name: "Show code" }).check();
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await page.screenshot({ path: "../output/flow-code-dark.png" });
  await page.setViewportSize({ width: 430, height: 900 });
  await expect(sequence).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(430);
  expect(await sequence.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await sequence.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  const constructor = sequence.getByRole("button", { name: "Open code: Order.constructor", exact: true });
  await expect(constructor).toBeInViewport();
  await page.waitForTimeout(250);
  await page.screenshot({ path: "../output/flow-code-mobile.png" });
  await constructor.click();
  await expect(page.locator(".source-scroll")).toContainText("constructor(readonly id: string");
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("flow code keeps unresolved references and missing implementation readable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await writeFile(join(root, "lexicon/model.xml"), xml.replace('callee="constructor"', 'callee="gone"'));
  await page.goto(`/p/${id}?item=reject-order`);
  const active = page.locator("main [data-reader-card].active");
  await page.getByRole("checkbox", { name: "Show code" }).check();
  await expect(page.locator('.sequence-pane').locator('[data-step-id="validate"]')).toContainText("Unavailable code reference: callee");
  await expect(page.locator('.sequence-pane').locator('[data-participant="checkout"]')).toContainText("Code not specified");
  await writeFile(join(root, "lexicon/model.xml"), xml);
  await rm(join(root, "src/order.ts"));
  await page.reload();
  await page.getByRole("checkbox", { name: "Show code" }).check();
  await page.getByRole("button", { name: "Open code: Order.constructor", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Source Reader", exact: true })).toContainText(/unavailable|not found|ENOENT|could not|missing/i);
  await expect(active.locator("h1")).toHaveText("Reject Invalid Quantities");
  expect(errors).toEqual([]);
});

test("sequence overlays the canvas with Browse glass, compact messages, and double-click Locate across views", async ({ page }) => {
  await page.goto(`/p/${id}?item=reject-order`);
  const pane = page.getByRole("complementary", { name: "Flow sequence", exact: true });
  const participant = pane.getByRole("link", { name: "Open participant: Order Handling", exact: true });
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(pane).toHaveClass(/canvas-overlay/);
  expect(await pane.evaluate(el => {
    const sequence = getComputedStyle(el);
    const browse = getComputedStyle(document.getElementById('browse-pane')!);
    return sequence.transition === browse.transition && sequence.transitionDuration.includes('0.22s');
  })).toBe(true);
  const surface = await pane.evaluate(el => {
    const canvas = document.querySelector('.canvas-slot')!.getBoundingClientRect();
    const overlay = el.getBoundingClientRect();
    const browse = getComputedStyle(document.getElementById('browse-pane')!);
    const style = getComputedStyle(el);
    return { overlaps: overlay.top < canvas.bottom && overlay.bottom <= canvas.bottom,
      material: style.backgroundColor === browse.backgroundColor && style.backdropFilter === browse.backdropFilter,
      position: getComputedStyle(el.parentElement!).position };
  });
  expect(surface).toEqual({ overlaps: true, material: true, position: "absolute" });
  const divider = page.getByRole("separator", { name: "Resize sequence" });
  await divider.focus();
  await page.keyboard.press("ArrowUp");
  await expect(divider).toHaveAttribute("aria-valuenow", "50");
  const geometry = await pane.locator('[data-step-id="submit"]').evaluate(el => {
    const label = el.querySelector('.flow-message')!;
    const arrow = el.querySelector('.flow-arrow')!;
    return { gap: arrow.getBoundingClientRect().top - label.getBoundingClientRect().bottom,
      height: label.getBoundingClientRect().height, line: parseFloat(getComputedStyle(label).lineHeight) };
  });
  expect(geometry.gap).toBeLessThanOrEqual(2);
  expect(geometry.height).toBeLessThanOrEqual(geometry.line + 8);
  await page.getByRole("radio", { name: "Domain", exact: true }).check();
  await participant.click();
  await expect(page.getByRole("radio", { name: "Domain", exact: true })).toBeChecked();
  await participant.dblclick();
  await expect(page.getByRole("radio", { name: "Architecture", exact: true })).toBeChecked();
  await expect(page.locator('[data-model-id="item:checkout"]')).toBeInViewport();
  await pane.getByRole("link", { name: /Step 2:/ }).dblclick();
  await expect(page.locator("main [data-reader-card].active h1")).toContainText("Order Handling");
  await expect(page.getByRole("radio", { name: "Architecture", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await participant.dblclick();
  await expect(page.getByRole("radio", { name: "Combined", exact: true })).toBeChecked();
  await pane.getByRole("checkbox", { name: "Show code" }).check();
  const target = pane.getByRole("button", { name: "Open code: Checkout.place", exact: true });
  await target.dblclick();
  await expect(page.getByRole("radio", { name: "Combined", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Planes", exact: true }).click();
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  await participant.dblclick();
  await expect(page.getByRole("radio", { name: "Planes", exact: true })).toBeChecked();
  await target.dblclick();
  await expect(page.getByRole("radio", { name: "Planes", exact: true })).toBeChecked();
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
});

test("participant names fit on one line and remain visible during vertical scrolling", async ({ page }) => {
  const steps = Array.from({ length: 18 }, (_, i) => `<step id="sticky-${i}" relationship="handles-order">Continue processing ${i}</step>`).join("\n");
  await writeFile(join(root, "lexicon/model.xml"), xml.replaceAll("Order Handling", "Forge Agentic Platform").replaceAll("Customer", "Platform Architect").replaceAll("</flow>", `${steps}</flow>`));
  await page.goto(`/p/${id}?item=reject-order`);
  const sequence = page.getByRole("region", { name: "Sequence diagram: Reject Invalid Quantities" });
  const heading = sequence.getByRole("link", { name: "Open participant: Forge Agentic Platform", exact: true });
  const text = heading.locator(".object-name-text");
  expect(await text.evaluate(el => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) + 1)).toBe(true);
  for (const code of [false, true]) {
    await page.getByRole("checkbox", { name: "Show code" }).setChecked(code);
    await sequence.evaluate(el => { el.scrollTop = 240; });
    await expect.poll(() => sequence.evaluate(el => Math.abs(el.querySelector('.flow-participants')!.getBoundingClientRect().top - el.getBoundingClientRect().top))).toBeLessThanOrEqual(1);
    await expect(heading).toBeInViewport();
    await page.screenshot({ path: `../output/flow-sticky-${code ? "code" : "architecture"}.png` });
  }
});

for (const view of ["Architecture", "Combined", "Planes", "Atlas · Ink"]) test(`selected Flow highlights only its participants and edges in ${view}`, async ({ page }) => {
  await page.goto(`/p/${id}?item=reject-order`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  if (view === "Atlas · Ink") {
    await page.getByRole("radio", { name: "Architecture", exact: true }).check();
    await page.getByRole("radio", { name: view, exact: true }).check();
  } else await page.getByRole("radio", { name: view, exact: true }).click();
  await expect(page.locator(view === "Planes" ? '.planes-stage[data-ready="true"]' : '.canvas-stage[data-ready="true"]')).toBeVisible();
  for (const actor of ["customer", "api", "checkout"]) {
    await expect(page.locator(`.canvas-object[data-model-id="item:${actor}"]`)).toHaveAttribute("data-flow-highlight", "true");
  }
  await expect(page.locator('.canvas-object[data-model-id="item:repository"]')).not.toHaveAttribute("data-flow-highlight", "true");
  await expect(page.locator('.canvas-connection[data-flow-highlight="true"]')).toHaveCount(3);
  if (view === "Atlas · Ink") await expect(page.locator('[data-map-road][data-flow-highlight="true"]')).toHaveCount(3);
  const sequence = page.getByRole("region", { name: "Sequence diagram: Reject Invalid Quantities" });
  const participant = sequence.getByRole("link", { name: "Open participant: Order Handling", exact: true });
  const node = page.locator('.canvas-object[data-model-id="item:checkout"]');
  await participant.hover();
  await expect(node).toHaveAttribute("data-hovered", "true");
  await expect(page.locator('.canvas-object[data-hovered="true"]')).toHaveCount(1);
  const message = sequence.getByRole("link", { name: /Step 2:/ });
  await message.hover();
  await expect(node).not.toHaveAttribute("data-hovered", "true");
  await expect(page.locator('.canvas-connection[data-hovered="true"]')).toHaveCount(1);
  if (view === "Atlas · Ink") await expect(page.locator('[data-map-road][data-hovered="true"]')).toHaveCount(1);
  await page.screenshot({ path: `../output/flow-hover-${view.replaceAll(/[^a-zA-Z]/g, "").toLowerCase()}.png` });
  await page.locator('.sequence-pane .workspace-pane-heading').hover();
  await expect(page.locator('.canvas-connection[data-hovered="true"]')).toHaveCount(0);
  await expect(page.locator('.canvas-connection[data-flow-highlight="true"]')).toHaveCount(3);
  await participant.focus();
  await expect(node).toHaveAttribute("data-hovered", "true");
  await participant.blur();
  await expect(node).not.toHaveAttribute("data-hovered", "true");
  await page.screenshot({ path: `../output/flow-highlight-${view.replaceAll(/[^a-zA-Z]/g, "").toLowerCase()}.png` });
  await page.getByRole("region", { name: "Sequence diagram: Reject Invalid Quantities" }).getByRole("link", { name: "Open participant: Order Handling", exact: true }).click();
  await expect(page.locator('[data-flow-highlight="true"]')).toHaveCount(0);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("sequence fits diagram width and caps it to the workspace", async ({ page }) => {
  await page.goto(`/p/${id}?item=reject-order`);
  const pane = page.locator('.sequence-pane');
  await expect(pane).toBeVisible();
  const width = () => pane.evaluate(el => el.getBoundingClientRect().width);
  const architectureWidth = await width();
  expect(architectureWidth).toBeLessThan(1000);
  await pane.getByRole('checkbox', { name: 'Show code' }).check();
  expect(await width()).toBeGreaterThan(architectureWidth);
  await page.setViewportSize({ width: 430, height: 900 });
  await expect.poll(width).toBeLessThan(430);
  expect(await pane.locator('.flow-scroll').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
});

test("closed Browse stays hidden on mobile with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto(`/p/${id}?item=reject-order`);
  await expect(page.locator('#browse-pane')).toBeHidden();
  await page.locator('[aria-controls="browse-pane"]').click();
  await expect(page.locator('#browse-pane')).toBeVisible();
  await page.locator('[aria-controls="browse-pane"]').click();
  await expect(page.locator('#browse-pane')).toBeHidden();
});

test("unrelated navigation clears the previous sequence inspection", async ({ page }) => {
  await page.goto(`/p/${id}?item=reject-order`);
  await page.getByRole('link', { name: 'Open participant: Order Handling', exact: true }).click();
  await expect(page.locator('.sequence-pane')).toBeVisible();
  await page.locator('.sidebar .nav-item').filter({ hasText: /^Order$/ }).click();
  await expect(page.locator('.sequence-pane')).toBeHidden();
  await page.locator('.sidebar .nav-item').filter({ hasText: /^Order Handling$/ }).click();
  await expect(page.locator('main [data-reader-card].active h1')).toHaveText('Order Handling');
  await expect(page.locator('.sequence-pane')).toBeHidden();
});

test("sequence centers beside Reader and uses the full space when Reader is hidden", async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 1000 });
  await page.goto(`/p/${id}?item=reject-order`);
  const pane = page.locator('.sequence-pane');
  await expect(pane).toBeVisible();
  const centerError = () => pane.evaluate(el => {
    const parent = el.parentElement!;
    const bounds = parent.getBoundingClientRect();
    const style = getComputedStyle(parent);
    const reader = document.querySelector('.reader-stack')!.getBoundingClientRect();
    const left = bounds.left + parseFloat(style.paddingLeft);
    const right = bounds.right - parseFloat(style.paddingRight) - (parent.closest('.reader-hidden') ? 0 : reader.width);
    const box = el.getBoundingClientRect();
    return Math.abs((box.left + box.right) / 2 - (left + right) / 2);
  });
  await expect.poll(centerError).toBeLessThan(2);
  await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
  await expect.poll(centerError).toBeLessThan(2);
  await page.screenshot({ path: '../output/flow-centered.png' });
});

test("sequence header drags horizontally and remains bounded after resizing", async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 1000 });
  await page.goto(`/p/${id}?item=reject-order`);
  const pane = page.locator('.sequence-pane');
  await expect(pane).toBeVisible();
  const header = pane.locator('.workspace-pane-heading');
  const initial = (await pane.boundingBox())!;
  const box = (await header.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 280, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  expect((await pane.boundingBox())!.x - initial.x).toBeCloseTo(200, 0);
  await pane.getByRole('checkbox', { name: 'Show code' }).check();
  await expect(pane.getByRole('checkbox', { name: 'Show code' })).toBeChecked();
  await page.setViewportSize({ width: 430, height: 900 });
  await expect.poll(async () => { const rect = (await pane.boundingBox())!; return rect.x >= 0 && rect.x + rect.width <= 430; }).toBe(true);
});
