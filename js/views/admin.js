/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/views/admin.js
 * CENTRO DE MANDO (Estilo Rifas El Menor + Filtros + Cards)
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast, escHtml } from '../core/app.js';
import { getSupabase } from '../core/supabase.js';
import { getProfile, setView, setBcvRate, getBcvRate, reloadBcvRate } from '../core/state.js';

registerView('admin', initAdminView);

let _allRecharges = [];
let _allWithdrawals = [];
let _currentRecFilter = 'pending';
let _currentWitFilter = 'pending';

export async function initAdminView($container) {
  const profile = getProfile();
  if (!profile || profile.role !== 'admin') { 
      showToast('Acceso Denegado. Solo personal autorizado.', 'error');
      setView('dashboard'); 
      return; 
  }
  await reloadBcvRate();
  await renderAdmin($container);
}

async function renderAdmin($c) {
  const rate = getBcvRate();
  $c.innerHTML = `
  <style>
    /* Estilos heredados de Rifas El Menor */
    .admin-card-item { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:16px; padding:16px; margin-bottom:12px; }
    .adm-badge { padding:4px 10px; border-radius:8px; font-size:11px; font-weight:800; display:inline-block; }
    .adm-badge-pending { background:rgba(251,191,36,.2); color:#FBB124; border:1px solid rgba(251,191,36,.4); }
    .adm-badge-approved { background:rgba(20,184,166,.2); color:#5EEAD4; border:1px solid rgba(20,184,166,.4); }
    .adm-badge-rejected { background:rgba(239,68,68,.2); color:#FCA5A5; border:1px solid rgba(239,68,68,.4); }
    .adm-tab-btn { padding:8px 16px; border-radius:10px; font-weight:700; font-size:13px; border:1.5px solid rgba(255,255,255,.12); background:transparent; color:var(--text-muted); cursor:pointer; transition:all .15s; white-space:nowrap; }
    .adm-tab-btn.active { background:var(--purple); border-color:var(--purple-light); color:#fff; }
    .btn-approve { background:linear-gradient(135deg,#14B8A6,#0EA5E9); color:#fff; font-weight:800; border:none; border-radius:10px; padding:8px 12px; cursor:pointer; width:100%; transition:transform .15s; }
    .btn-approve:active { transform:scale(.96); }
    .btn-reject { background:linear-gradient(135deg,#EF4444,#DC2626); color:#fff; font-weight:800; border:none; border-radius:10px; padding:8px 12px; cursor:pointer; width:100%; transition:transform .15s; }
    .btn-reject:active { transform:scale(.96); }
  </style>

  <div class="admin-wrap" style="padding: 10px; max-width: 600px; margin: 0 auto;">
    
    <div style="background:linear-gradient(135deg,#5B21B6,#1e0a4e); border-bottom:1px solid rgba(124,58,237,.4); border-radius: 16px; padding: 16px; margin-bottom: 20px; box-shadow: 0 10px 20px rgba(0,0,0,0.5);">
      <div style="display:flex; justify-content: space-between; align-items: center;">
        <div>
          <h1 style="font-family:'Space Grotesk',sans-serif; font-weight:900; font-size:1.2rem; margin:0;">⚙️ Panel Admin</h1>
          <p style="color:var(--text-dim); font-size:0.75rem; font-family:var(--font-mono); margin:0;">Color Wars Élite</p>
        </div>
        <button id="btn-adm-logout" style="background:transparent; border:1px solid rgba(255,255,255,0.2); color:white; border-radius:8px; padding:5px 10px; font-size:0.7rem;">Salir</button>
      </div>
    </div>

    <div class="card card-acc" style="margin-bottom:1.5rem; background: rgba(0,0,0,0.5); border: 1px solid var(--purple-light);">
      <p style="font-family:var(--font-mono);font-size:.7rem;color:var(--text-bright);margin-bottom:.85rem;">💱 TASA BCV ACTUAL (Bs por $)</p>
      <div style="display:flex;gap:.65rem; align-items: center;">
        <input id="bcv-input" type="number" step="0.01" class="input-field" style="max-width:150px; font-size: 1.2rem; color: #00ff66; font-weight: bold; border-color: #00ff66;" value="${rate}" />
        <button id="btn-save-bcv" class="btn btn-primary" style="background: var(--purple); color: white; font-weight: bold; border:none;">GUARDAR</button>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:1.5rem;">
      <button class="btn btn-primary" id="main-tab-recargas" style="flex: 1; background: linear-gradient(135deg,#14B8A6,#0EA5E9); border:none;">📥 RECARGAS</button>
      <button class="btn btn-ghost" id="main-tab-retiros" style="flex: 1; border-color: var(--pink); color: var(--pink);">📤 RETIROS</button>
    </div>

    <div id="sec-recargas">
      <div style="display:flex; gap:8px; overflow-x:auto; margin-bottom:15px; padding-bottom:5px;">
        <button class="adm-tab-btn rec-filter active" data-filter="pending">⏳ Pendientes</button>
        <button class="adm-tab-btn rec-filter" data-filter="approved">✅ Aprobadas</button>
        <button class="adm-tab-btn rec-filter" data-filter="rejected">❌ Rechazadas</button>
      </div>
      <div id="recharges-list">Cargando...</div>
    </div>

    <div id="sec-retiros" style="display:none;">
      <div style="display:flex; gap:8px; overflow-x:auto; margin-bottom:15px; padding-bottom:5px;">
        <button class="adm-tab-btn wit-filter active" data-filter="pending">⏳ Pendientes</button>
        <button class="adm-tab-btn wit-filter" data-filter="approved">✅ Pagados</button>
        <button class="adm-tab-btn wit-filter" data-filter="rejected">❌ Rechazados</button>
      </div>
      <div id="withdrawals-list">Cargando...</div>
    </div>

  </div>`;

  // --- LÓGICA DE NAVEGACIÓN ---
  $c.querySelector('#main-tab-recargas').addEventListener('click', (e) => {
    $c.querySelector('#sec-recargas').style.display = 'block';
    $c.querySelector('#sec-retiros').style.display = 'none';
    e.target.style.background = 'linear-gradient(135deg,#14B8A6,#0EA5E9)'; e.target.style.color = 'white'; e.target.style.border = 'none';
    const other = $c.querySelector('#main-tab-retiros');
    other.style.background = 'transparent'; other.style.borderColor = 'var(--pink)'; other.style.color = 'var(--pink)';
  });

  $c.querySelector('#main-tab-retiros').addEventListener('click', (e) => {
    $c.querySelector('#sec-recargas').style.display = 'none';
    $c.querySelector('#sec-retiros').style.display = 'block';
    e.target.style.background = 'linear-gradient(135deg,#EF4444,#DC2626)'; e.target.style.color = 'white'; e.target.style.border = 'none';
    const other = $c.querySelector('#main-tab-recargas');
    other.style.background = 'transparent'; other.style.borderColor = '#00f0ff'; other.style.color = '#00f0ff';
  });

  $c.querySelector('#btn-adm-logout')?.addEventListener('click', () => { setView('dashboard'); });
  $c.querySelector('#btn-save-bcv')?.addEventListener('click', () => saveBcvRate($c));

  // --- LÓGICA DE FILTROS ---
  $c.querySelectorAll('.rec-filter').forEach(btn => {
    btn.addEventListener('click', (e) => {
      $c.querySelectorAll('.rec-filter').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      _currentRecFilter = e.target.dataset.filter;
      renderRechargesList($c);
    });
  });

  $c.querySelectorAll('.wit-filter').forEach(btn => {
    btn.addEventListener('click', (e) => {
      $c.querySelectorAll('.wit-filter').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      _currentWitFilter = e.target.dataset.filter;
      renderWithdrawalsList($c);
    });
  });

  // --- INICIALIZAR DATOS ---
  await fetchAllData($c);
}

