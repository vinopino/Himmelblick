// Warnungen: amtliche DWD-Warnungen (Bright Sky) + Hinweise aus der Modellprognose
import { currentHourIndex, hourAt } from './model.js';

export const LEVELS = {
  1: { name: 'Wetterwarnung', short: 'Stufe 1', cls: 'w1' },
  2: { name: 'Markante Wetterwarnung', short: 'Stufe 2', cls: 'w2' },
  3: { name: 'Unwetterwarnung', short: 'Stufe 3', cls: 'w3' },
  4: { name: 'Warnung vor extremem Unwetter', short: 'Stufe 4', cls: 'w4' }
};

const SEVERITY = { minor: 1, moderate: 2, severe: 3, extreme: 4 };

export const TYPE_ICONS = {
  thunder: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  rain: '<path d="M7 3l-2 5h3l-2 5M13 3l-2 5h3l-2 5M19 3l-2 5h3l-2 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  snow: '<path d="M12 2v20M4.9 6l14.2 12M19.1 6L4.9 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  ice: '<path d="M3 20h18M6 16l3-8 3 8M13 16l3-10 3 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  heat: '<path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="17" r="2"/>',
  frost: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  fog: '<path d="M3 8h18M5 12h14M3 16h18M7 20h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  uv: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  other: '<path d="M12 2L1 21h22zm1 15h-2v-2h2zm0-4h-2V9h2z"/>'
};

