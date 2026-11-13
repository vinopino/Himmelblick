// WMO-Wettercodes → Beschreibung und animierte SVG-Icons

const CODES = {
  0: ['Klar', 'clear'],
  1: ['Überwiegend klar', 'mostly-clear'],
  2: ['Teilweise bewölkt', 'partly'],
  3: ['Bedeckt', 'overcast'],
  45: ['Nebel', 'fog'],
  48: ['Gefrierender Nebel', 'fog'],
  51: ['Leichter Nieselregen', 'drizzle'],
  53: ['Nieselregen', 'drizzle'],
  55: ['Starker Nieselregen', 'drizzle'],
  56: ['Gefrierender Nieselregen', 'sleet'],
  57: ['Starker gefr. Nieselregen', 'sleet'],
  61: ['Leichter Regen', 'rain-light'],
  63: ['Regen', 'rain'],
  65: ['Starker Regen', 'rain-heavy'],
  66: ['Gefrierender Regen', 'sleet'],
  67: ['Starker gefrierender Regen', 'sleet'],
  71: ['Leichter Schneefall', 'snow-light'],
  73: ['Schneefall', 'snow'],
  75: ['Starker Schneefall', 'snow-heavy'],
  77: ['Schneegriesel', 'snow-light'],
  80: ['Leichte Regenschauer', 'showers'],
  81: ['Regenschauer', 'showers'],
  82: ['Heftige Regenschauer', 'rain-heavy'],
  85: ['Schneeschauer', 'snow-showers'],
  86: ['Starke Schneeschauer', 'snow-heavy'],
  95: ['Gewitter', 'thunder'],
  96: ['Gewitter mit Hagel', 'thunder'],
  99: ['Schweres Gewitter mit Hagel', 'thunder']
};

export function weatherText(code) {
  return (CODES[code] || ['Unbekannt'])[0];
}

export function weatherKey(code) {
  return (CODES[code] || [, 'overcast'])[1];
}

/** Grobe Kategorie für Hintergründe */
export function sceneOf(code, isDay) {
  const k = weatherKey(code);
  if (k === 'thunder') return 'thunder';
  if (k.startsWith('snow') || k === 'sleet') return 'snow';
  if (k.startsWith('rain') || k === 'drizzle' || k === 'showers') return 'rain';
  if (k === 'fog') return 'fog';
  if (k === 'overcast') return isDay ? 'cloudy' : 'cloudy-night';
  if (k === 'partly') return isDay ? 'partly' : 'partly-night';
  return isDay ? 'clear' : 'night';
}

/* ---------- SVG-Bausteine (viewBox 0 0 64 64) ---------- */
const SUN = (cx = 32, cy = 32, r = 11, small = false) => {
  const rays = [];
  const ri = r + (small ? 4 : 5), ro = r + (small ? 8 : 10);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    rays.push(`<line x1="${(cx + Math.cos(a) * ri).toFixed(1)}" y1="${(cy + Math.sin(a) * ri).toFixed(1)}" x2="${(cx + Math.cos(a) * ro).toFixed(1)}" y2="${(cy + Math.sin(a) * ro).toFixed(1)}"/>`);
  }
  return `<g class="wi-sun" style="transform-origin:${cx}px ${cy}px">
    <g class="wi-rays" stroke="#FFC23A" stroke-width="3" stroke-linecap="round">${rays.join('')}</g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#FFC93C"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#FFB300" stroke-width="1.5" opacity=".6"/>
  </g>`;
};

const MOON = (cx = 34, cy = 28, r = 12) =>
  `<g class="wi-moon" style="transform-origin:${cx}px ${cy}px">
    <path d="M${cx + r * 0.25},${cy - r} a${r},${r} 0 1 0 ${r * 0.75},${r * 1.55} a${r * 0.95},${r * 0.95} 0 0 1 -${r * 0.75},-${r * 1.55}z" fill="#F3E7B3" stroke="#E3CF7A" stroke-width="1.2"/>
  </g>`;

const STARS = `<g class="wi-stars" fill="#FFF7D1">
  <path class="wi-star s1" d="M12 12l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z"/>
  <path class="wi-star s2" d="M52 10l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z"/>
</g>`;

