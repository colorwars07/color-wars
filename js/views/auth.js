/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/views/auth.js
 * Auth: Login · Register · Reset Password (TOKEN FORZADO)
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast, escHtml, sleep } from '../core/app.js';
import { getSupabase }                             from '../core/supabase.js';
import { setView }                                 from '../core/state.js';

registerView('auth', initAuthView);

export async function initAuthView($container) {
  $container.innerHTML = buildHTML();
  attachEvents($container);

  const href = window.location.href;
  const sb = getSupabase();

  // 🚨 EL FIX: Leemos la URL a la fuerza apenas entramos.
  if (href.includes('type=recovery') || href.includes('access_token=') || href.includes('code=')) {
    activateRecoveryMode($container);

    // 🛠️ CIRUGÍA ANTI "Auth session missing!"
    // Arrancamos el token de la URL sin importar cómo Vercel lo deforma
    try {
        const accessMatch = href.match(/[?&#]access_token=([^&]+)/);
        const refreshMatch = href.match(/[?&#]refresh_token=([^&]+)/);

        if (accessMatch && refreshMatch) {
            // Flujo antiguo (Implicit)
            await sb.auth.setSession({
                access_token: accessMatch[1],
                refresh_token: refreshMatch[1]
            });
        } else {
            // Flujo nuevo (PKCE)
            const codeMatch = href.match(/[?&#]code=([^&]+)/);
            if (codeMatch) {
                await sb.auth.exchangeCodeForSession(codeMatch[1]);
            }
        }
    } catch(e) { console.error("Error forzando sesión:", e); }

  } else {
    setTimeout(() => $container.querySelector('#login-email')?.focus(), 120);
  }

  // Mantenemos el radar por si acaso
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      activateRecoveryMode($container);
    }
  });
}

// ── FUNCIÓN PARA MOSTRAR LA PANTALLA DE NUEVA CLAVE ──
function activateRecoveryMode($c) {
  const $loginForm = $c.querySelector('#form-login');
  const $registerForm = $c.querySelector('#form-register');
  const $resetPassForm = $c.querySelector('#form-reset-password');
  const $tabs = $c.querySelector('.auth-tabs');
  const $subtitle = $c.querySelector('.auth-subtitle');
  const $forgotBtn = $c.querySelector('#btn-forgot');

  if ($loginForm) $loginForm.style.display = 'none';
  if ($registerForm) $registerForm.style.display = 'none';
  if ($tabs) $tabs.style.display = 'none';
  if ($forgotBtn) $forgotBtn.style.display = 'none';

  if ($resetPassForm) $resetPassForm.style.display = '';
  if ($subtitle) {
    $subtitle.textContent = "CREA UNA NUEVA CONTRASEÑA";
    $subtitle.style.color = "var(--blue)"; 
  }

  setTimeout(() => $c.querySelector('#new-pass')?.focus(), 120);
}

// ── HTML ──────────────────────────────────────────────
function buildHTML() {
  return `
  <div class="auth-container">
    <div class="auth-box" id="auth-box">

      <div class="auth-logo">COLOR<span>WARS</span></div>
      <p class="auth-subtitle">Arena de Batallas Cromáticas</p>

      <div class="auth-tabs" role="tablist">
        <button class="auth-tab active" data-tab="login"    role="tab" aria-selected="true">Iniciar Sesión</button>
        <button class="auth-tab"        data-tab="register" role="tab" aria-selected="false">Registrarse</button>
      </div>

      <div id="form-login">
        <div class="field-group">
          <label class="field-label" for="login-email">Correo</label>
          <input id="login-email" type="email" class="input-field" placeholder="correo@ejemplo.com" autocomplete="email" />
          <span class="field-error" id="login-email-err"></span>
        </div>
        <div class="field-group">
          <label class="field-label" for="login-pass">Contraseña</label>
          <div class="input-wrapper">
            <input id="login-pass" type="password" class="input-field" placeholder="••••••••" autocomplete="current-password" />
            <button class="input-icon-right" type="button" data-toggle="login-pass" aria-label="Ver contraseña">${iconEye()}</button>
          </div>
          <span class="field-error" id="login-pass-err"></span>
        </div>
        <div id="login-global-err" class="field-error" style="margin-bottom:.75rem;"></div>
        <button id="btn-login" class="btn btn-primary" style="width:100%;height:46px;font-size:.76rem;letter-spacing:.14em;">
          INGRESAR
        </button>
        <div class="divider" style="margin-top:1.1rem;"><span class="divider-text" style="background:var(--surface-1);">o</span></div>
        <button id="btn-forgot" class="btn btn-ghost" style="width:100%;margin-top:.7rem;font-size:.65rem;">
          ¿Olvidaste tu contraseña?
        </button>
      </div>

      <div id="form-register" style="display:none;">
        <div class="field-group">
          <label class="field-label" for="reg-email">Correo</label>
          <input id="reg-email" type="email" class="input-field" placeholder="correo@ejemplo.com" autocomplete="email" />
          <span class="field-error" id="reg-email-err"></span>
        </div>
        <div class="field-group">
          <label class="field-label" for="reg-user">Nombre de usuario</label>
          <input id="reg-user" type="text" class="input-field" placeholder="mi_usuario" maxlength="20" autocapitalize="none" />
          <span class="field-error" id="reg-user-err"></span>
        </div>
        <div class="field-group">
          <label class="field-label" for="reg-pass">Contraseña</label>
          <div class="input-wrapper">
            <input id="reg-pass" type="password" class="input-field" placeholder="mín. 6 caracteres" autocomplete="new-password" />
            <button class="input-icon-right" type="button" data-toggle="reg-pass" aria-label="Ver contraseña">${iconEye()}</button>
          </div>
          <span class="field-error" id="reg-pass-err"></span>
        </div>
        <div class="field-group">
          <label class="field-label" for="reg-confirm">Confirmar contraseña</label>
          <div class="input-wrapper">
            <input id="reg-confirm" type="password" class="input-field" placeholder="repite la contraseña" autocomplete="new-password" />
            <button class="input-icon-right" type="button" data-toggle="reg-confirm" aria-label="Ver contraseña">${iconEye()}</button>
          </div>
          <span class="field-error" id="reg-confirm-err"></span>
        </div>
        <div id="reg-global-err" class="field-error" style="margin-bottom:.75rem;"></div>
        <button id="btn-register" class="btn btn-primary" style="width:100%;height:46px;font-size:.76rem;letter-spacing:.14em;">
          CREAR CUENTA
        </button>
      </div>

      <div id="form-reset-password" style="display:none;">
        <div class="field-group">
          <label class="field-label" for="new-pass">Nueva Contraseña</label>
          <div class="input-wrapper">
            <input id="new-pass" type="password" class="input-field" placeholder="mín. 6 caracteres" autocomplete="new-password" />
            <button class="input-icon-right" type="button" data-toggle="new-pass" aria-label="Ver contraseña">${iconEye()}</button>
          </div>
          <span class="field-error" id="new-pass-err"></span>
        </div>
        <div class="field-group">
          <label class="field-label" for="new-confirm">Confirmar contraseña</label>
          <div class="input-wrapper">
            <input id="new-confirm" type="password" class="input-field" placeholder="repite la contraseña" autocomplete="new-password" />
            <button class="input-icon-right" type="button" data-toggle="new-confirm" aria-label="Ver contraseña">${iconEye()}</button>
          </div>
          <span class="field-error" id="new-confirm-err"></span>
        </div>
        <div id="reset-global-err" class="field-error" style="margin-bottom:.75rem;"></div>
        <button id="btn-save-new-pass" class="btn btn-primary" style="width:100%;height:46px;font-size:.76rem;letter-spacing:.14em;background:linear-gradient(90deg, #00f0ff, #0055ff);color:white;border:none;">
          GUARDAR CLAVE
        </button>
      </div>

    </div></div>`;
}

// ── Events ────────────────────────────────────────────
function attachEvents($c) {
  $c.querySelectorAll('.auth-tab').forEach($t => {
    $t.addEventListener('click', () => switchTab($t.dataset.tab, $c));
  });

  $c.querySelectorAll('[data-toggle]').forEach($btn => {
    $btn.addEventListener('click', () => {
      const $inp = $c.querySelector(`#${$btn.dataset.toggle}`);
      if (!$inp) return;
      const show = $inp.type === 'password';
      $inp.type   = show ? 'text' : 'password';
      $btn.innerHTML = show ? iconEyeOff() : iconEye();
      $inp.focus();
    });
  });

  $c.querySelector('#login-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin($c); });
  $c.querySelector('#reg-confirm')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleRegister($c); });
  $c.querySelector('#new-confirm')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleResetPassword($c); });

  $c.querySelector('#btn-login')?.addEventListener('click',    () => handleLogin($c));
  $c.querySelector('#btn-register')?.addEventListener('click', () => handleRegister($c));
  $c.querySelector('#btn-forgot')?.addEventListener('click',   () => handleForgot($c));
  $c.querySelector('#btn-save-new-pass')?.addEventListener('click', () => handleResetPassword($c));
}

