// AI models the app can use. "fast" is always available; "accurate" is bigger and slower.
// family: 'clip' (CLIP*WithProjection, image_embeds/text_embeds) or 'siglip' (Siglip*Model, pooler_output)
// conf: [high, medium] thresholds of the raw image-text similarity for the "pewność" label.
export const MODELS = {
  fast: {
    id: 'Xenova/clip-vit-base-patch32', family: 'clip', dtype: 'q8', sizeMB: 90,
    label: 'Szybki', note: 'mniejszy, szybszy; dobry do długich nagrań i telefonu',
    conf: [0.29, 0.25],
  },
  accurate: {
    id: 'Xenova/clip-vit-base-patch16', family: 'clip', dtype: 'q8', sizeMB: 150,
    label: 'Dokładny', note: 'większy i wolniejszy; lepiej widzi małe przedmioty i szczegóły',
    conf: [0.29, 0.25],
  },
};
export const DEFAULT_MODEL = 'fast';
