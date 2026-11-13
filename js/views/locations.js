// Ortssuche, Favoriten und letzte Suchen
import { store, sameLoc } from '../store.js';
import { searchPlaces } from '../api.js';
import { openSheet, closeSheet } from '../ui.js';
import { debounce, esc } from '../util.js';

const flag = cc => (cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 127397 + c.charCodeAt(0))) : '📍');

export function openLocationSheet({ onSelect, onGps }) {
  openSheet(`
    <h2>Ort wählen</h2>
    <form class="search" role="search" autocomplete="off">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>
      <input type="search" id="loc-q" placeholder="Stadt, Ort oder PLZ suchen" enterkeyhint="search" aria-label="Ort suchen">
    </form>
    ${onGps ? `<button class="list-btn gps" data-gps><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3A9 9 0 0 0 13 3.06V1h-2v2.06A9 9 0 0 0 3.06 11H1v2h2.06A9 9 0 0 0 11 20.94V23h2v-2.06A9 9 0 0 0 20.94 13H23v-2h-2.06zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/></svg> Aktuellen Standort verwenden</button>` : ''}
    <div id="loc-results" aria-live="polite"></div>
    <div id="loc-lists"></div>`, {
    cls: 'sheet-tall',
    onMount: body => {
      const input = body.querySelector('#loc-q');
      const results = body.querySelector('#loc-results');
      const lists = body.querySelector('#loc-lists');
      const choose = loc => {
        store.addRecent(loc);
        closeSheet();
        onSelect(loc);
      };
      const renderLists = () => {
        const favs = store.favorites, rec = store.recents;
        lists.innerHTML = `
          <h3 class="sheet-h3">Favoriten</h3>
          ${favs.length ? `<ul class="loc-list">${favs.map((f, i) => `<li class="${sameLoc(f, store.location) ? 'active' : ''}">
              <button class="loc-item" data-fav="${i}"><span class="flag">${flag(f.cc)}</span><span><b>${esc(f.name)}</b><small>${esc([f.admin1, f.country].filter(Boolean).join(', '))}</small></span></button>
              <span class="loc-tools">
                <button class="icon-btn sm" data-up="${i}" aria-label="Nach oben" ${i === 0 ? 'disabled' : ''}>▲</button>
                <button class="icon-btn sm" data-down="${i}" aria-label="Nach unten" ${i === favs.length - 1 ? 'disabled' : ''}>▼</button>
                <button class="icon-btn sm danger" data-del="${i}" aria-label="${esc(f.name)} entfernen">✕</button>
              </span></li>`).join('')}</ul>`
            : '<p class="muted small">Noch keine Favoriten. Tippe im Kopfbereich auf den Stern, um einen Ort zu speichern.</p>'}
          <h3 class="sheet-h3">Letzte Suchen ${rec.length ? '<button class="link small" data-clear-rec>Löschen</button>' : ''}</h3>
          ${rec.length ? `<ul class="loc-list">${rec.map((r, i) => `<li><button class="loc-item" data-rec="${i}"><span class="flag">${flag(r.cc)}</span><span><b>${esc(r.name)}</b><small>${esc([r.admin1, r.country].filter(Boolean).join(', '))}</small></span></button></li>`).join('')}</ul>`
            : '<p class="muted small">Keine letzten Suchen.</p>'}`;
        lists.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', () => choose(store.favorites[+b.dataset.fav])));
        lists.querySelectorAll('[data-rec]').forEach(b => b.addEventListener('click', () => choose(store.recents[+b.dataset.rec])));
        lists.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { store.removeFavorite(store.favorites[+b.dataset.del]); renderLists(); }));
        lists.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => { store.moveFavorite(+b.dataset.up, -1); renderLists(); }));
        lists.querySelectorAll('[data-down]').forEach(b => b.addEventListener('click', () => { store.moveFavorite(+b.dataset.down, 1); renderLists(); }));
        lists.querySelector('[data-clear-rec]')?.addEventListener('click', () => { store.clearRecents(); renderLists(); });
      };
      renderLists();

      let seq = 0;
      const doSearch = debounce(async q => {
        const my = ++seq;
        if (q.trim().length < 2) { results.innerHTML = ''; lists.hidden = false; return; }
        results.innerHTML = '<p class="loading-text small"><span class="spinner"></span> Suche …</p>';
        try {
          const list = await searchPlaces(q);
          if (my !== seq) return;
          lists.hidden = true;
          results.innerHTML = list.length
            ? `<ul class="loc-list">${list.map((r, i) => `<li><button class="loc-item" data-res="${i}"><span class="flag">${flag(r.cc)}</span><span><b>${esc(r.name)}</b><small>${esc([r.admin2 !== r.name ? r.admin2 : '', r.admin1, r.country].filter(Boolean).join(', '))}</small></span></button>
                <button class="icon-btn sm star-btn ${store.isFavorite(r) ? 'on' : ''}" data-star="${i}" aria-label="Als Favorit speichern">★</button></li>`).join('')}</ul>`
            : `<p class="muted">Kein Ort mit „${esc(q)}“ gefunden.</p>`;
          results.querySelectorAll('[data-res]').forEach(b => b.addEventListener('click', () => choose(list[+b.dataset.res])));
          results.querySelectorAll('[data-star]').forEach(b => b.addEventListener('click', () => {
            const on = store.toggleFavorite(list[+b.dataset.star]);
            b.classList.toggle('on', on);
            renderLists();
          }));
        } catch (e) {
          if (my !== seq) return;
          results.innerHTML = `<p class="error-text">Suche fehlgeschlagen: ${esc(e.offline ? 'keine Internetverbindung' : e.message)}</p>`;
        }
      }, 300);
      input.addEventListener('input', () => doSearch(input.value));
      body.querySelector('form').addEventListener('submit', e => { e.preventDefault(); doSearch(input.value); input.blur(); });
      body.querySelector('[data-gps]')?.addEventListener('click', () => { closeSheet(); onGps(); });
      // Auf Desktop/iPad mit Tastatur direkt fokussieren
      if (window.matchMedia('(pointer: fine)').matches) setTimeout(() => input.focus(), 100);
    }
  });
}
