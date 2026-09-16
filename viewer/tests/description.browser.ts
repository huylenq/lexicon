import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
test("inline descriptions navigate with icons and wrap on narrow screens", async ({ page }) => {
  await page.route("**/api/projects/shop/model", async route => {
    const response = await route.fetch();
    const model = await response.json();
    model.model.items.find((item: { id: string }) => item.id === "order").description = "A purchase groups [[order-line|purchased lines]] so quantities and prices can be considered together. See [[missing|unavailable policy]].";
    await route.fulfill({ response, json: model });
  });
  await page.goto("/p/shop?item=order");
  const prose = page.locator('[data-reader-card="item:order"] .prose').first();
  const link = prose.getByRole("link", { name: "Open Order Line" });
  await expect(link).toHaveText("purchased lines");
  await expect(link.getByRole("img")).toBeVisible();
  await expect(prose.locator(".description-missing")).toHaveAttribute("title", "Unavailable item: missing");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(link).toBeVisible();
  expect(await prose.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await link.click();
  await expect(page.locator('[data-reader-card="item:order-line"].active')).toBeVisible();
  await page.goBack();
  await expect(prose).toBeVisible();
});

test("Reader card descriptions use the available card width", async ({ page }) => {
  await page.goto("/p/shop?item=order");
  const divider = page.getByRole("separator", { name: "Resize canvas and reader", exact: true });
  await divider.click();
  for (let i = 0; i < 20; i++) await divider.press("ArrowLeft");
  await expect(divider).toHaveAttribute("aria-valuenow", "25");

  const prose = page.locator("[data-reader-card].active article > .prose");
  await expect(prose).toBeVisible();
  const widths = await prose.evaluate(el => {
    const article = el.parentElement!;
    const style = getComputedStyle(article);
    const contentWidth = article.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return { renderedWidth: el.clientWidth, contentWidth };
  });
  expect(widths.renderedWidth).toBeCloseTo(widths.contentWidth, 0);
});

test("Shop example descriptions link domain meaning to implementation and scenarios", async ({ page }) => {
  await page.goto("/p/shop?item=order");
  const active = page.locator("[data-reader-card].active");
  await expect(active.locator(".prose").first()).toContainText("Acceptance here means valid quantities");
  await active.locator(".description-reference").getByText("Order Handling", { exact: true }).click();
  await expect(active).toHaveAttribute("data-reader-card", "item:checkout");
  await expect(active.locator(".prose").first()).toContainText("performs no payment or pricing");
  await active.locator(".description-reference").getByText("invalid-quantity path", { exact: true }).click();
  await expect(active).toHaveAttribute("data-reader-card", "item:reject-order");
  await expect(active.locator(".description-missing")).toHaveCount(0);
});

for (const width of [1600, 390]) test(`inline Reader hover preserves navigation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/p/shop?item=order");
  const origin = page.locator('[data-reader-card="item:order"]');
  const link = origin.locator(".description-reference").getByText("Order Handling", { exact: true });
  const preview = page.getByRole("region", { name: "Inline Reader preview", exact: true });
  const before = await page.evaluate(() => ({ url: location.href, history: history.state }));
  await link.hover();
  await expect(preview).toBeVisible();
  await expect(preview.locator("h1")).toHaveText("Order Handling");
  await preview.hover();
  await page.waitForTimeout(400);
  await expect(preview).toBeVisible();
  expect(await page.evaluate(() => ({ url: location.href, history: history.state }))).toEqual(before);
  await expect(origin).toHaveClass(/active/);
  const bounds = await preview.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1000);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: `../output/inline-reader-preview-${width}.png` });
  await preview.getByRole("button", { name: "Pin Order Handling", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
  await expect(origin.getByRole("link", { name: "Open Order Handling", exact: true })).toBeFocused();
  await page.mouse.move(5, 5);
  await link.hover();
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Pin Order Handling", exact: true }).click();
  await expect(preview).toBeHidden();
  await expect(page.locator('[data-reader-card="item:checkout"].active')).toHaveAttribute("data-reader-mode", "pinned");
});

test("inline previews can follow another inline reference and dismiss one level at a time", async ({ page }) => {
  await page.goto("/p/shop?item=order");
  await page.locator('[data-reader-card="item:order"] .description-reference').getByText("Order Handling", { exact: true }).hover();
  const previews = page.getByRole("region", { name: "Inline Reader preview", exact: true });
  await expect(previews).toHaveCount(1);
  await previews.first().locator(".description-reference").getByText("Order Repository", { exact: true }).hover();
  await expect(previews).toHaveCount(2);
  await expect(previews.last().locator("h1")).toHaveText("Order Repository");
  await page.keyboard.press("Escape");
  await expect(previews).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(previews).toHaveCount(0);
  await expect(page.locator('[data-reader-card="item:order"]')).toHaveClass(/active/);
});


test("inline preview controls do not activate an inactive pinned origin", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => localStorage.setItem("lexicon:reader:v1:shop", JSON.stringify({
    cards: [{ kind: "item", id: "order" }, { kind: "item", id: "order-line" }],
    active: "item:order-line", visible: true, scrollTop: 0,
  })));
  await page.goto("/p/shop?item=order-line");
  const link = page.locator('[data-reader-card="item:order"]').getByRole("link", { name: "Open Order Handling", exact: true });
  const preview = page.getByRole("region", { name: "Inline Reader preview", exact: true });
  await link.hover();
  await expect(preview).toBeVisible();
  const before = await page.evaluate(() => ({ url: location.href, index: history.state.idx }));
  await preview.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(preview.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("item=checkout");
  expect(await page.evaluate(() => ({ url: location.href, index: history.state.idx }))).toEqual(before);
  await expect(page.locator('[data-reader-card="item:order-line"]')).toHaveClass(/active/);
  // Focus capture must also ignore controls in the portaled preview.
  await preview.getByRole("button", { name: "Locate in canvas", exact: true }).focus();
  await expect(preview).toBeVisible();
  expect(await page.evaluate(() => ({ url: location.href, index: history.state.idx }))).toEqual(before);
});

test("Tab enters the inline preview and exits back into the Reader tab order", async ({ page }) => {
  await page.goto("/p/shop?item=order");
  const origin = page.locator('[data-reader-card="item:order"]');
  const link = origin.getByRole("link", { name: "Open Order Handling", exact: true });
  const preview = page.getByRole("region", { name: "Inline Reader preview", exact: true });
  await link.focus();
  await expect(preview).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(preview.getByRole("button", { name: "Read card: Order Handling", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(link).toBeFocused();
  await expect(preview).toBeHidden();
  // Re-enter from the trigger and traverse the card without trapping focus.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  await expect(preview).toBeVisible();
  await page.keyboard.press("Tab");
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    if (!await page.evaluate(() => !!document.activeElement?.closest("[data-reader-hover]"))) break;
  }
  await expect(origin.getByRole("link", { name: "Open Order Repository", exact: true })).toBeFocused();
  // Return to the trigger and use Pin with ordinary keys.
  await page.keyboard.press("Shift+Tab");
  await expect(link).toBeFocused();
  await expect(preview).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(preview.getByRole("button", { name: "Pin Order Handling", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(preview).toBeHidden();
  await expect(page.locator('[data-reader-card="item:checkout"].active')).toHaveAttribute("data-reader-mode", "pinned");
});
