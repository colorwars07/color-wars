/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/board.js
 * MONOLITO: Tablero + Bot Inteligente/Alternante
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast } from '../core/app.js';
import { setView, getProfile, setProfile } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

const BOARD_SIZE = 5;
let _active = false;
let _currentTurn = 'pink';
let _turnTimer = null;
let _timeLeft = 10;
let _isAnimating = false;
let _turnCount = 0;
let _$container = null; 

registerView('game', initGameView);

export async function initGameView($container) {
  _$container = $container;
  
  if (!window.CW_SESSION || !window.CW_SESSION.board) {
    showToast('Sesión inválida', 'error');
    setView('dashboard');
    return;
  }

  _active = true;
  _currentTurn = 'pink';
  _isAnimating = false;
  _turnCount = 0;

  renderHTML();
  updateDOM();
  _startTurn();
}

function renderHTML() {
  // Leemos el nombre del rival (o ponemos BOT si por alguna razón falla)
  const rivalName = window.CW_SESSION.botName || 'BOT';

  _$container.innerHTML = `
  <div class="game-arena">
    <div class="game-hud">
      <div style="color:var(--pink);font-weight:900;font-size:1.2rem;text-shadow:0 0 10px var(--pink);">TÚ: <span id="score-pink">0</span></div>
      <div class="hud-timer">00:10</div>
      <div style="color:var(--blue);font-weight:900;font-size:1.1rem;text-shadow:0 0 10px var(--blue); text-transform:uppercase;">${rivalName}: <span id="score-blue">0</span></div>
    </div>
    <div class="board-wrap">
      <div class="board-grid" id="grid" style="display:grid; grid-template-columns:repeat(5,1fr); gap:5px;">
        ${window.CW_SESSION.board.map((row, r) => row.map((_, c) => `
          <div class="cell" data-r="${r}" data-c="${c}"><div class="cell-mass"></div></div>
        `).join('')).join('')}
      </div>
    </div>
    <button id="btn-surrender" class="btn btn-ghost" style="margin-top:20px;">🏳️ Rendirse</button>
  </div>`;

  _$container.querySelector('#grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    handlePlayerClick(parseInt(cell.dataset.r), parseInt(cell.dataset.c));
  });

  _$container.querySelector('#btn-surrender').addEventListener('click', () => {
    _active = false;
    clearInterval(_turnTimer);
    setView('dashboard');
    showToast('Te rendiste.', 'warning');
  });
}

function updateDOM() {
  if (!_active) return;
  const game = window.CW_SESSION;
  const cells = _$container.querySelectorAll('.cell');
  let pinkScore = 0, blueScore = 0;
  let idx = 0;

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

  _$container.querySelector('#score-pink').textContent = pinkScore;
  _$container.querySelector('#score-blue').textContent = blueScore;
}

// ⚡ LÓGICA DE JUGADOR (Expansión Estricta)
function handlePlayerClick(row, col) {
  if (!_active || _isAnimating || _currentTurn !== 'pink') return;
  const cell = window.CW_SESSION.board[row][col];
  
  if (cell.owner === 'blue') return; 

  let myCellsCount = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (window.CW_SESSION.board[r][c].owner === 'pink') myCellsCount++;
    }
  }

  if (myCellsCount > 0 && cell.owner !== 'pink') {
    return; // Candado: No puede tocar casillas vacías si ya tiene suyas
  }

  clearInterval(_turnTimer);
  _addMass(row, col, 'pink');
}

function _startTurn() {
  if (!_active) return;
  _timeLeft = 10;
  updateTimerUI();

  _turnTimer = setInterval(() => {
    _timeLeft--;
    updateTimerUI();
    if (_timeLeft <= 0) {
      clearInterval(_turnTimer);
      _passTurn(); 
    }
  }, 1000);

  if (_currentTurn === 'blue') {
    setTimeout(() => {
      if (!_active || _currentTurn !== 'blue') return;
      clearInterval(_turnTimer);
      _botMove();
    }, 1000 + Math.random() * 1000);
  }
}

function updateTimerUI() {
  const el = _$container.querySelector('.hud-timer');
  if (el) {
    el.textContent = `00:${_timeLeft.toString().padStart(2, '0')}`;
    if (_timeLeft <= 3) el.classList.add('urgent');
    else el.classList.remove('urgent');
  }
}

function _passTurn() {
  if (!_active) return;
  _turnCount++;
  _currentTurn = _currentTurn === 'pink' ? 'blue' : 'pink';
  _startTurn();
}

