// Radar & interaktive Wetterkarten (Leaflet) – v2
// Neu: OpenStreetMap-Hintergrund (ohne Schlüssel), Vorladen aller Radarbilder vor der Animation,
// weiche Überblendung, Steuerung (Anfang, Schritt zurück/vor, Wiedergabe, Jetzt), Ladefortschritt,
// klassierte Legende in mm/h, Satellit auf Esri-Luftbild mit Beschriftung, Schutz vor
// Wettlaufsituationen beim Ebenenwechsel.
import { store } from '../store.js';
import { getRainViewer, getDwdRadarTimes, getGrid, DWD_WMS } from '../api.js';
import { nowcast, nowcastSummary } from '../model.js';
import { tempColor } from '../charts.js';
import { fmtAbs, temp, wind, num, windDir, MONTHS_SHORT, WEEKDAYS_SHORT } from '../format.js';
import { toast } from '../ui.js';
import { debounce, esc } from '../util.js';

const DE_BOUNDS = [[47.0, 5.3], [55.3, 15.6]];
const DWD_LAYER_BOUNDS = [[45.5, 1.5], [56.5, 19.0]];
const GRID_LAYERS = ['precip', 'temp', 'wind', 'cloud'];
const OSM_ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende';

const LAYERS = [
  { id: 'radar', label: 'Regenradar', icon: '<path d="M12 3s-6 6.6-6 10.5a6 6 0 0 0 12 0C18 9.6 12 3 12 3z"/>' },
  { id: 'precip', label: 'Niederschlag', icon: '<path d="M7 18a4.5 4.5 0 0 1 .5-9 6 6 0 0 1 11 2 3.5 3.5 0 0 1-.5 7z"/><path d="M9 20l-1 2M13 20l-1 2M17 20l-1 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
  { id: 'temp', label: 'Temperatur', icon: '<path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0z" fill="none" stroke="currentColor" stroke-width="2"/>' },
  { id: 'wind', label: 'Wind', icon: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  { id: 'cloud', label: 'Wolken', icon: '<path d="M7 19h10a4.5 4.5 0 0 0 .6-9A6 6 0 0 0 6.2 9 5 5 0 0 0 7 19z"/>' },
  { id: 'sat', label: 'Satellit', icon: '<path d="M5 13l6 6M7 11l2-2 6 6-2 2zM13 7l2-2 4 4-2 2zM3 21l3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' }
];

let map, root, baseLayer, satBase, satLabels, marker;
let active = 'radar';
let token = 0;              // erhöht sich bei jedem Ebenenwechsel → verwirft veraltete Ladevorgänge
let frames = [];            // { t, kind, layer?, ti?, loaded }
let idx = 0, playing = false, timer = null;
let radarSource = null;
let grid = null, gridOverlay = null, gridBounds = null, gridZoom = null, gridPromise = null;
let gridCanvas = null;
let initialized = false;

/* ===================== Öffentliche Schnittstelle ===================== */
export function radarVisible() {
  if (!initialized) init();
  else {
    setTimeout(() => map.invalidateSize(), 60);
    updateNowcast();
  }
}

/** Neue Wetterdaten → Kurzfristinfo in der Karte aktualisieren */
export function radarDataChanged() {
  if (initialized) updateNowcast();
}

export function radarHidden() {
  pause();
}

export function radarLocationChanged() {
  if (!initialized) return;
  const loc = store.location;
  marker.setLatLng([loc.lat, loc.lon]);
  map.setView([loc.lat, loc.lon], Math.max(map.getZoom(), 7), { animate: false });
  updateNowcast();
  if (active === 'radar') switchLayer('radar', true);
}

export function radarSettingsChanged() {
  if (!initialized) return;
  pause();
  if (active === 'radar' || active === 'sat') switchLayer(active, true);
  else { renderLegend(active); showFrame(idx); }
}

export function radarThemeChanged() {
  if (!initialized) return;
  renderLegend(active);
  if (GRID_LAYERS.includes(active)) drawGrid();
}

function isDark() {
  return document.documentElement.dataset.theme === 'dark';
}

/* ===================== Aufbau ===================== */
function init() {
  root = document.getElementById('radar-root');
  if (!window.L) {
    root.innerHTML = `<div class="map-error card"><h2>Karte nicht verfügbar</h2><p>Die Kartenbibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen.</p><button class="btn" id="map-retry">Erneut versuchen</button></div>`;
    root.querySelector('#map-retry').addEventListener('click', () => location.reload());
    return;
  }
  initialized = true;
  const loc = store.location || { lat: 51.16, lon: 10.45 };
  root.innerHTML = `
    <div id="map" aria-label="Wetterkarte"></div>
    <div class="map-top" data-noswipe>
      <div class="layer-chips" role="tablist" aria-label="Kartenebene">
        ${LAYERS.map(l => `<button role="tab" class="chip ${l.id === active ? 'active' : ''}" data-layer="${l.id}" aria-selected="${l.id === active}"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">${l.icon}</svg>${l.label}</button>`).join('')}
      </div>
      <div class="map-info" id="map-info"></div>
    </div>
    <div class="map-side" data-noswipe>
      <button class="map-btn" id="map-zin" aria-label="Hineinzoomen">+</button>
      <button class="map-btn" id="map-zout" aria-label="Herauszoomen">−</button>
      <button class="map-btn" id="map-locate" aria-label="Auf Standort zentrieren"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3A9 9 0 0 0 13 3.06V1h-2v2.06A9 9 0 0 0 3.06 11H1v2h2.06A9 9 0 0 0 11 20.94V23h2v-2.06A9 9 0 0 0 20.94 13H23v-2h-2.06zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/></svg></button>
    </div>
    <div class="map-bottom" data-noswipe>
      <div class="legend" id="map-legend"></div>
      <div class="timeline">
        <div class="tl-head">
          <div class="tl-label"><b id="tl-time">–</b><span id="tl-rel"></span></div>
          <div class="tl-progress" id="tl-progress" hidden><i></i><span></span></div>
        </div>
        <input type="range" id="tl-range" min="0" max="0" value="0" step="1" aria-label="Zeitpunkt wählen">
        <div class="tl-ticks" id="tl-ticks"></div>
        <div class="tl-controls">
          <button class="tl-btn" id="tl-first" aria-label="Zum Anfang">${ICONS.first}</button>
          <button class="tl-btn" id="tl-prev" aria-label="Ein Bild zurück">${ICONS.prev}</button>
          <button class="play-btn" id="tl-play" aria-label="Animation abspielen">${ICONS.play}</button>
          <button class="tl-btn" id="tl-next" aria-label="Ein Bild vor">${ICONS.next}</button>
          <button class="tl-btn tl-now" id="tl-now" aria-label="Zum aktuellen Zeitpunkt">Jetzt</button>
        </div>
      </div>
    </div>`;

  map = L.map('map', { zoomControl: false, attributionControl: true, minZoom: 3, maxZoom: 13, worldCopyJump: true, zoomSnap: 0.5, wheelPxPerZoomLevel: 90 })
    .setView([loc.lat, loc.lon], 7);
  map.attributionControl.setPrefix(false);
  map.createPane('radar');
  map.getPane('radar').style.zIndex = 380;
  map.createPane('labels');
  map.getPane('labels').style.zIndex = 420;
  map.getPane('labels').style.pointerEvents = 'none';

  // OpenStreetMap-Standardkacheln (frei, ohne Schlüssel). Nutzungsrichtlinie: Quellenangabe,
  // kein Vorladen/Massendownload, Browser-Caching gemäß HTTP-Headern – wird hier eingehalten.
  baseLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: OSM_ATTR, className: 'osm-base', crossOrigin: false
  }).addTo(map);

  const pulse = L.divIcon({ className: 'loc-marker', html: '<span class="lm-dot"></span><span class="lm-pulse"></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
  marker = L.marker([loc.lat, loc.lon], { icon: pulse, keyboard: false, interactive: false, zIndexOffset: 1000 }).addTo(map);

  root.querySelectorAll('[data-layer]').forEach(b => b.addEventListener('click', () => switchLayer(b.dataset.layer)));
  root.querySelector('#map-zin').addEventListener('click', () => map.zoomIn());
  root.querySelector('#map-zout').addEventListener('click', () => map.zoomOut());
  root.querySelector('#map-locate').addEventListener('click', () => {
    const l = store.location;
    if (l) map.flyTo([l.lat, l.lon], Math.max(8, map.getZoom()), { duration: 0.6 });
  });
  root.querySelector('#tl-play').addEventListener('click', () => (playing ? pause() : play()));
  root.querySelector('#tl-first').addEventListener('click', () => { pause(); showFrame(0); });
  root.querySelector('#tl-prev').addEventListener('click', () => { pause(); showFrame(Math.max(0, idx - 1)); });
  root.querySelector('#tl-next').addEventListener('click', () => { pause(); showFrame(Math.min(frames.length - 1, idx + 1)); });
  root.querySelector('#tl-now').addEventListener('click', () => { pause(); showFrame(nowIndex()); });
  const range = root.querySelector('#tl-range');
  range.addEventListener('input', () => { pause(); showFrame(+range.value); });

  map.on('moveend', debounce(() => { if (GRID_LAYERS.includes(active)) refreshGridForView(); }, 450));
  map.on('click', e => valuePopup(e.latlng));

  updateNowcast();
  switchLayer(active, true);
}

const ICONS = {
  play: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
  first: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6L18 18V6z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8.6 16.6L10 18l6-6-6-6-1.4 1.4 4.6 4.6z"/></svg>'
};

/* ===================== Ebenenwechsel ===================== */
function switchLayer(id, force = false) {
  if (id === active && !force) return;
  pause();
  active = id;
  const my = ++token;
  root.querySelectorAll('[data-layer]').forEach(b => {
    b.classList.toggle('active', b.dataset.layer === id);
    b.setAttribute('aria-selected', b.dataset.layer === id);
  });
  root.dataset.layer = id;
  clearFrames();
  if (gridOverlay) { map.removeLayer(gridOverlay); gridOverlay = null; }
  setSatelliteBase(id === 'sat');
  renderLegend(id);
  setInfo('<span class="spinner"></span> Lädt …');
  const job = id === 'radar' ? loadRadar(my) : id === 'sat' ? loadSatellite(my) : loadGridLayer(my);
  job.catch(e => {
    if (my !== token) return;
    console.error(e);
    setInfo(`Daten nicht verfügbar: ${esc(e.message || 'Fehler')}`, true);
    setupTimeline(0);
  });
}

function clearFrames() {
  frames.forEach(f => f.layer && map.removeLayer(f.layer));
  frames = [];
  idx = 0;
  updateProgress();
}

function setSatelliteBase(on) {
  if (on) {
    if (map.hasLayer(baseLayer)) map.removeLayer(baseLayer);
    if (!satBase) {
      satBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Luftbild © Esri, Maxar, Earthstar Geographics'
      });
      satLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, pane: 'labels', attribution: 'Beschriftung © Esri'
      });
    }
    if (!map.hasLayer(satBase)) satBase.addTo(map);
    if (!map.hasLayer(satLabels)) satLabels.addTo(map);
  } else {
    if (satBase && map.hasLayer(satBase)) map.removeLayer(satBase);
    if (satLabels && map.hasLayer(satLabels)) map.removeLayer(satLabels);
    if (!map.hasLayer(baseLayer)) baseLayer.addTo(map);
  }
}

/** Fügt Bild-Ebenen hinzu und verfolgt ihren Ladezustand für eine flüssige Animation */
function addFrameLayers(my) {
  frames.forEach(f => {
    f.loaded = false;
    f.layer.on('load', () => { f.loaded = true; if (my === token) updateProgress(); });
    f.layer.on('tileerror', () => { f.errors = (f.errors || 0) + 1; });
    f.layer.addTo(map);
  });
  updateProgress();
}

function updateProgress() {
  const el = root?.querySelector('#tl-progress');
  if (!el) return;
  const withLayer = frames.filter(f => f.layer);
  if (!withLayer.length) { el.hidden = true; return; }
  const done = withLayer.filter(f => f.loaded).length;
  el.hidden = done >= withLayer.length;
  el.querySelector('i').style.width = `${(done / withLayer.length) * 100}%`;
  el.querySelector('span').textContent = `Bilder ${done}/${withLayer.length}`;
}

function nowIndex() {
  const now = Date.now();
  let best = 0;
  frames.forEach((f, i) => { if (f.t <= now + 60000) best = i; });
  return best;
}

/* ===================== Regenradar ===================== */
async function loadRadar(my) {
  const loc = store.location;
  const inDE = loc && loc.lat > DE_BOUNDS[0][0] && loc.lat < DE_BOUNDS[1][0] && loc.lon > DE_BOUNDS[0][1] && loc.lon < DE_BOUNDS[1][1];
  const pref = store.settings.radarSource;
  let useDwd = pref === 'dwd' || (pref === 'auto' && inDE);
  if (useDwd) {
    try {
      await loadDwdRadar(my);
      radarSource = 'dwd';
    } catch (e) {
      if (my !== token) return;
      console.warn('DWD-Radar nicht verfügbar', e);
      if (pref === 'dwd') toast('DWD-Radar nicht erreichbar – RainViewer wird verwendet.');
      useDwd = false;
    }
  }
  if (!useDwd) {
    await loadRainViewer(my);
    radarSource = 'rainviewer';
  }
  if (my !== token) return;
  setupTimeline(nowIndex());
  const hasFuture = frames.some(f => f.kind === 'future');
  setInfo(radarSource === 'dwd'
    ? `Radar: Deutscher Wetterdienst · alle 10 Min.${hasFuture ? ' · inkl. Vorhersage' : ''}`
    : 'Radar: RainViewer · letzte 2 Std. (ohne Vorhersage)');
}

async function loadDwdRadar(my) {
  const times = await getDwdRadarTimes();
  if (my !== token) return;
  const now = Date.now();
  let sel = times.filter(t => t >= now - 2 * 3600e3 && t <= now + 2 * 3600e3);
  if (!sel.length) throw new Error('Keine aktuellen DWD-Radarzeiten');
  sel = sel.filter((t, i) => i === sel.length - 1 || Math.round(t / 60000) % 10 === 0);
  frames = sel.map(t => ({
    t,
    kind: t > now + 60000 ? 'future' : 'past',
    layer: L.tileLayer.wms(DWD_WMS, {
      layers: 'dwd:Niederschlagsradar',
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      time: new Date(t).toISOString().replace('.000Z', 'Z'),
      opacity: 0,
      tileSize: 512,
      pane: 'radar',
      className: 'radar-frame',
      bounds: DWD_LAYER_BOUNDS,
      attribution: 'Radar © <a href="https://www.dwd.de">Deutscher Wetterdienst</a>'
    })
  }));
  addFrameLayers(my);
}

async function loadRainViewer(my) {
  const { data } = await getRainViewer();
  if (my !== token) return;
  const host = data.host || 'https://tilecache.rainviewer.com';
  const list = [
    ...(data.radar?.past || []).map(f => ({ ...f, kind: 'past' })),
    ...(data.radar?.nowcast || []).map(f => ({ ...f, kind: 'future' }))
  ];
  if (!list.length) throw new Error('Keine Radarbilder verfügbar');
  frames = list.map(f => ({
    t: f.time * 1000,
    kind: f.kind,
    layer: L.tileLayer(`${host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, {
      opacity: 0, pane: 'radar', className: 'radar-frame', maxNativeZoom: 7, maxZoom: 13,
      attribution: 'Radar © <a href="https://www.rainviewer.com">RainViewer</a>'
    })
  }));
  addFrameLayers(my);
}

