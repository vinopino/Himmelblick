// Service Worker – Himmelblick
// WICHTIG: VERSION bei jeder Codeänderung erhöhen. Strategie "Netz zuerst" für die App-Shell:
// online wird immer der aktuelle Code geladen, offline der zwischengespeicherte.
// Wetterdaten werden NICHT hier gecacht, sondern in der App (localStorage, mit Zeitstempel).
const VERSION = 'hb-v2.0.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/util.js', './js/store.js', './js/format.js', './js/icons.js', './js/astro.js',
  './js/api.js', './js/model.js', './js/warnlogic.js', './js/insights.js', './js/background.js',
  './js/charts.js', './js/ui.js',
  './js/views/home.js', './js/views/forecast.js', './js/views/warnings.js', './js/views/more.js',
  './js/views/details.js', './js/views/sunmoon.js', './js/views/locations.js', './js/views/radar.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/icon.svg'
];
const CDN = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];
const NET_TIMEOUT = 3500;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
    await Promise.all(CDN.map(u => cache.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('hb-') && k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (CDN.includes(req.url)) {
    // Versionierte CDN-Dateien ändern sich nie → Cache zuerst
    event.respondWith(caches.match(req).then(c => c || fetch(req).then(res => {
      if (res.ok) caches.open(VERSION).then(cache => cache.put(req, res.clone()));
      return res;
    })));
    return;
  }
  if (url.origin !== self.location.origin) return; // APIs, Kartenkacheln → direkt aus dem Netz

  // App-Shell: Netz zuerst (mit Zeitlimit), sonst Cache
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await Promise.race([
        fetch(req, { cache: 'no-cache' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), NET_TIMEOUT))
      ]);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
