import { expect, test } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let root: string;
test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "lexicon-document-browser-"));
  await cp(resolve(import.meta.dirname, "../../examples/document-sources"), root, { recursive: true });
  await writeFile(join(root, "README.md"), await readFile(join(root, "README.md"), "utf8") +
    '\n<script>window.documentSourceExecuted = true</script>\n\n![Remote image](https://document-source.invalid/track.png)\n\n[Unsafe](javascript:alert(1))\n');
});
test.afterAll(async () => { await rm(root, { recursive: true, force: true }); });

test("documents retain source identity through headings, history, search, canvas, and narrow reading", async ({ page, request }) => {
  const registered = await request.post('/api/projects', { data: { root } });
  expect(registered.ok()).toBeTruthy();
  const project = await registered.json();
  const errors: string[] = [], remote: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().includes('document-source.invalid')) remote.push(r.url()); });
  const pane = page.getByRole('complementary', { name: 'Source workspace' });
  const active = page.locator('main [data-reader-card].active');
  await page.goto(`/p/${project.id}`);
  await active.getByRole('button').filter({ hasText: 'Ordering' }).click();
  await expect(active.locator('> header h1')).toHaveText('Ordering');
  await page.locator('.sidebar .nav-item').filter({ has: page.getByText('Order', { exact: true }) }).click();
  await active.locator('.code-links button').filter({ hasText: 'approval-policy' }).click();
  await expect(pane.getByRole('table')).toBeVisible();
  await expect(pane.locator('[data-heading="approval-policy"]')).toHaveAttribute('data-selected', 'true');
  const section = pane.locator('.document-selected-section');
  await expect(section.getByRole('table')).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    const background = await section.evaluate(el => {
      const probe = document.createElement('span');
      probe.style.background = 'var(--soft)';
      el.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    });
    await expect(section).toHaveCSS('background-color', background);
    await pane.screenshot({ path: `/tmp/lexicon-document-highlight-${theme}.png` });
  }
  await expect(section.getByRole('heading', { name: 'Audit details' })).toHaveCount(1);
  await expect(section.getByRole('heading', { name: 'Review limits' })).toHaveCount(0);
  await pane.getByRole('button', { name: 'Raw text', exact: true }).click();
  await expect(pane.locator('.source-line.highlighted').filter({ hasText: 'type Decision =' })).toHaveCount(1);
  await expect(pane.locator('.source-line.highlighted').filter({ hasText: '## Review limits' })).toHaveCount(0);
  await pane.getByRole('button', { name: 'Rendered', exact: true }).click();
  const target = new URL(page.url()).searchParams.get('code');
  expect(target).toBe('code:["README.md","heading","approval-policy"]');
  await pane.getByRole('link', { name: 'Audit details', exact: true }).click();
  await expect(pane.getByLabel('Document heading')).toHaveValue('audit-details');
  await expect(section.getByRole('table')).toHaveCount(0);
  await expect(section.locator('pre')).toContainText('type Decision');
  await pane.getByRole('button', { name: 'Raw text', exact: true }).click();
  await expect(pane.getByLabel('Document source text')).toContainText('### Audit details');
  await pane.getByRole('button', { name: 'Rendered', exact: true }).click();
  await expect(pane.getByRole('heading', { name: 'Audit details' })).toBeVisible();
  await expect(pane.locator('script, img, a[href^="javascript:"]')).toHaveCount(0);
  expect(remote).toEqual([]);
  await active.locator('.code-links button').filter({ hasText: 'order.ts' }).click();
  await expect(pane.getByLabel('Source code')).toContainText('export interface Order');
  await pane.getByRole('button', { name: 'Previous source location' }).click();
  await expect(pane.getByLabel('Document content')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('code')).toBe(target);
  await page.reload();
  await expect(pane.getByLabel('Document heading')).toHaveValue('approval-policy');
  await pane.getByRole('button', { name: 'Close source pane' }).click();
  await page.getByRole('textbox', { name: 'Search model' }).fill('audit-details');
  await page.locator('.sidebar .nav-item').filter({ hasText: 'Review Decision' }).click();
  await expect(active.locator('> header h1')).toHaveText('Review Decision');
  await page.getByRole('textbox', { name: 'Search model' }).fill('');
  await active.getByRole('link', { name: 'Read relationship: requires review under the approval policy' }).click();
  await active.locator('.code-links button').click();
  await expect(pane.getByLabel('Document heading')).toHaveValue('review-limits');
  await pane.getByRole('button', { name: 'Close source pane' }).click();
  await page.goto(`/p/${project.id}?item=order`);
  await page.getByRole('radio', { name: 'Standard', exact: true }).check();
  await active.getByRole('button', { name: 'Toggle sources in canvas' }).click();
  await expect(page.locator('.canvas-card[data-model-id^="code:"]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Fit model', exact: true }).click();
  const docNode = page.locator('.canvas-card[data-model-id^="code:"]').filter({ hasText: 'approval-policy' }).locator('.canvas-object-title');
  await docNode.focus();
  await page.keyboard.press('Enter');
  await expect(pane.getByLabel('Document content')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(pane).toBeVisible();
  await expect(pane).toHaveCSS('translate', 'none');
  expect((await pane.boundingBox())!.width).toBe(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await pane.getByRole('button', { name: 'Back to reader', exact: true }).click();
  await expect(active.locator('> header h1')).toHaveText('Order');
  expect(errors).toEqual([]);
});