function switchTab(tab, $c) {
  $c.querySelectorAll('.auth-tab').forEach($t => {
    const active = $t.dataset.tab === tab;
    $t.classList.toggle('active', active);
    $t.setAttribute('aria-selected', active);
  });
  $c.querySelector('#form-login').style.display    = tab === 'login'    ? '' : 'none';
  $c.querySelector('#form-register').style.display = tab === 'register' ? '' : 'none';
  $c.querySelector('#form-reset-password').style.display = 'none'; 
  clearErrors($c);
  setTimeout(() => {
    $c.querySelector(tab === 'login' ? '#login-email' : '#reg-email')?.focus();
  }, 60);
}

// ── Login ─────────────────────────────────────────────
async function handleLogin($c) {
  clearErrors($c);
  const email = $c.querySelector('#login-email').value.trim();
  const pass  = $c.querySelector('#login-pass').value;
  const $btn  = $c.querySelector('#btn-login');

  let ok = true;
  if (!isEmail(email)) { showErr($c,'login-email-err','Correo inválido.'); ok = false; }
  if (!pass)           { showErr($c,'login-pass-err','Contraseña requerida.'); ok = false; }
  if (!ok) return;

  setBtnLoading($btn, true, 'INGRESANDO…');
  const sb = getSupabase();

  const { error } = await sb.auth.signInWithPassword({ email, password: pass });

  setBtnLoading($btn, false, 'INGRESAR');

  if (error) {
    const msg = error.message.includes('Invalid login') ? 'Correo o contraseña incorrectos.' : error.message;
    showErr($c, 'login-global-err', msg);
    shakeBox();
  }
}

