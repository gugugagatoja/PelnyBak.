import { translatePlToEn } from './translate.js';
import { MODELS, DEFAULT_MODEL } from './models.js';
import { APP_VERSION } from './version.js';

document.getElementById('app-version').textContent = `v${APP_VERSION}`;
document.title = `Szukaj w filmie v${APP_VERSION}`;

const $ = (id) => document.getElementById(id);
const els = {
  modelStatus: $('model-status'), modelChoice: $('model-choice'), modelProgress: $('model-progress'), modelHint: $('model-hint'),
  file: $('file'), video: $('video'), videoWrap: $('video-wrap'),
  roiLayer: $('roi-layer'), roiBox: $('roi-box'), roiRow: $('roi-row'), roiEdit: $('roi-edit'), roiClear: $('roi-clear'), roiHint: $('roi-hint'), intervalRow: $('interval-row'), interval: $('interval'),
  analyze: $('analyze'), motionOnly: $('motion-only'), analyzeProgress: $('analyze-progress'), analyzeStatus: $('analyze-status'),
  query: $('query'), queryEn: $('query-en'), search: $('search'),
  resultsCard: $('results-card'), results: $('results'), timeline: $('timeline'),
};

const CROP = 224; // CLIP input size
// Desktop (.exe) version, or ?local for tests: model and AI runtime ship with the app, nothing is downloaded.
const LOCAL = location.protocol === 'app:' || new URLSearchParams(location.search).has('local');

// ---------- PWA / offline ----------
async function registerServiceWorker() {
  if (LOCAL || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('sw.js');
    // never wait forever: if the browser blocks service workers, just carry on without them
    const ready = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 5000))]);
    if (!ready) return;
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

// ---------- CPU / memory status bar ----------
// Time the AI spends working (a browser cannot read the CPU load, but the AI is almost all of the app's work).
let aiBusyMs = 0;
async function timed(fn) {
  const start = performance.now();
  try { return await fn(); } finally { aiBusyMs += performance.now() - start; }
}
function startMetrics() {
  const box = document.getElementById('metrics');
  let lastT = performance.now(), lastBusy = aiBusyMs;
  const fmt = (label, value, hot) => `<span>${label}: <b${hot ? ' class="hot"' : ''}>${value}</b></span>`;
  const tick = async () => {
    if (document.hidden) return;
    const now = performance.now();
    const aiPct = Math.min(100, Math.round((100 * (aiBusyMs - lastBusy)) / (now - lastT || 1)));
    lastT = now; lastBusy = aiBusyMs;
    const parts = [];
    if (window.desktop?.metrics) {
      try {
        const m = await window.desktop.metrics();
        parts.push(fmt('Procesor', `${m.cpuPercent}% (${m.cores} rdz.)`, m.cpuPercent >= 90));
        parts.push(fmt('Pamięć programu', `${m.appMemMB} MB`));
        const gb = (x) => String(x).replace('.', ',');
        parts.push(fmt('RAM', `${gb(m.ramUsedGB)} / ${gb(m.ramTotalGB)} GB`, m.ramUsedGB / m.ramTotalGB > 0.9));
      } catch {}
    } else {
      parts.push(fmt('Praca AI', `${aiPct}% czasu`, aiPct >= 90));
      const mem = performance.memory;
      if (mem) parts.push(fmt('Pamięć aplikacji', `${Math.round(mem.usedJSHeapSize / 1048576)} MB`));
      if (navigator.deviceMemory) parts.push(fmt('RAM urządzenia', `ok. ${navigator.deviceMemory} GB`));
      if (navigator.hardwareConcurrency) parts.push(fmt('Rdzenie', navigator.hardwareConcurrency));
    }
    box.innerHTML = parts.join('');
  };
  tick();
  setInterval(tick, 1000);
}
startMetrics();

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
  // timeoutMs: give up if the AI does not answer (e.g. the phone killed the worker to free memory)
  const call = (msg, transfer, timeoutMs = 0) => new Promise((resolve, reject) => {
    if (!worker) start();
    const id = msg.type === 'load' ? 'load' : nextId++;
    if (msg.type !== 'load') msg.id = id;
    const timer = timeoutMs && setTimeout(() => {
      pending.delete(id);
      reject(Object.assign(new Error('AI nie odpowiada'), { timeout: true }));
    }, timeoutMs);
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    worker.postMessage(msg, transfer || []);
  });

  return {
    // stop everything (e.g. after a broken download) so the next load starts clean;
    // files that finished downloading stay in the browser cache and are not fetched again
    reset() {
      if (worker) worker.terminate();
      worker = null;
      readyPromise = null;
      for (const p of pending.values()) p.reject(new Error('przerwano'));
      pending.clear();
    },
    load(progressCb) {
      if (progressCb) onProgress = progressCb;
      if (!readyPromise) {
        const m = MODELS[state.modelKey];
        readyPromise = call({ type: 'load', local: LOCAL, model: { id: m.id, family: m.family, dtype: m.dtype } });
        readyPromise.catch(() => { readyPromise = null; });
      }
      return readyPromise;
    },
    async embedImage(imageData) {
      const buffer = imageData.data.buffer.slice(0);
      const r = await timed(() => call({ type: 'image', width: imageData.width, height: imageData.height, buffer }, [buffer], 60000));
      return r.emb;
    },
    async embedTexts(texts) {
      const r = await timed(() => call({ type: 'text', texts }, null, 60000));
      return r.embs;
    },
  };
}

