// Service Worker: App-Shell offline verfügbar machen.
// Wetterdaten werden NICHT hier gecacht, sondern in der App (localStorage) mit Zeitstempel,
// damit veraltete Daten immer als solche erkennbar bleiben.
const VERSION = 'hb-v1.0.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/util.js',
  './js/store.js',
  './js/format.js',
  './js/icons.js',
  './js/astro.js',
  './js/api.js',
  './js/model.js',
  './js/warnlogic.js',
  './js/insights.js',
  './js/background.js',
  './js/charts.js',
  './js/ui.js',
  './js/views/home.js',
  './js/views/forecast.js',
  './js/views/warnings.js',
  './js/views/more.js',
  './js/views/details.js',
  './js/views/sunmoon.js',
  './js/views/locations.js',
  './js/views/radar.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/icon.svg'
];
const CDN = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    // CDN-Dateien best effort
    await Promise.all(CDN.map(u => cache.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    self.skipWaiting();
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
  const isShell = url.origin === self.location.origin;
  const isCdn = CDN.includes(req.url);
  if (!isShell && !isCdn) return; // APIs, Kacheln usw. direkt aus dem Netz

  // Stale-while-revalidate für die App-Shell
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') return cache.match('./index.html');
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