/* ===================== Satellit ===================== */
async function loadSatellite(my) {
  const today = new Date();
  const product = store.satProduct || 'VIIRS_NOAA20_CorrectedReflectance_TrueColor';
  for (let d = 7; d >= 1; d--) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - d));
    const ds = day.toISOString().slice(0, 10);
    frames.push({
      t: day.getTime(), kind: 'day', date: ds,
      layer: L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${product}/default/${ds}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, {
        opacity: 0, pane: 'radar', className: 'radar-frame sat-frame', maxNativeZoom: 9, maxZoom: 13,
        attribution: 'Satellit © <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a> (VIIRS)'
      })
    });
  }
  addFrameLayers(my);
  // Rückfall auf Suomi-NPP, falls NOAA-20 keine Kacheln liefert
  const last = frames[frames.length - 1];
  setTimeout(() => {
    if (my === token && !store.satProduct && (last.errors || 0) > 3 && !last.loaded) {
      store.satProduct = 'VIIRS_SNPP_CorrectedReflectance_TrueColor';
      switchLayer('sat', true);
    }
  }, 6000);
  setupTimeline(frames.length - 1);
  setInfo('Satellit: NASA VIIRS-Tagesaufnahme (Echtfarben, Wolken) über Esri-Luftbild');
}

/* ===================== Modellkarten (Open-Meteo-Gitter) ===================== */
const GRID_INFO = { precip: 'Niederschlag in mm/h', temp: 'Temperatur in 2 m Höhe', wind: 'Wind in 10 m Höhe', cloud: 'Gesamtbewölkung in %' };

