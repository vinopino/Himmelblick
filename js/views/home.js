// Startbildschirm – aktuelles Wetter
import { store } from '../store.js';
import { current, todayIndex, dayAt, hoursFrom, localNow, pressureTrend, nowcast, nowcastSummary } from '../model.js';
import { weatherIcon, weatherText, windArrow, dropIcon } from '../icons.js';
import {
  temp, wind, mm, fmtTime, fmtDate, windDir, windDirLong, uvLevel, visibility, num, fmtDeviceTime, relTime,
  beaufort, BEAUFORT_TEXT, fmtDuration
} from '../format.js';
import { hourStrip, dayList } from '../charts.js';
import { officialAlerts, modelHints, LEVELS, typeIcon } from '../warnlogic.js';
import { showHour, showDay } from './details.js';
import { sunArc, moonCard } from './sunmoon.js';
import { esc } from '../util.js';

export function renderHome(root, { navigate, retry }) {
  const fc = store.data.forecast;
  if (!fc) {
    root.innerHTML = store.meta.error ? errorState(store.meta.error) : skeleton();
    root.querySelector('[data-retry]')?.addEventListener('click', retry);
    return;
  }
  const c = current(fc);
  const ti = todayIndex(fc);
  const today = dayAt(fc, ti);
  const nowL = localNow(fc);
  const hours = hoursFrom(fc, c.hourIndex, 25);
  const days = [];
  for (let i = ti; i < ti + 7; i++) { const d = dayAt(fc, i); if (d) days.push(d); }
  const trend = pressureTrend(fc);
  const nc = nowcast(fc);
  const ncText = nowcastSummary(nc);
  const uv = uvLevel(c.uv);
  const bf = beaufort(c.wind || 0);

  const official = officialAlerts(store.data.alerts);
  const hints = modelHints(fc);
  let banner = '';
  if (official.length) {
    const a = official[0];
    banner = `<button class="warn-banner ${LEVELS[a.level].cls}" data-nav="warnungen">
      <span class="wb-ico">${typeIcon(a.type, 22)}</span>
      <span class="wb-text"><b>${esc(a.event)}</b><small>${LEVELS[a.level].name}${official.length > 1 ? ` · +${official.length - 1} weitere` : ''} · DWD</small></span>
      <span class="wb-chev">›</span></button>`;
  } else if (hints.some(h => h.level >= 2)) {
    const a = hints[0];
    banner = `<button class="warn-banner soft ${LEVELS[a.level].cls}" data-nav="warnungen">
      <span class="wb-ico">${typeIcon(a.type, 22)}</span>
      <span class="wb-text"><b>${esc(a.event)} möglich</b><small>Hinweis aus der Modellprognose · keine amtliche Warnung</small></span>
      <span class="wb-chev">›</span></button>`;
  }

  const precipToday = today ? today.precip : null;
  const stale = store.meta.stale;

  root.innerHTML = `
    <section class="hero fade-in">
      <div class="hero-main">
        <div class="hero-icon">${weatherIcon(c.code, c.isDay, { size: 150, animated: store.settings.animations })}</div>
        <div class="hero-temp-wrap">
          <div class="hero-temp">${temp(c.temp).replace('°', '')}<span>°</span></div>
          <div class="hero-cond">${weatherText(c.code)}</div>
          <div class="hero-feels">Gefühlt ${temp(c.feels)}</div>
        </div>
      </div>
      <div class="hero-row">
        <span class="pill">↑ ${temp(today?.max)}</span>
        <span class="pill">↓ ${temp(today?.min)}</span>
        <span class="pill">${sunIcon('rise')} ${fmtTime(today?.sunrise)}</span>
        <span class="pill">${sunIcon('set')} ${fmtTime(today?.sunset)}</span>
      </div>
      <p class="updated ${stale ? 'stale' : ''}">${stale ? '⚠︎ Zwischengespeicherte Daten · ' : ''}Aktualisiert ${fmtDeviceTime(store.meta.updated)} (${relTime(store.meta.updated)})</p>
    </section>

    ${banner}

    ${nowcastCard(fc)}

    <section class="card span-all">
      <header class="card-h"><h2>Nächste 24 Stunden</h2><button class="link" data-nav="vorhersage">48 Std. ›</button></header>
      ${hourStrip(hours, { nowIso: fc.hourly.time[c.hourIndex] })}
    </section>

    <section class="details-grid">
      ${tile('Regenwahrsch.', `${c.pop ?? 0}<small>%</small>`, `heute max. ${today?.pop ?? 0} %`, 'rain', barMeter(c.pop ?? 0))}
      ${tile('Niederschlag', mm(c.precip), `heute gesamt ${mm(precipToday)}`, 'drop')}
      ${tile('Wind', `${wind(c.wind, { unit: false })}<small>${store.settings.windUnit === 'ms' ? 'm/s' : 'km/h'}</small>`, `${bf} Bft · ${BEAUFORT_TEXT[bf]}`, 'wind', barMeter(Math.min(100, (c.wind || 0) / 1.2)))}
      ${tile('Windrichtung', windDir(c.dir), `aus ${windDirLong(c.dir)} · ${Math.round(c.dir ?? 0)}°`, 'compass', compass(c.dir))}
      ${tile('Windböen', `${wind(c.gust, { unit: false })}<small>${store.settings.windUnit === 'ms' ? 'm/s' : 'km/h'}</small>`, BEAUFORT_TEXT[beaufort(c.gust || 0)], 'gust', barMeter(Math.min(100, (c.gust || 0) / 1.2)))}
      ${tile('Luftfeuchte', `${c.humidity ?? '–'}<small>%</small>`, `Taupunkt ${temp(c.dew)}`, 'humidity', barMeter(c.humidity ?? 0))}
      ${tile('Luftdruck', `${num(c.pressure)}<small>hPa</small>`, trend.text ? `${trend.text} (${trend.delta > 0 ? '+' : ''}${num(trend.delta, 1)} hPa/3 Std.)` : 'Tendenz n. v.', 'pressure')}
      ${tile('UV-Index', `${num(c.uv, 1)}`, `${uv.text} · max. ${num(today?.uv, 1)}`, 'uv', uvMeter(c.uv))}
      ${tile('Sichtweite', visibility(c.vis), c.vis != null && c.vis < 1000 ? 'Nebel/Dunst' : 'Fernsicht', 'eye')}
      ${tile('Bewölkung', `${c.cloud ?? '–'}<small>%</small>`, cloudText(c.cloud), 'cloud', barMeter(c.cloud ?? 0))}
    </section>

    <section class="card">
      <header class="card-h"><h2>7 Tage</h2><button class="link" data-nav="vorhersage">14 Tage ›</button></header>
      ${dayList(days, { todayIso: today?.iso })}
    </section>

    <section class="card-row">
      <div class="card">${sunArc(fc, today, nowL)}</div>
      <div class="card">${moonCard(fc)}</div>
    </section>

    <p class="source-foot">Wetterdaten: Open-Meteo.com (CC BY 4.0) · Warnungen: DWD über Bright Sky · Ortszeit ${esc(fc.timezone_abbreviation || fc.timezone)}</p>
  `;

  root.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.nav)));
  root.querySelectorAll('[data-hour]').forEach(b => b.addEventListener('click', () => showHour(fc, +b.dataset.hour)));
  root.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => showDay(fc, +b.dataset.day)));
}

