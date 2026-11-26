// Smoke test of the desktop (Electron) app with Playwright.
// Usage: node tests/electron-smoke.mjs <test-video> [--expect-model] [--screenshot file.png]
// Run from the repo root after scripts/prepare-offline.sh. On Linux CI wrap with xvfb-run.
//  - always: window opens, app loads over app://, AI library loads from vendor/, internet is blocked
//  - with --expect-model: the real CLIP model loads, analyses the video and finds the red part
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'desktop', 'package.json'));
const { _electron: electron } = require('playwright');
const args = process.argv.slice(2);
const video = args[0];
const expectModel = args.includes('--expect-model');
const shot = args.includes('--screenshot') ? args[args.indexOf('--screenshot') + 1] : null;
const modelKey = args.includes('--model') ? args[args.indexOf('--model') + 1] : null;

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; };

const tempDirs = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('szukaj-w-filmie-'));
const configDirs = () => ['Szukaj w filmie', 'szukaj-w-filmie'].flatMap((n) =>
  [path.join(os.homedir(), '.config', n), path.join(process.env.APPDATA || '', n)]).filter((d) => fs.existsSync(d));
const configBefore = configDirs();
const app = await electron.launch({
  args: [path.join(root, 'desktop'), ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
});
const page = await app.firstWindow();
page.on('console', (m) => { if (m.type() === 'error') console.log('  console:', m.text()); });
page.on('pageerror', (e) => { console.log('pageerror', e.message); failures++; });
await page.waitForLoadState('domcontentloaded');
check((await page.title()).startsWith('Szukaj w filmie'), `window shows the app (${await page.title()})`);

await page.waitForFunction(() => /Procesor/.test(document.getElementById('metrics').textContent), null, { timeout: 10000 }).catch(() => {});
const metrics = await page.textContent('#metrics');
check(/Procesor: \d+% \(\d+ rdz\.\).*Pamięć programu: \d+ MB.*RAM: [\d,]+ \/ [\d,]+ GB/.test(metrics), `status bar shows CPU and memory: "${metrics}"`);
const blocked = await page.evaluate(() => fetch('https://example.com/').then(() => false, () => true));
check(blocked, 'internet access is blocked inside the app');
check(await page.evaluate(() => crossOriginIsolated), 'multi-threaded AI available (cross-origin isolated)');

if (modelKey) {
  await page.waitForFunction((k) => !document.getElementById(`model-${k}`).disabled, modelKey, { timeout: 30000 });
  await page.check(`#model-${modelKey}`);
  console.log(`  model chosen: ${modelKey}`);
}
await page.waitForFunction((k) => {
  const t = document.getElementById('model-status').textContent;
  const label = k && document.getElementById(`model-${k}`).parentElement.querySelector('b').textContent.toLowerCase();
  return /błąd/.test(t) || (/gotowy/.test(t) && (!k || t.startsWith(label)));
}, modelKey, { timeout: 300000 });
const status = await page.textContent('#model-status');
const hint = await page.textContent('#model-hint');
console.log(`  model: ${status} | ${hint}`);

if (expectModel) {
  check(status.includes('gotowy'), 'real CLIP model loaded from the app folder');
  await page.setInputFiles('#file', video);
  await page.waitForSelector('#analyze:not([disabled])');
  const t0 = Date.now();
  await page.click('#analyze');
  await page.waitForFunction(() => /^(Gotowe|Błąd)/.test(document.getElementById('analyze-status').textContent), null, { timeout: 600000 });
  const st = await page.textContent('#analyze-status');
  check(st.startsWith('Gotowe'), `analysis: "${st}" in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const [q, re] of [['czerwony', /^▶ 0:0[0-4]/], ['zielony', /^▶ 0:(0[7-9]|1[01])/]]) {
    await page.fill('#query', q);
    await page.click('#search');
    // wait until this search has finished (the button is disabled while it runs), not just for old results
    await page.waitForFunction(() => !document.getElementById('search').disabled, null, { timeout: 60000 });
    await page.waitForSelector('#results li .time');
    const first = (await page.textContent('#results li .time')).trim();
    const score = await page.textContent('#results li .score');
    check(re.test(first), `real AI: "${q}" -> ${first} (${score.trim()})`);
  }
} else {
  check(!/import|module|Failed to fetch dynamically/i.test(hint), 'AI library loaded from the app folder');
  check(/models\/Xenova|local|404|Could not locate/i.test(hint) || status.includes('gotowy'),
    'model is looked up inside the app folder (not on the internet)');
}
if (shot) await page.screenshot({ path: shot });
const during = tempDirs();
check(during.length > 0, `browser data goes to a temporary folder (${during.join(', ')})`);
await app.close();
await new Promise((r) => setTimeout(r, 1500));
const left = tempDirs().filter((d) => during.includes(d));
check(left.length === 0, `temporary folder deleted after closing${left.length ? ': ' + left.join(', ') : ''}`);
const newConfig = configDirs().filter((d) => !configBefore.includes(d));
check(newConfig.length === 0, `nothing written to the user profile${newConfig.length ? ': ' + newConfig.join(', ') : ''}`);
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
