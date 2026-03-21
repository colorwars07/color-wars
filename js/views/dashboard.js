/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/views/dashboard.js
 * DASHBOARD C/ ESCUDO ANTI-RECONEXIÓN
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
  _unsubs.forEach(fn => fn()); _unsubs = [];
  await reloadBcvRate(); await reloadProfile();

  // 🛡️ REVISIÓN DEL ESCUDO
  if (window.sessionStorage.getItem('cw_skip_recon')) {
      // Si el escudo está activo, lo apagamos para el futuro y OMITIMOS buscar partidas viejas
      window.sessionStorage.removeItem('cw_skip_recon');
  } else {
      // Si entraste normal a la app (recargaste la página), sí busca reconectarte
      const profile = getProfile();
      if (profile) {
        const isReconnected = await checkActiveMatch(profile);
        if (isReconnected) return; 
      }
  }

  injectStoreStyles();
  render($container);
  _unsubs.push(subscribe('profile', () => render($container)));
  _unsubs.push(subscribe('bcvRate', () => render($container)));
}

async function checkActiveMatch(profile) {
  const sb = getSupabase();
  try {
    const { data: activeMatch } = await sb.from('matches').select('*').eq('status', 'playing').or(`player_pink.eq.${profile.id},player_blue.eq.${profile.id}`).limit(1).maybeSingle();

    if (activeMatch) {
      const startTime = new Date(activeMatch.match_start_time).getTime();
      const ageMinutes = (Date.now() - startTime) / 1000 / 60;
      if (ageMinutes > 4) { await sb.from('matches').update({status: 'cancelled'}).eq('id', activeMatch.id); return false; }

      const myColor = activeMatch.player_pink === profile.id ? 'pink' : 'blue';
      const rivalId = myColor === 'pink' ? activeMatch.player_blue : activeMatch.player_pink;
      
      window.CW_SESSION = {
        isBotMatch: rivalId === 'BOT', matchId: activeMatch.id, myColor: myColor,
        rivalName: rivalId === 'BOT' ? 'BOT' : 'HUMANO',
        board: activeMatch.board_state || Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0 })))
      };
      
      showToast('Reconectando a la batalla...', 'info'); setView('game'); return true; 
    }
  } catch (err) {}
  return false; 
}

function injectStoreStyles() {
  if (document.getElementById('cw-store-styles')) return;
  const style = document.createElement('style'); style.id = 'cw-store-styles';
  style.innerHTML = `
    .cp-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 15px; margin-bottom: 15px; }
    .cp-card { background: linear-gradient(145deg, #11111a, #1a1a2e); border: 1px solid var(--border-ghost); border-radius: 15px; padding: 15px 10px; text-align: center; cursor: pointer; position: relative; overflow: hidden; transition: all 0.3s; box-shadow: 0 5px 15px rgba(0,0,0,0.5); }
    .cp-card:hover, .cp-card:active { transform: translateY(-4px) scale(1.03); border-color: var(--card-color); box-shadow: 0 0 20px var(--card-color) inset, 0 10px 20px rgba(0,0,0,0.8); }
    .cp-crystal { font-size: 2.8rem; margin-bottom: 10px; display: inline-block; animation: float 3s ease-in-out infinite; filter: drop-shadow(0 0 12px var(--card-color)); }
    .cp-amount { font-family: var(--font-display); font-size: 1.3rem; font-weight: 900; color: white; letter-spacing: 1px; }
    .cp-price { font-family: var(--font-mono); font-size: 0.8rem; color: #fff; background: var(--card-color); padding: 4px 10px; border-radius: 8px; display: inline-block; margin-top: 8px; font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
    @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    .cp-logo-text { background: -webkit-linear-gradient(45deg, #00f0ff, #ff00ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    header .wallet, header .balance-usd, .top-bar-wallet { display: none !important; opacity: 0 !important; }
    .bank-option { padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); color: white; font-family: var(--font-mono); font-size: 0.75rem; text-align: left; cursor: pointer; transition: background 0.2s; }
    .bank-option:hover { background: rgba(255,0,255,0.2); } .bank-option:last-child { border-bottom: none; }
  `; document.head.appendChild(style);
}

