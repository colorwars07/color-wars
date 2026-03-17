/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/views/matchmaking.js
 * Pantalla de espera, cuenta regresiva y puente al juego
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast } from '../core/app.js';
import { getProfile, setView, initGame, getBcvRate } from '../core/state.js';

registerView('matchmaking', initMatchmaking);

let _searchTimer = null;
let _countdownTimer = null;

export async function initMatchmaking($container) {
  const profile = getProfile();
  if (!profile) { setView('auth'); return; }

  // Verificación extra de seguridad
  if (profile.wallet_bs < 200) {
    showToast('Saldo insuficiente', 'error');
    setView('dashboard');
    return;
  }

  renderSearchScreen($container);
  startSearch($container);
}

function renderSearchScreen($c) {
  $c.innerHTML = `
  <div class="mm-screen">
    <div style="display:flex; flex-direction:column; align-items:center; gap:2rem;">
      <div class="mm-ring">
        <span style="font-family:var(--font-display); font-size:1.5rem; color:var(--text-bright);">⚔️</span>
      </div>
      
      <div style="text-align:center;">
        <h2 style="font-family:var(--font-display); font-size:1.2rem; letter-spacing:0.2em; color:var(--text-bright); margin-bottom:0.5rem;">BUSCANDO RIVAL</h2>
        <p style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim); text-transform:uppercase;">Conectando con la arena...</p>
      </div>

      <div style="display:flex; gap:0.5rem;">
        <div class="spinner" style="width:10px; height:10px; border-width:1px; border-top-color:var(--pink);"></div>
        <div class="spinner" style="width:10px; height:10px; border-width:1px; border-top-color:var(--blue); animation-delay:0.2s;"></div>
        <div class="spinner" style="width:10px; height:10px; border-width:1px; border-top-color:var(--pink); animation-delay:0.4s;"></div>
      </div>

      <button id="btn-cancel-search" class="btn btn-ghost" style="margin-top:2rem;">✕ CANCELAR</button>
    </div>
  </div>`;

  $c.querySelector('#btn-cancel-search').addEventListener('click', cancelSearch);
}

function startSearch($c) {
  // Simulamos búsqueda por 3 segundos
  _searchTimer = setTimeout(() => {
    renderCountdownScreen($c);
    startCountdown($c);
  }, 3000);
}

function cancelSearch() {
  clearTimeout(_searchTimer);
  clearTimeout(_countdownTimer);
  setView('dashboard');
}

function renderCountdownScreen($c) {
  $c.innerHTML = `
  <div class="mm-screen">
    <div style="display:flex; flex-direction:column; align-items:center; gap:1.5rem;">
      
      <div style="width:180px; height:180px; border-radius:50%; border:2px solid var(--border-ghost); display:flex; align-items:center; justify-content:center; position:relative;">
        <svg style="position:absolute; inset:-2px; width:184px; height:184px; transform:rotate(-90deg);">
          <circle cx="92" cy="92" r="90" fill="none" stroke="url(#tor-grad)" stroke-width="3" stroke-dasharray="565" stroke-dashoffset="0" style="transition: stroke-dashoffset 1s linear;"></circle>
          <defs>
            <linearGradient id="tor-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="var(--purple)" />
              <stop offset="50%" stop-color="var(--blue)" />
              <stop offset="100%" stop-color="var(--pink)" />
            </linearGradient>
          </defs>
        </svg>
        <span id="mm-count" class="mm-countdown">10</span>
      </div>

      <div style="text-align:center;">
        <h2 style="font-family:var(--font-display); font-size:1.4rem; letter-spacing:0.1em; color:var(--text-bright); margin-bottom:0.5rem;">¡RIVAL ENCONTRADO!</h2>
        <p style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim); text-transform:uppercase;">La batalla comienza en...</p>
      </div>

      <div class="card" style="width:100%; max-width:280px; padding:1rem; border-color:var(--pink);">
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
          <span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim);">Entrada:</span>
          <span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--pink); font-weight:bold;">200 Bs</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim);">Si ganas:</span>
          <span style="font-family:var(--font-mono); font-size:0.8rem; color:#00b86c; font-weight:bold;">+320 Bs</span>
        </div>
      </div>

      <button id="btn-cancel-countdown" class="btn btn-ghost" style="margin-top:1rem;">✕ CANCELAR</button>
    </div>
  </div>`;

  $c.querySelector('#btn-cancel-countdown').addEventListener('click', cancelSearch);
}

function startCountdown($c) {
  let count = 10;
  const $count = $c.querySelector('#mm-count');
  const $circle = $c.querySelector('circle');
  
  _countdownTimer = setInterval(async () => {
    count--;
    if ($count) $count.textContent = count;
    if ($circle) $circle.style.strokeDashoffset = 565 - (565 * (count / 10));

    if (count <= 0) {
      clearInterval(_countdownTimer);
      
      // ⚡ EL PUENTE REPARADO: Iniciamos el juego ANTES de cambiar la vista
      try {
        await initGame(); // Prepara el tablero y descuenta el saldo internamente
        setView('game');  // Ahora sí, saltamos a la arena de forma segura
      } catch (err) {
        showToast('Error al conectar con la arena', 'error');
        setView('dashboard');
      }
    }
  }, 1000);
}