// Tests can inject a fake engine (no model download) via window.__createTestEngine.
const engine = (window.__createTestEngine || createWorkerEngine)();

// ---------- state ----------
const state = {
  modelKey: DEFAULT_MODEL,
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
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
const fmtMB = (b) => `${(b / 1048576).toFixed(0)} MB`;

let loadGeneration = 0; // bumped when the model is switched, so an abandoned load stays quiet
async function ensureModel() {
  if (state.modelReady) return;
  const gen = loadGeneration;
  els.modelStatus.textContent = 'wczytywanie…';
  els.modelStatus.classList.remove('ok');
  setProgress(els.modelProgress, 0);
  const ATTEMPTS = LOCAL ? 1 : 5;
  await swReady; // let the service worker control the page first, so downloads get cached for offline use
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        await engine.load((loaded, total) => {
          setProgress(els.modelProgress, loaded / total);
          els.modelHint.textContent = `Pobieranie modelu: ${fmtMB(loaded)} z ${fmtMB(total)}…`
            + (attempt > 1 ? ` (próba ${attempt} z ${ATTEMPTS})` : '');
        });
        break;
      } catch (e) {
        if (attempt >= ATTEMPTS || gen !== loadGeneration) throw e;
        console.warn('Model download failed, retrying:', e);
        engine.reset?.();
        els.modelHint.textContent = `Połączenie przerwane (${e.message}). Ponawiam za chwilę… (próba ${attempt + 1} z ${ATTEMPTS})`;
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  } catch (e) {
    if (gen !== loadGeneration) throw e; // the user switched models meanwhile; not a real error
    els.modelStatus.textContent = 'błąd';
    els.modelHint.textContent = `Nie udało się wczytać modelu (${e.message}). ` + (LOCAL
      ? 'Brakuje plików modelu w folderze programu. Pobierz i rozpakuj program jeszcze raz.'
      : 'Za pierwszym razem potrzebny jest internet. Najlepiej połącz się z Wi-Fi i kliknij „Przeanalizuj film” jeszcze raz. Już pobrane części modelu zostaną zachowane.');
    setProgress(els.modelProgress, null);
    throw e;
  }
  if (gen !== loadGeneration) return ensureModel(); // finished loading a model that is no longer chosen
  state.modelReady = true;
  setProgress(els.modelProgress, null);
  els.modelStatus.textContent = `${MODELS[state.modelKey].label.toLowerCase()}: gotowy (offline)`;
  els.modelStatus.classList.add('ok');
  els.modelHint.textContent = LOCAL
    ? 'Model jest wbudowany w program. Nic nie jest pobierane ani wysyłane.'
    : 'Model jest zapisany na tym urządzeniu. Aplikacja działa bez internetu.';
}