// ── Register ──────────────────────────────────────────
async function handleRegister($c) {
  clearErrors($c);
  const email   = $c.querySelector('#reg-email').value.trim();
  const user    = $c.querySelector('#reg-user').value.trim();
  const pass    = $c.querySelector('#reg-pass').value;
  const confirm = $c.querySelector('#reg-confirm').value;
  const $btn    = $c.querySelector('#btn-register');

  let ok = true;
  if (!isEmail(email))        { showErr($c,'reg-email-err','Correo inválido.'); ok = false; }
  if (!user || user.length<3) { showErr($c,'reg-user-err','Mín. 3 caracteres.'); ok = false; }
  if (/[^a-zA-Z0-9_.-]/.test(user)) { showErr($c,'reg-user-err','Solo letras, números, _ y .'); ok = false; }
  if (!pass || pass.length<6) { showErr($c,'reg-pass-err','Mín. 6 caracteres.'); ok = false; }
  if (pass !== confirm)       { showErr($c,'reg-confirm-err','Las contraseñas no coinciden.'); ok = false; }
  if (!ok) return;

  setBtnLoading($btn, true, 'CREANDO…');
  const sb = getSupabase();

  const { data: authData, error: authErr } = await sb.auth.signUp({
    email,
    password: pass,
    options: { 
      data: { username: user },
      emailRedirectTo: 'https://color-wars-mu.vercel.app/#auth' 
    },
  });

  if (authErr) {
    setBtnLoading($btn, false, 'CREAR CUENTA');
    const msg = authErr.message.includes('already registered') ? 'Ese correo ya está registrado.' : authErr.message;
    showErr($c, 'reg-global-err', msg);
    shakeBox();
    return;
  }

  if (authData?.user) {
    const { error: insertErr } = await sb.from('users').insert({
      id:       authData.user.id,
      email,
      username: user,
      role:     'player',
      wallet_bs: 0,
      wins:      0,
      losses:    0,
    });

    if (insertErr && !insertErr.message.includes('duplicate')) {
      console.error('[Auth] Error creando billetera:', insertErr);
      showErr($c, 'reg-global-err', 'Error sincronizando billetera. Contacta a soporte.');
      setBtnLoading($btn, false, 'CREAR CUENTA');
      return;
    }
  }

  setBtnLoading($btn, false, 'CREAR CUENTA');
  showToast(`¡Cuenta creada! Revisa tu correo para confirmar.`, 'success', 6000);
}