// ── GUARDAR TASA BCV ───────────────────────────────────────
async function saveBcvRate($c) {
  const newRate = parseFloat($c.querySelector('#bcv-input')?.value);
  if (isNaN(newRate) || newRate <= 0) return;
  const sb = getSupabase();
  await sb.from('sys_config').update({ bcv_rate: newRate }).eq('id', 1);
  setBcvRate(newRate);
  showToast(`Tasa actualizada a ${newRate} Bs/$`, 'success');
  renderWithdrawalsList($c); // Recalcula si cambias la tasa
}

// ── FETCH GLOBAL DE DATOS ─────────────────────────────────
async function fetchAllData($c) {
  const sb = getSupabase();
  
  // Traer Recargas
  const { data: recData } = await sb.from('recharges').select('*').order('created_at', { ascending: false });
  _allRecharges = recData || [];
  renderRechargesList($c);

  // Traer Retiros
  const { data: witData } = await sb.from('withdrawals').select('*').order('created_at', { ascending: false });
  _allWithdrawals = witData || [];
  renderWithdrawalsList($c);
}

// ── RENDER RECARGAS (Estilo Tarjetas) ──────────────────────
function renderRechargesList($c) {
  const $el = $c.querySelector('#recharges-list');
  const filtered = _allRecharges.filter(r => r.status === _currentRecFilter);

  if (!filtered.length) {
    $el.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-dim); font-family:var(--font-mono);">No hay registros aquí.</div>`;
    return;
  }

  $el.innerHTML = filtered.map(r => {
    const cpToCredit = Math.round(r.amount_usd * 100);
    const dateStr = new Date(r.created_at).toLocaleString('es-VE', {dateStyle:'short', timeStyle:'short'});
    const badgeClass = r.status === 'pending' ? 'adm-badge-pending' : (r.status === 'approved' ? 'adm-badge-approved' : 'adm-badge-rejected');
    const badgeText = r.status === 'pending' ? '⏳ Pendiente' : (r.status === 'approved' ? '✅ Aprobado' : '❌ Rechazado');

    return `
    <div class="admin-card-item">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
        <div>
          <div style="font-weight:900; color:var(--text-bright); font-size:1rem;">${escHtml(r.user_email.split('@')[0])}</div>
          <div style="font-size:0.65rem; color:var(--text-dim); font-family:var(--font-mono);">${dateStr}</div>
        </div>
        <span class="adm-badge ${badgeClass}">${badgeText}</span>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:12px; font-size:0.8rem; background:rgba(0,0,0,0.3); padding:10px; border-radius:8px;">
        <div><span style="color:var(--text-dim);font-size:0.7rem;display:block;">Pagó (Bs)</span> <strong style="color:#00ff66;">${r.amount_bs} Bs</strong></div>
        <div><span style="color:var(--text-dim);font-size:0.7rem;display:block;">Referencia</span> <strong style="color:#ffaa00;">${escHtml(r.reference)}</strong></div>
        <div style="grid-column: span 2;"><span style="color:var(--text-dim);font-size:0.7rem;display:block;">Debe Recibir</span> <strong style="color:#00f0ff; font-size:1.1rem;">+${cpToCredit} CP</strong></div>
      </div>

      ${r.image_url && r.status === 'pending' ? `
      <div style="margin-bottom:12px; text-align:center;">
        <a href="${escHtml(r.image_url)}" target="_blank" style="color:#00f0ff; text-decoration:underline; font-size:0.8rem;">👁️ Ver Comprobante</a>
      </div>` : ''}

      ${r.status === 'pending' ? `
      <div style="display:flex; gap:10px;">
        <button class="btn-approve" data-action="app-rec" data-id="${r.id}" data-email="${escHtml(r.user_email)}" data-cp="${cpToCredit}" data-img="${r.image_url}">✅ APROBAR</button>
        <button class="btn-reject" data-action="rej-rec" data-id="${r.id}" data-img="${r.image_url}">❌ RECHAZAR</button>
      </div>` : ''}
    </div>`;
  }).join('');

  // Event Listeners
  $el.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const b = e.target; b.disabled = true; b.style.opacity = '0.5';
      if(b.dataset.action === 'app-rec') await handleApproveRec(b.dataset, $c);
      if(b.dataset.action === 'rej-rec') await handleRejectRec(b.dataset, $c);
    });
  });
}

