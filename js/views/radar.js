// Radar & interaktive Wetterkarten (Leaflet)
import { store } from '../store.js';
import { getRainViewer, getDwdRadarTimes, getGrid, DWD_WMS } from '../api.js';
import { nowcast, nowcastSummary } from '../model.js';
import { tempColor } from '../charts.js';
import { fmtAbs, temp, wind, num, windDir, MONTHS_SHORT, WEEKDAYS_SHORT } from '../format.js';
import { toast } from '../ui.js';
import { debounce, esc } from '../util.js';

const DE_BOUNDS = [[47.0, 5.3], [55.3, 15.6]];
const DWD_LAYER_BOUNDS = [[45.5, 1.5], [56.5, 19.0]];

const LAYERS = [
  { id: 'radar', label: 'Regenradar' },
  { id: 'precip', label: 'Niederschlag' },
  { id: 'temp', label: 'Temperatur' },
  { id: 'wind', label: 'Wind' },
  { id: 'cloud', label: 'Wolken' },
  { id: 'sat', label: 'Satellit' }
];

let map, root, baseLayer, labelLayer, satBase, marker;
let active = 'radar';
let frames = [];   // { t, kind, layer?, iso? }
let idx = 0, playing = false, timer = null;
let radarSource = null;
let grid = null, gridOverlay = null, gridBounds = null, gridZoom = null, gridLoading = false;
let initialized = false;

export function radarVisible() {
  if (!initialized) init();
  else {
    setTimeout(() => map.invalidateSize(), 50);
    updateNowcast();
  }
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
  if (active === 'radar') loadLayer('radar');
}

export function radarSettingsChanged() {
  if (!initialized) return;
  pause();
  if (active === 'radar' || active === 'sat') loadLayer(active);
  else { renderLegend(active); showFrame(idx); }
}

export function radarThemeChanged() {
  if (!initialized) return;
  setBase();
  renderLegend(active);
  if (['precip', 'temp', 'wind', 'cloud'].includes(active)) drawGrid();
}

function isDark() {
  return document.documentElement.dataset.theme === 'dark';
}