async function modelIsCached(key = state.modelKey) {
  try {
    if (!('caches' in window)) return false;
    const id = MODELS[key].id;
    const cache = await caches.open('transformers-cache');
    const keys = (await cache.keys()).filter((r) => r.url.includes(`/${id}/`));
    return keys.some((r) => r.url.includes('vision_model')) && keys.some((r) => r.url.includes('text_model'));
  } catch { return false; }
}

// ---------- model choice ----------
// desktop: is this model shipped in the program folder? (the "lite" version has only the fast one)
async function modelAvailableLocally(key) {
  try { return (await fetch(`models/${MODELS[key].id}/config.json`, { method: 'HEAD' })).ok; } catch { return false; }
}

function savedModelKey() {
  try { const k = localStorage.getItem('model'); return MODELS[k] ? k : DEFAULT_MODEL; } catch { return DEFAULT_MODEL; }
}

async function setupModelChoice() {
  for (const [key, m] of Object.entries(MODELS)) {
    const input = $(`model-${key}`);
    $(`model-${key}-note`).textContent = `${m.note} · ok. ${m.sizeMB} MB`;
    if (LOCAL && !(await modelAvailableLocally(key))) {
      input.disabled = true;
      input.dataset.unavailable = '1';
      $(`model-${key}-note`).textContent = 'niedostępny w tej wersji programu (pobierz wersję „pełną”)';
    }
  }
  let key = savedModelKey();
  if ($(`model-${key}`).disabled) key = DEFAULT_MODEL;
  state.modelKey = key;
  $(`model-${key}`).checked = true;
  els.modelChoice.addEventListener('change', (e) => {
    if (state.busy) { $(`model-${state.modelKey}`).checked = true; return; }
    switchModel(e.target.value);
  });
}

async function switchModel(key) {
  if (key === state.modelKey || !MODELS[key]) return;
  state.modelKey = key;
  try { localStorage.setItem('model', key); } catch {}
  loadGeneration++;
  engine.reset?.();
  state.modelReady = false;
  els.modelStatus.textContent = 'nie wczytany';
  els.modelStatus.classList.remove('ok');
  els.modelHint.textContent = LOCAL
    ? 'Model zostanie wczytany z folderu programu.'
    : `Za pierwszym razem aplikacja pobierze ten model (ok. ${MODELS[key].sizeMB} MB, najlepiej przez Wi-Fi).`;
  if (state.frames.length) {
    resetResults();
    els.analyzeStatus.textContent = 'Zmieniono model AI. Kliknij „Przeanalizuj film” jeszcze raz.';
  }
  if (LOCAL || await modelIsCached(key)) ensureModel().catch(() => {});
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
  els.roiEdit.disabled = els.roiClear.disabled = !!state.analyzing;
  for (const input of els.modelChoice.querySelectorAll('input')) input.disabled = !!state.busy || input.dataset.unavailable === '1';
  els.analyze.disabled = (state.busy && !state.analyzing) || !state.videoUrl;
  els.search.disabled = state.busy || state.frames.length === 0 || !els.queryEn.value.trim();
}

els.file.addEventListener('change', () => {
  const file = els.file.files[0];
  if (!file) return;
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = URL.createObjectURL(file);
  els.video.src = state.videoUrl;
  setClip(null);
  els.videoWrap.hidden = false;
  els.roiRow.hidden = false;
  els.intervalRow.hidden = false;
  setRoi(null, false);
  setRoiEditing(false);
  els.analyzeStatus.textContent = `Wybrano: ${file.name}`;
  resetResults();
  els.video.addEventListener('loadedmetadata', () => {
    const d = els.video.duration;
    if (Number.isFinite(d)) {
      // long videos: suggest a coarser interval so analysis does not take ages on a phone
      els.interval.value = d > 300 ? '2' : '1';
      els.analyzeStatus.textContent = `Wybrano: ${file.name} (${fmtTime(d)})`;
    }
    renderRoi();
  }, { once: true });
});

