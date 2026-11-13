// Himmelblick – Einstiegspunkt: Navigation, Datenladen, Rendering
import { store } from './store.js';
import { $, $$ } from './util.js';
import { getForecast, getAir, getAlerts, getDwdPollen, reverseGeocode } from './api.js';
import { current } from './model.js';
import { sceneOf } from './icons.js';
import { fmtTime, fmtDate, WEEKDAYS_SHORT, MONTHS_SHORT } from './format.js';
import { initSky, setScene, setAnimationsEnabled, start as skyStart, stop as skyStop } from './background.js';
import { initSheet, toast, initPullToRefresh, initSwipeNav, closeSheet, sheetOpen } from './ui.js';
import { renderHome } from './views/home.js';
import { renderForecast } from './views/forecast.js';
import { renderWarnings, warningCount } from './views/warnings.js';
import { renderMore } from './views/more.js';
import { openLocationSheet } from './views/locations.js';
import { radarVisible, radarHidden, radarLocationChanged, radarThemeChanged, radarSettingsChanged, radarDataChanged } from './views/radar.js';

const TABS = ['wetter', 'radar', 'vorhersage', 'warnungen', 'mehr'];
const DEFAULT_LOC = { name: 'Berlin', admin1: 'Berlin', country: 'Deutschland', cc: 'DE', lat: 52.5244, lon: 13.4105 };
let activeTab = null;
let refreshTimer = null;
let loadSeq = 0;

/* ================= Theme ================= */
// 'auto' = nach Tageszeit am gewählten Ort (Tag hell, Nacht dunkel), 'system' = Systemeinstellung
function isNightAtLocation() {
  const fc = store.data.forecast;
  if (fc?.current) return fc.current.is_day === 0;
  const h = new Date().getHours();
  return h < 7 || h >= 19;
}
function applyTheme() {
  const t = store.settings.theme;
  const dark = t === 'dark'
    || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    || (t === 'auto' && isNightAtLocation());
  const prev = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  updateScene();
  if (prev && prev !== document.documentElement.dataset.theme) radarThemeChanged();
}

function updateScene() {
  const fc = store.data.forecast;
  const theme = document.documentElement.dataset.theme;
  if (!fc) { setScene({ scene: 'partly', day: true, theme }); return; }
  const c = current(fc);
  setScene({ scene: sceneOf(c.code, c.isDay), day: c.isDay, precip: c.precip, wind: c.wind, windDir: c.dir, theme });
  document.documentElement.dataset.daytime = c.isDay ? 'day' : 'night';
}

/* ================= Navigation ================= */
function navigate(tab, { fromHash = false } = {}) {
  if (!TABS.includes(tab)) tab = 'wetter';
  if (tab === activeTab) {
    // Erneutes Antippen: nach oben scrollen
    $(`#view-${tab}`).scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const prev = activeTab;
  const dir = prev ? Math.sign(TABS.indexOf(tab) - TABS.indexOf(prev)) : 0;
  activeTab = tab;
  if (sheetOpen()) closeSheet();
  $$('.view').forEach(v => {
    const on = v.dataset.view === tab;
    v.classList.toggle('active', on);
    v.classList.remove('enter-left', 'enter-right');
    if (on && dir) { void v.offsetWidth; v.classList.add(dir > 0 ? 'enter-right' : 'enter-left'); }
    v.setAttribute('aria-hidden', on ? 'false' : 'true');
  });
  $$('.tab').forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
  });
  document.body.dataset.tab = tab;
  if (!fromHash && location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
  if (tab === 'radar') { radarVisible(); skyStop(); } else { radarHidden(); if (store.settings.animations) skyStart(); }
  renderView(tab);
}

function renderView(tab) {
  const ctx = { navigate, retry: () => loadAll({ force: true }) };
  try {
    if (tab === 'wetter') renderHome($('#home'), ctx);
    if (tab === 'vorhersage') renderForecast($('#forecast'));
    if (tab === 'warnungen') renderWarnings($('#warnings'));
    if (tab === 'mehr') renderMore($('#more'), { onSelectLocation: selectLocation });
  } catch (e) {
    console.error('Renderfehler', e);
  }
}

function hideSplash() {
  const s = document.getElementById('splash');
  if (!s || s.classList.contains('out')) return;
  s.classList.add('out');
  setTimeout(() => s.remove(), 600);
}

function renderAll() {
  if (store.data.forecast || store.meta.error) hideSplash();
  radarDataChanged();
  renderHeader();
  renderView(activeTab);
  // Startbildschirm immer aktuell halten (für schnelles Zurückwechseln)
  if (activeTab !== 'wetter') renderView('wetter');
  const n = warningCount();
  const badge = $('#warn-badge');
  badge.hidden = n === 0;
  badge.textContent = n > 9 ? '9+' : n;
}

