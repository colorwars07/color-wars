import { registerView, showToast, escHtml } from '../core/app.js';
import { setView } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

const BOARD_SIZE = 5;
let _active = false;
let _currentTurn = 'pink';
let _isAnimating = false;
let _turnCount = 0;
let _missedTurns = 0;
let _$container = null;
let _masterClockTimer = null;
let _pollTimer = null;
let _dbStartTime = null;
let _dbLastMoveTime = null;
let _lastDBUpdateTime = null; 
let _botIsMoving = false;

registerView('game', initGameView);

export async function initGameView($container) {
  _$container = $container;
  if (!window.CW_SESSION || !window.CW_SESSION.board) { 
      window.CW_SESSION = null; setView('dashboard'); return; 
  }

  _active = true; _isAnimating = false; _turnCount = 0; _missedTurns = 0; _botIsMoving = false;
  _lastDBUpdateTime = Date.now();
  const sb = getSupabase();

  if (window.CW_SESSION.matchId) {
    try {
      const { data: matchData } = await sb.from('matches').select('*').eq('id', window.CW_SESSION.matchId).single();
      if (matchData) {
        // ANTI-FANTASMAS: Si entras y la partida ya acabó, aborta la misión de inmediato.
        if (matchData.status === 'finished' || matchData.status === 'cancelled') {
           window.CW_SESSION = null; setView('dashboard'); return;
        }
        window.CW_SESSION.board = matchData.board_state || window.CW_SESSION.board;
        _currentTurn = matchData.current_turn || 'pink';
        _dbStartTime = matchData.match_start_time ? new Date(matchData.match_start_time).getTime() : Date.now();
        _dbLastMoveTime = Date.now();
      }
    } catch(e) {}

    if (!window.CW_SESSION.isBotMatch) _startPolling();
  }

  renderHTML(); updateDOM(); _startMasterClock();
}

