/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/board.js
 * CEREBRO MINIMAX (Simulador de Futuros y Cadenas)
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast, escHtml } from '../core/app.js';
import { setView, getProfile, reloadProfile } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

const BOARD_SIZE = 5;
let _active = false;
let _currentTurn = 'pink';
let _turnTimer = null;
let _graceTimer = null;
let _timeLeft = 10;
let _totalWait = 0;
let _isAnimating = false;
let _turnCount = 0;
let _$container = null; 
let _matchChannel = null; 

registerView('game', initGameView);

export async function initGameView($container) {
  _$container = $container;
  if (!window.CW_SESSION || !window.CW_SESSION.board) { setView('dashboard'); return; }

  _active = true; _currentTurn = 'pink'; _isAnimating = false; _turnCount = 0;
  const sb = getSupabase();

  if (window.CW_SESSION.matchId) {
    try {
      const { data: matchData } = await sb.from('matches').select('*').eq('id', window.CW_SESSION.matchId).single();
      if (matchData) {
        if (matchData.status === 'finished' || matchData.status === 'cancelled') { setView('dashboard'); return; }
        if (matchData.board_state) window.CW_SESSION.board = matchData.board_state;
        if (matchData.current_turn) _currentTurn = matchData.current_turn;
        
        let pieces = 0;
        for(let r=0; r<BOARD_SIZE; r++) { for(let c=0; c<BOARD_SIZE; c++) { if (matchData.board_state[r][c].owner) pieces++; } }
        _turnCount = pieces;
      }
    } catch(e) {}

    if (!window.CW_SESSION.isBotMatch) {
      _matchChannel = sb.channel(`game_${window.CW_SESSION.matchId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${window.CW_SESSION.matchId}` }, (payload) => {
          const newData = payload.new;
          if (newData.status === 'finished' || newData.status === 'cancelled') { if (newData.winner) _finishGame(newData.winner, true); return; }
          if (newData.current_turn === window.CW_SESSION.myColor && _currentTurn !== window.CW_SESSION.myColor) {
             window.CW_SESSION.board = newData.board_state; _currentTurn = newData.current_turn;
             updateDOM(); _startTurn();
          }
        }).subscribe();
    }
  }
  renderHTML(); updateDOM(); _startTurn();
}

function renderHTML() {
  const myColor = window.CW_SESSION.myColor;
  const rivalName = window.CW_SESSION.rivalName || window.CW_SESSION.botName || 'RIVAL';
  const myName = getProfile()?.username || 'TÚ';

  const youColorVar = myColor === 'pink' ? 'var(--pink)' : 'var(--blue)';
  const rivalColorVar = myColor === 'pink' ? 'var(--blue)' : 'var(--pink)';

  _$container.innerHTML = `
  <div class="game-arena" id="arena-main">
    <div class="game-hud">
      <div style="color:${youColorVar};font-weight:900;font-size:0.85rem;text-shadow:0 0 10px ${youColorVar}; text-transform:uppercase;">
        ${escHtml(myName)}: <span id="score-you">0</span>
      </div>
      <div class="hud-timer">00:10</div>
      <div style="color:${rivalColorVar};font-weight:900;font-size:0.85rem;text-shadow:0 0 10px ${rivalColorVar}; text-transform:uppercase;">
        ${escHtml(rivalName)}: <span id="score-rival">0</span>
      </div>
    </div>
    <div class="board-wrap">
      <div class="board-grid" id="grid" style="display:grid; grid-template-columns:repeat(5,1fr); gap:5px;">
        ${window.CW_SESSION.board.map((row, r) => row.map((_, c) => `
          <div class="cell" data-r="${r}" data-c="${c}"><div class="cell-mass"></div></div>
        `).join('')).join('')}
      </div>
    </div>
    <button id="btn-surrender" class="btn btn-ghost" style="margin-top:20px;">🏳️ Abandonar</button>
  </div>`;

  _$container.querySelector('#grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.cell'); if (!cell) return;
    handlePlayerClick(parseInt(cell.dataset.r), parseInt(cell.dataset.c));
  });

  _$container.querySelector('#btn-surrender').addEventListener('click', () => {
    const rivalColor = window.CW_SESSION.myColor === 'pink' ? 'blue' : 'pink';
    _finishGame(rivalColor, false);
  });
}

