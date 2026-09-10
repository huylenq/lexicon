import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const temp = await mkdtemp(join(tmpdir(), 'lexicon-titlebar-'));
const instance = await electron.launch({ executablePath: join(import.meta.dirname, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [import.meta.dirname], env: { ...process.env, LEXICON_DESKTOP_DATA: temp } });
try {
 const page = await instance.firstWindow();
 page.on('dialog', d => void d.accept().catch(() => {}));
 await expect(page.locator('.library-header')).toBeVisible();
 await mkdir('dist/qa', {recursive:true});
 for (const width of [1440, 390]) {
  await instance.evaluate(({BrowserWindow}, width) => BrowserWindow.getAllWindows()[0].setSize(width, 844), width);
  for (const route of ['/', '/p/dentalml?item=selected-tooth']) {
   await instance.evaluate(({app}, route) => app.emit('open-url', {preventDefault() {}}, 'lexicon://app' + route), route);
   await expect(page.locator('.app-header')).toBeVisible();
   if (route !== '/') await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
   expect(await page.locator('.app-header').evaluate(e => getComputedStyle(e).getPropertyValue('-webkit-app-region'))).toBe('drag');
   for (const button of await page.locator('.app-header button:visible, .app-header a:visible').all()) {
    expect(await button.evaluate(e => getComputedStyle(e).getPropertyValue('-webkit-app-region'))).toBe('no-drag');
    expect((await button.boundingBox()).x).toBeGreaterThanOrEqual(88);
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
   await page.getByRole('button', {name:'Use dark theme'}).click();
   await page.screenshot({path:`dist/qa/titlebar-${width}-${route === '/' ? 'library' : 'reader'}.png`});
   await page.getByRole('button', {name:'Use light theme'}).click();
  }
 }
 console.log('Titlebar checks passed: reserved native control area, drag regions, clickable theme controls, wide and narrow library/reader layouts.');
} finally {
 await instance.evaluate(({app}) => app.exit(0)).catch(() => {});
 await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200}); }
