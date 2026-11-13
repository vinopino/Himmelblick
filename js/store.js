// Zentraler Zustand: Einstellungen, Standort, Favoriten, letzte Suchen
import { storage } from './util.js';

const DEFAULT_SETTINGS = {
  tempUnit: 'C',        // 'C' | 'F'
  windUnit: 'kmh',      // 'kmh' | 'ms'
  timeFormat: '24',     // '24' | '12'
  theme: 'auto',        // 'auto' | 'light' | 'dark'
  animations: true,
  autoRefresh: 15,      // Minuten, 0 = aus
  radarSource: 'auto',  // 'auto' | 'dwd' | 'rainviewer'
  forecastDays: 14      // 7 | 10 | 14
};

const listeners = new Map();

export const store = {
  settings: { ...DEFAULT_SETTINGS, ...storage.get('settings', {}) },
  location: storage.get('location', null),
  favorites: storage.get('favorites', []),
  recents: storage.get('recents', []),
  data: { forecast: null, air: null, alerts: null, pollen: null, place: null },
  meta: { updated: null, stale: false, loading: false, error: null },

  on(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
    return () => listeners.get(evt).delete(fn);
  },
  emit(evt, payload) {
    (listeners.get(evt) || []).forEach(fn => {
      try { fn(payload); } catch (e) { console.error(`[${evt}]`, e); }
    });
  },

  setSetting(key, value) {
    this.settings[key] = value;
    storage.set('settings', this.settings);
    this.emit('settings', { key, value });
  },

  setLocation(loc) {
    this.location = normalizeLoc(loc);
    storage.set('location', this.location);
    this.emit('location', this.location);
  },

  isFavorite(loc) {
    if (!loc) return false;
    return this.favorites.some(f => sameLoc(f, loc));
  },
  toggleFavorite(loc) {
    loc = normalizeLoc(loc);
    if (this.isFavorite(loc)) this.favorites = this.favorites.filter(f => !sameLoc(f, loc));
    else this.favorites = [...this.favorites, loc];
    storage.set('favorites', this.favorites);
    this.emit('favorites', this.favorites);
    return this.isFavorite(loc);
  },
  removeFavorite(loc) {
    this.favorites = this.favorites.filter(f => !sameLoc(f, loc));
    storage.set('favorites', this.favorites);
    this.emit('favorites', this.favorites);
  },
  moveFavorite(index, dir) {
    const j = index + dir;
    if (j < 0 || j >= this.favorites.length) return;
    const arr = [...this.favorites];
    [arr[index], arr[j]] = [arr[j], arr[index]];
    this.favorites = arr;
    storage.set('favorites', this.favorites);
    this.emit('favorites', this.favorites);
  },

  addRecent(loc) {
    loc = normalizeLoc(loc);
    this.recents = [loc, ...this.recents.filter(r => !sameLoc(r, loc))].slice(0, 8);
    storage.set('recents', this.recents);
  },
  clearRecents() {
    this.recents = [];
    storage.set('recents', []);
  }
};

export function normalizeLoc(l) {
  return {
    name: l.name || 'Unbenannter Ort',
    admin1: l.admin1 || '',
    country: l.country || '',
    cc: (l.cc || l.country_code || '').toUpperCase(),
    lat: Math.round(Number(l.lat ?? l.latitude) * 1e4) / 1e4,
    lon: Math.round(Number(l.lon ?? l.longitude) * 1e4) / 1e4,
    gps: !!l.gps
  };
}

export function sameLoc(a, b) {
  return a && b && Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;
}
