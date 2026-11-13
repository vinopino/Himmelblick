// Stundenleiste mit integriertem Temperaturdiagramm, Tagesliste und interaktives Verlaufsdiagramm
import { weatherIcon, windArrow, dropIcon } from './icons.js';
import { temp, tempVal, fmtHourShort, fmtTime, WEEKDAYS_SHORT, wind, mm, windUnitLabel } from './format.js';
import { smoothPath, uid, esc } from './util.js';

export const COL = 60;

/** Temperaturfarbe (°C) für Balken und Karten */
export function tempColor(c) {
  const stops = [[-20, [110, 64, 200]], [-10, [70, 110, 230]], [0, [64, 170, 235]], [8, [80, 200, 170]], [15, [150, 210, 90]], [22, [250, 210, 70]], [28, [250, 150, 60]], [34, [235, 80, 60]], [42, [170, 30, 60]]];
  if (c <= stops[0][0]) return `rgb(${stops[0][1]})`;
  for (let i = 1; i < stops.length; i++) {
    if (c <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      const f = (c - t0) / (t1 - t0);
      return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * f)).join(',')})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1]})`;
}

/**
 * Horizontale Stundenleiste.
 * @param {Array} hours Stundenobjekte aus model.hourAt
 * @param {number} nowIso ISO-String der aktuellen Stunde (wird hervorgehoben)
 */
export function hourStrip(hours, { nowIso = null } = {}) {
  if (!hours.length) return '<p class="muted">Keine Stundenwerte verfügbar.</p>';
  const id = uid('hs');
  const n = hours.length;
  const width = n * COL;
  const chartH = 64, padT = 20, padB = 8;
  const temps = hours.map(h => tempVal(h.temp));
  const tMin = Math.min(...temps), tMax = Math.max(...temps);
  const span = Math.max(4, tMax - tMin);
  const y = v => padT + (1 - (v - tMin) / span) * (chartH - padT - padB);
  const pts = temps.map((v, i) => [i * COL + COL / 2, y(v)]);
  const line = smoothPath(pts);
  const area = `${line} L${pts[n - 1][0]},${chartH} L${pts[0][0]},${chartH} Z`;
  const maxP = Math.max(2, ...hours.map(h => h.precip || 0));

  const cols = hours.map((h, i) => {
    const isNow = h.iso === nowIso;
    const midnight = h.time.getUTCHours() === 0 && i > 0;
    const label = isNow ? 'Jetzt' : fmtHourShort(h.time);
    const barH = h.precip > 0 ? Math.max(3, Math.round((h.precip / maxP) * 26)) : 0;
    return `<button class="hour-col ${isNow ? 'now' : ''} ${midnight ? 'midnight' : ''}" data-hour="${h.i}" style="width:${COL}px" aria-label="${esc(label)}: ${temp(h.temp)}">
      ${midnight ? `<span class="day-tag">${WEEKDAYS_SHORT[h.time.getUTCDay()]} ${h.time.getUTCDate()}.</span>` : ''}
      <span class="h-time">${label}</span>
      ${weatherIcon(h.code, h.isDay, { size: 32 })}
      <span class="h-chart-space" style="height:${chartH}px"></span>
      <span class="h-pop ${h.pop >= 30 ? 'wet' : ''}">${dropIcon(9)}${h.pop ?? 0}%</span>
      <span class="h-bar"><i style="height:${barH}px"></i></span>
      <span class="h-mm">${h.precip > 0 ? mm(h.precip).replace(' mm', '') : '–'}</span>
      <span class="h-wind">${windArrow(h.dir, 13)}${wind(h.wind, { unit: false })}</span>
    </button>`;
  }).join('');

  const labels = pts.map((p, i) => `<text x="${p[0]}" y="${p[1] - 8}" text-anchor="middle">${Math.round(temps[i])}°</text>`).join('');
  const dots = pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${hours[i].iso === nowIso ? 4 : 2.6}" ${hours[i].iso === nowIso ? 'class="now-dot"' : ''}/>`).join('');

  return `<div class="hour-scroll" data-noswipe>
    <div class="hour-track" style="width:${width}px">
      <svg class="hour-chart" width="${width}" height="${chartH}" viewBox="0 0 ${width} ${chartH}" aria-hidden="true">
        <defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--chart-line)" stop-opacity=".35"/><stop offset="1" stop-color="var(--chart-line)" stop-opacity="0"/>
        </linearGradient></defs>
        <path d="${area}" fill="url(#${id}g)" class="chart-area"/>
        <path d="${line}" class="chart-line" pathLength="1"/>
        <g class="chart-dots">${dots}</g>
        <g class="chart-labels">${labels}</g>
      </svg>
      <div class="hour-cols">${cols}</div>
    </div>
    <div class="hour-legend"><span>${dropIcon(9)} Regenwahrsch.</span><span>Niederschlag (mm)</span><span>Wind (${windUnitShort()})</span></div>
  </div>`;
}