function render($c) {
  const profile = getProfile(); if (!profile) { setView('auth'); return; }
  const cpBalance = Number(profile.wallet_bs || 0); const rate = getBcvRate(); const wins = profile.wins ?? 0; const losses = profile.losses ?? 0; const total = wins + losses; const winPct = total > 0 ? Math.round(wins / total * 100) : 0;
  const ENTRY_COST = 30; const REWARD = 50;

  $c.innerHTML = `
  <div class="dash-grid">
    <div class="wallet-card card-acc" style="grid-column:1/-1; background: linear-gradient(145deg, #0f0c29, #302b63, #24243e); border: 1px solid #4c1d95;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:.85rem;">
        <div>
          <p class="wallet-label" style="color:#00f0ff;">💎 Billetera Élite</p>
          <div class="wallet-amount" style="text-shadow: 0 0 10px rgba(0,240,255,0.5);">${cpBalance.toLocaleString('es-VE')} <span style="font-size:1.1rem;color:#00f0ff;font-family:var(--font-display); font-weight:bold;">CP</span></div>
          <p class="wallet-usd" style="color:var(--text-dim);">Color-Poins Disponibles</p>
        </div>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;">
          <button id="btn-recharge" class="btn btn-neon" style="font-size:.68rem; background: linear-gradient(90deg, #00f0ff, #0055ff); border:none; color:white;">🛒 COMPRAR CP</button>
          <button id="btn-withdraw" class="btn btn-ghost" style="font-size:.68rem; border-color:#ff00ff; color:#ff00ff;">🔄 CANJEAR</button>
        </div>
      </div>
    </div>
    <div class="card" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:1.75rem 1.25rem;background:linear-gradient(135deg,#2e0854,#0b0f19);border-color:#6d28d9; box-shadow: 0 0 20px rgba(109, 40, 217, 0.3);">
      <div style="text-align:center;">
        <p style="font-family:var(--font-display);font-size:.75rem;letter-spacing:.18em;color:var(--text-bright);text-transform:uppercase;margin-bottom:.2rem;">Costo de Entrada: <span style="color:#00f0ff; text-shadow: 0 0 5px #00f0ff;">${ENTRY_COST} CP</span></p>
        <p style="font-family:var(--font-mono);font-size:.65rem;color:var(--pink);">Premio al Ganador: ${REWARD} CP</p>
      </div>
      <button id="btn-battle" class="btn btn-battle" style="background:#ff00ff; box-shadow: 0 0 15px #ff00ff;" ${cpBalance < ENTRY_COST ? 'disabled' : ''}>⚔ ENTRAR A LA ARENA</button>
      ${cpBalance < ENTRY_COST ? `<p style="font-family:var(--font-mono);font-size:.62rem;color:#ff4444;text-align:center;">Insuficientes CP. Ve a la tienda.</p>` : ''}
    </div>
    <div class="card card-acc">
      <p style="font-family:var(--font-mono);font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:.9rem;">📊 Récord de Batalla</p>
      <div class="donut-wrap">
        ${buildDonut(winPct)}
        <div style="display:flex;flex-direction:column;gap:.45rem;width:100%;">
          ${statRow('Victorias', wins, 'var(--pink)', 'var(--pink-dim)')}
          ${statRow('Derrotas',  losses, 'var(--blue)', 'var(--blue-dim)')}
          ${total > 0 ? `<div style="padding-top:.4rem;border-top:1px solid var(--border-ghost);display:flex;justify-content:space-between;"><span style="font-family:var(--font-mono);font-size:.62rem;color:var(--text-dim);">Win Rate</span><span style="font-family:var(--font-display);font-size:.85rem;font-weight:700;color:${winPct>=50?'var(--pink)':'var(--blue)'};">${winPct}%</span></div>` : ''}
        </div>
      </div>
    </div>
    <div class="card card-acc" id="lb-card">
      <p style="font-family:var(--font-mono);font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:.9rem;">🏆 Top Leyendas</p>
      <div id="lb-body" style="font-family:var(--font-mono);font-size:.7rem;color:var(--text-dim);">Cargando…</div>
    </div>
  </div>`;
  attachEvents($c); loadLeaderboard($c);
}