async function loadGridLayer(my) {
  await ensureGrid();
  if (my !== token || !grid) return;
  buildGridFrames();
  setupTimeline(0);
  setInfo(`Modellprognose Open-Meteo · ${GRID_INFO[active]} · Karte antippen für Werte`);
}

function buildGridFrames() {
  const nowH = Math.floor(Date.now() / 3600e3) * 3600e3;
  frames = [];
  for (let h = 0; h <= 48; h++) {
    const t = nowH + h * 3600e3;
    const iso = new Date(t).toISOString().slice(0, 13) + ':00';
    const ti = grid.times.indexOf(iso);
    if (ti >= 0) frames.push({ t, kind: h === 0 ? 'now' : 'future', ti });
  }
  if (!frames.length) throw new Error('Keine Zeitschritte');
}

function gridCoversView() {
  return grid && gridBounds && gridBounds.contains(map.getBounds()) && Math.abs(map.getZoom() - gridZoom) < 1.5;
}

/** Lädt das Gitter (oder wartet auf einen laufenden Ladevorgang) – nie doppelt */
function ensureGrid(force = false) {
  if (!force && gridCoversView()) return Promise.resolve(grid);
  if (gridPromise) return gridPromise;
  const b = map.getBounds();
  const z = map.getZoom();
  const padded = b.pad(0.25);
  const s = Math.max(-85, padded.getSouth()), n = Math.min(85, padded.getNorth());
  const w = padded.getWest(), e = padded.getEast();
  const N = 10;
  const lats = [], lons = [];
  for (let i = 0; i < N; i++) lats.push(s + ((n - s) * i) / (N - 1));
  for (let j = 0; j < N; j++) lons.push(w + ((e - w) * j) / (N - 1));
  const pts = [];
  lats.forEach(la => lons.forEach(lo => pts.push([la, ((lo + 540) % 360) - 180])));
  gridPromise = getGrid(pts).then(res => {
    const pick = key => res.map(r => r.hourly[key]);
    grid = {
      lats, lons, s, n, w, e, times: res[0].hourly.time,
      temp: pick('temperature_2m'), precip: pick('precipitation'), cloud: pick('cloud_cover'),
      wind: pick('wind_speed_10m'), dir: pick('wind_direction_10m')
    };
    gridBounds = L.latLngBounds([s, w], [n, e]);
    gridZoom = z;
    return grid;
  }).finally(() => { gridPromise = null; });
  return gridPromise;
}

