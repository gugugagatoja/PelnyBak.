// Diagnostic: raw similarities of the app's models on solid colour frames vs simple scenes,
// with the exact text templates and baseline the app uses. Run in CI.
import { AutoTokenizer, AutoProcessor, RawImage, CLIPTextModelWithProjection, CLIPVisionModelWithProjection,
  SiglipTextModel, SiglipVisionModel } from '@huggingface/transformers';
import { MODELS } from './models.js';

const norm = (a) => { let s = 0; for (const v of a) s += v * v; s = Math.sqrt(s) || 1; return Float32Array.from(a, (v) => v / s); };
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const mean = (vs) => norm(vs[0].map((_, i) => vs.reduce((s, v) => s + v[i], 0)));
const rows = (t) => { const d = t.dims[1]; return Array.from({ length: t.dims[0] }, (_, i) => norm(t.data.slice(i * d, (i + 1) * d))); };

function img(fn) { // 224x224 RGBA image painted by fn(x, y) -> [r,g,b]
  const d = new Uint8ClampedArray(224 * 224 * 4);
  for (let y = 0; y < 224; y++) for (let x = 0; x < 224; x++) { const [r, g, b] = fn(x, y); d.set([r, g, b, 255], (y * 224 + x) * 4); }
  return new RawImage(d, 224, 224, 4).rgb();
}
const images = {
  'solid red': img(() => [255, 0, 0]), 'solid green': img(() => [0, 128, 0]), 'solid blue': img(() => [0, 0, 255]),
  'red box on gray': img((x, y) => (x > 80 && x < 140 && y > 40 && y < 190 ? [255, 0, 0] : [128, 128, 128])),
  'green box on gray': img((x, y) => (x > 80 && x < 140 && y > 40 && y < 190 ? [0, 160, 0] : [128, 128, 128])),
};
const TEMPLATES = ['a photo of {}.', 'a video frame showing {}.', '{}'];
const BASELINE = ['a photo.', 'a video frame.'];
const queries = ['red', 'green', 'blue', 'red car', 'green bag'];

for (const [key, m] of Object.entries(MODELS)) {
  const sig = m.family === 'siglip';
  const tok = await AutoTokenizer.from_pretrained(m.id), proc = await AutoProcessor.from_pretrained(m.id);
  const tm = await (sig ? SiglipTextModel : CLIPTextModelWithProjection).from_pretrained(m.id, { dtype: m.dtype });
  const vm = await (sig ? SiglipVisionModel : CLIPVisionModelWithProjection).from_pretrained(m.id, { dtype: m.dtype });
  const embT = async (t) => { const o = await tm(tok(t, sig ? { padding: 'max_length', truncation: true } : { padding: true, truncation: true })); return rows(o.text_embeds || o.pooler_output); };
  const base = mean(await embT(BASELINE));
  console.log(`\n=== ${key}: ${m.id} ===`);
  console.log('image'.padEnd(20), queries.map((q) => q.padStart(18)).join(''));
  for (const [name, im] of Object.entries(images)) {
    const o = await vm(await proc(im)); const ie = rows(o.image_embeds || o.pooler_output)[0];
    const cells = [];
    for (const q of queries) {
      const qv = mean(await embT(TEMPLATES.map((t) => t.replace('{}', q))));
      cells.push(`${dot(qv, ie).toFixed(3)}/${(dot(qv, ie) - dot(base, ie)).toFixed(3)}`.padStart(18));
    }
    console.log(name.padEnd(20), cells.join(''));
  }
}
console.log('\n(cells: raw similarity / similarity minus baseline, as used by the app)');
