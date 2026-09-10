import { expect, test } from "@playwright/test";

test.use({ reducedMotion: "reduce", serviceWorkers: "block" });

for (const pane of [
  { label: "Resize canvas and reader", container: ".reader-workspace", edge: "left", min: 25, max: 75, step: 2 },
  { label: "Resize code workspace", container: ".pane-area", edge: "right", min: 25, max: 60, step: 2 },
  { label: "Resize Agent and reader", container: ".reader", edge: "right", min: 280, max: 720, step: 16 },
] as const) {
  test(`${pane.label} preserves pointer limits and keyboard direction`, async ({ page }) => {
    await page.goto("/p/shop?item=order");
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    if (pane.label === "Resize code workspace") {
      await page.locator("[data-reader-card].active .code-links button").first().click();
    } else if (pane.label === "Resize Agent and reader") {
      await page.getByRole("button", { name: "Agent", exact: true }).click();
      await page.getByRole("button", { name: "Attach Agent to right side", exact: true }).click();
    }
    const divider = page.getByRole("separator", { name: pane.label, exact: true });
    const drag = async (grow: boolean) => {
      const box = (await divider.boundingBox())!;
      const area = (await page.locator(pane.container).boundingBox())!;
      const right = grow === (pane.edge === "left");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(right ? area.x + area.width - 1 : area.x + 1, box.y + box.height / 2, { steps: 4 });
      await page.mouse.up();
    };
    const growKey = pane.edge === "left" ? "ArrowRight" : "ArrowLeft";
    const shrinkKey = pane.edge === "left" ? "ArrowLeft" : "ArrowRight";
    await drag(true);
    await expect(divider).toHaveAttribute("aria-valuenow", String(pane.max));
    await divider.press(shrinkKey);
    await expect(divider).toHaveAttribute("aria-valuenow", String(pane.max - pane.step));
    await drag(false);
    await expect(divider).toHaveAttribute("aria-valuenow", String(pane.min));
    await divider.press(growKey);
    await expect(divider).toHaveAttribute("aria-valuenow", String(pane.min + pane.step));
  });
}
