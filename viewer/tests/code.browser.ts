import { expect, test, type Page } from "@playwright/test";

const codePane = (page: Page) =>
  page.getByRole("complementary", { name: "Code workspace" });
const browse = (page: Page, name: string) =>
  page.locator(".sidebar .nav-item").filter({ hasText: name }).click();
const toggle = (page: Page) =>
  page.getByRole("button", { name: "Toggle code workspace", exact: true });

test("Browse and Canvas share one persistent, independently resizable Code workspace", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/p/dentalml");
  await toggle(page).click();
  await expect(codePane(page)).toContainText("Explore the implementation");
  await browse(page, "Selected tooth");
  await page.locator("main [data-reader-card].active .code-links button").first().click();
  await expect(page.locator(".code-scroll")).toBeVisible();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Selected tooth");
  const target = new URL(page.url()).searchParams.get("code");
  expect(target).toMatch(/^code:/);
  const path = (await page.locator(".code-breadcrumb").textContent())!;
  await browse(page, "Reference point");
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Reference point");
  await expect(page.locator(".code-breadcrumb")).toHaveText(path);
  await expect(
    page.getByRole("region", { name: "Model canvas" }),
  ).toBeVisible();
  await expect(codePane(page)).toBeVisible();
  expect(new URL(page.url()).searchParams.get("code")).toBe(target);
  // The Code pane is beside the workspace, never an overlay over the reader.
  const readerBox = (await page.locator("main").boundingBox())!;
  const codeBox = (await codePane(page).boundingBox())!;
  expect(codeBox.x).toBeGreaterThanOrEqual(readerBox.x + readerBox.width);
  await browse(page, "Selected tooth");
  await page.locator("main [data-reader-card].active .code-links button").first().click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Selected tooth");
  expect(new URL(page.url()).searchParams.get("code")).toBe(target);
  await expect(page.locator(".code-pane")).toHaveCount(1);
  await expect(page.locator("main .code-pane")).toHaveCount(0);
  await page.getByRole("separator", { name: "Resize code workspace" }).focus();
  await page.keyboard.press("ArrowLeft");
  expect((await codePane(page).boundingBox())!.width).toBeGreaterThan(
    codeBox.width,
  );
  const resizedWidth = (await codePane(page).boundingBox())!.width;
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  expect((await codePane(page).boundingBox())!.width).toBe(resizedWidth);
  expect(new URL(page.url()).searchParams.get("code")).toBe(target);
  await page.keyboard.press("Escape");
  await expect(codePane(page)).toBeHidden();
  await expect(toggle(page)).toBeFocused();
  expect(new URL(page.url()).searchParams.get("code")).toBe(target);
  await toggle(page).click();
  await expect(page.locator(".code-breadcrumb")).toHaveText(path);
  await page.setViewportSize({ width: 1024, height: 1000 });
  const compactReader = (await page.locator("main").boundingBox())!;
  const compactCode = (await codePane(page).boundingBox())!;
  expect(compactCode.x).toBeGreaterThanOrEqual(
    compactReader.x + compactReader.width,
  );
  expect(compactCode.x + compactCode.width).toBeLessThanOrEqual(1024);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page
    .getByRole("button", { name: "Show entire file", exact: true })
    .click();
  await page.locator(".code-scroll").evaluate((el) => {
    el.scrollTop = 200;
  });
  await toggle(page).click();
  await toggle(page).click();
  await expect(
    page.getByRole("button", { name: "Focus declaration", exact: true }),
  ).toBeVisible();
  expect(
    await page.locator(".code-scroll").evaluate((el) => el.scrollTop),
  ).toBe(200);
  await expect(codePane(page)).toBeVisible();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Selected tooth");
  await page.reload();
  await expect(page.locator(".code-breadcrumb")).toHaveText(path);
  expect(errors).toEqual([]);
});

