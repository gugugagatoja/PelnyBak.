#!/usr/bin/env bash
# Builds desktop/app: the web app + AI runtime (vendor/) + CLIP model (models/), for fully offline use.
# Needs: npm and internet access to registry.npmjs.org and huggingface.co.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/desktop/app"

rm -rf "$OUT"
mkdir -p "$OUT/vendor" "$OUT/models"
cp -r "$ROOT"/{index.html,styles.css,app.js,worker.js,translate-worker.js,translate.js,models.js,version.js,manifest.webmanifest,icons} "$OUT/"

# AI runtime: only the 3 browser files of the npm package are needed (no install scripts run)
TMP="$(mktemp -d)"
(cd "$TMP" && npm pack @huggingface/transformers@3.7.6 --silent >/dev/null && tar xzf ./*.tgz)
DIST="$TMP/package/dist"
cp "$DIST"/transformers.min.js "$DIST"/ort-wasm-simd-threaded.jsep.mjs "$DIST"/ort-wasm-simd-threaded.jsep.wasm "$OUT/vendor/"

# AI models listed in models.js (all of them, or only the keys given in $MODELS, e.g. MODELS="fast translator")
node "$ROOT/scripts/download-models.mjs" "$OUT" ${MODELS:-}

du -sh "$OUT" "$OUT/models" "$OUT/vendor"