function init() {
  root = document.getElementById('radar-root');
  if (!window.L) {
    root.innerHTML = `<div class="map-error card"><h2>Karte nicht verfügbar</h2><p>Die Kartenbibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen und erneut versuchen.</p><button class="btn" id="map-retry">Neu laden</button></div>`;
    root.querySelector('#map-retry').addEventListener('click', () => location.reload());
    return;
  }
  initialized = true;
  const loc = store.location || { lat: 51.16, lon: 10.45 };
  root.innerHTML = `
    <div id="map" aria-label="Wetterkarte"></div>
    <div class="map-top" data-noswipe>
      <div class="layer-chips" role="tablist" aria-label="Kartenebene">
        ${LAYERS.map(l => `<button role="tab" class="chip ${l.id === active ? 'active' : ''}" data-layer="${l.id}" aria-selected="${l.id === active}">${l.label}</button>`).join('')}
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
        <button class="play-btn" id="tl-play" aria-label="Animation abspielen">${playIcon()}</button>
        <div class="tl-main">
          <div class="tl-label"><b id="tl-time">–</b><span id="tl-rel"></span></div>
          <input type="range" id="tl-range" min="0" max="0" value="0" step="1" aria-label="Zeitpunkt wählen">
          <div class="tl-ticks" id="tl-ticks"></div>
        </div>
      </div>
    </div>`;

  map = L.map('map', { zoomControl: false, attributionControl: true, worldCopyJump: true, minZoom: 3, maxZoom: 12, tap: true })
    .setView([loc.lat, loc.lon], 7);
  map.attributionControl.setPrefix(false);
  map.createPane('labels');
  map.getPane('labels').style.zIndex = 450;
  map.getPane('labels').style.pointerEvents = 'none';
  setBase();

  const pulse = L.divIcon({ className: 'loc-marker', html: '<span class="lm-dot"></span><span class="lm-pulse"></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
  marker = L.marker([loc.lat, loc.lon], { icon: pulse, keyboard: false, interactive: false }).addTo(map);

  root.querySelectorAll('[data-layer]').forEach(b => b.addEventListener('click', () => switchLayer(b.dataset.layer)));
  root.querySelector('#map-zin').addEventListener('click', () => map.zoomIn());
  root.querySelector('#map-zout').addEventListener('click', () => map.zoomOut());
  root.querySelector('#map-locate').addEventListener('click', () => {
    const l = store.location;
    if (l) map.flyTo([l.lat, l.lon], Math.max(8, map.getZoom()), { duration: 0.6 });
  });
  root.querySelector('#tl-play').addEventListener('click', () => (playing ? pause() : play()));
  const range = root.querySelector('#tl-range');
  range.addEventListener('input', () => { pause(); showFrame(+range.value); });

  map.on('moveend', debounce(() => { if (['precip', 'temp', 'wind', 'cloud'].includes(active)) ensureGrid(); }, 500));
  map.on('click', e => valuePopup(e.latlng));

  updateNowcast();
  switchLayer(active, true);
}

function setBase() {
  const dark = isDark();
  if (baseLayer) map.removeLayer(baseLayer);
  if (labelLayer) map.removeLayer(labelLayer);
  const style = dark ? 'dark' : 'light';
  baseLayer = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${style}_nolabels/{z}/{x}/{y}{r}.png`, {
    subdomains: 'abcd', maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende © <a href="https://carto.com/attributions">CARTO</a>'
  });
  labelLayer = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${style}_only_labels/{z}/{x}/{y}{r}.png`, { subdomains: 'abcd', maxZoom: 19, pane: 'labels' });
  if (active !== 'sat') baseLayer.addTo(map);
  labelLayer.addTo(map);
}

/* ---------- Ebenenwechsel ---------- */
function switchLayer(id, force = false) {
  if (id === active && !force) return;
  pause();
  active = id;
  root.querySelectorAll('[data-layer]').forEach(b => {
    b.classList.toggle('active', b.dataset.layer === id);
    b.setAttribute('aria-selected', b.dataset.layer === id);
  });
  clearFrames();
  if (gridOverlay) { map.removeLayer(gridOverlay); gridOverlay = null; }
  if (satBase && id !== 'sat') { map.removeLayer(satBase); satBase = null; if (!map.hasLayer(baseLayer)) baseLayer.addTo(map); }
  loadLayer(id);
}

function clearFrames() {
  frames.forEach(f => f.layer && map.removeLayer(f.layer));
  frames = [];
  idx = 0;
}

async function loadLayer(id) {
  setInfo('<span class="spinner"></span> Lädt …');
  renderLegend(id);
  try {
    if (id === 'radar') await loadRadar();
    else if (id === 'sat') loadSatellite();
    else await loadGridLayer();
  } catch (e) {
    console.error(e);
    setInfo(`Daten nicht verfügbar: ${esc(e.message || 'Fehler')}`, true);
  }
}

/* ---------- Regenradar ---------- */
async function loadRadar() {
  clearFrames();
  const loc = store.location;
  const inDE = loc && loc.lat > DE_BOUNDS[0][0] && loc.lat < DE_BOUNDS[1][0] && loc.lon > DE_BOUNDS[0][1] && loc.lon < DE_BOUNDS[1][1];
  const pref = store.settings.radarSource;
  let useDwd = pref === 'dwd' || (pref === 'auto' && inDE);
  if (useDwd) {
    try {
      await loadDwdRadar();
      radarSource = 'dwd';
    } catch (e) {
      console.warn('DWD-Radar nicht verfügbar', e);
      if (pref === 'dwd') toast('DWD-Radar nicht erreichbar – RainViewer wird verwendet.');
      useDwd = false;
    }
  }
  if (!useDwd) {
    await loadRainViewer();
    radarSource = 'rainviewer';
  }
  if (active !== 'radar') return;
  // Startbild: aktuellster Beobachtungszeitpunkt
  const nowIdx = frames.reduce((best, f, i) => (f.t <= Date.now() ? i : best), 0);
  setupTimeline(nowIdx);
  setInfo(radarSource === 'dwd'
    ? 'Radar: Deutscher Wetterdienst · 5-Minuten-Komposit' + (frames.some(f => f.kind === 'future') ? ' + Vorhersage' : '')
    : 'Radar: RainViewer · letzte 2 Std. (ohne Vorhersage)');
}

async function loadDwdRadar() {
  const times = await getDwdRadarTimes();
  const now = Date.now();
  let sel = times.filter(t => t >= now - 2 * 3600e3 && t <= now + 2 * 3600e3);
  if (!sel.length) throw new Error('Keine aktuellen DWD-Radarzeiten');
  // auf 10-Minuten-Schritte ausdünnen
  sel = sel.filter((t, i) => i === sel.length - 1 || Math.round(t / 60000) % 10 === 0);
  if (active !== 'radar') return;
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
      zIndex: 300,
      bounds: DWD_LAYER_BOUNDS,
      attribution: 'Radar: © <a href="https://www.dwd.de">Deutscher Wetterdienst</a>'
    })
  }));
  frames.forEach(f => f.layer.addTo(map));
}

