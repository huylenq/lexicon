import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("project settings persist on desktop and narrow screens", async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-settings-browser-"));
  let id = "";
  try {
    await cp(resolve(import.meta.dirname, "../../examples/shop"), root, { recursive: true });
    const xml = await readFile(join(root, "lexicon/model.xml"), "utf8");
    id = (await (await request.post("/api/projects", { data: { root } })).json()).id;
    await page.goto(`/p/${id}`);
    await page.getByRole("button", { name: "Project settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Project settings" });
    await expect(dialog.getByLabel("Include globs")).toBeEnabled();
    await dialog.getByLabel("Include globs").fill("**/*.md");
    await dialog.getByLabel("Exclude globs").fill("**/secret/**");
    await dialog.getByRole("button", { name: "Save settings" }).click();
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

for (const [name, content] of [["invalid JSON", "{broken"], ["invalid fields", '{"files":{"include":[],"exclude":"*.lock"}}']]) {
  test(`project settings recover from ${name} without changing files until saved`, async ({ page, request }) => {
    const root = await mkdtemp(join(tmpdir(), "lexicon-settings-recovery-"));
    let id = "";
    try {
      await cp(resolve(import.meta.dirname, "../../examples/shop"), root, { recursive: true });
      const settingsPath = join(root, "lexicon/settings.json");
      await writeFile(settingsPath, content);
      id = (await (await request.post("/api/projects", { data: { root } })).json()).id;
      await page.goto(`/p/${id}`);
      await page.getByRole("button", { name: "Project settings", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Project settings" });
      await expect(dialog.getByRole("alert")).toContainText("Cannot read lexicon/settings.json");
      await dialog.getByRole("button", { name: "Load default filters" }).click();
      await expect(dialog.getByLabel("Exclude globs")).toHaveValue("**/*.lock\n**/.*/**");
      await expect(dialog.getByLabel("Include globs")).toBeEnabled();
      expect(await readFile(settingsPath, "utf8")).toBe(content);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(await readFile(settingsPath, "utf8")).toBe(content);
      await page.getByRole("button", { name: "Project settings", exact: true }).click();
      await dialog.getByRole("button", { name: "Load default filters" }).click();
      await dialog.getByRole("button", { name: "Save settings" }).click();
      await expect(dialog).not.toBeVisible();
      expect(JSON.parse(await readFile(settingsPath, "utf8"))).toEqual({ files: { include: [], exclude: ["**/*.lock", "**/.*/**"] } });
      expect((await request.get(`/api/projects/${id}/settings`)).ok()).toBe(true);
      await page.getByRole("button", { name: "Project settings", exact: true }).click();
      await expect(dialog.getByLabel("Exclude globs")).toHaveValue("**/*.lock\n**/.*/**");
    } finally {
      if (id) await request.delete(`/api/projects/${id}`);
      await rm(root, { recursive: true, force: true });
    }
  });
}
