// Animierter Wetterhintergrund (Canvas) und dynamische Farbgebung
import { prefersReducedMotion } from './util.js';

const GRADIENTS = {
  //            dunkles Design                 helles Design
  clear:        [['#1c5fa8', '#3f8fd6'], ['#2f86e0', '#9fd0ff']],
  night:        [['#070d1f', '#1b2647'], ['#14204a', '#34467c']],
  partly:       [['#23558c', '#4a78a8'], ['#3a82c9', '#b4d4ee']],
  'partly-night': [['#0b1429', '#25314f'], ['#18244a', '#3a4a72']],
  cloudy:       [['#2f3c4c', '#56667a'], ['#6c7f95', '#c3cfdb']],
  'cloudy-night': [['#11161f', '#2a3343'], ['#222b3b', '#465267']],
  rain:         [['#1f2a36', '#3d4b5b'], ['#56697e', '#a7b5c3']],
  'rain-night': [['#0c1119', '#212b38'], ['#1d2734', '#3d4a5b']],
  snow:         [['#34465b', '#687c94'], ['#7891ae', '#dbe4ee']],
  'snow-night': [['#141b28', '#33405a'], ['#25304a', '#4f5d78']],
  thunder:      [['#1e2029', '#454a59'], ['#353a49', '#6c7284']],
  'thunder-night': [['#0c0d13', '#262833'], ['#191b25', '#3b3e4c']],
  fog:          [['#3d444d', '#646c75'], ['#8a949f', '#d5dade']],
  'fog-night':  [['#181b21', '#353a42'], ['#2a2f37', '#4a5058']]
};

let canvas, ctx, W = 0, H = 0, dpr = 1;
let scene = 'clear', isDay = true, intensity = 0.5, windX = 0.2;
let particles = [], stars = [], clouds = [], fogBands = [];
let running = false, raf = 0, last = 0, enabled = true, flash = 0, nextFlash = 0, bolt = null;
let cloudSprite = null, darkCloudSprite = null;

