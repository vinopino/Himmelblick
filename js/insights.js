// Pollenflug, Luftqualität und Biowetter
import { currentHourIndex, todayIndex, dayAt } from './model.js';

/* ================= Pollen ================= */
export const POLLEN_TYPES = [
  { key: 'Hasel', label: 'Hasel', cams: null },
  { key: 'Erle', label: 'Erle', cams: 'alder_pollen', th: [1, 10, 100] },
  { key: 'Esche', label: 'Esche', cams: null, optional: true },
  { key: 'Birke', label: 'Birke', cams: 'birch_pollen', th: [1, 10, 100] },
  { key: 'Graeser', label: 'Gräser', cams: 'grass_pollen', th: [1, 10, 50] },
  { key: 'Roggen', label: 'Roggen', cams: null },
  { key: 'Beifuss', label: 'Beifuß', cams: 'mugwort_pollen', th: [1, 5, 20] },
  { key: 'Ambrosia', label: 'Ambrosia', cams: 'ragweed_pollen', th: [1, 5, 20] }
];

export const POLLEN_TEXT = {
  0: 'keine', 0.5: 'keine bis gering', 1: 'gering', 1.5: 'gering bis mittel', 2: 'mittel', 2.5: 'mittel bis hoch', 3: 'hoch'
};

// Ungefähre Mittelpunkte der DWD-Pollenregionen (partregion_id bzw. region_id)
const DWD_REGIONS = [
  [11, 54.3, 8.9, 'Schleswig-Holstein'], [12, 54.0, 10.0, 'Schleswig-Holstein Hamburg'],
  [20, 53.8, 12.5, 'Mecklenburg-Vorpommern'],
  [31, 52.8, 7.8, 'Niedersachsen Bremen'], [32, 52.5, 10.2, 'Niedersachsen'],
  [41, 51.5, 6.8, 'Nordrhein-Westfalen'], [42, 51.9, 8.7, 'Nordrhein-Westfalen'], [43, 51.0, 7.8, 'Nordrhein-Westfalen'],
  [50, 52.4, 13.3, 'Brandenburg Berlin'],
  [61, 52.0, 11.7, 'Sachsen-Anhalt'], [62, 51.7, 10.8, 'Sachsen-Anhalt'],
  [71, 51.1, 11.0, 'Thüringen'], [72, 50.6, 10.9, 'Thüringen'],
  [81, 51.3, 13.2, 'Sachsen'], [82, 50.6, 12.9, 'Sachsen'],
  [91, 51.0, 9.3, 'Hessen'], [92, 50.1, 8.7, 'Hessen'],
  [101, 49.8, 7.8, 'Rheinland-Pfalz'], [102, 50.3, 7.3, 'Rheinland-Pfalz'], [103, 49.4, 6.95, 'Saarland'],
  [111, 48.7, 8.1, 'Baden-Württemberg'], [112, 48.6, 9.6, 'Baden-Württemberg'], [113, 48.1, 8.3, 'Baden-Württemberg'],
  [121, 47.8, 11.5, 'Bayern'], [122, 48.6, 11.8, 'Bayern'], [123, 49.4, 11.7, 'Bayern'], [124, 49.8, 10.0, 'Bayern']
];

