// Mehr: Pollenflug, Luftqualität, Biowetter, Sonne, Mond, Städtevergleich, Einstellungen
import { store } from '../store.js';
import { todayIndex, dayAt, localNow } from '../model.js';
import { pollenFromDwd, pollenFromCams, POLLEN_TEXT, aqiLevel, pollutantLevel, biowetter } from '../insights.js';
import { sunArc, moonDetail } from './sunmoon.js';
import { getCurrentMulti } from '../api.js';
import { weatherIcon, weatherText } from '../icons.js';
import { temp, wind, num, uvLevel, fmtTime, fmtDuration, fmtDeviceTime, mm } from '../format.js';
import { esc, storage } from '../util.js';
import { toast } from '../ui.js';
import { openLocationSheet } from './locations.js';

const SETTINGS = [
  { key: 'tempUnit', label: 'Temperatur', opts: [['C', '°C'], ['F', '°F']] },
  { key: 'windUnit', label: 'Windgeschwindigkeit', opts: [['kmh', 'km/h'], ['ms', 'm/s']] },
  { key: 'timeFormat', label: 'Zeitformat', opts: [['24', '24 Std.'], ['12', '12 Std.']] },
  { key: 'theme', label: 'Darstellung', opts: [['auto', 'Auto'], ['light', 'Hell'], ['dark', 'Dunkel']] },
  { key: 'animations', label: 'Animationen', opts: [[true, 'An'], [false, 'Aus']] },
  { key: 'autoRefresh', label: 'Automatisch aktualisieren', opts: [[15, '15 Min.'], [30, '30 Min.'], [0, 'Aus']] },
  { key: 'radarSource', label: 'Radarquelle', opts: [['auto', 'Auto'], ['dwd', 'DWD'], ['rainviewer', 'RainViewer']] }
];

