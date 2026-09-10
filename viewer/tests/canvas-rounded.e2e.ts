import { test, expect } from "@playwright/test";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("relationship corner radius updates drawing, undoes, and survives reload", async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-rounded-"));
  let id: string | undefined;
  try {
    await cp(resolve(import.meta.dirname, "../../examples/canvas-workshop"), root, { recursive: true,
      filter: source => !/\/lexicon\/(canvas\.json|\.canvas[^/]*|assets)(\/|$)/.test(source) });
    const original = await readFile(join(root, "lexicon/model.xml"), "utf8");
    const response = await request.post("/api/projects", { data: { root } });
    expect(response.ok()).toBeTruthy();
    id = (await response.json()).id;
    await page.goto(`/p/${id}`);
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
    await page.getByRole("radio", { name: "Diagram", exact: true }).check();
    await page.getByRole("button", { name: "Fit model", exact: true }).click();
    // Offset an endpoint so the fixture exercises bends, not a straight edge.
    const node = await page.getByRole("button", { name: "concept: Order Line", exact: true }).boundingBox();
    expect(node).toBeTruthy();
    await page.mouse.move(node!.x + node!.width / 2, node!.y + node!.height / 2);
    await page.mouse.down();
    await page.mouse.move(node!.x + node!.width / 2 + 160, node!.y + node!.height / 2 + 60, { steps: 12 });
    await page.mouse.up();
    const label = page.getByRole("button", { name: "Read relationship: contains", exact: true });
    await label.click();
    const radius = page.getByRole("spinbutton", { name: "Corner radius", exact: true });
    await expect(radius).toHaveValue("0");
    const path = page.locator("svg.canvas-connection").filter({ has: label }).locator(":scope > path").first();
    await radius.fill("24");
    await radius.press("Tab");
    await expect(path).toHaveAttribute("d", /Q/);
    await page.getByRole("button", { name: /^Undo —/ }).click();
    await expect(radius).toHaveValue("0");
    await expect(path).not.toHaveAttribute("d", /Q/);
    await radius.fill("16");
    await radius.press("Tab");
    await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
    await page.reload();
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await label.click();
    await expect(radius).toHaveValue("16");
    await expect(path).toHaveAttribute("d", /Q/);
    await page.screenshot({ path: "../output/rounded-orthogonal.png" });
    await page.setViewportSize({ width: 600, height: 850 });
    await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
    await page.getByRole("button", { name: "Styles", exact: true }).click();
    await expect(radius).toBeVisible();
    await page.screenshot({ path: "../output/rounded-orthogonal-narrow.png" });
    expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(original);
  } finally {
    if (id) await request.delete(`/api/projects/${id}`);
    await rm(root, { recursive: true, force: true });
  }
});
