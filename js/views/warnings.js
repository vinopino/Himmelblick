// Warnungen
import { store } from '../store.js';
import { officialAlerts, modelHints, LEVELS, typeIcon } from '../warnlogic.js';
import { fmtAbs, fmtTime, WEEKDAYS_SHORT, fmtDeviceTime } from '../format.js';
import { showAlert } from './details.js';
import { esc } from '../util.js';

export function warningCount() {
  return officialAlerts(store.data.alerts).length;
}

export function renderWarnings(root) {
  const fc = store.data.forecast;
  const loc = store.location;
  const tz = fc?.timezone;
  const alertsResp = store.data.alerts;
  const official = officialAlerts(alertsResp);
  const hints = modelHints(fc);
  const inGermany = (loc?.cc || '').toUpperCase() === 'DE' || !!alertsResp?.location;
  const err = store.meta.alertsError;

  const officialBlock = () => {
    if (!alertsResp && err) {
      return `<div class="empty"><p>Die amtlichen Warnungen konnten nicht abgerufen werden (${esc(err)}).</p><button class="btn small" data-retry-alerts>Erneut versuchen</button></div>`;
    }
    if (!alertsResp) return '<p class="loading-text"><span class="spinner"></span> Warnungen werden geladen …</p>';
    if (!inGermany) return `<div class="empty"><p>Amtliche Warnungen werden für Orte in Deutschland vom Deutschen Wetterdienst angezeigt. Für diesen Ort liegt keine DWD-Warnzuständigkeit vor.</p></div>`;
    if (!official.length) {
      return `<div class="empty ok"><svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-2 15l-5-5 1.4-1.4 3.6 3.6 7.6-7.6L19 8z"/></svg>
        <p><b>Keine amtlichen Warnungen</b><br>für ${esc(alertsResp.location?.name || loc?.name || 'diesen Ort')}</p></div>`;
    }
    return `<ul class="alert-list">${official.map((a, i) => `<li><button class="alert-item ${LEVELS[a.level].cls}" data-official="${i}">
      <span class="alert-ico">${typeIcon(a.type, 24)}</span>
      <span class="alert-body"><b>${esc(a.event)}</b>
        <small>${LEVELS[a.level].name} · ${a.future ? 'ab ' : 'bis '}${a.future ? fmtAbs(a.onset, tz) : (a.expires ? fmtAbs(a.expires, tz) : 'auf Weiteres')}</small>
        <span class="alert-head">${esc(a.headline)}</span></span>
      <span class="wb-chev">›</span></button></li>`).join('')}</ul>`;
  };

  root.innerHTML = `
    <h1 class="view-title">Warnungen</h1>
    <section class="card">
      <header class="card-h"><h2>Amtliche Warnungen (DWD)</h2>${alertsResp?.location ? `<span class="muted">${esc(alertsResp.location.name_short || alertsResp.location.name)}</span>` : ''}</header>
      ${officialBlock()}
      <div class="legend-row">
        ${[1, 2, 3, 4].map(l => `<span class="lg ${LEVELS[l].cls}"><i></i>${LEVELS[l].short}</span>`).join('')}
      </div>
    </section>

    <section class="card">
      <header class="card-h"><h2>Hinweise aus der Prognose</h2><span class="muted">48 Std.</span></header>
      ${hints.length ? `<ul class="alert-list">${hints.map((a, i) => `<li><button class="alert-item soft ${LEVELS[a.level].cls}" data-hint="${i}">
        <span class="alert-ico">${typeIcon(a.type, 24)}</span>
        <span class="alert-body"><b>${esc(a.event)}</b>
          <small>${WEEKDAYS_SHORT[a.from.getUTCDay()]} ${fmtTime(a.from)} – ${WEEKDAYS_SHORT[a.to.getUTCDay()]} ${fmtTime(a.to)} · ${LEVELS[a.level].short}</small>
          <span class="alert-head">${esc(a.detail)}</span></span>
        <span class="wb-chev">›</span></button></li>`).join('')}</ul>`
      : '<div class="empty ok"><p>Keine kritischen Wetterereignisse in der Modellprognose der nächsten 48 Stunden.</p></div>'}
      <p class="source-note">Geprüft werden Starkregen, Gewitter, Sturm, Orkan, Schneefall, Glätte, Hitze, Frost und Nebel anhand der stündlichen Open-Meteo-Prognose. Diese Hinweise sind <b>keine amtlichen Warnungen</b>.</p>
    </section>
    ${alertsResp ? `<p class="source-foot">Amtliche Warnungen: Deutscher Wetterdienst, bereitgestellt über Bright Sky · Stand ${fmtDeviceTime(store.meta.alertsUpdated)}</p>` : ''}`;

  root.querySelectorAll('[data-official]').forEach(b => b.addEventListener('click', () => showAlert(official[+b.dataset.official], tz)));
  root.querySelectorAll('[data-hint]').forEach(b => b.addEventListener('click', () => showAlert(hints[+b.dataset.hint], tz)));
  root.querySelector('[data-retry-alerts]')?.addEventListener('click', () => store.emit('reload-alerts'));
}