function updateDOM() {
  if (!_active) return;
  const game = window.CW_SESSION;
  const cells = _$container.querySelectorAll('.cell');
  if(cells.length === 0) return; 

  let pinkScore = 0, blueScore = 0; let idx = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const stateCell = game.board[r][c];
      const domCell = cells[idx++];
      domCell.className = 'cell';
      if (stateCell.owner === 'pink') { domCell.classList.add('cell-pink'); pinkScore++; }
      else if (stateCell.owner === 'blue') { domCell.classList.add('cell-blue'); blueScore++; }

      let orbs = '';
      for(let i = 0; i < stateCell.mass; i++) orbs += `<div class="mass-orb"></div>`;
      domCell.querySelector('.cell-mass').innerHTML = orbs;
    }
  }

  const myColor = window.CW_SESSION.myColor;
  const sYou = _$container.querySelector('#score-you'); const sRiv = _$container.querySelector('#score-rival');
  if (myColor === 'pink') {
    if(sYou) sYou.textContent = pinkScore; if(sRiv) sRiv.textContent = blueScore;
  } else {
    if(sYou) sYou.textContent = blueScore; if(sRiv) sRiv.textContent = pinkScore;
  }
}

function handlePlayerClick(row, col) {
  const myColor = window.CW_SESSION.myColor;
  if (!_active || _isAnimating) return;
  if (_currentTurn !== myColor) { showToast('Espera tu turno', 'warning'); return; }

  const cell = window.CW_SESSION.board[row][col];
  if (cell.owner && cell.owner !== myColor) { showToast('Casilla enemiga', 'error'); return; }

  let myCellsCount = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) { if (window.CW_SESSION.board[r][c].owner === myColor) myCellsCount++; }
  }
  
  if (myCellsCount > 0 && cell.owner !== myColor) { 
      showToast('Debes expandir tus propias fichas', 'warning'); 
      return; 
  }

  clearInterval(_turnTimer); _addMass(row, col, myColor);
}

function _startTurn() {
  if (!_active) return;
  clearInterval(_turnTimer); clearInterval(_graceTimer);
  _timeLeft = 10; updateTimerUI();

  const myColor = window.CW_SESSION.myColor;
  const botColor = myColor === 'pink' ? 'blue' : 'pink'; 

  if (_currentTurn === myColor) {
    _turnTimer = setInterval(() => {
      _timeLeft--; updateTimerUI();
      if (_timeLeft <= 0) { clearInterval(_turnTimer); _passTurn(); }
    }, 1000);
  } else {
    if (!window.CW_SESSION.isBotMatch) {
      _totalWait = 40; 
      _graceTimer = setInterval(() => {
        _totalWait--;
        if (_totalWait <= 30) updateTimerUI(_totalWait); else updateTimerUI(); 
        if (_totalWait <= 0) { clearInterval(_graceTimer); claimForfeitVictory(); }
      }, 1000);
    } else {
      setTimeout(() => {
        if (!_active || _currentTurn !== botColor) return;
        _botMove();
      }, 700 + Math.random() * 500); 
    }
  }
}

function updateTimerUI(graceTime = null) {
  const el = _$container.querySelector('.hud-timer');
  const myColor = window.CW_SESSION.myColor;
  if (!el) return;

  if (graceTime !== null) {
    el.innerHTML = `<span style="font-size:0.6rem;">DESCONECTADO</span><br>${graceTime}s`;
    el.style.color = "var(--pink)"; el.classList.add('urgent'); return;
  }

  if (_currentTurn === myColor) {
    el.textContent = `TU TURNO: ${_timeLeft.toString().padStart(2, '0')}`; el.style.color = "white";
  } else {
    el.textContent = `ESPERANDO: ${_timeLeft.toString().padStart(2, '0')}`; el.style.color = "var(--text-dim)";
  }
  if (_timeLeft <= 3) el.classList.add('urgent'); else el.classList.remove('urgent');
}

async function claimForfeitVictory() {
  if (!_active) return;
  _finishGame(window.CW_SESSION.myColor, false);
}

async function _passTurn() {
  if (!_active) return;
  _turnCount++;
  const nextTurn = _currentTurn === 'pink' ? 'blue' : 'pink';

  if (_currentTurn === window.CW_SESSION.myColor || window.CW_SESSION.isBotMatch) {
     _currentTurn = nextTurn; updateTimerUI(); 
     if (window.CW_SESSION.matchId) {
         const sb = getSupabase();
         sb.from('matches').update({ board_state: window.CW_SESSION.board, current_turn: nextTurn })
           .eq('id', window.CW_SESSION.matchId).then(({error}) => { if(error) console.error("Error de sync:", error); });
     }
     _startTurn();
  }
}

async function _addMass(row, col, color) {
  _isAnimating = true; await _processMass(row, col, color);
  if (!_active) return;
  if (!_checkGameOver()) _passTurn();
  _isAnimating = false;
}

