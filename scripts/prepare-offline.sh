#!/usr/bin/env bash
# Builds desktop/app: the web app + AI runtime (vendor/) + CLIP model (models/), for fully offline use.
# Needs: desktop/node_modules installed (npm ci in desktop/) and internet access to huggingface.co.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/desktop/app"
MODEL="Xenova/clip-vit-base-patch32"
HF="https://huggingface.co/$MODEL/resolve/main"

rm -rf "$OUT"
mkdir -p "$OUT/vendor" "$OUT/models/$MODEL/onnx"
cp -r "$ROOT"/{index.html,styles.css,app.js,worker.js,translate.js,manifest.webmanifest,icons} "$OUT/"

DIST="$ROOT/desktop/node_modules/@huggingface/transformers/dist"
cp "$DIST"/transformers.min.js "$DIST"/ort-wasm-simd-threaded.jsep.mjs "$DIST"/ort-wasm-simd-threaded.jsep.wasm "$OUT/vendor/"

fetch() { curl -fL --retry 4 --retry-delay 3 -o "$OUT/models/$MODEL/$1" "$HF/$1"; }
for f in config.json tokenizer.json tokenizer_config.json preprocessor_config.json \
         onnx/text_model_quantized.onnx onnx/vision_model_quantized.onnx; do
  fetch "$f"
done
for f in special_tokens_map.json processor_config.json; do fetch "$f" || rm -f "$OUT/models/$MODEL/$f"; done

du -sh "$OUT" "$OUT/models" "$OUT/vendor"
