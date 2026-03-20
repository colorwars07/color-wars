/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/board.js
 * MONOLITO MAESTRO: BLINDAJE ANTI-CONGELAMIENTOS Y ERRORES
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast, escHtml } from '../core/app.js';
import { setView, getProfile, reloadProfile } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

const BOARD_SIZE = 5;
let _active = false;
let _currentTurn = 'pink';
let _isAnimating = false;
let _turnCount = 0;
let _missedTurns = 0; 
let _$container = null; 

let _matchChannel = null; 
let _presenceChannel = null;
let _masterClockTimer = null; 
let _isPaused = false;

let _dbStartTime = null;
let _dbLastMoveTime = null;
let _dbPausedAt = null;
let _dbTotalPausedSecs = 0;

registerView('game', initGameView);

export async function initGameView($container) {
  _$container = $container;
  if (!window.CW_SESSION || !window.CW_SESSION.board) { setView('dashboard'); return; }

  _active = true; _isAnimating = false; _turnCount = 0; _missedTurns = 0; _isPaused = false;
  const sb = getSupabase();

  if (window.CW_SESSION.matchId) {
    try {
      const { data: matchData } = await sb.from('matches').select('*').eq('id', window.CW_SESSION.matchId).single();
      if (matchData) {
        if (matchData.status === 'finished' || matchData.status === 'cancelled') { setView('dashboard'); return; }
        window.CW_SESSION.board = matchData.board_state || window.CW_SESSION.board;
        _currentTurn = matchData.current_turn || 'pink';
        
        _dbStartTime = matchData.match_start_time ? new Date(matchData.match_start_time).getTime() : Date.now();
        _dbLastMoveTime = Date.now(); 
        _dbPausedAt = matchData.paused_at ? new Date(matchData.paused_at).getTime() : null;
        _dbTotalPausedSecs = matchData.total_paused_seconds || 0;

        await sb.from('matches').update({ 
            last_move_time: new Date(_dbLastMoveTime).toISOString()
        }).eq('id', window.CW_SESSION.matchId);

        let pieces = 0;
        window.CW_SESSION.board.forEach(row => row.forEach(c => { if(c.owner) pieces++; }));
        _turnCount = pieces;
      }
    } catch(e) { console.error(e); }

    if (!window.CW_SESSION.isBotMatch) {
      _matchChannel = sb.channel(`game_${window.CW_SESSION.matchId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${window.CW_SESSION.matchId}` }, (payload) => {
          const newData = payload.new;
          if (newData.status === 'finished') { if (newData.winner) _finishGame(newData.winner, true); return; }
          _dbTotalPausedSecs = newData.total_paused_seconds || 0;
          _dbPausedAt = newData.paused_at ? new Date(newData.paused_at).getTime() : null;
          if (newData.current_turn === window.CW_SESSION.myColor && _currentTurn !== window.CW_SESSION.myColor) {
             window.CW_SESSION.board = newData.board_state; 
             _currentTurn = newData.current_turn;
             _dbLastMoveTime = new Date(newData.last_move_time).getTime();
             _missedTurns = 0; 
             updateDOM(); 
          }
        }).subscribe();

      _presenceChannel = sb.channel(`presence_${window.CW_SESSION.matchId}`);
      _presenceChannel.on('presence', { event: 'sync' }, () => {
          const state = _presenceChannel.presenceState();
          if (Object.keys(state).length < 2 && !_dbPausedAt) _triggerDisconnect(true);
          else if (Object.keys(state).length >= 2 && _dbPausedAt) _triggerDisconnect(false);
      });
      _presenceChannel.subscribe(async (s) => { if (s === 'SUBSCRIBED') await _presenceChannel.track({ user: window.CW_SESSION.myColor }); });
    }
  }

  renderHTML(); updateDOM(); 
  _startMasterClock(); 
}

// ... (Rest of functions remain identical to the user's last good version) ...

