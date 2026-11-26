// Web Worker: offline Polish -> English translation of single words the dictionary does not know.
// Messages in:  {type:'translate', id, words, local, model:{id, dtype}}
// Messages out: {type:'progress', loaded, total} | {type:'translated', id, out} | {type:'error', id, message}
const CDN_LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js';
let translator = null;

async function load(local, model) {
  if (translator) return translator;
  translator = (async () => {
    const here = (p) => new URL(p, self.location.href).href;
    const lib = await import(local ? here('./vendor/transformers.min.js') : CDN_LIB);
    if (local) {
      lib.env.allowRemoteModels = false;
      lib.env.allowLocalModels = true;
      lib.env.localModelPath = here('./models/');
      lib.env.useBrowserCache = false;
      lib.env.backends.onnx.wasm.wasmPaths = here('./vendor/');
    } else {
      lib.env.allowLocalModels = false;
      lib.env.useBrowserCache = true;
    }
    const files = new Map();
    return lib.pipeline('translation', model.id, {
      dtype: model.dtype,
      device: 'wasm',
      progress_callback: (p) => {
        if (p.status !== 'progress' || !p.total) return;
        files.set(p.file, p);
        let loaded = 0, total = 0;
        for (const f of files.values()) { loaded += f.loaded; total += f.total; }
        postMessage({ type: 'progress', loaded, total });
      },
    });
  })();
  translator.catch(() => { translator = null; });
  return translator;
}

// "The keys." -> "keys"
const tidy = (s) => s.trim().replace(/[.!?]+$/, '').replace(/^(the|a|an)\s+/i, '').toLowerCase();

self.onmessage = async ({ data: msg }) => {
  try {
    const tr = await load(!!msg.local, msg.model);
    const out = [];
    for (const w of msg.words) out.push(tidy((await tr(w))[0].translation_text));
    postMessage({ type: 'translated', id: msg.id, out });
  } catch (err) {
    postMessage({ type: 'error', id: msg.id, message: String(err && err.message || err) });
  }
};
