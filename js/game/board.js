/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/board.js
 * MONOLITO 100/100: IA BLINDADA + GUARDADO ESTRICTO + DOBLE DISPARO
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast } from '../core/app.js';
import { setView, getProfile, setProfile } from '../core/state.js';
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
  
  if (!window.CW_SESSION || !window.CW_SESSION.board) {
    showToast('Sesión inválida', 'error');
    setView('dashboard');
    return;
  }

  _active = true;
  _currentTurn = 'pink'; 
  _isAnimating = false;
  _turnCount = 0;

  const sb = getSupabase();

  // ⚡ ESCUDO 1: OBLIGAMOS A LEER SUPABASE SIEMPRE (Sea Humano o Bot)
  if (window.CW_SESSION.matchId) {
    try {
      const { data: matchData } = await sb.from('matches').select('*').eq('id', window.CW_SESSION.matchId).single();
      if (matchData) {
        if (matchData.status === 'finished' || matchData.status === 'cancelled') {
            setView('dashboard');
            return;
        }
        if (matchData.board_state) window.CW_SESSION.board = matchData.board_state;
        if (matchData.current_turn) _currentTurn = matchData.current_turn;
        
        // Recalculamos los turnos jugados para que el sistema sepa si ya puede declarar un ganador
        let pieces = 0;
        for(let r=0; r<BOARD_SIZE; r++) {
           for(let c=0; c<BOARD_SIZE; c++) {
              if (matchData.board_state[r][c].owner) pieces++;
           }
        }
        _turnCount = pieces;
      }
    } catch(e) { console.error("Error cargando tablero desde Supabase:", e); }

    // El canal en tiempo real solo lo abrimos para Humanos
    if (!window.CW_SESSION.isBotMatch) {
      _matchChannel = sb.channel(`game_${window.CW_SESSION.matchId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${window.CW_SESSION.matchId}` }, (payload) => {
          const newData = payload.new;
          
          if (newData.status === 'finished' || newData.status === 'cancelled') {
             if (newData.winner) _finishGame(newData.winner, true);
             return;
          }

          if (newData.current_turn === window.CW_SESSION.myColor && _currentTurn !== window.CW_SESSION.myColor) {
             window.CW_SESSION.board = newData.board_state;
             _currentTurn = newData.current_turn;
             updateDOM();
             _startTurn();
          }
        })
        .subscribe();
    }
  }

  renderHTML();
  updateDOM();
  _startTurn();
}

