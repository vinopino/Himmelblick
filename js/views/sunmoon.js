// Sonne und Mond
import { localNow } from '../model.js';
import { fmtTime, fmtDuration, fmtDate, num } from '../format.js';
import { moonIllumination, moonTimes, moonPhaseName, nextPhase } from '../astro.js';
import { moonPhaseIcon } from '../icons.js';

export function sunArc(fc, today, nowL = localNow(fc)) {
  if (!today) return '<p class="muted">Keine Sonnendaten.</p>';
  const rise = today.sunrise.getTime(), set = today.sunset.getTime(), now = nowL.getTime();
  const f = Math.max(0, Math.min(1, (now - rise) / (set - rise)));
  const up = now >= rise && now <= set;
  const W = 200, H = 96, r = 80, cx = 100, cy = 90;
  const a = Math.PI * (1 - f);
  const sx = cx + r * Math.cos(a), sy = cy - r * Math.sin(a);
  const dur = ms => { const m = Math.round(ms / 60000); return m < 60 ? `${m} Min.` : `${Math.floor(m / 60)} Std. ${m % 60} Min.`; };
  const left = now < rise ? `Aufgang in ${dur(rise - now)}`
    : now > set ? 'Sonne ist untergegangen'
      : `Untergang in ${dur(set - now)}`;
  return `<header class="card-h"><h2>Sonne</h2></header>
    <svg viewBox="0 0 ${W} ${H + 6}" class="sun-arc" aria-hidden="true">
      <path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}" class="arc-bg"/>
      <path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${sx.toFixed(1)},${sy.toFixed(1)}" class="arc-fg"/>
      <line x1="6" x2="${W - 6}" y1="${cy}" y2="${cy}" class="arc-horizon"/>
      ${up ? `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="8" class="arc-sun"/>` : ''}
    </svg>
    <div class="sun-times"><span>↑ ${fmtTime(today.sunrise)}</span><span>${fmtDuration(today.daylight)}</span><span>↓ ${fmtTime(today.sunset)}</span></div>
    <p class="tile-sub center">${left}</p>`;
}

export function moonData(fc, lat, lon) {
  const nowL = localNow(fc);
  const offset = fc.utc_offset_seconds || 0;
  const midnight = new Date(Date.UTC(nowL.getUTCFullYear(), nowL.getUTCMonth(), nowL.getUTCDate()) - offset * 1000);
  const ill = moonIllumination(new Date());
  const times = moonTimes(midnight, lat, lon);
  const toLocal = d => (d ? new Date(d.getTime() + offset * 1000) : null);
  return {
    phase: ill.phase,
    fraction: ill.fraction,
    name: moonPhaseName(ill.phase),
    rise: toLocal(times.rise),
    set: toLocal(times.set),
    alwaysUp: times.alwaysUp,
    alwaysDown: times.alwaysDown,
    nextFull: toLocal(nextPhase(0.5)),
    nextNew: toLocal(nextPhase(0)),
    distance: ill.distance
  };
}

export function moonCard(fc) {
  const m = moonData(fc, fc.latitude, fc.longitude);
  return `<header class="card-h"><h2>Mond</h2></header>
    <div class="moon-row">${moonPhaseIcon(m.phase, 70)}
      <div><b>${m.name}</b><small>${Math.round(m.fraction * 100)} % beleuchtet</small></div>
    </div>
    <div class="sun-times"><span>↑ ${m.rise ? fmtTime(m.rise) : (m.alwaysUp ? 'ganztägig' : '–')}</span><span>↓ ${m.set ? fmtTime(m.set) : (m.alwaysDown ? 'nicht sichtbar' : '–')}</span></div>`;
}

export function moonDetail(fc) {
  const m = moonData(fc, fc.latitude, fc.longitude);
  return `<div class="moon-row big">${moonPhaseIcon(m.phase, 96)}
      <div><b>${m.name}</b><small>${Math.round(m.fraction * 100)} % beleuchtet · Mondalter ${num(m.phase * 29.53, 1)} Tage</small></div>
    </div>
    <div class="kv-grid compact">
      <div class="kv"><span>Mondaufgang</span><b>${m.rise ? fmtTime(m.rise) : (m.alwaysUp ? 'ganztägig sichtbar' : 'kein Aufgang heute')}</b></div>
      <div class="kv"><span>Monduntergang</span><b>${m.set ? fmtTime(m.set) : (m.alwaysDown ? 'nicht sichtbar' : 'kein Untergang heute')}</b></div>
      <div class="kv"><span>Nächster Vollmond</span><b>${m.nextFull ? fmtDate(m.nextFull, { weekday: false }) : '–'}</b></div>
      <div class="kv"><span>Nächster Neumond</span><b>${m.nextNew ? fmtDate(m.nextNew, { weekday: false }) : '–'}</b></div>
      <div class="kv"><span>Entfernung</span><b>${num(m.distance)} km</b></div>
    </div>
    <p class="source-note">Berechnet nach astronomischen Formeln (SunCalc-Algorithmus) für den gewählten Ort.</p>`;
}
