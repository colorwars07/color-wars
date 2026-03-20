/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/views/matchmaking.js
 * EMPAREJAMIENTO INMERSIVO + RULETA DE COLORES (50/50)
 * ═══════════════════════════════════════════════════════
 */
import { registerView, showToast, escHtml } from '../core/app.js';
import { getProfile, setProfile, setView } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

registerView('matchmaking', initMatchmaking);

let _searchTimer = null;
let _countdownTimer = null;
let _matchChannel = null;   
let _currentMatchId = null; 
const ENTRY_FEE = 30; 

const VZLA_NAMES = [
  "Maikol", "El Bryan", "La Catira", "Yuridia", "El Gocho", "La Chama", "Yuleisi",
  "El Chino", "Juancho", "Dayana", "El Portugués", "El Convive", "Yordano", "Cristian"
];

export async function initMatchmaking($container) {
  const profile = getProfile();
  if (!profile) { setView('auth'); return; }

  if (profile.wallet_bs < ENTRY_FEE) {
    showToast(`Saldo insuficiente. Necesitas ${ENTRY_FEE} CP.`, 'error');
    setView('dashboard');
    return;
  }

  _currentMatchId = null;
  renderSearchScreen($container);
  
  try {
      const sb = getSupabase();
      await sb.rpc('limpiar_fantasmas', { jugador_id: profile.id });
  } catch (e) { console.error("Limpiador falló:", e); }

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
  $c.querySelector('#btn-cancel-search').addEventListener('click', cancelSearch);
}

async function payEntryFee() {
  const profile = getProfile();
  const sb = getSupabase();
  try {
    const { data: cobroExitoso, error } = await sb.rpc('cobrar_entrada', {
      jugador_id: profile.id, costo: ENTRY_FEE
    });
    if (error) throw error;
    if (cobroExitoso) {
      const newBalance = Number(profile.wallet_bs) - ENTRY_FEE;
      setProfile({ ...profile, wallet_bs: newBalance });
    }
  } catch(e) { console.error("Error cobrando:", e); }
}

async function startSearch($c, profile) {
  const sb = getSupabase();

  try {
    const { data: waitingMatch, error: searchErr } = await sb
      .from('matches')
      .select('*')
      .eq('status', 'waiting')
      .neq('player_pink', profile.id) 
      .limit(1)
      .maybeSingle();

    if (searchErr) throw searchErr;

    if (waitingMatch) {
      await sb.from('matches').update({ player_blue: profile.id, status: 'playing' }).eq('id', waitingMatch.id);
      await payEntryFee();

      const { data: oppData } = await sb.from('users').select('username').eq('id', waitingMatch.player_pink).single();
      const rivalName = oppData?.username || "Jugador";

      window.CW_SESSION = {
        isBotMatch: false, matchId: waitingMatch.id, myColor: 'blue', rivalName: rivalName,
        board: Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0 })))
      };

      renderCountdownScreen($c, profile.username, rivalName, "Juegas de segundo (AZUL)");
      startCountdown($c);

    } else {
      const { data: newMatch, error: insertErr } = await sb.from('matches').insert([{
        player_pink: profile.id, status: 'waiting'
      }]).select().single();

      if (insertErr) throw insertErr;
      _currentMatchId = newMatch.id;

      _matchChannel = sb.channel(`match_${newMatch.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${newMatch.id}` }, async (payload) => {
          if (payload.new.status === 'playing' && payload.new.player_blue !== 'BOT' && payload.new.player_pink !== 'BOT') {
            clearTimeout(_searchTimer); sb.removeChannel(_matchChannel); 
            await payEntryFee();

            const { data: oppData } = await sb.from('users').select('username').eq('id', payload.new.player_blue).single();
            const rivalName = oppData?.username || "Jugador";

            window.CW_SESSION = {
              isBotMatch: false, matchId: newMatch.id, myColor: 'pink', rivalName: rivalName,
              board: Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0 })))
            };

            renderCountdownScreen($c, profile.username, rivalName, "Empiezas tú (ROSA)");
            startCountdown($c);
          }
        }).subscribe();

      _searchTimer = setTimeout(() => { setupBotMatchFallback($c, profile); }, 15000); 
    }
  } catch (err) { setView('dashboard'); }
}