test("code nodes preserve the reader; mapping edges open explanation and the same Code pane", async ({
  page,
}) => {
  await page.goto("/p/dentalml?item=selected-tooth");
  await expect(page.locator(".canvas-card[data-model-id^='item:']")).toHaveCount(8);
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.getByRole("button", { name: "concept: Selected tooth", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Expand code", exact: true }).click();
  await expect(page.locator(".canvas-card[data-model-id^='code:']")).toHaveCount(1);
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.locator(".canvas-card[data-model-id^='code:'] .canvas-object-title").click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Selected tooth");
  await expect(codePane(page)).toContainText("Mapped from");
  await expect(page.locator(".code-scroll")).toBeVisible();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page
    .getByRole("button", { name: "Read code mapping: implementation", exact: true })
    .click();
  await expect(page.locator("main")).toContainText("Mapping explanation");
  await expect(codePane(page)).toContainText("Selected tooth");
  await expect(page.locator("main")).toContainText("Mapping explanation");
  await expect(codePane(page)).toBeVisible();
  await page.locator(".code-explanation button").click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Selected tooth");
  await expect(codePane(page)).toBeVisible();
});

test("Code history changes source independently of domain navigation and survives hide/show", async ({
  page,
}) => {
  await page.goto("/p/dentalml?item=selected-tooth");
  await page.locator("main [data-reader-card].active .code-links button").first().click();
  const first = new URL(page.url()).searchParams.get("code");
  await browse(page, "Reference point");
  await page.locator("main [data-reader-card].active .code-links button").first().click();
  const second = new URL(page.url()).searchParams.get("code");
  expect(second).not.toBe(first);
  await page.getByRole("button", { name: "Previous code location" }).click();
  expect(new URL(page.url()).searchParams.get("code")).toBe(first);
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Reference point");
  await toggle(page).click();
  await toggle(page).click();
  await page.getByRole("button", { name: "Next code location" }).click();
  expect(new URL(page.url()).searchParams.get("code")).toBe(second);
  await page.goBack();
  expect(new URL(page.url()).searchParams.get("code")).toBe(first);
  await page.goForward();
  expect(new URL(page.url()).searchParams.get("code")).toBe(second);
});

test("earlier shared links resolve to Code; missing targets stay dismissible", async ({
  page,
}) => {
  await page.goto("/p/dentalml?item=selected-tooth&code=selected-tooth&link=0&canvas=graph");
  await expect(page.locator(".code-scroll")).toBeVisible();
  const target = new URL(page.url()).searchParams.get("code");
  expect(target).toMatch(/^code:/);
  expect(new URL(page.url()).searchParams.has("canvas")).toBe(false);
  await expect(
    page.getByRole("button", { name: "Previous code location" }),
  ).toBeDisabled();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Selected tooth");
  await page.goto(
    `/p/dentalml?selection=${encodeURIComponent(JSON.stringify({ kind: "mapping", id: JSON.stringify(["selected-tooth", 0]) }))}`,
  );
  await expect(page.locator("main")).toContainText("Mapping explanation");
  await expect(page.locator(".code-scroll")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("code")).toBe(target);
  await page.goto(
    `/p/dentalml?selection=${encodeURIComponent(JSON.stringify({ kind: "code", id: target }))}`,
  );
  await expect(page.locator(".code-scroll")).toBeVisible();
  await expect(page.locator("main .code-pane")).toHaveCount(0);
  await page.goto("/p/dentalml?code=code:missing");
  await expect(codePane(page)).toContainText("Code target unavailable");
  await page.getByRole("button", { name: "Close code pane" }).click();
  await expect(codePane(page)).toBeHidden();
});

test("on narrow screens Code has its own full-screen surface and returns to the reader", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/p/dentalml?item=selected-tooth");
  await page.locator("main [data-reader-card].active .code-links button").first().click();
  await expect(codePane(page)).toBeVisible();
  await expect(page.locator("main")).toBeHidden();
  expect((await codePane(page).boundingBox())!.width).toBe(390);
  await page
    .getByRole("button", { name: "Back to reader", exact: true })
    .click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Selected tooth");
  await expect(codePane(page)).toBeHidden();
  await toggle(page).click();
  await expect(codePane(page)).toBeVisible();
  await page.getByRole("button", { name: "Close code pane" }).click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Selected tooth");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
