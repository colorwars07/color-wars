/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/board.js
 * MONOLITO MAESTRO V3.1: FIX PRIMER TURNO + ANTI-AFK
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
        
        // 🚨 FIX CRÍTICO: Si es el primer turno del juego, le regalamos 10 segundos frescos al jugador
        // para que el tiempo del matchmaking no le robe su turno.
        _dbLastMoveTime = Date.now(); 
        
        _dbPausedAt = matchData.paused_at ? new Date(matchData.paused_at).getTime() : null;
        _dbTotalPausedSecs = matchData.total_paused_seconds || 0;

        // Actualizamos Supabase con la hora real de "inicio de acción"
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

// ... (El resto de las funciones: renderHTML, updateDOM, _triggerDisconnect se mantienen igual) ...

function renderHTML() {
  const myColor = window.CW_SESSION.myColor;
  const rivalName = window.CW_SESSION.rivalName || window.CW_SESSION.botName || 'RIVAL';
  const myName = getProfile()?.username || 'TÚ';
  const youColorVar = myColor === 'pink' ? 'var(--pink)' : 'var(--blue)';
  const rivalColorVar = myColor === 'pink' ? 'var(--blue)' : 'var(--pink)';

  _$container.innerHTML = `
  <div class="game-arena" style="display:flex; flex-direction:column; align-items:center; width:100%; position:relative;">
    <div id="disconnect-overlay" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:100; flex-direction:column; justify-content:center; align-items:center; border-radius:15px; backdrop-filter:blur(5px);">
        <h2 style="color:#ff4444; font-family:var(--font-display);">RIVAL DESCONECTADO</h2>
        <div style="font-size:3rem; font-weight:900; color:#ffaa00; margin-top:20px;" id="disconnect-timer">40</div>
    </div>
    <div style="background: rgba(10, 10, 15, 0.9); border: 1px solid var(--border-ghost); border-radius: 14px; padding: 12px; margin-bottom: 20px; width: 95%; max-width: 380px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; height: 40px;">
            <div style="width: 30%;"><span style="color:${youColorVar}; font-size: 0.6rem; font-weight: 800;">${escHtml(myName)}</span><br><span style="font-size: 1.2rem; font-weight: 900;" id="score-you">0</span></div>
            <div style="width: 40%; text-align: center;"><span id="global-timer" style="color: #ffaa00; font-family: var(--font-display); font-size: 1.8rem;">03:00</span></div>
            <div style="width: 30%; text-align: right;"><span style="color:${rivalColorVar}; font-size: 0.6rem; font-weight: 800;">${escHtml(rivalName)}</span><br><span style="font-size: 1.2rem; font-weight: 900;" id="score-rival">0</span></div>
        </div>
        <div style="height: 25px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px; text-align: center;">
            <span id="turn-indicator" style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: bold; color: white;">PREPARANDO...</span>
        </div>
    </div>
    <div class="board-wrap"><div class="board-grid" id="grid" style="display:grid; grid-template-columns:repeat(5,1fr); gap:5px;">
        ${window.CW_SESSION.board.map((row, r) => row.map((_, c) => `<div class="cell" data-r="${r}" data-c="${c}"><div class="cell-mass"></div></div>`).join('')).join('')}
    </div></div>
    <button id="btn-surrender" class="btn btn-ghost" style="margin-top:20px;">🏳️ Abandonar</button>
  </div>`;

  _$container.querySelector('#grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.cell'); if (cell) handlePlayerClick(parseInt(cell.dataset.r), parseInt(cell.dataset.c));
  });
  _$container.querySelector('#btn-surrender').addEventListener('click', () => _finishGame(window.CW_SESSION.myColor === 'pink' ? 'blue' : 'pink', false, "Abandonaste la partida"));
}

function updateDOM() {
  if (!_active) return;
  const game = window.CW_SESSION;
  const cells = _$container.querySelectorAll('.cell');
  if(!cells.length) return;
  let pScore = 0, bScore = 0, idx = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const state = game.board[r][c]; const dom = cells[idx++];
      dom.className = 'cell';
      if (state.owner === 'pink') { dom.classList.add('cell-pink'); pScore++; }
      else if (state.owner === 'blue') { dom.classList.add('cell-blue'); bScore++; }
      let orbs = ''; for(let i=0; i<state.mass; i++) orbs += `<div class="mass-orb"></div>`;
      dom.querySelector('.cell-mass').innerHTML = orbs;
    }
  }
  const myColor = window.CW_SESSION.myColor;
  const sy = _$container.querySelector('#score-you'), sr = _$container.querySelector('#score-rival');
  if (myColor === 'pink') { if(sy) sy.textContent = pScore; if(sr) sr.textContent = bScore; }
  else { if(sy) sy.textContent = bScore; if(sr) sr.textContent = pScore; }
}

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

function _handleTimeOut() {
    let pC = 0, bC = 0, pM = 0, bM = 0;
    window.CW_SESSION.board.forEach(row => row.forEach(c => {
        if (c.owner === 'pink') { pC++; pM += c.mass; }
        else if (c.owner === 'blue') { bC++; bM += c.mass; }
    }));
    let winner = (pC !== bC) ? (pC > bC ? 'pink' : 'blue') : (pM >= bM ? 'pink' : 'blue');
    _finishGame(winner, false, "TIEMPO AGOTADO");
}

