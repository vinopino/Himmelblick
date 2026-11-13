// Datenquellen – alle Werte werden live von den jeweiligen Diensten abgerufen
import { fetchJSON, FetchError } from './util.js';

const OM = 'https://api.open-meteo.com/v1/forecast';
const OM_GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const OM_AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const BRIGHTSKY = 'https://api.brightsky.dev';
const BDC_REVERSE = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const DWD_POLLEN = 'https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json';
const RAINVIEWER = 'https://api.rainviewer.com/public/weather-maps.json';
export const DWD_WMS = 'https://maps.dwd.de/geoserver/dwd/wms';
const DWD_RADAR_CAPS = 'https://maps.dwd.de/geoserver/dwd/Niederschlagsradar/ows?service=WMS&version=1.3.0&request=GetCapabilities';

const MIN = 60 * 1000;
const key = (p, lat, lon) => `${p}.${lat.toFixed(2)},${lon.toFixed(2)}`;

/* ---------- Ortssuche ---------- */
export async function searchPlaces(query) {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `${OM_GEO}?name=${encodeURIComponent(q)}&count=12&language=de&format=json`;
  const { data } = await fetchJSON(url, { timeout: 8000, retries: 0 });
  return (data.results || []).map(r => ({
    name: r.name,
    admin1: r.admin1 || '',
    admin2: r.admin2 || '',
    country: r.country || '',
    cc: r.country_code || '',
    lat: r.latitude,
    lon: r.longitude,
    population: r.population || 0,
    elevation: r.elevation
  }));
}

/** Ortsname zu Koordinaten (BigDataCloud, client-seitige, kostenlose Variante) */
export async function reverseGeocode(lat, lon) {
  const url = `${BDC_REVERSE}?latitude=${lat}&longitude=${lon}&localityLanguage=de`;
  const { data } = await fetchJSON(url, { timeout: 8000, retries: 1, cacheKey: key('rev', lat, lon), maxAge: 7 * 24 * 60 * MIN });
  return {
    name: data.city || data.locality || data.principalSubdivision || 'Mein Standort',
    admin1: data.principalSubdivision || '',
    country: data.countryName || '',
    cc: data.countryCode || ''
  };
}

/* ---------- Wetterprognose (Open-Meteo) ---------- */
const CURRENT = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
const HOURLY = 'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,snowfall,weather_code,pressure_msl,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,is_day';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,sunshine_duration,uv_index_max,precipitation_sum,precipitation_hours,precipitation_probability_max,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant';

export async function getForecast(loc, { force = false } = {}) {
  const url = `${OM}?latitude=${loc.lat}&longitude=${loc.lon}`
    + `&current=${CURRENT}&hourly=${HOURLY}&daily=${DAILY}`
    + `&minutely_15=precipitation&forecast_minutely_15=12`
    + `&timezone=auto&forecast_days=16&wind_speed_unit=kmh&temperature_unit=celsius&precipitation_unit=mm`;
  return fetchJSON(url, { cacheKey: key('fc', loc.lat, loc.lon), maxAge: force ? 0 : 5 * MIN, timeout: 15000 });
}

/* ---------- Luftqualität & Pollen (Open-Meteo / CAMS) ---------- */
const AIR_VARS = 'european_aqi,pm10,pm2_5,ozone,nitrogen_dioxide,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen';
export async function getAir(loc, { force = false } = {}) {
  const url = `${OM_AIR}?latitude=${loc.lat}&longitude=${loc.lon}&current=${AIR_VARS}&hourly=${AIR_VARS}&timezone=auto&forecast_days=3`;
  return fetchJSON(url, { cacheKey: key('air', loc.lat, loc.lon), maxAge: force ? 0 : 20 * MIN });
}

/* ---------- Amtliche Warnungen des DWD (über Bright Sky) ---------- */
export async function getAlerts(loc, tz, { force = false } = {}) {
  const url = `${BRIGHTSKY}/alerts?lat=${loc.lat}&lon=${loc.lon}&tz=${encodeURIComponent(tz || 'Europe/Berlin')}`;
  return fetchJSON(url, { cacheKey: key('alerts', loc.lat, loc.lon), maxAge: force ? 0 : 3 * MIN });
}

/* ---------- Pollenflug-Gefahrenindex des DWD ---------- */
export async function getDwdPollen() {
  return fetchJSON(DWD_POLLEN, { cacheKey: 'dwdpollen', maxAge: 60 * MIN, timeout: 10000 });
}

/* ---------- Radar ---------- */
export async function getRainViewer() {
  return fetchJSON(RAINVIEWER, { timeout: 8000, cacheKey: 'rainviewer', maxAge: 2 * MIN });
}

/** Liest die verfügbaren Zeitschritte des DWD-Radarlayers aus den WMS-Capabilities */
export async function getDwdRadarTimes() {
  const { data: xml, stale } = await fetchJSON(DWD_RADAR_CAPS, { type: 'text', timeout: 10000, retries: 0 });
  if (stale) throw new FetchError('Veraltete Radarzeiten');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const dims = [...doc.getElementsByTagName('Dimension'), ...doc.getElementsByTagName('Extent')]
    .filter(d => (d.getAttribute('name') || '').toLowerCase() === 'time');
  if (!dims.length) throw new FetchError('Keine Zeitdimension gefunden');
  const times = new Set();
  for (const d of dims) {
    for (const part of d.textContent.trim().split(',')) {
      const p = part.trim();
      if (!p) continue;
      if (p.includes('/')) {
        const [a, b, per] = p.split('/');
        const start = Date.parse(a), end = Date.parse(b);
        const step = parseISODuration(per) || 5 * MIN;
        if (isNaN(start) || isNaN(end)) continue;
        for (let t = start; t <= end && times.size < 5000; t += step) times.add(t);
      } else {
        const t = Date.parse(p);
        if (!isNaN(t)) times.add(t);
      }
    }
  }
  const list = [...times].sort((a, b) => a - b);
  if (!list.length) throw new FetchError('Keine Radarzeiten');
  return list;
}

function parseISODuration(s) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s || '');
  if (!m) return 0;
  return ((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0)) * 1000;
}

/* ---------- Gitterdaten für Wetterkarten ---------- */
export async function getGrid(points) {
  const lats = points.map(p => p[0].toFixed(3)).join(',');
  const lons = points.map(p => p[1].toFixed(3)).join(',');
  const url = `${OM}?latitude=${lats}&longitude=${lons}`
    + `&hourly=temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m`
    + `&timezone=GMT&forecast_days=3&wind_speed_unit=kmh`;
  const { data } = await fetchJSON(url, { timeout: 20000, retries: 1 });
  return Array.isArray(data) ? data : [data];
}

/* ---------- Mehrere Orte (Favoriten-Vergleich) ---------- */
export async function getCurrentMulti(locs) {
  if (!locs.length) return { list: [], stale: false, time: Date.now() };
  const lats = locs.map(l => l.lat).join(',');
  const lons = locs.map(l => l.lon).join(',');
  const url = `${OM}?latitude=${lats}&longitude=${lons}`
    + `&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_gusts_10m,precipitation,relative_humidity_2m`
    + `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum`
    + `&forecast_days=1&timezone=auto&wind_speed_unit=kmh`;
  const { data, stale, time } = await fetchJSON(url, { cacheKey: 'compare.' + lats + '|' + lons, maxAge: 5 * MIN });
  const arr = Array.isArray(data) ? data : [data];
  return { list: arr, stale, time };
}
