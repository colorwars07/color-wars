/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/board.js
 * MONOLITO FINAL: MULTIJUGADOR REAL + IA DEL BOT
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
let _matchChannel = null; // El cable para el multijugador

registerView('game', initGameView);

export async function initGameView($container) {
  _$container = $container;
  
  if (!window.CW_SESSION || !window.CW_SESSION.board) {
    showToast('Sesión inválida', 'error');
    setView('dashboard');
    return;
  }

  _active = true;
  _currentTurn = 'pink'; // El juego siempre arranca con el Rosado
  _isAnimating = false;
  _turnCount = 0;

  // Si es una partida entre humanos, conectamos el cable para escuchar al rival
  if (!window.CW_SESSION.isBotMatch && window.CW_SESSION.matchId) {
    const sb = getSupabase();
    _matchChannel = sb.channel(`game_${window.CW_SESSION.matchId}`)
      .on('broadcast', { event: 'player_move' }, (payload) => {
        // Cuando el rival hace clic en su teléfono, esto lo recibe y lo dibuja
        if (!_active) return;
        clearInterval(_turnTimer);
        _addMass(payload.payload.r, payload.payload.c, payload.payload.color);
      })
      .subscribe();
  }

  renderHTML();
  updateDOM();
  _startTurn();
}

function renderHTML() {
  const isBot = window.CW_SESSION.isBotMatch;
  const myColor = window.CW_SESSION.myColor || 'pink';
  const rivalName = window.CW_SESSION.rivalName || window.CW_SESSION.botName || 'BOT';

  // Mostrar quién eres tú y quién es el rival
  const youText = myColor === 'pink' ? 'TÚ (ROSADO)' : 'TÚ (AZUL)';
  const youColorVar = myColor === 'pink' ? 'var(--pink)' : 'var(--blue)';
  
  const rivalText = myColor === 'pink' ? `${rivalName} (AZUL)` : `${rivalName} (ROSADO)`;
  const rivalColorVar = myColor === 'pink' ? 'var(--blue)' : 'var(--pink)';

  _$container.innerHTML = `
  <div class="game-arena">
    <div class="game-hud">
      <div style="color:${youColorVar};font-weight:900;font-size:1rem;text-shadow:0 0 10px ${youColorVar}; text-transform:uppercase;">
        ${youText}: <span id="score-you">0</span>
      </div>
      <div class="hud-timer">00:10</div>
      <div style="color:${rivalColorVar};font-weight:900;font-size:1rem;text-shadow:0 0 10px ${rivalColorVar}; text-transform:uppercase;">
        ${rivalText}: <span id="score-rival">0</span>
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
    const cell = e.target.closest('.cell');
    if (!cell) return;
    handlePlayerClick(parseInt(cell.dataset.r), parseInt(cell.dataset.c));
  });

  _$container.querySelector('#btn-surrender').addEventListener('click', () => {
    _active = false;
    clearInterval(_turnTimer);
    if (_matchChannel) _matchChannel.unsubscribe();
    setView('dashboard');
    showToast('Abandonaste la partida.', 'warning');
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

  const myColor = window.CW_SESSION.myColor || 'pink';
  if (myColor === 'pink') {
    _$container.querySelector('#score-you').textContent = pinkScore;
    _$container.querySelector('#score-rival').textContent = blueScore;
  } else {
    _$container.querySelector('#score-you').textContent = blueScore;
    _$container.querySelector('#score-rival').textContent = pinkScore;
  }
}

// ⚡ LÓGICA DE JUGADOR MULTIJUGADOR
function handlePlayerClick(row, col) {
  const myColor = window.CW_SESSION.myColor || 'pink';
  
  // 1. Candados básicos
  if (!_active || _isAnimating) return;
  
  // 2. CANDADO DE TURNO: Si no es tu color, no puedes jugar
  if (_currentTurn !== myColor) {
    showToast('No es tu turno', 'warning');
    return; 
  }

  const cell = window.CW_SESSION.board[row][col];
  
  // 3. No tocar casillas del rival
  if (cell.owner && cell.owner !== myColor) return; 

  // 4. Regla de expansión estricta
  let myCellsCount = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (window.CW_SESSION.board[r][c].owner === myColor) myCellsCount++;
    }
  }
  if (myCellsCount > 0 && cell.owner !== myColor) {
    return; // Ignora el clic si intenta tocar vacía
  }

  // Si pasamos los candados, frenamos el reloj y hacemos la jugada
  clearInterval(_turnTimer);

  // Si es partida online, le avisamos al rival por el cable
  if (!window.CW_SESSION.isBotMatch && _matchChannel) {
    _matchChannel.send({
      type: 'broadcast',
      event: 'player_move',
      payload: { r: row, c: col, color: myColor }
    });
  }

  // Dibujamos en nuestra propia pantalla
  _addMass(row, col, myColor);
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
      // Si se acaba el tiempo y es mi turno, le aviso al otro que perdí el turno
      if (!window.CW_SESSION.isBotMatch && _currentTurn === window.CW_SESSION.myColor && _matchChannel) {
         _matchChannel.send({ type: 'broadcast', event: 'player_move', payload: { pass: true } });
      }
      _passTurn(); 
    }
  }, 1000);

  // Lógica de Inteligencia Artificial (SOLO SI ES PARTIDA CONTRA BOT)
  if (window.CW_SESSION.isBotMatch && _currentTurn === 'blue') {
    setTimeout(() => {
      if (!_active || _currentTurn !== 'blue') return;
      clearInterval(_turnTimer);
      _botMove();
    }, 1000 + Math.random() * 1000);
  }
}

function updateTimerUI() {
  const el = _$container.querySelector('.hud-timer');
  const myColor = window.CW_SESSION.myColor || 'pink';
  
  if (el) {
    if (_currentTurn === myColor) {
      el.textContent = `TU TURNO: ${_timeLeft.toString().padStart(2, '0')}`;
      el.style.color = "white";
    } else {
      el.textContent = `ESPERANDO: ${_timeLeft.toString().padStart(2, '0')}`;
      el.style.color = "var(--text-dim)";
    }
    
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

// ⚡ LÓGICA DEL BOT (Se mantiene igual, inteligente 100% legal)
function _botMove() {
  const board = window.CW_SESSION.board;
  const humanWinsNext = window.CW_SESSION.humanWinsNext; 
  
  const botCells = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].owner === 'blue') botCells.push({r, c, mass: board[r][c].mass});
    }
  }

  if (botCells.length === 0) {
    const emptyPool = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!board[r][c].owner) emptyPool.push({r, c});
      }
    }
    if (emptyPool.length > 0) {
        const startMove = emptyPool[Math.floor(Math.random() * emptyPool.length)];
        _addMass(startMove.r, startMove.c, 'blue');
    } else {
        _passTurn();
    }
    return;
  }

  if (humanWinsNext === false) {
    const readyToExplode = botCells.filter(cell => cell.mass === 3);
    if (readyToExplode.length > 0) {
      const move = readyToExplode[Math.floor(Math.random() * readyToExplode.length)];
      _addMass(move.r, move.c, 'blue');
      return;
    }
    
    const massTwo = botCells.filter(cell => cell.mass === 2);
    if (massTwo.length > 0) {
      const move = massTwo[Math.floor(Math.random() * massTwo.length)];
      _addMass(move.r, move.c, 'blue');
      return;
    }

    const move = botCells[Math.floor(Math.random() * botCells.length)];
    _addMass(move.r, move.c, 'blue');
    return;
  } 
  
  if (humanWinsNext === true) {
    const safeCells = botCells.filter(cell => cell.mass < 3);

    if (safeCells.length > 0) {
      const move = safeCells[Math.floor(Math.random() * safeCells.length)];
      _addMass(move.r, move.c, 'blue');
      return;
    } else {
      const move = botCells[Math.floor(Math.random() * botCells.length)];
      _addMass(move.r, move.c, 'blue');
      return;
    }
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
     const myColor = window.CW_SESSION.myColor || 'pink';
     
     if (pink === 0 && blue > 0) { _finishGame('blue'); return true; }
     if (blue === 0 && pink > 0) { _finishGame('pink'); return true; }
  }
  return false;
}

async function _finishGame(winnerColor) {
  _active = false;
  clearInterval(_turnTimer);
  if (_matchChannel) _matchChannel.unsubscribe(); // Desconectar cable
  
  const myColor = window.CW_SESSION.myColor || 'pink';
  const win = winnerColor === myColor;
  
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
      <p style="color:var(--text-dim);font-family:var(--font-mono);margin-bottom:2rem;">${win ? '+320 Bs acreditados' : 'Te masacraron'}</p>
      <button class="btn btn-primary" id="btn-exit">VOLVER AL INICIO</button>
    </div>
  `;
  _$container.querySelector('#btn-exit').addEventListener('click', () => setView('dashboard'));
}
