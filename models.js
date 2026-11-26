// AI models the app can use. "fast" is always available; "accurate" is bigger and slower.
// family: 'clip' (CLIP*WithProjection, image_embeds/text_embeds) or 'siglip' (Siglip*Model, pooler_output)
// conf: [high, medium] thresholds of the raw image-text similarity for the "pewność" label.
export const MODELS = {
  fast: {
    id: 'Xenova/clip-vit-base-patch32', family: 'clip', dtype: 'q8', sizeMB: 150,
    label: 'Szybki', note: 'mniejszy, szybszy; dobry do długich nagrań i telefonu',
    conf: [0.29, 0.25],
  },
  // chosen by scripts/model-probe.mjs: clearest separation of right/wrong descriptions, ~2x slower than fast
  accurate: {
    id: 'Xenova/siglip-base-patch16-224', family: 'siglip', dtype: 'q8', sizeMB: 200,
    label: 'Dokładny', note: 'większy i ok. 2× wolniejszy; lepiej rozróżnia szczegóły',
    // SigLIP similarities are much lower than CLIP's. Measured in the browser (tests/browser-model-check.mjs):
    // right description ~0.06-0.09, wrong one ~0.00-0.04
    conf: [0.07, 0.045],
  },
};
export const DEFAULT_MODEL = 'fast';

// Offline Polish -> English translation for words the dictionary does not know
// (chosen by scripts/translate-check.mjs: small, fast, good on single words).
export const TRANSLATOR = { id: 'Xenova/opus-mt-pl-en', dtype: 'q8', sizeMB: 110 };