function handlePlayerClick(row, col) {
  if (!_active || _isAnimating || _isPaused || _currentTurn !== window.CW_SESSION.myColor) return;
  const cell = window.CW_SESSION.board[row][col];
  if (cell.owner && cell.owner !== window.CW_SESSION.myColor) return;
  let ownedCount = 0;
  window.CW_SESSION.board.forEach(r => r.forEach(c => { if(c.owner === window.CW_SESSION.myColor) ownedCount++; }));
  if (ownedCount > 0 && cell.owner !== window.CW_SESSION.myColor) return;
  _missedTurns = 0; _addMass(row, col, window.CW_SESSION.myColor);
}

async function _passTurn() {
  if (!_active) return;
  _currentTurn = _currentTurn === 'pink' ? 'blue' : 'pink';
  _turnCount++; _dbLastMoveTime = Date.now(); 
  if (window.CW_SESSION.matchId) {
     getSupabase().from('matches').update({ 
         board_state: window.CW_SESSION.board, current_turn: _currentTurn, last_move_time: new Date(_dbLastMoveTime).toISOString()
     }).eq('id', window.CW_SESSION.matchId).catch(()=>{});
  }
  updateDOM();
}

async function _addMass(row, col, color) {
  _isAnimating = true; await _processMass(row, col, color);
  if (_active && !_checkGameOver()) await _passTurn();
  _isAnimating = false;
}

async function _processMass(row, col, color) {
  if (!_active) return;
  const cell = window.CW_SESSION.board[row][col];
  cell.owner = color; cell.mass++;
  if (cell.mass >= 4) await _explode(row, col, color); else updateDOM();
}

async function _explode(row, col, color) {
  if (!_active) return;
  window.CW_SESSION.board[row][col].mass = 0; window.CW_SESSION.board[row][col].owner = null; 
  updateDOM();
  const n = [];
  if (row > 0) n.push({row: row - 1, col}); if (row < 4) n.push({row: row + 1, col});
  if (col > 0) n.push({row, col: col - 1}); if (col < 4) n.push({row, col: col + 1});
  await new Promise(r => setTimeout(r, 200));
  for (const pos of n) { if (!_active) break; await _processMass(pos.row, pos.col, color); }
}

function _botMove() {
  if (!_active || _isAnimating) return;
  const botColor = window.CW_SESSION.myColor === 'pink' ? 'blue' : 'pink';
  const board = window.CW_SESSION.board;
  let validMoves = [];
  let hasCells = false;
  for(let r=0; r<5; r++) for(let c=0; c<5; c++) if(board[r][c].owner===botColor) hasCells=true;
  for(let r=0; r<5; r++) for(let c=0; c<5; c++) {
      if (hasCells) { if(board[r][c].owner===botColor) validMoves.push({r,c,m:board[r][c].mass}); }
      else { if(!board[r][c].owner) validMoves.push({r,c,m:0}); }
  }
  if (validMoves.length === 0) return;
  let best = validMoves[Math.floor(Math.random()*validMoves.length)];
  let maxS = -1;
  validMoves.forEach(m => {
      let s = m.m * 10 + Math.random()*5;
      if (s > maxS) { maxS = s; best = m; }
  });
  _addMass(best.r, best.c, botColor);
}

function _checkGameOver() {
  let p = 0, b = 0; const board = window.CW_SESSION.board;
  for (let r=0; r<5; r++) for (let c=0; c<5; c++) { if (board[r][c].owner==='pink') p++; else if (board[r][c].owner==='blue') b++; }
  if (_turnCount >= 2) {
     if (p === 0) { _finishGame('blue'); return true; }
     if (b === 0) { _pinkFinishGame('pink'); return true; }
  }
  return false;
}

async function _finishGame(winnerColor, fromDB = false, customReason = null) {
  if (!_active) return; _active = false;
  clearInterval(_masterClockTimer);
  if (_matchChannel) _matchChannel.unsubscribe();
  if (_presenceChannel) _presenceChannel.unsubscribe();
  
  const win = winnerColor === window.CW_SESSION.myColor;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(10,10,15,0.95); z-index:9999; display:flex; flex-direction:column; justify-content:center; align-items:center; backdrop-filter:blur(8px);';
  overlay.innerHTML = `<h1 style="color:white; font-size:1.5rem;">SINCRONIZANDO...</h1>`;
  _$container.appendChild(overlay);
  
  try {
    if (!fromDB && window.CW_SESSION.matchId) {
       await getSupabase().from('matches').update({ status:'finished', winner:winnerColor, board_state:window.CW_SESSION.board }).eq('id', window.CW_SESSION.matchId);
    }
  } catch (e) {}

  setTimeout(() => {
      overlay.innerHTML = `
        <h1 class="${win?'result-win':'result-lose'}" style="font-size:3.5rem;">${win?'¡VICTORIA!':'DERROTA'}</h1>
        <p style="color:white; margin:10px 0 30px;">${customReason || (win?'+50 CP':'Sigue intentando')}</p>
        <button class="btn btn-primary" id="btn-exit" style="width:220px;">VOLVER AL INICIO</button>
      `;
      overlay.querySelector('#btn-exit').onclick = async () => {
        window.CW_SESSION = null; await reloadProfile(); setView('dashboard');
      };
  }, 600);
}