// Keep the screen on during long analyses (otherwise the phone may sleep and pause the work).
async function keepAwake() {
  try { return await navigator.wakeLock?.request('screen'); } catch { return null; }
}

// Tiny grayscale copy of a frame, used for cheap motion detection.
function smallGray(ctx, video, R, w, h) {
  ctx.drawImage(video, R.x, R.y, R.w, R.h, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
  return g;
}
function changedFraction(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 25) n++;
  return n / a.length;
}
const MOTION_MIN_CHANGE = 0.002; // >0.2% of pixels changed = something moved (a distant person is ~0.5%)
const MOTION_MAX_GAP = 60;       // re-check with AI at least once a minute anyway (light changes etc.)

// One frame through the AI; if it stops answering, restart it (the model is cached) and try once more.
async function embedWithRetry(imageData, t) {
  try {
    return await engine.embedImage(imageData);
  } catch (e) {
    if (!e.timeout && !/przerwano|Błąd modułu/.test(e.message)) throw e;
    els.analyzeStatus.textContent = `AI przestało odpowiadać przy ${fmtTime(t)}. Uruchamiam je ponownie…`;
    engine.reset?.();
    state.modelReady = false;
    await ensureModel();
    return await engine.embedImage(imageData);
  }
}

els.analyze.addEventListener('click', async () => {
  if (state.analyzing) { state.stop = true; els.analyze.textContent = 'Zatrzymywanie…'; return; }
  if (!state.videoUrl || state.busy) return;
  state.busy = true;
  state.analyzing = true;
  state.stop = false;
  resetResults();
  setClip(null);
  if (roiEditing) setRoiEditing(false);
  els.analyze.textContent = '⏹ Zatrzymaj (wyniki z dotychczasowej części zostaną)';
  updateButtons();
  let wakeLock = null;
  try {
    wakeLock = await keepAwake();
    await ensureModel();
    // Use the visible player itself: phones have few video decoders, and a second hidden
    // copy of the same video often fails to open ("Nie można odczytać filmu").
    const v = els.video;
    v.pause();
    if (v.readyState < 2) await waitFor(v, 'loadeddata');
    const duration = v.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Nieznana długość filmu');
    const W = v.videoWidth, H = v.videoHeight;
    const interval = parseFloat(els.interval.value);
    state.interval = interval;
    state.analysedModel = state.modelKey;

    const cropCanvas = makeCanvas(CROP, CROP);
    const cctx = cropCanvas.getContext('2d', { willReadFrequently: true });
    const thumbW = 192, thumbH = Math.round(192 * H / W) || 108;
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbW; thumbCanvas.height = thumbH;
    const tctx = thumbCanvas.getContext('2d');
    // area to search: the marked rectangle (in video pixels) or the whole frame
    const roi = state.roi;
    const R = roi
      ? { x: Math.round(roi.x * W), y: Math.round(roi.y * H), w: Math.max(8, Math.round(roi.w * W)), h: Math.max(8, Math.round(roi.h * H)) }
      : { x: 0, y: 0, w: W, h: H };
    const rects = cropRects(R.w, R.h).map(([sx, sy, sw, sh]) => [R.x + sx, R.y + sy, sw, sh]);
    const motionOnly = els.motionOnly.checked;
    const gw = R.w >= R.h ? 64 : Math.max(8, Math.round(64 * R.w / R.h));
    const gh = R.w >= R.h ? Math.max(8, Math.round(64 * R.h / R.w)) : 64;
    const gctx = makeCanvas(gw, gh).getContext('2d', { willReadFrequently: true });
    let ref = null; // last frame checked by AI: {gray, crops, thumb, t}
    let aiCount = 0;

    const times = [];
    for (let t = Math.min(0.1, duration / 2); t < duration; t += interval) times.push(t);
    const started = performance.now();
    for (let i = 0; i < times.length && !state.stop; i++) {
      await seek(v, times[i]);
      const gray = motionOnly ? smallGray(gctx, v, R, gw, gh) : null;
      const still = motionOnly && ref && times[i] - ref.t < MOTION_MAX_GAP && changedFraction(gray, ref.gray) < MOTION_MIN_CHANGE;
      if (still) {
        // nothing changed since the last AI check: the scene is the same, reuse its result
        state.frames.push({ t: times[i], crops: ref.crops, thumb: ref.thumb, still: true });
      } else {
        const crops = [];
        for (const [sx, sy, sw, sh] of rects) {
          cctx.drawImage(v, sx, sy, sw, sh, 0, 0, CROP, CROP);
          crops.push(await embedWithRetry(cctx.getImageData(0, 0, CROP, CROP), times[i]));
        }
        tctx.drawImage(v, 0, 0, thumbW, thumbH);
        if (roi) {
          tctx.strokeStyle = '#ffd33d'; tctx.lineWidth = 2;
          tctx.strokeRect(roi.x * thumbW, roi.y * thumbH, roi.w * thumbW, roi.h * thumbH);
        }
        const thumb = thumbCanvas.toDataURL('image/jpeg', 0.6);
        state.frames.push({ t: times[i], crops, thumb });
        ref = { gray, crops, thumb, t: times[i] };
        aiCount++;
      }

      const done = i + 1;
      {
        const perFrame = (performance.now() - started) / done;
        const left = Math.round(((times.length - done) * perFrame) / 1000);
        setProgress(els.analyzeProgress, done / times.length);
        els.analyzeStatus.textContent = `Analiza: ${fmtTime(times[i])} z ${fmtTime(duration)}`
          + (motionOnly ? ` · ruch w ${aiCount} z ${done} klatek` : '')
          + (done < times.length ? ` · zostało ok. ${fmtTime(left)}` : '');
      }
    }
    v.currentTime = 0;
    const analysed = state.frames.length ? fmtTime(state.frames[state.frames.length - 1].t) : '0:00';
    els.analyzeStatus.textContent = (state.stop ? `Zatrzymano na ${analysed}. ` : 'Gotowe: ')
      + `sprawdzono ${state.frames.length} klatek`
      + (roi ? ' w zaznaczonym obszarze' : '')
      + (motionOnly ? ` (AI obejrzało ${aiCount} z ruchem)` : '')
      + '. Teraz opisz, czego szukasz. Możesz szukać wiele razy.';
    setProgress(els.analyzeProgress, null);
  } catch (e) {
    console.error(e);
    els.analyzeStatus.textContent = `Błąd: ${e.message}`;
    setProgress(els.analyzeProgress, null);
  } finally {
    wakeLock?.release?.().catch?.(() => {});
    state.busy = false;
    state.analyzing = false;
    els.analyze.textContent = 'Przeanalizuj film';
    updateButtons();
  }
});

