/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/core/app.js
 * SPA Router + UI Core + Sincronización de Tema Claro/Oscuro
 * ═══════════════════════════════════════════════════════
 */

import { getSupabase }          from './supabase.js';
import {
  initState, setView, subscribe,
  getSession, getProfile, getBcvRate,
  setSession, setProfile, reloadProfile, reloadBcvRate,
  getWalletBs, getWalletUSD,
} from './state.js';

// ── INYECCIÓN DEL EFECTO BRILLO PARA EL LOGO ──
const style = document.createElement('style');
style.innerHTML = `
  #header-title {
    position: relative;
    display: inline-block;
    overflow: hidden;
    text-shadow: 0 0 10px rgba(255, 0, 127, 0.4);
  }
  #header-title::after {
    content: '';
    position: absolute;
    top: 0;
    left: -150%;
    width: 60%;
    height: 100%;
    background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.8), transparent);
    transform: skewX(-25deg);
    animation: logo-shine 6s ease-in-out infinite; 
  }
  @keyframes logo-shine {
    0% { left: -150%; }
    40% { left: 150%; } 
    100% { left: 150%; } 
  }
`;
document.head.appendChild(style);

// ── DOM refs ───────────────────────────────────────────
const $loadingScreen  = document.getElementById('loading-screen');
const $loadingBar     = document.getElementById('loading-bar');
const $loadingStatus  = document.getElementById('loading-status');
const $appHeader      = document.getElementById('app-header');
const $headerWallet   = document.getElementById('header-wallet');
const $headerUser     = document.getElementById('header-user');
const $modalOverlay   = document.getElementById('modal-overlay');
const $modalContent   = document.getElementById('modal-content');
const $toastContainer = document.getElementById('toast-container');
const $fab            = document.getElementById('fab-whatsapp');
const $footerTrigger  = document.getElementById('footer-trigger');

// 🌓 REFS DEL BOTÓN DE TEMA
const $btnThemeToggle = document.getElementById('btn-theme-toggle');
const $iconSun        = document.getElementById('icon-sun');
const $iconMoon       = document.getElementById('icon-moon');

const $views = {
  auth:        document.getElementById('view-auth'),
  dashboard:   document.getElementById('view-dashboard'),
  matchmaking: document.getElementById('view-matchmaking'),
  game:        document.getElementById('view-game'),
  admin:       document.getElementById('view-admin'),
};

// ── LÓGICA DEL TEMA CLARO/OSCURO ──────────────────────
function applyTheme(theme) {
  const isLight = theme === 'light';
  if (isLight) {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    if ($iconSun) $iconSun.classList.add('hidden');
    if ($iconMoon) $iconMoon.classList.remove('hidden');
  } else {
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
    if ($iconSun) $iconSun.classList.remove('hidden');
    if ($iconMoon) $iconMoon.classList.add('hidden');
  }
}

async function toggleTheme() {
  const isLight = document.documentElement.classList.contains('light');
  const newTheme = isLight ? 'dark' : 'light';
  
  // Cambia instantáneamente en la pantalla
  applyTheme(newTheme);
  localStorage.setItem('cw_theme', newTheme);

  // Manda a guardar a Supabase de fondo si el usuario está logueado
  const session = getSession();
  if (session?.user) {
    try {
      await getSupabase().from('users').update({ theme: newTheme }).eq('id', session.user.id);
      const profile = getProfile();
      if (profile) profile.theme = newTheme;
    } catch(e) { console.error("Error guardando tema en BD", e); }
  }
}

// ── View init registry ────────────────────────────────
const _viewInits = {};
export function registerView(name, initFn) { _viewInits[name] = initFn; }

// ── Loading sequence ──────────────────────────────────
const STEPS = [
  { pct: 15, msg: 'INICIANDO NÚCLEO…'      },
  { pct: 30, msg: 'CONECTANDO SUPABASE…'   },
  { pct: 50, msg: 'CARGANDO ARENA…'        },
  { pct: 70, msg: 'CALIBRANDO MOTOR…'      },
  { pct: 88, msg: 'SINCRONIZANDO DATOS…'   },
  { pct: 100, msg: 'SISTEMA LISTO'         },
];

async function runLoader() {
  for (const s of STEPS) {
    $loadingBar.style.width    = s.pct + '%';
    $loadingStatus.textContent = s.msg;
    await sleep(260 + Math.random() * 160);
  }
  await sleep(180);
}

