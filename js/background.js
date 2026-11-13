// Animierter Wetterhintergrund (Canvas) und dynamisches Farbsystem
// v2: Tiefenebenen für Regen/Wolken, Sonnenstrahlen, Mond mit Lichthof, Sternschnuppen,
//     30-fps-Begrenzung (Akku), Pause bei verborgenem Tab und bei "Bewegung reduzieren".
import { prefersReducedMotion } from './util.js';

// [dunkles Design, helles Design] – jeweils Verlauf oben → unten
const GRADIENTS = {
  clear:           [['#0b5596', '#159db0'], ['#2a8fe8', '#62d4dc']],   // Blau/Türkis
  night:           [['#050a1c', '#14224a'], ['#0d1938', '#24386b']],   // Dunkelblau
  partly:          [['#1a5791', '#3f88b0'], ['#3b8fd9', '#9fd3e6']],
  'partly-night':  [['#081329', '#21304f'], ['#13224a', '#33476f']],
  cloudy:          [['#2c3846', '#55667a'], ['#6f8196', '#c2cdd8']],   // Grau/Blau
  'cloudy-night':  [['#0f141d', '#283242'], ['#212a39', '#435066']],
  rain:            [['#152131', '#34465a'], ['#40566e', '#8fa2b5']],   // Tiefblau/Anthrazit
  'rain-night':    [['#0a0f17', '#1c2735'], ['#18212e', '#36455a']],
  snow:            [['#2e4259', '#6a8099'], ['#7a93b0', '#dce5ef']],
  'snow-night':    [['#121a28', '#323f58'], ['#232e48', '#4d5b77']],
  thunder:         [['#120f1a', '#3a3047'], ['#2a2536', '#5b5068']],   // dramatisch dunkel
  'thunder-night': [['#08070d', '#221d2c'], ['#16131e', '#383044']],
  fog:             [['#3a424b', '#646c76'], ['#8a949f', '#d3d9de']],
  'fog-night':     [['#171a20', '#343941'], ['#292e36', '#4a5058']]
};

const FRAME_MS = 1000 / 30;

let canvas, ctx, W = 0, H = 0, dpr = 1;
let scene = 'clear', isDay = true, intensity = 0.5, windX = 0.2;
let drops = [], flakes = [], stars = [], clouds = [], fogBands = [], shooting = null;
let running = false, raf = 0, last = 0, acc = 0, enabled = true;
let flash = 0, nextFlash = 0, bolt = null, nextShoot = 0;
let sprites = null;

export function initSky() {
  canvas = document.getElementById('sky-canvas');
  ctx = canvas.getContext('2d', { alpha: true });
  resize();
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  build();
  if (!running) drawFrame(0);
}

function makeCloudSprite(rgb, alpha, seed) {
  const c = document.createElement('canvas');
  c.width = 420; c.height = 200;
  const g = c.getContext('2d');
  const sets = [
    [[90, 120, 62], [155, 92, 80], [228, 100, 70], [290, 122, 54], [190, 135, 78]],
    [[80, 130, 50], [140, 105, 66], [210, 88, 74], [280, 110, 64], [330, 132, 46], [200, 140, 70]]
  ];
  sets[seed % 2].forEach(([x, y, r]) => {
    const grd = g.createRadialGradient(x, y, r * 0.15, x, y, r);
    grd.addColorStop(0, `rgba(${rgb},${alpha})`);
    grd.addColorStop(0.7, `rgba(${rgb},${alpha * 0.55})`);
    grd.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  });
  return c;
}

