import { registerView, showToast, escHtml } from '../core/app.js';
import { getProfile, setProfile, setView } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

registerView('matchmaking', initMatchmaking);

let _searchTimer = null; let _countdownTimer = null; let _pollTimer = null; let _currentMatchId = null; 
const ENTRY_FEE = 30; const SEARCH_TIMEOUT_MS = 20000; 
const VZLA_NAMES = ["Maikol", "El Bryan", "La Catira", "Yuridia", "El Gocho", "La Chama", "Yuleisi", "El Chino", "Juancho", "Dayana", "El Portugués", "El Convive", "Yordano", "Cristian"];

export async function initMatchmaking($container) {
  clearTimeout(_searchTimer); clearInterval(_countdownTimer); clearInterval(_pollTimer); 
  _searchTimer = null; _countdownTimer = null; _pollTimer = null; _currentMatchId = null;
  window.CW_SESSION = null; 
  
  const profile = getProfile();
  if (!profile) { setView('auth'); return; }
  if (profile.wallet_bs < ENTRY_FEE) { showToast(`Saldo insuficiente. Necesitas ${ENTRY_FEE} CP.`, 'error'); setView('dashboard'); return; }
  
  renderSearchScreen($container);
  try { await getSupabase().rpc('limpiar_fantasmas', { jugador_id: profile.id }); } catch (e) {}
  startSearch($container, profile);
}

function renderSearchScreen($c) {
  $c.innerHTML = `
  <div class="mm-screen">
    <div style="display:flex; flex-direction:column; align-items:center; gap:2rem;">
      <div class="mm-ring"><span style="font-size:1.5rem;">⚔️</span></div>
      <div style="text-align:center;">
        <h2 style="font-family:var(--font-display); font-size:1.2rem; letter-spacing:0.2em; color:var(--text-bright); margin-bottom:0.5rem;">BUSCANDO RIVAL</h2>
        <p style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim); text-transform:uppercase;">Conectando con la arena...</p>
      </div>
      <button id="btn-cancel-search" class="btn btn-ghost" style="margin-top:2rem;">✕ CANCELAR</button>
    </div>
  </div>`;
  
  $c.querySelector('#btn-cancel-search').addEventListener('click', () => {
      const $btn = document.getElementById('btn-cancel-search');
      if($btn) { $btn.textContent = "CANCELANDO..."; $btn.disabled = true; }
      
      clearTimeout(_searchTimer); clearInterval(_countdownTimer); clearInterval(_pollTimer); 
      _searchTimer = null; _countdownTimer = null; _pollTimer = null;
      
      window.sessionStorage.setItem('cw_skip_recon', '1');
      if (_currentMatchId) { getSupabase().from('matches').update({ status: 'cancelled' }).eq('id', _currentMatchId).then(); }
      _currentMatchId = null; window.CW_SESSION = null;
      setView('dashboard'); 
  });
}

async function payEntryFee() {
  const profile = getProfile();
  try {
    const { data: cobroExitoso } = await getSupabase().rpc('cobrar_entrada', { jugador_id: profile.id, costo: ENTRY_FEE });
    if (cobroExitoso) setProfile({ ...profile, wallet_bs: Number(profile.wallet_bs) - ENTRY_FEE });
  } catch(e) {}
}

async function startSearch($c, profile) {
  const sb = getSupabase();
  try {
    const { data: waitingMatch, error: findErr } = await sb.from('matches').select('*').eq('status', 'waiting').neq('player_pink', profile.id).limit(1).maybeSingle();
    
    // 🔥 CIRUGÍA: Verificamos si pudimos unirnos sin error de seguridad (RLS)
    if (waitingMatch && !findErr) {
      const { data: joinedMatch, error: joinErr } = await sb.from('matches').update({ player_blue: profile.id, status: 'playing', match_start_time: new Date().toISOString(), last_move_time: new Date().toISOString() }).eq('id', waitingMatch.id).select().single();
      
      if (joinErr || !joinedMatch) throw new Error("Fallo de unión segura"); // Forzamos ir al catch para crear sala propia
        
      await payEntryFee();
      const { data: oppData } = await sb.from('users').select('username').eq('id', waitingMatch.player_pink).single();
      window.CW_SESSION = { isBotMatch: false, matchId: joinedMatch.id, myColor: 'blue', rivalName: oppData?.username || "Jugador", board: Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0 }))) };
      renderCountdownScreen($c, profile.username, window.CW_SESSION.rivalName, "Juegas de segundo (AZUL)"); startCountdown($c);
    } else {
      await createOwnRoom($c, profile, sb);
    }
  } catch (err) { 
    // 🔥 CIRUGÍA: Si falla al unirse, NO abortamos, creamos sala propia o jugamos contra Bot.
    await createOwnRoom($c, profile, sb); 
  }
}

