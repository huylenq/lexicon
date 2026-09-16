import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("project settings persist and refresh Files browsing on desktop and narrow screens", async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-settings-browser-"));
  let id = "";
  try {
    await cp(resolve(import.meta.dirname, "../../examples/shop"), root, { recursive: true });
    const xml = await readFile(join(root, "lexicon/model.xml"), "utf8");
    id = (await (await request.post("/api/projects", { data: { root } })).json()).id;
    await page.addInitScript(() => localStorage.setItem("lexicon.dev.files", "true"));
  await page.goto(`/p/${id}`);
    await page.getByRole("button", { name: "Browse Files", exact: true }).click();
    await expect(page.getByRole("tree", { name: "File Map" })).toBeVisible();
    await page.getByRole("button", { name: "Project settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Project settings" });
    await expect(dialog.getByLabel("Include globs")).toBeEnabled();
    await dialog.getByLabel("Include globs").fill("**/*.md");
    await dialog.getByLabel("Exclude globs").fill("**/secret/**");
    const refreshed = page.waitForResponse(r => r.url().includes(`/projects/${id}/files?refresh=1`));
    await dialog.getByRole("button", { name: "Save settings" }).click();
    const inventory = await (await refreshed).json();
    expect(inventory.files.length).toBeGreaterThan(0);
    expect(inventory.files.every((f: string) => f.endsWith(".md"))).toBe(true);
    await expect(dialog).not.toBeVisible();
    expect(JSON.parse(await readFile(join(root, "lexicon/settings.json"), "utf8")).files.include).toEqual(["**/*.md"]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Project settings", exact: true }).click();
    await expect(dialog.getByLabel("Include globs")).toHaveValue("**/*.md");
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.width).toBeLessThanOrEqual(390);
    await dialog.getByLabel("Include globs").fill("../*");
    await dialog.getByRole("button", { name: "Save settings" }).click();
    await expect(dialog.getByRole("alert")).toContainText("relative globs");
    await page.screenshot({ path: "../output/project-settings-mobile.png" });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
  } finally {
    if (id) await request.delete(`/api/projects/${id}`);
    await rm(root, { recursive: true, force: true });
  }
});