function windUnitShort() {
  return windUnitLabel();
}

/** Liste der Tagesvorhersagen */
export function dayList(days, { todayIso, uncertainFrom = 7 }) {
  const lo = Math.min(...days.map(d => d.min));
  const hi = Math.max(...days.map(d => d.max));
  const span = Math.max(1, hi - lo);
  return `<ul class="day-list">${days.map((d, idx) => {
    const left = ((d.min - lo) / span) * 100;
    const w = Math.max(6, ((d.max - d.min) / span) * 100);
    const isToday = d.iso === todayIso;
    const name = isToday ? 'Heute' : WEEKDAYS_SHORT[d.date.getUTCDay()];
    const unc = idx >= uncertainFrom;
    const divider = idx === uncertainFrom ? `<li class="unc-divider"><span>Ab hier unsicherer – Tendenz statt genauer Werte</span></li>` : '';
    return `${divider}<li><button class="day-row ${isToday ? 'today' : ''} ${unc ? 'uncertain' : ''}" data-day="${d.i}">
      <span class="d-name"><b>${name}${unc ? '<i class="unc-mark" title="geringere Vorhersagegüte">±</i>' : ''}</b><small>${d.date.getUTCDate()}.${d.date.getUTCMonth() + 1}.</small></span>
      <span class="d-icon">${weatherIcon(d.code, true, { size: 34 })}</span>
      <span class="d-rain ${d.pop >= 30 ? 'wet' : ''}">${dropIcon(10)}${d.pop ?? 0}%<small>${d.precip > 0 ? mm(d.precip) : '0 mm'}</small></span>
      <span class="d-wind">${windArrow(d.dir, 12)}${wind(d.wind, { unit: false })}<small>${windUnitShort()}</small></span>
      <span class="d-temps">
        <span class="d-min">${temp(d.min)}</span>
        <span class="d-range"><i style="left:${left}%;width:${w}%;background:linear-gradient(90deg,${tempColor(d.min)},${tempColor(d.max)})"></i></span>
        <span class="d-max">${temp(d.max)}</span>
      </span>
    </button></li>`;
  }).join('')}</ul>`;
}

/**
 * Interaktives Verlaufsdiagramm (Temperatur, gefühlt, Niederschlag) mit Zeitachse.
 * Rendert in container und reagiert auf Zeiger-/Touchbewegungen.
 */