const CLOUD_PATH = 'M19 50h27a10.5 10.5 0 0 0 1.4-20.9A14.5 14.5 0 0 0 19.6 25.4 12.3 12.3 0 0 0 19 50z';

const CLOUD = (fill = '#EEF3F8', stroke = '#C5D0DC', cls = 'wi-cloud', dx = 0, dy = 0, s = 1) =>
  `<g class="${cls}" transform="translate(${dx} ${dy}) scale(${s})"><path d="${CLOUD_PATH}" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/></g>`;

const RAIN = (n = 3, heavy = false) => {
  const xs = n === 2 ? [26, 38] : n === 3 ? [23, 32, 41] : [21, 28, 35, 42];
  return `<g class="wi-rain" stroke="#4FA3F7" stroke-width="${heavy ? 3 : 2.5}" stroke-linecap="round">${xs
    .map((x, i) => `<line class="d d${i % 3}" x1="${x}" y1="52" x2="${x - 2.5}" y2="${heavy ? 60 : 58}"/>`)
    .join('')}</g>`;
};

const flake = (x, y, r = 3.4) => `M${x} ${y - r}V${y + r}M${x - r * 0.87} ${y - r / 2}L${x + r * 0.87} ${y + r / 2}M${x - r * 0.87} ${y + r / 2}L${x + r * 0.87} ${y - r / 2}`;

const SNOW = (n = 3) => {
  const xs = n === 2 ? [26, 38] : n === 3 ? [23, 32, 41] : [21, 28, 35, 42];
  return `<g class="wi-snow" fill="none" stroke="#8EC5F5" stroke-width="1.7" stroke-linecap="round">${xs
    .map((x, i) => `<path class="f f${i % 3}" d="${flake(x, 55)}"/>`)
    .join('')}</g>`;
};

const SLEET = `<g class="wi-rain" stroke="#4FA3F7" stroke-width="2.5" stroke-linecap="round"><line class="d d0" x1="24" y1="52" x2="21.5" y2="58"/><line class="d d2" x1="40" y1="52" x2="37.5" y2="58"/></g>
  <g class="wi-snow" fill="none" stroke="#8EC5F5" stroke-width="1.7" stroke-linecap="round"><path class="f f1" d="M32 51.6V58.4M29 53.3L35 56.7M29 56.7L35 53.3"/></g>`;

const BOLT = `<path class="wi-bolt" d="M34 44l-7 10h6l-3 9 9-12h-6l4-7z" fill="#FFD23F" stroke="#F2B700" stroke-width="1" stroke-linejoin="round"/>`;

const FOG = `<g class="wi-fog" stroke="#C9D3DE" stroke-width="3" stroke-linecap="round">
  <line class="l0" x1="12" y1="46" x2="52" y2="46"/><line class="l1" x1="16" y1="53" x2="48" y2="53"/><line class="l2" x1="12" y1="60" x2="44" y2="60"/></g>`;

const DARK = ['#D7DEE7', '#A9B6C5'];
const DARKER = ['#B9C4D1', '#8796A8'];

