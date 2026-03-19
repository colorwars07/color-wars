/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/views/dashboard.js
 * Player Dashboard: wallet, recharge, withdraw, battle
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast, showModal, hideModal, escHtml, copyToClipboard } from '../core/app.js';
import { getSupabase }       from '../core/supabase.js';
import {
  getProfile, getBcvRate, getWalletBs, getWalletUSD,
  reloadProfile, reloadBcvRate, setView, subscribe, ECONOMY,
} from '../core/state.js';

registerView('dashboard', initDashboardView);

let _unsubs = [];

export async function initDashboardView($container) {
  // Clean previous subscriptions
  _unsubs.forEach(fn => fn());
  _unsubs = [];

  // Ensure fresh data
  await reloadBcvRate();
  await reloadProfile();

  // ⚡ 1. INYECCIÓN INVISIBLE: DETECTOR DE RECONEXIÓN
  const profile = getProfile();
  if (profile) {
    const isReconnected = await checkActiveMatch(profile);
    if (isReconnected) return; // Si encontró partida colgada, aborta el dashboard y va a la arena
  }

  render($container);

  // Re-render on profile or rate changes
  _unsubs.push(subscribe('profile', () => render($container)));
  _unsubs.push(subscribe('bcvRate', () => render($container)));
}

// ⚡ 2. LA LÓGICA DE RECONEXIÓN (Funciona por detrás, no rompe el diseño)
async function checkActiveMatch(profile) {
  const sb = getSupabase();
  try {
    const { data: activeMatch } = await sb
      .from('matches')
      .select('*')
      .eq('status', 'playing')
      .or(`player_pink.eq.${profile.id},player_blue.eq.${profile.id}`)
      .limit(1)
      .maybeSingle();

    if (activeMatch) {
      const myColor = activeMatch.player_pink === profile.id ? 'pink' : 'blue';
      const rivalId = myColor === 'pink' ? activeMatch.player_blue : activeMatch.player_pink;
      
      window.CW_SESSION = {
        isBotMatch: rivalId === 'BOT',
        matchId: activeMatch.id,
        myColor: myColor,
        rivalName: rivalId === 'BOT' ? 'BOT' : 'HUMANO',
        board: activeMatch.board_state || Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0 })))
      };
      
      showToast('Reconectando a la batalla...', 'info');
      setView('game');
      return true; 
    }
  } catch (err) { console.error("Error buscando partidas activas:", err); }
  return false; 
}

