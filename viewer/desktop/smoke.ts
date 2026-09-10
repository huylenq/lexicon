import { _electron as electron, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temp = await mkdtemp(join(tmpdir(), 'lexicon-desktop-test-'));
const project = join(temp, 'project');
const desktop = import.meta.dirname;
const live = process.env.LEXICON_DESKTOP_LIVE_CODEX === '1';
const fixture = join(desktop, '../tests/fixtures/agent.ts');
await mkdir(join(project, 'lexicon'), { recursive: true });
await writeFile(join(project, 'order.ts'), 'export class Order { total = 42; }\n');
await writeFile(join(project, 'lexicon/model.xml'), `<lexicon schema="2.0" id="desktop-test"><name>Desktop test</name><description>Packaged source navigation.</description><context id="sales"><name>Sales</name><description>Order handling.</description><concept id="order"><name>Order</name><description>A purchase.</description><code-link file="order.ts" symbol="Order" role="definition">The order implementation.</code-link></concept><concept id="line"><name>Line</name><description>A purchased item.</description></concept></context><relationship id="contains" from="order" to="line"><name>contains</name><description>An order contains lines.</description></relationship></lexicon>`);
const executablePath = process.env.LEXICON_DESKTOP_EXECUTABLE || join(desktop, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const launch = () => electron.launch({ executablePath, args: process.env.LEXICON_DESKTOP_EXECUTABLE ? [] : [desktop],
  env: { ...process.env, LEXICON_DESKTOP_DATA: join(temp, 'data'), ...(live ? {} : { LEXICON_CODEX_BIN: fixture, LEXICON_GROK_BIN: fixture, LEXICON_CLAUDE_BIN: fixture }) }, timeout: 30000 });
let instance = await launch();
try {
  const page = await instance.firstWindow();
  page.on('dialog', dialog => void dialog.accept().catch(() => {}));
  await expect(page.getByRole('heading', { name: /Find the meaning/ })).toBeVisible();
  expect(page.url()).toBe('lexicon://app/');
  expect(await page.evaluate(() => typeof window.lexiconDesktop?.getUpdate)).toBe('function');
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  await instance.evaluate(({ Menu, dialog, shell }) => {
    const original = globalThis.fetch;
    globalThis.fetch = ((input: any, init: any) => String(input).includes('api.github.com/repos/huylenq/lexicon/releases/latest')
      ? Promise.resolve(Response.json({ tag_name: 'v99.0.0', draft: false, prerelease: false })) : original(input, init)) as typeof fetch;
    (globalThis as any).openedRelease = null;
    shell.openExternal = async (url: string) => { (globalThis as any).openedRelease = url; };
    dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as any;
    Menu.getApplicationMenu()!.items[0].submenu!.items.find(item => item.label === 'Check for Updates…')!.click();
  });
  await expect.poll(async () => {
    await instance.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items[0].submenu!.items.find(item => item.label === 'Check for Updates…')!.click());
    return page.evaluate(async () => (await window.lexiconDesktop!.getUpdate())?.version);
  }, { timeout: 15000 }).toBe('99.0.0');
  await expect(page.getByRole('complementary', { name: 'Application update' })).toBeVisible();
  await page.getByRole('button', { name: 'View update' }).click();
  await expect.poll(() => instance.evaluate(() => (globalThis as any).openedRelease)).toBe('https://github.com/huylenq/lexicon/releases/tag/v99.0.0');
  await mkdir(join(desktop, 'dist/qa'), { recursive: true });
  await page.screenshot({ path: join(desktop, 'dist/qa/desktop-update.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(desktop, 'dist/qa/desktop-update-narrow.png') });
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await page.screenshot({ path: join(desktop, 'dist/qa/desktop-update-dark.png') });
  await page.getByRole('button', { name: 'Use light theme' }).click();
  await page.getByRole('button', { name: 'Dismiss update notice' }).click();
  await expect(page.getByRole('complementary', { name: 'Application update' })).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 940 });
  await instance.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as any;
  }, project);
  await page.getByRole('button', { name: 'Choose folder…' }).click();
  await expect(page.getByLabel('Project folder')).toHaveValue(project);
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByRole('link', { name: /Desktop test/ }).click();
  await expect(page.getByRole('region', { name: 'Model canvas' })).toBeVisible();
  await page.getByRole('button', { name: 'Concept Order', exact: true }).click();
  await page.getByRole('button', { name: /order.ts/ }).first().click();
  await expect(page.getByText('export class Order', { exact: false }).first()).toBeVisible();
  const oldClipboard = await instance.evaluate(({ clipboard }) => clipboard.readText());
  try {
    await page.getByRole('button', { name: 'Copy link', exact: true }).click();
    await expect.poll(() => instance.evaluate(({ clipboard }) => clipboard.readText())).toContain('lexicon://app/p/');
  } finally { await instance.evaluate(({ clipboard }, text) => clipboard.writeText(text), oldClipboard); }
  await page.getByRole('button', { name: 'Agent', exact: true }).click();
  const chat = page.getByRole('complementary', { name: 'Project conversation' });
  await chat.getByRole('textbox', { name: 'Message the coding agent' }).fill(live
    ? 'Read order.ts. What is the initial total of Order? Reply with the number and one brief sentence. Do not edit anything.'
    : 'Explain the order.');
  await chat.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(chat.locator('.chat-markdown').last()).toContainText(live ? '42' : 'An order records a purchase', { timeout: 120000 });
  await expect(chat.getByRole('button', { name: 'Send', exact: true })).toBeVisible({ timeout: 30000 });
  expect(await readFile(join(project, 'order.ts'), 'utf8')).toBe('export class Order { total = 42; }\n');
  await page.evaluate(() => localStorage.setItem('desktop-smoke', 'persists'));
  await page.screenshot({ path: join(desktop, 'dist/qa/desktop-reader.png') });
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  await instance.close();
  instance = await launch();
  const reopened = await instance.firstWindow();
  reopened.on('dialog', dialog => void dialog.accept().catch(() => {}));
  await expect(reopened.getByRole('link', { name: /Desktop test/ })).toBeVisible();
  expect(await reopened.evaluate(() => localStorage.getItem('desktop-smoke'))).toBe('persists');
  await reopened.getByRole('link', { name: /Desktop test/ }).click();
  await reopened.getByRole('button', { name: 'Agent', exact: true }).click();
  await expect(reopened.locator('.chat-markdown').last()).toContainText(live ? '42' : 'An order records a purchase');
  await expect(reopened.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  console.log('Desktop smoke passed: update click/dismiss, narrow layout, folder picker, source navigation, clipboard, chat streaming, registry and viewing-state persistence.');
} finally {
  await instance.close();
  await rm(temp, { recursive: true, force: true });
}
