import { expect, test, type Page } from "@playwright/test";

const sourceReader = (page: Page) =>
  page.getByRole("complementary", { name: "Source Reader" });
const browse = (page: Page, name: string) =>
  page.locator(".sidebar .nav-item").filter({ has: page.getByText(name, { exact: true }) }).click();
const toggle = (page: Page) =>
  page.getByRole("button", { name: "Toggle Source Reader", exact: true });

test("Browse and Canvas share one persistent, independently resizable Source Reader", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/p/shop");
  await toggle(page).click();
  await expect(sourceReader(page)).toContainText("Explore the sources");
  await browse(page, "Order");
  await page.locator("main [data-reader-card].active .source-links button").first().click();
  await expect(page.locator(".source-scroll")).toBeVisible();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Order");
  const target = new URL(page.url()).searchParams.get("code");
  expect(target).toMatch(/^code:/);
  const path = (await page.locator(".source-breadcrumb").textContent())!;
  await browse(page, "Shop API");
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Shop API");
  await expect(page.locator(".source-breadcrumb")).toHaveText(path);
  await expect(
    page.getByRole("region", { name: "Model canvas" }),
  ).toBeVisible();
  await expect(sourceReader(page)).toBeVisible();
  expect(new URL(page.url()).searchParams.get("code")).toBe(target);
  // The Source Reader is beside the workspace, never an overlay over the reader.
  const readerBox = (await page.locator("main").boundingBox())!;
  const sourceBox = (await sourceReader(page).boundingBox())!;
  expect(sourceBox.x).toBeGreaterThanOrEqual(readerBox.x + readerBox.width);
  await browse(page, "Order");
  await page.locator("main [data-reader-card].active .source-links button").first().click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Order");
  expect(new URL(page.url()).searchParams.get("code")).toBe(target);
  await expect(page.locator(".source-reader")).toHaveCount(1);
  await expect(page.locator("main .source-reader")).toHaveCount(0);
  await page.getByRole("separator", { name: "Resize Source Reader" }).focus();
  await page.keyboard.press("ArrowLeft");
  expect((await sourceReader(page).boundingBox())!.width).toBeGreaterThan(
    sourceBox.width,
  );
  const resizedWidth = (await sourceReader(page).boundingBox())!.width;
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  expect((await sourceReader(page).boundingBox())!.width).toBe(resizedWidth);
  expect(new URL(page.url()).searchParams.get("code")).toBe(target);
  await page.keyboard.press("Escape");
  await expect(sourceReader(page)).toBeHidden();
  await expect(toggle(page)).toBeFocused();
  expect(new URL(page.url()).searchParams.get("code")).toBe(target);
  await toggle(page).click();
  await expect(page.locator(".source-breadcrumb")).toHaveText(path);
  await page.setViewportSize({ width: 1024, height: 1000 });
  await expect(sourceReader(page)).toHaveCSS("translate", "none");
  const compactReader = (await page.locator("main").boundingBox())!;
  const compactSource = (await sourceReader(page).boundingBox())!;
  expect(compactSource.x).toBeGreaterThanOrEqual(
    compactReader.x + compactReader.width,
  );
  expect(compactSource.x + compactSource.width).toBeLessThanOrEqual(1024);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page
    .getByRole("button", { name: "Show entire file", exact: true })
    .click();
  const scrollTop = await page.locator(".source-scroll").evaluate((el) => {
    el.scrollTop = 200;
    return el.scrollTop;
  });
  await toggle(page).click();
  await toggle(page).click();
  await expect(
    page.getByRole("button", { name: "Focus declaration", exact: true }),
  ).toBeVisible();
  expect(
    await page.locator(".source-scroll").evaluate((el) => el.scrollTop),
  ).toBe(scrollTop);
  await expect(sourceReader(page)).toBeVisible();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Order");
  await page.reload();
  await expect(page.locator(".source-breadcrumb")).toHaveText(path);
  expect(errors).toEqual([]);
});

