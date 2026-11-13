// Warnungen – v2: ausführliche Warnkarten (Art, Zeitraum, Gebiet, Beschreibung, Empfehlung),
// strikte Trennung zwischen amtlichen DWD-Warnungen und eigenen Modellhinweisen.
import { store } from '../store.js';
import { officialAlerts, modelHints, LEVELS, typeIcon } from '../warnlogic.js';
import { fmtAbs, fmtTime, WEEKDAYS_SHORT, fmtDeviceTime } from '../format.js';
import { showAlert } from './details.js';
import { esc } from '../util.js';

export function warningCount() {
  return officialAlerts(store.data.alerts).length;
}

function areaText(resp, loc) {
  const l = resp?.location;
  if (!l) return loc?.name || '';
  const parts = [l.name];
  if (l.district && l.district !== l.name) parts.push(l.district);
  if (l.state && l.state !== l.name) parts.push(l.state);
  return parts.join(' · ');
}

function statusText(a) {
  const now = Date.now();
  if (a.onset && Date.parse(a.onset) > now) return 'Vorabwarnung – noch nicht aktiv';
  return 'Aktiv';
}

export function renderWarnings(root) {
  const fc = store.data.forecast;
  const loc = store.location;
  const tz = fc?.timezone;
  const resp = store.data.alerts;
  const official = officialAlerts(resp);
  const hints = modelHints(fc);
  const inGermany = (loc?.cc || '').toUpperCase() === 'DE' || !!resp?.location;
  const err = store.meta.alertsError;
  const area = areaText(resp, loc);
  const top = official[0];

  const officialBlock = () => {
    if (!resp && err) {
      return `<div class="empty"><p>Die amtlichen Warnungen konnten nicht abgerufen werden (${esc(err)}).</p><button class="btn small" data-retry-alerts>Erneut versuchen</button></div>`;
    }
    if (!resp) return '<p class="loading-text"><span class="spinner"></span> Warnungen werden geladen …</p>';
    if (!inGermany) return '<div class="empty"><p>Amtliche Warnungen des Deutschen Wetterdienstes gibt es nur für Orte in Deutschland. Für diesen Ort liegt keine DWD-Zuständigkeit vor.</p></div>';
    if (!official.length) {
      return `<div class="empty ok"><svg viewBox="0 0 24 24" width="44" height="44" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-2 15l-5-5 1.4-1.4 3.6 3.6 7.6-7.6L19 8z"/></svg>
        <p><b>Keine amtlichen Warnungen</b><br>für ${esc(area || 'diesen Ort')}</p></div>`;
    }
    return `<div class="warn-cards">${official.map((a, i) => `
      <article class="warn-card ${LEVELS[a.level].cls}">
        <header class="wc-head">
          <span class="alert-ico">${typeIcon(a.type, 26)}</span>
          <div class="wc-title"><b>${esc(a.event)}</b><span class="wc-level">${LEVELS[a.level].short} · ${LEVELS[a.level].name}</span></div>
          <span class="badge-official">amtlich</span>
        </header>
        <dl class="wc-facts">
          <div><dt>Gültig</dt><dd>${fmtAbs(a.onset, tz)} – ${a.expires ? fmtAbs(a.expires, tz) : 'bis auf Weiteres'}</dd></div>
          <div><dt>Gebiet</dt><dd>${esc(area || '–')}</dd></div>
          <div><dt>Status</dt><dd>${statusText(a)}</dd></div>
        </dl>
        ${a.description ? `<p class="wc-desc">${esc(a.description)}</p>` : ''}
        ${a.instruction ? `<details class="wc-instr"><summary>Handlungsempfehlung</summary><p>${esc(a.instruction)}</p></details>` : ''}
        <button class="link small" data-official="${i}">Vollständige Meldung ›</button>
      </article>`).join('')}</div>`;
  };

  root.innerHTML = `
    <h1 class="view-title">Warnungen</h1>

    ${top ? `<div class="warn-summary ${LEVELS[top.level].cls}">
      <span class="ws-level"><small>Stufe</small>${top.level}</span>
      <div><b>${official.length} amtliche ${official.length === 1 ? 'Warnung' : 'Warnungen'}</b><small>Höchste Stufe: ${LEVELS[top.level].name}</small></div>
    </div>` : ''}

    <section class="card warn-section">
      <header class="card-h"><h2>Amtliche Warnungen</h2><span class="src-chip official">DWD</span></header>
      ${officialBlock()}
      <div class="legend-row">
        ${[1, 2, 3, 4].map(l => `<span class="lg ${LEVELS[l].cls}"><i></i>${LEVELS[l].short}</span>`).join('')}
      </div>
    </section>

    <section class="card warn-section model">
      <header class="card-h"><h2>Hinweise aus der Prognose</h2><span class="src-chip model">Modell · nicht amtlich</span></header>
      ${hints.length ? `<ul class="alert-list">${hints.map((a, i) => `<li><button class="alert-item soft ${LEVELS[a.level].cls}" data-hint="${i}">
        <span class="alert-ico">${typeIcon(a.type, 24)}</span>
        <span class="alert-body"><b>${esc(a.event)} möglich</b>
          <small>${WEEKDAYS_SHORT[a.from.getUTCDay()]} ${fmtTime(a.from)} – ${WEEKDAYS_SHORT[a.to.getUTCDay()]} ${fmtTime(a.to)} · Einstufung ähnlich ${LEVELS[a.level].short}</small>
          <span class="alert-head">${esc(a.detail)}</span></span>
        <span class="wb-chev">›</span></button></li>`).join('')}</ul>`
      : '<div class="empty ok"><p>Keine kritischen Wetterereignisse in der Modellprognose der nächsten 48 Stunden.</p></div>'}
      <p class="source-note">Automatisch aus der stündlichen Open-Meteo-Prognose abgeleitet (Starkregen, Gewitter, Sturm, Orkan, Schnee, Glätte, Hitze, Frost, Nebel). Diese Hinweise sind <b>keine amtlichen Warnungen</b> und ersetzen sie nicht.</p>
    </section>
    ${resp ? `<p class="source-foot">Amtliche Warnungen: Deutscher Wetterdienst, bereitgestellt über Bright Sky · Stand ${fmtDeviceTime(store.meta.alertsUpdated)}</p>` : ''}`;

  root.querySelectorAll('[data-official]').forEach(b => b.addEventListener('click', () => showAlert(official[+b.dataset.official], tz, area)));
  root.querySelectorAll('[data-hint]').forEach(b => b.addEventListener('click', () => showAlert(hints[+b.dataset.hint], tz)));
  root.querySelector('[data-retry-alerts]')?.addEventListener('click', () => store.emit('reload-alerts'));
}
