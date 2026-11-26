// Desktop (Windows) wrapper: shows the web app in its own window, fully offline.
// The app, the AI runtime and the CLIP model all live in ./app and are served over a private
// app:// protocol. Every request to the internet is blocked, so nothing can leave the computer.
const { app, BrowserWindow, protocol, net, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, 'app');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

// No traces on disk: everything the built-in browser writes (settings, caches, GPU cache, logs,
// crash reports) goes to a temporary folder that is deleted when the program closes.
// Leftovers from a run that did not close cleanly (power cut, crash) are removed on the next start.
const TEMP_PREFIX = 'szukaj-w-filmie-';
function removeDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {}
}
for (const name of fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(TEMP_PREFIX))) {
  removeDir(path.join(os.tmpdir(), name)); // a folder still used by another running copy is locked and stays
}
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
for (const name of ['userData', 'sessionData', 'logs', 'crashDumps']) app.setPath(name, path.join(TEMP_DIR, name));
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disk-cache-size', '1');
// On quit, start a tiny detached cleaner (this same executable in Node mode) that waits until the
// program has fully exited and released its files, then deletes the temporary folder.
let cleanerStarted = false;
function startCleaner() {
  if (cleanerStarted) return;
  cleanerStarted = true;
  const script = `
    const fs = require('fs');
    const [dir, pid] = [process.argv[1], Number(process.argv[2])];
    const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
    const started = Date.now();
    (function tick() {
      if (alive() && Date.now() - started < 60000) return setTimeout(tick, 300);
      try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 }); } catch {}
    })();`;
  try {
    require('node:child_process').spawn(process.execPath, ['-e', script, TEMP_DIR, String(process.pid)], {
      detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    }).unref();
  } catch {}
}
app.on('will-quit', startCleaner);
process.on('exit', () => removeDir(TEMP_DIR)); // best effort; the cleaner finishes the job

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);


app.whenReady().then(() => {
  protocol.handle('app', async (req) => {
    const pathname = decodeURIComponent(new URL(req.url).pathname);
    const file = path.normalize(path.join(ROOT, pathname === '/' ? 'index.html' : pathname));
    if (!file.startsWith(ROOT)) return new Response('Forbidden', { status: 403 });
    const res = await net.fetch(pathToFileURL(file).toString());
    if (!res.ok) return new Response('Not found', { status: 404 });
    return new Response(res.body, {
      headers: {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        // cross-origin isolation lets the AI use several CPU cores (multi-threaded WebAssembly)
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });
  });

  // Offline guarantee: block any http(s)/ws traffic from the app.
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (_details, cb) => cb({ cancel: true }),
  );

  const win = new BrowserWindow({
    width: 1100,
    height: 900,
    title: 'Szukaj w filmie',
    icon: path.join(ROOT, 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
    backgroundColor: '#0f1216',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL('app://local/index.html');
});

app.on('window-all-closed', () => app.quit());
