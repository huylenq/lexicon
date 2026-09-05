import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("reader history branches correctly and pane close buttons preserve navigation", async ({ page }) => {
  await page.goto("/p/dentalml");
  const back = page.getByRole("button", { name: "Go back", exact: true });
  const forward = page.getByRole("button", { name: "Go forward", exact: true });
  const browse = page.getByRole("button", { name: "Toggle navigation", exact: true });
  const graph = page.getByRole("button", { name: "Graph", exact: true });
  await expect(back).toBeDisabled();
  await expect(forward).toBeDisabled();
  await page.getByRole("button", { name: "Concept · entity Selected tooth", exact: true }).click();
  await page.getByRole("button", { name: "Concept · value Tooth input", exact: true }).click();
  await back.click();
  await expect(page.locator("main h1")).toHaveText("Selected tooth");
  await forward.click();
  await expect(page.locator("main h1")).toHaveText("Tooth input");
  await back.click();
  await page.getByRole("button", { name: "Concept · aggregate Canal measurement", exact: true }).click();
  await expect(forward).toBeDisabled();

  await page.getByRole("button", { name: "Close Browse pane" }).click();
  await expect(browse).toBeFocused();
  await expect(browse).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("complementary", { name: "Model navigation" })).toBeHidden();
  await page.keyboard.press("/");
  await expect(page.getByRole("textbox", { name: "Search model" })).toBeFocused();
  await expect(browse).toHaveAttribute("aria-pressed", "true");

  await graph.click();
  await expect(page.locator(".graph-vertex.concept")).toHaveCount(8);
  await expect(page.getByText("Arranging the graph…")).toBeHidden();
  await page.getByRole("button", { name: "Collapse context Tooth selection" }).click();
  await page.getByRole("button", { name: "Close Graph pane" }).click();
  await expect(graph).toBeFocused();
  await expect(graph).toHaveAttribute("title", "Show Graph");
  await expect(page.locator("main h1")).toHaveText("Canal measurement");
  await graph.click();
  await expect(page.getByRole("button", { name: "Expand context Tooth selection" })).toBeVisible();

  await page.getByRole("button", { name: "Toggle code workspace" }).click();
  await page.getByRole("button", { name: "Close code pane", exact: true }).click();
  await expect(page.getByRole("button", { name: "Toggle code workspace" })).toBeFocused();
  await expect(graph).toHaveAttribute("aria-pressed", "true");
  await expect(browse).toHaveAttribute("aria-pressed", "true");
});

test("compact pane controls describe the visible surface and switch back to Graph", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/p/dentalml");
  const browse = page.getByRole("button", { name: "Toggle navigation", exact: true });
  const graph = page.getByRole("button", { name: "Graph", exact: true });
  await expect(browse).toHaveAttribute("title", "Show Browse");
  await browse.click();
  await expect(browse).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Concept · entity Selected tooth", exact: true }).click();
  await expect(browse).toHaveAttribute("aria-pressed", "false");
  await graph.click();
  await page.getByRole("button", { name: "concept: Selected tooth", exact: true }).click();
  await expect(graph).toHaveAttribute("title", "Show Graph");
  await graph.click();
  await expect(page.getByRole("region", { name: "Domain graph" })).toBeVisible();
  await expect(graph).toHaveAttribute("title", "Hide Graph");
  await page.getByRole("button", { name: "Close Graph pane" }).click();
  await expect(page.locator("main h1")).toHaveText("Selected tooth");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