// ---------- area of interest (rectangle drawn on the video) ----------
// state.roi = null (whole frame) or {x, y, w, h} as fractions of the video frame (0..1).
state.roi = null;
let roiEditing = false;

// where the picture actually is inside the <video> element (it is letterboxed)
function contentRect() {
  const v = els.video, cw = v.clientWidth, ch = v.clientHeight;
  const vw = v.videoWidth || 16, vh = v.videoHeight || 9;
  const scale = Math.min(cw / vw, ch / vh);
  const w = vw * scale, h = vh * scale;
  return { left: (cw - w) / 2, top: (ch - h) / 2, width: w, height: h };
}

function renderRoi() {
  const r = state.roi;
  els.roiBox.hidden = !r;
  if (r) {
    const c = contentRect();
    Object.assign(els.roiBox.style, {
      left: `${c.left + r.x * c.width}px`, top: `${c.top + r.y * c.height}px`,
      width: `${r.w * c.width}px`, height: `${r.h * c.height}px`,
    });
  }
  els.roiClear.hidden = !r;
  els.roiHint.hidden = !(r || roiEditing);
  els.roiHint.textContent = roiEditing
    ? (r ? 'Przesuń prostokąt palcem albo rozciągnij go za żółte kółka. Możesz też narysować nowy. Potem kliknij „Gotowe”.'
         : 'Narysuj palcem prostokąt na filmie w miejscu, gdzie chcesz szukać.')
    : 'AI szuka tylko w zaznaczonym obszarze. Ruch poza nim jest pomijany.';
}