function statRow(label, val, color, glow) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;"><div style="display:flex;align-items:center;gap:.4rem;"><span style="width:9px;height:9px;border-radius:50%;background:${color};box-shadow:0 0 5px ${glow};display:inline-block;"></span><span style="font-family:var(--font-mono);font-size:.68rem;color:var(--text-base);">${label}</span></div><span style="font-family:var(--font-display);font-size:.82rem;font-weight:700;color:${color};">${val}</span></div>`;
}

function attachEvents($c) {
  $c.querySelector('#btn-recharge')?.addEventListener('click', openStoreModal);
  $c.querySelector('#btn-withdraw')?.addEventListener('click', openWithdrawModal);
  $c.querySelector('#btn-battle')?.addEventListener('click',   () => {
    if (Number(getProfile().wallet_bs) < 30) { showToast(`Necesitas 30 CP para jugar.`, 'warning'); return; }
    setView('matchmaking');
  });
}

async function loadLeaderboard($c) {
  const { data, error } = await getSupabase().from('users').select('username,wins,losses').order('wins', { ascending: false }).limit(10);
  const $lb = $c.querySelector('#lb-body'); if (!$lb) return;
  if (error || !data?.length) { $lb.innerHTML = `<p style="text-align:center;color:var(--text-ghost);padding:1rem 0;">Sin jugadores aún.</p>`; return; }
  const medals = ['🥇','🥈','🥉'];
  $lb.innerHTML = `<table class="lb-table"><thead><tr><th>#</th><th>Jugador</th><th>V</th><th>D</th><th>%</th></tr></thead><tbody>${data.map((p,i) => { const t = p.wins + p.losses; const wr = t > 0 ? Math.round(p.wins/t*100) : 0; const me = getProfile()?.username === p.username; return `<tr class="${i===0?'r1':i===1?'r2':i===2?'r3':''}${me?' current-user-row':''}"><td>${medals[i] ?? i+1}</td><td style="font-weight:600;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${me?'color:var(--pink);':''}">${escHtml(p.username)}</td><td>${p.wins}</td><td>${p.losses}</td><td>${wr}%</td></tr>`; }).join('')}</tbody></table>`;
}