export function renderMore(root, { onSelectLocation }) {
  const fc = store.data.forecast;
  root.innerHTML = `
    <h1 class="view-title">Mehr</h1>
    <nav class="quick-links" aria-label="Bereiche">
      ${[['pollen', 'Pollen'], ['luft', 'Luftqualität'], ['bio', 'Biowetter'], ['sonne', 'Sonne'], ['mond', 'Mond'], ['vergleich', 'Städte'], ['einstellungen', 'Einstellungen']]
        .map(([id, l]) => `<button data-jump="${id}">${l}</button>`).join('')}
    </nav>
    <section class="card" id="sec-pollen">${pollenSection()}</section>
    <section class="card" id="sec-luft">${airSection()}</section>
    <section class="card" id="sec-bio">${bioSection(fc)}</section>
    <section class="card" id="sec-sonne">${fc ? sunSection(fc) : '<p class="muted">Keine Daten.</p>'}</section>
    <section class="card" id="sec-mond"><header class="card-h"><h2>Mond</h2></header>${fc ? moonDetail(fc) : '<p class="muted">Keine Daten.</p>'}</section>
    <section class="card" id="sec-vergleich">
      <header class="card-h"><h2>Städtevergleich</h2><button class="link" data-manage>Favoriten verwalten ›</button></header>
      <div id="compare"></div>
    </section>
    <section class="card" id="sec-einstellungen">
      <header class="card-h"><h2>Einstellungen</h2></header>
      <div class="settings">
        ${SETTINGS.map(s => `<div class="setting"><span>${s.label}</span>
          <div class="segmented" role="radiogroup" aria-label="${s.label}">
            ${s.opts.map(([v, l]) => `<button role="radio" data-set="${s.key}" data-val='${JSON.stringify(v)}' aria-checked="${store.settings[s.key] === v}" class="${store.settings[s.key] === v ? 'active' : ''}">${l}</button>`).join('')}
          </div></div>`).join('')}
        <div class="setting"><span>Niederschlag</span><b class="muted">Millimeter (mm)</b></div>
      </div>
      <div class="btn-row">
        <button class="btn ghost" data-clear-cache>Zwischenspeicher leeren</button>
        <button class="btn ghost" data-install>Als App installieren</button>
      </div>
    </section>
    <section class="card">
      <header class="card-h"><h2>Datenquellen</h2></header>
      <ul class="sources">
        <li><b>Wetterprognose, Karten-Gitterdaten, Ortssuche, Luftqualität:</b> <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0)</li>
        <li><b>Amtliche Warnungen:</b> Deutscher Wetterdienst über <a href="https://brightsky.dev/" target="_blank" rel="noopener">Bright Sky</a></li>
        <li><b>Pollenflug:</b> DWD Pollenflug-Gefahrenindex; außerhalb Deutschlands CAMS (Copernicus)</li>
        <li><b>Regenradar:</b> DWD GeoServer (Deutschland), <a href="https://www.rainviewer.com/api.html" target="_blank" rel="noopener">RainViewer</a> (weltweit, persönliche Nutzung)</li>
        <li><b>Satellit:</b> NASA GIBS (VIIRS), Esri World Imagery</li>
        <li><b>Karten:</b> © OpenStreetMap-Mitwirkende, © CARTO</li>
        <li><b>Standortname:</b> BigDataCloud Reverse Geocoding</li>
      </ul>
      <p class="source-note">Himmelblick zeigt ausschließlich live abgerufene Daten. Nicht verfügbare Werte werden als solche gekennzeichnet.</p>
    </section>`;

  root.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => {
    root.querySelector('#sec-' + b.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  root.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
    store.setSetting(b.dataset.set, JSON.parse(b.dataset.val));
    const y = root.closest('.view').scrollTop;
    renderMore(root, { onSelectLocation });
    root.closest('.view').scrollTop = y;
  }));
  root.querySelector('[data-clear-cache]').addEventListener('click', async () => {
    storage.clearCache();
    try { if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.filter(k => k.startsWith('hb-')).map(k => caches.delete(k))); } } catch { /* egal */ }
    toast('Zwischenspeicher geleert – Daten werden neu geladen');
    store.emit('reload');
  });
  root.querySelector('[data-install]').addEventListener('click', () => installHint());
  root.querySelector('[data-manage]').addEventListener('click', () => openLocationSheet({ onSelect: onSelectLocation }));
  renderCompare(root.querySelector('#compare'), onSelectLocation);
}

function levelBadge(v) {
  if (v == null) return '<span class="pl pl-na" title="keine Angabe">–</span>';
  const cls = v === 0 ? 'pl0' : v <= 1 ? 'pl1' : v <= 2 ? 'pl2' : 'pl3';
  return `<span class="pl ${cls}" title="${POLLEN_TEXT[v] ?? ''}"><i style="width:${(v / 3) * 100}%"></i></span>`;
}

function pollenSection() {
  const loc = store.location;
  const isDE = (loc?.cc || '').toUpperCase() === 'DE';
  let p = null;
  if (isDE && store.data.pollen) p = pollenFromDwd(store.data.pollen, loc);
  if (!p) p = pollenFromCams(store.data.air);
  const head = `<header class="card-h"><h2>Pollenflug</h2>${p ? `<span class="muted">${esc(p.region)}</span>` : ''}</header>`;
  if (!p) {
    return head + `<p class="muted">${store.data.air ? 'Für diesen Ort sind keine Pollendaten verfügbar (Pollenmodelle decken nur Europa ab).' : 'Pollendaten werden geladen oder sind derzeit nicht abrufbar.'}</p>`;
  }
  return head + `<table class="pollen-table">
    <thead><tr><th></th>${p.days.map(d => `<th>${d}</th>`).join('')}</tr></thead>
    <tbody>${p.items.map(it => `<tr><th>${it.label}</th>${it.available
      ? [it.today, it.tomorrow, it.dayafter].map(v => `<td>${levelBadge(v)}<small>${v == null ? 'k. A.' : POLLEN_TEXT[v]}</small></td>`).join('')
      : '<td colspan="3" class="na">nicht verfügbar</td>'}</tr>`).join('')}</tbody>
  </table>
  <div class="legend-row pollen-legend"><span><span class="pl pl0"><i></i></span>keine</span><span><span class="pl pl1"><i style="width:33%"></i></span>gering</span><span><span class="pl pl2"><i style="width:66%"></i></span>mittel</span><span><span class="pl pl3"><i style="width:100%"></i></span>hoch</span></div>
  <p class="source-note">Quelle: ${esc(p.source)}${p.updated ? ' · Stand ' + esc(p.updated) : ''}.</p>`;
}

