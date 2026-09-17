import { expect, test } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installRoutingProbe } from './canvas-routing-probe';

test('primary crossing connections animate after release through the displayed scene', async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), 'lexicon-crossed-morph-'));
  let id: string | undefined;
  try {
    await mkdir(join(root, 'lexicon'));
    await writeFile(join(root, 'lexicon/model.xml'), `<lexicon schema="3.3" id="crossed-morph"><name>Crossed routes</name><description>Animation regression.</description><context id="context"><name>Context</name><description>Four endpoints.</description>${['a','b','c','d'].map(id => `<concept id="${id}"><name>${id.toUpperCase()}</name><description>Endpoint.</description></concept>`).join('')}</context><relationship id="horizontal" from="a" to="b"><name>feeds</name><description>Horizontal route.</description></relationship><relationship id="vertical" from="c" to="d"><name>uses</name><description>Vertical route.</description></relationship></lexicon>`);
    id = (await (await request.post('/api/projects', { data: { root } })).json()).id;
    await installRoutingProbe(page);
    await page.goto(`/p/${id}`);
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
    const saved = await (await request.get(`/api/projects/${id}/canvas`)).json();
    const placements: Record<string, [number, number]> = { 'item:a': [0, 400], 'item:b': [650, 400], 'item:c': [450, 0], 'item:d': [450, 600] };
    for (const record of Object.values(saved.document.snapshot.store) as any[]) if (record.type === 'lexicon-object' && placements[record.props.graphId]) {
      [record.x, record.y] = placements[record.props.graphId];
    }
    expect((await request.put(`/api/projects/${id}/canvas`, { data: { revision: saved.revision, document: saved.document } })).ok()).toBe(true);
    await page.reload();
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle reader', exact: true }).click();
    await page.getByRole('button', { name: 'Fit model', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).routingProbe.pending)).toBe(0);
    await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
    const routes = page.locator('.canvas-connection [data-route-current]');
    const h = page.locator('.canvas-connection:has([data-connection-id="relation:horizontal"]) [data-route-current]');
    await expect(h.locator('path').first()).toHaveAttribute('d', /Q/);
    const node = page.locator('[data-model-id="item:b"]');
    const b = (await node.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 - 90, b.y + b.height / 2 + 140, { steps: 8 });
    await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
    await page.evaluate(() => {
      (window as any).crossedSamples = [];
      const tick = () => {
        const group = document.querySelector('.canvas-connection:has([data-connection-id="relation:horizontal"]) [data-route-current]')!;
        if (group.hasAttribute('data-route-morphing')) (window as any).crossedSamples.push(group.querySelector('path')!.getAttribute('d'));
        (window as any).crossedSampleFrame = requestAnimationFrame(tick);
      };
      tick();
    });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => new Set((window as any).crossedSamples).size)).toBeGreaterThan(2);
    await expect.poll(() => page.evaluate(() => (window as any).routingProbe.pending)).toBe(0);
    await expect(page.locator('[data-route-morphing="true"]')).toHaveCount(0);
    await page.evaluate(() => cancelAnimationFrame((window as any).crossedSampleFrame));
    await expect(routes).toHaveCount(2);
    await page.screenshot({ path: test.info().outputPath('crossed-settled.png') });
  } finally {
    if (id) await request.delete(`/api/projects/${id}`);
    await rm(root, { recursive: true, force: true });
  }
});
