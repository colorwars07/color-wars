/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/matchmaking.js
 * Matchmaking: 35s search → bot fallback → arena
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast, formatTime, sleep } from '../core/app.js';
import { getSupabase }    from '../core/supabase.js';
import {
  setView, setMatchmakingPhase,
  getProfile, setProfile,
  getWalletBs, ECONOMY,
} from '../core/state.js';

registerView('matchmaking', initMatchmakingView);

const TOTAL_SEARCH_SECS   = 35;
const COUNTDOWN_START     = 25; // show countdown after this second

let _timer     = null;
let _cancelled = false;

export async function initMatchmakingView($container) {
  _cancelled = false;
  clearTimer();
  renderPhase($container, 'searching', TOTAL_SEARCH_SECS);
  runFlow($container);
}

// ── FLOW ───────────────────────────────────────────────
async function runFlow($container) {
  let elapsed = 0;

  await new Promise((resolve) => {
    _timer = setInterval(() => {
      if (_cancelled) { clearInterval(_timer); resolve(); return; }

      elapsed++;
      const remaining = TOTAL_SEARCH_SECS - elapsed;

      if (elapsed >= COUNTDOWN_START) {
        // Show visible countdown
        renderPhase($container, 'countdown', remaining);
      }

      if (elapsed >= TOTAL_SEARCH_SECS) {
        clearInterval(_timer);
        resolve();
      }
    }, 1000);
  });

  if (_cancelled) return;

  // ── Deduct entry fee (Blindado) ──────────────────────────────
  const profile = getProfile();
  if (!profile) { setView('auth'); return; }

  const currentBs = getWalletBs();
  if (currentBs < ECONOMY.ENTRY_FEE_BS) {
    showToast(`Saldo insuficiente: ${currentBs} Bs (necesitas ${ECONOMY.ENTRY_FEE_BS} Bs).`, 'error');
    setView('dashboard');
    return;
  }

  renderPhase($container, 'launching', 0);

  const sb     = getSupabase();
  const newBs  = currentBs - ECONOMY.ENTRY_FEE_BS;

  const { error } = await sb
    .from('users')
    .update({ wallet_bs: newBs })
    .eq('id', profile.id);

  if (error) {
    showToast(`Error al descontar entrada: ${error.message}`, 'error');
    setView('dashboard');
    return;
  }

  // Optimistic update
  setProfile({ ...profile, wallet_bs: newBs });

  showToast(`-${ECONOMY.ENTRY_FEE_BS} Bs descontados. ¡A batallar!`, 'warning', 3000);
  await sleep(700);

  if (!_cancelled) setView('game');
}