function openStoreModal() {
  const rate = getBcvRate();
  const packs = [{ cp: 50, usd: 0.50, color: '#00f0ff', name: 'CRISTAL BÁSICO', icon: '🔹' }, { cp: 100, usd: 1.00, color: '#00ff66', name: 'NÚCLEO VERDE', icon: '🔋' }, { cp: 300, usd: 3.00, color: '#ff00ff', name: 'PILA PÚRPURA', icon: '🔮' }, { cp: 500, usd: 5.00, color: '#ffaa00', name: 'COFRE NARANJA', icon: '🧰' }, { cp: 1000, usd: 10.00, color: '#ff0055', name: 'MATRIZ ROJA', icon: '💎' }, { cp: 1500, usd: 15.00, color: '#ffff00', name: 'TESORO LEYENDA', icon: '👑' }];
  showModal(`
    <button class="modal-close" onclick="window.__CW_hideModal()">✕</button>
    <div class="modal-title" style="text-align:center; margin-bottom: 5px;"><span class="cp-logo-text" style="font-size:1.5rem; font-weight:900; letter-spacing:2px;">TIENDA DE COLOR-POINS</span></div>
    <p style="text-align:center; font-family:var(--font-mono); font-size:0.65rem; color:var(--text-dim); margin-bottom:15px;">Adquiere CP para entrar a la arena</p>
    <div id="store-step-1"><div class="cp-grid">${packs.map(p => `<div class="cp-card pack-btn" data-cp="${p.cp}" data-usd="${p.usd}" style="--card-color: ${p.color};"><div class="cp-crystal">${p.icon}</div><div style="font-family:var(--font-mono); font-size:0.55rem; color:var(--text-ghost); text-transform:uppercase;">${p.name}</div><div class="cp-amount">${p.cp} CP</div><div class="cp-price">USD $${p.usd.toFixed(2)}</div></div>`).join('')}</div></div>
    <div id="store-step-2" style="display:none;">
      <div style="background:rgba(0,240,255,0.1); border:1px solid #00f0ff; border-radius:10px; padding:15px; text-align:center; margin-bottom:15px;"><p style="font-family:var(--font-display); color:white; margin-bottom:5px;">Paquete Seleccionado: <span id="sel-cp" style="color:#00f0ff; font-size:1.2rem;">0 CP</span></p><p style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim);">Debes transferir exactamente:</p><div style="font-family:var(--font-display); color:#ffaa00; font-size:1.5rem; margin-top:5px; line-height: 1.2;" id="sel-bs">0.00 Bs</div></div>
      <div class="bank-box" style="margin-bottom:15px;"><div class="bank-row"><span class="bank-key">Teléfono</span><div style="display:flex;align-items:center;gap:.4rem;"><span class="bank-val">04144708220</span><button class="btn-copy" onclick="window.__CW_copyToClipboard('04144708220',this)">Copiar</button></div></div><div class="bank-row"><span class="bank-key">Banco</span><div style="display:flex;align-items:center;gap:.4rem;"><span class="bank-val">Banco de Venezuela</span><button class="btn-copy" onclick="window.__CW_copyToClipboard('Banco de Venezuela',this)"></button></div></div><div class="bank-row"><span class="bank-key">C.I.</span><div style="display:flex;align-items:center;gap:.4rem;"><span class="bank-val">30522091</span><button class="btn-copy" onclick="window.__CW_copyToClipboard('30522091',this)">Copiar</button></div></div></div>
      <div class="field-group" style="margin-top:.85rem;"><label class="field-label" for="rc-ref">Últimos 6 dígitos de la referencia</label><input id="rc-ref" type="text" class="input-field" placeholder="123456" maxlength="6" inputmode="numeric" /></div>
      <div class="field-group"><label class="input-file-label" id="rc-file-label" for="rc-file" style="border-color:#00f0ff; color:#00f0ff;">📎 Subir captura del Pago Móvil</label><input id="rc-file" type="file" accept="image/*" style="display:none;" /></div>
      <div id="rc-global-err" class="field-error" style="margin-bottom:.7rem;"></div>
      <div style="display:flex; gap:10px;"><button id="btn-back-store" class="btn btn-ghost" style="flex:1;">ATRÁS</button><button id="btn-rc-submit" class="btn btn-primary" style="flex:2; background: linear-gradient(90deg, #00f0ff, #0055ff); border:none;">COMPRAR CP</button></div>
    </div>
  `, { closable: true });

  let selectedUSD = 0; let selectedCP = 0;
  document.querySelectorAll('.pack-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCP = parseInt(btn.getAttribute('data-cp')); selectedUSD = parseFloat(btn.getAttribute('data-usd'));
      document.getElementById('sel-cp').textContent = `${selectedCP} CP`; document.getElementById('sel-bs').innerHTML = `${parseFloat((selectedUSD * rate).toFixed(2)).toLocaleString('es-VE')} Bs<br><span style="font-size:0.7rem; color:#fff; font-family:var(--font-mono); font-weight:normal;">(${selectedUSD.toFixed(2)} USD x ${rate} Bs/$)</span>`;
      document.getElementById('store-step-1').style.display = 'none'; document.getElementById('store-step-2').style.display = 'block';
    });
  });

  document.getElementById('btn-back-store').addEventListener('click', () => { document.getElementById('store-step-2').style.display = 'none'; document.getElementById('store-step-1').style.display = 'block'; });
  const $file = document.getElementById('rc-file'); const $label = document.getElementById('rc-file-label');
  $file?.addEventListener('change', () => { if ($file.files[0]) { $label.textContent = `✓ Captura cargada`; $label.style.background = 'rgba(0,240,255,0.2)'; }});
  document.getElementById('rc-ref')?.addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g,'').slice(0,6); });
  document.getElementById('btn-rc-submit')?.addEventListener('click', () => submitStorePurchase(selectedUSD, selectedCP, rate));
}