function airSection() {
  const a = store.data.air?.current;
  const head = '<header class="card-h"><h2>Luftqualität</h2><span class="muted">Europ. Luftqualitätsindex</span></header>';
  if (!a) return head + `<p class="muted">${store.meta.airError ? 'Luftqualitätsdaten sind derzeit nicht abrufbar.' : 'Wird geladen …'}</p>`;
  const lvl = aqiLevel(a.european_aqi);
  const pct = Math.min(100, ((a.european_aqi ?? 0) / 120) * 100);
  const item = (key, label) => {
    const v = a[key];
    const l = pollutantLevel(key, v);
    return `<div class="kv"><span>${label}</span><b>${v == null ? 'nicht verfügbar' : num(v, 1) + ' µg/m³'}</b><small class="${l.cls}-t">${l.text}</small></div>`;
  };
  return head + `<div class="aqi">
      <div class="aqi-value ${lvl.cls}">${a.european_aqi == null ? '–' : Math.round(a.european_aqi)}</div>
      <div class="aqi-info"><b>${lvl.text}</b><span class="aqi-scale"><b style="left:${pct}%"></b></span></div>
    </div>
    <div class="kv-grid compact">
      ${item('pm2_5', 'Feinstaub PM2,5')}
      ${item('pm10', 'Feinstaub PM10')}
      ${item('ozone', 'Ozon (O₃)')}
      ${item('nitrogen_dioxide', 'Stickstoffdioxid (NO₂)')}
    </div>
    <p class="source-note">Modelldaten CAMS (Copernicus) über Open-Meteo; Werte für die aktuelle Stunde.</p>`;
}

function bioSection(fc) {
  const head = '<header class="card-h"><h2>Biowetter</h2><span class="muted">heute</span></header>';
  const b = biowetter(fc);
  if (!b) return head + '<p class="muted">Keine Daten.</p>';
  const lv = x => `<span class="bio-lvl b${x.level}">${x.text}</span>`;
  return head + `<div class="kv-grid compact">
      <div class="kv"><span>Allgemeine Belastung</span><b>${lv(b.general)}</b></div>
      <div class="kv"><span>Wetterfühligkeit</span><b>${lv(b.sensitivity)}</b></div>
      <div class="kv"><span>Kreislaufbelastung</span><b>${lv(b.circulation)}</b></div>
    </div>
    <ul class="bio-reasons">${b.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    <p class="source-note">Eigene Abschätzung aus Luftdruck-, Temperatur- und Feuchteprognose (Open-Meteo). Keine offizielle DWD-Biowetterprognose und keine medizinische Bewertung.</p>`;
}