// ── RENDER ─────────────────────────────────────────────
function renderPhase($c, phase, remaining) {
  if (phase === 'searching') {
    $c.innerHTML = `
    <div class="mm-screen">
      <div style="display:flex;flex-direction:column;align-items:center;gap:1.85rem;text-align:center;padding:1.5rem;">

        <div style="position:relative;width:128px;height:128px;">
          <svg viewBox="0 0 128 128" width="128" height="128"
            style="position:absolute;inset:0;animation:spin-cw 1.1s linear infinite;">
            <defs>
              <linearGradient id="mmG" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stop-color="#7000FF"/>
                <stop offset="50%"  stop-color="#00E5FF"/>
                <stop offset="100%" stop-color="#FF007F"/>
              </linearGradient>
            </defs>
            <circle cx="64" cy="64" r="54" fill="none" stroke="url(#mmG)" stroke-width="3"
              stroke-dasharray="240 100" stroke-linecap="round"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
            <span style="font-size:1.8rem;">⚔</span>
          </div>
        </div>

        <div>
          <p style="font-family:var(--font-display);font-size:.88rem;font-weight:700;letter-spacing:.2em;color:var(--text-bright);text-transform:uppercase;animation:blink 1.2s ease-in-out infinite;">
            BUSCANDO RIVAL
          </p>
          <p style="font-family:var(--font-mono);font-size:.65rem;color:var(--text-dim);margin-top:.4rem;letter-spacing:.08em;">
            Conectando con la arena…
          </p>
        </div>

        <div style="display:flex;gap:7px;">
          ${[0,1,2].map(i=>`<div style="width:8px;height:8px;border-radius:50%;background:var(--purple);box-shadow:0 0 5px var(--purple-dim);animation:dot-b 1.2s ease-in-out infinite;animation-delay:${i*.2}s;"></div>`).join('')}
        </div>

        <button id="btn-cancel-mm" class="btn btn-ghost" style="font-size:.62rem;letter-spacing:.1em;margin-top:.25rem;">
          ✕ Cancelar
        </button>

      </div>
    </div>
    <style>
      @keyframes spin-cw{to{transform:rotate(360deg)}}
      @keyframes dot-b{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1.2);opacity:1}}
    </style>`;

    $c.querySelector('#btn-cancel-mm')?.addEventListener('click', cancelMatchmaking);
    return;
  }

  if (phase === 'countdown') {
    const $num = $c.querySelector('#mm-num');
    if ($num) {
      $num.textContent = remaining;
      $num.style.transform = 'scale(1.15)';
      setTimeout(() => { $num.style.transform = ''; }, 150);
      return;
    }

    $c.innerHTML = `
    <div class="mm-screen">
      <div style="display:flex;flex-direction:column;align-items:center;gap:1.85rem;text-align:center;padding:1.5rem;">

        <div style="position:relative;">
          <div class="mm-ring">
            <span id="mm-num" class="mm-countdown" style="transition:transform .15s;">${remaining}</span>
          </div>
          <div style="position:absolute;inset:-10px;border-radius:50%;border:1px solid var(--purple);animation:ring-expand 1s ease-out infinite;pointer-events:none;"></div>
        </div>

        <div>
          <p style="font-family:var(--font-display);font-size:.95rem;font-weight:700;letter-spacing:.18em;color:var(--text-bright);text-transform:uppercase;">
            ¡RIVAL ENCONTRADO!
          </p>
          <p style="font-family:var(--font-mono);font-size:.65rem;color:var(--text-dim);margin-top:.4rem;letter-spacing:.08em;">
            La batalla comienza en…
          </p>
        </div>

        <div style="background:rgba(255,0,127,.08);border:1px solid rgba(255,0,127,.25);border-radius:var(--r-md);padding:.7rem 1.2rem;font-family:var(--font-mono);font-size:.7rem;line-height:1.9;text-align:left;">
          <div style="display:flex;justify-content:space-between;gap:1.5rem;">
            <span style="color:var(--text-dim);">Entrada:</span>
            <span style="color:var(--pink);font-weight:700;">${ECONOMY.ENTRY_FEE_BS} Bs</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:1.5rem;">
            <span style="color:var(--text-dim);">Si ganas:</span>
            <span style="color:#00b86c;font-weight:700;">+${ECONOMY.WINNER_PRIZE_BS} Bs</span>
          </div>
        </div>

        <button id="btn-cancel-mm" class="btn btn-ghost" style="font-size:.62rem;letter-spacing:.1em;">
          ✕ Cancelar
        </button>

      </div>
    </div>
    <style>@keyframes ring-expand{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.35);opacity:0}}</style>`;

    $c.querySelector('#btn-cancel-mm')?.addEventListener('click', cancelMatchmaking);
    return;
  }

  if (phase === 'launching') {
    $c.innerHTML = `
    <div class="mm-screen">
      <div style="text-align:center;padding:2rem;">
        <p style="font-family:var(--font-display);font-size:2.2rem;font-weight:900;letter-spacing:.2em;background:var(--gradient-tor);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:flicker .4s linear 3;">
          ¡A BATALLAR!
        </p>
        <p style="font-family:var(--font-mono);font-size:.68rem;color:var(--text-dim);margin-top:.65rem;letter-spacing:.1em;">
          Preparando el tablero…
        </p>
      </div>
    </div>`;
  }
}

// ── Cancel ─────────────────────────────────────────────
function cancelMatchmaking() {
  _cancelled = true;
  clearTimer();
  setMatchmakingPhase(null, 0);
  showToast('Búsqueda cancelada.', 'info');
  setView('dashboard');
}

function clearTimer() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}