export function mountTempChart(container, hours) {
  if (!hours.length) { container.innerHTML = '<p class="muted">Keine Daten.</p>'; return; }
  const id = uid('tc');
  const W = Math.max(320, container.clientWidth || 340);
  const H = 210, padL = 34, padR = 10, padT = 16, padB = 46;
  const n = hours.length;
  const xs = i => padL + (i / (n - 1)) * (W - padL - padR);
  const temps = hours.map(h => tempVal(h.temp));
  const feels = hours.map(h => tempVal(h.feels));
  const lo = Math.floor(Math.min(...temps, ...feels) - 1);
  const hi = Math.ceil(Math.max(...temps, ...feels) + 1);
  const ys = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const tPts = temps.map((v, i) => [xs(i), ys(v)]);
  const fPts = feels.map((v, i) => [xs(i), ys(v)]);
  const maxP = Math.max(3, ...hours.map(h => h.precip || 0));
  const barW = Math.max(2, (W - padL - padR) / n - 1.5);
  const baseY = H - padB;

  // Gitterlinien
  const step = (hi - lo) > 16 ? 5 : (hi - lo) > 8 ? 2 : 1;
  let grid = '';
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    grid += `<line x1="${padL}" x2="${W - padR}" y1="${ys(v)}" y2="${ys(v)}" class="grid"/><text x="${padL - 6}" y="${ys(v) + 3.5}" text-anchor="end" class="axis">${v}°</text>`;
  }
  // Zeitachse
  let axis = '';
  hours.forEach((h, i) => {
    const hr = h.time.getUTCHours();
    if (hr % 6 === 0) {
      axis += `<line x1="${xs(i)}" x2="${xs(i)}" y1="${padT}" y2="${baseY}" class="${hr === 0 ? 'grid-day' : 'grid'}"/>`;
      axis += `<text x="${xs(i)}" y="${baseY + 14}" text-anchor="middle" class="axis">${fmtHourShort(h.time)}</text>`;
      if (hr === 0 || i === 0) axis += `<text x="${xs(i) + 2}" y="${baseY + 30}" class="axis day">${WEEKDAYS_SHORT[h.time.getUTCDay()]} ${h.time.getUTCDate()}.</text>`;
    }
  });
  const bars = hours.map((h, i) => {
    if (!(h.precip > 0)) return '';
    const bh = Math.max(2, (h.precip / maxP) * 46);
    return `<rect x="${xs(i) - barW / 2}" y="${baseY - bh}" width="${barW}" height="${bh}" rx="1.5" class="bar"/>`;
  }).join('');

  container.innerHTML = `<div class="tchart" style="position:relative">
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" class="tchart-svg" role="img" aria-label="Temperaturverlauf">
      <defs><linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--chart-line)" stop-opacity=".3"/><stop offset="1" stop-color="var(--chart-line)" stop-opacity="0"/></linearGradient></defs>
      ${grid}${axis}${bars}
      <path d="${smoothPath(tPts)} L${tPts[n - 1][0]},${baseY} L${tPts[0][0]},${baseY}Z" fill="url(#${id}a)"/>
      <path d="${smoothPath(fPts)}" class="feels-line" pathLength="1"/>
      <path d="${smoothPath(tPts)}" class="chart-line" pathLength="1"/>
      <g class="cursor" style="display:none"><line y1="${padT}" y2="${baseY}" class="cursor-line"/><circle r="5" class="cursor-dot"/></g>
    </svg>
    <div class="tchart-tip" hidden></div>
    <div class="tchart-legend"><span class="lg-t">Temperatur</span><span class="lg-f">Gefühlt</span><span class="lg-p">Niederschlag</span></div>
  </div>`;

  const svg = container.querySelector('svg');
  const cursor = svg.querySelector('.cursor');
  const cl = cursor.querySelector('line'), cd = cursor.querySelector('circle');
  const tip = container.querySelector('.tchart-tip');
  const show = clientX => {
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((x - padL) / (W - padL - padR)) * (n - 1))));
    const h = hours[i];
    cursor.style.display = '';
    cl.setAttribute('x1', xs(i)); cl.setAttribute('x2', xs(i));
    cd.setAttribute('cx', xs(i)); cd.setAttribute('cy', ys(temps[i]));
    tip.hidden = false;
    tip.innerHTML = `<b>${WEEKDAYS_SHORT[h.time.getUTCDay()]} ${fmtTime(h.time)}</b>
      <span>${weatherIcon(h.code, h.isDay, { size: 22 })} ${temp(h.temp)} · gefühlt ${temp(h.feels)}</span>
      <span>${dropIcon(10)} ${h.pop ?? 0}% · ${mm(h.precip)}</span>
      <span>${windArrow(h.dir, 11)} ${wind(h.wind)} · Böen ${wind(h.gust)}</span>`;
    const px = (xs(i) / W) * r.width;
    tip.style.left = Math.max(0, Math.min(r.width - 196, px - 98)) + 'px';
  };
  const hide = () => { cursor.style.display = 'none'; tip.hidden = true; };
  svg.addEventListener('pointerdown', e => show(e.clientX));
  svg.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) show(e.clientX); });
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('touchmove', e => { show(e.touches[0].clientX); }, { passive: true });
  svg.addEventListener('touchend', () => setTimeout(hide, 2500));
}

