// Allgemeine Hilfsfunktionen

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let uidCounter = 0;
export const uid = (p = 'u') => `${p}${++uidCounter}`;

/* ---------- Speicher ---------- */
const PREFIX = 'hb.';
export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
    catch { return false; }
  },
  remove(key) { try { localStorage.removeItem(PREFIX + key); } catch { /* ignorieren */ } },
  clearCache() {
    try {
      Object.keys(localStorage).filter(k => k.startsWith(PREFIX + 'cache.')).forEach(k => localStorage.removeItem(k));
    } catch { /* ignorieren */ }
  }
};

/* ---------- Netzwerk ---------- */
export class FetchError extends Error {
  constructor(message, { status = 0, offline = false } = {}) {
    super(message);
    this.status = status;
    this.offline = offline;
  }
}

/**
 * fetch mit Timeout, einem Wiederholungsversuch und optionalem Cache in localStorage.
 * Bei Netzwerkfehlern wird – falls vorhanden – der zuletzt gespeicherte Stand geliefert
 * (Ergebnis enthält dann stale: true).
 */
export async function fetchJSON(url, { timeout = 12000, retries = 1, cacheKey = null, maxAge = 0, type = 'json' } = {}) {
  if (cacheKey && maxAge > 0) {
    const c = storage.get('cache.' + cacheKey);
    if (c && Date.now() - c.t < maxAge) return { data: c.data, time: c.t, stale: false, cached: true };
  }
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) {
        let reason = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j && j.reason) reason = j.reason; } catch { /* egal */ }
        throw new FetchError(reason, { status: res.status });
      }
      const data = type === 'text' ? await res.text() : await res.json();
      const t = Date.now();
      if (cacheKey) storage.set('cache.' + cacheKey, { t, data });
      return { data, time: t, stale: false, cached: false };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e instanceof FetchError ? e : new FetchError(
        e.name === 'AbortError' ? 'Zeitüberschreitung bei der Anfrage' : 'Netzwerkfehler',
        { offline: !navigator.onLine }
      );
      // 4xx nicht wiederholen
      if (lastErr.status >= 400 && lastErr.status < 500) break;
      if (attempt < retries) await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
    }
  }
  if (cacheKey) {
    const c = storage.get('cache.' + cacheKey);
    if (c) return { data: c.data, time: c.t, stale: true, cached: true, error: lastErr };
  }
  throw lastErr;
}

/* ---------- DOM ---------- */
export function html(strings, ...vals) {
  return strings.reduce((acc, s, i) => acc + s + (i < vals.length ? (vals[i] ?? '') : ''), '');
}

export function setHTML(el, markup) {
  el.innerHTML = markup;
  return el;
}

export function haptic() {
  try { navigator.vibrate && navigator.vibrate(8); } catch { /* nicht unterstützt */ }
}

export function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Glatte Kurve (Catmull-Rom → Bézier) für SVG-Pfade */
export function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const t = 0.18;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