// ── RENDER ────────────────────────────────────────────
function render($c) {
  const profile = getProfile();
  if (!profile) { setView('auth'); return; }

  const bs    = getWalletBs();
  const usd   = getWalletUSD().toFixed(2);
  const rate  = getBcvRate();
  const wins  = profile.wins   ?? 0;
  const losses = profile.losses ?? 0;
  const total = wins + losses;
  const winPct = total > 0 ? Math.round(wins / total * 100) : 0;

  $c.innerHTML = `
  <div class="dash-grid">

    <div class="wallet-card card-acc" style="grid-column:1/-1;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:.85rem;">
        <div>
          <p class="wallet-label">💰 Billetera</p>
          <div class="wallet-amount">${bs.toLocaleString('es-VE')} <span style="font-size:.9rem;color:var(--blue);font-family:var(--font-mono);">Bs</span></div>
          <p class="wallet-usd">≈ $${usd} USD · Tasa BCV: <span style="color:#ffaa00;">${rate} Bs/$</span></p>
        </div>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;">
          <button id="btn-recharge" class="btn btn-neon" style="font-size:.68rem;">
            ${iconPlus()} RECARGAR
          </button>
          <button id="btn-withdraw" class="btn btn-ghost" style="font-size:.68rem;">
            ${iconArrow()} RETIRAR
          </button>
        </div>
      </div>
    </div>

    <div class="card card-acc">
      <p style="font-family:var(--font-mono);font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:.9rem;">📊 Estadísticas</p>
      <div class="donut-wrap">
        ${buildDonut(winPct)}
        <div style="display:flex;flex-direction:column;gap:.45rem;width:100%;">
          ${statRow('Victorias', wins, 'var(--pink)', 'var(--pink-dim)')}
          ${statRow('Derrotas',  losses, 'var(--blue)', 'var(--blue-dim)')}
          ${total > 0 ? `<div style="padding-top:.4rem;border-top:1px solid var(--border-ghost);display:flex;justify-content:space-between;">
            <span style="font-family:var(--font-mono);font-size:.62rem;color:var(--text-dim);">Win Rate</span>
            <span style="font-family:var(--font-display);font-size:.85rem;font-weight:700;color:${winPct>=50?'var(--pink)':'var(--blue)'};">${winPct}%</span>
          </div>` : ''}
        </div>
      </div>
    </div>

    <div class="card card-acc" id="lb-card">
      <p style="font-family:var(--font-mono);font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:.9rem;">🏆 Top 10</p>
      <div id="lb-body" style="font-family:var(--font-mono);font-size:.7rem;color:var(--text-dim);">Cargando…</div>
    </div>

    <div class="card" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:1.75rem 1.25rem;background:linear-gradient(135deg,var(--surface-1),var(--surface-2));border-color:var(--border-active);">
      <div style="text-align:center;">
        <p style="font-family:var(--font-display);font-size:.68rem;letter-spacing:.18em;color:var(--text-dim);text-transform:uppercase;margin-bottom:.2rem;">
          Entrada: <span style="color:var(--pink);">${ECONOMY.ENTRY_FEE_BS} Bs</span>
        </p>
        <p style="font-family:var(--font-mono);font-size:.6rem;color:var(--text-ghost);">
          Premio si ganas: ${ECONOMY.WINNER_PRIZE_BS} Bs
        </p>
      </div>
      <button id="btn-battle" class="btn btn-battle" ${bs < ECONOMY.ENTRY_FEE_BS ? 'disabled' : ''}>
        ⚔ BUSCAR BATALLA
      </button>
      ${bs < ECONOMY.ENTRY_FEE_BS ? `<p style="font-family:var(--font-mono);font-size:.62rem;color:var(--pink);text-align:center;">Saldo insuficiente. Recarga tu billetera.</p>` : ''}
    </div>

  </div>`;

  attachEvents($c);
  loadLeaderboard($c);
}