/* ================= Kopfzeile ================= */
function renderHeader() {
  const loc = store.location;
  $('#loc-name').textContent = loc ? loc.name : 'Ort wählen';
  const fav = $('#fav-btn');
  const isFav = store.isFavorite(loc);
  fav.classList.toggle('on', isFav);
  fav.setAttribute('aria-pressed', isFav);
  fav.setAttribute('aria-label', isFav ? 'Aus Favoriten entfernen' : 'Als Favorit speichern');
  $('#gps-btn').classList.toggle('on', !!loc?.gps);
  updateClock();
}

function updateClock() {
  const fc = store.data.forecast;
  const el = $('#loc-time');
  if (!fc) { el.textContent = fmtDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60000)); return; }
  const now = new Date(Date.now() + (fc.utc_offset_seconds || 0) * 1000);
  const deviceOffset = -new Date().getTimezoneOffset() * 60;
  const tzNote = deviceOffset !== fc.utc_offset_seconds ? ` (${fc.timezone_abbreviation || 'Ortszeit'})` : '';
  el.textContent = `${WEEKDAYS_SHORT[now.getUTCDay()]}., ${now.getUTCDate()}. ${MONTHS_SHORT[now.getUTCMonth()]} · ${fmtTime(now)}${tzNote}`;
}

/* ================= Daten laden ================= */
async function loadAll({ force = false } = {}) {
  const loc = store.location;
  if (!loc) return;
  const seq = ++loadSeq;
  store.meta.loading = true;
  document.body.classList.add('loading');
  $('#refresh-btn').classList.add('spin');
  try {
    const res = await getForecast(loc, { force });
    if (seq !== loadSeq) return;
    store.data.forecast = res.data;
    store.meta.updated = res.time;
    store.meta.stale = !!res.stale;
    store.meta.error = null;
    if (res.stale) toast('Keine Verbindung – zeige zuletzt gespeicherte Daten.', { type: 'warn' });
    applyTheme();
    renderAll();
  } catch (e) {
    if (seq !== loadSeq) return;
    store.meta.error = e;
    if (!store.data.forecast) renderAll();
    toast(e.offline ? 'Keine Internetverbindung.' : `Laden fehlgeschlagen: ${e.message}`, { type: 'error' });
  } finally {
    if (seq === loadSeq) {
      store.meta.loading = false;
      document.body.classList.remove('loading');
      $('#refresh-btn').classList.remove('spin');
    }
  }
  if (seq !== loadSeq || !store.data.forecast) return;
  // Zusatzdaten parallel und fehlertolerant laden
  const tz = store.data.forecast.timezone;
  const tasks = [
    getAlerts(loc, tz, { force }).then(r => { store.data.alerts = r.data; store.meta.alertsUpdated = r.time; store.meta.alertsError = null; })
      .catch(e => { store.data.alerts = null; store.meta.alertsError = e.message; }),
    getAir(loc, { force }).then(r => { store.data.air = r.data; store.meta.airError = null; })
      .catch(e => { store.data.air = null; store.meta.airError = e.message; }),
    (loc.cc === 'DE' ? getDwdPollen().then(r => { store.data.pollen = r.data; }).catch(() => { store.data.pollen = null; }) : Promise.resolve(store.data.pollen = null))
  ];
  await Promise.allSettled(tasks);
  if (seq === loadSeq) renderAll();
  scheduleRefresh();
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  const min = store.settings.autoRefresh;
  if (!min) return;
  refreshTimer = setTimeout(() => {
    if (!document.hidden && navigator.onLine) loadAll({ force: true });
    else scheduleRefresh();
  }, min * 60000);
}

/* ================= Standort ================= */
function selectLocation(loc) {
  store.setLocation(loc);
  store.data = { forecast: null, air: null, alerts: null, pollen: null };
  store.meta.error = null;
  renderAll();
  radarLocationChanged();
  loadAll();
  if (activeTab !== 'wetter' && activeTab !== 'radar') navigate('wetter');
}

function locateMe({ silent = false } = {}) {
  return new Promise(resolve => {
    if (!('geolocation' in navigator)) {
      if (!silent) toast('Standortbestimmung wird von diesem Gerät nicht unterstützt.', { type: 'warn' });
      return resolve(false);
    }
    $('#gps-btn').classList.add('busy');
    navigator.geolocation.getCurrentPosition(async pos => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      let place = { name: 'Mein Standort', admin1: '', country: '', cc: '' };
      try { place = await reverseGeocode(lat, lon); } catch { /* Name optional */ }
      $('#gps-btn').classList.remove('busy');
      selectLocation({ ...place, lat, lon, gps: true });
      if (!silent) toast(`Standort: ${place.name}`);
      resolve(true);
    }, err => {
      $('#gps-btn').classList.remove('busy');
      const msg = err.code === 1
        ? 'Standortzugriff verweigert. Erlaube den Zugriff in den Safari-Einstellungen oder suche einen Ort.'
        : err.code === 3 ? 'Standortbestimmung hat zu lange gedauert.' : 'Standort konnte nicht ermittelt werden.';
      if (!silent || err.code !== 1) toast(msg, { type: 'warn', ms: 4500 });
      resolve(false);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60000 });
  });
}