test("source nodes preserve the reader; mapping edges open explanation and the same Source Reader", async ({
  page,
}) => {
  await page.goto("/p/shop?item=order");
  await page.getByRole("radio", { name: "Domain", exact: true }).check();
  await page.getByRole("radio", { name: "Standard", exact: true }).check();
  await expect(page.getByRole("button", { name: "concept: Order", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await expect(page.getByRole("button", { name: "code: Order", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const codeObject = page.getByRole("button", { name: "code: Order", exact: true });
  await codeObject.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Order");
  await expect(sourceReader(page)).toContainText("Mapped from");
  await expect(page.locator(".source-scroll")).toBeVisible();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const mapping = page.getByRole("button", { name: "Read source link: definition", exact: true });
  await mapping.focus();
  await mapping.press("Enter");
  await expect(page.locator("main")).toContainText("Mapping explanation");
  await expect(sourceReader(page)).toContainText("Order");
  await expect(page.locator("main")).toContainText("Mapping explanation");
  await expect(sourceReader(page)).toBeVisible();
  await page.locator(".source-explanation button").click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Order");
  await expect(sourceReader(page)).toBeVisible();
});

test("Source history changes source independently of domain navigation and survives hide/show", async ({
  page,
}) => {
  await page.goto("/p/shop?item=order");
  await page.locator("main [data-reader-card].active .source-links button").first().click();
  const first = new URL(page.url()).searchParams.get("code");
  await browse(page, "Shop API");
  await page.locator("main [data-reader-card].active .source-links button").first().click();
  const second = new URL(page.url()).searchParams.get("code");
  expect(second).not.toBe(first);
  await page.getByRole("button", { name: "Previous source location" }).click();
  expect(new URL(page.url()).searchParams.get("code")).toBe(first);
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Shop API");
  await toggle(page).click();
  await toggle(page).click();
  await page.getByRole("button", { name: "Next source location" }).click();
  expect(new URL(page.url()).searchParams.get("code")).toBe(second);
  await page.goBack();
  expect(new URL(page.url()).searchParams.get("code")).toBe(first);
  await page.goForward();
  expect(new URL(page.url()).searchParams.get("code")).toBe(second);
});

test("earlier shared links resolve to Source Reader; missing targets stay dismissible", async ({
  page,
}) => {
  await page.goto("/p/shop?item=order&code=order&link=0&canvas=graph");
  await expect(page.locator(".source-scroll")).toBeVisible();
  const target = new URL(page.url()).searchParams.get("code");
  expect(target).toMatch(/^code:/);
  expect(new URL(page.url()).searchParams.has("canvas")).toBe(false);
  await expect(
    page.getByRole("button", { name: "Previous source location" }),
  ).toBeDisabled();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Order");
  await page.goto(
    `/p/shop?selection=${encodeURIComponent(JSON.stringify({ kind: "mapping", id: JSON.stringify(["order", 0]) }))}`,
  );
  await expect(page.locator("main")).toContainText("Mapping explanation");
  await expect(page.locator(".source-scroll")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("code")).toBe(target);
  await page.goto(
    `/p/shop?selection=${encodeURIComponent(JSON.stringify({ kind: "code", id: target }))}`,
  );
  await expect(page.locator(".source-scroll")).toBeVisible();
  await expect(page.locator("main .source-reader")).toHaveCount(0);
  await page.goto("/p/shop?code=code:missing");
  await expect(sourceReader(page)).toContainText("Source target unavailable");
  await page.getByRole("button", { name: "Close Source Reader" }).click();
  await expect(sourceReader(page)).toBeHidden();
});

test("on narrow screens Source Reader has its own full-screen surface and returns to the reader", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/p/shop?item=order");
  await page.locator("main [data-reader-card].active .source-links button").first().click();
  await expect(sourceReader(page)).toBeVisible();
  await expect(page.locator("main")).toBeHidden();
  await expect(sourceReader(page)).toHaveCSS("translate", "none");
  expect((await sourceReader(page).boundingBox())!.width).toBe(390);
  await page
    .getByRole("button", { name: "Back to reader", exact: true })
    .click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Order");
  await expect(sourceReader(page)).toBeHidden();
  await toggle(page).click();
  await expect(sourceReader(page)).toBeVisible();
  await page.getByRole("button", { name: "Close Source Reader" }).click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Order");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