async function _processMass(row, col, color) {
  if (!_active) return;
  const cell = window.CW_SESSION.board[row][col];
  cell.owner = color; cell.mass++;

  if (cell.mass >= 4) { await _explode(row, col, color); } else { updateDOM(); }
}

async function _explode(row, col, color) {
  if (!_active) return;
  window.CW_SESSION.board[row][col].mass = 0; window.CW_SESSION.board[row][col].owner = null; 
  updateDOM();

  const neighbors = [];
  if (row > 0) neighbors.push({row: row - 1, col});
  if (row < BOARD_SIZE - 1) neighbors.push({row: row + 1, col});
  if (col > 0) neighbors.push({row, col: col - 1});
  if (col < BOARD_SIZE - 1) neighbors.push({row, col: col + 1});

  await new Promise(r => setTimeout(r, 200));

  for (const n of neighbors) {
    if (!_active) break;
    await _processMass(n.row, n.col, color);
  }
}

// ═════════════════════════════════════════════════════════
// 🧠 MOTOR MINIMAX (SIMULADOR DE FUTURO Y REACCIONES EN CADENA)
// ═════════════════════════════════════════════════════════

// Clonar el tablero en la mente del Bot
function _cloneBoard(board) {
  return board.map(row => row.map(cell => ({ owner: cell.owner, mass: cell.mass })));
}

// Conseguir los movimientos legales de un color
function _getValidMoves(board, color) {
  let moves = [];
  let hasCells = false;
  for (let r=0; r<BOARD_SIZE; r++) {
    for (let c=0; c<BOARD_SIZE; c++) {
      if (board[r][c].owner === color) hasCells = true;
    }
  }
  for (let r=0; r<BOARD_SIZE; r++) {
    for (let c=0; c<BOARD_SIZE; c++) {
      if (hasCells) {
        if (board[r][c].owner === color) moves.push({r, c});
      } else {
        if (!board[r][c].owner) moves.push({r, c});
      }
    }
  }
  return moves;
}

// Simular CÓMO EXPLOTARÍA el tablero mentalmente en un milisegundo
function _simulateMove(board, r, c, color) {
  let temp = _cloneBoard(board);
  let queue = [{r, c, color}];
  let iterations = 0;

  while(queue.length > 0 && iterations < 300) {
    iterations++;
    let current = queue.shift();
    let cell = temp[current.r][current.c];

    cell.owner = current.color;
    cell.mass++;

    if (cell.mass >= 4) {
      cell.mass = 0;
      cell.owner = null;
      if (current.r > 0) queue.push({r: current.r - 1, c: current.c, color: current.color});
      if (current.r < 4) queue.push({r: current.r + 1, c: current.c, color: current.color});
      if (current.c > 0) queue.push({r: current.r, c: current.c - 1, color: current.color});
      if (current.c < 4) queue.push({r: current.r, c: current.c + 1, color: current.color});
    }
  }
  return temp;
}

// Evaluar quién va ganando en ese tablero imaginario
function _evaluateBoard(board, botColor, enemyColor) {
  let botScore = 0;
  let enemyScore = 0;
  for (let r=0; r<BOARD_SIZE; r++) {
    for (let c=0; c<BOARD_SIZE; c++) {
      let cell = board[r][c];
      if (cell.owner === botColor) {
        botScore += (cell.mass * 10);
        if (cell.mass === 3) botScore += 50; // Valora las bombas listas
      } else if (cell.owner === enemyColor) {
        enemyScore += (cell.mass * 10);
        if (cell.mass === 3) enemyScore += 50;
      }
    }
  }
  if (botScore > 0 && enemyScore === 0) return 999999; // Win instantáneo
  if (enemyScore > 0 && botScore === 0) return -999999; // Muerte instantánea
  return botScore - enemyScore;
}

