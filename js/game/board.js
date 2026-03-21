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
let _masterClockTimer = null; 
let _pollTimer = null; // 🚀 AQUÍ ESTÁ EL MOTOR 4x4
let _isPaused = false;
let _dbStartTime = null;
let _dbLastMoveTime = null;
let _dbTotalPausedSecs = 0;

registerView('game', initGameView);

export async function initGameView($container) {
  _$container = $container;
  if (!window.CW_SESSION || !window.CW_SESSION.board) { setView('dashboard'); return; }

  _active = true; _isAnimating = false; _turnCount = 0; _missedTurns = 0;
  const sb = getSupabase();

  if (window.CW_SESSION.matchId) {
    try {
      const { data: matchData } = await sb.from('matches').select('*').eq('id', window.CW_SESSION.matchId).single();
      if (matchData) {
        window.CW_SESSION.board = matchData.board_state || window.CW_SESSION.board;
        _currentTurn = matchData.current_turn || 'pink';
        _dbStartTime = matchData.match_start_time ? new Date(matchData.match_start_time).getTime() : Date.now();
        
        _dbLastMoveTime = Date.now(); 
        _dbTotalPausedSecs = matchData.total_paused_seconds || 0;

        await sb.from('matches').update({ last_move_time: new Date(_dbLastMoveTime).toISOString() }).eq('id', window.CW_SESSION.matchId);
      }
    } catch(e) { console.error(e); }

    // 🔥 PRENDEMOS EL MOTOR INMUNE A DESCONEXIONES
    if (!window.CW_SESSION.isBotMatch) {
      _startPolling(); 
    }
  }

  renderHTML(); updateDOM(); 
  _startMasterClock(); 
}

// 🚀 FUNCIÓN DEL MOTOR 4x4 (POLLING)
function _startPolling() {
  clearInterval(_pollTimer);
  _pollTimer = setInterval(async () => {
    if (!_active || _isAnimating) return;
    try {
      const { data } = await getSupabase()
        .from('matches')
        .select('board_state, current_turn, last_move_time, status, winner')
        .eq('id', window.CW_SESSION.matchId)
        .single();
        
      if (data) {
        // Si el otro abandonó, cerramos el juego
        if (data.status === 'finished' && data.winner) {
           _finishGame(data.winner, true);
           return;
        }
        // Si es nuestro turno y el tablero no está actualizado, lo refrescamos
        if (data.current_turn === window.CW_SESSION.myColor && _currentTurn !== window.CW_SESSION.myColor) {
           window.CW_SESSION.board = data.board_state; 
           _currentTurn = data.current_turn;
           _dbLastMoveTime = new Date(data.last_move_time).getTime();
           _missedTurns = 0; 
           updateDOM(); 
        }
      }
    } catch(e) { console.warn("Fallo de red menor, reintentando..."); }
  }, 1500); // Pregunta cada 1.5 segundos
}

