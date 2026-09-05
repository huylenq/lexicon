import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("Browse selection keeps text stable and extends its background to the sidebar edge", async ({
  page,
}) => {
  await page.goto("/p/dentalml");
  const item = page.getByRole("button", {
    name: "Concept · entity Selected tooth",
    exact: true,
  });
  const label = item.locator(".object-name-text");
  const before = await label.evaluate((element) => ({
    fontWeight: getComputedStyle(element).fontWeight,
    width: element.getBoundingClientRect().width,
  }));

  await item.click();

  const after = await label.evaluate((element) => ({
    fontWeight: getComputedStyle(element).fontWeight,
    width: element.getBoundingClientRect().width,
  }));
  expect(after).toEqual(before);
  const itemRight = await item.evaluate(
    (element) => element.getBoundingClientRect().right,
  );
  const sidebarRight = await page
    .getByRole("complementary", { name: "Model navigation" })
    .evaluate((element) => element.getBoundingClientRect().right);
  expect(Math.abs(sidebarRight - itemRight)).toBeLessThanOrEqual(1);
});

test("reader history branches correctly and pane close buttons preserve navigation", async ({ page }) => {
  await page.goto("/p/dentalml");
  const back = page.getByRole("button", { name: "Go back", exact: true });
  const forward = page.getByRole("button", { name: "Go forward", exact: true });
  const browse = page.getByRole("button", { name: "Toggle navigation", exact: true });
  const graph = page.getByRole("region", { name: "Domain graph" });
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

  await browse.click();
  await expect(browse).toBeFocused();
  await expect(browse).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("complementary", { name: "Model navigation" })).toBeHidden();
  await page.keyboard.press("/");
  await expect(page.getByRole("textbox", { name: "Search model" })).toBeFocused();
  await expect(browse).toHaveAttribute("aria-pressed", "true");

  await expect(page.locator(".graph-vertex.concept")).toHaveCount(8);
  await expect(page.getByText("Arranging the graph…")).toBeHidden();
  await page.getByRole("button", { name: "Collapse context Tooth selection" }).click();
  await page.reload();
  await expect(graph).toBeVisible();
  await expect(page.locator("main h1")).toHaveText("Canal measurement");
  await expect(page.getByRole("button", { name: "Expand context Tooth selection" })).toBeVisible();

  await page.getByRole("button", { name: "Toggle code workspace" }).click();
  await page.getByRole("button", { name: "Close code pane", exact: true }).click();
  await expect(page.getByRole("button", { name: "Toggle code workspace" })).toBeFocused();
  await expect(graph).toBeVisible();
  await expect(browse).toHaveAttribute("aria-pressed", "true");
});

test("compact reader returns to the permanent graph without a toggle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/p/dentalml");
  const browse = page.getByRole("button", { name: "Toggle navigation", exact: true });
  const graph = page.getByRole("region", { name: "Domain graph" });
  await expect(graph).toBeVisible();
  await expect(page.getByRole("button", { name: "Graph", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close Graph pane" })).toHaveCount(0);
  await browse.click();
  await page.getByRole("button", { name: "Concept · entity Selected tooth", exact: true }).click();
  await expect(browse).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("main h1")).toHaveText("Selected tooth");
  await page.getByRole("button", { name: "Back to graph", exact: true }).click();
  await expect(graph).toBeVisible();
  await page.getByRole("button", { name: "concept: Selected tooth", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("Selected tooth");
  await page.getByRole("button", { name: "Back to graph", exact: true }).click();
  await expect(graph).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Graph stays present despite an older saved hidden state and its heading bars align", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lexicon:graph:v1:dentalml", JSON.stringify({ open: false })));
  await page.goto("/p/dentalml");
  await expect(page.getByRole("region", { name: "Domain graph" })).toBeVisible();
  await expect(page.locator(".graph-vertex.concept")).toHaveCount(8);
  await expect(page.getByRole("button", { name: "Graph", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close Graph pane" })).toHaveCount(0);
  const titleLeft = await page.locator(".graph-toolbar .pane-title").evaluate(el => el.getBoundingClientRect().left);
  const selectionLeft = await page.locator(".graph-selection-bar > span").evaluate(el => el.getBoundingClientRect().left);
  expect(titleLeft).toBe(16);
  expect(selectionLeft).toBe(titleLeft);
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  expect(await page.locator(".graph-toolbar .pane-title").evaluate(el => el.getBoundingClientRect().left)).toBe(titleLeft);
});

test("bottom-left canvas controls stay clear of Browse on short and narrow screens", async ({ page }) => {
  await page.goto("/p/dentalml");
  await expect(page.locator(".graph-vertex.concept")).toHaveCount(8);
  for (const size of [{ width: 1600, height: 1000 }, { width: 1600, height: 420 }, { width: 390, height: 480 }]) {
    await page.setViewportSize(size);
    const shelf = page.locator("#browse-pane");
    if (!await shelf.isVisible()) await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
    await expect.poll(async () => {
      const shelfBox = (await shelf.boundingBox())!;
      const controls = (await page.locator(".graph-view-controls").boundingBox())!;
      return controls.y - shelfBox.y - shelfBox.height;
    }).toBeGreaterThanOrEqual(12);
    const controls = (await page.locator(".graph-view-controls").boundingBox())!;
    const canvas = (await page.locator(".graph-canvas").boundingBox())!;
    expect(controls.x - canvas.x).toBe(12);
    const zoom = () => page.locator(".react-flow__viewport").evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
    const before = await zoom();
    await page.getByRole("button", { name: "Zoom In", exact: true }).click();
    await expect.poll(zoom).toBeGreaterThan(before);
    await page.getByRole("button", { name: "Fit view", exact: true }).click();
  }
});

test("Browse search preserves shelf height and input position as results change", async ({ page }) => {
  await page.goto("/p/dentalml");
  await expect(page.locator(".graph-vertex.concept")).toHaveCount(8);
  for (const size of [{ width: 1600, height: 1000 }, { width: 390, height: 480 }]) {
    await page.setViewportSize(size);
    const shelf = page.locator("#browse-pane");
    if (!await shelf.isVisible()) await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
    const search = page.getByRole("textbox", { name: "Search model" });
    const beforeShelf = await shelf.boundingBox();
    const beforeInput = await search.boundingBox();
    for (const query of ["selected", "no-such-concept", "a", " ", "tooth"]) {
      await search.fill(query);
      expect(await shelf.boundingBox()).toEqual(beforeShelf);
      expect(await search.boundingBox()).toEqual(beforeInput);
      await expect(search).toBeFocused();
    }
    await shelf.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(search).toHaveValue("");
    expect(await shelf.boundingBox()).toEqual(beforeShelf);
  }
});