// ── RENDER RETIROS (Estilo Tarjetas) ──────────────────────
function renderWithdrawalsList($c) {
  const rate = getBcvRate();
  const $el = $c.querySelector('#withdrawals-list');
  const filtered = _allWithdrawals.filter(r => r.status === _currentWitFilter);

  if (!filtered.length) {
    $el.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-dim); font-family:var(--font-mono);">No hay registros aquí.</div>`;
    return;
  }

  $el.innerHTML = filtered.map(r => {
    const usdValue = r.amount_bs / 100;
    const bsToPay = (usdValue * rate).toFixed(2);
    const dateStr = new Date(r.created_at).toLocaleString('es-VE', {dateStyle:'short', timeStyle:'short'});
    const badgeClass = r.status === 'pending' ? 'adm-badge-pending' : (r.status === 'approved' ? 'adm-badge-approved' : 'adm-badge-rejected');
    const badgeText = r.status === 'pending' ? '⏳ Pendiente' : (r.status === 'approved' ? '✅ Pagado' : '❌ Rechazado');

    return `
    <div class="admin-card-item" style="border-color:var(--pink);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
        <div>
          <div style="font-weight:900; color:var(--text-bright); font-size:1rem;">${escHtml(r.user_email.split('@')[0])}</div>
          <div style="font-size:0.65rem; color:var(--text-dim); font-family:var(--font-mono);">${dateStr}</div>
        </div>
        <span class="adm-badge ${badgeClass}">${badgeText}</span>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:12px; font-size:0.8rem; background:rgba(0,0,0,0.3); padding:10px; border-radius:8px;">
        <div><span style="color:var(--text-dim);font-size:0.7rem;display:block;">Se le descontó</span> <strong style="color:var(--pink);">${r.amount_bs} CP</strong></div>
        <div><span style="color:var(--text-dim);font-size:0.7rem;display:block;">Debes Transferir</span> <strong style="color:#00ff66; font-size:1.1rem;">${bsToPay} Bs</strong></div>
        
        <div style="grid-column: span 2; border-top:1px dashed rgba(255,255,255,0.1); padding-top:8px; margin-top:5px;">
          <span style="color:var(--text-dim);font-size:0.7rem;display:block;margin-bottom:4px;">Datos de Pago Móvil:</span>
          <div style="color:white; font-family:var(--font-mono); font-size:0.85rem;">
            Banco: <span style="color:#00f0ff;">${escHtml(r.bank || 'N/A')}</span><br>
            Tlf: <span style="color:#00f0ff;">${escHtml(r.phone || 'N/A')}</span><br>
            C.I: <span style="color:#00f0ff;">${escHtml(r.ci || 'N/A')}</span>
          </div>
        </div>
      </div>

      ${r.status === 'pending' ? `
      <div style="display:flex; gap:10px;">
        <button class="btn-approve" style="background:linear-gradient(135deg,#ff00ff,#7000ff);" data-action="app-wit" data-id="${r.id}">✓ MARCAR PAGADO</button>
        <button class="btn-reject" style="background:transparent; border:1px solid var(--text-dim); color:var(--text-dim);" data-action="rej-wit" data-id="${r.id}" data-email="${escHtml(r.user_email)}" data-cp="${r.amount_bs}">❌ Devolver CP</button>
      </div>` : ''}
    </div>`;
  }).join('');

  // Event Listeners
  $el.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const b = e.target; b.disabled = true; b.style.opacity = '0.5';
      if(b.dataset.action === 'app-wit') await handleApproveWit(b.dataset, $c);
      if(b.dataset.action === 'rej-wit') await handleRejectWit(b.dataset, $c);
    });
  });
}