function build() {
  sprites = sprites || {
    light: [makeCloudSprite('255,255,255', 0.5, 0), makeCloudSprite('255,255,255', 0.45, 1)],
    dark: [makeCloudSprite('62,72,88', 0.6, 0), makeCloudSprite('48,56,70', 0.6, 1)]
  };
  const area = Math.min(2.2, (W * H) / (390 * 844));
  const base = scene.split('-')[0];
  drops = []; flakes = []; stars = []; clouds = []; fogBands = [];

  if (base === 'rain' || base === 'thunder') {
    const n = Math.round((80 + intensity * 220) * area);
    for (let i = 0; i < n; i++) drops.push(newDrop(true));
  }
  if (base === 'snow') {
    const n = Math.round((60 + intensity * 140) * area);
    for (let i = 0; i < n; i++) flakes.push(newFlake(true));
  }
  if (!isDay && base !== 'rain' && base !== 'thunder' && base !== 'snow' && base !== 'fog') {
    const n = Math.round((base === 'cloudy' ? 35 : 130) * area);
    for (let i = 0; i < n; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H * 0.72, r: Math.random() * 1.2 + 0.3, p: Math.random() * 6.3, s: 0.4 + Math.random() * 1.4, b: Math.random() < 0.08 });
    }
  }
  // Zwei Wolkenebenen: hinten klein/langsam/blass, vorne groß/schneller
  const count = { clear: 0, night: 0, partly: 3, cloudy: 5, rain: 5, snow: 4, thunder: 6, fog: 2 }[base] ?? 0;
  const dark = ['rain', 'thunder'].includes(base) || (base === 'cloudy' && !isDay);
  for (let layer = 0; layer < 2; layer++) {
    const n = layer === 0 ? Math.ceil(count * 0.8) : count;
    for (let i = 0; i < n; i++) {
      const s = layer === 0 ? 0.45 + Math.random() * 0.4 : 0.8 + Math.random() * 0.9;
      clouds.push({
        layer, s,
        x: Math.random() * (W + 420 * s) - 420 * s,
        y: (layer === 0 ? -20 : 10) + Math.random() * H * (layer === 0 ? 0.3 : 0.42),
        v: layer === 0 ? 3 + Math.random() * 4 : 8 + Math.random() * 10,
        a: layer === 0 ? 0.55 : 1,
        sp: (dark && Math.random() > 0.25 ? sprites.dark : sprites.light)[Math.floor(Math.random() * 2)]
      });
    }
  }
  if (base === 'fog') {
    for (let i = 0; i < 7; i++) fogBands.push({ y: H * (0.12 + i * 0.12), h: 60 + Math.random() * 90, x: Math.random() * W, v: 5 + Math.random() * 10, a: 0.07 + Math.random() * 0.1 });
  }
  nextShoot = performance.now() + 8000 + Math.random() * 12000;
}

// Regentropfen mit Tiefe z (0.3 = fern, 1 = nah)
function newDrop(init) {
  const z = 0.3 + Math.random() * 0.7;
  return { x: Math.random() * (W + 120) - 60, y: init ? Math.random() * H : -20 - Math.random() * 120, z, l: 7 + z * 16, v: 420 + z * 720, a: 0.12 + z * 0.4, w: 0.6 + z * 0.9 };
}
// Schneeflocken: Größe bestimmt Fallgeschwindigkeit
function newFlake(init) {
  const r = 0.8 + Math.random() ** 1.6 * 3.4;
  return { x: Math.random() * W, y: init ? Math.random() * H : -10, r, v: 18 + r * 16 + Math.random() * 12, p: Math.random() * 6.3, sw: 8 + Math.random() * 18, a: 0.45 + Math.min(0.5, r / 7) };
}