function setRoi(roi, changedByUser = true) {
  state.roi = roi;
  renderRoi();
  if (changedByUser && state.frames.length) {
    resetResults();
    els.analyzeStatus.textContent = 'Obszar zmieniony. Kliknij „Przeanalizuj film” jeszcze raz.';
  }
}

function setRoiEditing(on) {
  roiEditing = on;
  els.roiLayer.classList.toggle('editing', on);
  els.roiEdit.classList.toggle('active', on);
  els.roiEdit.textContent = on ? '✔ Gotowe' : (state.roi ? '▭ Zmień obszar' : '▭ Zaznacz obszar');
  if (on) els.video.pause();
  renderRoi();
}

els.roiEdit.addEventListener('click', () => {
  if (state.analyzing) return;
  setRoiEditing(!roiEditing);
});
els.roiClear.addEventListener('click', () => {
  if (state.analyzing) return;
  setRoi(null);
  setRoiEditing(false);
});
window.addEventListener('resize', renderRoi);

{
  let drag = null; // {mode, start: {x,y}, roi}
  const MIN = 0.04;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const point = (e) => {
    const c = contentRect(), b = els.roiLayer.getBoundingClientRect();
    return { x: clamp((e.clientX - b.left - c.left) / c.width, 0, 1), y: clamp((e.clientY - b.top - c.top) / c.height, 0, 1) };
  };
  els.roiLayer.addEventListener('pointerdown', (e) => {
    if (!roiEditing) return;
    e.preventDefault();
    els.roiLayer.setPointerCapture(e.pointerId);
    const p = point(e);
    const handle = e.target.dataset?.h;
    if (handle && state.roi) drag = { mode: handle, start: p, roi: { ...state.roi } };
    else if (state.roi && els.roiBox.contains(e.target)) drag = { mode: 'move', start: p, roi: { ...state.roi } };
    else drag = { mode: 'draw', start: p, roi: null };
  });
  els.roiLayer.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = point(e), s = drag.start, r = drag.roi;
    let n;
    if (drag.mode === 'draw') {
      n = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
    } else if (drag.mode === 'move') {
      n = { ...r, x: clamp(r.x + p.x - s.x, 0, 1 - r.w), y: clamp(r.y + p.y - s.y, 0, 1 - r.h) };
    } else {
      let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
      if (drag.mode.includes('w')) x0 = Math.min(p.x, x1 - MIN);
      if (drag.mode.includes('e')) x1 = Math.max(p.x, x0 + MIN);
      if (drag.mode.includes('n')) y0 = Math.min(p.y, y1 - MIN);
      if (drag.mode.includes('s')) y1 = Math.max(p.y, y0 + MIN);
      n = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    state.roi = n;
    renderRoi();
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    const r = state.roi;
    setRoi(r && r.w >= MIN && r.h >= MIN ? r : null); // a tap without dragging does not leave a tiny box
  };
  els.roiLayer.addEventListener('pointerup', end);
  els.roiLayer.addEventListener('pointercancel', end);
}

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
  // thresholds of the raw image-text similarity, per model (CLIP: ~0.30+ strong, <0.25 weak)
  const [high, mid] = MODELS[state.analysedModel || state.modelKey].conf;
  if (rawSim >= high) return 'wysoka';
  if (rawSim >= mid) return 'średnia';
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
    // play only the found time window (+ a little margin); a frame stands for the time until the next one
    li.addEventListener('click', () => playClip(Math.max(0, tFrom - 0.5), tTo + state.interval + 0.5));
    els.results.append(li);
  }
}