async function submitStorePurchase(usd, cpAmount, rate) {
  const $ref = document.getElementById('rc-ref'); const $file = document.getElementById('rc-file'); const $err = document.getElementById('rc-global-err'); const $btn = document.getElementById('btn-rc-submit');
  $err.textContent = ''; const ref = $ref?.value.trim(); const file = $file?.files[0];
  if (!/^\d{6}$/.test(ref)) { $err.textContent = 'Ingresa los 6 dígitos de referencia.'; return; } if (!file) { $err.textContent = 'Sube la captura de pantalla.'; return; }

  $btn.disabled = true; $btn.textContent = 'PROCESANDO...'; $btn.style.opacity = '.65';
  const sb = getSupabase(); const profile = getProfile();
  try {
    const path = `${profile.id}_${Date.now()}.${file.name.split('.').pop()}`;
    const { error: uploadErr } = await sb.storage.from('comprobantes').upload(path, file, { cacheControl: '3600', upsert: false });
    if (uploadErr) throw new Error("Error subiendo captura: " + uploadErr.message);
    const { data: urlData } = sb.storage.from('comprobantes').getPublicUrl(path);
    const { error: insertErr } = await sb.from('recharges').insert({ user_email: profile.email, amount_usd: usd, amount_bs: parseFloat((usd * rate).toFixed(2)), reference: ref, image_url: urlData?.publicUrl ?? '', status: 'pending' });
    if (insertErr) throw new Error(insertErr.message);
    hideModal(); showToast(`Compra de ${cpAmount} CP enviada.`, 'warning', 6000);
  } catch (error) { $err.textContent = error.message; } finally { $btn.disabled = false; $btn.textContent = 'COMPRAR CP'; $btn.style.opacity = '1'; }
}

