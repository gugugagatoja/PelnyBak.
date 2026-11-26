// Downloads the AI models listed in models.js into <out>/models/<id>/ for the offline (Windows) program:
// all small config/tokenizer files of each model plus only the ONNX files the app uses.
// Usage: node scripts/download-models.mjs <outDir> [keys...]   (keys: fast accurate translator; default all)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [outDir, ...want] = process.argv.slice(2);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { MODELS, TRANSLATOR } = await import(pathToFileURL(path.join(root, 'models.js')).href);
const SUFFIX = { fp32: '', fp16: '_fp16', q8: '_quantized', int8: '_int8', uint8: '_uint8', q4: '_q4' };
const HF = 'https://huggingface.co';

const jobs = Object.entries(MODELS).map(([key, m]) => ({ key, ...m, onnx: ['text_model', 'vision_model'] }));
jobs.push({ key: 'translator', ...TRANSLATOR, onnx: ['encoder_model', 'decoder_model_merged'] });

async function get(url, dest, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      return;
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((res) => setTimeout(res, 3000 * i));
    }
  }
}

for (const j of jobs.filter((j) => !want.length || want.includes(j.key))) {
  const tree = await (await fetch(`${HF}/api/models/${j.id}/tree/main`)).json();
  const small = tree.filter((f) => f.type === 'file' && /\.(json|txt|spm|model)$/.test(f.path) && f.size < 20e6).map((f) => f.path);
  const onnx = j.onnx.map((n) => `onnx/${n}${SUFFIX[j.dtype]}.onnx`);
  let bytes = 0;
  for (const f of [...small, ...onnx]) {
    const dest = path.join(outDir, 'models', j.id, f);
    await get(`${HF}/${j.id}/resolve/main/${f}`, dest);
    bytes += fs.statSync(dest).size;
  }
  console.log(`model ${j.key}: ${j.id} (${Math.round(bytes / 1048576)} MB, ${small.length + onnx.length} files)`);
}