// ---------- clip mode: play only the found time window ----------
// state.clip = {from, to} while a result's window is being played; at its end the video stops and
// goes back to the start of the window, so pressing play shows the same window again.
state.clip = null;
let internalSeek = false; // true while the app itself moves the video (not the user)
const clipEls = { bar: document.getElementById('clip-bar'), label: document.getElementById('clip-label'),
  replay: document.getElementById('clip-replay'), exit: document.getElementById('clip-exit') };

function setClip(clip) {
  state.clip = clip;
  clipEls.bar.hidden = !clip;
  if (clip) clipEls.label.textContent = `Odtwarzam tylko znaleziony fragment ${fmtTime(clip.from)}–${fmtTime(clip.to)}. Na końcu film się zatrzyma, ▶ odtworzy go jeszcze raz.`;
}
function clipEnded() {
  const v = els.video;
  v.pause();
  internalSeek = true;
  v.currentTime = state.clip.from;
}
function playClip(from, to) {
  const d = els.video.duration;
  setClip({ from, to: Number.isFinite(d) ? Math.min(to, d) : to });
  playFrom(from);
}
els.video.addEventListener('timeupdate', () => {
  if (state.clip && !state.analyzing && els.video.currentTime >= state.clip.to - 0.05) clipEnded();
});
els.video.addEventListener('ended', () => { if (state.clip && !state.analyzing) clipEnded(); });
els.video.addEventListener('play', () => {
  const c = state.clip, v = els.video;
  if (c && !state.analyzing && (v.currentTime < c.from - 0.3 || v.currentTime >= c.to - 0.1)) {
    internalSeek = true;
    v.currentTime = c.from;
  }
});
els.video.addEventListener('seeking', () => {
  if (internalSeek || state.analyzing || !state.clip) return;
  // the user dragged the video outside the window: back to the whole film
  const t = els.video.currentTime;
  if (t < state.clip.from - 1 || t > state.clip.to + 1) setClip(null);
});
els.video.addEventListener('seeked', () => { internalSeek = false; });
clipEls.replay.addEventListener('click', () => state.clip && playFrom(state.clip.from));
clipEls.exit.addEventListener('click', () => setClip(null));

// Jump to a moment and play. After a long analysis (especially with the bigger model) a phone may
// have released the player's video decoder; then the video is reloaded and we try again.
async function playFrom(t) {
  const v = els.video;
  v.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const reload = async () => {
    v.src = state.videoUrl;
    v.load();
    await waitFor(v, 'loadeddata');
  };
  const attempt = async () => {
    if (v.error || v.readyState < 2) await reload();
    internalSeek = true;
    v.currentTime = t;
    await waitFor(v, 'seeked', 5000);
    await v.play();
  };
  try {
    await attempt();
  } catch {
    try {
      await reload();
      await attempt();
    } catch (e) {
      els.analyzeStatus.textContent = `Nie udało się uruchomić filmu (${e.message}). Przewiń go ręcznie do ${fmtTime(t)}.`;
    }
  }
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
  setClip(null);
  playFrom(state.frames[i].t);
});

// ---------- start ----------
const swReady = registerServiceWorker();
(async () => {
  await swReady;
  await setupModelChoice();
  if (LOCAL) {
    els.modelHint.textContent = 'Model jest wbudowany w program. Nic nie jest pobierane ani wysyłane.';
    ensureModel().catch(() => {});
  } else if (await modelIsCached()) ensureModel().catch(() => {});
})();
