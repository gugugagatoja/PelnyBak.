import { translatePlToEn } from './translate.js';

const $ = (id) => document.getElementById(id);
const els = {
  modelStatus: $('model-status'), modelProgress: $('model-progress'), modelHint: $('model-hint'),
  file: $('file'), video: $('video'), intervalRow: $('interval-row'), interval: $('interval'),
  analyze: $('analyze'), analyzeProgress: $('analyze-progress'), analyzeStatus: $('analyze-status'),
  query: $('query'), queryEn: $('query-en'), search: $('search'),
  resultsCard: $('results-card'), results: $('results'), timeline: $('timeline'),
};

const CROP = 224; // CLIP input size

// ---------- PWA / offline ----------
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      // first visit: wait (briefly) until the SW controls the page so model/runtime downloads get cached
      await new Promise((res) => {
        navigator.serviceWorker.addEventListener('controllerchange', res, { once: true });
        setTimeout(res, 3000);
      });
    }
  } catch (e) {
    console.warn('Service worker not available:', e);
  }
}

// ---------- AI engine (Web Worker running CLIP) ----------
function createWorkerEngine() {
  let worker = null;
  let nextId = 1;
  const pending = new Map();
  let onProgress = () => {};
  let readyPromise = null;

  function start() {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') return onProgress(data.loaded, data.total);
      const p = pending.get(data.id ?? 'load');
      if (!p) return;
      pending.delete(data.id ?? 'load');
      if (data.type === 'error') p.reject(new Error(data.message));
      else p.resolve(data);
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'Błąd modułu AI'));
      pending.clear();
    };
  }
  const call = (msg, transfer) => new Promise((resolve, reject) => {
    if (!worker) start();
    const id = msg.type === 'load' ? 'load' : nextId++;
    if (msg.type !== 'load') msg.id = id;
    pending.set(id, { resolve, reject });
    worker.postMessage(msg, transfer || []);
  });

  return {
    load(progressCb) {
      if (progressCb) onProgress = progressCb;
      if (!readyPromise) {
        readyPromise = call({ type: 'load' });
        readyPromise.catch(() => { readyPromise = null; });
      }
      return readyPromise;
    },
    async embedImage(imageData) {
      const buffer = imageData.data.buffer.slice(0);
      const r = await call({ type: 'image', width: imageData.width, height: imageData.height, buffer }, [buffer]);
      return r.emb;
    },
    async embedTexts(texts) {
      const r = await call({ type: 'text', texts });
      return r.embs;
    },
  };
}

// Tests can inject a fake engine (no model download) via window.__createTestEngine.
const engine = (window.__createTestEngine || createWorkerEngine)();

// ---------- state ----------
const state = {
  modelReady: false,
  videoUrl: null,
  frames: [], // {t, crops: Float32Array[], thumb: dataURL}
  interval: 1,
  busy: false,
  scores: null,
};

function setProgress(el, frac) {
  el.hidden = frac == null;
  if (frac != null) el.firstElementChild.style.width = `${Math.round(Math.min(1, Math.max(0, frac)) * 100)}%`;
}

const fmtTime = (t) => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};
const fmtMB = (b) => `${(b / 1048576).toFixed(0)} MB`;

async function ensureModel() {
  if (state.modelReady) return;
  els.modelStatus.textContent = 'wczytywanie…';
  els.modelStatus.classList.remove('ok');
  setProgress(els.modelProgress, 0);
  try {
    await engine.load((loaded, total) => {
      setProgress(els.modelProgress, loaded / total);
      els.modelHint.textContent = `Pobieranie modelu: ${fmtMB(loaded)} z ${fmtMB(total)}…`;
    });
  } catch (e) {
    els.modelStatus.textContent = 'błąd';
    els.modelHint.textContent = `Nie udało się wczytać modelu (${e.message}). Za pierwszym razem potrzebny jest internet.`;
    setProgress(els.modelProgress, null);
    throw e;
  }
  state.modelReady = true;
  setProgress(els.modelProgress, null);
  els.modelStatus.textContent = 'gotowy (offline)';
  els.modelStatus.classList.add('ok');
  els.modelHint.textContent = 'Model jest zapisany na telefonie. Aplikacja działa bez internetu.';
}

async function modelIsCached() {
  try {
    if (!('caches' in window)) return false;
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    return keys.some((r) => r.url.includes('vision_model')) && keys.some((r) => r.url.includes('text_model'));
  } catch { return false; }
}

// ---------- video & frames ----------
function waitFor(el, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { cleanup(); resolve(); }, timeoutMs);
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error('Nie można odczytać filmu')); };
    function cleanup() { clearTimeout(t); el.removeEventListener(event, ok); el.removeEventListener('error', bad); }
    el.addEventListener(event, ok, { once: true });
    el.addEventListener('error', bad, { once: true });
  });
}

async function seek(video, t) {
  const p = waitFor(video, 'seeked');
  video.currentTime = t;
  await p;
}