function renderHTML() {
  const myColor = window.CW_SESSION.myColor;
  const rivalName = window.CW_SESSION.rivalName || window.CW_SESSION.botName || 'RIVAL';
  const youColorVar = myColor === 'pink' ? 'var(--pink)' : 'var(--blue)';
  const rivalColorVar = myColor === 'pink' ? 'var(--blue)' : 'var(--pink)';

  _$container.innerHTML = `
  <div class="game-arena">
    <div style="background: rgba(10, 10, 15, 0.9); border: 1px solid var(--border-ghost); border-radius: 14px; padding: 12px; margin-bottom: 20px; width: 95%; max-width: 380px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="width: 30%;"><span style="color:${youColorVar}; font-size: 0.6rem; font-weight: 800;">TÚ</span><br><span style="font-size: 1.2rem; font-weight: 900;" id="score-you">0</span></div>
            <div style="width: 40%; text-align: center;"><span id="global-timer" style="color: #ffaa00; font-family: var(--font-display); font-size: 1.8rem;">03:00</span></div>
            <div style="width: 30%; text-align: right;"><span style="color:${rivalColorVar}; font-size: 0.6rem; font-weight: 800;">${escHtml(rivalName)}</span><br><span style="font-size: 1.2rem; font-weight: 900;" id="score-rival">0</span></div>
        </div>
        <div style="text-align: center;"><span id="turn-indicator" style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: bold; color: white;">PREPARANDO...</span></div>
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
  let pS = 0, bS = 0, idx = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const state = game.board[r][c]; const dom = cells[idx++];
      if (!dom) continue;
      dom.className = 'cell';
      if (state.owner === 'pink') { dom.classList.add('cell-pink'); pS++; }
      else if (state.owner === 'blue') { dom.classList.add('cell-blue'); bS++; }
      let orbs = ''; for(let i=0; i<state.mass; i++) orbs += `<div class="mass-orb"></div>`;
      dom.querySelector('.cell-mass').innerHTML = orbs;
    }
  }
  const myColor = window.CW_SESSION.myColor;
  const sy = _$container.querySelector('#score-you'), sr = _$container.querySelector('#score-rival');
  if (myColor === 'pink') { if(sy) sy.textContent = pS; if(sr) sr.textContent = bS; }
  else { if(sy) sy.textContent = bS; if(sr) sr.textContent = pS; }
}

function _startMasterClock() {
    clearInterval(_masterClockTimer);
    _masterClockTimer = setInterval(() => {
        if (!_active) return clearInterval(_masterClockTimer);
        const now = Date.now();

        let globalLeft = 180 - (Math.floor((now - _dbStartTime) / 1000) - _dbTotalPausedSecs);
        const gt = _$container.querySelector('#global-timer');
        if (gt) gt.textContent = `${Math.floor(Math.max(0,globalLeft) / 60).toString().padStart(2, '0')}:${(Math.max(0,globalLeft) % 60).toString().padStart(2, '0')}`;
        if (globalLeft <= 0) { _finishGame('draw', false, "TIEMPO AGOTADO"); return; }

        let turnLeft = 10 - Math.floor((now - _dbLastMoveTime) / 1000);
        const turnEl = _$container.querySelector('#turn-indicator');
        const isMyTurn = _currentTurn === window.CW_SESSION.myColor;

        if (turnEl) {
            let d = Math.max(0, turnLeft);
            turnEl.innerHTML = isMyTurn ? `TU TURNO: ${d}s` : `ESPERANDO RIVAL: ${d}s`;
        }

        if (turnLeft <= 0 && !_isAnimating) {
            if (isMyTurn) {
                _missedTurns++; _dbLastMoveTime = now; 
                if (_missedTurns >= 4) _finishGame(window.CW_SESSION.myColor==='pink'?'blue':'pink', false, "ELIMINADO POR AFK");
                else {
                    showToast(`¡TURNO SALTADO! (${_missedTurns}/4)`, 'warning');
                    _passTurn();
                }
            } else if (window.CW_SESSION.isBotMatch) { _botMove(); }
        }
        if (window.CW_SESSION.isBotMatch && !isMyTurn && turnLeft === 8 && !_isAnimating) _botMove();
    }, 1000); 
}

function handlePlayerClick(row, col) {
  if (!_active || _isAnimating || _currentTurn !== window.CW_SESSION.myColor) return;
  const cell = window.CW_SESSION.board[row][col];
  if (cell.owner && cell.owner !== window.CW_SESSION.myColor) return;
  _missedTurns = 0; _addMass(row, col, window.CW_SESSION.myColor);
}

async function _addMass(row, col, color) {
  if (_isAnimating) return;
  _isAnimating = true; 
  try {
      await _processMass(row, col, color);
      if (_active && !_checkGameOver()) await _passTurn();
  } finally {
      _isAnimating = false;
  }
}

async function _processMass(row, col, color) {
  const cell = window.CW_SESSION.board[row][col];
  cell.owner = color; cell.mass++;
  if (cell.mass >= 4) await _explode(row, col, color); else updateDOM();
}

async function _explode(row, col, color) {
  window.CW_SESSION.board[row][col].mass = 0; window.CW_SESSION.board[row][col].owner = null; 
  updateDOM();
  const n = [];
  if (row > 0) n.push({row: row - 1, col}); if (row < 4) n.push({row: row + 1, col});
  if (col > 0) n.push({row, col: col - 1}); if (col < 4) n.push({row, col: col + 1});
  await new Promise(r => setTimeout(r, 200));
  for (const pos of n) await _processMass(pos.row, pos.col, color);
}

async function _passTurn() {
  _currentTurn = _currentTurn === 'pink' ? 'blue' : 'pink';
  _dbLastMoveTime = Date.now(); _turnCount++;
  if (window.CW_SESSION.matchId) {
     getSupabase().from('matches').update({ board_state: window.CW_SESSION.board, current_turn: _currentTurn, last_move_time: new Date(_dbLastMoveTime).toISOString() }).eq('id', window.CW_SESSION.matchId).catch(()=>{});
  }
  updateDOM();
}

function _botMove() {
  const botColor = window.CW_SESSION.myColor === 'pink' ? 'blue' : 'pink';
  const board = window.CW_SESSION.board;
  let moves = [];
  for(let r=0; r<5; r++) for(let c=0; c<5; c++) {
      if (!board[r][c].owner || board[r][c].owner === botColor) moves.push({r,c});
  }
  if (moves.length > 0) {
      const m = moves[Math.floor(Math.random()*moves.length)];
      _addMass(m.r, m.c, botColor);
  }
}

function _checkGameOver() {
  let p = 0, b = 0; 
  window.CW_SESSION.board.forEach(row => row.forEach(c => { if(c.owner==='pink') p++; else if(c.owner==='blue') b++; }));
  if (_turnCount >= 2) {
     if (p === 0) { _finishGame('blue'); return true; }
     if (b === 0) { _finishGame('pink'); return true; }
  }
  return false;
}

async function _finishGame(winnerColor, fromDB = false, reason = null) {
  if (!_active) return; _active = false;
  clearInterval(_masterClockTimer);
  clearInterval(_pollTimer); // APAGAMOS EL MOTOR AL TERMINAR
  const win = winnerColor === window.CW_SESSION.myColor;
  const overlay = document.createElement('div');
  overlay.className = 'result-overlay';
  overlay.innerHTML = `
    <h1 style="color:white; font-size:3rem;">${win ? 'VICTORIA' : 'DERROTA'}</h1>
    <p style="color:#aaa;">${reason || (win ? '+50 CP' : 'Sigue practicando')}</p>
    <button class="btn btn-primary" onclick="location.reload()">VOLVER</button>
  `;
  _$container.appendChild(overlay);
  if (!fromDB && window.CW_SESSION.matchId) {
     await getSupabase().from('matches').update({ status:'finished', winner:winnerColor }).eq('id', window.CW_SESSION.matchId);
  }
}