async function _addMass(row, col, color) {
  _isAnimating = true;
  await _processMass(row, col, color);
  if (!_active) return;

  if (!_checkGameOver()) _passTurn();
  _isAnimating = false;
}

async function _processMass(row, col, color) {
  if (!_active) return;
  const cell = window.CW_SESSION.board[row][col];
  cell.owner = color;
  cell.mass++;

  if (cell.mass >= 4) {
    await _explode(row, col, color);
  } else {
    updateDOM();
  }
}

async function _explode(row, col, color) {
  if (!_active) return;
  window.CW_SESSION.board[row][col].mass = 0;
  window.CW_SESSION.board[row][col].owner = null; 
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

// ⚡ LÓGICA DE BOT ALTERNANTE (Diablo vs Tonto)
function _botMove() {
  const board = window.CW_SESSION.board;
  const humanWinsNext = window.CW_SESSION.humanWinsNext; 
  
  let botCellsCount = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].owner === 'blue') botCellsCount++;
    }
  }

  // --- MODO DIABLO (El bot te quiere masacrar) ---
  if (humanWinsNext === false) {
    // 1. Buscar explotar (Masa 3)
    const ready = [];
    for(let r=0; r<BOARD_SIZE; r++) for(let c=0; c<BOARD_SIZE; c++) if(board[r][c].owner === 'blue' && board[r][c].mass === 3) ready.push({r,c});
    if (ready.length) {
      const move = ready[Math.floor(Math.random() * ready.length)];
      _addMass(move.r, move.c, 'blue');
      return;
    }
    // 2. Engordar casillas
    const build = [];
    for(let r=0; r<BOARD_SIZE; r++) for(let c=0; c<BOARD_SIZE; c++) if(board[r][c].owner === 'blue' && board[r][c].mass > 0) build.push({r,c});
    if (build.length) {
      const move = build[Math.floor(Math.random() * build.length)];
      _addMass(move.r, move.c, 'blue');
      return;
    }
  } 
  
  // --- MODO TONTO (El bot te deja ganar) O MODO INICIO ---
  const pool = [];
  for(let r=0; r<BOARD_SIZE; r++) {
    for(let c=0; c<BOARD_SIZE; c++) {
      if (botCellsCount === 0 && !board[r][c].owner) {
         pool.push({r,c});
      } else if (board[r][c].owner === 'blue') {
         pool.push({r,c});
      }
    }
  }

  if (pool.length) {
    // Si está en Modo Tonto, evita explotar casillas si es posible
    if (humanWinsNext === true && botCellsCount > 0) {
        const dumbPool = pool.filter(p => board[p.r][p.c].mass < 3);
        const finalPool = dumbPool.length > 0 ? dumbPool : pool;
        const move = finalPool[Math.floor(Math.random() * finalPool.length)];
        _addMass(move.r, move.c, 'blue');
    } else {
        const move = pool[Math.floor(Math.random() * pool.length)];
        _addMass(move.r, move.c, 'blue');
    }
  } else {
    _passTurn();
  }
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

async function _finishGame(winner) {
  _active = false;
  clearInterval(_turnTimer);
  const win = winner === 'pink';
  
  try {
    const profile = getProfile();
    const sb = getSupabase();
    
    if (win) {
      const newBalance = Number(profile.wallet_bs) + 320;
      const newWins = (profile.wins || 0) + 1;
      await sb.from('users').update({ wallet_bs: newBalance, wins: newWins }).eq('id', profile.id);
      setProfile({ ...profile, wallet_bs: newBalance, wins: newWins });
    } else {
      const newLosses = (profile.losses || 0) + 1;
      await sb.from('users').update({ losses: newLosses }).eq('id', profile.id);
      setProfile({ ...profile, losses: newLosses });
    }
  } catch (e) {}

  _$container.innerHTML += `
    <div class="result-screen">
      <h1 class="result-title ${win ? 'result-win' : 'result-lose'}">${win ? '¡VICTORIA!' : 'DERROTA'}</h1>
      <p style="color:var(--text-dim);font-family:var(--font-mono);margin-bottom:2rem;">${win ? '+320 Bs acreditados' : 'Te han masacrado'}</p>
      <button class="btn btn-primary" id="btn-exit">VOLVER AL INICIO</button>
    </div>
  `;
  _$container.querySelector('#btn-exit').addEventListener('click', () => setView('dashboard'));
}