// Square crops covering the whole frame (CLIP would otherwise centre-crop and cut off the sides).
function cropRects(w, h) {
  const side = Math.min(w, h);
  const n = Math.max(1, Math.ceil(Math.max(w, h) / side - 0.15));
  const rects = [];
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? (Math.max(w, h) - side) / 2 : (i * (Math.max(w, h) - side)) / (n - 1);
    rects.push(w >= h ? [off, 0, side, side] : [0, off, side, side]);
  }
  return rects;
}

function resetResults() {
  state.frames = [];
  state.scores = null;
  els.results.innerHTML = '';
  els.resultsCard.hidden = true;
  updateButtons();
}

function updateButtons() {
  els.analyze.disabled = state.busy || !state.videoUrl;
  els.search.disabled = state.busy || state.frames.length === 0 || !els.queryEn.value.trim();
}

els.file.addEventListener('change', () => {
  const file = els.file.files[0];
  if (!file) return;
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = URL.createObjectURL(file);
  els.video.src = state.videoUrl;
  els.video.hidden = false;
  els.intervalRow.hidden = false;
  els.analyzeStatus.textContent = `Wybrano: ${file.name}`;
  resetResults();
  els.video.addEventListener('loadedmetadata', () => {
    const d = els.video.duration;
    if (Number.isFinite(d)) {
      // long videos: suggest a coarser interval so analysis does not take ages on a phone
      els.interval.value = d > 900 ? '5' : d > 300 ? '2' : '1';
      els.analyzeStatus.textContent = `Wybrano: ${file.name} (${fmtTime(d)})`;
    }
  }, { once: true });
});

els.analyze.addEventListener('click', async () => {
  if (!state.videoUrl || state.busy) return;
  state.busy = true;
  resetResults();
  updateButtons();
  try {
    await ensureModel();
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.src = state.videoUrl;
    await waitFor(v, 'loadeddata');
    const duration = v.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Nieznana długość filmu');
    const W = v.videoWidth, H = v.videoHeight;
    const interval = parseFloat(els.interval.value);
    state.interval = interval;

    const cropCanvas = makeCanvas(CROP, CROP);
    const cctx = cropCanvas.getContext('2d', { willReadFrequently: true });
    const thumbW = 192, thumbH = Math.round(192 * H / W) || 108;
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbW; thumbCanvas.height = thumbH;
    const tctx = thumbCanvas.getContext('2d');
    const rects = cropRects(W, H);

    const times = [];
    for (let t = Math.min(0.1, duration / 2); t < duration; t += interval) times.push(t);
    const started = performance.now();
    for (let i = 0; i < times.length; i++) {
      await seek(v, times[i]);
      const crops = [];
      for (const [sx, sy, sw, sh] of rects) {
        cctx.drawImage(v, sx, sy, sw, sh, 0, 0, CROP, CROP);
        crops.push(await engine.embedImage(cctx.getImageData(0, 0, CROP, CROP)));
      }
      tctx.drawImage(v, 0, 0, thumbW, thumbH);
      state.frames.push({ t: times[i], crops, thumb: thumbCanvas.toDataURL('image/jpeg', 0.6) });

      const done = i + 1;
      const perFrame = (performance.now() - started) / done;
      const left = Math.round(((times.length - done) * perFrame) / 1000);
      setProgress(els.analyzeProgress, done / times.length);
      els.analyzeStatus.textContent = `Analiza: ${done}/${times.length} klatek` + (done < times.length ? `, zostało ok. ${fmtTime(left)}` : '');
    }
    v.removeAttribute('src'); v.load();
    els.analyzeStatus.textContent = `Gotowe: przeanalizowano ${state.frames.length} klatek. Teraz opisz, czego szukasz. Możesz szukać wiele razy.`;
    setProgress(els.analyzeProgress, null);
  } catch (e) {
    console.error(e);
    els.analyzeStatus.textContent = `Błąd: ${e.message}`;
    setProgress(els.analyzeProgress, null);
  } finally {
    state.busy = false;
    updateButtons();
  }
});

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// ---------- search ----------
els.query.addEventListener('input', () => {
  els.queryEn.value = translatePlToEn(els.query.value);
  updateButtons();
});
els.queryEn.addEventListener('input', updateButtons);
els.query.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!els.search.disabled) els.search.click(); }
});

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
function meanNormalized(vectors) {
  const out = new Float32Array(vectors[0].length);
  for (const v of vectors) for (let i = 0; i < v.length; i++) out[i] += v[i];
  const n = Math.sqrt(dot(out, out)) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= n;
  return out;
}

const TEMPLATES = ['a photo of {}.', 'a video frame showing {}.', '{}'];
const BASELINE = ['a photo.', 'a video frame.'];

