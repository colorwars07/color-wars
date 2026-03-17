/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/views/dashboard.js
 * Panel del Jugador (Botones de Modales Corregidos)
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast, escHtml } from '../core/app.js';
import { getSupabase } from '../core/supabase.js';
import { getProfile, setProfile, setView, getBcvRate, reloadBcvRate } from '../core/state.js';

registerView('dashboard', initDashboard);

export async function initDashboard($container) {
  const profile = getProfile();
  if (!profile) { setView('auth'); return; }

  await reloadBcvRate();
  renderDashboard($container, profile);
}

function renderDashboard($c, profile) {
  const rate = getBcvRate();
  const usdValue = (profile.wallet_bs / rate).toFixed(2);

  $c.innerHTML = `
  <div class="dash-grid">
    
    <div class="wallet-card">
      <p class="wallet-label">SALDO DISPONIBLE</p>
      <div class="wallet-amount">${Number(profile.wallet_bs).toLocaleString('es-VE')} Bs</div>
      <div class="wallet-usd">≈ $${usdValue} USD (Tasa: ${rate})</div>
      
      <div style="display:flex; gap:10px; margin-top:1.5rem;">
        <button id="btn-show-recharge" class="btn btn-success" style="flex:1;">+ RECARGAR</button>
        <button id="btn-show-withdraw" class="btn btn-danger" style="flex:1;">- RETIRAR</button>
      </div>
    </div>

    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1rem; padding: 2rem 0;">
      <button id="btn-play" class="btn btn-battle">⚔️ BUSCAR BATALLA</button>
      <p style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim);">Costo de entrada: 200 Bs</p>
    </div>

    <div class="card card-acc">
      <p style="font-family:var(--font-display); font-size:0.9rem; color:var(--text-bright); margin-bottom:1rem;">TUS ESTADÍSTICAS</p>
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-ghost); padding-bottom:0.5rem; margin-bottom:0.5rem;">
        <span style="color:var(--text-dim);">Victorias:</span>
        <span style="color:var(--pink); font-weight:bold;">${profile.wins || 0}</span>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span style="color:var(--text-dim);">Derrotas:</span>
        <span style="color:var(--blue); font-weight:bold;">${profile.losses || 0}</span>
      </div>
    </div>

  </div>

  <div id="modal-recharge" class="modal-overlay hidden">
    <div class="modal-content">
      <button class="modal-close btn-close-modal">✕</button>
      <h2 class="modal-title">Realizar Recarga</h2>
      
      <div class="bank-box">
        <p style="font-family:var(--font-mono); font-size:0.7rem; color:var(--text-dim); margin-bottom:10px;">DATOS PAGO MÓVIL (VENEZUELA)</p>
        <div class="bank-row"><span class="bank-key">BANCO:</span><span class="bank-val">VENEZUELA (0102)</span></div>
        <div class="bank-row"><span class="bank-key">TELÉFONO:</span><span class="bank-val">0412-1234567</span></div>
        <div class="bank-row"><span class="bank-key">CÉDULA:</span><span class="bank-val">V-12345678</span></div>
      </div>

      <div class="field-group">
        <label class="field-label">Monto en Bs que enviaste</label>
        <input type="number" id="rec-bs" class="input-field" placeholder="Ej: 550">
      </div>
      <div class="field-group">
        <label class="field-label">Número de Referencia (Últimos 6)</label>
        <input type="text" id="rec-ref" class="input-field" placeholder="Ej: 123456">
      </div>
      <div class="field-group">
        <label class="field-label">Capture / Comprobante</label>
        <input type="file" id="rec-file" accept="image/*" class="input-field" style="padding: 0.4rem;">
      </div>

      <button id="btn-submit-recharge" class="btn btn-primary" style="width:100%; margin-top:1rem;">ENVIAR RECARGA</button>
    </div>
  </div>

  <div id="modal-withdraw" class="modal-overlay hidden">
    <div class="modal-content">
      <button class="modal-close btn-close-modal">✕</button>
      <h2 class="modal-title" style="color:var(--pink);">Retirar Fondos</h2>
      
      <p style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim); margin-bottom:1rem;">
        Saldo disponible: <strong style="color:var(--text-bright);">${Number(profile.wallet_bs).toLocaleString('es-VE')} Bs</strong>
      </p>

      <div class="field-group">
        <label class="field-label">Monto a Retirar (Bs)</label>
        <input type="number" id="wit-bs" class="input-field" placeholder="Ej: 1000">
      </div>
      <div class="field-group">
        <label class="field-label">Tus Datos (Banco, Cédula, Teléfono)</label>
        <textarea id="wit-info" class="input-field" rows="3" placeholder="Ej: BDV, V-12345678, 0412-0000000"></textarea>
      </div>

      <button id="btn-submit-withdraw" class="btn btn-danger" style="width:100%; margin-top:1rem;">SOLICITAR RETIRO</button>
    </div>
  </div>
  `;

  // ⚡ AHORA SÍ: Abrir Modales correctamente
  $c.querySelector('#btn-show-recharge').addEventListener('click', () => {
    const m = $c.querySelector('#modal-recharge');
    m.classList.remove('hidden');
    setTimeout(() => m.classList.add('visible'), 10);
  });
  
  $c.querySelector('#btn-show-withdraw').addEventListener('click', () => {
    const m = $c.querySelector('#modal-withdraw');
    m.classList.remove('hidden');
    setTimeout(() => m.classList.add('visible'), 10);
  });

  // Cerrar Modales
  $c.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const m = e.target.closest('.modal-overlay');
      m.classList.remove('visible');
      setTimeout(() => m.classList.add('hidden'), 300);
    });
  });

  // Listener Botón Jugar
  $c.querySelector('#btn-play').addEventListener('click', () => {
    if (profile.wallet_bs < 200) {
      showToast('Saldo insuficiente. Necesitas 200 Bs para batallar.', 'error');
      return;
    }
    setView('matchmaking');
  });

  // Listeners de Envíos
  $c.querySelector('#btn-submit-recharge').addEventListener('click', () => submitRecharge($c, profile));
  $c.querySelector('#btn-submit-withdraw').addEventListener('click', () => submitWithdraw($c, profile));
}

