import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let root: string, id: string, xml: string;
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ request, page }, testInfo) => {
  if (!testInfo.title.includes("default-off")) await page.addInitScript(() => localStorage.setItem("lexicon.dev.files", "true"));
  root = await mkdtemp(join(tmpdir(), "lexicon-source-browser-"));
  await cp(resolve(import.meta.dirname, "../../examples/shop"), root, { recursive: true });
  await rm(join(root, "lexicon/canvas.json"), { force: true });
  await rm(join(root, "lexicon/.canvas.previous.json"), { force: true });
  await writeFile(join(root, "unlinked.md"), "# Repository document\nThis file has no source mapping.");
  xml = await readFile(join(root, "lexicon/model.xml"), "utf8");
  const response = await request.post("/api/projects", { data: { root } });
  expect(response.ok()).toBe(true); id = (await response.json()).id;

});
test.afterEach(async ({ request }) => {
  await request.delete(`/api/projects/${id}`);
  await rm(root, { recursive: true, force: true });
});

test("Linked Sources uses links only and keeps Files browsing and annotations outside Planes", async ({ page, request }) => {
  xml = xml.replace("</concept>", '<code-link kind="document" file="unlinked.md" heading="repository-document" role="specification">Repository rules.</code-link></concept>');
  await writeFile(join(root, "lexicon/model.xml"), xml);
  let scans = 0;
  page.on("request", request => { if (request.url().includes(`/api/projects/${id}/files`)) scans++; });
  await page.goto(`/p/${id}?item=order`);
  await page.getByRole("radio", { name: "Linked Sources", exact: true }).check();
  await expect(page.getByRole("radiogroup", { name: "Source view", exact: true })).toHaveCount(0);
  const drawing = page.locator('.canvas-stage');
  await expect(drawing.locator('[data-source-kind="code"]').first()).toBeVisible();
  await expect(page.getByRole("tree", { name: "File Map" })).toHaveCount(0);
  expect(scans).toBe(0);
  await drawing.getByRole("button", { name: "code: repository-document", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Repository document", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close Source Reader", exact: true }).click();
  await drawing.getByRole("button", { name: "code: repository-document", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Repository document", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close Source Reader", exact: true }).click();
  await page.getByRole("textbox", { name: "Search source links" }).fill("OrderLine");
  await page.getByRole("button", { name: "src/order.ts · ◇ OrderLine", exact: true }).click();
  await expect(page.getByLabel("Source code", { exact: true })).toContainText("interface OrderLine");
  const targetUrl = page.url();
  await page.getByRole("button", { name: "Close Source Reader", exact: true }).click();
  await page.getByRole("textbox", { name: "Search source links" }).fill("");
  let delayedSave = false, delayNextSave = true;
  await page.route(`**/api/projects/${id}/canvas`, async route => {
    if (route.request().method() === "PUT" && delayNextSave) {
      delayNextSave = false; delayedSave = true;
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    await route.continue();
  });
  await page.getByRole("button", { name: /^Rectangle —/ }).click();
  const box = (await drawing.boundingBox())!;
  await page.mouse.move(box.x + 310, box.y + 165); await page.mouse.down();
  await page.mouse.move(box.x + 405, box.y + 215); await page.mouse.up(); await page.keyboard.press("Escape");
  await expect(drawing.locator('.tl-shape[data-shape-type="geo"]')).toHaveCount(1);
  const shapesOn = async (parent: string) => {
    const state = await (await request.get(`/api/projects/${id}/canvas`)).json();
    return Object.values(state.document?.snapshot.store || {}).filter((r: any) => r.type === "geo" && r.parentId === parent);
  };
  // Switch while autosave is in flight, rather than losing the outgoing edit.
  await expect.poll(() => delayedSave).toBe(true);
  await page.getByRole("button", { name: "Browse Files", exact: true }).click();
  await expect(page.getByRole("tree", { name: "File Map" })).toBeVisible();
  expect(scans).toBeGreaterThan(0);
  await expect(page.locator('.source-canvas-body .tl-shape')).toHaveCount(0);
  await expect.poll(async () => (await shapesOn("page:layers-source-links")).length).toBe(1);
  await page.getByRole("button", { name: "Back to canvas", exact: true }).click();
  await expect(drawing.locator('.tl-shape[data-shape-type="geo"]')).toHaveCount(1);
  await page.getByRole("radio", { name: "Planes", exact: true }).click();
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Source view", exact: true })).toHaveCount(0);
  await expect(page.locator('[data-plane="source"] [data-source-kind="code"]').first()).toBeVisible();
  await expect(page.locator('[data-plane="source"] .tl-shape[data-shape-type="geo"]')).toHaveCount(1);
  await expect(page.locator('[data-source-bridge="src/order.ts"]').first()).toBeAttached();
  await page.getByRole("button", { name: "Browse Files", exact: true }).click();
  await expect(page.getByRole("tree", { name: "File Map" })).toBeVisible();
  await expect(page.locator('[data-plane]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("tree", { name: "File Map" })).toBeVisible();
  await page.getByRole("button", { name: "Back to canvas", exact: true }).click();
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator('[data-plane="source"] canvas[data-drawn-nodes]')).toHaveCount(0);
  await page.getByRole("button", { name: "Linked Sources ↗", exact: true }).click();
  await expect(drawing.locator('.tl-shape[data-shape-type="geo"]')).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get("code")).toBe(new URL(targetUrl).searchParams.get("code"));
  await expect(page.locator(".canvas-save-indicator")).toContainText("Saved to project");
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(page.getByRole("button", { name: "Toggle reader", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await expect(page.getByRole("button", { name: "Browse Files", exact: true })).toBeVisible();
  await expect(page.locator('.source-reader')).toBeHidden();
  await expect(page.locator('.reading-pane')).toBeHidden();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.screenshot({ path: "../output/source-preview/source-plane-mobile.png" });
  await page.getByRole("button", { name: "Browse Files", exact: true }).click();
  await expect(page.getByRole("tree", { name: "File Map" }).locator("canvas")).toHaveAttribute("data-drawn-nodes", /[1-9]/);
  await page.screenshot({ path: "../output/source-preview/files-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("Files browsing opens unlinked documents without adding them to Linked Sources", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/p/${id}`);
  await page.getByRole("button", { name: "Browse Files", exact: true }).click();
  const map = page.getByRole("tree", { name: "File Map" });
  await expect(map.locator("canvas")).toHaveAttribute("data-drawn-nodes", /[1-9]/);
  await expect(map.locator("canvas")).toHaveAttribute("data-drawn-icons", /[1-9]/);
  await expect(map.locator("img")).toHaveCount(0); // Icons are painted into the bitmap.
  await expect(page.locator('.source-canvas-body .tl-shape')).toHaveCount(0);
  // Browse through the accessible cursor, without creating a DOM node per file.
  await map.focus(); await page.keyboard.press("Home"); await page.keyboard.press("ArrowRight");
  await expect(map.getByRole("treeitem")).not.toHaveText("Files root");
  await page.getByRole("textbox", { name: "Search files" }).fill("unlinked");
  await expect(page.getByRole("button", { name: "unlinked.md", exact: true }).locator("img")).toBeVisible();
  await expect(map.locator("canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "unlinked.md", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Repository document", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reveal in Files", exact: true }).click();
  await expect(page.getByRole("tree", { name: "File Map" })).toBeVisible();
  await page.getByRole("button", { name: "Close Source Reader", exact: true }).click();
  await page.getByRole("button", { name: "Back to canvas", exact: true }).click();
  await expect(page).not.toHaveURL(/files=1/);
  await page.goBack();
  await expect(page.getByRole("tree", { name: "File Map" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("button", { name: "Browse Files", exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Planes", exact: true }).click();
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator('[data-plane="source"]')).toBeVisible();
  await expect(page.locator('[data-plane="domain"]')).toBeVisible();
  await expect(page.locator('[data-plane="architecture"]')).toBeVisible();
  await expect(page.locator('[data-plane="source"] canvas[data-drawn-nodes]')).toHaveCount(0);
  await expect(page.locator('[data-plane="source"] [data-model-id="file:unlinked.md"]')).toHaveCount(0);
  await expect(page.locator('[data-plane="source"] [data-source-kind="code"]').first()).toBeVisible();
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Linked Sources ↗", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Linked Sources", exact: true })).toBeChecked();
  await expect(page).not.toHaveURL(/presentation=planes/);
  await expect(page.getByRole("radio", { name: "Linked Sources", exact: true })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Linked Sources", exact: true })).toBeChecked();
  await expect(page.locator('.canvas-stage [data-model-id="file:unlinked.md"]')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("inventory errors can be retried and Files browsing fits a narrow workspace", async ({ page }) => {
  let fail = true;
  await page.route(`**/api/projects/${id}/files*`, route => fail
    ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Repository temporarily unavailable" }) }) : route.continue());
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto(`/p/${id}`);
  await page.getByRole("button", { name: "Browse Files", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Repository temporarily unavailable" })).toBeVisible();
  fail = false; await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("tree", { name: "File Map" }).locator("canvas")).toHaveAttribute("data-drawn-nodes", /[1-9]/);
  await expect(page.getByRole("alert").filter({ hasText: "Repository temporarily unavailable" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("File Map stays independent of tldraw and leaves saved canvas data untouched", async ({ page, request }) => {
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Browse Files", exact: true }).click();
  await expect(page.getByRole("tree", { name: "File Map" }).locator("canvas")).toHaveAttribute("data-drawn-nodes", /[1-9]/);
  const before = await (await request.get(`/api/projects/${id}/canvas`)).json();
  await expect(page.getByRole("application", { name: "tldraw", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Rectangle —/ })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search files" }).fill("unlinked.md");
  await page.getByRole("button", { name: "unlinked.md", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("tree", { name: "File Map" })).toBeVisible();
  const after = await (await request.get(`/api/projects/${id}/canvas`)).json();
  expect(after.document).toEqual(before.document);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("20,000 files use one bounded bitmap and no per-file editor shapes", async ({ page }, testInfo) => {
  const files = Array.from({ length: 20_000 }, (_, i) => `packages/p${i % 100}/src/file${i}.ts`);
  const metrics = Object.fromEntries(files.map((file, i) => [file, { loc: 10 + i % 500, status: "counted" }]));
  await page.route(`**/api/projects/${id}/files`, route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ files, metrics, scope: "git", truncated: false }) }));
  await page.goto(`/p/${id}`);
  const start = Date.now();
  await page.getByRole("button", { name: "Browse Files", exact: true }).click();
  const bitmap = page.getByRole("tree", { name: "File Map" }).locator("canvas");
  await expect(bitmap).toHaveAttribute("data-drawn-nodes", /[1-9]/);
  const overviewMs = Date.now() - start;
  const stats = await bitmap.evaluate((canvas: HTMLCanvasElement) => ({ drawn: Number(canvas.dataset.drawnNodes), width: canvas.width, height: canvas.height }));
  console.log("File Map overview benchmark:", JSON.stringify({ files: files.length, overviewMs, ...stats }));
  expect(stats.drawn).toBeLessThan(1000);
  expect(Math.max(stats.width, stats.height)).toBeLessThanOrEqual(2800);
  await expect(page.locator('.source-canvas-body .tl-shape')).toHaveCount(0);
  await page.getByRole("button", { name: "Back to canvas", exact: true }).click();
  await page.getByRole("radio", { name: "Planes", exact: true }).click();
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator('[data-plane="source"] [data-source-kind="code"]').first()).toBeVisible();
  await expect(page.locator('[data-plane="source"] canvas[data-drawn-nodes]')).toHaveCount(0);
  await testInfo.attach("source-overview-metrics", { body: JSON.stringify({ files: files.length, overviewMs, ...stats }), contentType: "application/json" });
});

test("thin file labels rotate and zoom restores labels hidden at overview scale", async ({ page }) => {
  const files = ["a-long-filename-that-needs-a-vertical-label.ts", "medium.ts", "large.ts"];
  await page.route(`**/api/projects/${id}/files`, route => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    files, metrics: Object.fromEntries(files.map((file, i) => [file, { loc: [4, 20, 100][i], status: "counted" }])), scope: "git", truncated: false,
  }) }));
  await page.goto(`/p/${id}`);
  await page.getByRole("button", { name: "Browse Files", exact: true }).click();
  if (await page.locator("#browse-pane").isVisible()) await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  if (await page.locator("#main-content").isVisible()) await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await page.getByRole("button", { name: "Fit File Map", exact: true }).click();
  const bitmap = page.getByRole("tree", { name: "File Map" }).locator("canvas");
  await expect(bitmap).toHaveAttribute("data-rotated-labels", /[1-9]/);
  const originalLabels = Number(await bitmap.getAttribute("data-file-labels"));
  const mapBounds = (await bitmap.boundingBox())!;
  await page.mouse.move(mapBounds.x + mapBounds.width / 2, mapBounds.y + mapBounds.height / 2);
  await page.mouse.wheel(0, 900);
  await expect.poll(async () => Number(await bitmap.getAttribute("data-file-labels"))).toBeLessThan(originalLabels);
  const overviewLabels = Number(await bitmap.getAttribute("data-file-labels"));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fit File Map", exact: true }).click();
  await expect(bitmap).toHaveAttribute("data-rotated-labels", /[1-9]/);
  await expect.poll(async () => Number(await bitmap.getAttribute("data-file-labels"))).toBeGreaterThan(overviewLabels);
});

test("Linked Sources retains symbol and document identities across presentations", async ({ page }) => {
  await writeFile(join(root, "policy.md"), "# Policy\n\n## Validation rules\nOrders need lines.\n\n## Lifecycle\nOrders are accepted or refused.\n");
  const linked = xml.replace('</concept>', '<code-link kind="document" id="rules" file="policy.md" heading="validation-rules" role="specification">Validation policy.</code-link><code-link kind="document" id="lifecycle" file="policy.md" heading="lifecycle" role="rationale">Order lifecycle.</code-link></concept>');
  await writeFile(join(root, "lexicon/model.xml"), linked);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/p/${id}?item=order`);
  await page.getByRole("radio", { name: "Standard", exact: true }).check();
  await expect(page.getByRole("button", { name: "Toggle source links", exact: true })).toHaveCount(0);
  await expect(page.locator('.canvas-card[data-model-id^="code:"]')).toHaveCount(0);
  await page.getByRole("radio", { name: "Linked Sources", exact: true }).check();
  const targets = page.locator('.canvas-card[data-model-id^="code:"]');
  await expect(targets.filter({ hasText: "validation-rules" }).locator('.source-target-glyph')).toHaveText("§");
  await expect(page.locator('[data-model-id="file:policy.md"] .source-label img')).toHaveCount(1);
  await page.getByRole("radio", { name: "Planes", exact: true }).click();
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator('[data-plane="domain"] .canvas-card[data-model-id^="code:"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show source links", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Linked Sources ↗", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Linked Sources", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Browse Files", exact: true }).click();
  await page.getByRole("textbox", { name: "Search files" }).fill("OrderLine");
  await page.getByRole("button", { name: "src/order.ts · ◇ OrderLine", exact: true }).click();
  const code = 'code:["src/order.ts","symbol","OrderLine"]';
  await expect.poll(() => new URL(page.url()).searchParams.get("code")).toBe(code);
  await expect(page.getByRole("button", { name: "Open source target: OrderLine", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Open source target: Order", exact: true }).click();
  await expect(page.getByLabel("Source code", { exact: true })).toContainText("export class Order");
  await page.getByRole("button", { name: "Previous source location", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open source target: OrderLine", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("textbox", { name: "Search files" }).fill("validation-rules");
  await page.getByRole("button", { name: "policy.md · § validation-rules", exact: true }).click();
  await expect(page.getByLabel("Document heading", { exact: true })).toHaveValue("validation-rules");
  await page.getByRole("button", { name: "Open document target: lifecycle", exact: true }).click();
  await expect(page.getByLabel("Document heading", { exact: true })).toHaveValue("lifecycle");
  await page.getByRole("button", { name: "Back to canvas", exact: true }).click();
  await page.getByRole("radio", { name: "Planes", exact: true }).click();
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator('[data-plane="source"] .canvas-card[data-selected="true"]')).toContainText("lifecycle");
  await expect(page.locator('.source-bridges [data-source-target]').filter({ has: page.locator('button') })).not.toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-plane="source"] .canvas-card[data-selected="true"]')).toContainText("lifecycle");
  await page.getByRole("button", { name: "Domain ↗", exact: true }).click();
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await expect(page.locator('.canvas-card[data-model-id^="code:"][data-selected="true"]')).toContainText("lifecycle");
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const flatTarget = page.getByRole("button", { name: "code: validation-rules", exact: true });
  await flatTarget.focus(); await page.keyboard.press("Enter");
  await expect(page.getByLabel("Document heading", { exact: true })).toHaveValue("validation-rules");
  await page.getByRole("button", { name: "Locate in Linked Sources", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Linked Sources", exact: true })).toBeChecked();
  await expect(page.locator('.canvas-stage .canvas-card[data-selected="true"]')).toContainText("validation-rules");
  expect(errors).toEqual([]);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(linked);
});

test("tiny file targets stay accessible at narrow widths without changing LOC areas", async ({ page }) => {
  const files = ["src/order.ts", "large.ts"];
  await page.route(`**/api/projects/${id}/files`, route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ files, metrics: {
    "src/order.ts": { loc: 1, status: "counted" }, "large.ts": { loc: 100000, status: "counted" },
  }, scope: "git", truncated: false }) }));
  await page.setViewportSize({ width: 430, height: 850 });
  await page.goto(`/p/${id}`);
  await page.getByRole("button", { name: "Browse Files", exact: true }).click();
  await page.getByRole("textbox", { name: "Search files" }).fill("OrderLine");
  await page.getByRole("button", { name: "src/order.ts · ◇ OrderLine", exact: true }).click();
  // Close the source reader on mobile to expose the canvas again.
  await page.getByRole("button", { name: "Close Source Reader", exact: true }).click();
  await page.getByRole("button", { name: "Fit File Map", exact: true }).click();
  const card = page.locator('.source-detail-card');
  await expect(card).toHaveAttribute("data-floating", "true");
  await expect(card.getByRole("button", { name: "Open source target: OrderLine", exact: true })).toBeVisible();
  const box = (await card.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(430);
  await card.getByRole("button", { name: "Open source target: Order", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Source code", { exact: true })).toContainText("export class Order");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("gitignore filters physical tiles and search while authored evidence remains readable", async ({ page, request }) => {
  await writeFile(join(root, ".gitignore"), "src/order.ts\nunlinked.md\nlexicon/canvas.json\nlexicon/.canvas.*\n");
  const inventory = await (await request.get(`/api/projects/${id}/files?refresh=1`)).json();
  expect(inventory.files).not.toContain("src/order.ts");
  expect(inventory.metrics["src/order.ts"]).toBeUndefined();
  await page.goto(`/p/${id}?item=order`);
  await page.locator('main [data-reader-card].active .source-links button').filter({ hasText: 'src/order.ts' }).click();
  await expect(page.getByLabel("Source code", { exact: true })).toContainText("export class Order");
  await page.getByRole("button", { name: "Browse Files", exact: true }).click();
  await expect(page.locator('.source-status')).toContainText("Selected source is outside the file filters");
  await expect(page.locator('[data-source-detail="src/order.ts"]')).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search files" }).fill("OrderLine");
  await expect(page.locator('.source-search-results')).toHaveText("No matching files or linked targets.");
  await page.getByRole("button", { name: "Back to canvas", exact: true }).click();
  await page.getByRole("radio", { name: "Planes", exact: true }).click();
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator('[data-source-bridge="src/order.ts"]').first()).toBeAttached();
  await expect(page.locator('[data-plane="source"] [data-model-id="file:src/order.ts"]')).toBeVisible();
  // Refresh after an ignore edit restores inventory, metrics, and target search together.
  await writeFile(join(root, ".gitignore"), "unlinked.md\nlexicon/canvas.json\nlexicon/.canvas.*\n");
  await page.getByRole("button", { name: "Browse Files", exact: true }).click();
  await page.getByRole("button", { name: "Refresh files", exact: true }).click();
  await page.getByRole("textbox", { name: "Search files" }).fill("OrderLine");
  await page.getByRole("button", { name: "src/order.ts · ◇ OrderLine", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open source target: OrderLine", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("nested directory labels stay above child tiles across zoom levels", async ({ page }) => {
  await page.addInitScript(() => {
    const prototype = CanvasRenderingContext2D.prototype as any;
    const clear = prototype.clearRect, rounded = prototype.roundRect, text = prototype.fillText;
    prototype.clearRect = function (...args: any[]) { (this.canvas as any).__sourcePaint = []; return clear.apply(this, args); };
    const rect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
      const m = ctx.getTransform(); return { x: x * m.a + m.e, y: y * m.d + m.f, w: w * m.a, h: h * m.d };
    };
    prototype.roundRect = function (x: number, y: number, w: number, h: number, ...rest: any[]) {
      ((this.canvas as any).__sourcePaint ||= []).push({ kind: "tile", ...rect(this, x, y, w, h) });
      return rounded.call(this, x, y, w, h, ...rest);
    };
    prototype.fillText = function (label: string, x: number, y: number, ...rest: any[]) {
      if (/^[▾▸] /.test(label)) {
        const m = this.measureText(label);
        ((this.canvas as any).__sourcePaint ||= []).push({ kind: "label", label,
          ...rect(this, x - m.actualBoundingBoxLeft, y - m.actualBoundingBoxAscent,
            m.actualBoundingBoxLeft + m.actualBoundingBoxRight, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) });
      }
      return text.call(this, label, x, y, ...rest);
    };
  });
  const files = ["am_ET", "ar", "ar_SA", "az", "bg", "bn", "ca", "cs", "da", "de", "el", "en"].flatMap(locale =>
    [`locale/${locale}/LC_MESSAGES/django.po`, `locale/${locale}/LC_MESSAGES/django.mo`]);
  await page.route(`**/api/projects/${id}/files`, route => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    files, metrics: Object.fromEntries(files.map(file => [file, { loc: 100, status: "counted" }])), scope: "git", truncated: false,
  }) }));
  await page.goto(`/p/${id}`);
  await page.getByRole("button", { name: "Browse Files", exact: true }).click();
  const bitmap = page.getByRole("tree", { name: "File Map" }).locator("canvas");
  await expect(bitmap).toHaveAttribute("data-drawn-nodes", /[1-9]/);
  const mapBounds = (await bitmap.boundingBox())!;
  await page.mouse.move(mapBounds.x + mapBounds.width / 2, mapBounds.y + mapBounds.height / 2);
  const verify = async () => {
    const collisions = await bitmap.evaluate(canvas => {
      const paints = (canvas as any).__sourcePaint as { kind: string; label?: string; x: number; y: number; w: number; h: number }[];
      return paints.flatMap((label, i) => {
        if (label.kind !== "label") return [];
        const frame = paints.slice(0, i).reverse().find(entry => entry.kind === "tile")!;
        const outside = label.x < frame.x || label.y < frame.y || label.x + label.w > frame.x + frame.w || label.y + label.h > frame.y + frame.h;
        const covered = paints.slice(i + 1).some(tile => tile.kind === "tile" && label.x < tile.x + tile.w && label.x + label.w > tile.x && label.y < tile.y + tile.h && label.y + label.h > tile.y);
        return outside || covered ? [label.label] : [];
      });
    });
    expect(collisions).toEqual([]);
  };
  await expect.poll(async () => bitmap.evaluate(canvas => ((canvas as any).__sourcePaint || []).filter((entry: any) => entry.kind === "label").length)).toBeGreaterThan(0);
  for (let i = 0; i < 3; i++) {
    await verify();
    if (i < 2) { await page.mouse.wheel(0, 120); await expect.poll(async () => Number(await bitmap.getAttribute("data-drawn-nodes"))).toBeGreaterThan(0); }
  }
  await page.getByRole("button", { name: "Fit File Map", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await verify();
  await page.screenshot({ path: resolve(import.meta.dirname, "../../output/source-preview/folder-labels-fixed.png") });
  await page.getByRole("button", { name: "Fit File Map", exact: true }).click();
  await verify();
});


test("Linked Sources retains stale links and ignores the former Tiles preference", async ({ page }) => {
  xml = xml.replace('</concept>', '<code-link kind="code" file="src/order.ts" symbol="RemovedOrder" role="implementation">Earlier implementation.</code-link></concept>');
  await writeFile(join(root, "lexicon/model.xml"), xml);
  await page.addInitScript(id => localStorage.setItem(`lexicon:graph:v1:${id}`, JSON.stringify({ source: true, sourceMode: "tiles" })), id);
  let scans = 0;
  page.on("request", request => { if (request.url().includes(`/api/projects/${id}/files`)) scans++; });
  await page.goto(`/p/${id}`);
  await expect(page.getByRole("radio", { name: "Linked Sources", exact: true })).toBeChecked();
  const stale = page.getByRole("button", { name: "code: RemovedOrder", exact: true });
  await stale.click();
  await expect(page.getByText("The linked symbol was not found. Showing the file for review.", { exact: true })).toBeVisible();
  await expect(stale).toBeVisible();
  await page.getByRole("radio", { name: "Planes", exact: true }).click();
  await expect(page.locator('[data-plane="source"] [data-model-id]').filter({ hasText: "RemovedOrder" }).first()).toBeVisible();
  await expect(page.getByRole("tree", { name: "File Map" })).toHaveCount(0);
  expect(scans).toBe(0);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});


test("File Map includes embedded repositories while honoring project and default filters", async ({ page, request }) => {
  const child = join(root, "services/api");
  await mkdir(join(child, "src"), { recursive: true });
  await mkdir(join(child, ".cache"));
  execFileSync("git", ["init", "-q"], { cwd: child });
  for (const file of ["src/main.ts", "src/ignored.ts", ".cache/generated.ts", "deps.lock"])
    await writeFile(join(child, file), "export const nestedRepository = true;\n");
  await writeFile(join(child, ".gitignore"), "src/ignored.ts\n");
  const inventory = await (await request.get(`/api/projects/${id}/files`)).json();
  expect(inventory.files).toContain("services/api/src/main.ts");
  for (const file of ["services/api/src/ignored.ts", "services/api/.cache/generated.ts", "services/api/deps.lock"])
    expect(inventory.files).not.toContain(file);
  await page.goto(`/p/${id}`);
  await page.getByRole("button", { name: "Browse Files", exact: true }).click();
  const search = page.getByRole("textbox", { name: "Search files" });
  await search.fill("services/api/src");
  await expect(page.getByRole("button", { name: "services/api/src/", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "services/api/src/main.ts", exact: true }).click();
  await expect(page.getByLabel("Source code", { exact: true })).toContainText("nestedRepository");
  await page.getByRole("button", { name: "Close Source Reader", exact: true }).click();
  await page.getByRole("button", { name: "Project settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Project settings" });
  await settings.getByLabel("Include globs").fill("services/**/*.ts");
  await settings.getByLabel("Exclude globs").fill("**/*.lock\n**/.*/**\n**/main.ts");
  const refreshed = page.waitForResponse(r => r.url().includes(`/projects/${id}/files?refresh=1`));
  await settings.getByRole("button", { name: "Save settings" }).click();
  expect((await (await refreshed).json()).files).toEqual([]);
  await expect(page.getByText("No files match the project filters.", { exact: true })).toBeVisible();
  await search.fill("main.ts");
  await expect(page.locator('.source-search-results')).toHaveText("No matching files or linked targets.");
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});


test("Reader mapping links locate their target and source file cards can be focused", async ({ page }) => {
  await page.goto(`/p/${id}?item=order`);
  await page.locator("main [data-reader-card].active .source-links button").first().click();
  expect(new URL(page.url()).searchParams.get("codeMapping")).toBeTruthy();
  await page.getByRole("button", { name: "Locate in Linked Sources", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Linked Sources", exact: true })).toBeChecked();
  await expect(page.locator('.canvas-card[data-selected="true"]')).toContainText("Order");
  await page.getByRole("button", { name: "Close Source Reader", exact: true }).click();
  for (const name of ["Toggle reader", "Toggle navigation"]) {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.getAttribute("aria-pressed") === "true") await button.click();
  }
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.getByRole("button", { name: "file: order.ts", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Focus", exact: true }).click();
  await expect(page.getByRole("button", { name: "code: Order", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "code: OrderLine", exact: true })).toBeVisible();
});

test("coherent source names preserve legacy file links and distinguish both locate actions", async ({ page, request }) => {
  xml = xml.replace("</concept>", '<code-link kind="document" file="unlinked.md" heading="repository-document" role="specification">Repository rules.</code-link></concept>');
  await writeFile(join(root, "lexicon/model.xml"), xml);
  const canonical = await (await request.get(`/api/projects/${id}/files`)).json();
  const legacy = await (await request.get(`/api/projects/${id}/repository`)).json();
  expect(legacy.files).toEqual(canonical.files);
  const oldContent = await request.get(`/api/projects/${id}/repository/file?file=unlinked.md`);
  expect(oldContent.ok()).toBe(true);
  expect((await oldContent.json()).text).toContain("Repository document");
  await page.goto(`/p/${id}?repository=1`);
  await expect(page.getByRole("tree", { name: "File Map" })).toBeVisible();
  await page.getByRole("textbox", { name: "Search files" }).fill("OrderLine");
  await page.getByRole("button", { name: "src/order.ts · ◇ OrderLine", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Source Reader", exact: true })).toBeVisible();
  const target = new URL(page.url()).searchParams.get("code");
  await page.getByRole("button", { name: "Locate in Linked Sources", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Linked Sources", exact: true })).toBeChecked();
  await expect(page.getByRole("tree", { name: "File Map" })).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal in Files", exact: true }).click();
  await expect(page.getByRole("tree", { name: "File Map" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("files")).toBe("1");
  expect(new URL(page.url()).searchParams.has("repository")).toBe(false);
  expect(new URL(page.url()).searchParams.get("code")).toBe(target);
  // Returning to a saved plane must locate the new target, not its old selection.
  await page.getByRole("textbox", { name: "Search files" }).fill("repository-document");
  await page.getByRole("button", { name: "unlinked.md · § repository-document", exact: true }).click();
  const documentTarget = new URL(page.url()).searchParams.get("code");
  await page.getByRole("button", { name: "Locate in Linked Sources", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Linked Sources", exact: true })).toBeChecked();
  await expect(page.locator(".source-reader .source-breadcrumb h2")).toHaveText("repository-document");
  await expect(page.locator(".source-reader .source-breadcrumb h2").getByRole("img", { name: "Document", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("code")).toBe(documentTarget);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("mouse wheel zooms consistently in Domain, Linked Sources, and File Map", async ({ page }) => {
  await page.goto(`/p/${id}?item=order`);
  await page.getByRole("radio", { name: "Domain", exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  const checkWheel = async () => {
    const plane = page.locator('.canvas-pane .tl-html-layer');
    const map = page.getByRole('tree', { name: 'File Map' });
    const zoom = async () => await map.count() ? Number(await map.getAttribute('data-zoom')) : plane.evaluate(element => {
      const match = (element as HTMLElement).style.transform.match(/scale\(([^)]+)\)/);
      if (!match) throw new Error('Canvas transform has no scale');
      return Number(match[1]);
    });
    const area = (await (await map.count() ? map : page.getByRole('application', { name: 'tldraw', exact: true })).boundingBox())!;
    await page.mouse.move(area.x + area.width * .6, area.y + area.height * .4);
    const before = await zoom();
    await page.mouse.wheel(0, -100);
    await expect.poll(zoom).toBeGreaterThan(before);
    const zoomed = await zoom();
    await page.mouse.wheel(0, 100);
    await expect.poll(zoom).toBeLessThan(zoomed);
  };
  await checkWheel();
  await page.getByRole("radio", { name: "Linked Sources", exact: true }).check();
  await expect(page.locator('.canvas-stage [data-source-kind="code"]').first()).toBeVisible();
  await checkWheel();
  await page.getByRole("button", { name: "Browse Files", exact: true }).click();
  await expect(page.getByRole("tree", { name: "File Map" }).locator('canvas')).toHaveAttribute('data-drawn-nodes', /[1-9]/);
  await checkWheel();
});

test("Combined includes canonical Linked Sources with drawing ownership and shared controls", async ({ page, request }) => {
  await page.goto(`/p/${id}`);
  await page.getByRole("radio", { name: "Linked Sources", exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  const store = async (): Promise<Record<string, any>> => (await (await request.get(`/api/projects/${id}/canvas`)).json()).document?.snapshot.store || {};
  const placements = (records: Record<string, any>) => Object.values(records)
    .filter(r => r.type === "lexicon-object" && r.meta.lexiconProjection === "layers-source")
    .map(r => [r.id, r.parentId, r.x, r.y, r.props.w, r.props.h]).sort();
  await expect.poll(async () => placements(await store()).length).toBeGreaterThan(0);
  const original = placements(await store());
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const input = page.locator('.tl-container [contenteditable="true"]');
  await input.fill("Linked Sources annotation"); await input.press("Escape");
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await expect(page.getByRole("button", { name: "Drag Linked Sources", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag Domain", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Drag Architecture", exact: true })).toBeVisible();
  await expect(page.getByTestId("canvas").getByText("Linked Sources annotation", { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const records = await store();
    const sources = Object.values(records).filter(r => r.type === "lexicon-object" && r.meta.lexiconProjection === "layers-source");
    const combined = Object.values(records).filter(r => r.type === "lexicon-object" && r.meta.lexiconProjection === "combined" && /^(code|file):/.test(r.props.graphId));
    return sources.length > 0 && combined.length === sources.length && combined.every(r => r.meta.combinedDimension === "source" && records[r.meta.combinedSourceId]?.props.graphId === r.props.graphId);
  }).toBe(true);
  const handle = page.getByRole("button", { name: "Drag Linked Sources", exact: true });
  await handle.click();
  await expect(page.locator('.canvas-drawing-plane-badge')).toHaveText("Linked Sources");
  await handle.press("Shift+ArrowRight");
  await expect.poll(async () => placements(await store())).toEqual(original);
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await input.fill("Written through Combined"); await input.press("Escape");
  await expect.poll(async () => Object.values(await store()).filter(r => r.type === "note" && r.parentId === "page:layers-source-links").length).toBe(2);
  await page.reload();
  await expect(page.getByRole("radio", { name: "Combined", exact: true })).toBeChecked();
  await expect(page.locator('.canvas-drawing-plane-badge')).toHaveText("Linked Sources");
  await page.getByRole("radio", { name: "Linked Sources", exact: true }).check();
  await expect(page.getByTestId("canvas").getByText("Written through Combined", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Atlas · Ink", exact: true }).check();
  await expect(page.getByRole("radio", { name: "Atlas · Ink", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Standard", exact: true }).check();
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await expect.poll(async () => Object.values(await store()).filter(r => r.type === "lexicon-connection" && r.meta.lexiconProjection === "combined" && r.props.graphId.startsWith("mapping:") && !r.meta.lexiconHidden).length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "code: Order", exact: true }).click();
  await expect(page.getByLabel("Source code", { exact: true })).toContainText("class Order");
  await expect(page.getByRole("radio", { name: "Combined", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Close Source Reader", exact: true }).click();
  for (const name of ["Toggle reader", "Toggle navigation"]) {
    const toggle = page.getByRole("button", { name, exact: true });
    if (await toggle.getAttribute("aria-pressed") === "true") await toggle.click();
  }
  await expect(page.locator('.reading-pane')).toBeHidden();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.screenshot({ path: "../output/source-preview/combined-linked-sources.png" });
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(page.locator('.reading-pane')).toBeHidden();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.getByTestId("canvas").click({ position: { x: 550, y: 650 } });
  await page.keyboard.press("Shift+1");
  await expect(page.locator('.combined-region[data-dimension="source"]')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: "../output/source-preview/combined-linked-sources-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});

test("Files is default-off and can be enabled in Development options", async ({ page }) => {
  let scans = 0;
  page.on("request", request => { if (request.url().includes(`/api/projects/${id}/files`)) scans++; });
  await page.goto(`/p/${id}?files=1`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Browse Files", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tree", { name: "File Map" })).toHaveCount(0);
  expect(scans).toBe(0);
  await page.getByRole("button", { name: "Project settings", exact: true }).click();
  await page.getByText("Development options", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Files / File Map", exact: true }).check();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("tree", { name: "File Map" })).toBeVisible();
  await expect(page.getByRole("application", { name: "tldraw", exact: true })).toHaveCount(0);
  expect(scans).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Project settings", exact: true }).click();
  await page.getByText("Development options", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Files / File Map", exact: true }).uncheck();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(page.getByRole("tree", { name: "File Map" })).toHaveCount(0);
});


test("older Combined layouts gain Linked Sources without resetting dimension offsets", async ({ page, request }) => {
  await page.goto(`/p/${id}`);
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  await page.goto("about:blank");
  const state = await (await request.get(`/api/projects/${id}/canvas`)).json();
  const combined = state.document.snapshot.store["page:lexicon-combined"];
  combined.meta.combinedOffsets = { domain: { x: 100, y: 200 }, architecture: { x: 1800, y: 600 } };
  expect((await request.put(`/api/projects/${id}/canvas`, { data: { revision: state.revision, document: state.document } })).ok()).toBe(true);
  await page.goto(`/p/${id}`);
  await expect(page.getByRole("radio", { name: "Combined", exact: true })).toBeChecked();
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  await expect.poll(async () => {
    const next = await (await request.get(`/api/projects/${id}/canvas`)).json();
    return next.document.snapshot.store["page:lexicon-combined"].meta.combinedOffsets;
  }).toMatchObject({ domain: { x: 100, y: 200 }, architecture: { x: 1800, y: 600 }, source: { x: expect.any(Number), y: expect.any(Number) } });
  const sources = (await page.locator('.combined-region[data-dimension="source"]').boundingBox())!;
  const architecture = (await page.locator('.combined-region[data-dimension="architecture"]').boundingBox())!;
  expect(sources.x).toBeGreaterThan(architecture.x + architecture.width);
});


test("returning to Combined reuses saved geometry without a layout overlay", async ({ page, request }) => {
  await page.goto(`/p/${id}`);
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
  const placements = async () => {
    const records = (await (await request.get(`/api/projects/${id}/canvas`)).json()).document.snapshot.store;
    return Object.values(records).filter((r: any) => r.type === "lexicon-object" && r.meta.lexiconProjection === "combined")
      .map((r: any) => [r.id, r.parentId, r.x, r.y, r.props.w, r.props.h]).sort();
  };
  const before = await placements();
  for (const view of ["Domain", "Architecture", "Linked Sources", "Domain"]) {
    await page.getByRole("radio", { name: view, exact: true }).check();
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await page.evaluate(() => {
      const state = window as typeof window & { combinedLoading?: { count: number; observer: MutationObserver } };
      const observed = { count: 0, observer: new MutationObserver(() => {}) };
      observed.observer = new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes)
          if (node instanceof Element && (node.matches('.canvas-stage .canvas-loading') || node.querySelector('.canvas-stage .canvas-loading'))) observed.count++;
      });
      observed.observer.observe(document.querySelector('.canvas-pane')!, { subtree: true, childList: true });
      state.combinedLoading = observed;
    });
    await page.getByRole("radio", { name: "Combined", exact: true }).check();
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Drag Linked Sources", exact: true })).toBeVisible();
    await expect.poll(placements).toEqual(before);
    const loading = await page.evaluate(() => {
      const state = window as typeof window & { combinedLoading?: { count: number; observer: MutationObserver } };
      state.combinedLoading!.observer.disconnect(); return state.combinedLoading!.count;
    });
    expect(loading).toBe(0);
  }
});

test("source radials cross planes in both directions and restore exact targets through history", async ({ page }) => {
  await writeFile(join(root, "policy.md"), "# Rules\nOrders require lines.\n");
  const linked = xml.replace('</concept>', '<code-link kind="document" file="policy.md" heading="rules" role="specification">Policy.</code-link></concept>');
  await writeFile(join(root, "lexicon/model.xml"), linked);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/p/${id}?item=order`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  for (const name of ["Toggle reader", "Toggle navigation"]) {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.getAttribute("aria-pressed") === "true") await button.click();
  }
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const ring = page.getByRole("group", { name: "Cross-dimension neighbors", exact: true });
  await page.getByRole("button", { name: "concept: Order", exact: true }).hover();
  await ring.getByRole("button", { name: "Go to rules", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Linked Sources", exact: true })).toBeChecked();
  const selected = page.locator('.canvas-card[data-selected="true"]');
  await expect(selected).toContainText("rules");
  const sourceUrl = page.url();
  await page.goBack();
  await expect(page.getByRole("radio", { name: "Domain", exact: true })).toBeChecked();
  await expect(page.locator('[data-model-id="item:order"]')).toHaveAttribute("data-selected", "true");
  await page.goForward();
  await expect(page.getByRole("radio", { name: "Linked Sources", exact: true })).toBeChecked();
  expect(new URL(page.url()).searchParams.get("code")).toBe(new URL(sourceUrl).searchParams.get("code"));
  await expect(selected).toContainText("rules");
  await page.getByRole("button", { name: "code: rules", exact: true }).hover();
  await ring.getByRole("button", { name: "Go to Order", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Domain", exact: true })).toBeChecked();
  await expect(page.locator('.canvas-card[data-model-id^="code:"]')).toHaveCount(0);
  await page.getByRole("button", { name: "concept: Order", exact: true }).hover();
  await ring.getByRole("button", { name: "Go to Order", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Linked Sources", exact: true })).toBeChecked();
  if (await page.getByRole("button", { name: "Close Source Reader", exact: true }).isVisible())
    await page.getByRole("button", { name: "Close Source Reader", exact: true }).click();
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await page.getByRole("radio", { name: "Linked Sources", exact: true }).check();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.getByRole("button", { name: "code: Checkout", exact: true }).hover();
  await ring.getByRole("button", { name: "Go to Order Handling", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Architecture", exact: true })).toBeChecked();
  await expect(page.locator('[data-model-id="item:checkout"]')).toHaveAttribute("data-selected", "true");
  await page.setViewportSize({ width: 600, height: 900 });
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.getByRole("button", { name: "component: Order Handling", exact: true }).hover();
  await ring.getByRole("button", { name: "Go to Checkout", exact: true }).hover();
  await expect(ring.getByRole("button", { name: "Go to Checkout", exact: true }).locator(".radial-neighbor-name")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "../output/source-preview/source-radial-mobile.png" });
  expect(errors).toEqual([]);
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(linked);
});

test("relationship source radials save before switching presentation and legacy Planes URLs remain readable", async ({ page }) => {
  await page.goto(`/layers/${id}?item=order-lines`);
  await expect(page).toHaveURL(/presentation=planes/);
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Domain ↗", exact: true }).click();
  for (const name of ["Toggle reader", "Toggle navigation"]) {
    const button = page.getByRole("button", { name, exact: true });
    if (await button.getAttribute("aria-pressed") === "true") await button.click();
  }
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const ring = page.getByRole("group", { name: "Cross-dimension neighbors", exact: true });
  await page.getByRole("button", { name: "Read relationship: contains", exact: true }).hover();
  await ring.getByRole("button", { name: "Go to Order", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Linked Sources", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "code: Order", exact: true }).hover();
  await ring.getByRole("button", { name: "Go to contains", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Domain", exact: true })).toBeChecked();
  await expect(page.locator(".canvas-connection").filter({ has: page.locator('[data-connection-id="relation:order-lines"]') })).toHaveAttribute("data-selected", "true");
  await page.getByRole("radio", { name: "Linked Sources", exact: true }).check();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await expect(page.locator(".canvas-save-indicator")).toContainText("Saved to project");
  let saving = false;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/projects/${id}/canvas`, async route => {
    if (route.request().method() === "PUT") { saving = true; await gate; }
    await route.continue();
  });
  await page.getByRole("button", { name: /^Rectangle —/ }).click();
  const box = (await page.locator('.canvas-stage').boundingBox())!;
  await page.mouse.move(box.x + 310, box.y + 165); await page.mouse.down();
  await page.mouse.move(box.x + 405, box.y + 215); await page.mouse.up();
  await page.keyboard.press("Escape");
  await expect(page.locator('.canvas-stage .tl-shape[data-shape-type="geo"]')).toHaveCount(1);
  await expect.poll(() => saving).toBe(true);
  await page.getByRole("button", { name: "code: Checkout.place", exact: true }).hover();
  await ring.getByRole("button", { name: "Go to creates", exact: true }).click();
  try {
    await expect(page.getByRole("radio", { name: "Linked Sources", exact: true })).toBeChecked();
    await expect(page.locator('.planes-stage')).toHaveCount(0);
  } finally { release(); }
  await expect(page.locator('.planes-stage[data-ready="true"]')).toBeVisible();
  await expect(page.locator('[data-plane="source"] .tl-shape[data-shape-type="geo"]')).toHaveCount(1);
  await expect(page.locator('[data-bridge="creates-order"]')).toHaveAttribute("data-selected", "true");
  expect(new URL(page.url()).searchParams.get("item")).toBe("creates-order");
  await page.goBack();
  await expect(page.getByRole("radio", { name: "Linked Sources", exact: true })).toBeChecked();
  await expect(page.locator('.canvas-card[data-selected="true"]')).toContainText("Checkout.place");
});

test("Combined source links use orthogonal routes and follow their plane and relationship labels", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("lexicon.edgeCornerRadius", "0");
    localStorage.setItem("lexicon.edgeCrossingHops", "false");
  });
  await page.goto(`/p/${id}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  for (const name of ["Toggle reader", "Toggle navigation"]) {
    const toggle = page.getByRole("button", { name, exact: true });
    if (await toggle.getAttribute("aria-pressed") === "true") await toggle.click();
  }
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const drawing = page.locator('.canvas-mapping:visible');
  // Routes are derived and deliberately omitted from saved canvas records.
  const routes = () => drawing.evaluateAll(elements => elements.map(element => {
    const path = element.querySelector('[data-route-current] > path') as SVGPathElement;
    const d = path.getAttribute("d")!;
    const numbers = d.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)!.map(Number);
    const points = Array.from({ length: numbers.length / 2 }, (_, i) => ({ x: numbers[i * 2], y: numbers[i * 2 + 1] }));
    const start = path.getPointAtLength(0).matrixTransform(path.getScreenCTM()!);
    return { id: element.querySelector('[data-connection-id]')!.getAttribute('data-connection-id'), d, points, start: { x: start.x, y: start.y } };
  }));
  const orthogonal = (edges: Awaited<ReturnType<typeof routes>>) => edges.length > 0 && edges.every(edge =>
    !/[QC]/.test(edge.d) && edge.points.length >= 2 && edge.points.every((p, i, points) =>
      !i || Math.abs(p.x - points[i - 1].x) < .001 || Math.abs(p.y - points[i - 1].y) < .001));
  await expect.poll(async () => orthogonal(await routes())).toBe(true);
  const before = await routes();
  await expect(drawing.first().locator('[data-route-current] > path').first()).toHaveAttribute("stroke-dasharray", "6 5");
  const assertRelationshipAnchor = async () => {
    const label = await page.locator('[data-connection-id="relation:order-lines"]').boundingBox();
    const mapping = (await routes()).find(r => r.id === 'mapping:["order-lines","members"]');
    if (!label || !mapping) return false;
    const dx = Math.abs(mapping.start.x - label.x - label.width / 2);
    const dy = Math.abs(mapping.start.y - label.y - label.height / 2);
    return dx <= label.width / 2 + 1 && dy <= label.height / 2 + 1 &&
      (Math.abs(dx - label.width / 2) < 1 || Math.abs(dy - label.height / 2) < 1);
  };
  await expect.poll(assertRelationshipAnchor).toBe(true);
  const source = page.getByRole("button", { name: "Drag Linked Sources", exact: true });
  await source.click(); await source.press("Shift+ArrowRight");
  await expect.poll(async () => JSON.stringify(await routes())).not.toBe(JSON.stringify(before));
  await expect.poll(async () => orthogonal(await routes())).toBe(true);
  await expect.poll(assertRelationshipAnchor).toBe(true);
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  await page.screenshot({ path: "../output/source-preview/combined-orthogonal-sources.png" });
  expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
});