async function refreshGridForView() {
  if (gridCoversView()) return;
  const my = token;
  try {
    setInfo('<span class="spinner"></span> Kartendaten für den Ausschnitt werden geladen …');
    await ensureGrid(true);
    if (my !== token || !GRID_LAYERS.includes(active)) return;
    const keep = frames[idx]?.t;
    buildGridFrames();
    const i = frames.findIndex(f => f.t === keep);
    setupTimeline(i >= 0 ? i : 0);
    setInfo(`Modellprognose Open-Meteo · ${GRID_INFO[active]} · Karte antippen für Werte`);
  } catch (err) {
    if (my === token) setInfo(`Kartendaten nicht verfügbar (${esc(err.message)})`, true);
  }
}

function gridValue(key, ti, lat, lon) {
  const g = grid, N = g.lats.length, M = g.lons.length;
  const fi = ((lat - g.s) / (g.n - g.s)) * (N - 1);
  const fj = ((lon - g.w) / (g.e - g.w)) * (M - 1);
  if (fi < 0 || fi > N - 1 || fj < 0 || fj > M - 1) return null;
  const i0 = Math.min(N - 2, Math.floor(fi)), j0 = Math.min(M - 2, Math.floor(fj));
  const di = fi - i0, dj = fj - j0;
  const v = (i, j) => g[key][i * M + j]?.[ti];
  const a = v(i0, j0), b = v(i0, j0 + 1), c = v(i0 + 1, j0), d = v(i0 + 1, j0 + 1);
  if ([a, b, c, d].some(x => x == null)) return a ?? b ?? c ?? d ?? null;
  if (key === 'dir') {
    const vec = (x, wgt) => [Math.sin(x * Math.PI / 180) * wgt, Math.cos(x * Math.PI / 180) * wgt];
    const parts = [vec(a, (1 - di) * (1 - dj)), vec(b, (1 - di) * dj), vec(c, di * (1 - dj)), vec(d, di * dj)];
    const sx = parts.reduce((s, p) => s + p[0], 0), sy = parts.reduce((s, p) => s + p[1], 0);
    return (Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360;
  }
  return a * (1 - di) * (1 - dj) + b * (1 - di) * dj + c * di * (1 - dj) + d * di * dj;
}

const mercY = lat => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercY = y => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;

// Niederschlagsklassen (mm/h) – identisch mit Legende und Startseite
export const PRECIP_CLASSES = [
  { min: 0.1, max: 1, label: 'leicht', range: '0,1–1', color: [120, 190, 255] },
  { min: 1, max: 4, label: 'mäßig', range: '1–4', color: [30, 110, 235] },
  { min: 4, max: 10, label: 'stark', range: '4–10', color: [250, 190, 30] },
  { min: 10, max: Infinity, label: 'sehr stark', range: '> 10', color: [225, 40, 60] }
];

function colorFor(key, v, dark) {
  if (v == null || isNaN(v)) return null;
  if (key === 'temp') {
    const m = tempColor(v).match(/\d+/g).map(Number);
    return [m[0], m[1], m[2], 150];
  }
  if (key === 'precip') {
    if (v < 0.1) return null;
    const stops = [[0.1, [150, 210, 255, 110]], [1, [80, 160, 250, 190]], [2.5, [30, 110, 235, 210]], [4, [250, 200, 40, 220]], [7, [250, 140, 30, 228]], [10, [225, 40, 60, 235]], [25, [170, 30, 150, 240]]];
    return ramp(stops, v);
  }
  if (key === 'cloud') {
    if (v < 5) return null;
    const a = Math.round((v / 100) * 205);
    return dark ? [235, 240, 245, a] : [85, 95, 112, a];
  }
  if (key === 'wind') {
    const stops = [[0, [110, 170, 220, 110]], [10, [120, 200, 160, 140]], [20, [230, 210, 100, 160]], [35, [245, 160, 80, 180]], [50, [225, 90, 90, 190]], [75, [165, 55, 115, 200]], [100, [95, 40, 135, 210]]];
    return ramp(stops, v);
  }
  return null;
}

function ramp(stops, v) {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [a, ca] = stops[i - 1], [b, cb] = stops[i];
      const f = (v - a) / (b - a);
      return ca.map((x, k) => Math.round(x + (cb[k] - x) * f));
    }
  }
  return stops[stops.length - 1][1];
}