function drawFrame(dt) {
  ctx.clearRect(0, 0, W, H);
  const base = scene.split('-')[0];
  const t = performance.now() / 1000;

  // Sonne: pulsierender Lichthof + langsam rotierende Strahlen
  if (isDay && (base === 'clear' || base === 'partly')) {
    const gx = W * 0.82, gy = H * 0.07;
    const pulse = 1 + Math.sin(t * 0.8) * 0.04;
    const R = Math.max(W, H) * 0.55 * pulse;
    const grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, R);
    grd.addColorStop(0, 'rgba(255,240,190,0.55)');
    grd.addColorStop(0.25, 'rgba(255,225,150,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    if (base === 'clear') {
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(t * 0.02);
      for (let i = 0; i < 10; i++) {
        ctx.rotate((Math.PI * 2) / 10);
        const g2 = ctx.createLinearGradient(0, 0, R * 0.9, 0);
        g2.addColorStop(0, 'rgba(255,248,215,0.10)');
        g2.addColorStop(1, 'rgba(255,248,215,0)');
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R * 0.9, -R * 0.06); ctx.lineTo(R * 0.9, R * 0.06); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }

  // Nacht: Sterne, Mond mit Lichthof, gelegentliche Sternschnuppe
  if (stars.length) {
    for (const s of stars) {
      const a = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
      ctx.fillStyle = `rgba(255,252,235,${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.b ? s.r * 1.5 : s.r, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (!isDay && (base === 'clear' || base === 'night' || base === 'partly')) {
    const mx = W * 0.8, my = H * 0.1, mr = Math.min(28, W * 0.06);
    const glow = ctx.createRadialGradient(mx, my, mr, mx, my, mr * 7 * (1 + Math.sin(t * 0.5) * 0.04));
    glow.addColorStop(0, 'rgba(220,230,255,0.22)');
    glow.addColorStop(1, 'rgba(220,230,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(mx - mr * 8, my - mr * 8, mr * 16, mr * 16);
    ctx.fillStyle = 'rgba(246,240,214,0.92)';
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(200,195,170,0.25)';
    ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.22, 0, Math.PI * 2); ctx.arc(mx + mr * 0.35, my + mr * 0.25, mr * 0.15, 0, Math.PI * 2); ctx.fill();

    const now = performance.now();
    if (running && !shooting && now > nextShoot) {
      shooting = { x: Math.random() * W * 0.6, y: Math.random() * H * 0.25, vx: 520, vy: 220, life: 1 };
      nextShoot = now + 15000 + Math.random() * 20000;
    }
    if (shooting) {
      const s = shooting;
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 1.4;
      const g = ctx.createLinearGradient(s.x, s.y, s.x - 90, s.y - 38);
      g.addColorStop(0, `rgba(255,255,255,${Math.max(0, s.life) * 0.8})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - 90, s.y - 38); ctx.stroke();
      if (s.life <= 0) shooting = null;
    }
  }

  // Wolken (hintere Ebene zuerst)
  for (const c of clouds) {
    c.x += c.v * dt;
    const w = 420 * c.s;
    if (c.x > W + 40) { c.x = -w - 40; }
    ctx.globalAlpha = c.a * (isDay ? 1 : 0.6);
    ctx.drawImage(c.sp, c.x, c.y, w, 200 * c.s);
  }
  ctx.globalAlpha = 1;

  // Nebel
  for (const f of fogBands) {
    f.x = (f.x + f.v * dt) % (W * 2);
    const grd = ctx.createLinearGradient(0, f.y, 0, f.y + f.h);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, `rgba(255,255,255,${f.a})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(f.x - W * 2, f.y, W * 4, f.h);
  }

  // Regen mit Tiefenwirkung
  if (drops.length) {
    ctx.lineCap = 'round';
    for (const p of drops) {
      p.y += p.v * dt;
      p.x += p.v * windX * dt;
      if (p.y > H + 20) Object.assign(p, newDrop(false));
      ctx.strokeStyle = `rgba(205,228,255,${p.a.toFixed(3)})`;
      ctx.lineWidth = p.w;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.l * windX, p.y - p.l);
      ctx.stroke();
    }
  }

  // Schnee: verschiedene Größen und Geschwindigkeiten
  if (flakes.length) {
    for (const p of flakes) {
      p.y += p.v * dt;
      p.p += dt;
      p.x += Math.sin(p.p) * p.sw * dt + windX * 30 * dt;
      if (p.y > H + 10) Object.assign(p, newFlake(false));
      if (p.x > W + 10) p.x = -10;
      if (p.x < -10) p.x = W + 10;
      ctx.fillStyle = `rgba(255,255,255,${p.a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Gewitter: gelegentlicher Blitz
  if (base === 'thunder' && running) {
    const now = performance.now();
    if (now > nextFlash) {
      flash = 1;
      bolt = makeBolt();
      nextFlash = now + 4000 + Math.random() * 7000;
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(225,230,255,${(flash * 0.3).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      if (bolt && flash > 0.4) {
        ctx.strokeStyle = `rgba(255,255,255,${flash})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(180,200,255,0.9)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      flash -= dt * 2.4;
    }
  }
}

function makeBolt() {
  let x = W * (0.2 + Math.random() * 0.6), y = 0;
  const pts = [[x, y]];
  while (y < H * 0.5) {
    x += (Math.random() - 0.5) * 50;
    y += 20 + Math.random() * 30;
    pts.push([x, y]);
  }
  return pts;
}

function loop(ts) {
  if (!running) return;
  raf = requestAnimationFrame(loop);
  const delta = ts - last;
  last = ts;
  acc += delta;
  if (acc < FRAME_MS) return;           // auf ~30 fps begrenzen
  const dt = Math.min(0.08, acc / 1000);
  acc = 0;
  drawFrame(dt);
}

export function start() {
  if (running) return;
  if (!enabled || document.hidden || prefersReducedMotion()) { drawFrame(0); return; }
  running = true;
  last = performance.now();
  acc = FRAME_MS;
  raf = requestAnimationFrame(loop);
}

export function stop() {
  running = false;
  cancelAnimationFrame(raf);
}

export function setAnimationsEnabled(on) {
  enabled = on;
  if (!on) { stop(); drawFrame(0); } else start();
}

/** Szene setzen: scene z. B. 'rain', day, Niederschlag mm/h, Wind km/h, Windrichtung, Design */
export function setScene({ scene: sc, day, precip = 0, wind = 0, windDir = 270, theme = 'dark' }) {
  const base = sc.replace('-night', '');
  scene = day ? base : (['clear', 'night'].includes(base) ? 'night' : base + '-night');
  isDay = day;
  intensity = Math.max(0.15, Math.min(1, precip / 4));
  windX = Math.max(-0.5, Math.min(0.5, (wind / 60) * Math.sin(((windDir + 180) * Math.PI) / 180)));
  const key = GRADIENTS[scene] ? scene : (GRADIENTS[base] ? base : 'clear');
  const [top, bottom] = GRADIENTS[key][theme === 'light' ? 1 : 0];
  const root = document.documentElement;
  root.style.setProperty('--sky-top', top);
  root.style.setProperty('--sky-bottom', bottom);
  root.dataset.scene = base;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', top);
  build();
  if (!running) drawFrame(0);
  start();
}
