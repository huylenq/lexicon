import { expect, test, type Page } from "@playwright/test";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
let root: string, projectId: string, xml: string;
test.beforeEach(async ({ request }) => {
  root = await mkdtemp(join(tmpdir(), "lexicon-context-test-"));
  await cp(resolve(import.meta.dirname, "../../examples/canvas-workshop"), root, { recursive: true,
    filter: source => !/\/lexicon\/(canvas\.json|\.canvas[^/]*|assets)(\/|$)/.test(source) });
  xml = await readFile(join(root, "lexicon/model.xml"), "utf8");
  projectId = (await (await request.post("/api/projects", { data: { root } })).json()).id;
});
test.afterEach(async ({ request }) => {
  await request.delete(`/api/projects/${projectId}`);
  await rm(root, { recursive: true, force: true });
});
async function open(page: Page) {
  await page.goto(`/p/${projectId}`);
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
}

for (const skin of ["ink", "village"] as const) {
  test(`${skin} curved context names drag their contents, undo, and remain accessible`, async ({ page }) => {
    await open(page);
    await page.getByLabel("Atlas skin", { exact: true }).selectOption(skin);
    const label = page.getByRole("button", { name: "context: Ordering", exact: true });
    const text = label.locator("textPath");
    await expect(text).toHaveText("Ordering");
    const concept = page.getByRole("button", { name: "concept: Order", exact: true });
    await expect(concept).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const child = page.locator('[data-map-landmark="item:order"]');
    const before = await child.getAttribute("transform");
    const point = await label.locator(".atlas-name-hit").evaluate(element => {
      const path = element as SVGPathElement;
      const p = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM()!);
      return { x: p.x, y: p.y };
    });
    const url = page.url();
    await page.mouse.move(point.x, point.y);
    await expect(label.locator(".atlas-name-hit")).toHaveCSS("cursor", "grab");
    await page.mouse.down();
    await page.mouse.move(point.x + 75, point.y + 35, { steps: 12 });
    await page.mouse.up();
    await expect(child).not.toHaveAttribute("transform", before!);
    expect(page.url()).toBe(url);
    await page.getByRole("button", { name: /^Undo —/ }).click();
    await expect(child).toHaveAttribute("transform", before!);
    await label.click();
    await expect(page.locator("main [data-reader-card].active > header h1")).toContainText("Ordering");
    await page.getByRole("radio", { name: "Diagram", exact: true }).check();
    await expect(label.locator("textPath")).toHaveCount(0);
    await expect(label.locator(".object-name")).toBeVisible();
    await page.getByRole("radio", { name: "Atlas", exact: true }).check();
    await expect(text).toBeVisible();
    await expect(child).toHaveAttribute("transform", before!);
    await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
    await page.reload();
    await expect(text).toBeVisible();
    await expect(page.getByLabel("Atlas skin", { exact: true })).toHaveValue(skin);
    expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
  });

}
