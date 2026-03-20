/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/views/matchmaking.js
 * MULTIJUGADOR + EXTERMINADOR DE FANTASMAS + ECONOMÍA 30 CP
 * ═══════════════════════════════════════════════════════
 */
import { registerView, showToast } from '../core/app.js';
import { getProfile, setProfile, setView } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

registerView('matchmaking', initMatchmaking);

let _searchTimer = null;
let _countdownTimer = null;
let _matchChannel = null;   
let _currentMatchId = null; 
const ENTRY_FEE = 30; // ⚡ Economía actualizada

const VZLA_NAMES = [
  "El Bryan", "La Catira", "El Menor", "Yuridia", "El Gocho", "La Chama", "Maikol", "Yuleisi",
  "El Chino", "La Negra", "Juancho", "Dayana", "El Portugués", "Mariángel", "El Convive", "El Tuki"
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
  
  // ⚡ EXTERMINADOR DE FANTASMAS (Evita bucles de partidas viejas)
  await cleanupGhostMatches(profile.id);

  startSearch($container, profile);
}

// Mata cualquier partida que el jugador haya dejado abandonada antes de buscar una nueva
async function cleanupGhostMatches(userId) {
  const sb = getSupabase();
  try {
    await sb.from('matches').update({ status: 'cancelled' }).eq('player_pink', userId).in('status', ['waiting', 'playing']);
    await sb.from('matches').update({ status: 'cancelled' }).eq('player_blue', userId).in('status', ['waiting', 'playing']);
  } catch (e) { console.error("Error limpiando fantasmas:", e); }
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
    const newBalance = Number(profile.wallet_bs) - ENTRY_FEE;
    await sb.from('users').update({ wallet_bs: newBalance }).eq('id', profile.id);
    setProfile({ ...profile, wallet_bs: newBalance });
  } catch(e) { console.error("Error cobrando entrada:", e); }
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
      // ENCONTRAMOS UN HUMANO
      await sb.from('matches').update({
        player_blue: profile.id,
        status: 'playing'
      }).eq('id', waitingMatch.id);

      await payEntryFee();

      window.CW_SESSION = {
        isBotMatch: false,
        matchId: waitingMatch.id,
        myColor: 'blue',
        rivalName: "HUMANO",
        board: Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0 })))
      };

      renderCountdownScreen($c, "HUMANO ENCONTRADO", "ERES EL AZUL - Juegas de segundo");
      startCountdown($c);

    } else {
      // CREAMOS SALA DE ESPERA
      const { data: newMatch, error: insertErr } = await sb.from('matches').insert([{
        player_pink: profile.id,
        status: 'waiting'
      }]).select().single();

      if (insertErr) throw insertErr;
      _currentMatchId = newMatch.id;

      _matchChannel = sb.channel(`match_${newMatch.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${newMatch.id}` }, async (payload) => {
          if (payload.new.status === 'playing' && payload.new.player_blue !== 'BOT') {
            
            clearTimeout(_searchTimer);
            sb.removeChannel(_matchChannel); 

            await payEntryFee();

            window.CW_SESSION = {
              isBotMatch: false,
              matchId: newMatch.id,
              myColor: 'pink',
              rivalName: "HUMANO",
              board: Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0 })))
            };

            renderCountdownScreen($c, "HUMANO ENCONTRADO", "ERES EL ROSADO - Empiezas tú");
            startCountdown($c);
          }
        })
        .subscribe();

      // Reloj para el Bot (35s)
      _searchTimer = setTimeout(() => {
        setupBotMatchFallback($c, profile);
      }, 35000);
    }
  } catch (err) {
    console.error("Error buscando partida:", err);
    showToast('Error de conexión', 'error');
    setView('dashboard');
  }
}

async function cancelSearch() {
  clearTimeout(_searchTimer);
  clearTimeout(_countdownTimer);
  
  const sb = getSupabase();
  if (_matchChannel) sb.removeChannel(_matchChannel);

  if (_currentMatchId) {
    try {
      await sb.from('matches').update({ status: 'cancelled' }).eq('id', _currentMatchId);
    } catch(e) { console.error("Error cancelando sala:", e); }
  }
  
  _currentMatchId = null;
  setView('dashboard');
}

async function setupBotMatchFallback($c, profile) {
  const sb = getSupabase();
  if (_matchChannel) sb.removeChannel(_matchChannel);

  try {
    const { data: userData } = await sb.from('users').select('bot_next_win').eq('id', profile.id).single();
    const humanWinsNext = userData ? userData.bot_next_win : false; 
    
    await sb.from('users').update({ bot_next_win: !humanWinsNext }).eq('id', profile.id);
    
    const randomName = VZLA_NAMES[Math.floor(Math.random() * VZLA_NAMES.length)];
    if (_currentMatchId) {
      await sb.from('matches').update({
        player_blue: 'BOT',
        status: 'playing'
      }).eq('id', _currentMatchId);
    }

    await payEntryFee();

    window.CW_SESSION = {
      isBotMatch: true,
      matchId: _currentMatchId, // Se mantiene para que el servidor pueda guardar todo
      botName: randomName,
      humanWinsNext: humanWinsNext, 
      myColor: 'pink',
      board: Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0 })))
    };

    renderCountdownScreen($c, randomName, "ERES EL ROSADO - Empiezas tú");
    startCountdown($c);
    
  } catch (err) {
    console.error("Error fallback bot:", err);
    setView('dashboard');
  }
}

function renderCountdownScreen($c, rivalName, instruction) {
  $c.innerHTML = `
  <div class="mm-screen">
    <div style="display:flex; flex-direction:column; align-items:center; gap:1.5rem;">
      <div style="width:180px; height:180px; border-radius:50%; border:2px solid var(--border-ghost); display:flex; align-items:center; justify-content:center; position:relative;">
        <span id="mm-count" class="mm-countdown">10</span>
      </div>
      <div style="text-align:center;">
        <h2 style="font-family:var(--font-display); font-size:1.4rem; color:var(--text-bright); margin-bottom:0.5rem;">¡RIVAL ENCONTRADO!</h2>
        <p style="color:var(--blue); font-weight:bold; font-size:1.2rem; text-transform:uppercase;">${rivalName}</p>
        <p style="color:var(--pink); font-size:0.9rem; margin-top:10px; font-weight:bold;">${instruction}</p>
      </div>
    </div>
  </div>`;
}

function startCountdown($c) {
  let count = 10;
  const $count = $c.querySelector('#mm-count');
  
  _countdownTimer = setInterval(() => {
    count--;
    if ($count) $count.textContent = count;

    if (count <= 0) {
      clearInterval(_countdownTimer);
      setView('game'); 
    }
  }, 1000);
}
