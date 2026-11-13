// Detailansichten (Bottom-Sheets) für Stunden, Tage und Warnungen
import { openSheet } from '../ui.js';
import { hourAt, dayAt, hoursOfDay, todayIndex as todayIdx } from '../model.js';
import { weatherIcon, weatherText, windArrow } from '../icons.js';
import {
  temp, wind, mm, fmtTime, fmtDate, fmtHour, windDir, windDirLong, uvLevel, visibility, fmtDuration,
  num, beaufort, BEAUFORT_TEXT, fmtAbs
} from '../format.js';
import { hourStrip } from '../charts.js';
import { LEVELS, typeIcon } from '../warnlogic.js';
import { esc } from '../util.js';
import { store } from '../store.js';

const row = (label, value, extra = '') => `<div class="kv"><span>${label}</span><b>${value}</b>${extra ? `<small>${extra}</small>` : ''}</div>`;

export function showHour(fc, i) {
  const h = hourAt(fc, i);
  if (!h) return;
  const uv = uvLevel(h.uv);
  const bf = beaufort(h.wind || 0);
  openSheet(`
    <div class="sheet-head">
      <div class="sheet-hero">${weatherIcon(h.code, h.isDay, { size: 84, animated: true })}
        <div><h2>${temp(h.temp)}</h2><p>${weatherText(h.code)}</p></div>
      </div>
      <p class="sheet-sub">${fmtDate(h.time)} · ${fmtHour(h.time)}</p>
    </div>
    <div class="kv-grid">
      ${row('Gefühlt', temp(h.feels))}
      ${row('Taupunkt', temp(h.dew))}
      ${row('Regenwahrscheinlichkeit', `${h.pop ?? 0} %`)}
      ${row('Niederschlag', mm(h.precip))}
      ${h.snow > 0 ? row('Neuschnee', `${num(h.snow, 1)} cm`) : ''}
      ${row('Wind', `${windArrow(h.dir, 14)} ${wind(h.wind)}`, `${windDirLong(h.dir)} (${windDir(h.dir)}) · ${bf} Bft – ${BEAUFORT_TEXT[bf]}`)}
      ${row('Böen', wind(h.gust))}
      ${row('Luftfeuchtigkeit', `${h.humidity ?? '–'} %`)}
      ${row('Luftdruck', `${num(h.pressure)} hPa`)}
      ${row('Bewölkung', `${h.cloud ?? '–'} %`)}
      ${row('Sichtweite', visibility(h.vis))}
      ${row('UV-Index', `${num(h.uv, 1)}`, uv.text)}
    </div>`, { cls: 'sheet-detail' });
}

export function showDay(fc, i, { onHour } = {}) {
  const d = dayAt(fc, i);
  if (!d) return;
  const hours = hoursOfDay(fc, d.iso);
  const uv = uvLevel(d.uv);
  openSheet(`
    <div class="sheet-head">
      <div class="sheet-hero">${weatherIcon(d.code, true, { size: 84, animated: true })}
        <div><h2>${temp(d.max)} <span class="muted">/ ${temp(d.min)}</span></h2><p>${weatherText(d.code)}</p></div>
      </div>
      <p class="sheet-sub">${fmtDate(d.date)}</p>
      ${i - todayIdx(fc) >= 7 ? '<p class="unc-note">± Längerfristige Prognose – die Werte zeigen die Tendenz und können sich noch deutlich ändern.</p>' : ''}
    </div>
    ${hours.length ? `<h3 class="sheet-h3">Stundenverlauf</h3>${hourStrip(hours, {})}` : ''}
    <div class="kv-grid">
      ${row('Höchstwert', temp(d.max), `gefühlt ${temp(d.feelsMax)}`)}
      ${row('Tiefstwert', temp(d.min), `gefühlt ${temp(d.feelsMin)}`)}
      ${row('Regenwahrscheinlichkeit', `${d.pop ?? 0} %`)}
      ${row('Niederschlag', mm(d.precip), d.precipHours ? `${num(d.precipHours)} Std. mit Niederschlag` : '')}
      ${d.snow > 0 ? row('Neuschnee', `${num(d.snow, 1)} cm`) : ''}
      ${row('Wind max.', `${windArrow(d.dir, 14)} ${wind(d.wind)}`, `aus ${windDirLong(d.dir)}`)}
      ${row('Böen max.', wind(d.gust))}
      ${row('UV-Index max.', num(d.uv, 1), uv.text)}
      ${row('Sonnenaufgang', fmtTime(d.sunrise))}
      ${row('Sonnenuntergang', fmtTime(d.sunset))}
      ${row('Tageslänge', fmtDuration(d.daylight))}
      ${row('Sonnenscheindauer', fmtDuration(d.sunshine))}
    </div>`, {
    cls: 'sheet-detail',
    onMount: body => {
      body.querySelectorAll('[data-hour]').forEach(b => b.addEventListener('click', () => {
        const idx = +b.dataset.hour;
        onHour ? onHour(idx) : showHour(fc, idx);
      }));
    }
  });
}

export function showAlert(a, tz, area = '') {
  const lvl = LEVELS[a.level] || LEVELS[1];
  const official = a.source === 'dwd';
  const timeText = official
    ? `${fmtAbs(a.onset, tz)} bis ${a.expires ? fmtAbs(a.expires, tz) : 'auf Weiteres'}`
    : `${fmtDate(a.from)} ${fmtTime(a.from)} – ${fmtDate(a.to)} ${fmtTime(a.to)} (Ortszeit)`;
  openSheet(`
    <div class="alert-detail ${lvl.cls}">
      <div class="alert-detail-head">
        <span class="alert-ico">${typeIcon(a.type, 30)}</span>
        <div><h2>${esc(a.event)}${official ? '' : ' möglich'}</h2><p>${official ? lvl.name + ' · ' + lvl.short : 'Modellhinweis · Einstufung ähnlich ' + lvl.short}</p></div>
      </div>
    </div>
    <dl class="wc-facts sheet-facts">
      <div><dt>Gültig</dt><dd>${timeText}</dd></div>
      ${area ? `<div><dt>Gebiet</dt><dd>${esc(area)}</dd></div>` : ''}
      <div><dt>Quelle</dt><dd>${official ? 'Deutscher Wetterdienst – amtliche Warnung' : 'Eigene Auswertung der Modellprognose – nicht amtlich'}</dd></div>
    </dl>
    ${a.headline ? `<p><b>${esc(a.headline)}</b></p>` : ''}
    <p class="prose">${esc(a.description || a.detail || '')}</p>
    ${a.instruction ? `<h3 class="sheet-h3">Handlungsempfehlung</h3><p class="prose">${esc(a.instruction)}</p>` : ''}
    <p class="source-note">${official
      ? 'Quelle: Deutscher Wetterdienst (amtliche Warnung), bereitgestellt über Bright Sky.'
      : 'Automatisch aus der Open-Meteo-Prognose abgeleitet. Kein amtlicher Warnstatus – maßgeblich sind die Warnungen des Deutschen Wetterdienstes bzw. des nationalen Wetterdienstes.'}</p>`, { cls: 'sheet-detail' });
}

export { store };
