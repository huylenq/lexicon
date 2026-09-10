import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { createServer, loadConfigFromFile } from 'vite';

const desktop = import.meta.dirname;
const viewer = resolve(desktop, '..');
const require = createRequire(import.meta.url);
const electron = require('electron');
const data = process.env.LEXICON_DESKTOP_DATA || join(desktop, '.dev-data');
let vite, child, timer, restarting = false, pending = false, stopping = false;
const watchers = [];
// Own the HTTP listener so HMR knows its available port before Vite transforms any code.
const http = createHttpServer((request, response) => {
  if (vite) vite.middlewares(request, response);
  else { response.writeHead(503); response.end('Starting Lexicon…'); }
});
async function stopShell(reload = false) {
  const previous = child;
  if (!previous || previous.exitCode !== null || previous.signalCode !== null) return;
  await new Promise((done) => {
    const timeout = reload ? undefined : setTimeout(() => previous.kill('SIGKILL'), 5000);
    previous.once('close', () => { clearTimeout(timeout); done(); });
    previous.kill(reload ? 'SIGUSR2' : 'SIGTERM');
  });
}
function startShell(origin) {
  if (stopping) return;
  child = spawn(electron, [
    ...(process.argv.includes('--inspect') ? ['--inspect=0', '--remote-debugging-port=0'] : []), desktop,
  ], { cwd: desktop, stdio: 'inherit', env: { ...process.env,
    LEXICON_DESKTOP_DEV_ORIGIN: origin, LEXICON_DESKTOP_DATA: data,
  } });
  child.on('error', (error) => console.error(`[desktop] ${error.message}`));
  child.once('exit', (code) => {
    if (!stopping && !restarting) console.log(`[desktop] Shell exited (${code}); waiting for a source change. Ctrl-C stops development.`);
  });
  console.log(`[desktop] Shell started (pid ${child.pid}).`);
}
function changed(origin, path) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    pending = true;
    if (restarting) return;
    restarting = true;
    try {
      while (pending && !stopping) {
        console.log(`[desktop] Restarting after ${path}`);
        await stopShell(true);
        pending = false;
        startShell(origin);
      }
    } finally { restarting = false; }
  }, 180);
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  for (const watcher of watchers) watcher.close();
  await stopShell();
  await vite?.close();
  http.closeAllConnections();
  await new Promise((done) => http.close(done));
  process.exit(code);
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
try {
  await new Promise((done, reject) => { http.once('error', reject); http.listen(0, '127.0.0.1', done); });
  const port = http.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, join(viewer, 'client/vite.config.ts'));
  if (!loaded) throw new Error('Could not load the viewer Vite configuration.');
  vite = await createServer({ ...loaded.config, configFile: false,
    server: { ...loaded.config.server, proxy: undefined, middlewareMode: true,
      hmr: { server: http, host: '127.0.0.1', protocol: 'ws', clientPort: port },
    },
  });
  for (const directory of [join(viewer, 'server'), join(viewer, 'shared'), resolve(viewer, '../skills/lexicon'), desktop]) {
    watchers.push(watch(directory, { recursive: directory !== desktop }, (_event, file) => {
      if (!file) return;
      const name = file.toString();
      if (directory === desktop ? !['main.cjs', 'preload.cjs', 'updates.cjs', 'package.json'].includes(name) : !/\.(ts|json|md)$/.test(name)) return;
      changed(origin, name);
    }));
  }
  console.log(`[desktop] UI hot reload at ${origin}; data in ${data}`);
  startShell(origin);
} catch (error) {
  console.error(error);
  await stop(1);
}
