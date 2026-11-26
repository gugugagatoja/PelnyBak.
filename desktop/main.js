// Desktop (Windows) wrapper: shows the web app in its own window, fully offline.
// The app, the AI runtime and the CLIP model all live in ./app and are served over a private
// app:// protocol. Every request to the internet is blocked, so nothing can leave the computer.
const { app, BrowserWindow, protocol, net, session, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, 'app');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

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
