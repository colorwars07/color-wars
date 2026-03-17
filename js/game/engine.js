/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/engine.js
 * Game Engine: TURN-BASED (10s), Bot 65/35, Chain Reaction
 * ═══════════════════════════════════════════════════════
 */

import { getNeighbors }   from '../core/app.js';
import {
  updateGameBoard, setGameOver, recordWin, recordLoss,
  GAME_CFG, subscribe, getGame
} from '../core/state.js';

let _active = false;
let _onRender = null;
let _onGameOver = null;

let _currentTurn = 'pink'; 
let _turnTimer = null;
let _timeLeft = 10;
let _isAnimating = false;

const _stateCache = { currentGame: null };
subscribe('currentGame', (val) => { _stateCache.currentGame = val; });
(function initCache() { _stateCache.currentGame = getGame(); })();
function getState(key) { return _stateCache[key]; }

export function startEngine(onRender, onGameOver) {
  _onRender = onRender;
  _onGameOver = onGameOver;
  _active = true;
  _currentTurn = 'pink';
  _isAnimating = false;
  _startTurn();
}

export function stopEngine() {
  _active = false;
  if (_turnTimer) clearInterval(_turnTimer);
}

export function playerClick(row, col) {
  if (!_active || _isAnimating || _currentTurn !== 'pink') return;

  const game = getState('currentGame');
  if (!game || game.isOver) return;

  const cell = game.board[row][col];
  if (cell.blocked) return;
  if (cell.owner === 'blue') return; // Solo puedes tocar las tuyas o vacías

  _clearTimer();
  _addMass(game.board, row, col, 'pink');
}

function _startTurn() {
  if (!_active) return;
  _timeLeft = 10;
  _updateTimerUI();

  _turnTimer = setInterval(() => {
    _timeLeft--;
    _updateTimerUI();

    if (_timeLeft <= 0) {
      _clearTimer();
      _passTurn(); // Turno perdido por inactividad
    }
  }, 1000);

  if (_currentTurn === 'blue') {
    // Turno del bot: simula que está pensando (1.5s a 2.5s)
    setTimeout(() => {
      if (!_active || _currentTurn !== 'blue') return;
      _clearTimer();
      _botMove(getState('currentGame').board);
    }, 1500 + Math.random() * 1000);
  }
}

function _clearTimer() {
  if (_turnTimer) { clearInterval(_turnTimer); _turnTimer = null; }
}

function _updateTimerUI() {
  const el = document.querySelector('.hud-timer');
  if (el) {
    el.textContent = `00:${_timeLeft.toString().padStart(2, '0')}`;
    if (_timeLeft <= 3) el.classList.add('urgent');
    else el.classList.remove('urgent');
  }
}

function _passTurn() {
  if (!_active) return;
  _currentTurn = _currentTurn === 'pink' ? 'blue' : 'pink';
  _startTurn();
}

// ── LÓGICA DE MASA Y EXPLOSIÓN ─────────────────────────

async function _addMass(board, row, col, color) {
  _isAnimating = true; // Bloquea clics durante la explosión
  await _processMass(board, row, col, color);
  
  if (!_active) return;
  
  const gameOver = _checkGameOver(getState('currentGame').board);
  if (!gameOver) {
    _passTurn();
  }
  _isAnimating = false;
}

async function _processMass(board, row, col, color) {
  if (!_active) return;
  const cell = board[row][col];
  if (cell.blocked) return;

  cell.owner = color;
  cell.mass++;

  if (cell.mass >= 4) { // Explota al llegar a 4 de masa
    await _explode(board, row, col, color);
  } else {
    updateGameBoard(board);
    _onRender?.();
  }
}

async function _explode(board, row, col, color) {
  if (!_active) return;
  
  board[row][col].mass = 0;
  board[row][col].owner = null; // Se vuelve neutral al explotar
  updateGameBoard(board);
  _onRender?.();

  const neighbors = getNeighbors(row, col, GAME_CFG.BOARD_SIZE);
  
  // Pausa visual de la explosión
  await new Promise(r => setTimeout(r, 200));

  for (const n of neighbors) {
    if (!_active) break;
    const freshGame = getState('currentGame');
    if (!freshGame) break;
    
    await _processMass(freshGame.board, n.row, n.col, color);
  }
}

// ── IA DEL BOT (65/35) ────────────────────────────────

function _botMove(board) {
  const roll = Math.floor(Math.random() * 100) + 1;

  if (roll <= 65) {
    // 65%: Movimiento Óptimo (Buscar casillas a punto de explotar)
    const readyToExplode = _getCells(board, 'blue').filter(c => board[c[0]][c[1]].mass === 3);
    if (readyToExplode.length) {
      const [r, c] = readyToExplode[Math.floor(Math.random() * readyToExplode.length)];
      _addMass(board, r, c, 'blue');
      return;
    }

    // Si no hay a punto de explotar, expandir una propia
    const own = _getCells(board, 'blue');
    if (own.length) {
      const [r, c] = own[Math.floor(Math.random() * own.length)];
      _addMass(board, r, c, 'blue');
      return;
    }
  } 

  // 35%: Movimiento Sub-óptimo o buscar casillas libres
  const ownLow = _getCells(board, 'blue').filter(c => board[c[0]][c[1]].mass <= 1);
  const free = _getEmptyCells(board);
  const pool = [...ownLow, ...free];
  
  if (pool.length) {
    const [r, c] = pool[Math.floor(Math.random() * pool.length)];
    _addMass(board, r, c, 'blue');
  } else {
    _passTurn(); // Si no hay dónde jugar
  }
}

// ── CHECK GAME OVER ───────────────────────────────────

function _checkGameOver(board) {
  let pink = 0, blue = 0, neutral = 0;
  for (let r = 0; r < GAME_CFG.BOARD_SIZE; r++) {
    for (let c = 0; c < GAME_CFG.BOARD_SIZE; c++) {
      if (board[r][c].blocked) continue;
      if (board[r][c].owner === 'pink') pink++;
      else if (board[r][c].owner === 'blue') blue++;
      else neutral++;
    }
  }

  // Si alguien se queda sin casillas
  if (neutral < (GAME_CFG.BOARD_SIZE * GAME_CFG.BOARD_SIZE)) { // Evita game over en el primer turno
     if (pink === 0 && blue > 0) { _finishGame('blue'); return true; }
     if (blue === 0 && pink > 0) { _finishGame('pink'); return true; }
  }
  return false;
}

async function _finishGame(winner) {
  stopEngine();
  setGameOver(winner);

  if (winner === 'pink') await recordWin();
  else await recordLoss();

  _onGameOver?.(winner);
}

function _getCells(board, color) {
  const res = [];
  for (let r = 0; r < GAME_CFG.BOARD_SIZE; r++)
    for (let c = 0; c < GAME_CFG.BOARD_SIZE; c++)
      if (board[r][c].owner === color) res.push([r, c]);
  return res;
}

function _getEmptyCells(board) {
  const res = [];
  for (let r = 0; r < GAME_CFG.BOARD_SIZE; r++)
    for (let c = 0; c < GAME_CFG.BOARD_SIZE; c++)
      if (!board[r][c].owner && !board[r][c].blocked) res.push([r, c]);
  return res;
}