// ── BOOT ──────────────────────────────────────────────
export async function boot() {
  // Inicializamos el tema desde la memoria apenas arranca el motor
  const savedTheme = localStorage.getItem('cw_theme') || 'dark';
  applyTheme(savedTheme);
  if ($btnThemeToggle) $btnThemeToggle.addEventListener('click', toggleTheme);

  await runLoader();

  // Hide loader
  $loadingScreen.classList.add('fade-out');
  setTimeout(() => { $loadingScreen.style.display = 'none'; }, 700);

  // Particles
  spawnParticles();

  // Footer triple-click → admin
  setupFooterTrigger();

  // Subscribe router to view changes
  subscribe('currentView', (v) => renderView(v));
  subscribe('session',     ()  => updateHeader());
  subscribe('profile',     ()  => updateHeader());

  // Auth state listener (Supabase)
  const sb = getSupabase();
  sb.auth.onAuthStateChange(async (event, session) => {
    setSession(session);

    if (session?.user) {
      await reloadProfile();
      await reloadBcvRate();

      const profile = getProfile();
      if (!profile) {
        setView('auth');
        return;
      }

      // 🌓 SINCRONIZACIÓN MAESTRA DE TEMA:
      // Si el perfil en Supabase tiene un tema guardado distinto al del celular, la nube manda.
      if (profile.theme && profile.theme !== (localStorage.getItem('cw_theme') || 'dark')) {
        applyTheme(profile.theme);
        localStorage.setItem('cw_theme', profile.theme);
      }

      if (profile.role === 'admin') {
        setView('admin');
      } else {
        setView('dashboard');
      }
    } else {
      setView('auth');
    }
  });

  // Check existing session
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    setView('auth');
  }
}

// ── Router ─────────────────────────────────────────────
let _activeView = null;

async function renderView(viewKey) {
  if (viewKey === 'loading') return;

  Object.values($views).forEach(el => {
    if (el) { el.classList.add('hidden'); el.classList.remove('active','has-header'); }
  });

  const $target = $views[viewKey];
  if (!$target) { console.warn('[Router] Unknown view:', viewKey); return; }

  // Header & FAB
  updateHeader(viewKey);
  updateFab(viewKey);

  $target.classList.remove('hidden');
  const needsHeader = ['dashboard','admin','game','matchmaking'].includes(viewKey);
  if (needsHeader) $target.classList.add('has-header');

  await sleep(20);
  $target.classList.add('active');

  _activeView = viewKey;

  try {
    if (_viewInits[viewKey]) {
      await _viewInits[viewKey]($target);
    }
  } catch (err) {
    console.error(`[Router] Error in view "${viewKey}":`, err);
    showToast('Error cargando la vista. Recarga la página.', 'error');
  }
}

// ── Header ────────────────────────────────────────────
function updateHeader(viewKey) {
  const v = viewKey || _activeView;
  const show = ['dashboard','admin','game','matchmaking'].includes(v);

  if (!show) {
    $appHeader.classList.add('hidden');
    $appHeader.classList.remove('visible');
    return;
  }
  $appHeader.classList.remove('hidden');
  $appHeader.classList.add('visible');

  const profile = getProfile();

  $headerWallet.classList.add('hidden');
  $headerWallet.innerHTML = '';

  $headerUser.classList.remove('hidden');
  const name = profile?.username || getSession()?.user?.email || '?';
  const isAdmin = profile?.role === 'admin';

  $headerUser.innerHTML = `
    <div style="display:flex;align-items:center;gap:.65rem;">
      ${isAdmin ? `<span class="badge badge-pending" style="border-color:rgba(255,0,127,.4);color:var(--pink);background:rgba(255,0,127,.1);">⚡ ADMIN</span>` : `<span style="font-family:var(--font-mono);font-size:.72rem;color:var(--text-base);display:flex;align-items:center;gap:.3rem;"><span style="color:var(--purple);">◈</span>${escHtml(name)}</span>`}
      <button class="btn btn-ghost" style="padding:.35rem .8rem;font-size:.62rem;" onclick="window.__CW_logout()">Salir</button>
    </div>`;
}

function updateFab(viewKey) {
  if (viewKey === 'game') {
    $fab?.classList.add('hidden-fab');
  } else {
    $fab?.classList.remove('hidden-fab');
  }
}

window.__CW_logout = async () => {
  const sb = getSupabase();
  await sb.auth.signOut();
  showToast('Sesión cerrada.', 'info');
};

// ── Modal ─────────────────────────────────────────────
export function showModal(html, { closable = true } = {}) {
  $modalContent.innerHTML = html;
  $modalOverlay.classList.remove('hidden');
  $modalOverlay.offsetHeight; 
  $modalOverlay.classList.add('visible');

  if (closable) {
    const close = (e) => { if (e.target === $modalOverlay) { hideModal(); $modalOverlay.removeEventListener('click', close); } };
    $modalOverlay.addEventListener('click', close);
  }

  $modalContent.querySelector('.modal-close')?.addEventListener('click', hideModal);
}

