// Web Worker: runs the CLIP model off the main thread so the UI stays responsive.
// Messages in:  {type:'load', local, model:{id, family, dtype}} | {type:'image', id, width, height, buffer} | {type:'text', id, texts}
// Messages out: {type:'progress', loaded, total} | {type:'ready'} | {type:'error', message}
//               {type:'image', id, emb} | {type:'text', id, embs}
//
// Two modes:
//  - web (default): library from the CDN, model from Hugging Face; both cached for offline use.
//  - local (desktop .exe): library in ./vendor/ and model in ./models/, shipped with the app.
//    Nothing is downloaded.

const CDN_LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js';
let tokenizer, processor, textModel, visionModel, RawImage, family;
let loading = null;

function normalize(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  const n = Math.sqrt(sum) || 1;
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] / n;
  return out;
}

function load(local, model) {
  if (loading) return loading;
  const { id: MODEL_ID, dtype } = model;
  family = model.family;
  loading = (async () => {
    const here = (p) => new URL(p, self.location.href).href;
    const lib = await import(local ? here('./vendor/transformers.min.js') : CDN_LIB);
    const { env, AutoTokenizer, AutoProcessor } = lib;
    const TextModel = family === 'siglip' ? lib.SiglipTextModel : lib.CLIPTextModelWithProjection;
    const VisionModel = family === 'siglip' ? lib.SiglipVisionModel : lib.CLIPVisionModelWithProjection;
    RawImage = lib.RawImage;
    if (local) {
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = here('./models/');
      env.useBrowserCache = false;
      env.backends.onnx.wasm.wasmPaths = here('./vendor/');
    } else {
      env.allowLocalModels = false;
      env.useBrowserCache = true; // model files are kept in the browser cache -> offline after first download
    }

    const files = new Map();
    const progress_callback = (p) => {
      if (p.status === 'progress' && p.total) {
        files.set(p.file, { loaded: p.loaded, total: p.total });
        let loaded = 0, total = 0;
        for (const f of files.values()) { loaded += f.loaded; total += f.total; }
        postMessage({ type: 'progress', loaded, total });
      }
    };
    const opts = { dtype, device: 'wasm', progress_callback };
    [tokenizer, processor, textModel, visionModel] = await Promise.all([
      AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback }),
      AutoProcessor.from_pretrained(MODEL_ID, { progress_callback }),
      TextModel.from_pretrained(MODEL_ID, opts),
      VisionModel.from_pretrained(MODEL_ID, opts),
    ]);
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

async function embedImage({ width, height, buffer }) {
  const image = new RawImage(new Uint8ClampedArray(buffer), width, height, 4).rgb();
  const inputs = await processor(image);
  const out = await visionModel(inputs);
  return normalize((out.image_embeds || out.pooler_output).data);
}

async function embedTexts(texts) {
  // SigLIP was trained on texts padded to a fixed length
  const inputs = tokenizer(texts, family === 'siglip' ? { padding: 'max_length', truncation: true } : { padding: true, truncation: true });
  const out = await textModel(inputs);
  const text_embeds = out.text_embeds || out.pooler_output;
  const dim = text_embeds.dims[1];
  const embs = [];
  for (let i = 0; i < texts.length; i++) {
    embs.push(normalize(text_embeds.data.slice(i * dim, (i + 1) * dim)));
  }
  return embs;
}

self.onmessage = async ({ data: msg }) => {
  try {
    if (msg.type === 'load') {
      await load(!!msg.local, msg.model);
      postMessage({ type: 'ready' });
    } else if (msg.type === 'image') {
      if (!loading) throw new Error('Model nie jest wczytany');
      await loading;
      const emb = await embedImage(msg);
      postMessage({ type: 'image', id: msg.id, emb }, [emb.buffer]);
    } else if (msg.type === 'text') {
      if (!loading) throw new Error('Model nie jest wczytany');
      await loading;
      const embs = await embedTexts(msg.texts);
      postMessage({ type: 'text', id: msg.id, embs });
    }
  } catch (err) {
    postMessage({ type: 'error', id: msg.id, message: String(err && err.message || err) });
  }
};
