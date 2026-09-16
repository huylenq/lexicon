import { expect, test } from "@playwright/test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("Planes preserves camera orientation when comparing projections and pans in screen coordinates", async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-isometric-"));
  let id = "";
  try {
    await cp(resolve(import.meta.dirname, "../../examples/shop"), root, { recursive: true });
    await rm(join(root, "lexicon/canvas.json"), { force: true });
    const response = await request.post("/api/projects", { data: { root } });
    expect(response.ok()).toBe(true);
    id = (await response.json()).id;
    await page.goto(`/p/${id}?item=order`);
    await page.getByRole("radio", { name: "Planes", exact: true }).click();
    const stage = page.locator('.planes-stage[data-ready="true"]');
    await expect(stage).toBeVisible();
    await expect(page.locator('.planes-arranging')).toHaveCount(0);
    const scene = page.locator('.planes-scene');
    const initial = await scene.evaluate(el => getComputedStyle(el).transform);
    expect(await scene.evaluate(el => el.style.transform)).toContain('rotateX(45deg) rotateY(0deg) rotateZ(0deg)');
    await expect(page.locator('.planes-camera')).toHaveCSS('perspective', 'none');
    // Identical local spans retain their projected size on every depth plane.
    const spans = await page.locator('[data-plane]').evaluateAll(sheets => sheets.map(sheet => {
      const corners = [...sheet.querySelectorAll('[data-plane-corner]')].map(el => el.getBoundingClientRect());
      return Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
    }));
    expect(spans).toHaveLength(3);
    expect(spans[0]).toBeCloseTo(spans[1], 2);
    expect(spans[1]).toBeCloseTo(spans[2], 2);
    await page.screenshot({ path: '/tmp/lexicon-isometric-desktop.png' });
    const box = (await stage.boundingBox())!;
    await page.keyboard.down('Alt');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 30);
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect.poll(() => scene.evaluate(el => getComputedStyle(el).transform)).not.toBe(initial);
    await page.getByRole('button', { name: 'Reset view', exact: true }).click();
    await expect.poll(() => scene.evaluate(el => getComputedStyle(el).transform)).toBe(initial);
    // Every plane follows the pointer equally, even after zooming or orbiting.
    await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
    await expect(page.locator(".reading-pane")).toBeHidden();
    const camera = page.locator('.planes-camera');
    const positions = () => page.locator('[data-plane]').evaluateAll(sheets => sheets.map(sheet => {
      const corner = sheet.querySelector('[data-plane-corner]')!.getBoundingClientRect();
      return { x: corner.x, y: corner.y };
    }));
    const panScene = async () => {
      const before = await positions();
      const rect = (await stage.boundingBox())!;
      const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(x + 70, y + 35, { steps: 5 });
      await page.mouse.up({ button: 'right' });
      const after = await positions();
      for (let i = 0; i < before.length; i++) {
        expect(after[i].x - before[i].x).toBeCloseTo(70, 1);
        expect(after[i].y - before[i].y).toBeCloseTo(35, 1);
      }
    };
    await panScene();
    await page.mouse.wheel(0, -160);
    await expect.poll(() => camera.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)).toBeGreaterThan(1);
    await panScene();
    const framing = await camera.evaluate(el => el.style.transform);
    await page.getByRole('button', { name: 'Camera: Isometric', exact: true }).click();
    await expect(camera).toHaveCSS('perspective', '2400px');
    expect(await camera.evaluate(el => el.style.transform)).toBe(framing);
    const perspective = await scene.evaluate(el => el.style.transform);
    expect(perspective).toContain('rotateX(45deg) rotateY(0deg) rotateZ(0deg)');
    await panScene();
    await page.keyboard.down('Alt');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 30);
    await page.mouse.up();
    await page.keyboard.up('Alt');
    const orbited = await scene.evaluate(el => el.style.transform);
    expect(orbited).not.toBe(perspective);
    await page.getByRole('button', { name: 'Camera: Perspective', exact: true }).click();
    await expect(camera).toHaveCSS('perspective', 'none');
    expect(await scene.evaluate(el => el.style.transform)).toBe(orbited);
    await page.getByRole('button', { name: 'Camera: Isometric', exact: true }).click();
    await expect(camera).toHaveCSS('perspective', '2400px');
    expect(await scene.evaluate(el => el.style.transform)).toBe(orbited);
    await panScene();
    await page.getByRole('button', { name: 'Reset view', exact: true }).click();
    expect(await scene.evaluate(el => el.style.transform)).toBe(perspective);
    await expect(camera).toHaveCSS('perspective', '2400px');
    await page.screenshot({ path: '/tmp/lexicon-perspective-desktop.png' });
    await page.getByRole('button', { name: 'Camera: Perspective', exact: true }).click();
    await expect(camera).toHaveCSS('perspective', 'none');
    await expect.poll(() => scene.evaluate(el => getComputedStyle(el).transform)).toBe(initial);
    await page.setViewportSize({ width: 600, height: 900 });
    await expect(stage).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator(".reading-pane")).toBeHidden();
    await page.screenshot({ path: '/tmp/lexicon-isometric-mobile.png' });
  } finally {
    if (id) await request.delete(`/api/projects/${id}`);
    await rm(root, { recursive: true, force: true });
  }
});