/* ---------- Niederschlags-Kurzfristprognose (15-Minuten-Werte) ---------- */
const INTENSITY = [
  [0.1, 'kein Niederschlag'], [1, 'leicht'], [4, 'mäßig'], [10, 'stark'], [Infinity, 'sehr stark']
];
function intensityText(mmh) {
  return INTENSITY.find(([lim]) => mmh < lim)[1];
}
function intensityClass(mmh) {
  return mmh < 0.1 ? 'i0' : mmh < 1 ? 'i1' : mmh < 4 ? 'i2' : mmh < 10 ? 'i3' : 'i4';
}

function nowcastCard(fc) {
  let items = nowcast(fc);
  let step = 15, source = '15-Minuten-Werte';
  if (!items) {
    // Rückfall: Stundenwerte der nächsten 6 Stunden
    const c = current(fc);
    items = hoursFrom(fc, c.hourIndex, 6).map(h => ({ time: h.time, v: h.precip }));
    step = 60; source = 'Stundenwerte';
    if (!items.length) return '';
  }
  const perHour = 60 / step;
  const rates = items.map(x => (x.v || 0) * perHour);            // mm/h
  const wet = rates.map(r => r >= 0.1);
  const total = items.reduce((s, x) => s + (x.v || 0), 0);
  const maxRate = Math.max(...rates);
  const startI = wet.indexOf(true);
  const endI = startI >= 0 ? wet.indexOf(false, startI) : -1;
  const tStr = i => fmtTime(items[i].time);
  let head, sub;
  if (startI < 0) {
    head = `Kein Niederschlag in den nächsten ${Math.round(items.length * step / 60)} Stunden`;
    sub = 'Trocken – Radar zeigt die Lage in der Umgebung.';
  } else if (startI === 0) {
    head = endI < 0 ? 'Es regnet – vorerst anhaltend' : `Niederschlag endet gegen ${tStr(endI)}`;
    sub = `Aktuell ${intensityText(rates[0])} · bis zu ${num(maxRate, 1)} mm/h`;
  } else {
    head = `Niederschlag ab etwa ${tStr(startI)}`;
    sub = `In ca. ${startI * step} Min. · ${intensityText(maxRate)}${endI > 0 ? ` · endet gegen ${tStr(endI)}` : ''}`;
  }
  const max = Math.max(1, maxRate);
  const bars = items.map((x, i) => {
    const h = rates[i] > 0 ? Math.max(6, Math.min(100, (Math.sqrt(rates[i]) / Math.sqrt(max)) * 100)) : 3;
    return `<i class="${intensityClass(rates[i])}" style="height:${h}%" title="${tStr(i)}: ${num(rates[i], 1)} mm/h"></i>`;
  }).join('');
  const labelEvery = step === 15 ? 4 : 1;
  const axis = items.map((x, i) => `<span>${i === 0 ? 'Jetzt' : i % labelEvery === 0 ? tStr(i) : ''}</span>`).join('');
  return `<section class="card nowcast ${startI >= 0 ? 'is-wet' : ''}">
    <header class="card-h"><h2>Niederschlag kurzfristig</h2><button class="link" data-nav="radar">Radar ›</button></header>
    <div class="nc-head">
      <span class="nc-ico">${dropIcon(20)}</span>
      <div><b>${head}</b><small>${sub}</small></div>
    </div>
    <div class="nc-chart" role="img" aria-label="Niederschlagsverlauf: ${head}">
      <div class="nc-grid"><span>stark</span><span>mäßig</span><span>leicht</span></div>
      <div class="nc-cols" style="--n:${items.length}">${bars}</div>
    </div>
    <div class="nc-axis" style="--n:${items.length}">${axis}</div>
    <div class="nc-stats">
      <span><small>Beginn</small><b>${startI < 0 ? '–' : startI === 0 ? 'jetzt' : tStr(startI)}</b></span>
      <span><small>Ende</small><b>${startI < 0 ? '–' : endI < 0 ? 'offen' : tStr(endI)}</b></span>
      <span><small>Menge</small><b>${mm(total)}</b></span>
      <span><small>Intensität max.</small><b>${startI < 0 ? '–' : intensityText(maxRate)}</b></span>
    </div>
    <p class="source-note">Open-Meteo, ${source} · Intensität in mm/h: leicht &lt; 1, mäßig 1–4, stark 4–10, sehr stark &gt; 10.</p>
  </section>`;
}

