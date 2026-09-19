import { _electron as electron, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temp = await mkdtemp(join(tmpdir(), 'lexicon-desktop-test-'));
const project = join(temp, 'project');
const desktop = import.meta.dirname;
const live = process.env.LEXICON_DESKTOP_LIVE_CODEX === '1';
await mkdir(join(project, 'lexicon'), { recursive: true });
await writeFile(join(project, 'order.ts'), 'export class Order { total = 42; }\n');
await writeFile(join(project, 'lexicon/model.xml'), `<lexicon schema="3.3" id="desktop-test"><name>Desktop test</name><description>Packaged source navigation.</description><context id="sales"><name>Sales</name><description>Order handling.</description><concept id="order"><name>Order</name><description>A purchase.</description><code-link kind="code" file="order.ts" symbol="Order" role="definition">The order implementation.</code-link></concept><concept id="line"><name>Line</name><description>A purchased item.</description></concept></context><relationship id="contains" from="order" to="line"><name>contains</name><description>An order contains lines.</description></relationship></lexicon>`);
const executablePath = process.env.LEXICON_DESKTOP_EXECUTABLE || join(desktop, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const launch = () => electron.launch({ executablePath, args: process.env.LEXICON_DESKTOP_EXECUTABLE ? [] : [desktop],
  env: { ...process.env, LEXICON_DESKTOP_DATA: join(temp, 'data') }, timeout: 30000 });
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
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  const chat = page.locator('#chat-pane');
  await expect(chat.getByRole('combobox', { name: 'Editing scope' })).toHaveValue('model');
  await expect(chat.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  if (live) {
    const url = process.env.LEXICON_DESKTOP_T3_URL, token = process.env.LEXICON_DESKTOP_T3_TOKEN;
    if (!url || !token) throw new Error('Live desktop testing requires an isolated T3 URL and pairing token.');
    await chat.getByLabel('T3 server').fill(url);
    await chat.getByLabel('Pairing token').fill(token);
    await chat.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(chat.getByRole('combobox', { name: 'Agent model' })).not.toHaveValue('');
    await chat.getByRole('textbox', { name: 'Message the agent' }).fill('Read order.ts. What is the initial total of Order? Reply with the number and one brief sentence. Do not edit anything.');
    await chat.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(chat.locator('.chat-message-body').last()).toContainText('42', { timeout: 120000 });
    await expect(chat.getByRole('button', { name: 'Send', exact: true })).toBeVisible({ timeout: 30000 });
  }
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
  await reopened.locator('.agent-session-button').first().click();
  if (live) await expect(reopened.locator('.chat-message-body').last()).toContainText('42');
  else await expect(reopened.getByLabel('Pairing token')).toBeVisible();
  await expect(reopened.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  console.log('Desktop smoke passed: update click/dismiss, narrow layout, folder picker, source navigation, clipboard, agent connection UI (streaming when live), registry and viewing-state persistence.');
} finally {
  await instance.close();
  await rm(temp, { recursive: true, force: true });
}