// ── ACCIONES EN BASE DE DATOS ──────────────────────────────
async function handleApproveRec({id, email, cp, img}, $c) {
  const sb = getSupabase();
  const { data: user } = await sb.from('users').select('id,wallet_bs').eq('email', email).single();
  if (user) {
    await sb.from('users').update({ wallet_bs: Number(user.wallet_bs) + Number(cp) }).eq('id', user.id);
    await sb.from('recharges').update({ status: 'approved' }).eq('id', id);
    
    // Eliminación del comprobante
    try {
        const urlObj = new URL(img);
        const pathSegments = urlObj.pathname.split('/comprobantes/');
        if (pathSegments.length > 1) { sb.storage.from('comprobantes').remove([pathSegments[1]]).catch(()=>{}); }
    } catch(e) {}
    
    showToast(`✅ +${cp} CP entregados`, 'success');
    await fetchAllData($c);
  }
}

async function handleRejectRec({id, img}, $c) {
  const sb = getSupabase();
  await sb.from('recharges').update({ status: 'rejected' }).eq('id', id);
  
  try {
      const urlObj = new URL(img);
      const pathSegments = urlObj.pathname.split('/comprobantes/');
      if (pathSegments.length > 1) { sb.storage.from('comprobantes').remove([pathSegments[1]]).catch(()=>{}); }
  } catch(e) {}
  
  showToast('❌ Recarga rechazada', 'warning');
  await fetchAllData($c);
}

async function handleApproveWit({id}, $c) {
  await getSupabase().from('withdrawals').update({ status: 'approved' }).eq('id', id);
  showToast('✅ Retiro PAGADO', 'success');
  await fetchAllData($c);
}

async function handleRejectWit({id, email, cp}, $c) {
  const sb = getSupabase();
  const { data: user } = await sb.from('users').select('id,wallet_bs').eq('email', email).single();
  if (user) {
    await sb.from('users').update({ wallet_bs: Number(user.wallet_bs) + Number(cp) }).eq('id', user.id);
    await sb.from('withdrawals').update({ status: 'rejected' }).eq('id', id);
    showToast(`❌ Retiro rechazado. Se devolvieron ${cp} CP`, 'warning');
    await fetchAllData($c);
  }
}