// ── Forgot Password (CON TIMER DE 30s) ─────────────────
async function handleForgot($c) {
  const email = $c.querySelector('#login-email').value.trim();
  const $btn = $c.querySelector('#btn-forgot');

  if ($btn.disabled) return;

  if (!isEmail(email)) {
    showErr($c, 'login-email-err', 'Ingresa tu correo primero.');
    $c.querySelector('#login-email').focus();
    return;
  }

  setBtnLoading($btn, true, 'ENVIANDO…');
  const sb = getSupabase();

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://color-wars-mu.vercel.app/#auth',
  });

  if (error) {
    setBtnLoading($btn, false, '¿Olvidaste tu contraseña?');
    showToast('Error al enviar el correo. Intenta de nuevo.', 'error');
  } else {
    showToast('Revisa tu bandeja de entrada para recuperar tu acceso.', 'success', 6000);
    
    let cooldownTime = 30;
    $btn.disabled = true;
    $btn.style.opacity = '0.5';
    $btn.textContent = `REINTENTAR EN ${cooldownTime}s`;

    const timer = setInterval(() => {
      cooldownTime--;
      if (cooldownTime <= 0) {
        clearInterval(timer);
        setBtnLoading($btn, false, '¿Olvidaste tu contraseña?');
      } else {
        $btn.textContent = `REINTENTAR EN ${cooldownTime}s`;
      }
    }, 1000);
  }
}

// ── GUARDAR NUEVA CONTRASEÑA ──────────────────────────
async function handleResetPassword($c) {
  clearErrors($c);
  const pass    = $c.querySelector('#new-pass').value;
  const confirm = $c.querySelector('#new-confirm').value;
  const $btn    = $c.querySelector('#btn-save-new-pass');

  let ok = true;
  if (!pass || pass.length<6) { showErr($c,'new-pass-err','Mín. 6 caracteres.'); ok = false; }
  if (pass !== confirm)       { showErr($c,'new-confirm-err','Las contraseñas no coinciden.'); ok = false; }
  if (!ok) return;

  setBtnLoading($btn, true, 'GUARDANDO…');
  const sb = getSupabase();

  const { error } = await sb.auth.updateUser({ password: pass });

  setBtnLoading($btn, false, 'GUARDAR CLAVE');

  if (error) {
    showErr($c, 'reset-global-err', error.message);
    shakeBox();
  } else {
    showToast('¡Contraseña actualizada con éxito!', 'success', 3000);
    
    // Limpiar la URL para que no vuelva a entrar en modo recuperación por accidente
    window.history.replaceState({}, document.title, "/#auth");
    
    setTimeout(() => {
        setView('dashboard');
    }, 1500);
  }
}

// ── Helpers (NO TOCAR) ──────────────────────────────────
function showErr($c, id, msg) { const $el = $c.querySelector(`#${id}`); if ($el) $el.textContent = msg; }
function clearErrors($c) { $c.querySelectorAll('.field-error').forEach($e => { $e.textContent = ''; }); }
function setBtnLoading($btn, loading, label) {
  if (!$btn) return;
  $btn.disabled = loading;
  $btn.textContent = label;
  $btn.style.opacity = loading ? '.65' : '1';
}
function shakeBox() {
  const $box = document.querySelector('.auth-box');
  if (!$box) return;
  $box.style.animation = 'none';
  $box.offsetHeight;
  $box.style.animation = 'shake .4s ease both';
}
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function iconEye() { return `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`; }
function iconEyeOff() { return `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`; }

if (!document.getElementById('_cw_shake')) {
  const $s = document.createElement('style');
  $s.id = '_cw_shake';
  $s.textContent = `@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}`;
  document.head.appendChild($s);
}
