// End-to-end check of the app in headless Chromium (Playwright).
// Usage: node tests/e2e.mjs <test-video> [transformers-dist-dir] [screenshot-dir]
//  - Part 1 uses a fake AI engine (colour-based) to test video analysis, search and results UI.
//  - Part 2 (if a local copy of @huggingface/transformers/dist is given) checks that the real
//    worker loads the AI library; model download is expected to fail without internet access.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [videoPath, libDir, shotDir] = process.argv.slice(2);
const cctvPath = process.env.CCTV_VIDEO; // optional: static scene with something red passing at 8-12 s
if (!videoPath) { console.error('usage: node tests/e2e.mjs <video> [libDir] [shotDir]'); process.exit(2); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = p.endsWith('/') ? path.join(p, 'index.html') : p;
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; };

const browser = await chromium.launch();

// ---------- Part 1: fake engine ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    const COLORS = { red: [1, 0, 0], green: [0, 1, 0], blue: [0, 0, 1] };
    const norm = (v) => { const n = Math.hypot(...v) || 1; return Float32Array.from(v, (x) => x / n); };
    window.__createTestEngine = () => ({
      load: async (cb) => { cb?.(1, 1); },
      embedImage: async (img) => {
        let r = 0, g = 0, b = 0; const d = img.data;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        return norm([r, g, b]);
      },
      embedTexts: async (texts) => texts.map((t) => {
        const hit = Object.keys(COLORS).find((c) => t.includes(c));
        return norm(hit ? COLORS[hit] : [1, 1, 1]);
      }),
    });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('pageerror', e.message); failures++; });
  await page.goto(base);
  await page.setInputFiles('#file', videoPath);
  await page.waitForSelector('#analyze:not([disabled])');
  await page.click('#analyze');
  await page.waitForFunction(() => document.getElementById('analyze-status').textContent.startsWith('Gotowe'), null, { timeout: 60000 });
  const status = await page.textContent('#analyze-status');
  check(/sprawdzono 1[12] klatek/.test(status), `analysis finished: "${status}"`);

  await page.fill('#query', 'osoba w czerwonej czapce, która odchodzi');
  const en = await page.inputValue('#query-en');
  check(en === 'person in red hat, walking away, seen from behind', `translation: "${en}"`);
  await page.click('#search');
  await page.waitForSelector('#results li');
  const first = await page.textContent('#results li .time');
  check(/0:0[0-3]/.test(first), `"red" found at start of video: ${first}`);
  check((await page.$$('#results li')).length === 1 || !/0:00/.test(await page.textContent('#results li:nth-child(2) .time')), 'results do not overlap');
  if (shotDir) await page.screenshot({ path: path.join(shotDir, 'results-red.png'), fullPage: true });

  await page.fill('#query', 'zielony samochód');
  check((await page.inputValue('#query-en')) === 'green car', 'translation of "zielony samochód"');
  await page.click('#search');
  await page.waitForFunction(() => /0:(0[89]|1[01])/.test(document.querySelector('#results li .time')?.textContent || ''));
  check(true, `"green" found at end of video: ${await page.textContent('#results li .time')}`);

  await page.click('#results li');
  const t = await page.evaluate(() => document.getElementById('video').currentTime);
  check(t >= 7 && t <= 11, `clicking result seeks video (t=${t.toFixed(1)})`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'no horizontal scroll at phone width');

  if (cctvPath) {
    await page.setInputFiles('#file', cctvPath);
    await page.waitForSelector('#analyze:not([disabled])');
    await page.click('#analyze');
    await page.waitForFunction(() => document.getElementById('analyze-status').textContent.startsWith('Gotowe'), null, { timeout: 60000 });
    const st = await page.textContent('#analyze-status');
    const m = st.match(/AI obejrzało (\d+) z ruchem/);
    check(m && +m[1] <= 8, `motion filter skips the still parts: "${st}"`);
    await page.fill('#query', 'czerwony przechodzący człowiek');
    await page.click('#search');
    await page.waitForFunction(() => /0:(0[7-9]|1[0-2])/.test(document.querySelector('#results li .time')?.textContent || ''));
    check(true, `passer-by found: ${await page.textContent('#results li .time')}`);
  }
  await ctx.close();
}

// ---------- Part 2: real worker + library ----------
if (libDir) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/**', (route) => {
    const file = path.join(libDir, path.basename(new URL(route.request().url()).pathname));
    if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
    route.fulfill({ body: fs.readFileSync(file), contentType: types[path.extname(file)] || 'application/octet-stream',
      headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  const modelRequests = [];
  ctx.on('request', (r) => { if (r.url().includes('huggingface.co')) modelRequests.push(r.url()); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('pageerror', e.message); failures++; });
  await page.goto(base);
  await page.setInputFiles('#file', videoPath);
  await page.waitForSelector('#analyze:not([disabled])');
  await page.click('#analyze');
  await page.waitForFunction(() => /błąd|gotowy/.test(document.getElementById('model-status').textContent), null, { timeout: 60000 });
  const hint = await page.textContent('#model-hint');
  console.log('  model hint:', hint);
  check(!/import|module|Failed to fetch dynamically/i.test(hint), 'worker loaded the AI library (only the model download may fail offline)');
  console.log('  model requests:', modelRequests.slice(0, 4).join(', '));
  check(modelRequests.some((u) => u.includes('Xenova/clip-vit-base-patch32')), 'library requested the CLIP model files');
  check(await page.isEnabled('#analyze'), 'UI recovers after a model error');
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