function openWithdrawModal() {
  const profile = getProfile(); const cpBalance = Number(profile.wallet_bs || 0); const rate = getBcvRate();
  const BANKS = ["0102 - BANCO DE VENEZUELA", "0156 - 100% BANCO", "0172 - BANCAMIGA BANCO UNIVERSAL", "0114 - BANCARIBE", "0171 - BANCO ACTIVO", "0128 - BANCO CARONÍ", "0163 - BANCO DEL TESORO", "0175 - BANCO DIGITAL DE LOS TRABAJADORES", "0115 - BANCO EXTERIOR", "0151 - BANCO FONDO COMÚN", "0105 - BANCO MERCANTIL", "0191 - BANCO NACIONAL DE CREDITO", "0138 - BANCO PLAZA", "0137 - BANCO SOFITASA", "0104 - BANCO VENEZOLANO DE CREDITO", "0168 - BANCRECER", "0134 - BANESCO", "0177 - BANFANB", "0146 - BANGENTE", "0174 - BANPLUS", "0108 - BBVA PROVINCIAL", "0157 - DELSUR BANCO UNIVERSAL"];

  showModal(`
    <button class="modal-close" onclick="window.__CW_hideModal()">✕</button>
    <div class="modal-title" style="color:#ff00ff;">CANJEAR COLOR-POINS</div>
    <p style="font-family:var(--font-mono);font-size:.65rem;color:var(--text-dim);margin-bottom:1rem;line-height:1.6; text-align:center;">CP Disponibles: <strong style="color:#00f0ff; font-size:1.1rem;">${cpBalance.toLocaleString('es-VE')} CP</strong></p>
    <div class="field-group"><label class="field-label" for="wd-amount">Cantidad a canjear</label><input id="wd-amount" type="number" min="200" step="1" class="input-field" placeholder="Mínimo: 200 CP" style="border-color:#ff00ff;" /><p style="font-family:var(--font-mono); font-size:0.55rem; color:#ff4444; margin-top:5px;">* El retiro mínimo es de 200 CP</p></div>
    <div id="wd-calc" style="background:rgba(255,0,255,0.1); border:1px solid #ff00ff; border-radius:10px; padding:10px; text-align:center; margin-bottom:15px; display:none;"><p style="font-family:var(--font-mono); font-size:0.7rem; color:var(--text-dim);">Recibirás en tu cuenta:</p><div style="font-family:var(--font-display); color:#00f0ff; font-size:1.3rem; margin-top:5px;" id="wd-bs-result">0.00 Bs</div></div>
    <div class="field-group custom-select-wrapper" style="position:relative;"><label class="field-label" for="wd-bank">Banco Destino</label><input type="text" id="wd-bank" class="input-field" placeholder="Escribe o selecciona un banco..." autocomplete="off" /><span style="position:absolute; right:15px; top:35px; color:var(--text-dim); pointer-events:none;">▼</span><div id="bank-dropdown" style="display:none; position:absolute; top:100%; left:0; right:0; background:#11111a; border:1px solid #ff00ff; z-index:100; max-height:200px; overflow-y:auto; border-radius:8px; margin-top:5px; box-shadow:0 10px 25px rgba(0,0,0,0.9);"></div></div>
    <div class="field-group"><label class="field-label" for="wd-phone">Teléfono</label><input id="wd-phone" type="tel" class="input-field" placeholder="04XX-XXXXXXX" /></div>
    <div class="field-group"><label class="field-label" for="wd-ci">Cédula</label><input id="wd-ci" type="text" class="input-field" placeholder="V-XXXXXXXX" /></div>
    <div id="wd-err" class="field-error" style="margin-bottom:.7rem;"></div>
    <button id="btn-wd-submit" class="btn btn-primary" style="width:100%;height:46px;font-size:.75rem;letter-spacing:.12em; background:#ff00ff; border:none; box-shadow:0 0 10px rgba(255,0,255,0.5);">SOLICITAR CANJE</button>`, { closable: true });

  const $amount = document.getElementById('wd-amount'); const $calc = document.getElementById('wd-calc'); const $bsRes = document.getElementById('wd-bs-result');
  $amount?.addEventListener('input', () => { const cp = parseFloat($amount.value); if (!isNaN(cp) && cp > 0) { $bsRes.textContent = parseFloat(((cp/100) * rate).toFixed(2)).toLocaleString('es-VE') + ' Bs'; $calc.style.display = 'block'; } else { $calc.style.display = 'none'; } });

  const $bankInput = document.getElementById('wd-bank'); const $bankDropdown = document.getElementById('bank-dropdown');
  function renderBanks(filterText = '') { $bankDropdown.innerHTML = ''; BANKS.filter(b => b.toLowerCase().includes(filterText.toLowerCase())).forEach(b => { const div = document.createElement('div'); div.className = 'bank-option'; div.textContent = b; div.onclick = () => { $bankInput.value = b; $bankDropdown.style.display = 'none'; }; $bankDropdown.appendChild(div); }); }
  $bankInput.addEventListener('focus', () => { renderBanks($bankInput.value); $bankDropdown.style.display = 'block'; }); $bankInput.addEventListener('input', (e) => { renderBanks(e.target.value); $bankDropdown.style.display = 'block'; }); document.addEventListener('click', (e) => { if (document.querySelector('.custom-select-wrapper') && $bankDropdown && !document.querySelector('.custom-select-wrapper').contains(e.target)) $bankDropdown.style.display = 'none'; });

  document.getElementById('btn-wd-submit')?.addEventListener('click', async () => {
    const amountCP = parseFloat(document.getElementById('wd-amount')?.value); const bank = document.getElementById('wd-bank')?.value.trim(); const phone = document.getElementById('wd-phone')?.value.trim(); const ci = document.getElementById('wd-ci')?.value.trim(); const $err = document.getElementById('wd-err'); const $btn = document.getElementById('btn-wd-submit');
    $err.textContent = '';
    if (isNaN(amountCP) || amountCP < 200) { $err.textContent = 'El retiro mínimo es de 200 CP.'; return; } if (amountCP > cpBalance) { $err.textContent = `Insuficientes CP. Tienes ${cpBalance}.`; return; } if (!bank || !phone || !ci) { $err.textContent = 'Llena todos los datos.'; return; }

    $btn.disabled = true; $btn.textContent = 'PROCESANDO…'; $btn.style.opacity = '.65';
    try {
      const { error: insertErr } = await getSupabase().from('withdrawals').insert([{ user_email: profile.email || 'Jugador', amount_bs: amountCP, bank: bank, phone: phone, ci: ci, status: 'pending' }]);
      if (insertErr) throw new Error(insertErr.message);
      const { error: updateErr } = await getSupabase().from('users').update({ wallet_bs: cpBalance - amountCP }).eq('id', profile.id);
      if (updateErr) throw new Error(updateErr.message);
      hideModal(); showToast(`Solicitud enviada.`, 'info', 6000); await reloadProfile(); setView('dashboard');
    } catch (error) { $err.innerHTML = `<strong>Error:</strong> ${error.message}`; } finally { $btn.disabled = false; $btn.textContent = 'SOLICITAR CANJE'; $btn.style.opacity = '1'; }
  });
}

