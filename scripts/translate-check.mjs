// Checks offline Polish->English translation models for Transformers.js: does it load, size, speed, quality.
import { pipeline } from '@huggingface/transformers';
const phrases = ['pomidor', 'klucze', 'czerwony samochód', 'mężczyzna z plecakiem', 'zielona torba na ławce',
  'kobieta w niebieskiej kurtce', 'pies', 'grzebień', 'rower przy drzwiach', 'osoba w czerwonej czapce, która odchodzi',
  'znajdź, czy w tym miejscu pojawiła się zielona torba', 'dziecko z balonem', 'wiertarka', 'kot na parapecie'];
const HF = 'https://huggingface.co';
const candidates = ['Xenova/opus-mt-pl-en', 'Xenova/opus-mt-mul-en', 'Xenova/opus-mt-sla-en', 'Xenova/m2m100_418M', 'Xenova/nllb-200-distilled-600M'];
for (const id of candidates) {
  for (const dtype of ['q8', 'fp32']) {
    try {
      const t0 = Date.now();
      const opts = { dtype };
      const tr = await pipeline('translation', id, opts);
      const loadS = ((Date.now() - t0) / 1000).toFixed(1);
      const extra = /m2m|nllb/.test(id) ? (/nllb/.test(id) ? { src_lang: 'pol_Latn', tgt_lang: 'eng_Latn' } : { src_lang: 'pl', tgt_lang: 'en' }) : {};
      const t1 = Date.now();
      const out = [];
      for (const p of phrases) out.push(`${p} -> ${(await tr(p, extra))[0].translation_text}`);
      const ms = Math.round((Date.now() - t1) / phrases.length);
      const tree = await fetch(`${HF}/api/models/${id}/tree/main/onnx`).then((r) => r.json()).catch(() => []);
      const sizes = Object.fromEntries((tree || []).filter((f) => /quantized|^onnx\/[a-z_]+\.onnx$/.test(f.path)).map((f) => [f.path, Math.round(f.size / 1048576)]));
      console.log(JSON.stringify({ id, dtype, loadS, msPerPhrase: ms, sizesMB: sizes }));
      for (const o of out) console.log('   ', o);
      break;
    } catch (e) {
      console.log(JSON.stringify({ id, dtype, error: String(e.message || e).slice(0, 160) }));
    }
  }
}