export function initSky() {
  canvas = document.getElementById('sky-canvas');
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
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

function makeCloudSprite(color, alpha) {
  const c = document.createElement('canvas');
  c.width = 360; c.height = 180;
  const g = c.getContext('2d');
  const blobs = [[90, 110, 60], [150, 85, 75], [220, 95, 65], [270, 115, 50], [180, 125, 70]];
  blobs.forEach(([x, y, r]) => {
    const grd = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    grd.addColorStop(0, `rgba(${color},${alpha})`);
    grd.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  });
  return c;
}

function build() {
  cloudSprite = cloudSprite || makeCloudSprite('255,255,255', 0.55);
  darkCloudSprite = darkCloudSprite || makeCloudSprite('70,80,95', 0.6);
  const area = (W * H) / (390 * 844);
  particles = [];
  stars = [];
  clouds = [];
  fogBands = [];
  const base = scene.split('-')[0];
  if (base === 'rain' || base === 'thunder') {
    const n = Math.round((90 + intensity * 260) * area);
    for (let i = 0; i < n; i++) particles.push(newDrop(true));
  }
  if (base === 'snow') {
    const n = Math.round((60 + intensity * 160) * area);
    for (let i = 0; i < n; i++) particles.push(newFlake(true));
  }
  if (!isDay && ['night', 'partly', 'cloudy', 'clear'].includes(base) || scene === 'night' || scene === 'partly-night') {
    const n = Math.round((base === 'cloudy' ? 40 : 140) * area);
    for (let i = 0; i < n; i++) stars.push({ x: Math.random() * W, y: Math.random() * H * 0.7, r: Math.random() * 1.3 + 0.3, p: Math.random() * Math.PI * 2, s: 0.5 + Math.random() * 1.5 });
  }
  const cloudCount = { clear: 0, night: 0, partly: 3, cloudy: 6, rain: 6, snow: 5, thunder: 7, fog: 2 }[base] ?? 0;
  for (let i = 0; i < cloudCount; i++) {
    clouds.push({ x: Math.random() * (W + 300) - 300, y: Math.random() * H * 0.45 - 40, s: 0.6 + Math.random() * 1.1, v: 4 + Math.random() * 10, dark: base !== 'partly' && Math.random() > 0.4 });
  }
  if (base === 'fog') {
    for (let i = 0; i < 7; i++) fogBands.push({ y: H * (0.15 + i * 0.12), h: 60 + Math.random() * 80, x: Math.random() * W, v: 6 + Math.random() * 10, a: 0.08 + Math.random() * 0.1 });
  }
}

function newDrop(init) {
  return { x: Math.random() * (W + 100) - 50, y: init ? Math.random() * H : -20 - Math.random() * 100, l: 10 + Math.random() * 14, v: 650 + Math.random() * 450, a: 0.25 + Math.random() * 0.35 };
}
function newFlake(init) {
  return { x: Math.random() * W, y: init ? Math.random() * H : -10, r: 1 + Math.random() * 2.8, v: 30 + Math.random() * 60, p: Math.random() * Math.PI * 2, a: 0.5 + Math.random() * 0.5 };
}

function drawFrame(dt) {
  ctx.clearRect(0, 0, W, H);
  const base = scene.split('-')[0];

  // Sonne/Mondschein
  if (base === 'clear' || base === 'partly') {
    const gx = W * 0.82, gy = H * 0.08;
    const grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.55);
    grd.addColorStop(0, isDay ? 'rgba(255,236,170,0.45)' : 'rgba(220,230,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
  }

  // Sterne
  const t = performance.now() / 1000;
  for (const s of stars) {
    const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
    ctx.fillStyle = `rgba(255,255,240,${a.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  }

  // Wolken
  for (const c of clouds) {
    c.x += c.v * dt;
    if (c.x > W + 50) { c.x = -360 * c.s - 50; c.y = Math.random() * H * 0.45 - 40; }
    ctx.globalAlpha = isDay ? 1 : 0.55;
    ctx.drawImage(c.dark ? darkCloudSprite : cloudSprite, c.x, c.y, 360 * c.s, 180 * c.s);
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

  // Regen
  if (base === 'rain' || base === 'thunder') {
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.2;
    for (const p of particles) {
      p.y += p.v * dt;
      p.x += p.v * windX * dt;
      if (p.y > H + 20) Object.assign(p, newDrop(false));
      ctx.strokeStyle = `rgba(200,225,255,${p.a})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.l * windX, p.y - p.l);
      ctx.stroke();
    }
  }

  // Schnee
  if (base === 'snow') {
    for (const p of particles) {
      p.y += p.v * dt;
      p.p += dt;
      p.x += Math.sin(p.p) * 18 * dt + windX * 30 * dt;
      if (p.y > H + 10) Object.assign(p, newFlake(false));
      if (p.x > W + 10) p.x = -10;
      if (p.x < -10) p.x = W + 10;
      ctx.fillStyle = `rgba(255,255,255,${p.a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Gewitter: Blitz
  if (base === 'thunder' && running) {
    const now = performance.now();
    if (now > nextFlash) {
      flash = 1;
      bolt = makeBolt();
      nextFlash = now + 3500 + Math.random() * 6000;
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(230,235,255,${(flash * 0.35).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      if (bolt && flash > 0.4) {
        ctx.strokeStyle = `rgba(255,255,255,${flash})`;
        ctx.lineWidth = 2.2;
        ctx.shadowColor = 'rgba(180,200,255,0.9)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      flash -= dt * 2.2;
    }
  }
}

function makeBolt() {
  let x = W * (0.2 + Math.random() * 0.6), y = 0;
  const pts = [[x, y]];
  while (y < H * 0.55) {
    x += (Math.random() - 0.5) * 50;
    y += 20 + Math.random() * 30;
    pts.push([x, y]);
  }
  return pts;
}

function loop(ts) {
  if (!running) return;
  const dt = Math.min(0.05, (ts - last) / 1000 || 0);
  last = ts;
  drawFrame(dt);
  raf = requestAnimationFrame(loop);
}

export function start() {
  if (running || !enabled || document.hidden || prefersReducedMotion()) { if (!running) drawFrame(0); return; }
  running = true;
  last = performance.now();
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

/** Szene setzen: scene z. B. 'rain', isDay, precipitation mm/h, Windgeschwindigkeit km/h */
export function setScene({ scene: sc, day, precip = 0, wind = 0, windDir = 270, theme = 'dark' }) {
  const base = sc.replace('-night', '');
  scene = day ? base : (['clear', 'night'].includes(base) ? 'night' : base + '-night');
  isDay = day;
  intensity = Math.max(0.15, Math.min(1, precip / 4));
  // Windrichtung "aus" → Bewegungsrichtung horizontal
  windX = Math.max(-0.5, Math.min(0.5, (wind / 60) * Math.sin(((windDir + 180) * Math.PI) / 180)));
  const key = GRADIENTS[scene] ? scene : (GRADIENTS[base] ? base : 'clear');
  const [top, bottom] = GRADIENTS[key][theme === 'light' ? 1 : 0];
  const root = document.documentElement;
  root.style.setProperty('--sky-top', top);
  root.style.setProperty('--sky-bottom', bottom);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', top);
  build();
  if (!running) drawFrame(0);
  start();
}
