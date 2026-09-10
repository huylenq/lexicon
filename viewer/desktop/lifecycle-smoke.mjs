import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const desktop = import.meta.dirname;
const temp = await mkdtemp(join(tmpdir(), 'lexicon-lifecycle-'));
const target = 'lexicon://app/p/shop?item=order';
const executablePath = process.env.LEXICON_DESKTOP_EXECUTABLE || join(desktop, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const instance = await electron.launch({ executablePath,
  args: [...(process.env.LEXICON_DESKTOP_EXECUTABLE ? [] : [desktop]), target],
  env: { ...process.env, LEXICON_DESKTOP_DATA: temp },
});
let exited = false;
try {
  instance.process().stdout.on('data', chunk => process.stdout.write(chunk));
  instance.process().stderr.on('data', chunk => process.stderr.write(chunk));
  const page = await instance.firstWindow();
  page.on('dialog', dialog => void dialog.dismiss().catch(() => {}));
  await expect(page.getByRole('region', { name: 'Model canvas' })).toBeVisible();
  expect(page.url()).toBe(target);
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  // Exercise the same cancellation contract used by unsaved canvas persistence.
  await page.evaluate(() => {
    window.holdQuit = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', window.holdQuit);
  });
  await instance.evaluate(({ app, BrowserWindow }) => {
    globalThis.prevented = 0;
    BrowserWindow.getAllWindows()[0].webContents.on('will-prevent-unload', () => globalThis.prevented++);
    setTimeout(() => app.quit(), 0);
  });
  await expect.poll(() => instance.evaluate(() => globalThis.prevented)).toBe(1);
  expect(await page.evaluate(async () => (await fetch('/api/health')).status)).toBe(200);
  await page.evaluate(() => window.removeEventListener('beforeunload', window.holdQuit));
  // A saved link delivered by macOS must navigate the running window.
  await instance.evaluate(({ app }) => app.emit('open-url', { preventDefault() {} }, 'lexicon://app/'));
  await expect(page.getByRole('heading', { name: /Find the meaning/ })).toBeVisible();
  for (const invalid of ['https://example.com/', 'lexicon://other/p/shop', 'lexicon://app/api/projects', 'not a URL']) {
    await instance.evaluate(({ app }, url) => app.emit('open-url', { preventDefault() {} }, url), invalid);
    expect(page.url()).toBe('lexicon://app/');
  }
  if (process.env.LEXICON_DESKTOP_EXECUTABLE) {
    await promisify(execFile)('/usr/bin/open', ['-a', resolve(executablePath, '../../..'), target]);
  } else {
    await instance.evaluate(({ app }, url) => app.emit('open-url', { preventDefault() {} }, url), target);
  }
  await expect(page.getByRole('region', { name: 'Model canvas' })).toBeVisible();
  expect(page.url()).toBe(target);
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
  const closed = instance.waitForEvent('close');
  await instance.evaluate(({ app }) => { setTimeout(() => app.quit(), 0); });
  await closed;
  exited = true;
  console.log('Lifecycle smoke passed: cancelled quit keeps API alive, clean quit exits, cold and running-app links navigate, invalid links are ignored.');
} finally {
  if (!exited) await instance.close();
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
