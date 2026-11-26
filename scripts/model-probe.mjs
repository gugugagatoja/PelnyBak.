// Compares image-text AI models that could run in the app (Transformers.js, ONNX).
// For each candidate: does it load, download size, speed, and how well it matches photos to
// descriptions in English and in Polish. Run in CI (needs internet). Prints a table.
import { env, AutoTokenizer, AutoProcessor, RawImage, CLIPTextModelWithProjection, CLIPVisionModelWithProjection,
  SiglipTextModel, SiglipVisionModel } from '@huggingface/transformers';

env.allowLocalModels = false;
const HF = 'https://huggingface.co';
const j = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);

// --- candidates: fixed list + whatever the hub search finds ---
const fixed = ['Xenova/clip-vit-base-patch32', 'Xenova/clip-vit-base-patch16', 'Xenova/siglip-base-patch16-224',
  'Xenova/siglip-base-patch16-256-multilingual', 'Xenova/clip-vit-large-patch14'];
const found = new Set(fixed);
for (const author of ['Xenova', 'onnx-community']) {
  for (const q of ['siglip', 'clip-vit', 'mobileclip', 'multilingual']) {
    const list = await j(`${HF}/api/models?author=${author}&search=${q}&limit=30`);
    for (const m of list || []) found.add(m.id || m.modelId);
  }
}
const candidates = [...found].filter((id) => /clip|siglip/i.test(id) && !/large|so400m|giant|-l-|_l_|vit-l|h14|g14/i.test(id) || fixed.includes(id));
console.log('Candidates:', candidates.join(', '));

// --- test photos (public example images used by Transformers.js docs) ---
const IMG = `${HF}/datasets/Xenova/transformers.js-docs/resolve/main`;
const tests = [
  { file: 'cats.jpg', en: 'two cats lying on a pink blanket', pl: 'dwa koty leżące na różowym kocu' },
  { file: 'tiger.jpg', en: 'a tiger', pl: 'tygrys' },
  { file: 'football-match.jpg', en: 'football players on a pitch', pl: 'piłkarze na boisku' },
  { file: 'city-streets.jpg', en: 'a city street with cars and people', pl: 'ulica w mieście z samochodami i ludźmi' },
  { file: 'beetle.png', en: 'a beetle insect', pl: 'chrząszcz, owad' },
  { file: 'bread_small.png', en: 'a loaf of bread', pl: 'bochenek chleba' },
];
const distractors = { en: ['a red car', 'a man with a backpack', 'an empty room', 'a green bag on a bench', 'a dog in a park'],
  pl: ['czerwony samochód', 'mężczyzna z plecakiem', 'pusty pokój', 'zielona torba na ławce', 'pies w parku'] };
const images = [];
for (const t of tests) {
  try { images.push({ ...t, img: await RawImage.fromURL(`${IMG}/${t.file}`) }); } catch { console.log('  (no image', t.file, ')'); }
}
console.log('Test photos:', images.map((i) => i.file).join(', '));

const norm = (a) => { let s = 0; for (const v of a) s += v * v; s = Math.sqrt(s) || 1; return Float32Array.from(a, (v) => v / s); };
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const rows = (t) => { const d = t.dims[1]; return Array.from({ length: t.dims[0] }, (_, i) => norm(t.data.slice(i * d, (i + 1) * d))); };

async function sizeMB(id, files) {
  let total = 0;
  for (const f of files) {
    const r = await fetch(`${HF}/${id}/resolve/main/${f}`, { method: 'HEAD', redirect: 'follow' }).catch(() => null);
    total += Number(r?.headers.get('content-length') || r?.headers.get('x-linked-size') || 0);
  }
  return Math.round(total / 1048576);
}

const results = [];
for (const id of candidates) {
  const cfg = await j(`${HF}/${id}/resolve/main/config.json`);
  const type = cfg?.model_type || '?';
  const fam = /siglip/.test(type) ? 'siglip' : /clip/.test(type) ? 'clip' : null;
  if (!fam) { results.push({ id, type, error: 'unsupported type' }); continue; }
  for (const dtype of ['q8', 'fp16', 'fp32']) {
    try {
      const t0 = Date.now();
      const [tok, proc] = await Promise.all([AutoTokenizer.from_pretrained(id), AutoProcessor.from_pretrained(id)]);
      const TM = fam === 'clip' ? CLIPTextModelWithProjection : SiglipTextModel;
      const VM = fam === 'clip' ? CLIPVisionModelWithProjection : SiglipVisionModel;
      const [tm, vm] = await Promise.all([TM.from_pretrained(id, { dtype }), VM.from_pretrained(id, { dtype })]);
      const loadS = (Date.now() - t0) / 1000;
      const tokOpts = fam === 'siglip' ? { padding: 'max_length', truncation: true } : { padding: true, truncation: true };
      const embT = async (texts) => { const o = await tm(tok(texts, tokOpts)); return rows(o.text_embeds || o.pooler_output); };
      const embI = async (img) => { const o = await vm(await proc(img)); return rows(o.image_embeds || o.pooler_output)[0]; };
      let ms = 0, n = 0; const imgE = [];
      for (const im of images) { const s = Date.now(); imgE.push(await embI(im.img)); ms += Date.now() - s; n++; }
      const score = async (lang) => {
        const texts = [...images.map((i) => i[lang]), ...distractors[lang]];
        const te = await embT(texts);
        let top1 = 0, margin = 0;
        imgE.forEach((ie, k) => {
          const sims = te.map((t) => dot(ie, t));
          const best = sims.indexOf(Math.max(...sims));
          if (best === k) top1++;
          const others = sims.filter((_, x) => x !== k);
          margin += sims[k] - Math.max(...others);
        });
        return { top1: `${top1}/${imgE.length}`, margin: (margin / imgE.length).toFixed(3) };
      };
      const en = await score('en'), pl = await score('pl');
      const files = [`onnx/text_model${dtype === 'fp32' ? '' : dtype === 'q8' ? '_quantized' : '_fp16'}.onnx`,
        `onnx/vision_model${dtype === 'fp32' ? '' : dtype === 'q8' ? '_quantized' : '_fp16'}.onnx`];
      results.push({ id, type, dtype, sizeMB: await sizeMB(id, files), msPerImage: Math.round(ms / n), loadS,
        en: `${en.top1} (margin ${en.margin})`, pl: `${pl.top1} (margin ${pl.margin})`,
        inputSize: proc.image_processor?.config?.size });
      break;
    } catch (e) {
      if (dtype === 'fp32') results.push({ id, type, error: String(e.message || e).slice(0, 160) });
    }
  }
}
console.log('\n===== RESULTS =====');
for (const r of results) console.log(JSON.stringify(r));