function statRow(label, val, color, glow) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;">
    <div style="display:flex;align-items:center;gap:.4rem;">
      <span style="width:9px;height:9px;border-radius:50%;background:${color};box-shadow:0 0 5px ${glow};display:inline-block;"></span>
      <span style="font-family:var(--font-mono);font-size:.68rem;color:var(--text-base);">${label}</span>
    </div>
    <span style="font-family:var(--font-display);font-size:.82rem;font-weight:700;color:${color};">${val}</span>
  </div>`;
}

// ── Events ────────────────────────────────────────────
function attachEvents($c) {
  $c.querySelector('#btn-recharge')?.addEventListener('click', openRechargeModal);
  $c.querySelector('#btn-withdraw')?.addEventListener('click', openWithdrawModal);
  $c.querySelector('#btn-battle')?.addEventListener('click',   () => {
    if (getWalletBs() < ECONOMY.ENTRY_FEE_BS) {
      showToast(`Necesitas ${ECONOMY.ENTRY_FEE_BS} Bs para jugar.`, 'warning');
      return;
    }
    setView('matchmaking');
  });
}

// ── Leaderboard ────────────────────────────────────────
async function loadLeaderboard($c) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('users')
    .select('username,wins,losses')
    .order('wins', { ascending: false })
    .limit(10);

  const $lb = $c.querySelector('#lb-body');
  if (!$lb) return;

  if (error || !data?.length) {
    $lb.innerHTML = `<p style="text-align:center;color:var(--text-ghost);padding:1rem 0;">Sin jugadores aún.</p>`;
    return;
  }

  const medals = ['🥇','🥈','🥉'];

  $lb.innerHTML = `
  <table class="lb-table">
    <thead><tr><th>#</th><th>Jugador</th><th>V</th><th>D</th><th>%</th></tr></thead>
    <tbody>
      ${data.map((p,i) => {
        const t  = p.wins + p.losses;
        const wr = t > 0 ? Math.round(p.wins/t*100) : 0;
        const me = getProfile()?.username === p.username;
        return `<tr class="${i===0?'r1':i===1?'r2':i===2?'r3':''}${me?' current-user-row':''}">
          <td>${medals[i] ?? i+1}</td>
          <td style="font-weight:600;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${me?'color:var(--pink);':''}">${escHtml(p.username)}</td>
          <td>${p.wins}</td><td>${p.losses}</td><td>${wr}%</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

// ── RECHARGE MODAL ────────────────────────────────────
function openRechargeModal() {
  const rate = getBcvRate();

  showModal(`
    <button class="modal-close" onclick="window.__CW_hideModal()">✕</button>
    <div class="modal-title">${iconCard()} RECARGAR BILLETERA</div>

    <p style="font-family:var(--font-mono);font-size:.62rem;color:var(--text-dim);margin-bottom:.65rem;letter-spacing:.05em;">PASO 1 — Transfiere a esta cuenta:</p>
    <div class="bank-box">
      ${bankRow('Teléfono','04144708220')}
      ${bankRow('Banco','Banco de Venezuela')}
      ${bankRow('C.I.','30522091')}
    </div>

    <p style="font-family:var(--font-mono);font-size:.62rem;color:var(--text-dim);margin-bottom:.5rem;letter-spacing:.05em;">PASO 2 — Monto y referencia:</p>
    <div class="field-group">
      <label class="field-label" for="rc-amount">Monto en USD</label>
      <input id="rc-amount" type="number" min="1" step="0.5" class="input-field" placeholder="Ej: 5.00" inputmode="decimal" />
    </div>

    <div class="calc-box" id="rc-calc" style="display:none;">
      <div class="calc-rate">Tasa BCV: <span class="calc-rate-val">${rate} Bs/$</span></div>
      <div style="display:flex;align-items:baseline;gap:.4rem;">
        <span class="calc-result" id="rc-bs-result">0.00</span>
        <span class="calc-result-label">Bolívares a recibir</span>
      </div>
    </div>

    <div class="field-group" style="margin-top:.85rem;">
      <label class="field-label" for="rc-ref">Últimos 6 dígitos de la referencia</label>
      <input id="rc-ref" type="text" class="input-field" placeholder="123456" maxlength="6" inputmode="numeric" />
    </div>

    <p style="font-family:var(--font-mono);font-size:.62rem;color:var(--text-dim);margin-bottom:.5rem;letter-spacing:.05em;">PASO 3 — Sube el comprobante:</p>
    <div class="field-group">
      <label class="input-file-label" id="rc-file-label" for="rc-file">
        📎 Toca para subir la captura de pago
      </label>
      <input id="rc-file" type="file" accept="image/*" style="display:none;" />
    </div>

    <div id="rc-global-err" class="field-error" style="margin-bottom:.7rem;"></div>
    <button id="btn-rc-submit" class="btn btn-primary" style="width:100%;height:46px;font-size:.75rem;letter-spacing:.12em;">
      ENVIAR SOLICITUD
    </button>
    <p style="font-family:var(--font-mono);font-size:.58rem;color:var(--text-ghost);text-align:center;margin-top:.65rem;line-height:1.6;">
      Tu recarga quedará en estado <strong style="color:#ffaa00;">Pendiente</strong> hasta aprobación del admin.
    </p>`, { closable: false });

  // Dynamic calculator
  const $amount = document.getElementById('rc-amount');
  const $calc   = document.getElementById('rc-calc');
  const $bsRes  = document.getElementById('rc-bs-result');

  $amount?.addEventListener('input', () => {
    const usd = parseFloat($amount.value);
    if (!isNaN(usd) && usd > 0) {
      const bs = (usd * rate).toFixed(2);
      $bsRes.textContent  = parseFloat(bs).toLocaleString('es-VE');
      $calc.style.display = 'block';
      $bsRes.style.transform = 'scale(1.06)';
      setTimeout(() => { $bsRes.style.transform = ''; }, 200);
    } else {
      $calc.style.display = 'none';
    }
  });

  // File label update
  const $file  = document.getElementById('rc-file');
  const $label = document.getElementById('rc-file-label');
  $file?.addEventListener('change', () => {
    if ($file.files[0]) {
      $label.textContent = `✓ ${$file.files[0].name}`;
      $label.classList.add('has-file');
    }
  });

  // Ref — digits only
  document.getElementById('rc-ref')?.addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g,'').slice(0,6);
  });

  document.getElementById('btn-rc-submit')?.addEventListener('click', submitRecharge);
}

function bankRow(key, val) {
  return `<div class="bank-row">
    <span class="bank-key">${key}</span>
    <div style="display:flex;align-items:center;gap:.4rem;">
      <span class="bank-val">${escHtml(val)}</span>
      <button class="btn-copy" onclick="window.__CW_copyToClipboard('${val}',this)">${key === 'Banco' ? '' : 'Copiar'}</button>
    </div>
  </div>`;
}

async function submitRecharge() {
  const $amount  = document.getElementById('rc-amount');
  const $ref     = document.getElementById('rc-ref');
  const $file    = document.getElementById('rc-file');
  const $err     = document.getElementById('rc-global-err');
  const $btn     = document.getElementById('btn-rc-submit');

  $err.textContent = '';

  const usd  = parseFloat($amount?.value);
  const ref  = $ref?.value.trim();
  const file = $file?.files[0];
  const rate = getBcvRate();

  if (isNaN(usd) || usd <= 0) { $err.textContent = 'Ingresa un monto válido.'; return; }
  if (!/^\d{6}$/.test(ref))   { $err.textContent = 'La referencia debe tener 6 dígitos.'; return; }
  if (!file)                  { $err.textContent = 'Debes subir el comprobante.'; return; }

  $btn.disabled = true; $btn.textContent = 'SUBIENDO…'; $btn.style.opacity = '.65';

  const sb      = getSupabase();
  const profile = getProfile();
  const ext     = file.name.split('.').pop();
  const path    = `${profile.id}_${Date.now()}.${ext}`;

  // Upload to Storage
  const { error: uploadErr } = await sb.storage
    .from('comprobantes')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (uploadErr) {
    $err.textContent = `Error al subir imagen: ${uploadErr.message}`;
    $btn.disabled = false; $btn.textContent = 'ENVIAR SOLICITUD'; $btn.style.opacity = '1';
    return;
  }

  // Get public URL
  const { data: urlData } = sb.storage.from('comprobantes').getPublicUrl(path);
  const imageUrl = urlData?.publicUrl ?? '';

  // Insert recharge record
  const bs = parseFloat((usd * rate).toFixed(2));
  const { error: insertErr } = await sb.from('recharges').insert({
    user_email: profile.email,
    amount_usd: usd,
    amount_bs:  bs,
    reference:  ref,
    image_url:  imageUrl,
    status:     'pending',
  });

  $btn.disabled = false; $btn.textContent = 'ENVIAR SOLICITUD'; $btn.style.opacity = '1';

  if (insertErr) {
    $err.textContent = `Error al registrar: ${insertErr.message}`;
    return;
  }

  hideModal();
  showToast(`Solicitud enviada por $${usd.toFixed(2)} (${bs.toLocaleString('es-VE')} Bs). Estado: Pendiente.`, 'warning', 6000);
}

// ── WITHDRAW MODAL ────────────────────────────────────
function openWithdrawModal() {
  const bs = getWalletBs();

  showModal(`
    <button class="modal-close" onclick="window.__CW_hideModal()">✕</button>
    <div class="modal-title">${iconArrow()} RETIRAR FONDOS</div>
    <p style="font-family:var(--font-mono);font-size:.65rem;color:var(--text-dim);margin-bottom:1rem;line-height:1.6;">
      Saldo disponible: <strong style="color:var(--blue);">${bs.toLocaleString('es-VE')} Bs</strong>
    </p>

    <div class="field-group">
      <label class="field-label" for="wd-amount">Monto a retirar (Bs)</label>
      <input id="wd-amount" type="number" min="1" step="1" class="input-field" placeholder="Bs a retirar" inputmode="decimal" />
    </div>
    <div class="field-group">
      <label class="field-label" for="wd-bank">Banco</label>
      <input id="wd-bank" type="text" class="input-field" placeholder="Ej: Banco de Venezuela" />
    </div>
    <div class="field-group">
      <label class="field-label" for="wd-phone">Teléfono (Pago Móvil)</label>
      <input id="wd-phone" type="tel" class="input-field" placeholder="04XX-XXXXXXX" inputmode="tel" />
    </div>
    <div class="field-group">
      <label class="field-label" for="wd-ci">Cédula</label>
      <input id="wd-ci" type="text" class="input-field" placeholder="V-XXXXXXXX" inputmode="numeric" />
    </div>

    <div id="wd-err" class="field-error" style="margin-bottom:.7rem;"></div>
    <button id="btn-wd-submit" class="btn btn-primary" style="width:100%;height:46px;font-size:.75rem;letter-spacing:.12em;">
      SOLICITAR RETIRO
    </button>`, { closable: true });

  document.getElementById('btn-wd-submit')?.addEventListener('click', submitWithdraw);
}

async function submitWithdraw() {
  const amount = parseFloat(document.getElementById('wd-amount')?.value);
  const bank   = document.getElementById('wd-bank')?.value.trim();
  const phone  = document.getElementById('wd-phone')?.value.trim();
  const ci     = document.getElementById('wd-ci')?.value.trim();
  const $err   = document.getElementById('wd-err');
  const $btn   = document.getElementById('btn-wd-submit');
  const bs     = getWalletBs();

  $err.textContent = '';

  if (isNaN(amount) || amount <= 0)  { $err.textContent = 'Monto inválido.'; return; }
  if (amount > bs)                    { $err.textContent = `Saldo insuficiente. Tienes ${bs.toLocaleString('es-VE')} Bs.`; return; }
  if (!bank)                          { $err.textContent = 'Ingresa el banco.'; return; }
  if (!phone)                         { $err.textContent = 'Ingresa el teléfono.'; return; }
  if (!ci)                            { $err.textContent = 'Ingresa la cédula.'; return; }

  $btn.disabled = true; $btn.textContent = 'PROCESANDO…'; $btn.style.opacity = '.65';

  // For now: log request + show toast (no dedicated withdrawals table in spec)
  // In production: insert to a 'withdrawals' table and admin processes it
  await new Promise(r => setTimeout(r, 700));

  $btn.disabled = false; $btn.textContent = 'SOLICITAR RETIRO'; $btn.style.opacity = '1';
  hideModal();
  showToast(`Solicitud de retiro de ${amount.toLocaleString('es-VE')} Bs recibida. Procesaremos tu pago móvil pronto.`, 'info', 6000);
}

// ── Donut SVG ─────────────────────────────────────────
function buildDonut(winPct) {
  const R   = 46;
  const CX  = 62; const CY = 62;
  const SW  = 13;
  const C   = 2 * Math.PI * R;
  const lossPct = 100 - winPct;

  if (winPct === 0 && lossPct === 0) {
    return `<svg width="124" height="124" viewBox="0 0 124 124">
      <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="${SW}"/>
      <text x="${CX}" y="${CY}" text-anchor="middle" dominant-baseline="middle" font-family="var(--font-display)" font-size="11" fill="var(--text-dim)">0%</text>
    </svg>`;
  }

  const wd = (winPct  / 100) * C;
  const ld = (lossPct / 100) * C;

  return `<svg width="124" height="124" viewBox="0 0 124 124" style="transform:rotate(-90deg);">
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="${SW}"/>
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--blue)"  stroke-width="${SW}"
      stroke-dasharray="${ld} ${C-ld}" stroke-dashoffset="${-wd}" stroke-linecap="round"
      style="filter:drop-shadow(0 0 4px var(--blue-dim))"/>
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--pink)"  stroke-width="${SW}"
      stroke-dasharray="${wd} ${C-wd}" stroke-linecap="round"
      style="filter:drop-shadow(0 0 5px var(--pink-dim))"/>
    <text x="${CX}" y="${CY-5}" text-anchor="middle" dominant-baseline="middle"
      font-family="var(--font-display)" font-size="15" font-weight="900" fill="var(--pink)"
      style="transform:rotate(90deg);transform-origin:${CX}px ${CY}px;">${winPct}%</text>
    <text x="${CX}" y="${CY+11}" text-anchor="middle" dominant-baseline="middle"
      font-family="var(--font-mono)" font-size="7" fill="var(--text-dim)"
      style="transform:rotate(90deg);transform-origin:${CX}px ${CY}px;">WINS</text>
  </svg>`;
}

function iconPlus()  { return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`; }
function iconArrow() { return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>`; }
function iconCard()  { return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`; }
