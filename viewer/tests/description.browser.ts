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
