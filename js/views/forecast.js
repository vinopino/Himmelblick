// Vorhersage: Stunden (48 h) und Tage (7/10/14)
import { store } from '../store.js';
import { current, todayIndex, dayAt, hoursFrom } from '../model.js';
import { hourStrip, dayList, mountTempChart, dayTrendChart } from '../charts.js';
import { showHour, showDay } from './details.js';
import { tempUnitLabel } from '../format.js';

export function renderForecast(root) {
  const fc = store.data.forecast;
  if (!fc) {
    root.innerHTML = `<p class="loading-text">${store.meta.error ? 'Keine Prognosedaten verfügbar. Bitte später erneut versuchen.' : '<span class="spinner"></span> Prognose wird geladen …'}</p>`;
    return;
  }
  const c = current(fc);
  const ti = todayIndex(fc);
  const nDays = store.settings.forecastDays;
  const days = [];
  for (let i = ti; i < ti + nDays; i++) { const d = dayAt(fc, i); if (d) days.push(d); }
  const hours48 = hoursFrom(fc, c.hourIndex, 48);

  root.innerHTML = `
    <h1 class="view-title">Vorhersage</h1>
    <section class="card hours-card">
      <header class="card-h"><h2>Stundenprognose</h2><span class="muted">48 Stunden</span></header>
      ${hourStrip(hours48, { nowIso: fc.hourly.time[c.hourIndex] })}
    </section>

    <section class="card chart-card">
      <header class="card-h"><h2>Temperaturverlauf</h2><span class="muted">${tempUnitLabel()} · antippen für Details</span></header>
      <div id="tchart"></div>
    </section>

    <section class="card trend-card">
      <header class="card-h"><h2>Temperaturtrend</h2><span class="muted">${days.length} Tage · antippen für Details</span></header>
      ${dayTrendChart(days, { todayIso: dayAt(fc, ti)?.iso })}
    </section>

    <section class="card days-card">
      <header class="card-h"><h2>Tagesprognose</h2>
        <div class="segmented" role="tablist" aria-label="Zeitraum">
          ${[7, 10, 14].map(n => `<button role="tab" data-days="${n}" aria-selected="${n === nDays}" class="${n === nDays ? 'active' : ''}">${n} Tage</button>`).join('')}
        </div>
      </header>
      ${dayList(days, { todayIso: dayAt(fc, ti)?.iso })}
      ${days.length < nDays ? `<p class="muted small">Für diesen Ort sind nur ${days.length} Tage verfügbar.</p>` : ''}
      <p class="source-note"><b>Hinweis zur Genauigkeit:</b> Die ersten 3 Tage sind meist zuverlässig, Tag 4–7 gut. Ab Tag 8 (mit ± markiert) zeigen die Werte nur noch die Tendenz. Modellprognosen: Open-Meteo, Best-Match.</p>
    </section>`;

  mountTempChart(root.querySelector('#tchart'), hours48);
  root.querySelectorAll('[data-hour]').forEach(b => b.addEventListener('click', () => showHour(fc, +b.dataset.hour)));
  root.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => showDay(fc, +b.dataset.day)));
  root.querySelectorAll('[data-days]').forEach(b => b.addEventListener('click', () => {
    store.setSetting('forecastDays', +b.dataset.days);
    renderForecast(root);
  }));
}
