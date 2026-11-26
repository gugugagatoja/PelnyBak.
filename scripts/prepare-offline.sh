#!/usr/bin/env bash
# Builds desktop/app: the web app + AI runtime (vendor/) + CLIP model (models/), for fully offline use.
# Needs: npm and internet access to registry.npmjs.org and huggingface.co.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/desktop/app"

rm -rf "$OUT"
mkdir -p "$OUT/vendor" "$OUT/models"
cp -r "$ROOT"/{index.html,styles.css,app.js,worker.js,translate.js,models.js,version.js,manifest.webmanifest,icons} "$OUT/"

# AI runtime: only the 3 browser files of the npm package are needed (no install scripts run)
TMP="$(mktemp -d)"
(cd "$TMP" && npm pack @huggingface/transformers@3.7.6 --silent >/dev/null && tar xzf ./*.tgz)
DIST="$TMP/package/dist"
cp "$DIST"/transformers.min.js "$DIST"/ort-wasm-simd-threaded.jsep.mjs "$DIST"/ort-wasm-simd-threaded.jsep.wasm "$OUT/vendor/"

# AI models listed in models.js (all of them, or only the keys given in $MODELS, e.g. MODELS=fast)
WANT="${MODELS:-}"
node --input-type=module -e "
  const { MODELS } = await import('$ROOT/models.js');
  const want = '$WANT'.split(/[ ,]+/).filter(Boolean);
  const suffix = { fp32: '', fp16: '_fp16', q8: '_quantized', int8: '_int8', uint8: '_uint8', q4: '_q4' };
  for (const [key, m] of Object.entries(MODELS)) if (!want.length || want.includes(key)) console.log(m.id, suffix[m.dtype]);
" > "$TMP/models.txt"
while read -r MODEL SUFFIX; do
  HF="https://huggingface.co/$MODEL/resolve/main"
  mkdir -p "$OUT/models/$MODEL/onnx"
  fetch() { curl -fsSL --retry 4 --retry-delay 3 -o "$OUT/models/$MODEL/$1" "$HF/$1"; }
  for f in config.json tokenizer.json tokenizer_config.json preprocessor_config.json \
           "onnx/text_model$SUFFIX.onnx" "onnx/vision_model$SUFFIX.onnx"; do
    fetch "$f"
  done
  for f in special_tokens_map.json processor_config.json; do fetch "$f" || rm -f "$OUT/models/$MODEL/$f"; done
  echo "model: $MODEL ($(du -sh "$OUT/models/$MODEL" | cut -f1))"
done < "$TMP/models.txt"

du -sh "$OUT" "$OUT/models" "$OUT/vendor"
