import { expect, test, type Page } from "@playwright/test";

test.use({ reducedMotion: "reduce", serviceWorkers: "block" });
const cards = (page: Page) => page.locator("[data-reader-card]");
const card = (page: Page, id: string) => page.locator(`[data-reader-card="${id}"]`);
const preview = (page: Page) => page.locator('[data-reader-card][data-reader-mode="preview"]');
const browse = (page: Page, name: string) => page.locator(".sidebar .nav-item").filter({ hasText: new RegExp(`^${name}$`) });
const active = (page: Page) => page.locator("[data-reader-card].active");

test("left click replaces one Preview through context, concept, relationship, search, and breadcrumb", async ({ page }) => {
  await page.goto("/p/dentalml");
  await active(page).locator(".context-card").filter({ hasText: "Tooth selection" }).click();
  await expect(preview(page)).toHaveAttribute("data-reader-card", "item:selection");
  await active(page).locator(".concept-list button").filter({ has: page.getByText("Selected tooth", { exact: true }) }).click();
  await expect(preview(page)).toHaveAttribute("data-reader-card", "item:selected-tooth");
  await active(page).getByRole("link", { name: "Read relationship: selects", exact: true }).click();
  await expect(preview(page)).toHaveAttribute("data-reader-card", "item:selects-input");
  await expect(cards(page)).toHaveCount(1);
  await page.getByRole("textbox", { name: "Search model" }).fill("Reference point");
  await browse(page, "Reference point").click();
  await expect(preview(page)).toHaveAttribute("data-reader-card", "item:reference-point");
  await page.getByRole("navigation", { name: "Reader breadcrumb" }).getByRole("button", { name: "Canal measurement", exact: true }).last().click();
  await expect(preview(page)).toHaveAttribute("data-reader-card", "item:measurement");
  await expect(cards(page)).toHaveCount(1);
});

test("middle and Command clicks dismiss Preview, promote it in place, and reveal existing pins", async ({ page }) => {
  await page.goto("/p/dentalml?item=selected-tooth");
  await browse(page, "Tooth input").click({ button: "middle" });
  await expect(card(page, "item:tooth-input")).toHaveAttribute("data-reader-mode", "pinned");
  await expect(preview(page)).toHaveCount(0);
  await expect(card(page, "item:selected-tooth")).toHaveCount(0);
  await expect(cards(page)).toHaveCount(1);
  await browse(page, "Selected tooth").click();
  await browse(page, "Selected tooth").click({ modifiers: ["Meta"] });
  await expect(preview(page)).toHaveCount(0);
  await expect(cards(page)).toHaveCount(2);
  await browse(page, "Canal index").click();
  await browse(page, "Reference point").click();
  await expect(preview(page)).toHaveAttribute("data-reader-card", "item:reference-point");
  await expect(cards(page)).toHaveCount(3);
  await browse(page, "Selected tooth").click();
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:selected-tooth");
  await expect(preview(page)).toHaveCount(0);
  await expect(card(page, "item:reference-point")).toHaveCount(0);
  await browse(page, "Canal index").click();
  await browse(page, "Reference point").click({ modifiers: ["Meta"] });
  await expect(preview(page)).toHaveCount(0);
  await expect(card(page, "item:canal-index")).toHaveCount(0);
  await expect(cards(page)).toHaveCount(3);
  await browse(page, "Canal index").click();
  await browse(page, "Selected tooth").click({ modifiers: ["Meta"] });
  await expect(preview(page)).toHaveCount(0);
  await expect(card(page, "item:canal-index")).toHaveCount(0);
  await active(page).getByRole("link", { name: "Read relationship: selects", exact: true }).click({ modifiers: ["Meta"] });
  await expect(active(page)).toHaveAttribute("data-reader-mode", "pinned");
  await expect(cards(page)).toHaveCount(4);
  await browse(page, "Canal index").click();
  await browse(page, "Tooth input").click({ button: "middle" });
  await expect(preview(page)).toHaveCount(0);
  await expect(card(page, "item:canal-index")).toHaveCount(0);
  await active(page).getByRole("link", { name: "Read relationship: selects", exact: true }).click();
  await active(page).getByRole("link", { name: "Open Tooth input", exact: true }).click({ button: "middle" });
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:tooth-input");
  await expect(cards(page)).toHaveCount(4);
  expect(page.context().pages()).toHaveLength(1);
});