/* ================= Initialisierung ================= */
function init() {
  initSky();
  applyTheme();
  initSheet();
  setAnimationsEnabled(store.settings.animations);
  document.documentElement.classList.toggle('no-anim', !store.settings.animations);

  // Tabs
  $$('.tab').forEach(b => b.addEventListener('click', () => navigate(b.dataset.tab)));
  window.addEventListener('hashchange', () => navigate(location.hash.slice(1), { fromHash: true }));
  initSwipeNav($('#views'), dir => {
    if (sheetOpen()) return;
    const i = TABS.indexOf(activeTab) + dir;
    if (i >= 0 && i < TABS.length) navigate(TABS[i]);
  });

  // Kopfzeile
  $('#loc-btn').addEventListener('click', () => openLocationSheet({ onSelect: selectLocation, onGps: () => locateMe() }));
  $('#gps-btn').addEventListener('click', () => locateMe());
  $('#refresh-btn').addEventListener('click', () => loadAll({ force: true }));
  $('#fav-btn').addEventListener('click', () => {
    if (!store.location) return;
    const on = store.toggleFavorite(store.location);
    toast(on ? `${store.location.name} zu Favoriten hinzugefügt` : `${store.location.name} aus Favoriten entfernt`);
    renderHeader();
    if (activeTab === 'mehr') renderView('mehr');
  });

  initPullToRefresh($('#view-wetter'), $('#ptr'), () => loadAll({ force: true }));
  $('#view-wetter').addEventListener('scroll', e => $('#topbar').classList.toggle('scrolled', e.target.scrollTop > 12), { passive: true });

  // Einstellungen
  store.on('settings', ({ key }) => {
    if (key === 'theme') applyTheme();
    if (key === 'animations') {
      setAnimationsEnabled(store.settings.animations);
      document.documentElement.classList.toggle('no-anim', !store.settings.animations);
    }
    if (key === 'autoRefresh') scheduleRefresh();
    if (['radarSource', 'tempUnit', 'windUnit', 'timeFormat'].includes(key)) radarSettingsChanged();
    renderHeader();
    if (activeTab !== 'mehr') renderView(activeTab);
    renderView('wetter');
  });
  store.on('reload', () => loadAll({ force: true }));
  store.on('reload-alerts', () => loadAll({ force: true }));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (store.settings.theme === 'system') applyTheme();
  });

  // Verbindung
  const net = () => {
    const bar = $('#offline-bar');
    bar.hidden = navigator.onLine;
    if (!navigator.onLine) {
      bar.textContent = store.meta.updated
        ? `Offline – du siehst Wetterdaten vom ${fmtDate(new Date(store.meta.updated - new Date().getTimezoneOffset() * 60000), { weekday: false })}, ${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(store.meta.updated)} Uhr. Radar und Karten sind ohne Verbindung nicht verfügbar.`
        : 'Offline – es sind noch keine Wetterdaten gespeichert. Bitte Internetverbindung herstellen.';
    }
    document.body.classList.toggle('offline', !navigator.onLine);
  };
  window.addEventListener('online', () => { net(); toast('Wieder online – Daten werden aktualisiert.'); loadAll({ force: true }); });
  window.addEventListener('offline', () => { net(); });
  net();

  // Sichtbarkeit: bei Rückkehr veraltete Daten auffrischen
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && store.meta.updated && Date.now() - store.meta.updated > 10 * 60000) loadAll({ force: true });
  });

  setInterval(updateClock, 30000);

  // Start: Standort zuerst festlegen, dann Ansicht öffnen (Radar braucht den Standort)
  const firstStart = !store.location;
  if (firstStart) store.setLocation(DEFAULT_LOC);
  renderHeader();
  navigate(location.hash.slice(1) || 'wetter', { fromHash: true });
  loadAll();
  // Beim ersten Start einmalig Standort anfragen
  if (firstStart) locateMe({ silent: true });

  setTimeout(hideSplash, 4000);

  // PWA
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__deferredInstall = e; });
  registerServiceWorker();
}

/* ================= Service Worker & Updates ================= */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  // Neue Version übernimmt die Kontrolle → einmalig neu laden, damit niemand alten Code behält
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    toast('Himmelblick wurde aktualisiert.');
    setTimeout(() => location.reload(), 600);
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    // Bei Rückkehr in die App nach Updates suchen (max. alle 30 Min.)
    let lastCheck = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - lastCheck > 30 * 60000) { lastCheck = Date.now(); reg.update().catch(() => {}); }
    });
  }).catch(err => console.warn('Service Worker nicht registriert', err));
}

init();