function sunSection(fc) {
  const ti = todayIndex(fc);
  const d = dayAt(fc, ti);
  const t = dayAt(fc, ti + 1);
  const uv = uvLevel(d.uv);
  const diff = t ? Math.round((t.daylight - d.daylight) / 60) : null;
  return `${sunArc(fc, d, localNow(fc))}
    <div class="kv-grid compact">
      <div class="kv"><span>Sonnenaufgang</span><b>${fmtTime(d.sunrise)}</b></div>
      <div class="kv"><span>Sonnenuntergang</span><b>${fmtTime(d.sunset)}</b></div>
      <div class="kv"><span>Tageslänge</span><b>${fmtDuration(d.daylight)}</b>${diff != null ? `<small>morgen ${diff === 0 ? '±' : diff > 0 ? '+' : '−'}${Math.abs(diff)} Min.</small>` : ''}</div>
      <div class="kv"><span>Sonnenscheindauer</span><b>${fmtDuration(d.sunshine)}</b></div>
      <div class="kv"><span>UV-Index max.</span><b>${num(d.uv, 1)}</b><small>${uv.text}</small></div>
    </div>`;
}

async function renderCompare(el, onSelectLocation) {
  const favs = store.favorites;
  if (!favs.length) {
    el.innerHTML = '<div class="empty"><p>Noch keine Favoriten gespeichert. Tippe oben auf den Stern, um den aktuellen Ort zu speichern.</p></div>';
    return;
  }
  el.innerHTML = '<p class="loading-text"><span class="spinner"></span> Vergleich wird geladen …</p>';
  try {
    const { list, stale, time } = await getCurrentMulti(favs);
    el.innerHTML = `<div class="compare-table" role="table">
      <div class="ct-row ct-head" role="row"><span>Ort</span><span>Jetzt</span><span>Max/Min</span><span>Regen</span><span>Wind</span></div>
      ${favs.map((f, i) => {
        const d = list[i];
        if (!d?.current) return `<div class="ct-row" role="row"><span>${esc(f.name)}</span><span class="muted">k. A.</span><span></span><span></span><span></span></div>`;
        const c = d.current, dl = d.daily;
        return `<button class="ct-row" role="row" data-cmp="${i}">
          <span class="ct-name"><b>${esc(f.name)}</b><small>${esc([f.admin1, f.country].filter(Boolean).join(', '))}</small></span>
          <span class="ct-now">${weatherIcon(c.weather_code, c.is_day === 1, { size: 28 })}<b>${temp(c.temperature_2m)}</b></span>
          <span>${temp(dl?.temperature_2m_max?.[0])} / ${temp(dl?.temperature_2m_min?.[0])}</span>
          <span>${dl?.precipitation_probability_max?.[0] ?? '–'}%<small>${mm(dl?.precipitation_sum?.[0])}</small></span>
          <span>${wind(c.wind_speed_10m)}</span>
        </button>`;
      }).join('')}
    </div>
    <p class="source-note">${stale ? 'Zwischengespeichert · ' : ''}Stand ${fmtDeviceTime(time)} · Tippen wechselt zum Ort.</p>`;
    el.querySelectorAll('[data-cmp]').forEach(b => b.addEventListener('click', () => onSelectLocation(favs[+b.dataset.cmp])));
    void weatherText;
  } catch (e) {
    el.innerHTML = `<div class="empty"><p>Vergleich konnte nicht geladen werden (${esc(e.message)}).</p></div>`;
  }
}

function installHint() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) { toast('Himmelblick läuft bereits als installierte App.'); return; }
  if (window.__deferredInstall) {
    window.__deferredInstall.prompt();
    window.__deferredInstall = null;
    return;
  }
  import('../ui.js').then(({ openSheet }) => openSheet(`
    <h2>Zum Home-Bildschirm hinzufügen</h2>
    <ol class="steps">
      <li>Öffne Himmelblick in <b>Safari</b> auf dem iPhone oder iPad.</li>
      <li>Tippe auf das <b>Teilen</b>-Symbol (Quadrat mit Pfeil nach oben).</li>
      <li>Wähle <b>„Zum Home-Bildschirm“</b> und bestätige mit <b>„Hinzufügen“</b>.</li>
    </ol>
    <p class="muted">Danach startet Himmelblick wie eine eigene App im Vollbild – inklusive Offline-Zwischenspeicher.</p>`));
}
