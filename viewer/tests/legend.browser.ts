import { expect, test } from '@playwright/test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('legend matches canvas colors in both themes and dimensions', async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), 'lexicon-legend-'));
  try {
    await cp(resolve(import.meta.dirname, '../../examples/shop'), root, { recursive: true });
    const response = await request.post('/api/projects', { data: { root } });
    expect(response.ok()).toBeTruthy();
    const project = await response.json();
    await page.goto(`/p/${project.id}`);
    await page.getByRole('radio', { name: 'Standard', exact: true }).check();
    const legend = page.getByLabel('Model legend and counts');
    await expect(legend).toBeVisible();
    for (const dimension of ['Domain', 'Architecture']) {
      await page.getByRole('radio', { name: dimension, exact: true }).check();
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
        const entries = legend.locator('.object-name');
        expect(await entries.count()).toBeGreaterThan(0);
        for (const entry of await entries.all()) {
          const tone = await entry.getAttribute('data-tone');
          const expected = await page.evaluate(tone => {
            const probe = document.createElement('span');
            probe.style.color = `var(--type-${tone})`;
            document.body.append(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
          }, tone);
          await expect(entry.locator('.type-icon')).toHaveCSS('color', expected);
        }
        const connection = page.locator('.canvas-connection:not(.canvas-mapping)').first();
        await expect(connection).toBeAttached();
        const color = await connection.evaluate(el => getComputedStyle(el).color);
        await expect(legend.locator('i:not(.code)')).toHaveCSS('border-top-color', color);
        if (dimension === 'Architecture') {
          const card = page.locator('.canvas-object [data-tone="system"] .type-icon').first();
          await expect(card).toBeAttached();
          await expect(legend.locator('[data-tone="system"] .type-icon')).toHaveCSS('color', await card.evaluate(el => getComputedStyle(el).color));
        }
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
