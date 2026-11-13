// Einheiten- und Zeitformatierung
import { store } from './store.js';

export const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/*
 * Zeitmodell: Open-Meteo liefert Ortszeiten ohne Offset ("2026-11-13T07:00").
 * Wir interpretieren diese als "Wanduhr-Zeit" in einem Date-Objekt mit UTC-Feldern.
 * Die aktuelle Ortszeit erhalten wir über utc_offset_seconds.
 */
export function parseLocal(str) {
  if (!str) return null;
  if (str.length === 10) return new Date(str + 'T00:00:00Z');
  return new Date(str.length === 16 ? str + ':00Z' : str + 'Z');
}

export function locNow(offsetSec = 0) {
  return new Date(Date.now() + offsetSec * 1000);
}

export function pad(n) { return String(n).padStart(2, '0'); }

export function fmtTime(d, { seconds = false } = {}) {
  if (!d) return '–';
  let h = d.getUTCHours();
  const m = pad(d.getUTCMinutes());
  const s = seconds ? ':' + pad(d.getUTCSeconds()) : '';
  if (store.settings.timeFormat === '12') {
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m}${s} ${ampm}`;
  }
  return `${pad(h)}:${m}${s}`;
}

export function fmtHour(d) {
  if (!d) return '–';
  const h = d.getUTCHours();
  if (store.settings.timeFormat === '12') return `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;
  return `${pad(h)} Uhr`;
}

export function fmtHourShort(d) {
  const h = d.getUTCHours();
  if (store.settings.timeFormat === '12') return `${h % 12 || 12}${h >= 12 ? 'p' : 'a'}`;
  return `${pad(h)}:00`;
}

export function fmtDate(d, { weekday = true, year = false } = {}) {
  if (!d) return '–';
  const wd = weekday ? WEEKDAYS[d.getUTCDay()] + ', ' : '';
  return `${wd}${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}${year ? ' ' + d.getUTCFullYear() : ''}`;
}

export function fmtDateShort(d) {
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.`;
}

/** Formatiert echte (absolute) Zeitpunkte, z. B. aus Warnungen, in der Zeitzone des Orts */
export function fmtAbs(iso, tz, { date = true } = {}) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (isNaN(d)) return '–';
  const opts = { hour: '2-digit', minute: '2-digit', hour12: store.settings.timeFormat === '12' };
  if (date) Object.assign(opts, { weekday: 'short', day: 'numeric', month: 'short' });
  try { return new Intl.DateTimeFormat('de-DE', { ...opts, timeZone: tz || undefined }).format(d); }
  catch { return new Intl.DateTimeFormat('de-DE', opts).format(d); }
}

/** Uhrzeit des Geräts (für "Aktualisiert um …") */
export function fmtDeviceTime(ts) {
  if (!ts) return '–';
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', hour12: store.settings.timeFormat === '12' }).format(new Date(ts));
}

export function relTime(ts) {
  const diff = Math.round((Date.now() - ts) / 60000);
  if (diff < 1) return 'gerade eben';
  if (diff < 60) return `vor ${diff} Min.`;
  const h = Math.round(diff / 60);
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.round(h / 24)} Tagen`;
}

export function fmtDuration(sec) {
  if (sec == null || isNaN(sec)) return '–';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h} Std. ${pad(m)} Min.`;
}

/* ---------- Einheiten ---------- */
export function tempVal(c) {
  if (c == null || isNaN(c)) return null;
  return store.settings.tempUnit === 'F' ? c * 9 / 5 + 32 : c;
}
export function temp(c, { unit = false } = {}) {
  const v = tempVal(c);
  if (v == null) return '–';
  const r = Math.round(v);
  return `${r === 0 ? 0 : String(r).replace('-', '−')}°${unit ? store.settings.tempUnit : ''}`;
}
export function tempUnitLabel() { return '°' + store.settings.tempUnit; }

export function windVal(kmh) {
  if (kmh == null || isNaN(kmh)) return null;
  return store.settings.windUnit === 'ms' ? kmh / 3.6 : kmh;
}
export function wind(kmh, { unit = true } = {}) {
  const v = windVal(kmh);
  if (v == null) return '–';
  const s = store.settings.windUnit === 'ms' ? (Math.round(v * 10) / 10).toLocaleString('de-DE') : Math.round(v);
  return unit ? `${s} ${windUnitLabel()}` : String(s);
}
export function windUnitLabel() { return store.settings.windUnit === 'ms' ? 'm/s' : 'km/h'; }

export function mm(v, digits = 1) {
  if (v == null || isNaN(v)) return '–';
  if (v > 0 && v < 0.1) return '<0,1 mm';
  return `${v.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: 0 })} mm`;
}

export function num(v, digits = 0) {
  if (v == null || isNaN(v)) return '–';
  return v.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

const DIRS = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const DIRS_LONG = { N: 'Nord', NO: 'Nordost', O: 'Ost', SO: 'Südost', S: 'Süd', SW: 'Südwest', W: 'West', NW: 'Nordwest' };
export function windDir(deg) {
  if (deg == null || isNaN(deg)) return '–';
  return DIRS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}
export function windDirLong(deg) {
  if (deg == null || isNaN(deg)) return '–';
  const k = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round(((deg % 360) + 360) % 360 / 45) % 8];
  return DIRS_LONG[k];
}

export function beaufort(kmh) {
  const limits = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  let b = 0;
  while (b < limits.length && kmh >= limits[b]) b++;
  return b;
}
export const BEAUFORT_TEXT = ['Windstille', 'Leiser Zug', 'Leichte Brise', 'Schwache Brise', 'Mäßige Brise', 'Frische Brise', 'Starker Wind', 'Steifer Wind', 'Stürmischer Wind', 'Sturm', 'Schwerer Sturm', 'Orkanartiger Sturm', 'Orkan'];

export function uvLevel(uv) {
  if (uv == null) return { text: '–', cls: '' };
  if (uv < 3) return { text: 'Niedrig', cls: 'lvl-1' };
  if (uv < 6) return { text: 'Mäßig', cls: 'lvl-2' };
  if (uv < 8) return { text: 'Hoch', cls: 'lvl-3' };
  if (uv < 11) return { text: 'Sehr hoch', cls: 'lvl-4' };
  return { text: 'Extrem', cls: 'lvl-5' };
}

export function visibility(m) {
  if (m == null || isNaN(m)) return '–';
  if (m >= 10000) return `${Math.round(m / 1000)} km`;
  if (m >= 1000) return `${(Math.round(m / 100) / 10).toLocaleString('de-DE')} km`;
  return `${Math.round(m)} m`;
}