test("Preview label, history, reload, and closing preserve card modes", async ({ page }) => {
  await page.goto("/p/dentalml?item=selected-tooth");
  await active(page).getByRole("button", { name: "Pin Selected tooth", exact: true }).click();
  await browse(page, "Tooth input").click();
  await browse(page, "Reference point").click();
  await page.goBack();
  await expect(preview(page)).toHaveAttribute("data-reader-card", "item:tooth-input");
  await page.goForward();
  await expect(preview(page)).toHaveAttribute("data-reader-card", "item:reference-point");
  await page.reload();
  await expect(cards(page)).toHaveCount(2);
  await expect(card(page, "item:selected-tooth")).toHaveAttribute("data-reader-mode", "pinned");
  await expect(preview(page)).toHaveAttribute("data-reader-card", "item:reference-point");
  await active(page).getByRole("button", { name: "Close Reference point", exact: true }).click();
  await expect(preview(page)).toHaveCount(0);
  await page.goBack();
  await expect(preview(page)).toHaveAttribute("data-reader-card", "item:reference-point");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(active(page).locator(".reader-preview-badge")).toBeVisible();
  await active(page).getByRole("button", { name: "Pin Reference point", exact: true }).click();
  await expect(preview(page)).toHaveCount(0);
  await expect(active(page).locator(".reader-preview-badge")).toHaveCount(0);
  await expect.poll(() => active(page).locator(":scope > header").evaluate(el => getComputedStyle(el, "::before").borderTopStyle)).toBe("solid");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("pinned-mobile.png") });
});

test("old saved cards stay Pinned and a new Preview never replaces them", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lexicon:reader:v1:dentalml", JSON.stringify({
    cards: [{ kind: "item", id: "selected-tooth" }, { kind: "item", id: "tooth-input" }],
    active: "item:tooth-input", visible: true, scrollTop: 0,
  })));
  await page.goto("/p/dentalml");
  await expect(page.locator('[data-reader-card][data-reader-mode="pinned"]')).toHaveCount(2);
  await browse(page, "Reference point").click();
  await browse(page, "Canal index").click();
  await expect(cards(page)).toHaveCount(3);
  await expect(preview(page)).toHaveAttribute("data-reader-card", "item:canal-index");
  await page.screenshot({ path: test.info().outputPath("preview-and-pinned.png") });
});

test("mapping explanations preview and pin while their source and owner links stay connected", async ({ page }) => {
  await page.goto("/p/dentalml?item=selected-tooth");
  await active(page).locator(".code-links button").first().click();
  await expect(page.locator(".code-scroll")).toBeVisible();
  const source = new URL(page.url()).searchParams.get("code");
  await expect(preview(page)).toHaveAttribute("data-reader-card", "item:selected-tooth");
  await page.locator(".code-mappings summary").click();
  const mapping = page.locator(".code-mapping").filter({ has: page.getByText("Selected tooth", { exact: true }) })
    .getByRole("button", { name: "Read implementation mapping", exact: true });
  await mapping.click();
  await expect(preview(page)).toHaveAttribute("data-reader-card", /^mapping:/);
  await expect(cards(page)).toHaveCount(1);
  await mapping.click({ modifiers: ["Meta"] });
  await expect(preview(page)).toHaveCount(0);
  await expect(cards(page)).toHaveCount(1);
  await page.locator(".code-explanation button").click({ button: "middle" });
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:selected-tooth");
  await expect(active(page)).toHaveAttribute("data-reader-mode", "pinned");
  await browse(page, "Reference point").click();
  await mapping.click();
  await expect(active(page)).toHaveAttribute("data-reader-card", /^mapping:/);
  await expect(preview(page)).toHaveCount(0);
  await expect(card(page, "item:reference-point")).toHaveCount(0);
  await expect(cards(page)).toHaveCount(2);
  expect(new URL(page.url()).searchParams.get("code")).toBe(source);
});

test("canvas clicks preview, modifier taps pin, and middle dragging remains pan", async ({ page }) => {
  await page.goto("/p/dentalml");
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("radio", { name: "Diagram", exact: true }).check();
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const tooth = page.getByRole("button", { name: "concept: Selected tooth", exact: true });
  const input = page.getByRole("button", { name: "concept: Tooth input", exact: true });
  await tooth.click();
  await expect(preview(page)).toHaveAttribute("data-reader-card", "item:selected-tooth");
  await input.click({ button: "middle" });
  await expect(preview(page)).toHaveCount(0);
  await expect(card(page, "item:selected-tooth")).toHaveCount(0);
  await expect(card(page, "item:tooth-input")).toHaveAttribute("data-reader-mode", "pinned");
  await tooth.click();
  await tooth.click({ modifiers: ["Meta"] });
  await expect(preview(page)).toHaveCount(0);
  await expect(cards(page)).toHaveCount(2);
  await input.click({ button: "middle" });
  await expect(card(page, "item:tooth-input")).toHaveAttribute("data-reader-mode", "pinned");
  await expect(cards(page)).toHaveCount(2);
  const camera = await page.locator(".tl-html-layer").getAttribute("style");
  const box = (await tooth.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 50, { steps: 8 });
  await page.mouse.up({ button: "middle" });
  await expect(page.locator(".tl-html-layer")).not.toHaveAttribute("style", camera!);
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:tooth-input");
  await expect(cards(page)).toHaveCount(2);
});