function body(key, isDay) {
  const celestial = (sx, sy, r) => (isDay ? SUN(sx, sy, r, true) : MOON(sx, sy, r));
  switch (key) {
    case 'clear':
      return isDay ? SUN(32, 32, 13) : MOON(30, 32, 16) + STARS;
    case 'mostly-clear':
      return (isDay ? SUN(28, 26, 11) : MOON(28, 26, 13) + STARS) + CLOUD('#F4F7FB', '#CAD4DF', 'wi-cloud', 14, 14, 0.72);
    case 'partly':
      return celestial(23, 22, 10) + CLOUD('#F2F5F9', '#C5D0DC', 'wi-cloud', 2, 2, 0.95);
    case 'overcast':
      return CLOUD(DARK[0], DARK[1], 'wi-cloud back', -8, -8, 0.8) + CLOUD('#EEF3F8', '#B5C1CF', 'wi-cloud', 0, -2);
    case 'fog':
      return CLOUD('#E2E8EF', '#B5C1CF', 'wi-cloud', 0, -10) + FOG;
    case 'drizzle':
      return CLOUD('#E4EAF1', '#AEBBCB', 'wi-cloud', 0, -8) + RAIN(3).replace('stroke-width="2.5"', 'stroke-width="1.8"');
    case 'rain-light':
      return (isDay ? SUN(20, 18, 8, true) : '') + CLOUD('#E4EAF1', '#AEBBCB', 'wi-cloud', 0, -8) + RAIN(2);
    case 'rain':
      return CLOUD(DARK[0], DARK[1], 'wi-cloud', 0, -8) + RAIN(3);
    case 'rain-heavy':
      return CLOUD(DARKER[0], DARKER[1], 'wi-cloud', 0, -8) + RAIN(4, true);
    case 'showers':
      return celestial(21, 18, 8) + CLOUD('#E4EAF1', '#AEBBCB', 'wi-cloud', 0, -8) + RAIN(3);
    case 'sleet':
      return CLOUD(DARK[0], DARK[1], 'wi-cloud', 0, -8) + SLEET;
    case 'snow-light':
      return CLOUD('#EEF3F8', '#B5C1CF', 'wi-cloud', 0, -8) + SNOW(2);
    case 'snow':
      return CLOUD('#E4EAF1', '#AEBBCB', 'wi-cloud', 0, -8) + SNOW(3);
    case 'snow-heavy':
      return CLOUD(DARK[0], DARK[1], 'wi-cloud', 0, -8) + SNOW(4);
    case 'snow-showers':
      return celestial(21, 18, 8) + CLOUD('#EEF3F8', '#B5C1CF', 'wi-cloud', 0, -8) + SNOW(3);
    case 'thunder':
      return CLOUD(DARKER[0], DARKER[1], 'wi-cloud', 0, -10) + `<g transform="translate(0 -4)">${BOLT}</g>` + RAIN(2);
    default:
      return CLOUD();
  }
}

/**
 * Liefert ein SVG-Icon als String.
 * @param {number} code WMO-Code
 * @param {boolean} isDay Tag/Nacht
 * @param {object} opt size (px), animated (bool), cls
 */
export function weatherIcon(code, isDay = true, { size = 40, animated = false, cls = '' } = {}) {
  const key = weatherKey(code);
  return `<svg class="wi ${animated ? 'wi-anim' : ''} ${cls}" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${weatherText(code)}">${body(key, isDay)}</svg>`;
}

/** Mondphasen-Icon (phase 0..1, 0 = Neumond, 0.5 = Vollmond) */
export function moonPhaseIcon(phase, size = 56) {
  const r = 24, cx = 32, cy = 32;
  // Beleuchteter Anteil als Ellipse + Halbkreis
  const waxing = phase < 0.5;
  const k = Math.cos(phase * 2 * Math.PI); // 1 = neu, -1 = voll
  const rx = Math.abs(k) * r;
  const lit = '#F6ECC4', dark = '#2B3A52';
  const sweepOuter = waxing ? 1 : 0;
  // Halbkreis der beleuchteten Seite
  const outer = `M${cx},${cy - r} A${r},${r} 0 0 ${sweepOuter} ${cx},${cy + r}`;
  // Terminator: Ellipse, Richtung abhängig von Sichel/Dreiviertel
  const sweepInner = (k > 0) === waxing ? 0 : 1;
  const inner = `A${rx.toFixed(2)},${r} 0 0 ${sweepInner} ${cx},${cy - r}`;
  return `<svg class="moon-phase" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${dark}"/>
    <path d="${outer} ${inner}Z" fill="${lit}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="1"/>
  </svg>`;
}

/** Windpfeil (zeigt in Zugrichtung des Windes) */
export function windArrow(deg, size = 18) {
  const rot = ((deg ?? 0) + 180) % 360;
  return `<svg class="wind-arrow" viewBox="0 0 24 24" width="${size}" height="${size}" style="transform:rotate(${rot}deg)" aria-hidden="true"><path d="M12 3l5 9h-3.5v9h-3v-9H7z" fill="currentColor"/></svg>`;
}

export function dropIcon(size = 12) {
  return `<svg class="drop" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M12 2.7S5 10.4 5 15a7 7 0 0 0 14 0c0-4.6-7-12.3-7-12.3z" fill="currentColor"/></svg>`;
}