function _startPolling() {
  clearInterval(_pollTimer);
  _pollTimer = setInterval(async () => {
    if (!_active || _isAnimating) return;
    try {
      const { data } = await getSupabase().from('matches').select('board_state, current_turn, last_move_time, status, winner').eq('id', window.CW_SESSION.matchId).single();
      if (data) {
        _lastDBUpdateTime = Date.now(); 
        if (data.status === 'finished' && data.winner) { _finishGame(data.winner, true); return; }
        if (data.current_turn === window.CW_SESSION.myColor && _currentTurn !== window.CW_SESSION.myColor) {
           window.CW_SESSION.board = data.board_state; _currentTurn = data.current_turn;
           _dbLastMoveTime = new Date(data.last_move_time).getTime(); _missedTurns = 0; updateDOM();
        }
      }
    } catch(e) {}
  }, 1500);
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
  
  // ABANDONAR -> TE MANDA A LA PANTALLA DE DERROTA
  _$container.querySelector('#btn-surrender').addEventListener('click', async () => {
     if (!confirm("¿Seguro que quieres abandonar?")) return;
     const winnerColor = window.CW_SESSION.myColor === 'pink' ? 'blue' : 'pink';
     await _finishGame(winnerColor, false, "Abandonaste la partida");
  });
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

function _resolveTimeOutWinner() {
    let pCells = 0, bCells = 0, pMass = 0, bMass = 0;
    window.CW_SESSION.board.forEach(row => row.forEach(c => { 
      if(c.owner === 'pink') { pCells++; pMass += c.mass; } else if(c.owner === 'blue') { bCells++; bMass += c.mass; }
    }));
    if (pCells > bCells) return 'pink'; if (bCells > pCells) return 'blue';
    if (pMass > bMass) return 'pink'; if (bMass > pMass) return 'blue';
    return _currentTurn === 'pink' ? 'blue' : 'pink'; 
}

function _startMasterClock() {
    clearInterval(_masterClockTimer);
    _masterClockTimer = setInterval(() => {
        if (!_active) return clearInterval(_masterClockTimer);
        const now = Date.now();

        if (!window.CW_SESSION.isBotMatch) {
            const timeWithoutInternet = Math.floor((now - _lastDBUpdateTime) / 1000);
            if (timeWithoutInternet >= 40) {
                const rivalColor = window.CW_SESSION.myColor === 'pink' ? 'blue' : 'pink';
                _finishGame(rivalColor, false, "EL RIVAL PERDIÓ LA CONEXIÓN"); return;
            }
        }

        let globalLeft = 180 - Math.floor((now - _dbStartTime) / 1000);
        const gt = _$container.querySelector('#global-timer');
        if (gt) gt.textContent = `${Math.floor(Math.max(0,globalLeft) / 60).toString().padStart(2, '0')}:${(Math.max(0,globalLeft) % 60).toString().padStart(2, '0')}`;
        
        if (globalLeft <= 0) { 
            const winner = _resolveTimeOutWinner(); _finishGame(winner, false, "TIEMPO AGOTADO (VICTORIA POR PUNTOS)"); return; 
        }

        let turnLeft = 10 - Math.floor((now - _dbLastMoveTime) / 1000);
        const turnEl = _$container.querySelector('#turn-indicator');
        const isMyTurn = _currentTurn === window.CW_SESSION.myColor;

        if (turnEl) turnEl.innerHTML = isMyTurn ? `<span style="color:var(--pink);">TU TURNO: ${Math.max(0, turnLeft)}s</span>` : `<span style="color:#aaa;">ESPERANDO RIVAL: ${Math.max(0, turnLeft)}s</span>`;

        if (turnLeft <= 0 && !_isAnimating) {
            if (isMyTurn) {
                _missedTurns++; _dbLastMoveTime = now;
                if (_missedTurns >= 4) _finishGame(window.CW_SESSION.myColor==='pink'?'blue':'pink', false, "ELIMINADO POR AFK");
                else { showToast(`¡TURNO SALTADO! (${_missedTurns}/4)`, 'warning'); _passTurn(); }
            } else if (window.CW_SESSION.isBotMatch && !_botIsMoving) { _botIsMoving = true; _botMove(); }
        }
        
        if (window.CW_SESSION.isBotMatch && !isMyTurn && turnLeft <= 8 && !_isAnimating && !_botIsMoving) {
            _botIsMoving = true; setTimeout(() => { _botMove(); }, 600);
        }
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
  try { await _processMass(row, col, color); if (_active && !_checkGameOver()) await _passTurn(); } 
  catch(e) {} finally { _isAnimating = false; _botIsMoving = false; }
}

async function _processMass(row, col, color) {
  const cell = window.CW_SESSION.board[row][col]; cell.owner = color; cell.mass++;
  if (cell.mass >= 4) await _explode(row, col, color); else updateDOM();
}

async function _explode(row, col, color) {
  window.CW_SESSION.board[row][col].mass = 0; window.CW_SESSION.board[row][col].owner = null; updateDOM();
  const n = [];
  if (row > 0) n.push({row: row - 1, col}); if (row < 4) n.push({row: row + 1, col});
  if (col > 0) n.push({row, col: col - 1}); if (col < 4) n.push({row, col: col + 1});
  await new Promise(r => setTimeout(r, 200));
  for (const pos of n) await _processMass(pos.row, pos.col, color);
}

async function _passTurn() {
  _currentTurn = _currentTurn === 'pink' ? 'blue' : 'pink';
  _dbLastMoveTime = Date.now(); _turnCount++; updateDOM();
  if (window.CW_SESSION.matchId) {
     try { await getSupabase().from('matches').update({ board_state: window.CW_SESSION.board, current_turn: _currentTurn, last_move_time: new Date(_dbLastMoveTime).toISOString() }).eq('id', window.CW_SESSION.matchId); } catch(e) {}
  }
}

function _botMove() {
  const botColor = window.CW_SESSION.myColor === 'pink' ? 'blue' : 'pink';
  const board = window.CW_SESSION.board;
  let validMoves = [];
  for(let r=0; r<5; r++) for(let c=0; c<5; c++) if (!board[r][c].owner || board[r][c].owner === botColor) validMoves.push({r,c});
  if (validMoves.length === 0) { _botIsMoving = false; return; }

  let bestMove = validMoves[0], maxScore = -9999;
  for (let move of validMoves) {
      let score = _evaluateBoardState(board, move.r, move.c, botColor) + (Math.random() * 0.5); 
      if (score > maxScore) { maxScore = score; bestMove = move; }
  }
  _addMass(bestMove.r, bestMove.c, botColor);
}

function _evaluateBoardState(board, r, c, color) {
  let score = board[r][c].mass === 3 ? 50 : board[r][c].mass; 
  const neighbors = [ {r: r-1, c}, {r: r+1, c}, {r, c: c-1}, {r, c: c+1} ];
  for (let n of neighbors) {
      if (n.r>=0 && n.r<5 && n.c>=0 && n.c<5) {
          const adj = board[n.r][n.c];
          if (adj.owner && adj.owner !== color) score += (adj.mass === 3) ? (board[r][c].mass === 3 ? 100 : -20) : adj.mass;
      }
  }
  return score;
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
  if (!_active) return; 
  _active = false;
  
  clearInterval(_masterClockTimer); clearInterval(_pollTimer); 
  
  const win = winnerColor === window.CW_SESSION.myColor;
  const titleColor = win ? 'var(--pink)' : '#ff4444';
  const titleText = win ? 'VICTORIA' : 'DERROTA';
  
  const overlay = document.createElement('div');
  overlay.id = "cw-final-overlay";
  overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(10, 10, 15, 0.95); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; backdrop-filter: blur(8px);`;
  
  overlay.innerHTML = `
    <h1 style="color:${titleColor}; font-size:3.5rem; font-family:var(--font-display); text-transform:uppercase; margin-bottom:10px; text-shadow: 0 0 20px ${titleColor}; letter-spacing: 2px;">${titleText}</h1>
    <p style="color:#aaa; font-family:var(--font-mono); font-size:1rem; margin-bottom:40px; text-transform:uppercase; letter-spacing:1px;">${reason || (win ? '+50 CP AÑADIDOS' : 'Sigue practicando en la arena')}</p>
    <button class="btn btn-primary" id="btn-return-dash-final" style="width:250px; font-size:1.2rem; padding:15px;">VOLVER AL MENÚ</button>
  `;
  document.body.appendChild(overlay);

  // BOTÓN DE LA PANTALLA DERROTA -> LIMPIA SESIÓN -> VA AL MENÚ DE FORMA SEGURA
  document.getElementById('btn-return-dash-final').addEventListener('click', () => {
     document.body.removeChild(overlay); 
     window.CW_SESSION = null; 
     setView('dashboard'); 
  });

  if (!fromDB && window.CW_SESSION.matchId) {
     await getSupabase().from('matches').update({ status:'finished', winner:winnerColor }).eq('id', window.CW_SESSION.matchId).catch(()=>{});
  }
}