test("missing document headings remain readable and dismissible", async ({ page, request }) => {
  const missingRoot = await mkdtemp(join(tmpdir(), 'lexicon-missing-heading-'));
  try {
    await cp(root, missingRoot, { recursive: true });
    const model = join(missingRoot, 'lexicon/model.xml');
    await writeFile(model, (await readFile(model, 'utf8')).replace('heading="approval-policy"', 'heading="missing-heading"'));
    const response = await request.post('/api/projects', { data: { root: missingRoot } });
    const project = await response.json();
    await page.goto(`/p/${project.id}?item=order`);
    await page.locator('main [data-reader-card].active .code-links button').first().click();
    const pane = page.getByRole('complementary', { name: 'Source workspace' });
    await expect(pane.getByRole('status')).toContainText('linked heading was not found');
    await expect(pane.getByLabel('Document content')).toContainText('Approval policy');
    await pane.getByLabel('Document heading').selectOption('audit-details');
    await expect(pane.locator('[data-heading="audit-details"]')).toHaveAttribute('data-selected', 'true');
    await pane.getByRole('button', { name: 'Close source pane' }).click();
    await expect(pane).toBeHidden();
  } finally { await rm(missingRoot, { recursive: true, force: true }); }
});

test("switching document targets replaces mapped-from rows instead of accumulating them", async ({ page, request }) => {
  const switchingRoot = await mkdtemp(join(tmpdir(), 'lexicon-switching-headings-'));
  try {
    await cp(root, switchingRoot, { recursive: true });
    const model = join(switchingRoot, 'lexicon/model.xml');
    await writeFile(model, (await readFile(model, 'utf8')).replace(
      '<code-link kind="code" id="representation"',
      '<code-link kind="document" id="audit-policy" file="README.md" heading="audit-details" role="specification">Specifies the review audit trail.</code-link>\n      <code-link kind="code" id="representation"',
    ));
    const response = await request.post('/api/projects', { data: { root: switchingRoot } });
    expect(response.ok()).toBeTruthy();
    const project = await response.json();
    await page.goto(`/p/${project.id}?item=order`);
    const pane = page.getByRole('complementary', { name: 'Source workspace' });
    const links = page.locator('main [data-reader-card].active .code-links button');
    const checkTarget = async (heading: string, owners: string[]) => {
      await expect(pane.getByLabel('Document heading')).toHaveValue(heading);
      await expect(pane.locator('.code-mappings')).toHaveCount(1);
      await expect(pane.locator('.code-mappings summary')).toHaveText(`Mapped from · ${owners.length}`);
      await expect(pane.locator('.mapping-owner')).toHaveText(owners);
      await expect(pane.getByLabel('Document content')).toHaveCount(1);
    };
    for (let i = 0; i < 4; i++) {
      await links.filter({ hasText: 'approval-policy' }).click();
      await checkTarget('approval-policy', ['Order']);
      await pane.locator('.code-mappings summary').click();
      await links.filter({ hasText: 'audit-details' }).click();
      await checkTarget('audit-details', ['Order', 'Review Decision']);
      await expect(pane.locator('.code-mappings')).not.toHaveAttribute('open', '');
    }
    await pane.getByRole('button', { name: 'Previous source location' }).click();
    await checkTarget('approval-policy', ['Order']);
    await pane.getByRole('button', { name: 'Next source location' }).click();
    await checkTarget('audit-details', ['Order', 'Review Decision']);
    await links.filter({ hasText: 'order.ts' }).click();
    await expect(pane.getByLabel('Source code')).toBeVisible();
    await expect(pane.locator('.code-mappings')).toHaveCount(1);
    await pane.getByRole('button', { name: 'Previous source location' }).click();
    await checkTarget('audit-details', ['Order', 'Review Decision']);
  } finally { await rm(switchingRoot, { recursive: true, force: true }); }
});