export function typeIcon(type, size = 22) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${TYPE_ICONS[type] || TYPE_ICONS.other}</svg>`;
}

export function classifyEvent(text = '') {
  const t = text.toUpperCase();
  if (t.includes('GEWITTER')) return 'thunder';
  if (t.includes('GLATTEIS') || t.includes('GLÄTTE') || t.includes('GLAETTE') || t.includes('REIF')) return 'ice';
  if (t.includes('ORKAN') || t.includes('STURM') || t.includes('WIND') || t.includes('BÖEN') || t.includes('BOEEN')) return 'wind';
  if (t.includes('SCHNEE')) return 'snow';
  if (t.includes('REGEN') || t.includes('TAUWETTER')) return 'rain';
  if (t.includes('HITZE') || t.includes('WÄRME')) return 'heat';
  if (t.includes('FROST')) return 'frost';
  if (t.includes('NEBEL')) return 'fog';
  if (t.includes('UV')) return 'uv';
  return 'other';
}

/** Normalisiert die Bright-Sky-Antwort */
export function officialAlerts(resp) {
  if (!resp || !Array.isArray(resp.alerts)) return [];
  const now = Date.now();
  return resp.alerts
    .filter(a => a.status !== 'test' && (!a.expires || Date.parse(a.expires) > now))
    .map(a => ({
      source: 'dwd',
      id: a.alert_id || a.id,
      level: SEVERITY[a.severity] || 1,
      type: classifyEvent(a.event_de || a.event_en || a.headline_de),
      event: titleCase(a.event_de || a.event_en || 'Warnung'),
      headline: a.headline_de || a.headline_en || '',
      description: a.description_de || a.description_en || '',
      instruction: a.instruction_de || a.instruction_en || '',
      onset: a.onset || a.effective,
      expires: a.expires,
      effective: a.effective,
      future: a.onset && Date.parse(a.onset) > now
    }))
    .sort((a, b) => b.level - a.level || Date.parse(a.onset) - Date.parse(b.onset));
}

function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s-])([a-zäöü])/g, (m, p, c) => p + c.toUpperCase());
}

/** Hinweise aus der Modellprognose für die nächsten 48 Stunden */
export function modelHints(fc) {
  if (!fc) return [];
  const start = currentHourIndex(fc);
  const hours = [];
  for (let i = start; i < Math.min(start + 48, fc.hourly.time.length); i++) hours.push(hourAt(fc, i));
  const found = {};
  const add = (type, level, title, h, detail) => {
    if (!level) return;
    const f = found[type];
    if (!f) found[type] = { source: 'model', type, level, event: title, from: h.time, to: h.time, detail };
    else {
      if (level > f.level) { f.level = level; f.event = title; f.detail = detail; }
      if (h.time < f.from) f.from = h.time;
      if (h.time > f.to) f.to = h.time;
    }
  };
  const sumWin = (arr, i, n, key) => arr.slice(i, i + n).reduce((s, h) => s + (h[key] || 0), 0);

  hours.forEach((h, idx) => {
    // Gewitter
    if ([96, 99].includes(h.code)) add('thunder', 3, 'Gewitter mit Hagel', h, 'Das Modell erwartet Gewitter mit möglichem Hagel.');
    else if (h.code === 95) add('thunder', h.gust >= 90 ? 3 : 2, 'Gewitter', h, 'Gewitter mit Blitz, Starkregen und Sturmböen möglich.');

    // Starkregen
    const r6 = sumWin(hours, idx, 6, 'precip');
    if (h.precip >= 25) add('rain', 3, 'Heftiger Starkregen', h, `Bis zu ${Math.round(h.precip)} mm pro Stunde erwartet.`);
    else if (h.precip >= 15) add('rain', 2, 'Starkregen', h, `Bis zu ${Math.round(h.precip)} mm pro Stunde erwartet.`);
    else if (r6 >= 35) add('rain', 3, 'Ergiebiger Dauerregen', h, `Rund ${Math.round(r6)} mm in 6 Stunden erwartet.`);
    else if (r6 >= 20) add('rain', 2, 'Dauerregen', h, `Rund ${Math.round(r6)} mm in 6 Stunden erwartet.`);

    // Wind / Sturm / Orkan
    const g = h.gust || 0;
    if (g >= 120) add('wind', 4, 'Orkanböen', h, `Böen bis ${Math.round(g)} km/h.`);
    else if (g >= 105) add('wind', 3, 'Orkanartige Böen', h, `Böen bis ${Math.round(g)} km/h.`);
    else if (g >= 90) add('wind', 3, 'Schwere Sturmböen', h, `Böen bis ${Math.round(g)} km/h.`);
    else if (g >= 65) add('wind', 2, 'Sturmböen', h, `Böen bis ${Math.round(g)} km/h.`);
    else if (g >= 50) add('wind', 1, 'Windböen', h, `Böen bis ${Math.round(g)} km/h.`);

    // Schnee (Summe über 12 h, cm)
    const s12 = sumWin(hours, idx, 12, 'snow');
    if (s12 >= 10) add('snow', 3, 'Starker Schneefall', h, `Rund ${Math.round(s12)} cm Neuschnee in 12 Stunden.`);
    else if (s12 >= 5) add('snow', 2, 'Schneefall', h, `Rund ${Math.round(s12)} cm Neuschnee in 12 Stunden.`);
    else if (h.snow >= 0.2) add('snow', 1, 'Leichter Schneefall', h, 'Leichter Schneefall erwartet.');

    // Glätte
    if ([56, 57, 66, 67].includes(h.code)) add('ice', 3, 'Glatteis', h, 'Gefrierender Regen oder Sprühregen erwartet.');
    else if ((h.precip >= 0.1 || h.snow > 0) && h.temp <= 1) add('ice', 1, 'Glätte', h, 'Niederschlag bei Temperaturen um den Gefrierpunkt.');
    else if (h.code === 48) add('ice', 1, 'Reifglätte', h, 'Gefrierender Nebel kann zu Reifglätte führen.');

    // Hitze (gefühlte Temperatur)
    if (h.feels >= 38) add('heat', 2, 'Extreme Hitze', h, `Gefühlte Temperatur bis ${Math.round(h.feels)} °C.`);
    else if (h.feels >= 32) add('heat', 1, 'Starke Wärmebelastung', h, `Gefühlte Temperatur bis ${Math.round(h.feels)} °C.`);

    // Frost
    if (h.temp <= -10) add('frost', 2, 'Strenger Frost', h, `Tiefstwerte um ${Math.round(h.temp)} °C.`);
    else if (h.temp < 0) add('frost', 1, 'Frost', h, 'Temperaturen unter dem Gefrierpunkt.');

    // Nebel
    if ([45, 48].includes(h.code) || (h.vis != null && h.vis < 150)) add('fog', 1, 'Nebel', h, 'Sichtweiten teils unter 150 m.');
  });

  return Object.values(found).sort((a, b) => b.level - a.level || a.from - b.from);
}