async function loadRainViewer() {
  const { data } = await getRainViewer();
  if (active !== 'radar') return;
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
      opacity: 0, zIndex: 300, maxNativeZoom: 7, maxZoom: 12,
      attribution: 'Radar: <a href="https://www.rainviewer.com">RainViewer</a>'
    })
  }));
  frames.forEach(f => f.layer.addTo(map));
}

/* ---------- Satellit ---------- */
function loadSatellite() {
  clearFrames();
  if (map.hasLayer(baseLayer)) map.removeLayer(baseLayer);
  satBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Bilder: © Esri, Maxar, Earthstar Geographics'
  }).addTo(map);
  const today = new Date();
  for (let d = 7; d >= 1; d--) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - d));
    const ds = day.toISOString().slice(0, 10);
    frames.push({
      t: day.getTime(), kind: 'day', date: ds,
      layer: L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${ds}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, {
        opacity: 0, zIndex: 300, maxNativeZoom: 9, maxZoom: 12,
        attribution: 'Satellit: <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a> (VIIRS)'
      })
    });
  }
  frames.forEach(f => f.layer.addTo(map));
  setupTimeline(frames.length - 1);
  setInfo('Satellit: NASA VIIRS Tagesaufnahme (Wolken, Echtfarben) über Esri-Luftbild');
}

/* ---------- Gitterbasierte Modellkarten (Open-Meteo) ---------- */
async function loadGridLayer() {
  await ensureGrid(true);
  if (!grid) return;
  const nowH = Math.floor(Date.now() / 3600e3) * 3600e3;
  frames = [];
  for (let h = 0; h <= 48; h++) {
    const t = nowH + h * 3600e3;
    const iso = new Date(t).toISOString().slice(0, 13) + ':00';
    const ti = grid.times.indexOf(iso);
    if (ti >= 0) frames.push({ t, kind: h === 0 ? 'now' : 'future', ti });
  }
  if (!frames.length) throw new Error('Keine Zeitschritte');
  setupTimeline(0);
  setInfo(`Modellprognose (Open-Meteo) · ${{ precip: 'Niederschlag mm/h', temp: 'Temperatur 2 m', wind: 'Wind 10 m', cloud: 'Gesamtbewölkung' }[active]} · Karte antippen für Werte`);
}

