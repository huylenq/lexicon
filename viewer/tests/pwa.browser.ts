import { expect, test } from "@playwright/test";

test("legacy theme tags follow the app theme instead of the OS theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.route("/", async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace(
      '<meta name="theme-color" content="#fffef9" />',
      '<meta name="theme-color" content="#fffef9" media="(prefers-color-scheme: light)" />' +
      '<meta name="theme-color" content="#f0ead8" media="(prefers-color-scheme: dark)" />',
    );
    await route.fulfill({ response, body: html });
  });
  await page.goto("/");
  const themeColor = page.locator('meta[name="theme-color"]');
  await expect(themeColor).toHaveCount(1);
  await expect(themeColor).not.toHaveAttribute("media");
  await expect(themeColor).toHaveAttribute("content", "#fffef9");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(themeColor).toHaveAttribute("content", "#1e2c27");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await page.getByRole("button", { name: "Use light theme" }).click();
  await expect(themeColor).toHaveAttribute("content", "#fffef9");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
});

test("install metadata, offline deep links, and uncached local API", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
  });
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send("Page.getAppManifest");
  expect(manifest.errors).toEqual([]);
  const data = JSON.parse(manifest.data!);
  expect(data.display_override[0]).toBe("window-controls-overlay");
  for (const icon of data.icons) {
    expect(await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return `${image.naturalWidth}x${image.naturalHeight}`;
    }, icon.src)).toBe(icon.sizes);
  }
  await page.goto("/p/dentalml");
  await expect(page.locator(".project-name")).toHaveText("Canal measurement");
  expect(await page.evaluate(async () => {
    const keys = await caches.keys();
    const requests = (await Promise.all(keys.map(async (key) => (await caches.open(key)).keys()))).flat();
    return requests.some((request) => new URL(request.url).pathname.startsWith("/api/"));
  })).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".reader-header")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("local server is unavailable");
  const api = await page.evaluate(async () => {
    const response = await fetch("/api/projects");
    return { status: response.status, data: await response.json() };
  });
  expect(api.status).toBe(503);
  expect(api.data.error).toContain("local server is unavailable");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find the meaning in your code." })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("local server is unavailable");
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator(".example-card")).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("inline header remains usable across themes and narrow screens", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".library-header")).toHaveCSS("height", "64px");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#1e2c27");
  await page.screenshot({ path: test.info().outputPath("library-dark.png") });
  await page.goto("/p/dentalml");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#1e2c27");
  await page.getByRole("button", { name: "Use light theme" }).click();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#fffef9");
  await page.screenshot({ path: test.info().outputPath("reader-light.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Use dark theme" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("reader-mobile.png") });
});
