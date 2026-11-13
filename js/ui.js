// UI-Bausteine: Bottom-Sheet, Toast, Pull-to-Refresh, Wischgesten
import { $ } from './util.js';

/* ---------- Bottom-Sheet ---------- */
let sheetOnClose = null;
let lastFocus = null;

export function openSheet(markup, { onClose = null, onMount = null, cls = '' } = {}) {
  const sheet = $('#sheet'), body = $('#sheet-body'), bd = $('#sheet-backdrop');
  if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
  lastFocus = document.activeElement;
  body.innerHTML = markup;
  body.scrollTop = 0;
  sheet.className = 'sheet ' + cls;
  sheet.hidden = false;
  bd.hidden = false;
  sheet.style.transform = '';
  requestAnimationFrame(() => { sheet.classList.add('open'); bd.classList.add('open'); });
  sheetOnClose = onClose;
  onMount && onMount(body);
  setTimeout(() => $('#sheet-close').focus({ preventScroll: true }), 50);
}

export function closeSheet() {
  const sheet = $('#sheet'), bd = $('#sheet-backdrop');
  if (sheet.hidden) return;
  sheet.classList.remove('open');
  bd.classList.remove('open');
  sheet.style.transform = '';
  setTimeout(() => { sheet.hidden = true; bd.hidden = true; $('#sheet-body').innerHTML = ''; }, 280);
  if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
  lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
}

export function sheetOpen() { return !$('#sheet').hidden; }

export function initSheet() {
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet-backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  // Nach unten wischen zum Schließen
  const sheet = $('#sheet'), grip = $('#sheet-grip'), body = $('#sheet-body');
  let y0 = null, dy = 0;
  const start = e => {
    if (e.target.closest('[data-noswipe]')) return;
    if (e.currentTarget === body && body.scrollTop > 0) return;
    y0 = e.touches[0].clientY; dy = 0;
    sheet.style.transition = 'none';
  };
  const move = e => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (y0 == null) return;
    sheet.style.transition = '';
    if (dy > 110) closeSheet(); else sheet.style.transform = '';
    y0 = null;
  };
  [grip, body].forEach(el => {
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', end);
  });
}

/* ---------- Toast ---------- */
let toastTimer;
export function toast(msg, { type = 'info', ms = 3200 } = {}) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => (t.hidden = true), 300);
  }, ms);
}

/* ---------- Pull-to-Refresh ---------- */
export function initPullToRefresh(scroller, indicator, onRefresh) {
  let y0 = null, dist = 0, busy = false;
  const label = indicator.querySelector('.ptr-label');
  scroller.addEventListener('touchstart', e => {
    if (busy || scroller.scrollTop > 0) return;
    y0 = e.touches[0].clientY; dist = 0;
  }, { passive: true });
  scroller.addEventListener('touchmove', e => {
    if (y0 == null) return;
    dist = e.touches[0].clientY - y0;
    if (dist <= 0) { indicator.style.transform = ''; return; }
    const d = Math.min(110, dist * 0.5);
    indicator.style.transform = `translateY(${d}px)`;
    indicator.style.opacity = Math.min(1, d / 60);
    indicator.classList.toggle('ready', d >= 60);
    label.textContent = d >= 60 ? 'Loslassen zum Aktualisieren' : 'Zum Aktualisieren ziehen';
  }, { passive: true });
  scroller.addEventListener('touchend', async () => {
    if (y0 == null) return;
    const ready = indicator.classList.contains('ready');
    y0 = null;
    if (ready) {
      busy = true;
      indicator.classList.add('loading');
      label.textContent = 'Wird aktualisiert …';
      indicator.style.transform = 'translateY(60px)';
      try { await onRefresh(); } finally {
        busy = false;
        indicator.classList.remove('loading', 'ready');
        indicator.style.transform = '';
        indicator.style.opacity = 0;
      }
    } else {
      indicator.style.transform = '';
      indicator.style.opacity = 0;
      indicator.classList.remove('ready');
    }
  });
}

/* ---------- Horizontale Wischgesten zwischen Bereichen ---------- */
export function initSwipeNav(root, onSwipe) {
  let x0 = null, y0 = null, t0 = 0, blocked = false;
  root.addEventListener('touchstart', e => {
    const t = e.target;
    blocked = !!t.closest('[data-noswipe], .leaflet-container, input, select, textarea');
    if (blocked || e.touches.length > 1) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
  }, { passive: true });
  root.addEventListener('touchend', e => {
    if (x0 == null || blocked) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Date.now() - t0 > 600) return;
    if (Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.5) onSwipe(dx < 0 ? 1 : -1);
  });
}
