// Runs the models inside a real browser (onnxruntime-web, like the app) and prints similarities
// for coloured test frames, for several model/compression variants. Needs internet. Run in CI.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'desktop', 'package.json'));
const { chromium } = require('playwright');

const variants = JSON.parse(process.argv[2] || '[]');
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log('  console:', m.text()));
await page.goto('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/package.json'); // any page on the CDN origin
for (const v of variants) {
  const out = await page.evaluate(async (v) => {
    const lib = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js');
    const sig = v.family === 'siglip';
    const norm = (a) => { let s = 0; for (const x of a) s += x * x; s = Math.sqrt(s) || 1; return Array.from(a, (x) => x / s); };
    const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
    const rows = (t) => { const d = t.dims[1]; return Array.from({ length: t.dims[0] }, (_, i) => norm(t.data.slice(i * d, (i + 1) * d))); };
    try {
      const t0 = performance.now();
      const tok = await lib.AutoTokenizer.from_pretrained(v.id), proc = await lib.AutoProcessor.from_pretrained(v.id);
      const tm = await (sig ? lib.SiglipTextModel : lib.CLIPTextModelWithProjection).from_pretrained(v.id, { dtype: v.text || v.dtype, device: 'wasm' });
      const vm = await (sig ? lib.SiglipVisionModel : lib.CLIPVisionModelWithProjection).from_pretrained(v.id, { dtype: v.vision || v.dtype, device: 'wasm' });
      const te = rows(((o) => o.text_embeds || o.pooler_output)(await tm(tok(['a photo of red.', 'a photo of green.'], sig ? { padding: 'max_length', truncation: true } : { padding: true, truncation: true }))));
      const img = (rgb) => { const d = new Uint8ClampedArray(224 * 224 * 4); for (let i = 0; i < d.length; i += 4) d.set([...rgb, 255], i); return new lib.RawImage(d, 224, 224, 4).rgb(); };
      const res = {};
      let ms = 0;
      for (const [name, rgb] of [['red', [255, 0, 0]], ['green', [0, 128, 0]]]) {
        const s = performance.now();
        const ie = rows(((o) => o.image_embeds || o.pooler_output)(await vm(await proc(img(rgb)))))[0];
        ms += performance.now() - s;
        res[name] = { red: +dot(ie, te[0]).toFixed(3), green: +dot(ie, te[1]).toFixed(3), nan: ie.some(Number.isNaN) };
      }
      const ok = res.red.red > res.red.green && res.green.green > res.green.red;
      return { ok, msPerImage: Math.round(ms / 2), loadS: +((performance.now() - t0) / 1000).toFixed(1), res };
    } catch (e) { return { error: String(e.message || e).slice(0, 200) }; }
  }, v);
  console.log(JSON.stringify({ ...v, ...out }));
}
await browser.close();