// ── LÓGICA DE RECARGA ──────────────────────────────────────────────────
async function submitRecharge($c, profile) {
  const bs = parseFloat($c.querySelector('#rec-bs').value);
  const ref = $c.querySelector('#rec-ref').value.trim();
  const fileInput = $c.querySelector('#rec-file');
  const btn = $c.querySelector('#btn-submit-recharge');

  if (!bs || bs <= 0 || !ref || !fileInput.files[0]) {
    showToast('Por favor, llena todos los campos y sube el capture.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'SUBIENDO...';
  const sb = getSupabase();
  const file = fileInput.files[0];
  const fileExt = file.name.split('.').pop();
  const fileName = `${profile.id}-${Date.now()}.${fileExt}`;
  const filePath = `${fileName}`;

  try {
    const { error: uploadErr } = await sb.storage.from('comprobantes').upload(filePath, file);
    if (uploadErr) throw uploadErr;

    const { data: urlData } = sb.storage.from('comprobantes').getPublicUrl(filePath);
    const usdEquivalent = (bs / getBcvRate()).toFixed(2);

    const { error: dbErr } = await sb.from('recharges').insert([{
      user_email: profile.email,
      amount_usd: usdEquivalent,
      amount_bs: bs,
      reference: ref,
      image_url: urlData.publicUrl
    }]);

    if (dbErr) throw dbErr;

    showToast('Recarga enviada. Esperando aprobación del Admin.', 'success', 4000);
    const m = $c.querySelector('#modal-recharge');
    m.classList.remove('visible');
    setTimeout(() => m.classList.add('hidden'), 300);
    
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'ENVIAR RECARGA';
  }
}

// ── LÓGICA DE RETIRO ───────────────────────────────────────────────────
async function submitWithdraw($c, profile) {
  const bs = parseFloat($c.querySelector('#wit-bs').value);
  const info = $c.querySelector('#wit-info').value.trim();
  const btn = $c.querySelector('#btn-submit-withdraw');

  if (!bs || bs <= 0 || !info) {
    showToast('Llena el monto y tus datos de pago.', 'error');
    return;
  }

  if (bs > profile.wallet_bs) {
    showToast(`Saldo insuficiente. Tienes ${profile.wallet_bs} Bs.`, 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'PROCESANDO...';
  const sb = getSupabase();

  try {
    const newBalance = profile.wallet_bs - bs;
    const { error: userErr } = await sb.from('users').update({ wallet_bs: newBalance }).eq('id', profile.id);
    if (userErr) throw userErr;

    const { error: witErr } = await sb.from('withdrawals').insert([{
      user_email: profile.email,
      amount_bs: bs,
      payment_info: info
    }]);
    if (witErr) throw witErr;

    setProfile({ ...profile, wallet_bs: newBalance });
    showToast('Retiro solicitado. El saldo ha sido descontado.', 'success', 4000);
    renderDashboard($c, getProfile()); 
    
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'SOLICITAR RETIRO';
  }
}
