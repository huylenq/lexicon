import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, expect } from '@playwright/test';

const desktop = import.meta.dirname;
const viewer = resolve(desktop, '..');
const temp = await mkdtemp(join(tmpdir(), 'lexicon-hmr-'));
const changedFiles = new Map();
let log = '', browser;
const development = spawn(process.execPath, [join(desktop, 'dev.mjs'), '--inspect'], {
  cwd: desktop, env: { ...process.env, LEXICON_DESKTOP_DATA: temp }, stdio: ['ignore', 'pipe', 'pipe'],
});
for (const stream of [development.stdout, development.stderr]) stream.on('data', chunk => { log += chunk; });
const shellPids = () => [...log.matchAll(/Shell started \(pid (\d+)\)/g)].map(match => Number(match[1]));
const endpoints = () => [...log.matchAll(/DevTools listening on (ws:\/\/\S+)/g)].map(match => match[1]);
async function connectAfter(count) {
  await expect.poll(() => endpoints().length, { timeout: 30000 }).toBeGreaterThan(count);
  await browser?.close().catch(() => {});
  browser = await chromium.connectOverCDP(endpoints().at(-1));
  await expect.poll(() => browser.contexts()[0]?.pages().length ?? 0, { timeout: 30000 }).toBeGreaterThan(0);
  const page = browser.contexts()[0].pages()[0];
  page.on('dialog', dialog => void dialog.accept().catch(() => {}));
  await expect(page.locator('.brand')).toBeVisible({ timeout: 30000 });
  return page;
}
async function edit(file, transform) {
  const path = join(viewer, file);
  const current = await readFile(path, 'utf8');
  const next = transform(current);
  if (next === current) throw new Error(`No test edit in ${file}`);
  changedFiles.set(path, { original: changedFiles.get(path)?.original ?? current, written: next });
  await writeFile(path, next);
}
try {
  let page = await connectAfter(0);
  await expect(page.getByRole('heading', { name: /Find the meaning/ })).toBeVisible();
  await page.getByLabel('Project folder').fill('/kept/during/hmr');
  await page.evaluate(() => { window.hmrWitness = 'same document'; localStorage.setItem('dev-smoke', 'saved'); });
  const firstPid = shellPids().at(-1);
  await edit('client/src/Library.tsx', source => source.replace('Find the meaning', 'Meaning updates live'));
  await expect(page.getByRole('heading', { name: /Meaning updates live/ })).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel('Project folder')).toHaveValue('/kept/during/hmr');
  expect(await page.evaluate(() => window.hmrWitness)).toBe('same document');
  expect(shellPids().at(-1)).toBe(firstPid);
  await edit('client/src/styles/desktop.css', source => source + '\n.brand { outline: 3px solid rgb(13, 73, 131) !important; }\n');
  await expect(page.locator('.brand')).toHaveCSS('outline-color', 'rgb(13, 73, 131)');
  expect(shellPids().at(-1)).toBe(firstPid);
  await mkdir(join(desktop, 'dist/qa'), { recursive: true });
  await page.screenshot({ path: join(desktop, 'dist/qa/desktop-hmr.png') });
  console.log('React and CSS update without reloading the document or losing input.');

  await page.goto('lexicon://app/p/dentalml?item=selected-tooth');
  await expect(page.getByRole('region', { name: 'Model canvas' })).toBeVisible();
  const location = page.url();
  let count = endpoints().length;
  await page.evaluate(() => {
    window.holdRestart = event => event.preventDefault();
    window.addEventListener('beforeunload', window.holdRestart);
  });
  await edit('server/index.ts', source => source.replace('ok: true, model: MODEL_SCHEMA', 'ok: true, model: "hmr-verified"'));
  await expect.poll(() => log.includes('Waiting for canvas edits to save'), { timeout: 10000 }).toBe(true);
  expect(endpoints().length).toBe(count);
  await page.evaluate(() => window.removeEventListener('beforeunload', window.holdRestart));
  page = await connectAfter(count);
  await expect.poll(() => page.url()).toBe(location);
  expect(await page.evaluate(async () => (await (await fetch('/api/health')).json()).model)).toBe('hmr-verified');
  expect(await page.evaluate(() => localStorage.getItem('dev-smoke'))).toBe('saved');
  console.log('Backend restarts and serves changed code; the open project and viewing state survive.');

  count = endpoints().length;
  await edit('desktop/preload.cjs', source => source.replace('  getUpdate:', '  devSmoke: "reloaded",\n  getUpdate:'));
  page = await connectAfter(count);
  expect(await page.evaluate(() => window.lexiconDesktop.devSmoke)).toBe('reloaded');
  expect(page.url()).toBe(location);
  count = endpoints().length;
  await edit('desktop/main.cjs', source => source + '\nconsole.log("Desktop shell source reloaded.");\n');
  page = await connectAfter(count);
  expect(log).toContain('Desktop shell source reloaded.');
  expect(page.url()).toBe(location);
  console.log('Preload and main-process edits restart the shell automatically.');
} finally {
  await browser?.close().catch(() => {});
  development.kill('SIGTERM');
  await new Promise((done) => {
    if (development.exitCode !== null || development.signalCode !== null) return done();
    const timeout = setTimeout(() => development.kill('SIGKILL'), 10000);
    development.once('close', () => { clearTimeout(timeout); done(); });
  });
  for (const [path, { original, written }] of changedFiles) {
    if (await readFile(path, 'utf8') === written) await writeFile(path, original);
    else console.error(`Concurrent edit retained: ${path}`);
  }
  await rm(temp, { recursive: true, force: true });
}
expect(development.exitCode).toBe(0);
for (const pid of shellPids()) expect(() => process.kill(pid, 0)).toThrow();
console.log('Desktop hot-reload smoke passed; all shell processes stopped.');
