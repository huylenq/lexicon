const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell, protocol, net } = require('electron');
const { spawn, execFile } = require('node:child_process');
const { createInterface } = require('node:readline');
const { randomBytes } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const { mkdir, copyFile, access, cp } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { homedir } = require('node:os');
const { checkRelease, RELEASES_URL } = require('./updates.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'lexicon', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
app.setName('Lexicon');
// Explicit override is useful for isolated QA; production uses Electron's app-data folder.
if (process.env.LEXICON_DESKTOP_DATA) app.setPath('userData', resolve(process.env.LEXICON_DESKTOP_DATA));
let window, backend, origin, notice = null, checking, quitting = false, stopped = false;
let backendError = '';
let pendingURL = process.argv.find(validLink);
// macOS delivers links before ready on a cold launch.
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (!validLink(url)) return;
  if (window) openLink(url);
  else pendingURL = url;
});
const token = randomBytes(32).toString('hex');
const root = app.isPackaged ? join(process.resourcesPath, 'backend') : resolve(__dirname, '../..');
const bun = app.isPackaged ? join(root, 'bin/bun') : (process.env.LEXICON_BUN_BIN || 'bun');
const viewer = join(root, 'viewer');
const devOrigin = !app.isPackaged && process.env.LEXICON_DESKTOP_DEV_ORIGIN;
if (devOrigin && !/^http:\/\/127\.0\.0\.1:\d+$/.test(devOrigin)) throw new Error('Desktop development requires a loopback Vite server.');
const devStatePath = join(app.getPath('userData'), 'dev-window.json');
let devState;
if (devOrigin) {
  try { devState = JSON.parse(readFileSync(devStatePath, 'utf8')); } catch {}
  let waitingForSave = false;
  process.on('SIGUSR2', async () => {
    if (waitingForSave) return;
    waitingForSave = true;
    let announced = false;
    // Let existing persistence handlers cache/flush state without opening a native dialog.
    // A cancelled event means the canvas still has edits that have not reached disk.
    while (window && !window.isDestroyed() && !quitting) {
      try {
        if (await window.webContents.executeJavaScript("window.dispatchEvent(new Event('beforeunload', { cancelable: true }))")) break;
      } catch { break; }
      if (!announced) console.log('[desktop] Waiting for canvas edits to save before restarting.');
      announced = true;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    app.quit();
  });
  process.on('SIGTERM', () => app.quit());
  process.on('SIGINT', () => app.quit());
}


async function launchPath() {
  // Finder does not inherit interactive shell PATH (version managers often set it there).
  const shellPath = await new Promise((resolvePath) => {
    execFile(process.env.SHELL || '/bin/zsh', ['-ilc', 'printf "\\nLEXICON_PATH=%s\\n" "$PATH"'],
      { timeout: 3000, maxBuffer: 128 * 1024 }, (_error, stdout) => {
        resolvePath(stdout?.split('\n').find((line) => line.startsWith('LEXICON_PATH='))?.slice(13) || '');
      });
  });
  return [shellPath, process.env.PATH, join(homedir(), '.local/bin'), join(homedir(), '.bun/bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].filter(Boolean).join(':');
}

async function startBackend() {
  const data = app.getPath('userData');
  const examples = join(data, 'examples');
  for (const name of ['dentalml', 'shop']) {
    const model = join(examples, name, 'lexicon/model.xml');
    await mkdir(join(examples, name, 'lexicon'), { recursive: true });
    try { await access(model); } catch {
      await copyFile(join(viewer, 'examples', name, 'lexicon/model.xml'), model);
    }
  }
  await cp(join(viewer, 'examples/shop/src'), join(examples, 'shop/src'), { recursive: true, force: false });
  backend = spawn(bun, ['run', join(viewer, 'server/desktop.ts')], {
    cwd: viewer,
    env: { ...process.env, PATH: await launchPath(), LEXICON_VIEWER_DB: join(data, 'lexicon-viewer.db'),
      LEXICON_DESKTOP_TOKEN: token, LEXICON_EXAMPLES_ROOT: examples },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  backend.stderr.on('data', (chunk) => { backendError = (backendError + chunk).slice(-6000); });
  backend.stdin.on('error', () => {});
  backend.once('exit', () => {
    if (origin && !quitting) {
      dialog.showErrorBox('Lexicon stopped', `The local server stopped. Reopen Lexicon to continue.\n\n${backendError}`);
      app.quit();
    }
  });
  const port = await new Promise((resolvePort, reject) => {
    const timeout = setTimeout(() => finish(new Error(`Server startup timed out.\n${backendError}`)), 20000);
    const lines = createInterface({ input: backend.stdout });
    const fail = (error) => finish(error);
    const exited = (code) => finish(new Error(`Server exited (${code}).\n${backendError}`));
    function finish(error, port) {
      clearTimeout(timeout); lines.close(); backend.off('error', fail); backend.off('exit', exited);
      error ? reject(error) : resolvePort(port);
    }
    backend.once('error', fail); backend.once('exit', exited);
    lines.on('line', (line) => {
      try {
        const ready = JSON.parse(line);
        if (ready.type === 'lexicon-ready' && Number.isInteger(ready.port) && ready.port > 0 && ready.port < 65536)
          finish(null, ready.port);
      } catch {}
    });
  });
  origin = `http://127.0.0.1:${port}`;
  const health = await fetch(`${origin}/api/health`, { headers: { 'x-lexicon-desktop-token': token }, signal: AbortSignal.timeout(5000) });
  if (!health.ok) throw new Error('The local server did not become ready.');
}

async function checkUpdates(manual = false) {
  try {
    checking ||= checkRelease(app.getVersion()).finally(() => { checking = null; });
    notice = await checking;
    if (notice) window?.webContents.send('lexicon:update-available', notice);
    if (manual) {
      const result = await dialog.showMessageBox(window, notice ? {
        type: 'info', message: `Lexicon ${notice.version} is available`,
        detail: 'Download the new version and replace Lexicon in Applications. Your library and conversations stay on this computer.',
        buttons: ['Open download page', 'Later'], cancelId: 1,
      } : { type: 'info', message: 'No newer public release is available', detail: `You are running Lexicon ${app.getVersion()}.`, buttons: ['OK'] });
      if (notice && result.response === 0) await shell.openExternal(notice.url);
    }
  } catch (error) {
    if (manual) await dialog.showMessageBox(window, { type: 'info', message: 'Could not check for updates', detail: 'Try again when connected, or visit the Lexicon releases page.', buttons: ['OK'] });
    console.warn(error.message);
  }
}
function appURL(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'lexicon:' && parsed.host === 'app' && !parsed.username && !parsed.password;
  } catch { return false; }
}
function validLink(url) {
  if (!appURL(url)) return false;
  return /^\/(?:p\/[^/]+)?$/.test(new URL(url).pathname);
}
function openLink(url) {
  if (!validLink(url) || !window || quitting) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  // Use the reader's normal navigation path, preserving its persistence handlers.
  const target = new URL(url);
  const route = target.pathname + target.search + target.hash;
  void window.webContents.executeJavaScript(`history.pushState(null, '', ${JSON.stringify(route)}); window.dispatchEvent(new PopStateEvent('popstate'));`)
    .catch(error => console.warn('Could not open link:', error.message));
}
function trusted(event) {
  return window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame
    && appURL(event.senderFrame.url);
}
function handle(channel, callback) {
  ipcMain.handle(channel, (event) => {
    if (!trusted(event)) throw new Error('Untrusted window.');
    return callback();
  });
}
function openWeb(url) {
  try { if (['https:', 'http:'].includes(new URL(url).protocol)) void shell.openExternal(url); } catch {}
}
function createWindow() {
  window = new BrowserWindow({ width: 1440, height: 940, minWidth: 390, minHeight: 600,
    ...(devOrigin && devState?.bounds ? devState.bounds : {}),
    titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 17 },
    title: 'Lexicon', backgroundColor: '#f7f5f0', show: false,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => { openWeb(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => {
    if (!appURL(url)) { event.preventDefault(); openWeb(url); }
  });
  window.on('close', () => {
    if (devOrigin) {
      try { writeFileSync(devStatePath, JSON.stringify({ url: window.webContents.getURL(), bounds: window.getBounds() })); }
      catch (error) { console.warn('Could not save development window:', error.message); }
    }
  });
  window.on('closed', () => { window = null; });
  const initialURL = pendingURL || (devOrigin && validLink(devState?.url) ? devState.url : 'lexicon://app/');
  pendingURL = undefined;
  void window.loadURL(initialURL);

}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find(validLink);
    if (url) { if (window) openLink(url); else pendingURL = url; }
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });
  app.on('window-all-closed', () => app.quit());
  // Only stop the backend after every window has accepted closing. A cancelled
  // beforeunload leaves the API available so pending edits can still be saved.
  app.on('will-quit', (event) => {
    quitting = true;
    if (stopped || !backend || backend.exitCode !== null || backend.signalCode !== null) return;
    event.preventDefault();
    backend.stdin.end();
    const timeout = setTimeout(() => backend.kill('SIGKILL'), 4000);
    backend.once('close', () => { clearTimeout(timeout); stopped = true; app.quit(); });
  });
  app.whenReady().then(async () => {
    await startBackend();
    const ses = session.defaultSession;
    ses.setPermissionRequestHandler((contents, permission, callback) =>
      callback(permission === 'clipboard-sanitized-write' && appURL(contents.getURL())));
    ses.setPermissionCheckHandler((contents, permission) =>
      permission === 'clipboard-sanitized-write' && !!contents && appURL(contents.getURL()));
    // A stable app origin preserves local viewing state across backend port changes.
    // The renderer never receives the API secret or the backend address.
    protocol.handle('lexicon', async (request) => {
      if (!appURL(request.url)) return new Response('Unknown app host', { status: 403 });
      const url = new URL(request.url);
      const headers = new Headers(request.headers);
      headers.delete('origin');
      const api = url.pathname === '/api' || url.pathname.startsWith('/api/');
      if (api) headers.set('x-lexicon-desktop-token', token);
      return net.fetch(`${devOrigin && !api ? devOrigin : origin}${url.pathname}${url.search}`, {
        method: request.method, headers, redirect: 'error',
        ...(['GET', 'HEAD'].includes(request.method) ? {} : { body: await request.arrayBuffer() }),
      });
    });
    handle('lexicon:update', () => notice);
    handle('lexicon:open-update', () => notice ? shell.openExternal(notice.url) : undefined);
    handle('lexicon:choose-folder', async () => {
      const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'], title: 'Choose a project folder' });
      return result.canceled ? null : result.filePaths[0];
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Lexicon', submenu: [{ role: 'about' }, { label: 'Check for Updates…', click: () => void checkUpdates(true) }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
      { role: 'help', submenu: [{ label: 'Lexicon Releases', click: () => void shell.openExternal(RELEASES_URL) }] },
    ]));
    createWindow();
    if (!devOrigin) {
      void checkUpdates();
      setInterval(() => void checkUpdates(), 6 * 60 * 60 * 1000).unref();
    }
  }).catch((error) => { dialog.showErrorBox('Could not open Lexicon', error.message); app.quit(); });
}