function buildDonut(winPct) {
  const R = 46; const CX = 62; const CY = 62; const SW = 13; const C = 2 * Math.PI * R; const lossPct = 100 - winPct;
  if (winPct === 0 && lossPct === 0) return `<svg width="124" height="124" viewBox="0 0 124 124"><circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="${SW}"/><text x="${CX}" y="${CY}" text-anchor="middle" dominant-baseline="middle" font-family="var(--font-display)" font-size="11" fill="var(--text-dim)">0%</text></svg>`;
  const wd = (winPct / 100) * C; const ld = (lossPct / 100) * C;
  return `<svg width="124" height="124" viewBox="0 0 124 124" style="transform:rotate(-90deg);"><circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="${SW}"/><circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--blue)" stroke-width="${SW}" stroke-dasharray="${ld} ${C-ld}" stroke-dashoffset="${-wd}" stroke-linecap="round" style="filter:drop-shadow(0 0 4px var(--blue-dim))"/><circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--pink)" stroke-width="${SW}" stroke-dasharray="${wd} ${C-wd}" stroke-linecap="round" style="filter:drop-shadow(0 0 5px var(--pink-dim))"/><text x="${CX}" y="${CY-5}" text-anchor="middle" dominant-baseline="middle" font-family="var(--font-display)" font-size="15" font-weight="900" fill="var(--pink)" style="transform:rotate(90deg);transform-origin:${CX}px ${CY}px;">${winPct}%</text><text x="${CX}" y="${CY+11}" text-anchor="middle" dominant-baseline="middle" font-family="var(--font-mono)" font-size="7" fill="var(--text-dim)" style="transform:rotate(90deg);transform-origin:${CX}px ${CY}px;">WINS</text></svg>`;
}
