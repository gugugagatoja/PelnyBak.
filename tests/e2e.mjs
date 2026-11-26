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
    window.__createTestTranslator = () => ({
      translate: async (words) => words.map((w) => ({ pomidor: 'tomato', 'grzebień': 'comb' })[w.toLowerCase()] || w),
    });
    try { localStorage.setItem('translatorOK', '1'); } catch {}
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
  check(await page.getAttribute('#analysis-dot', 'class') === 'dot', 'status dot is red before analysis');
  await page.waitForSelector('#analyze:not([disabled])');
  await page.click('#analyze');
  await page.waitForFunction(() => document.getElementById('analyze-status').textContent.startsWith('Gotowe'), null, { timeout: 60000 });
  const status = await page.textContent('#analyze-status');
  check(/sprawdzono 1[12] klatek/.test(status), `analysis finished: "${status}"`);

  check(await page.getAttribute('#analysis-dot', 'class') === 'dot done', 'status dot is green after analysis');
  await page.fill('#query', 'klucze i portfel');
  check(await page.inputValue('#query-en') === 'keys and wallet', `translation of "klucze i portfel": ${await page.inputValue('#query-en')}`);
  check(!(await page.isVisible('#query-unknown')), 'no warning when all words are known');
  await page.fill('#query', 'czerwony pomidor');
  await page.waitForFunction(() => document.getElementById('query-en').value === 'red tomato', null, { timeout: 5000 })
    .then(() => check(true, 'unknown word translated by the AI translator (pomidor -> tomato)'),
          async () => check(false, `AI translation: ${await page.inputValue('#query-en')}`));
  check((await page.textContent('#query-ai')).includes('pomidor → tomato'), 'shows which words the AI translated');
  await page.fill('#query', 'zielony xyzabc');
  await page.waitForFunction(() => !document.getElementById('query-unknown').hidden, null, { timeout: 5000 }).catch(() => {});
  check(await page.isVisible('#query-unknown') && (await page.textContent('#query-unknown')).includes('xyzabc'), 'warning names a word nobody could translate');
  await page.fill('#query', 'red car');
  check(!(await page.isVisible('#query-unknown')), 'no warning for English descriptions');
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
  // clip mode: the green result (0:08-0:11) plays only its window, then stops at its start
  check(await page.isVisible('#clip-bar'), `clip bar shown: "${(await page.textContent('#clip-label')).slice(0, 60)}…"`);
  await page.waitForFunction(() => { const v = document.getElementById('video'); return v.paused && v.currentTime > 7 && v.currentTime < 8.5; },
    null, { timeout: 20000 })
    .then(() => check(true, 'clip stops at its end and goes back to its start'),
          async () => check(false, `clip end: t=${await page.evaluate(() => document.getElementById('video').currentTime)}`));
  await page.evaluate(() => document.getElementById('video').play());
  await page.waitForTimeout(700);
  const replay = await page.evaluate(() => ({ t: document.getElementById('video').currentTime, paused: document.getElementById('video').paused }));
  check(!replay.paused && replay.t > 7 && replay.t < 10, `play replays the same window (t=${replay.t.toFixed(1)})`);
  await page.click('#clip-exit');
  check(!(await page.isVisible('#clip-bar')), '"Cały film" leaves clip mode');
  await page.evaluate(() => document.getElementById('video').pause());
  await page.click('#results li');

  // the phone may drop the player's decoder after a long analysis: simulate it, the click must still play
  await page.evaluate(() => { const v = document.getElementById('video'); v.removeAttribute('src'); v.load(); });
  await page.click('#results li');
  await page.waitForFunction(() => document.getElementById('video').currentTime > 7, null, { timeout: 15000 })
    .then(() => check(true, 'result click recovers a released video player'),
          () => check(false, 'result click recovers a released video player'));
  const metrics = await page.textContent('#metrics');
  check(/Praca AI: \d+% czasu/.test(metrics), `status bar shows AI load: "${metrics}"`);
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

    // area of interest: only the right quarter of the frame; the red object reaches it at ~0:11
    await page.click('#roi-edit');
    await page.evaluate(() => document.getElementById('video').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForTimeout(400);
    const box = await page.evaluate(() => {
      const v = document.getElementById('video'), b = v.getBoundingClientRect();
      const s = Math.min(v.clientWidth / v.videoWidth, v.clientHeight / v.videoHeight);
      const w = v.videoWidth * s, h = v.videoHeight * s;
      return { x: b.left + (v.clientWidth - w) / 2, y: b.top + (v.clientHeight - h) / 2, w, h };
    });
    await page.mouse.move(box.x + box.w * 0.75, box.y + box.h * 0.02);
    await page.mouse.down();
    await page.mouse.move(box.x + box.w * 0.9, box.y + box.h * 0.5, { steps: 4 });
    await page.mouse.move(box.x + box.w * 0.99, box.y + box.h * 0.98, { steps: 4 });
    await page.mouse.up();
    check(await page.isVisible('#roi-box'), 'rectangle drawn on the video');
    await page.click('#roi-edit'); // Gotowe
    await page.click('#analyze');
    await page.waitForFunction(() => document.getElementById('analyze-status').textContent.startsWith('Gotowe'), null, { timeout: 60000 });
    const st2 = await page.textContent('#analyze-status');
    check(st2.includes('w zaznaczonym obszarze'), `analysis limited to the area: "${st2}"`);
    await page.click('#search');
    await page.waitForFunction(() => /^▶ 0:1[01]/.test(document.querySelector('#results li .time')?.textContent || ''), null, { timeout: 10000 })
      .then(() => check(true, 'object found only when it enters the area (0:11)'),
            async () => check(false, `area search result: ${await page.textContent('#results li .time')}`));
    if (shotDir) await page.screenshot({ path: path.join(shotDir, 'roi.png'), fullPage: true });
  }
  // clicking "analyse" again for the same film and settings does not redo the work
  check((await page.textContent('#analyze')).includes('Film przeanalizowany'), 'button shows the film is analysed');
  await page.click('#analyze');
  check(/już przeanalizowany/.test(await page.textContent('#analyze-status')) && await page.isVisible('#results li'),
    'same film + same settings: no new analysis, results kept');
  // stop half-way, then resume: continues instead of starting again
  await page.click('#reanalyze');
  await page.waitForFunction(() => /Analiza: 0:0[4-9]/.test(document.getElementById('analyze-status').textContent), null, { timeout: 30000 });
  await page.click('#analyze'); // Zatrzymaj
  await page.waitForFunction(() => /Zatrzymano/.test(document.getElementById('analyze-status').textContent), null, { timeout: 30000 });
  check((await page.textContent('#analyze')).includes('Wznów'), 'after stopping, the button offers to resume');
  const before = await page.evaluate(() => document.getElementById('analyze-status').textContent.match(/sprawdzono (\d+)/)?.[1]);
  await page.click('#analyze');
  await page.waitForFunction(() => document.getElementById('analyze-status').textContent.startsWith('Gotowe'), null, { timeout: 60000 });
  const st5 = await page.textContent('#analyze-status');
  check(/sprawdzono 20 klatek/.test(st5) && Number(before) > 0, `resumed from frame ${before} and finished: "${st5.slice(0, 32)}…"`);

  // picking the same film again keeps the analysis (results stay)
  await page.setInputFiles('#file', cctvPath);
  check(/Wyniki analizy zostały zachowane/.test(await page.textContent('#analyze-status')), 'same film picked again keeps the analysis');
  check(await page.getAttribute('#analysis-dot', 'class') === 'dot done', 'dot stays green after picking the same film');

  // going to the background pauses the analysis; coming back resumes it without losing frames
  await page.click('#roi-clear').catch(() => {});
  await page.evaluate(() => {
    window.__hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden });
  });
  await page.click('#analyze');
  await page.waitForFunction(() => /Analiza: 0:0[3-9]/.test(document.getElementById('analyze-status').textContent), null, { timeout: 30000 });
  await page.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => /Wstrzymano/.test(document.getElementById('analyze-status').textContent), null, { timeout: 10000 })
    .then(() => check(true, 'analysis pauses in the background'), () => check(false, 'analysis pauses in the background'));
  await page.waitForTimeout(1500);
  check(/Wstrzymano/.test(await page.textContent('#analyze-status')), 'stays paused while in the background');
  await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => document.getElementById('analyze-status').textContent.startsWith('Gotowe'), null, { timeout: 60000 });
  const st4 = await page.textContent('#analyze-status');
  check(/sprawdzono 20 klatek/.test(st4), `resumes and finishes all frames: "${st4.slice(0, 40)}…"`);

  // the phone closes the app in the background and Chrome reloads it: the analysis comes back
  await page.reload();
  await page.waitForFunction(() => /zamknął aplikację w tle/.test(document.getElementById('analyze-status').textContent), null, { timeout: 15000 })
    .then(() => check(true, 'after a restart the app asks to pick the same film again'),
          async () => check(false, `after restart: "${await page.textContent('#analyze-status')}"`));
  await page.setInputFiles('#file', cctvPath);
  check(/zachowane/.test(await page.textContent('#analyze-status')), 'picking the same film restores the analysis');
  await page.fill('#query', 'czerwony');
  await page.click('#search');
  await page.waitForFunction(() => !document.getElementById('search').disabled);
  check(/^▶ 0:0[7-9]|^▶ 0:1[0-2]/.test(await page.textContent('#results li .time')), `search works on the restored analysis: ${await page.textContent('#results li .time')}`);

  // a file that does not store its length (screen recordings, messengers): must still be analysed
  if (process.env.NODUR_VIDEO) {
    await page.setInputFiles('#file', process.env.NODUR_VIDEO);
    await page.click('#roi-clear').catch(() => {});
    await page.waitForSelector('#analyze:not([disabled])');
    await page.click('#analyze');
    await page.waitForFunction(() => /^(Gotowe|Błąd)/.test(document.getElementById('analyze-status').textContent), null, { timeout: 60000 });
    const st3 = await page.textContent('#analyze-status');
    check(st3.startsWith('Gotowe'), `video without stored length analysed: "${st3.slice(0, 50)}…"`);
    await page.fill('#query', 'zielony');
    await page.click('#search');
    await page.waitForFunction(() => !document.getElementById('search').disabled);
    const g = await page.textContent('#results li .time');
    check(/^▶ 0:0[3-5]/.test(g), `colour change without brightness change detected (green at ${g})`);
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