els.search.addEventListener('click', async () => {
  const q = els.queryEn.value.trim();
  if (!q || state.frames.length === 0 || state.busy) return;
  state.busy = true;
  updateButtons();
  try {
    await ensureModel();
    const embs = await engine.embedTexts([...TEMPLATES.map((t) => t.replace('{}', q)), ...BASELINE]);
    const qv = meanNormalized(embs.slice(0, TEMPLATES.length));
    const bv = meanNormalized(embs.slice(TEMPLATES.length));
    const raw = [], scores = [];
    for (const f of state.frames) {
      let best = -Infinity, bestRaw = -Infinity;
      for (const c of f.crops) {
        const s = dot(qv, c);
        const rel = s - dot(bv, c);
        if (rel > best) { best = rel; bestRaw = s; }
      }
      scores.push(best); raw.push(bestRaw);
    }
    state.scores = smooth(scores);
    renderResults(findMoments(state.scores, raw));
  } catch (e) {
    console.error(e);
    els.analyzeStatus.textContent = `Błąd wyszukiwania: ${e.message}`;
  } finally {
    state.busy = false;
    updateButtons();
  }
});

function smooth(s) {
  if (s.length < 3) return s.slice();
  return s.map((v, i) => {
    const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
    return 0.5 * v + 0.25 * a + 0.25 * b;
  });
}

function findMoments(scores, raw, maxResults = 6) {
  const n = scores.length;
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(n / 2)];
  const max = sorted[n - 1];
  const range = max - median || 1e-6;
  const minGapFrames = Math.max(1, Math.round(Math.max(3, 3 * state.interval) / state.interval));
  const order = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]);
  const picked = [];
  for (const i of order) {
    if (picked.length >= maxResults) break;
    if (scores[i] <= median && picked.length > 0) break;
    if (picked.some((p) => Math.abs(p.peak - i) < minGapFrames || (i >= p.from && i <= p.to))) continue;
    const limit = scores[i] - 0.35 * (scores[i] - median);
    const taken = (k) => picked.some((p) => k >= p.from && k <= p.to);
    let from = i, to = i;
    while (from > 0 && scores[from - 1] >= limit && !taken(from - 1)) from--;
    while (to < n - 1 && scores[to + 1] >= limit && !taken(to + 1)) to++;
    // skip weak bits that only sit right next to a better moment
    if (picked.some((p) => from - p.to <= minGapFrames && p.from - to <= minGapFrames)) continue;
    picked.push({ peak: i, from, to, match: Math.max(0, (scores[i] - median) / range), raw: raw[i] });
  }
  return picked;
}

function confidence(rawSim) {
  // typical CLIP ViT-B/32 cosine similarities: ~0.30+ is a strong match, <0.25 weak
  if (rawSim >= 0.29) return 'wysoka';
  if (rawSim >= 0.25) return 'średnia';
  return 'niska';
}

function renderResults(moments) {
  els.resultsCard.hidden = false;
  drawTimeline(moments);
  els.results.innerHTML = '';
  if (moments.length === 0) {
    els.results.innerHTML = '<li>Nic nie znaleziono. Spróbuj innego opisu.</li>';
    return;
  }
  for (const m of moments) {
    const f = state.frames[m.peak];
    const tFrom = state.frames[m.from].t, tTo = state.frames[m.to].t;
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.src = f.thumb; img.alt = `Klatka z ${fmtTime(f.t)}`;
    const info = document.createElement('div');
    info.style.flex = '1';
    const range = m.to > m.from ? `${fmtTime(tFrom)}–${fmtTime(tTo)}` : fmtTime(f.t);
    info.innerHTML = `<div class="time">▶ ${range}</div>
      <div class="score">dopasowanie ${Math.round(m.match * 100)}% · pewność ${confidence(m.raw)}</div>
      <div class="bar"><div style="width:${Math.round(m.match * 100)}%"></div></div>`;
    li.append(img, info);
    li.addEventListener('click', () => playFrom(Math.max(0, tFrom - 0.5)));
    els.results.append(li);
  }
}

function playFrom(t) {
  els.video.currentTime = t;
  els.video.play().catch(() => {});
  els.video.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function drawTimeline(moments) {
  const c = els.timeline;
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth || 300, h = 60;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const s = state.scores;
  if (!s || s.length === 0) return;
  const min = Math.min(...s), max = Math.max(...s), range = max - min || 1;
  const css = getComputedStyle(document.documentElement);
  ctx.fillStyle = css.getPropertyValue('--good').trim() || '#1a7f37';
  for (const m of moments) {
    const x0 = (m.from / s.length) * w, x1 = ((m.to + 1) / s.length) * w;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(x0, 0, Math.max(2, x1 - x0), h);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = css.getPropertyValue('--accent').trim() || '#1f6feb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  s.forEach((v, i) => {
    const x = s.length === 1 ? w / 2 : (i / (s.length - 1)) * w;
    const y = h - 4 - ((v - min) / range) * (h - 8);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}

els.timeline.addEventListener('click', (e) => {
  if (!state.frames.length) return;
  const r = els.timeline.getBoundingClientRect();
  const i = Math.min(state.frames.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * state.frames.length)));
  playFrom(state.frames[i].t);
});

// ---------- start ----------
(async () => {
  await registerServiceWorker();
  if (await modelIsCached()) ensureModel().catch(() => {});
})();