async function createOwnRoom($c, profile, sb) {
  try {
      const { data: newMatch, error: createErr } = await sb.from('matches').insert([{ player_pink: profile.id, status: 'waiting' }]).select().single();
      if (createErr || !newMatch) throw new Error("Error db");
      
      _currentMatchId = newMatch.id;
      _pollTimer = setInterval(async () => {
        try {
          const { data: checkData } = await sb.from('matches').select('status, player_blue').eq('id', _currentMatchId).single();
          if (checkData && checkData.status === 'playing' && checkData.player_blue !== 'BOT') {
            clearInterval(_pollTimer); clearTimeout(_searchTimer); await payEntryFee();
            const { data: oppData } = await sb.from('users').select('username').eq('id', checkData.player_blue).single();
            window.CW_SESSION = { isBotMatch: false, matchId: _currentMatchId, myColor: 'pink', rivalName: oppData?.username || "Jugador", board: Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0 }))) };
            renderCountdownScreen($c, profile.username, window.CW_SESSION.rivalName, "Empiezas tú (ROSA)"); startCountdown($c);
          }
        } catch(e) {}
      }, 1500);
      
      _searchTimer = setTimeout(() => { clearInterval(_pollTimer); setupBotMatchFallback($c, profile); }, SEARCH_TIMEOUT_MS); 
  } catch(e) {
      // Si todo falla (ej. sin internet total), volver al menú
      clearInterval(_pollTimer); clearTimeout(_searchTimer);
      window.CW_SESSION = null; setView('dashboard'); showToast('Error de servidor. Intenta de nuevo.', 'error');
  }
}

async function setupBotMatchFallback($c, profile) {
  const sb = getSupabase();
  try {
    if(_currentMatchId) {
        const {data: checkMatch} = await sb.from('matches').select('status').eq('id', _currentMatchId).single();
        if(!checkMatch || checkMatch.status === 'cancelled') return; // Canceló manualmente
    }
    const isUserPink = Math.random() > 0.5; const randomName = VZLA_NAMES[Math.floor(Math.random() * VZLA_NAMES.length)]; const startTime = new Date().toISOString();
    if (_currentMatchId) { await sb.from('matches').update({ player_pink: isUserPink ? profile.id : 'BOT', player_blue: isUserPink ? 'BOT' : profile.id, status: 'playing', match_start_time: startTime, last_move_time: startTime }).eq('id', _currentMatchId); } 
    else { const { data: newMatch } = await sb.from('matches').insert([{ player_pink: isUserPink ? profile.id : 'BOT', player_blue: isUserPink ? 'BOT' : profile.id, status: 'playing', match_start_time: startTime, last_move_time: startTime }]).select().single(); _currentMatchId = newMatch.id; }
    await payEntryFee();
    window.CW_SESSION = { isBotMatch: true, matchId: _currentMatchId, botName: randomName, myColor: isUserPink ? 'pink' : 'blue', botColor: isUserPink ? 'blue' : 'pink', board: Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0 }))) };
    renderCountdownScreen($c, profile.username, randomName, isUserPink ? "Empiezas tú (ROSA)" : "Juegas de segundo (AZUL)"); startCountdown($c);
  } catch (err) { window.CW_SESSION = null; setView('dashboard'); }
}

function renderCountdownScreen($c, myName, rivalName, instruction) {
  $c.innerHTML = `<div class="mm-screen"><div style="display:flex; flex-direction:column; align-items:center; gap:1.5rem;"><div style="width:180px; height:180px; border-radius:50%; border:2px solid var(--border-ghost); display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; background: radial-gradient(circle, rgba(255,0,127,0.1) 0%, rgba(0,0,0,0) 70%);"><span style="font-family:var(--font-mono); font-size:0.7rem; color:var(--text-dim); margin-bottom:5px;">COMIENZA EN</span><span id="mm-count" class="mm-countdown" style="font-size: 3rem;">10</span></div><div style="text-align:center;"><h2 style="font-family:var(--font-display); font-size:1.1rem; color:var(--text-bright); margin-bottom:0.5rem; letter-spacing: 1px;"><span style="color:var(--pink);">${escHtml(myName || 'Tú')}</span> vs <span style="color:var(--blue);">${escHtml(rivalName)}</span></h2><p style="color:var(--text-dim); font-size:0.85rem; margin-top:10px; font-weight:bold; text-transform:uppercase; letter-spacing:1px;">${instruction}</p></div></div></div>`;
}

function startCountdown($c) {
  let count = 10; const $count = $c.querySelector('#mm-count');
  _countdownTimer = setInterval(() => { count--; if ($count) $count.textContent = count; if (count <= 0) { clearInterval(_countdownTimer); setView('game'); } }, 1000);
}