function nearestRegion(lat, lon, admin1 = '') {
  const norm = s => s.toLowerCase().replace('freistaat ', '').replace('land ', '');
  const a = norm(admin1);
  const dist = r => (r[1] - lat) ** 2 + ((r[2] - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
  let pool = a ? DWD_REGIONS.filter(r => norm(r[3]).split(' ').some(w => a.includes(w.toLowerCase()))) : [];
  if (!pool.length) pool = DWD_REGIONS;
  return pool.reduce((best, r) => (dist(r) < dist(best) ? r : best), pool[0])[0];
}

function dwdValue(s) {
  if (s == null || s === '-1' || s === '') return null;
  const parts = String(s).split('-').map(Number);
  if (parts.some(isNaN)) return null;
  return parts.length === 2 ? (parts[0] + parts[1]) / 2 : parts[0];
}

/** Pollen aus DWD-Daten für einen Ort in Deutschland */
export function pollenFromDwd(json, loc) {
  if (!json || !Array.isArray(json.content)) return null;
  const id = nearestRegion(loc.lat, loc.lon, loc.admin1);
  const entry = json.content.find(c => c.partregion_id === id) || json.content.find(c => c.region_id === id && c.partregion_id === -1);
  if (!entry) return null;
  const items = POLLEN_TYPES.map(t => {
    const p = entry.Pollen?.[t.key];
    return {
      label: t.label,
      today: dwdValue(p?.today),
      tomorrow: dwdValue(p?.tomorrow),
      dayafter: dwdValue(p?.dayafter_to),
      available: !!p
    };
  }).filter(i => i.available || !POLLEN_TYPES.find(t => t.label === i.label).optional);
  return {
    source: 'DWD Pollenflug-Gefahrenindex',
    region: [entry.region_name, entry.partregion_name].filter(Boolean).join(' – ').trim(),
    updated: json.last_update,
    days: ['Heute', 'Morgen', 'Übermorgen'],
    items
  };
}

function camsLevel(v, th) {
  if (v == null) return null;
  if (v < th[0]) return 0;
  if (v < th[1]) return 1;
  if (v < th[2]) return 2;
  return 3;
}

/** Pollen aus dem CAMS-Modell (Open-Meteo, nur Europa) */
export function pollenFromCams(air) {
  if (!air || !air.hourly) return null;
  const h = air.hourly;
  const days = [...new Set(h.time.map(t => t.slice(0, 10)))].slice(0, 3);
  const dayMax = (key, day) => {
    const vals = h.time.map((t, i) => (t.startsWith(day) ? h[key]?.[i] : null)).filter(v => v != null);
    return vals.length ? Math.max(...vals) : null;
  };
  let any = false;
  const items = POLLEN_TYPES.filter(t => !t.optional).map(t => {
    if (!t.cams || !h[t.cams]) return { label: t.label, available: false };
    const vals = days.map(d => dayMax(t.cams, d));
    if (vals.some(v => v != null)) any = true;
    return {
      label: t.label,
      available: vals.some(v => v != null),
      today: camsLevel(vals[0], t.th), tomorrow: camsLevel(vals[1], t.th), dayafter: camsLevel(vals[2], t.th),
      raw: vals
    };
  });
  if (!any) return null;
  return { source: 'CAMS-Modell (Copernicus) über Open-Meteo', region: 'Modellwert am Standort (Pollen/m³ → Stufe)', days: ['Heute', 'Morgen', 'Übermorgen'], items };
}

/* ================= Luftqualität ================= */
export function aqiLevel(v) {
  if (v == null) return { text: 'nicht verfügbar', cls: '' };
  if (v <= 20) return { text: 'Gut', cls: 'lvl-1' };
  if (v <= 40) return { text: 'Ausreichend', cls: 'lvl-2' };
  if (v <= 60) return { text: 'Mäßig', cls: 'lvl-3' };
  if (v <= 80) return { text: 'Schlecht', cls: 'lvl-4' };
  if (v <= 100) return { text: 'Sehr schlecht', cls: 'lvl-5' };
  return { text: 'Extrem schlecht', cls: 'lvl-6' };
}

// Grenzen der Teilindizes des Europäischen Luftqualitätsindex (µg/m³)
const BANDS = {
  pm2_5: [10, 20, 25, 50, 75],
  pm10: [20, 40, 50, 100, 150],
  ozone: [50, 100, 130, 240, 380],
  nitrogen_dioxide: [40, 90, 120, 230, 340]
};
export function pollutantLevel(key, v) {
  if (v == null) return { text: '–', cls: '' };
  const b = BANDS[key];
  const i = b.findIndex(x => v <= x);
  const idx = i < 0 ? 5 : i;
  return [
    { text: 'Gut', cls: 'lvl-1' }, { text: 'Ausreichend', cls: 'lvl-2' }, { text: 'Mäßig', cls: 'lvl-3' },
    { text: 'Schlecht', cls: 'lvl-4' }, { text: 'Sehr schlecht', cls: 'lvl-5' }, { text: 'Extrem schlecht', cls: 'lvl-6' }
  ][idx];
}

/* ================= Biowetter (eigene Berechnung) ================= */
const BIO_TEXT = ['gering', 'mäßig', 'hoch'];

export function biowetter(fc) {
  if (!fc) return null;
  const h = fc.hourly;
  const ci = currentHourIndex(fc);
  const ti = todayIndex(fc);
  const today = dayAt(fc, ti);
  const tomorrow = dayAt(fc, ti + 1);
  const p0 = h.pressure_msl[ci];
  const p24 = h.pressure_msl[Math.min(ci + 24, h.pressure_msl.length - 1)];
  const dP = p24 - p0;
  const dT = tomorrow ? tomorrow.max - today.max : 0;
  const dayHours = h.time.map((t, i) => (t.startsWith(today.iso) ? i : -1)).filter(i => i >= 0);
  const maxDew = Math.max(...dayHours.map(i => h.dew_point_2m[i] ?? -99));
  const reasons = [];

  // Wetterfühligkeit: schnelle Luftdruck- und Temperaturänderungen, Frontdurchgänge
  let sens = 0;
  if (Math.abs(dP) >= 10) { sens = 2; reasons.push(`Starke Luftdruckänderung (${dP > 0 ? '+' : ''}${Math.round(dP)} hPa in 24 Std.)`); }
  else if (Math.abs(dP) >= 5) { sens = 1; reasons.push(`Deutliche Luftdruckänderung (${dP > 0 ? '+' : ''}${Math.round(dP)} hPa in 24 Std.)`); }
  if (Math.abs(dT) >= 6) { sens = Math.min(2, sens + 1); reasons.push(`Temperatursprung zum Folgetag (${dT > 0 ? '+' : ''}${Math.round(dT)} °C)`); }
  if (dP <= -4 && (tomorrow?.precip ?? 0) >= 2) { sens = Math.min(2, sens + 1); reasons.push('Wetterumstellung mit Niederschlag (Frontdurchgang wahrscheinlich)'); }

  // Kreislaufbelastung: Wärme, Schwüle, Kälte, rasche Erwärmung
  let circ = 0;
  if (today.feelsMax >= 30) { circ = 2; reasons.push(`Hohe Wärmebelastung (gefühlt bis ${Math.round(today.feelsMax)} °C)`); }
  else if (today.feelsMax >= 26) { circ = 1; reasons.push(`Wärmebelastung (gefühlt bis ${Math.round(today.feelsMax)} °C)`); }
  if (maxDew >= 20) { circ = 2; reasons.push('Sehr schwüle Luft (Taupunkt ≥ 20 °C)'); }
  else if (maxDew >= 16) { circ = Math.max(circ, 1); reasons.push('Schwüle Luft (Taupunkt ≥ 16 °C)'); }
  if (today.feelsMin <= -10) { circ = Math.max(circ, 1); reasons.push(`Kältereiz (gefühlt bis ${Math.round(today.feelsMin)} °C)`); }
  if (dT >= 6) circ = Math.max(circ, 1);
  if (dP <= -6) { circ = Math.max(circ, 1); }

  const general = Math.max(sens, circ, sens + circ >= 3 ? 2 : 0);
  return {
    general: { level: general, text: BIO_TEXT[general] },
    sensitivity: { level: sens, text: BIO_TEXT[sens] },
    circulation: { level: circ, text: BIO_TEXT[circ] },
    reasons: reasons.length ? reasons : ['Keine nennenswerten biometeorologischen Reize erkennbar']
  };
}