function renderHTML() {
  const myColor = window.CW_SESSION.myColor || 'pink';
  const rivalName = window.CW_SESSION.rivalName || window.CW_SESSION.botName || 'BOT';

  const youText = myColor === 'pink' ? 'TÚ (ROSA)' : 'TÚ (AZUL)';
  const youColorVar = myColor === 'pink' ? 'var(--pink)' : 'var(--blue)';
  
  const rivalText = myColor === 'pink' ? `${rivalName} (AZUL)` : `${rivalName} (ROSA)`;
  const rivalColorVar = myColor === 'pink' ? 'var(--blue)' : 'var(--pink)';

  _$container.innerHTML = `
  <div class="game-arena" id="arena-main">
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
    const rivalColor = window.CW_SESSION.myColor === 'pink' ? 'blue' : 'pink';
    _finishGame(rivalColor);
  });
}

function updateDOM() {
  if (!_active) return;
  const game = window.CW_SESSION;
  const cells = _$container.querySelectorAll('.cell');
  
  if(cells.length === 0) return; 

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
    const sYou = _$container.querySelector('#score-you');
    const sRiv = _$container.querySelector('#score-rival');
    if(sYou) sYou.textContent = pinkScore;
    if(sRiv) sRiv.textContent = blueScore;
  } else {
    const sYou = _$container.querySelector('#score-you');
    const sRiv = _$container.querySelector('#score-rival');
    if(sYou) sYou.textContent = blueScore;
    if(sRiv) sRiv.textContent = pinkScore;
  }
}

function handlePlayerClick(row, col) {
  const myColor = window.CW_SESSION.myColor || 'pink';
  
  if (!_active || _isAnimating) return;
  
  if (_currentTurn !== myColor) {
    showToast('Espera tu turno', 'warning');
    return; 
  }

  const cell = window.CW_SESSION.board[row][col];
  if (cell.owner && cell.owner !== myColor) return; 

  let myCellsCount = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (window.CW_SESSION.board[r][c].owner === myColor) myCellsCount++;
    }
  }
  if (myCellsCount > 0 && cell.owner !== myColor) return; 

  clearInterval(_turnTimer);
  _addMass(row, col, myColor);
}

function _startTurn() {
  if (!_active) return;
  clearInterval(_turnTimer);
  clearInterval(_graceTimer);
  _timeLeft = 10;
  updateTimerUI();

  const myColor = window.CW_SESSION.myColor || 'pink';

  if (_currentTurn === myColor) {
    _turnTimer = setInterval(() => {
      _timeLeft--;
      updateTimerUI();
      if (_timeLeft <= 0) {
        clearInterval(_turnTimer);
        _passTurn(); 
      }
    }, 1000);
  } else {
    if (!window.CW_SESSION.isBotMatch) {
      _totalWait = 40; 
      _graceTimer = setInterval(() => {
        _totalWait--;
        if (_totalWait <= 30) updateTimerUI(_totalWait); 
        else updateTimerUI(); 

        if (_totalWait <= 0) {
           clearInterval(_graceTimer);
           claimForfeitVictory(); 
        }
      }, 1000);
    } else {
      setTimeout(() => {
        if (!_active || _currentTurn !== 'blue') return;
        _botMove();
      }, 1000 + Math.random() * 1000);
    }
  }
}

function updateTimerUI(graceTime = null) {
  const el = _$container.querySelector('.hud-timer');
  const myColor = window.CW_SESSION.myColor || 'pink';
  
  if (!el) return;

  if (graceTime !== null) {
    el.innerHTML = `<span style="font-size:0.7rem;">DESCONECTADO</span><br>${graceTime}s`;
    el.style.color = "var(--pink)";
    el.classList.add('urgent');
    return;
  }

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

async function claimForfeitVictory() {
  if (!_active) return;
  const myColor = window.CW_SESSION.myColor || 'pink';
  const sb = getSupabase();
  
  await sb.from('matches').update({
     status: 'finished',
     winner: myColor
  }).eq('id', window.CW_SESSION.matchId);
  
  _finishGame(myColor, true);
}

// ⚡ ESCUDO 1: GUARDAR SIEMPRE EN SUPABASE, INCLUSO PARA BOTS
async function _passTurn() {
  if (!_active) return;
  _turnCount++;
  const nextTurn = _currentTurn === 'pink' ? 'blue' : 'pink';

  if (_currentTurn === window.CW_SESSION.myColor || window.CW_SESSION.isBotMatch) {
     _currentTurn = nextTurn; 
     updateTimerUI(); 
     
     if (window.CW_SESSION.matchId) {
         const sb = getSupabase();
         try {
             await sb.from('matches').update({
                board_state: window.CW_SESSION.board,
                current_turn: nextTurn
             }).eq('id', window.CW_SESSION.matchId);
         } catch(e) { console.error("Error guardando turno:", e); }
     }
     
     _startTurn();
  }
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

// ⚡ ESCUDO 2: EL CEREBRO BLINDADO DEL BOT (Si falla, pasa turno, nunca se congela)
function _botMove() {
  try {
    const board = window.CW_SESSION.board;
    const humanWinsNext = window.CW_SESSION.humanWinsNext === true; 
    
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

    if (!humanWinsNext) {
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
    } else {
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
  } catch (err) {
    // Si la matemática le da un ACV, imprimimos el error pero PASAMOS EL TURNO para no joder al jugador
    console.error("BOT CRASH EVITADO:", err);
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
     const myColor = window.CW_SESSION.myColor || 'pink';
     
     if (pink === 0 && blue > 0) { _finishGame('blue'); return true; }
     if (blue === 0 && pink > 0) { _finishGame('pink'); return true; }
  }
  return false;
}

async function _finishGame(winnerColor, fromDB = false) {
  if (!_active) return; 
  _active = false;
  
  clearInterval(_turnTimer);
  clearInterval(_graceTimer);
  if (_matchChannel) _matchChannel.unsubscribe();
  
  const myColor = window.CW_SESSION.myColor || 'pink';
  const win = winnerColor === myColor;
  
  try {
    const sb = getSupabase();

    if (!fromDB && window.CW_SESSION.matchId) {
       await sb.from('matches').update({ 
           status: 'finished', 
           winner: winnerColor,
           board_state: window.CW_SESSION.board
       }).eq('id', window.CW_SESSION.matchId);
    }
  } catch (e) { console.error("Error al finalizar:", e); }

  _$container.innerHTML = `
    <div class="result-screen" style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; width: 100%; background:var(--bg-dark); position: absolute; top: 0; left: 0; z-index: 999;">
      <h1 class="result-title ${win ? 'result-win' : 'result-lose'}">${win ? '¡VICTORIA!' : 'DERROTA'}</h1>
      <p style="color:var(--text-dim);font-family:var(--font-mono);margin-bottom:2rem; text-align:center;">
        ${win ? '+50 CP acreditados' : 'Perdiste la batalla'}
      </p>
      <button class="btn btn-primary" id="btn-exit" style="width:200px;">VOLVER AL INICIO</button>
      <p id="board-error-log" style="color:#ff4444; font-size:0.8rem; margin-top:15px; text-align:center; max-width:80%; font-family:var(--font-mono);"></p>
    </div>
  `;
  
  // ⚡ ESCUDO 3 (DOBLE DISPARO): Aseguramos la muerte de la partida al presionar el botón de salida
  _$container.querySelector('#btn-exit').addEventListener('click', async () => {
    const $btn = _$container.querySelector('#btn-exit');
    const $err = _$container.querySelector('#board-error-log');
    
    try {
      $btn.textContent = "SALIENDO...";
      $btn.style.opacity = "0.7";
      $btn.style.pointerEvents = "none";
      
      // DOBLE DISPARO A SUPABASE: Asegurarnos de que quede en 'finished' sí o sí
      if (window.CW_SESSION && window.CW_SESSION.matchId) {
          const sb = getSupabase();
          await sb.from('matches').update({ status: 'finished' }).eq('id', window.CW_SESSION.matchId);
      }
      
      window.CW_SESSION = null; 
      
      const { reloadProfile } = await import('../core/state.js');
      await reloadProfile(); 
      setView('dashboard');

    } catch (error) {
      console.error("Error saliendo al inicio:", error);
      if ($err) $err.innerHTML = `⚠️ Falla detectada: ${error.message}<br>Forzando salida en 2s...`;
      setTimeout(() => { setView('dashboard'); }, 2000);
    }
  });
}
