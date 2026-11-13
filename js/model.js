// Aufbereitung der Rohdaten aus Open-Meteo
import { parseLocal, locNow, pad } from './format.js';

export function localNow(fc) {
  return locNow(fc?.utc_offset_seconds || 0);
}

export function isoHour(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:00`;
}
export function isoDay(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Index der aktuellen Stunde in hourly */
export function currentHourIndex(fc) {
  const t = isoHour(localNow(fc));
  const idx = fc.hourly.time.indexOf(t);
  return idx >= 0 ? idx : 0;
}

export function todayIndex(fc) {
  const t = isoDay(localNow(fc));
  const idx = fc.daily.time.indexOf(t);
  return idx >= 0 ? idx : 0;
}

export function hourAt(fc, i) {
  const h = fc.hourly;
  if (i < 0 || i >= h.time.length) return null;
  return {
    i,
    time: parseLocal(h.time[i]),
    iso: h.time[i],
    temp: h.temperature_2m[i],
    feels: h.apparent_temperature[i],
    humidity: h.relative_humidity_2m[i],
    dew: h.dew_point_2m[i],
    pop: h.precipitation_probability[i],
    precip: h.precipitation[i],
    snow: h.snowfall[i],
    code: h.weather_code[i],
    pressure: h.pressure_msl[i],
    cloud: h.cloud_cover[i],
    vis: h.visibility[i],
    wind: h.wind_speed_10m[i],
    dir: h.wind_direction_10m[i],
    gust: h.wind_gusts_10m[i],
    uv: h.uv_index[i],
    isDay: h.is_day[i] === 1
  };
}

export function hoursFrom(fc, start, count) {
  const out = [];
  for (let i = start; i < Math.min(start + count, fc.hourly.time.length); i++) out.push(hourAt(fc, i));
  return out;
}

export function hoursOfDay(fc, dayIso) {
  const out = [];
  fc.hourly.time.forEach((t, i) => { if (t.startsWith(dayIso)) out.push(hourAt(fc, i)); });
  return out;
}

export function dayAt(fc, i) {
  const d = fc.daily;
  if (i < 0 || i >= d.time.length) return null;
  return {
    i,
    iso: d.time[i],
    date: parseLocal(d.time[i]),
    code: d.weather_code[i],
    max: d.temperature_2m_max[i],
    min: d.temperature_2m_min[i],
    feelsMax: d.apparent_temperature_max[i],
    feelsMin: d.apparent_temperature_min[i],
    sunrise: parseLocal(d.sunrise[i]),
    sunset: parseLocal(d.sunset[i]),
    daylight: d.daylight_duration[i],
    sunshine: d.sunshine_duration[i],
    uv: d.uv_index_max[i],
    precip: d.precipitation_sum[i],
    precipHours: d.precipitation_hours[i],
    pop: d.precipitation_probability_max[i],
    snow: d.snowfall_sum[i],
    wind: d.wind_speed_10m_max[i],
    gust: d.wind_gusts_10m_max[i],
    dir: d.wind_direction_10m_dominant[i]
  };
}

export function current(fc) {
  const c = fc.current;
  const hi = currentHourIndex(fc);
  const h = hourAt(fc, hi);
  return {
    temp: c.temperature_2m,
    feels: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    isDay: c.is_day === 1,
    precip: c.precipitation,
    code: c.weather_code,
    cloud: c.cloud_cover,
    pressure: c.pressure_msl,
    wind: c.wind_speed_10m,
    dir: c.wind_direction_10m,
    gust: c.wind_gusts_10m,
    pop: h?.pop,
    vis: h?.vis,
    uv: h?.uv,
    dew: h?.dew,
    hourIndex: hi,
    time: parseLocal(c.time)
  };
}

/** Luftdrucktendenz über die letzten 3 Stunden */
export function pressureTrend(fc) {
  const i = currentHourIndex(fc);
  const p = fc.hourly.pressure_msl;
  if (i < 3 || p[i] == null || p[i - 3] == null) return { delta: null, text: '' };
  const delta = p[i] - p[i - 3];
  let text = 'gleichbleibend';
  if (delta > 1) text = 'steigend';
  if (delta < -1) text = 'fallend';
  if (delta > 3) text = 'stark steigend';
  if (delta < -3) text = 'stark fallend';
  return { delta, text };
}

/** Niederschlag der nächsten 3 Stunden (15-Minuten-Werte) */
export function nowcast(fc) {
  const m = fc.minutely_15;
  if (!m || !m.time) return null;
  const now = localNow(fc).getTime();
  const items = m.time.map((t, i) => ({ time: parseLocal(t), v: m.precipitation[i] }))
    .filter(x => x.v != null && x.time.getTime() >= now - 15 * 60000);
  return items.length ? items.slice(0, 12) : null;
}

/** Text für Niederschlagsbeginn/-ende in Kürze */
export function nowcastSummary(items) {
  if (!items || !items.length) return null;
  const wet = items.map(x => x.v >= 0.1);
  if (!wet.some(Boolean)) return 'Kein Niederschlag in den nächsten 3 Stunden';
  if (wet[0]) {
    const end = wet.findIndex(w => !w);
    return end < 0 ? 'Anhaltender Niederschlag in den nächsten Stunden' : `Niederschlag endet in etwa ${end * 15} Min.`;
  }
  const start = wet.findIndex(Boolean);
  return `Niederschlag beginnt in etwa ${start * 15} Min.`;
}