async function _triggerDisconnect(isDisconnected) {
    if (!_active || window.CW_SESSION.isBotMatch) return;
    const sb = getSupabase();
    if (isDisconnected) {
        _isPaused = true; _dbPausedAt = Date.now();
        _$container.querySelector('#disconnect-overlay').style.display = 'flex';
        await sb.from('matches').update({ paused_at: new Date(_dbPausedAt).toISOString() }).eq('id', window.CW_SESSION.matchId);
    } else {
        _isPaused = false;
        _$container.querySelector('#disconnect-overlay').style.display = 'none';
        if (_dbPausedAt) {
            _dbTotalPausedSecs += Math.floor((Date.now() - _dbPausedAt) / 1000);
            _dbPausedAt = null;
            await sb.from('matches').update({ paused_at: null, total_paused_seconds: _dbTotalPausedSecs }).eq('id', window.CW_SESSION.matchId);
        }
    }
}

function _startMasterClock() {
    clearInterval(_masterClockTimer);
    _masterClockTimer = setInterval(() => {
        if (!_active) return clearInterval(_masterClockTimer);
        const now = Date.now();

        if (_isPaused && _dbPausedAt) {
            let left = 40 - Math.floor((now - _dbPausedAt) / 1000);
            const dTimer = _$container.querySelector('#disconnect-timer');
            if (dTimer) dTimer.textContent = left > 0 ? left : 0;
            if (left <= 0) _finishGame(window.CW_SESSION.myColor, false, "El rival no volvió");
            return; 
        }

        let globalLeft = 180 - (Math.floor((now - _dbStartTime) / 1000) - _dbTotalPausedSecs);
        const gt = _$container.querySelector('#global-timer');
        if (gt) {
            gt.textContent = `${Math.floor(Math.max(0,globalLeft) / 60).toString().padStart(2, '0')}:${(Math.max(0,globalLeft) % 60).toString().padStart(2, '0')}`;
            if (globalLeft <= 30) gt.style.color = "#ff4444";
        }
        if (globalLeft <= 0) { _handleTimeOut(); return; }

        let turnLeft = 10 - Math.floor((now - _dbLastMoveTime) / 1000);
        const turnEl = _$container.querySelector('#turn-indicator');
        const isMyTurn = _currentTurn === window.CW_SESSION.myColor;

        if (turnEl) {
            let d = Math.max(0, turnLeft);
            if (isMyTurn) {
                turnEl.innerHTML = `TU TURNO: <span style="color:white;">${d.toString().padStart(2, '0')}</span>`; 
                turnEl.style.color = d <= 3 ? "#ff4444" : "white";
            } else {
                turnEl.innerHTML = `ESPERANDO RIVAL: <span style="color:var(--text-dim);">${d.toString().padStart(2, '0')}</span>`; 
                turnEl.style.color = "var(--text-dim)";
            }
        }

        if (turnLeft <= 0 && !_isAnimating) {
            if (isMyTurn) {
                _missedTurns++; _dbLastMoveTime = now; 
                if (_missedTurns >= 4) _finishGame(window.CW_SESSION.myColor==='pink'?'blue':'pink', false, "AFK");
                else _passTurn();
            } else if (window.CW_SESSION.isBotMatch) { _botMove(); }
        }
        if (window.CW_SESSION.isBotMatch && !isMyTurn && turnLeft === 8 && !_isAnimating) _botMove();
    }, 1000); 
}

// ... (Rest of functions: _handleTimeOut, handlePlayerClick, _passTurn, _explode, _botMove, _checkGameOver, _finishGame are kept as provided by the user) ...

// THE FIX: try...finally GUARANTEES THAT THE BOARD NEVER FREEZES
async function _addMass(row, col, color) {
  if (_isAnimating || !_active || _isPaused) return; 
  _isAnimating = true; 
  try {
      await _processMass(row, col, color);
      if (_active && !_checkGameOver()) await _passTurn();
  } catch (error) {
      console.error("Critical error avoided in explosion:", error);
  } finally {
      _isAnimating = false; // ALWAYS unlocks the board, no matter what
  }
}

// ... (Rest of functions) ...