function _botMove() {
  try {
    const board = window.CW_SESSION.board;
    const enemyColor = window.CW_SESSION.myColor;
    const botColor = enemyColor === 'pink' ? 'blue' : 'pink'; 

    let validMoves = _getValidMoves(board, botColor);
    if (validMoves.length === 0) { _passTurn(); return; }

    // Si es su primerísimo turno y el centro está vacío, atrápalo
    if (validMoves.length === 25 && !board[2][2].owner) {
      _addMass(2, 2, botColor); return;
    }

    let bestMove = null;
    let bestScore = -Infinity;

    for (const move of validMoves) {
      // 1. Simula SU propio movimiento
      let simBoard1 = _simulateMove(board, move.r, move.c, botColor);

      // Si este movimiento aniquila al jugador de una vez (y no es el turno 1), TÓMALO SIN PENSAR
      let eval1 = _evaluateBoard(simBoard1, botColor, enemyColor);
      if (eval1 > 900000 && _turnCount >= 2) {
         _addMass(move.r, move.c, botColor);
         return;
      }

      // 2. Simula TODAS LAS RESPUESTAS POSIBLES que tú (el enemigo) podrías hacerle
      let enemyMoves = _getValidMoves(simBoard1, enemyColor);
      let worstCaseScore = Infinity;

      for (const eMove of enemyMoves) {
         let simBoard2 = _simulateMove(simBoard1, eMove.r, eMove.c, enemyColor);
         let eval2 = _evaluateBoard(simBoard2, botColor, enemyColor);
         
         // El Bot asume que tú eres inteligentísimo y que elegirás la jugada que más daño le haga
         if (eval2 < worstCaseScore) {
             worstCaseScore = eval2; 
         }
      }

      // Si después de su movimiento, a ti no te quedan fichas, él ya ganó
      if (enemyMoves.length === 0) worstCaseScore = 999999;

      // Un toque micro-aleatorio para que no juegue como un robot aburrido
      worstCaseScore += Math.random();

      // El Bot elige el camino donde TU MEJOR RESPUESTA sea la menos dolorosa para él
      if (worstCaseScore > bestScore) {
         bestScore = worstCaseScore;
         bestMove = move;
      }
    }

    if (bestMove) { _addMass(bestMove.r, bestMove.c, botColor); } 
    else { _addMass(validMoves[0].r, validMoves[0].c, botColor); } // Seguro

  } catch (err) { console.error("Error en Motor Cuántico:", err); _passTurn(); }
}

function _checkGameOver() {
  let pink = 0, blue = 0;
  const board = window.CW_SESSION.board;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].owner === 'pink') pink++;
      else if (board[r][c].owner === 'blue') blue++;
    }
  }
  if (_turnCount >= 2) {
     if (pink === 0 && blue > 0) { _finishGame('blue'); return true; }
     if (blue === 0 && pink > 0) { _finishGame('pink'); return true; }
  }
  return false;
}

async function _finishGame(winnerColor, fromDB = false) {
  if (!_active) return; 
  _active = false;
  
  clearInterval(_turnTimer); clearInterval(_graceTimer);
  if (_matchChannel) _matchChannel.unsubscribe();
  
  const myColor = window.CW_SESSION.myColor;
  const win = winnerColor === myColor;

  _$container.innerHTML = `
    <div class="result-screen" style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; width: 100%; background:var(--bg-dark); position: absolute; top: 0; left: 0; z-index: 999;">
      <h1 class="result-title" style="color:var(--text-dim); font-size: 1.4rem;">PROCESANDO...</h1>
      <p style="color:var(--text-dim);font-family:var(--font-mono);margin-bottom:2rem; text-align:center;">Guardando partida en el servidor</p>
    </div>
  `;
  
  try {
    const sb = getSupabase();
    if (!fromDB && window.CW_SESSION.matchId) {
       await sb.from('matches')
         .update({ status: 'finished', winner: winnerColor, board_state: window.CW_SESSION.board })
         .eq('id', window.CW_SESSION.matchId);
    }
  } catch (e) { console.error("Error guardando final:", e); }

  _$container.innerHTML = `
    <div class="result-screen" style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; width: 100%; background:var(--bg-dark); position: absolute; top: 0; left: 0; z-index: 999;">
      <h1 class="result-title ${win ? 'result-win' : 'result-lose'}">${win ? '¡VICTORIA!' : 'DERROTA'}</h1>
      <p style="color:var(--text-dim);font-family:var(--font-mono);margin-bottom:2rem; text-align:center;">${win ? '+50 CP acreditados' : 'Perdiste la batalla'}</p>
      <button class="btn btn-primary" id="btn-exit" style="width:200px;">VOLVER AL INICIO</button>
    </div>
  `;
  
  _$container.querySelector('#btn-exit').addEventListener('click', async () => {
    const $btn = _$container.querySelector('#btn-exit'); 
    $btn.textContent = "SALIENDO..."; $btn.style.opacity = "0.7"; $btn.style.pointerEvents = "none";

    if (window.CW_SESSION && window.CW_SESSION.matchId) {
        try {
           const sb = getSupabase();
           await sb.from('matches').update({ status: 'finished' }).eq('id', window.CW_SESSION.matchId);
        } catch(e) {}
    }

    window.CW_SESSION = null; 
    await reloadProfile(); 
    setView('dashboard');
  });
}