async function ensureGrid(force = false) {
  const b = map.getBounds();
  const z = map.getZoom();
  if (!force && gridBounds && gridBounds.contains(b) && Math.abs(z - gridZoom) < 1 && grid) {
    if (frames.length) drawGrid();
    return;
  }
  if (gridLoading) return;
  gridLoading = true;
  const padded = b.pad(0.25);
  const s = Math.max(-85, padded.getSouth()), n = Math.min(85, padded.getNorth());
  const w = padded.getWest(), e = padded.getEast();
  const N = 10;
  const lats = [], lons = [];
  for (let i = 0; i < N; i++) lats.push(s + ((n - s) * i) / (N - 1));
  for (let j = 0; j < N; j++) lons.push(w + ((e - w) * j) / (N - 1));
  const pts = [];
  lats.forEach(la => lons.forEach(lo => pts.push([la, ((lo + 540) % 360) - 180])));
  try {
    setInfo('<span class="spinner"></span> Kartendaten werden geladen …');
    const res = await getGrid(pts);
    const times = res[0].hourly.time;
    const pick = key => res.map(r => r.hourly[key]);
    grid = {
      lats, lons, s, n, w, e, times,
      temp: pick('temperature_2m'), precip: pick('precipitation'), cloud: pick('cloud_cover'),
      wind: pick('wind_speed_10m'), dir: pick('wind_direction_10m')
    };
    gridBounds = L.latLngBounds([s, w], [n, e]);
    gridZoom = z;
    if (frames.length) { drawGrid(); restoreInfo(); }
  } catch (err) {
    setInfo(`Kartendaten nicht verfügbar (${esc(err.message)})`, true);
    if (!grid) throw err;
  } finally {
    gridLoading = false;
  }
}

function restoreInfo() {
  setInfo(`Modellprognose (Open-Meteo) · ${{ precip: 'Niederschlag mm/h', temp: 'Temperatur 2 m', wind: 'Wind 10 m', cloud: 'Gesamtbewölkung' }[active] || ''} · Karte antippen für Werte`);
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
    // Richtungen über Vektoren mitteln
    const vec = (x, wgt) => [Math.sin(x * Math.PI / 180) * wgt, Math.cos(x * Math.PI / 180) * wgt];
    const parts = [vec(a, (1 - di) * (1 - dj)), vec(b, (1 - di) * dj), vec(c, di * (1 - dj)), vec(d, di * dj)];
    const sx = parts.reduce((s, p) => s + p[0], 0), sy = parts.reduce((s, p) => s + p[1], 0);
    return (Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360;
  }
  return a * (1 - di) * (1 - dj) + b * (1 - di) * dj + c * di * (1 - dj) + d * di * dj;
}

const mercY = lat => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercY = y => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;

