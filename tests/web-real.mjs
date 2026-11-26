// Web version with the REAL model download (Hugging Face + CDN), like on a phone.
// Usage: node tests/web-real.mjs <test-video>   (needs internet; run in CI)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'desktop', 'package.json'));
const { chromium, devices } = require('playwright');
const video = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = p.endsWith('/') ? path.join(p, 'index.html') : p;
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));

let failures = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
ctx.on('requestfailed', (r) => console.log('  request failed:', r.url(), r.failure()?.errorText));
ctx.on('response', (r) => { if (r.status() >= 400) console.log('  HTTP', r.status(), r.url()); });
const page = await ctx.newPage();
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('  console:', m.text()); });
await page.goto(`http://localhost:${server.address().port}/`);
await page.setInputFiles('#file', video);
await page.waitForSelector('#analyze:not([disabled])');
const t0 = Date.now();
await page.click('#analyze');
await page.waitForFunction(() => /błąd|gotowy/.test(document.getElementById('model-status').textContent), null, { timeout: 600000 });
console.log('  model:', await page.textContent('#model-status'), '|', await page.textContent('#model-hint'), `| ${((Date.now() - t0) / 1000).toFixed(0)} s`);
check((await page.textContent('#model-status')).includes('gotowy'), 'model downloaded from Hugging Face in the browser');
await page.waitForFunction(() => /^(Gotowe|Błąd)/.test(document.getElementById('analyze-status').textContent), null, { timeout: 600000 });
check((await page.textContent('#analyze-status')).startsWith('Gotowe'), 'video analysed');
await page.fill('#query', 'czerwony');
await page.click('#search');
await page.waitForSelector('#results li .time');
const first = (await page.textContent('#results li .time')).trim();
check(/^▶ 0:0[0-4]/.test(first), `"czerwony" -> ${first}`);

// second visit: model must come from the browser cache, with the internet cut off
await page.reload();
await ctx.setOffline(true);
await page.setInputFiles('#file', video);
await page.click('#analyze');
await page.waitForFunction(() => /^(Gotowe|Błąd)/.test(document.getElementById('analyze-status').textContent), null, { timeout: 300000 });
check((await page.textContent('#analyze-status')).startsWith('Gotowe'), `works offline after first download: ${await page.textContent('#analyze-status')}`);
await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