function cancelSearch() {
  const $btn = document.getElementById('btn-cancel-search');
  if($btn) { $btn.textContent = "CANCELANDO..."; $btn.style.opacity = '0.5'; $btn.style.pointerEvents = 'none'; }
  clearTimeout(_searchTimer); clearTimeout(_countdownTimer);
  const sb = getSupabase();
  if (_matchChannel) sb.removeChannel(_matchChannel);
  if (_currentMatchId) { sb.from('matches').update({ status: 'cancelled' }).eq('id', _currentMatchId); }
  _currentMatchId = null; setView('dashboard');
}

async function setupBotMatchFallback($c, profile) {
  const sb = getSupabase();
  if (_matchChannel) sb.removeChannel(_matchChannel);

  try {
    if(_currentMatchId) {
        const {data: checkMatch} = await sb.from('matches').select('status').eq('id', _currentMatchId).single();
        if(!checkMatch || checkMatch.status === 'cancelled') return; 
    }
    
    // 🎲 LA RULETA: 50% chance de ser Rosa, 50% chance de ser Azul
    const isUserPink = Math.random() > 0.5;
    const randomName = VZLA_NAMES[Math.floor(Math.random() * VZLA_NAMES.length)];
    
    if (_currentMatchId) {
      await sb.from('matches').update({ 
        player_pink: isUserPink ? profile.id : 'BOT',
        player_blue: isUserPink ? 'BOT' : profile.id,
        status: 'playing' 
      }).eq('id', _currentMatchId);
    }

    await payEntryFee();

    window.CW_SESSION = {
      isBotMatch: true,
      matchId: _currentMatchId,
      botName: randomName,
      myColor: isUserPink ? 'pink' : 'blue',
      botColor: isUserPink ? 'blue' : 'pink',
      board: Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0 })))
    };

    const instruction = isUserPink ? "Empiezas tú (ROSA)" : "Juegas de segundo (AZUL)";
    renderCountdownScreen($c, profile.username, randomName, instruction);
    startCountdown($c);
    
  } catch (err) { setView('dashboard'); }
}

function renderCountdownScreen($c, myName, rivalName, instruction) {
  $c.innerHTML = `
  <div class="mm-screen">
    <div style="display:flex; flex-direction:column; align-items:center; gap:1.5rem;">
      <div style="width:180px; height:180px; border-radius:50%; border:2px solid var(--border-ghost); display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; background: radial-gradient(circle, rgba(255,0,127,0.1) 0%, rgba(0,0,0,0) 70%);">
        <span style="font-family:var(--font-mono); font-size:0.7rem; color:var(--text-dim); margin-bottom:5px;">COMIENZA EN</span>
        <span id="mm-count" class="mm-countdown" style="font-size: 3rem;">10</span>
      </div>
      <div style="text-align:center;">
        <h2 style="font-family:var(--font-display); font-size:1.1rem; color:var(--text-bright); margin-bottom:0.5rem; letter-spacing: 1px;">
          <span style="color:var(--pink);">${escHtml(myName || 'Tú')}</span> vs <span style="color:var(--blue);">${escHtml(rivalName)}</span>
        </h2>
        <p style="color:var(--text-dim); font-size:0.85rem; margin-top:10px; font-weight:bold; text-transform:uppercase; letter-spacing:1px;">${instruction}</p>
      </div>
    </div>
  </div>`;
}

function startCountdown($c) {
  let count = 10;
  const $count = $c.querySelector('#mm-count');
  _countdownTimer = setInterval(() => {
    count--; if ($count) $count.textContent = count;
    if (count <= 0) { clearInterval(_countdownTimer); setView('game'); }
  }, 1000);
}