/**
 * Temperaturkurve über mehrere Tage (Höchst-/Tiefstwerte), horizontal scrollbar auf schmalen Geräten.
 * Ab uncertainFrom wird der Bereich als unsicherer markiert.
 */
export function dayTrendChart(days, { todayIso, uncertainFrom = 7, minCol = 50 } = {}) {
  if (days.length < 2) return '';
  const id = uid('dt');
  const n = days.length;
  const col = minCol;
  const W = n * col, H = 210, top = 58, bottom = 40;
  const maxs = days.map(d => tempVal(d.max)), mins = days.map(d => tempVal(d.min));
  const hi = Math.max(...maxs), lo = Math.min(...mins);
  const span = Math.max(4, hi - lo);
  const y = v => top + 14 + (1 - (v - lo) / span) * (H - top - bottom - 28);
  const xs = i => i * col + col / 2;
  const pMax = maxs.map((v, i) => [xs(i), y(v)]);
  const pMin = mins.map((v, i) => [xs(i), y(v)]);
  const band = `${smoothPath(pMax)} L${pMin[n - 1][0]},${pMin[n - 1][1]} ${smoothPath([...pMin].reverse()).replace(/^M/, 'L')} Z`;
  const ux = uncertainFrom < n ? uncertainFrom * col : null;
  return `<div class="hour-scroll trend-scroll" data-noswipe>
    <div class="trend" style="width:max(100%, ${W}px)">
      <svg class="trend-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="${H}" aria-hidden="true">
        <defs>
          <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--chart-line)" stop-opacity=".35"/><stop offset="1" stop-color="var(--bar)" stop-opacity=".25"/></linearGradient>
          <pattern id="${id}u" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="8" fill="currentColor" opacity=".07"/></pattern>
        </defs>
        ${ux != null ? `<rect x="${ux}" y="0" width="${W - ux}" height="${H}" fill="url(#${id}u)" class="unc-zone"/><line x1="${ux}" x2="${ux}" y1="0" y2="${H}" class="unc-line"/>` : ''}
        <path d="${band}" fill="url(#${id}b)"/>
        <path d="${smoothPath(pMax)}" class="trend-max" pathLength="1"/>
        <path d="${smoothPath(pMin)}" class="trend-min" pathLength="1"/>
      </svg>
      <div class="trend-cols">${days.map((d, i) => `<button class="trend-col ${d.iso === todayIso ? 'today' : ''} ${i >= uncertainFrom ? 'uncertain' : ''}" data-day="${d.i}" style="width:${100 / n}%" aria-label="${WEEKDAYS_SHORT[d.date.getUTCDay()]} ${d.date.getUTCDate()}.: ${temp(d.max)} / ${temp(d.min)}">
          <span class="t-day">${d.iso === todayIso ? 'Heute' : WEEKDAYS_SHORT[d.date.getUTCDay()]}</span>
          ${weatherIcon(d.code, true, { size: 26 })}
          <span class="t-max" style="top:${((pMax[i][1] - 22) / H) * 100}%">${Math.round(maxs[i])}°</span>
          <span class="t-min" style="top:${((pMin[i][1] + 8) / H) * 100}%">${Math.round(mins[i])}°</span>
          <span class="t-pop ${d.pop >= 30 ? 'wet' : ''}">${d.pop ?? 0}%</span>
        </button>`).join('')}</div>
    </div>
  </div>
  <div class="tchart-legend"><span class="lg-t">Höchstwert</span><span class="lg-min">Tiefstwert</span>${ux != null ? '<span class="lg-unc">unsicherer Bereich</span>' : ''}</div>`;
}