for (const { label, newline, selector, raw } of [
  { label: 'LF heading', newline: '\n', selector: 'heading="distant-section"', raw: false },
  { label: 'CR heading', newline: '\r', selector: 'heading="distant-section"', raw: false },
  { label: 'CRLF line', newline: '\r\n', selector: 'line="163"', raw: true },
  { label: 'CR line', newline: '\r', selector: 'line="163"', raw: true },
]) {
  test(`${label} scrolls after hidden loading and retains later reading position`, async ({ page, request }) => {
    const hiddenRoot = await mkdtemp(join(tmpdir(), 'lexicon-hidden-document-'));
    try {
      await cp(root, hiddenRoot, { recursive: true });
      const lines = ['# Long document', '', ...Array.from({ length: 80 }, (_, i) => [`Paragraph ${i}.`, '']).flat(),
        '## Distant section', '', ...Array.from({ length: 80 }, (_, i) => [`Following paragraph ${i}.`, '']).flat()];
      await writeFile(join(hiddenRoot, 'README.md'), lines.join(newline));
      const model = join(hiddenRoot, 'lexicon/model.xml');
      await writeFile(model, (await readFile(model, 'utf8')).replace('heading="approval-policy"', selector));
      const response = await request.post('/api/projects', { data: { root: hiddenRoot } });
      const project = await response.json();
      await page.goto(`/p/${project.id}?item=order`);
      const pane = page.getByRole('complementary', { name: 'Source workspace', includeHidden: true });
      await page.locator('main [data-reader-card].active .code-links button').first().click();
      const scroller = () => pane.getByLabel(raw ? 'Document source text' : 'Document content', { exact: true });
      const target = () => pane.locator(raw ? '[data-source-line="163"]' : '[data-heading="distant-section"]');
      await expect(scroller()).toBeVisible();
      await pane.getByRole('button', { name: 'Close source pane' }).click();
      await page.reload();
      await expect(scroller()).toBeAttached();
      await expect(pane).toBeHidden();
      await page.getByRole('button', { name: 'Toggle source workspace' }).click();
      await expect(scroller()).toBeVisible();
      await expect.poll(async () => {
        const box = await target().boundingBox(), viewport = await scroller().boundingBox();
        return box && viewport ? Math.abs(box.y - viewport.y - 16) : Infinity;
      }).toBeLessThan(3);
      if (raw) await expect(target().locator('code')).toHaveText('## Distant section');
      // Once initialized, reopening must preserve the user's subsequent scroll.
      const readingPosition = await scroller().evaluate(el => { el.scrollTop += 300; return el.scrollTop; });
      await pane.getByRole('button', { name: 'Close source pane' }).click();
      await page.getByRole('button', { name: 'Toggle source workspace' }).click();
      await expect.poll(() => scroller().evaluate(el => el.scrollTop)).toBe(readingPosition);
    } finally { await rm(hiddenRoot, { recursive: true, force: true }); }
  });
}

test('code and document links to the same path have independent selection and readers', async ({ page, request }) => {
  const taxonomyRoot = await mkdtemp(join(tmpdir(), 'lexicon-kind-browser-'));
  try {
    await cp(root, taxonomyRoot, { recursive: true });
    const file = join(taxonomyRoot, 'lexicon/model.xml');
    await writeFile(file, (await readFile(file, 'utf8')).replace('<code-link kind="code" id="representation"',
      '<code-link kind="document" id="interface-document" file="order.ts" role="reference">Discusses the interface as documentary text.</code-link><code-link kind="code" id="representation"'));
    const response = await request.post('/api/projects', { data: { root: taxonomyRoot } });
    const project = await response.json();
    await page.goto(`/p/${project.id}?item=order`);
    const pane = page.getByRole('complementary', { name: 'Source workspace' });
    const links = page.locator('main [data-reader-card].active .code-links button');
    for (let i = 0; i < 2; i++) {
      await links.filter({ has: page.getByRole('img', { name: 'Document', exact: true }) }).filter({ hasText: 'reference' }).click();
      await expect(pane.getByLabel('Document source text')).toContainText('export interface Order');
      await expect(pane.getByLabel('Source code', { exact: true })).toHaveCount(0);
      await expect(pane.locator('.tok-keyword')).toHaveCount(0);
      await expect(page.locator('main [data-reader-card].active .code-links button.selected')).toHaveCount(1);
      const documentTarget = new URL(page.url()).searchParams.get('code');
      await links.filter({ has: page.getByRole('img', { name: 'Code', exact: true }) }).filter({ hasText: 'representation' }).click();
      await expect(pane.getByLabel('Source code', { exact: true })).toContainText('export interface Order');
      await expect(pane.getByLabel('Document source text')).toHaveCount(0);
      expect(await pane.locator('.tok-keyword').count()).toBeGreaterThan(0);
      expect(new URL(page.url()).searchParams.get('code')).not.toBe(documentTarget);
      await expect(page.locator('main [data-reader-card].active .code-links button.selected')).toHaveCount(1);
    }
  } finally { await rm(taxonomyRoot, { recursive: true, force: true }); }
});