function cloudText(c) {
  if (c == null) return '';
  if (c < 12) return 'Wolkenlos';
  if (c < 40) return 'Leicht bewölkt';
  if (c < 70) return 'Wolkig';
  if (c < 90) return 'Stark bewölkt';
  return 'Bedeckt';
}

const TILE_ICONS = {
  rain: '<path d="M12 3s-6 6.6-6 10.5a6 6 0 0 0 12 0C18 9.6 12 3 12 3z"/>',
  drop: '<path d="M7 14a5 5 0 0 0 10 0c0-3-5-9-5-9s-5 6-5 9zM4 20h16v2H4z"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  gust: '<path d="M2 9h13a3 3 0 1 0-3-3M2 13h18M2 17h11a3 3 0 1 1-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  humidity: '<path d="M12 3s-6 6.6-6 10.5a6 6 0 0 0 12 0C18 9.6 12 3 12 3zm-2 13l4-6m-4 1h.01M14 15h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  pressure: '<path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9zm0 4v5l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  uv: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  eye: '<path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/>',
  cloud: '<path d="M7 19h10a4.5 4.5 0 0 0 .6-9A6 6 0 0 0 6.2 9 5 5 0 0 0 7 19z"/>',
  compass: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 5l3 8h-6z"/>',
  sun: '<path d="M2 18h20M6 18a6 6 0 0 1 12 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 4v3M4.9 8.9l2.1 2.1M19.1 8.9 17 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
};

function tile(label, value, sub, icon, extra = '') {
  return `<div class="tile">
    <span class="tile-label"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">${TILE_ICONS[icon] || ''}</svg>${label}</span>
    <span class="tile-value">${value}</span>
    ${extra}
    <span class="tile-sub">${sub}</span>
  </div>`;
}

function barMeter(pct) {
  return `<span class="meter"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span>`;
}

function uvMeter(uv) {
  const pos = Math.max(0, Math.min(100, ((uv || 0) / 11) * 100));
  return `<span class="meter uv"><b style="left:${pos}%"></b></span>`;
}

function compass(deg) {
  return `<span class="compass" aria-hidden="true"><span class="c-n">N</span>${windArrow(deg, 22)}</span>`;
}

function sunIcon(type) {
  return type === 'rise'
    ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 3v6M9 6l3-3 3 3"/></svg>'
    : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 9V3M9 6l3 3 3-3"/></svg>';
}

function skeleton() {
  return `<section class="hero skeleton-hero"><div class="sk sk-circle"></div><div class="sk sk-line w60"></div><div class="sk sk-line w40"></div></section>
    <section class="card"><div class="sk sk-block"></div></section>
    <section class="details-grid">${'<div class="tile"><div class="sk sk-line w60"></div><div class="sk sk-line w40"></div></div>'.repeat(6)}</section>
    <p class="loading-text"><span class="spinner"></span> Wetterdaten werden geladen …</p>`;
}

function errorState(err) {
  const offline = !navigator.onLine || err.offline;
  return `<section class="card error-card">
    <div class="err-ico">${offline ? '📡' : '⚠︎'}</div>
    <h2>${offline ? 'Keine Internetverbindung' : 'Wetterdaten konnten nicht geladen werden'}</h2>
    <p>${offline ? 'Bitte prüfe deine Verbindung. Sobald du wieder online bist, werden die Daten automatisch geladen.' : esc(err.message || 'Unbekannter Fehler')}.</p>
    <button class="btn" data-retry>Erneut versuchen</button>
  </section>`;
}

export { fmtDate };