export function hideModal() {
  $modalOverlay.classList.remove('visible');
  setTimeout(() => { $modalOverlay.classList.add('hidden'); $modalContent.innerHTML = ''; }, 360);
}

window.__CW_hideModal = hideModal;
window.__CW_showModal = showModal;

// ── Toast ─────────────────────────────────────────────
export function showToast(msg, type = 'info', duration = 4000) {
  const icons   = { success:'✓', error:'✕', warning:'⚠', info:'◈' };
  const colors  = { success:'#00b86c', error:'var(--pink)', warning:'#ffaa00', info:'var(--blue)' };

  const $t = document.createElement('div');
  $t.className = `toast toast-${type}`;
  $t.innerHTML = `
    <span style="font-size:.95rem;color:${colors[type]};flex-shrink:0;">${icons[type]}</span>
    <span style="flex:1;font-size:.86rem;line-height:1.4;">${escHtml(msg)}</span>
    <button style="background:none;border:none;color:var(--text-ghost);cursor:pointer;font-size:.82rem;flex-shrink:0;"
      onclick="this.closest('.toast').remove()" aria-label="Cerrar">✕</button>`;
  $toastContainer.appendChild($t);

  const timer = setTimeout(() => { $t.classList.add('toast-out'); setTimeout(() => $t.remove(), 360); }, duration);
  $t.querySelector('button').addEventListener('click', () => clearTimeout(timer));
}

window.__CW_showToast = showToast;

// ── Footer triple-click admin ─────────────────────────
function setupFooterTrigger() {
  let count = 0, timer = null;
  $footerTrigger?.addEventListener('click', () => {
    count++;
    clearTimeout(timer);
    if (count >= 3) { count = 0; promptAdminAccess(); return; }
    timer = setTimeout(() => { count = 0; }, 650);
  });
}

function promptAdminAccess() {
  const profile = getProfile();
  if (profile?.role === 'admin') { setView('admin'); return; }

  showModal(`
    <button class="modal-close" onclick="window.__CW_hideModal()">✕</button>
    <div class="modal-title"><span style="color:var(--pink)">⚡</span> ACCESO RESTRINGIDO</div>
    <p style="font-family:var(--font-mono);font-size:.7rem;color:var(--text-dim);margin-bottom:1.1rem;">
      Inicia sesión con una cuenta de administrador.
    </p>
    <button class="btn btn-primary" style="width:100%;" onclick="window.__CW_hideModal();window.__CW_setView('auth')">
      IR AL LOGIN
    </button>`, { closable: true });
}

window.__CW_setView = setView;

// ── Particles ─────────────────────────────────────────
function spawnParticles() {
  const $p = document.getElementById('bg-particles');
  if (!$p) return;
  const colors = ['#7000FF','#00E5FF','#FF007F'];
  for (let i = 0; i < 18; i++) {
    const el    = document.createElement('div');
    el.className = 'bg-particle';
    const c     = colors[i % colors.length];
    const sz    = 1 + Math.random() * 2;
    const dur   = 14 + Math.random() * 18;
    const delay = Math.random() * -22;
    const drift = (Math.random() - .5) * 110;
    el.style.cssText = `left:${Math.random()*100}%;bottom:-4px;width:${sz}px;height:${sz}px;
      background:${c};box-shadow:0 0 ${sz*3}px ${c};--drift:${drift}px;
      animation-duration:${dur}s;animation-delay:${delay}s;`;
    $p.appendChild(el);
  }
}

// ── Utilities ─────────────────────────────────────────
export function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function formatTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2,'0')}`;
}

export async function copyToClipboard(text, $btn) {
  try {
    await navigator.clipboard.writeText(text);
    if ($btn) {
      const orig = $btn.textContent;
      $btn.textContent = '✓ Copiado'; $btn.classList.add('copied');
      setTimeout(() => { $btn.textContent = orig; $btn.classList.remove('copied'); }, 2000);
    }
    showToast('Copiado.', 'success', 1800);
  } catch { showToast('Copia manualmente.', 'warning'); }
}

export function getNeighbors(row, col, size = 5) {
  return [[-1,0],[1,0],[0,-1],[0,1]]
    .map(([dr,dc]) => ({ row: row+dr, col: col+dc }))
    .filter(({row: r, col: c}) => r >= 0 && r < size && c >= 0 && c < size);
}

window.__CW_copyToClipboard = copyToClipboard;