function colorFor(key, v, dark) {
  if (v == null || isNaN(v)) return null;
  if (key === 'temp') {
    const m = tempColor(v).match(/\d+/g).map(Number);
    return [m[0], m[1], m[2], 150];
  }
  if (key === 'precip') {
    if (v < 0.05) return null;
    const stops = [[0.05, [150, 210, 255, 60]], [0.3, [90, 170, 250, 150]], [1, [40, 110, 230, 190]], [2.5, [20, 60, 190, 210]], [5, [250, 210, 40, 220]], [10, [250, 130, 30, 230]], [20, [220, 40, 40, 235]], [40, [160, 30, 160, 240]]];
    return ramp(stops, v);
  }
  if (key === 'cloud') {
    if (v < 5) return null;
    const a = Math.round((v / 100) * 200);
    return dark ? [235, 240, 245, a] : [95, 105, 120, a];
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
  if (!grid || !frames[idx] || !['precip', 'temp', 'wind', 'cloud'].includes(active)) return;
  const ti = frames[idx].ti;
  const W = 300, H = 300;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const yN = mercY(grid.n), yS = mercY(grid.s);
  const dark = isDark();
  for (let py = 0; py < H; py++) {
    const lat = invMercY(yN + ((yS - yN) * (py + 0.5)) / H);
    for (let px = 0; px < W; px++) {
      const lon = grid.w + ((grid.e - grid.w) * (px + 0.5)) / W;
      const col = colorFor(active, gridValue(active === 'wind' ? 'wind' : active, ti, lat, lon), dark);
      if (!col) continue;
      const o = (py * W + px) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = col[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  if (active === 'wind') {
    // Windpfeile
    const steps = 8;
    ctx.strokeStyle = dark ? 'rgba(255,255,255,.85)' : 'rgba(20,30,45,.75)';
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
        const ang = ((dir + 180) * Math.PI) / 180; // Zugrichtung
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
  const url = cv.toDataURL();
  const bounds = [[grid.s, grid.w], [grid.n, grid.e]];
  if (!gridOverlay) {
    gridOverlay = L.imageOverlay(url, bounds, { opacity: 0.85, zIndex: 300, className: 'grid-overlay', attribution: 'Modelldaten: <a href="https://open-meteo.com">Open-Meteo</a>' }).addTo(map);
  } else {
    gridOverlay.setUrl(url);
    gridOverlay.setBounds(L.latLngBounds(bounds));
  }
}

function valuePopup(latlng) {
  if (!grid || !['precip', 'temp', 'wind', 'cloud'].includes(active) || !frames[idx]) return;
  const ti = frames[idx].ti;
  const lon = ((latlng.lng + 540) % 360) - 180;
  const v = gridValue(active, ti, latlng.lat, lon);
  if (v == null) return;
  let text = '';
  if (active === 'temp') text = `Temperatur: <b>${temp(v)}</b>`;
  if (active === 'precip') text = `Niederschlag: <b>${num(v, 1)} mm/h</b>`;
  if (active === 'cloud') text = `Bewölkung: <b>${Math.round(v)} %</b>`;
  if (active === 'wind') text = `Wind: <b>${wind(v)}</b> aus ${windDir(gridValue('dir', ti, latlng.lat, lon))}`;
  L.popup({ closeButton: false, className: 'value-popup', autoClose: true }).setLatLng(latlng).setContent(text).openOn(map);
}

/* ---------- Zeitleiste ---------- */
function setupTimeline(start = 0) {
  const range = root.querySelector('#tl-range');
  range.max = Math.max(0, frames.length - 1);
  range.disabled = frames.length < 2;
  root.querySelector('#tl-play').disabled = frames.length < 2;
  // Markierungen
  const ticks = root.querySelector('#tl-ticks');
  const tz = store.data.forecast?.timezone;
  const n = frames.length;
  const nowI = frames.reduce((best, f, i) => (f.t <= Date.now() ? i : best), -1);
  let marks = [];
  if (n > 1) {
    marks = [[0, shortLabel(frames[0], tz)], [n - 1, shortLabel(frames[n - 1], tz)]];
    const showNow = nowI > 0 && nowI < n - 1 && active === 'radar';
    const mid = showNow ? [nowI, 'Jetzt'] : [Math.floor((n - 1) / 2), shortLabel(frames[Math.floor((n - 1) / 2)], tz)];
    marks = marks.filter(m => Math.abs(m[0] - mid[0]) > n * 0.2);
    marks.push(mid);
    marks.sort((x, y) => x[0] - y[0]);
  }
  ticks.innerHTML = marks.map(([i, l]) => {
    const pos = (i / (n - 1)) * 100;
    const tr = i === 0 ? '0' : i === n - 1 ? '-100%' : '-50%';
    return `<span style="left:${pos}%;transform:translateX(${tr})" class="${l === 'Jetzt' ? 'now' : ''}">${l}</span>`;
  }).join('');
  // Fortschrittsfarbe für Vergangenheit/Zukunft
  const futureStart = frames.findIndex(f => f.kind === 'future');
  range.style.setProperty('--future', futureStart > 0 && n > 1 ? `${(futureStart / (n - 1)) * 100}%` : '100%');
  showFrame(Math.max(0, Math.min(start, n - 1)));
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
  if (prev && prev.layer && prev !== f) prev.layer.setOpacity(0);
  if (f.layer) f.layer.setOpacity(active === 'sat' ? 0.92 : 0.75);
  // benachbarte Frames vorladen (Opacity 0 ist bereits auf der Karte)
  if (!f.layer) drawGrid();
  const range = root.querySelector('#tl-range');
  range.value = i;
  const tz = store.data.forecast?.timezone;
  const timeEl = root.querySelector('#tl-time'), relEl = root.querySelector('#tl-rel');
  if (f.kind === 'day') {
    const d = new Date(f.t);
    timeEl.textContent = `${WEEKDAYS_SHORT[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONTHS_SHORT[d.getUTCMonth()]}`;
    relEl.textContent = 'Tagesaufnahme';
  } else {
    timeEl.textContent = fmtAbs(new Date(f.t).toISOString(), tz, { date: !sameDay(f.t) });
    const diff = Math.round((f.t - Date.now()) / 60000);
    relEl.textContent = Math.abs(diff) < 5 && active === 'radar' ? 'Jetzt'
      : diff < 0 ? `vor ${fmtRel(-diff)}`
        : f.kind === 'now' ? 'Aktuelle Stunde' : `in ${fmtRel(diff)}${active === 'radar' ? ' · Vorhersage' : ''}`;
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

function play() {
  if (frames.length < 2) return;
  playing = true;
  root.querySelector('#tl-play').innerHTML = pauseIcon();
  root.querySelector('#tl-play').setAttribute('aria-label', 'Animation anhalten');
  const delay = active === 'radar' ? 450 : 700;
  const tick = () => {
    if (!playing) return;
    const next = idx + 1 >= frames.length ? 0 : idx + 1;
    showFrame(next);
    timer = setTimeout(tick, next === frames.length - 1 ? delay * 3 : delay);
  };
  timer = setTimeout(tick, delay);
}

function pause() {
  playing = false;
  clearTimeout(timer);
  const b = root?.querySelector('#tl-play');
  if (b) { b.innerHTML = playIcon(); b.setAttribute('aria-label', 'Animation abspielen'); }
}

const playIcon = () => '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const pauseIcon = () => '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';

/* ---------- Legende & Info ---------- */
function setInfo(markup, error = false) {
  const el = root?.querySelector('#map-info');
  if (!el) return;
  const nc = el.querySelector('.nc');
  el.innerHTML = `<span class="mi-text ${error ? 'err' : ''}">${markup}</span>`;
  if (nc) el.prepend(nc);
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
  const lg = {
    radar: { title: 'Niederschlagsintensität', grad: 'linear-gradient(90deg,#9fd3ff,#3d8cf0,#1f4fc4,#f6d23a,#f08a24,#d8312e,#9b2aa5)', labels: ['leicht', 'mäßig', 'stark', 'Unwetter'] },
    precip: { title: 'Niederschlag (mm/h)', grad: 'linear-gradient(90deg,#96d2ff,#5aaafa,#286ee6,#143cbe,#fad228,#fa821e,#dc2828,#a01ea0)', labels: ['0,1', '1', '5', '20+'] },
    temp: { title: `Temperatur (°${store.settings.tempUnit})`, grad: 'linear-gradient(90deg,#6e40c8,#466ee6,#40aaeb,#50c8aa,#96d25a,#fad246,#fa963c,#eb503c,#aa1e3c)', labels: [-20, 0, 15, 30, 42].map(v => temp(v).replace('°', '')) },
    wind: { title: `Wind (${store.settings.windUnit === 'ms' ? 'm/s' : 'km/h'})`, grad: 'linear-gradient(90deg,#6eaadc,#78c8a0,#e6d264,#f5a050,#e15a5a,#a53773,#5f2887)', labels: [0, 20, 50, 100].map(v => wind(v, { unit: false })) },
    cloud: { title: 'Bewölkung (%)', grad: isDark() ? 'linear-gradient(90deg,rgba(235,240,245,0),rgba(235,240,245,.8))' : 'linear-gradient(90deg,rgba(95,105,120,0),rgba(95,105,120,.8))', labels: ['0', '50', '100'] },
    sat: { title: 'Satellitenbild (Echtfarben)', grad: '', labels: [] }
  }[id];
  el.innerHTML = lg.grad
    ? `<span class="lg-title">${lg.title}</span><span class="lg-bar" style="background:${lg.grad}"></span><span class="lg-labels">${lg.labels.map(l => `<span>${l}</span>`).join('')}</span>`
    : `<span class="lg-title">${lg.title}</span>`;
}