function drawGrid() {
  if (!grid || !frames[idx] || !GRID_LAYERS.includes(active) || frames[idx].ti == null) return;
  const ti = frames[idx].ti;
  const W = 300, H = 300;
  gridCanvas = gridCanvas || Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = gridCanvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const img = ctx.createImageData(W, H);
  const yN = mercY(grid.n), yS = mercY(grid.s);
  const dark = isDark();
  for (let py = 0; py < H; py++) {
    const lat = invMercY(yN + ((yS - yN) * (py + 0.5)) / H);
    for (let px = 0; px < W; px++) {
      const lon = grid.w + ((grid.e - grid.w) * (px + 0.5)) / W;
      const col = colorFor(active, gridValue(active, ti, lat, lon), dark);
      if (!col) continue;
      const o = (py * W + px) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = col[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  if (active === 'wind') {
    const steps = 8;
    ctx.strokeStyle = dark ? 'rgba(255,255,255,.88)' : 'rgba(20,30,45,.8)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.4;
    for (let a = 0; a < steps; a++) {
      for (let b = 0; b < steps; b++) {
        const px = ((b + 0.5) / steps) * W, py = ((a + 0.5) / steps) * H;
        const lat = invMercY(yN + ((yS - yN) * py) / H);
        const lon = grid.w + ((grid.e - grid.w) * px) / W;
        const sp = gridValue('wind', ti, lat, lon), dir = gridValue('dir', ti, lat, lon);
        if (sp == null || dir == null) continue;
        const len = 6 + Math.min(14, sp / 4);
        const ang = ((dir + 180) * Math.PI) / 180;
        const dx = Math.sin(ang) * len, dy = -Math.cos(ang) * len;
        ctx.beginPath(); ctx.moveTo(px - dx / 2, py - dy / 2); ctx.lineTo(px + dx / 2, py + dy / 2); ctx.stroke();
        const hx = px + dx / 2, hy = py + dy / 2, ha = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - 5 * Math.cos(ha - 0.5), hy - 5 * Math.sin(ha - 0.5));
        ctx.lineTo(hx - 5 * Math.cos(ha + 0.5), hy - 5 * Math.sin(ha + 0.5));
        ctx.closePath(); ctx.fill();
      }
    }
  }
  const url = gridCanvas.toDataURL();
  const bounds = L.latLngBounds([grid.s, grid.w], [grid.n, grid.e]);
  if (!gridOverlay) {
    gridOverlay = L.imageOverlay(url, bounds, { opacity: 0.85, pane: 'radar', className: 'grid-overlay', attribution: 'Modelldaten © <a href="https://open-meteo.com">Open-Meteo</a>' }).addTo(map);
  } else {
    gridOverlay.setUrl(url);
    gridOverlay.setBounds(bounds);
  }
}

function valuePopup(latlng) {
  if (!grid || !GRID_LAYERS.includes(active) || !frames[idx] || frames[idx].ti == null) return;
  const ti = frames[idx].ti;
  const lon = ((latlng.lng + 540) % 360) - 180;
  const v = gridValue(active, ti, latlng.lat, lon);
  if (v == null) return;
  let text = '';
  if (active === 'temp') text = `Temperatur: <b>${temp(v)}</b>`;
  if (active === 'precip') {
    const cls = PRECIP_CLASSES.slice().reverse().find(c => v >= c.min);
    text = `Niederschlag: <b>${num(v, 1)} mm/h</b>${cls ? ` (${cls.label})` : ' (trocken)'}`;
  }
  if (active === 'cloud') text = `Bewölkung: <b>${Math.round(v)} %</b>`;
  if (active === 'wind') text = `Wind: <b>${wind(v)}</b> aus ${windDir(gridValue('dir', ti, latlng.lat, lon))}`;
  L.popup({ closeButton: false, className: 'value-popup', autoClose: true }).setLatLng(latlng).setContent(text).openOn(map);
}

/* ===================== Zeitleiste ===================== */
function setupTimeline(start = 0) {
  const range = root.querySelector('#tl-range');
  const n = frames.length;
  range.max = Math.max(0, n - 1);
  const single = n < 2;
  range.disabled = single;
  ['#tl-play', '#tl-first', '#tl-prev', '#tl-next', '#tl-now'].forEach(s => (root.querySelector(s).disabled = single));
  root.querySelector('#tl-now').hidden = active === 'sat';
  const ticks = root.querySelector('#tl-ticks');
  const tz = store.data.forecast?.timezone;
  const nowI = nowIndex();
  let marks = [];
  if (n > 1) {
    marks = [[0, shortLabel(frames[0], tz)], [n - 1, shortLabel(frames[n - 1], tz)]];
    const showNow = active === 'radar' && nowI > 0 && nowI < n - 1;
    const mid = showNow ? [nowI, 'Jetzt'] : [Math.floor((n - 1) / 2), shortLabel(frames[Math.floor((n - 1) / 2)], tz)];
    marks = marks.filter(m => Math.abs(m[0] - mid[0]) > n * 0.2);
    marks.push(mid);
    marks.sort((x, y) => x[0] - y[0]);
  }
  ticks.innerHTML = marks.map(([i, l]) => {
    const tr = i === 0 ? '0' : i === n - 1 ? '-100%' : '-50%';
    return `<span style="left:${(i / (n - 1)) * 100}%;transform:translateX(${tr})" class="${l === 'Jetzt' ? 'now' : ''}">${l}</span>`;
  }).join('');
  const futureStart = frames.findIndex(f => f.kind === 'future' && f.layer);
  range.style.setProperty('--future', futureStart > 0 && n > 1 ? `${(futureStart / (n - 1)) * 100}%` : '100%');
  if (n) showFrame(Math.max(0, Math.min(start, n - 1)));
  else {
    root.querySelector('#tl-time').textContent = '–';
    root.querySelector('#tl-rel').textContent = '';
  }
}

function shortLabel(f, tz) {
  if (!f) return '';
  if (f.kind === 'day') {
    const d = new Date(f.t);
    return `${d.getUTCDate()}. ${MONTHS_SHORT[d.getUTCMonth()]}`;
  }
  return fmtAbs(new Date(f.t).toISOString(), tz, { date: false });
}

function showFrame(i) {
  if (!frames.length) return;
  const prev = frames[idx];
  idx = i;
  const f = frames[i];
  if (f.layer) f.layer.setOpacity(active === 'sat' ? 0.92 : 0.8);
  if (prev && prev.layer && prev !== f) prev.layer.setOpacity(0);
  if (!f.layer) drawGrid();
  root.querySelector('#tl-range').value = i;
  const tz = store.data.forecast?.timezone;
  const timeEl = root.querySelector('#tl-time'), relEl = root.querySelector('#tl-rel');
  if (f.kind === 'day') {
    const d = new Date(f.t);
    timeEl.textContent = `${WEEKDAYS_SHORT[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONTHS_SHORT[d.getUTCMonth()]}`;
    relEl.textContent = i === frames.length - 1 ? 'neueste Tagesaufnahme' : 'Tagesaufnahme';
    relEl.className = '';
  } else {
    timeEl.textContent = fmtAbs(new Date(f.t).toISOString(), tz, { date: !sameDay(f.t) }) + ' Uhr';
    const diff = Math.round((f.t - Date.now()) / 60000);
    relEl.textContent = Math.abs(diff) < 6 && active === 'radar' ? 'Jetzt'
      : diff < 0 ? `vor ${fmtRel(-diff)}`
        : f.kind === 'now' ? 'aktuelle Stunde' : `in ${fmtRel(diff)}${active === 'radar' ? ' · Vorhersage' : ''}`;
    relEl.className = f.kind === 'future' ? 'future' : '';
  }
}

function sameDay(t) {
  return new Date(t).toDateString() === new Date().toDateString();
}

function fmtRel(min) {
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60), m = min % 60;
  return m && h < 6 ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

/** Wiedergabe: startet erst, wenn die Bilder geladen sind (max. 6 s warten), überspringt keine Frames */
async function play() {
  if (frames.length < 2) return;
  playing = true;
  const btn = root.querySelector('#tl-play');
  btn.innerHTML = ICONS.pause;
  btn.setAttribute('aria-label', 'Animation anhalten');
  const my = token;
  const t0 = Date.now();
  while (playing && my === token && frames.some(f => f.layer && !f.loaded) && Date.now() - t0 < 6000) {
    await new Promise(r => setTimeout(r, 200));
  }
  if (!playing || my !== token) return;
  if (idx >= frames.length - 1) showFrame(0);
  const delay = active === 'radar' ? 420 : active === 'sat' ? 900 : 650;
  const tick = () => {
    if (!playing || my !== token) return;
    const next = idx + 1 >= frames.length ? 0 : idx + 1;
    showFrame(next);
    timer = setTimeout(tick, next === frames.length - 1 ? delay * 4 : next === nowIndex() && active === 'radar' ? delay * 2 : delay);
  };
  timer = setTimeout(tick, delay);
}

function pause() {
  playing = false;
  clearTimeout(timer);
  const b = root?.querySelector('#tl-play');
  if (b) { b.innerHTML = ICONS.play; b.setAttribute('aria-label', 'Animation abspielen'); }
}

/* ===================== Info & Legende ===================== */
function setInfo(markup, error = false) {
  const el = root?.querySelector('#map-info');
  if (!el) return;
  let txt = el.querySelector('.mi-text');
  if (!txt) { txt = document.createElement('span'); txt.className = 'mi-text'; el.append(txt); }
  txt.innerHTML = markup;
  txt.classList.toggle('err', error);
}

function updateNowcast() {
  const el = root?.querySelector('#map-info');
  if (!el || !store.data.forecast) return;
  const items = nowcast(store.data.forecast);
  const text = nowcastSummary(items);
  el.querySelector('.nc')?.remove();
  if (!text) return;
  const max = Math.max(0.5, ...items.map(x => x.v || 0));
  const bars = items.map(x => `<i style="height:${Math.max(2, ((x.v || 0) / max) * 18)}px" class="${x.v >= 0.1 ? 'wet' : ''}"></i>`).join('');
  const div = document.createElement('div');
  div.className = 'nc';
  div.innerHTML = `<span class="nc-bars" aria-hidden="true">${bars}</span><span><b>${esc(store.location?.name || '')}:</b> ${text}</span>`;
  el.prepend(div);
}

function renderLegend(id) {
  const el = root.querySelector('#map-legend');
  if (id === 'radar' || id === 'precip') {
    el.innerHTML = `<span class="lg-title">${id === 'radar' ? 'Radar-Niederschlag' : 'Niederschlag (Modell)'} <small>mm/h</small></span>
      ${id === 'radar' ? '<small class="lg-note">Farbskala der Radarquelle angenähert</small>' : ''}<span class="lg-classes">${PRECIP_CLASSES.map(c => `<span class="lg-class"><i style="background:rgb(${c.color})"></i><b>${c.label}</b><small>${c.range}</small></span>`).join('')}</span>`;
    return;
  }
  const lg = {
    temp: { title: 'Temperatur', unit: `°${store.settings.tempUnit}`, grad: 'linear-gradient(90deg,#6e40c8,#466ee6,#40aaeb,#50c8aa,#96d25a,#fad246,#fa963c,#eb503c,#aa1e3c)', labels: [-20, 0, 15, 30, 42].map(v => temp(v).replace('°', '')) },
    wind: { title: 'Windgeschwindigkeit', unit: store.settings.windUnit === 'ms' ? 'm/s' : 'km/h', grad: 'linear-gradient(90deg,#6eaadc,#78c8a0,#e6d264,#f5a050,#e15a5a,#a53773,#5f2887)', labels: [0, 20, 50, 100].map(v => wind(v, { unit: false })) },
    cloud: { title: 'Bewölkung', unit: '%', grad: isDark() ? 'linear-gradient(90deg,rgba(235,240,245,0),rgba(235,240,245,.85))' : 'linear-gradient(90deg,rgba(85,95,112,0),rgba(85,95,112,.85))', labels: ['0', '50', '100'] },
    sat: { title: 'Satellitenbild', unit: 'Echtfarben, 1 Aufnahme/Tag', grad: '', labels: [] }
  }[id];
  el.innerHTML = lg.grad
    ? `<span class="lg-title">${lg.title} <small>${lg.unit}</small></span><span class="lg-bar" style="background:${lg.grad}"></span><span class="lg-labels">${lg.labels.map(l => `<span>${l}</span>`).join('')}</span>`
    : `<span class="lg-title">${lg.title} <small>${lg.unit}</small></span>`;
}
