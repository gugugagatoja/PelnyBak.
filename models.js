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
    // SigLIP similarities are lower than CLIP's: match probability 50% at ~0.11 (scale ~117, bias ~-12.9)
    conf: [0.11, 0.09],
  },
};
export const DEFAULT_MODEL = 'fast';
