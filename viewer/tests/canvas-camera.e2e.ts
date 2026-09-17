import { expect, test, type Page } from '@playwright/test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const camera = (page: Page) => page.locator('.tl-html-layer').evaluate(element => (element as HTMLElement).style.transform);
async function settledCamera(page: Page) {
  let previous = '', stable = 0;
  await expect.poll(async () => {
    const current = await camera(page);
    stable = current === previous ? stable + 1 : 0;
    previous = current;
    return stable;
  }).toBeGreaterThanOrEqual(2);
  return previous;
}

test('each plane preserves its pan and zoom across switches and reload', async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), 'lexicon-camera-'));
  let projectId: string | undefined;
  try {
    await cp(resolve(import.meta.dirname, '../../examples/canvas-workshop'), root, { recursive: true,
      filter: source => !/\/lexicon\/(canvas\.json|\.canvas[^/]*|assets)(\/|$)/.test(source) });
    const response = await request.post('/api/projects', { data: { root } });
    expect(response.ok()).toBe(true);
    projectId = (await response.json()).id;
    await page.goto(`/p/${projectId}`);
    const ready = () => expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await ready();
    await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
    const views = ['Domain', 'Architecture', 'Linked Sources', 'Combined'];
    const cameras = new Map<string, string>();
    for (const [i, name] of views.entries()) {
      await page.getByRole('radio', { name, exact: true }).check();
      await ready();
      const before = await settledCamera(page);
      // A new plane must be framed rather than left at tldraw's origin.
      expect(before).not.toMatch(/^scale\(1\) translate\(0px, 0px\)$/);
      const area = (await page.locator('.canvas-stage').boundingBox())!;
      const x = area.x + area.width / 2, y = area.y + area.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, -100 - i * 30);
      await expect.poll(() => camera(page)).not.toBe(before);
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(x + 60 + i * 15, y + 45, { steps: 8 });
      await page.mouse.up({ button: 'middle' });
      cameras.set(name, await settledCamera(page));
    }
    for (const name of views) {
      await page.getByRole('radio', { name, exact: true }).check();
      await ready();
      expect(await settledCamera(page)).toBe(cameras.get(name));
    }
    await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
    await page.reload();
    await ready();
    for (const name of views) {
      await page.getByRole('radio', { name, exact: true }).check();
      await ready();
      expect(await settledCamera(page)).toBe(cameras.get(name));
    }
    await page.getByRole('button', { name: 'Fit model', exact: true }).click();
    expect(await settledCamera(page)).not.toBe(cameras.get('Combined'));
  } finally {
    if (projectId) await request.delete(`/api/projects/${projectId}`);
    await rm(root, { recursive: true, force: true });
  }
});
