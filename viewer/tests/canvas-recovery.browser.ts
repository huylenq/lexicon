import { expect, test } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface RecoveryCopy {
  key: string;
  scope: string;
  tab: string;
  dirty: boolean;
  document: unknown;
}

test.use({ serviceWorkers: "block" });

test("delete one recovery copy without changing the canvas or other backups", async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-recovery-"));
  let id = "";
  try {
    await mkdir(join(root, "lexicon"));
    await writeFile(join(root, "lexicon/model.xml"), `<lexicon schema="3.0" id="recovery"><name>Recovery</name><description>Recovery test.</description></lexicon>`);
    id = (await (await request.post("/api/projects", { data: { root } })).json()).id;
    await page.goto(`/p/${id}`);
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /^Canvas recovery/ })).toHaveCount(0);
    const records = () => page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("lexicon-canvas-recovery", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return await new Promise<RecoveryCopy[]>((resolve, reject) => {
        const request = db.transaction("drafts").objectStore("drafts").getAll();
        request.onsuccess = () => { db.close(); resolve(request.result); };
        request.onerror = () => { db.close(); reject(request.error); };
      });
    });
    await expect.poll(async () => (await records()).some((entry) => !entry.dirty)).toBe(true);
    const original = (await records()).find((entry) => !entry.dirty)!;
    await page.evaluate(async (original) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open("lexicon-canvas-recovery", 1);
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("drafts", "readwrite");
        for (const tab of ["backup-one", "backup-two", "backup-three", "backup-four", "backup-five", "backup-six"]) {
          transaction.objectStore("drafts").put({ ...original, key: `${original.scope}:${tab}`, tab, dirty: true });
        }
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => { db.close(); reject(transaction.error); };
      });
    }, original);
    await page.reload();
    const trigger = page.getByRole("button", { name: "Canvas recovery (6)", exact: true });
    const browse = page.getByRole("button", { name: "Toggle navigation", exact: true });
    if (await browse.getAttribute("aria-pressed") !== "true") await browse.click();
    await expect(page.getByRole("complementary", { name: "Model navigation" })).toBeVisible();
    const geometry = () => page.locator(".canvas-top, .canvas-stage").evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }));
    const closedGeometry = await geometry();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Canvas recovery", exact: true });
    await expect(dialog).toBeVisible();
    expect(await geometry()).toEqual(closedGeometry);
    await page.screenshot({ path: "test-results/canvas-recovery-desktop.png" });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await geometry()).toEqual(closedGeometry);
    await trigger.click();
    const desktopDialogBounds = await dialog.boundingBox();
    const desktopDeleteBounds = await page.getByRole("button", { name: /^Delete recovery copy/ }).first().boundingBox();
    const before = await (await request.get(`/api/projects/${id}/canvas`)).json();
    await page.getByRole("button", { name: /^Delete recovery copy/ }).first().click();
    await expect(page.getByRole("button", { name: "Canvas recovery (5)", exact: true })).toHaveCount(1);
    expect(await dialog.boundingBox()).toEqual(desktopDialogBounds);
    expect(await page.getByRole("button", { name: /^Delete recovery copy/ }).first().boundingBox()).toEqual(desktopDeleteBounds);
    expect((await records()).filter((entry) => entry.tab.startsWith("backup-"))).toHaveLength(5);
    expect((await records()).find((entry) => entry.key === original.key)?.document).toEqual(original.document);
    await page.reload();
    await page.setViewportSize({ width: 390, height: 480 });
    if (await browse.getAttribute("aria-pressed") !== "true") await browse.click();
    await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
    const narrowGeometry = await geometry();
    await page.getByRole("button", { name: "Canvas recovery (5)", exact: true }).click();
    await expect(dialog).toBeInViewport();
    expect(await geometry()).toEqual(narrowGeometry);
    const deletes = page.getByRole("button", { name: /^Delete recovery copy/ });
    await expect(deletes.first()).toBeInViewport();
    // Top-layer hit testing proves Browse cannot intercept the recovery controls.
    expect(await deletes.first().evaluate((button) => {
      const bounds = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    })).toBe(true);
    await page.screenshot({ path: "test-results/canvas-recovery-narrow.png" });
    const narrowDialogBounds = await dialog.boundingBox();
    const narrowDeleteBounds = await deletes.first().boundingBox();
    for (let remaining = 5; remaining > 0; remaining--) {
      await deletes.first().click();
      await expect(deletes).toHaveCount(remaining - 1);
      if (remaining > 1) {
        expect(await dialog.boundingBox()).toEqual(narrowDialogBounds);
        expect(await deletes.first().boundingBox()).toEqual(narrowDeleteBounds);
      }
    }
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: /^Canvas recovery/ })).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /^Canvas recovery/ })).toHaveCount(0);
    expect((await records()).filter((entry) => entry.tab.startsWith("backup-"))).toHaveLength(0);
    expect((await (await request.get(`/api/projects/${id}/canvas`)).json()).revision).toBe(before.revision);
  } finally {
    if (id) await request.delete(`/api/projects/${id}`);
    await rm(root, { recursive: true, force: true });
  }
});
