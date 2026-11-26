// Service worker: makes the app work offline.
// - app files: fresh from the network when online, from the cache when offline
// - AI runtime from cdn.jsdelivr.net: cached on first use (model weights are cached by Transformers.js itself)
const VERSION = 'v8'; // bump together with APP_VERSION in version.js
const APP_CACHE = `app-${VERSION}`;
const CDN_CACHE = 'cdn-v1';
const APP_FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'worker.js', 'translate.js', 'models.js', 'version.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/';
const CDN_FILES = [LIB + 'transformers.min.js', LIB + 'ort-wasm-simd-threaded.jsep.mjs', LIB + 'ort-wasm-simd-threaded.jsep.wasm'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const app = await caches.open(APP_CACHE);
    await app.addAll(APP_FILES);
    // best effort: pre-download the AI runtime so it is available offline
    const cdn = await caches.open(CDN_CACHE);
    await Promise.all(CDN_FILES.map(async (u) => {
      if (await cdn.match(u)) return;
      try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await cdn.put(u, r); } catch {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('app-') && key !== APP_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith((async () => {
      const cache = await caches.open(CDN_CACHE);
      const hit = await cache.match(req, { ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    // network first, so updates arrive right away; cached copy when offline
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match(req, { ignoreSearch: true }))
          || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
      }
    })());
  }
});
