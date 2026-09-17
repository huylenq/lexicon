import { expect, test } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('visible source titles drag their own object through an overlapping directory', async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), 'lexicon-source-drag-'));
  let id: string | undefined;
  try {
    for (const dir of ['lexicon', 'helm', 'src']) await mkdir(join(root, dir));
    for (const file of ['helm/ingress.yaml', 'src/db.py']) await writeFile(join(root, file), '# source\n');
    await writeFile(join(root, 'lexicon/model.xml'), `<lexicon schema="3.3" id="source-drag"><name>Source drag</name><description>Overlapping directories.</description><context id="context"><name>Context</name><description>Sources.</description>${['helm/ingress.yaml', 'src/db.py'].map(file => `<code-link kind="code" file="${file}" role="implementation">Source.</code-link>`).join('')}</context></lexicon>`);
    id = (await (await request.post('/api/projects', { data: { root } })).json()).id;
    const openSource = async () => {
      await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
      await page.getByRole('radio', { name: 'Linked Sources', exact: true }).check();
      await expect(page.getByRole('button', { name: 'file: ingress.yaml', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Fit model', exact: true }).click();
      await expect(page.locator('[data-save-status="saved"]')).toBeVisible();
    };
    await page.goto(`/p/${id}`);
    await openSource();
    const saved = await (await request.get(`/api/projects/${id}/canvas`)).json();
    const records = Object.values(saved.document.snapshot.store) as any[];
    const source = records.filter(r => r.type === 'lexicon-object' && r.meta.lexiconProjection === 'layers-source');
    const shape = (graphId: string) => source.find(r => r.props.graphId === graphId);
    Object.assign(shape('directory:helm'), { x: 0, y: 0 });
    // The front directory's full-width header crosses the visible file title.
    Object.assign(shape('directory:src'), { x: -120, y: 65 });
    shape('directory:src').index = 'b00';
    const update = await request.put(`/api/projects/${id}/canvas`, { data: { revision: saved.revision, document: saved.document } });
    expect(update.ok(), await update.text()).toBe(true);
    await page.reload();
    await openSource();
    const title = page.getByRole('button', { name: 'file: ingress.yaml', exact: true });
    const before = (await title.boundingBox())!;
    const from = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 70, from.y - 45, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('[data-model-id="file:helm/ingress.yaml"]')).toHaveAttribute('data-selected', 'true');
    await expect.poll(async () => Math.round((await title.boundingBox())!.x - before.x)).toBe(70);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => Math.round((await title.boundingBox())!.x - before.x)).toBe(0);
  } finally {
    if (id) await request.delete(`/api/projects/${id}`);
    await rm(root, { recursive: true, force: true });
  }
});
