// Astronomische Berechnungen für den Mond (nach den Formeln von SunCalc, V. Agafonkin, BSD-Lizenz)

const rad = Math.PI / 180;
const dayMs = 864e5;
const J1970 = 2440588;
const J2000 = 2451545;
const e = rad * 23.4397;

const toJulian = date => date.valueOf() / dayMs - 0.5 + J1970;
const toDays = date => toJulian(date) - J2000;

const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

function astroRefraction(h) {
  if (h < 0) h = 0;
  return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
}

function sunCoords(d) {
  const M = rad * (357.5291 + 0.98560028 * d);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

function moonCoords(d) {
  const L = rad * (218.316 + 13.176396 * d);
  const M = rad * (134.963 + 13.064993 * d);
  const F = rad * (93.272 + 13.22935 * d);
  const l = L + rad * 6.289 * Math.sin(M);
  const b = rad * 5.128 * Math.sin(F);
  const dt = 385001 - 20905 * Math.cos(M);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
}

export function moonPosition(date, lat, lng) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = altitude(H, phi, c.dec);
  h += astroRefraction(h);
  return { altitude: h, distance: c.dist };
}

export function moonIllumination(date = new Date()) {
  const d = toDays(date);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra)
  );
  return {
    fraction: (1 + Math.cos(inc)) / 2,
    phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI,
    distance: m.dist
  };
}

/**
 * Mondauf- und -untergang für einen lokalen Kalendertag.
 * @param {Date} dayStart echter Zeitpunkt der lokalen Mitternacht
 */
export function moonTimes(dayStart, lat, lng) {
  const hc = 0.133 * rad;
  const at = h => new Date(dayStart.valueOf() + h * 36e5);
  let h0 = moonPosition(dayStart, lat, lng).altitude - hc;
  let rise, set, ye = 0;
  for (let i = 1; i <= 24; i += 2) {
    const h1 = moonPosition(at(i), lat, lng).altitude - hc;
    const h2 = moonPosition(at(i + 1), lat, lng).altitude - hc;
    const a = (h0 + h2) / 2 - h1;
    const b = (h2 - h0) / 2;
    const xe = -b / (2 * a);
    ye = (a * xe + b) * xe + h1;
    const d = b * b - 4 * a * h1;
    let roots = 0, x1 = 0, x2 = 0;
    if (d >= 0) {
      const dx = Math.sqrt(d) / (Math.abs(a) * 2);
      x1 = xe - dx;
      x2 = xe + dx;
      if (Math.abs(x1) <= 1) roots++;
      if (Math.abs(x2) <= 1) roots++;
      if (x1 < -1) x1 = x2;
    }
    if (roots === 1) {
      if (h0 < 0) rise = i + x1;
      else set = i + x1;
    } else if (roots === 2) {
      rise = i + (ye < 0 ? x2 : x1);
      set = i + (ye < 0 ? x1 : x2);
    }
    if (rise && set) break;
    h0 = h2;
  }
  const result = {};
  if (rise) result.rise = at(rise);
  if (set) result.set = at(set);
  if (!rise && !set) result[ye > 0 ? 'alwaysUp' : 'alwaysDown'] = true;
  return result;
}

export function moonPhaseName(phase) {
  if (phase < 0.02 || phase > 0.98) return 'Neumond';
  if (phase < 0.23) return 'Zunehmende Sichel';
  if (phase < 0.27) return 'Erstes Viertel';
  if (phase < 0.48) return 'Zunehmender Mond';
  if (phase < 0.52) return 'Vollmond';
  if (phase < 0.73) return 'Abnehmender Mond';
  if (phase < 0.77) return 'Letztes Viertel';
  return 'Abnehmende Sichel';
}

/** Nächster Zeitpunkt, an dem die Phase einen Zielwert (0 = Neumond, 0.5 = Vollmond) erreicht */
export function nextPhase(target, from = new Date()) {
  let prev = moonIllumination(from).phase;
  for (let h = 1; h <= 24 * 31; h++) {
    const t = new Date(from.valueOf() + h * 36e5);
    const p = moonIllumination(t).phase;
    const crossed = target === 0 ? p < prev : prev < target && p >= target;
    if (crossed) return t;
    prev = p;
  }
  return null;
}
