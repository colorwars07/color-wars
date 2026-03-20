/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/board.js
 * IA TERMINATOR 100% (Reacciones en Cadena + Defensa)
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
  if (cell.owner && cell.owner !== myColor) return; 

  let myCellsCount = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) { if (window.CW_SESSION.board[r][c].owner === myColor) myCellsCount++; }
  }
  if (myCellsCount > 0 && cell.owner !== myColor) return; 

  clearInterval(_turnTimer); _addMass(row, col, myColor);
}

function _startTurn() {
  if (!_active) return;
  clearInterval(_turnTimer); clearInterval(_graceTimer);
  _timeLeft = 10; updateTimerUI();

  const myColor = window.CW_SESSION.myColor;

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
      // Es el turno del BOT. Le damos entre 0.8 y 1.5 seg para que "piense"
      setTimeout(() => {
        if (!_active || _currentTurn !== window.CW_SESSION.botColor) return;
        _botMove();
      }, 800 + Math.random() * 700); 
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

// 🤖 CEREBRO TERMINATOR (La IA entiende Reacciones en Cadena)
function _botMove() {
  try {
    const board = window.CW_SESSION.board;
    const botColor = window.CW_SESSION.botColor;
    const enemyColor = window.CW_SESSION.myColor;
    const validMoves = [];

    // 1. Escanear el tablero buscando casillas válidas (Vacias o del Bot)
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!board[r][c].owner || board[r][c].owner === botColor) {
          validMoves.push({ r, c, mass: board[r][c].mass, owner: board[r][c].owner });
        }
      }
    }

    if (validMoves.length === 0) { _passTurn(); return; }

    // 2. Si es el primer turno del Bot, jugar hacia el centro (Mejor expansión)
    const botOwned = validMoves.filter(m => m.owner === botColor);
    if (botOwned.length === 0) {
      // Priorizar el centro (r:2, c:2) o celdas adyacentes
      validMoves.sort((a, b) => {
        const distA = Math.abs(a.r - 2) + Math.abs(a.c - 2);
        const distB = Math.abs(b.r - 2) + Math.abs(b.c - 2);
        return distA - distB;
      });
      // Tomar una de las mejores 3 opciones para no ser 100% predecible
      const startMove = validMoves[Math.floor(Math.random() * Math.min(3, validMoves.length))];
      _addMass(startMove.r, startMove.c, botColor);
      return;
    }

    // 3. EVALUACIÓN TÁCTICA (El Simulador del Futuro)
    let bestMove = null;
    let highestScore = -99999;

    for (const move of validMoves) {
      let score = 0;
      const r = move.r; const c = move.c;
      
      // A. Preferencia por subir niveles propios (Armar la bomba)
      if (move.owner === botColor) {
        if (move.mass === 3) score += 80;  // ¡Lista para explotar!
        if (move.mass === 2) score += 40;  // Casi lista
        if (move.mass === 1) score += 10;
      }

      // B. Escanear enemigos alrededor de este movimiento
      const neighbors = [ {rr: r-1, cc: c}, {rr: r+1, cc: c}, {rr: r, cc: c-1}, {rr: r, cc: c+1} ];
      
      for (const n of neighbors) {
        if (n.rr >= 0 && n.rr < BOARD_SIZE && n.cc >= 0 && n.cc < BOARD_SIZE) {
          const neighbor = board[n.rr][n.cc];
          
          if (neighbor.owner === enemyColor) {
            
            // LA MECÁNICA ESTRELLA: Amenaza de Reacción en Cadena
            if (neighbor.mass === 3) {
              if (move.owner === botColor) {
                if (move.mass === 3) {
                  // ¡EXPLOTAR PRIMERO! Me lo como y reviento su bomba a mi favor
                  score += 10000; 
                } else if (move.mass === 2) {
                  // ¡DEFENSA TENSIVA! Subo a 3 para amenazarlo y ponerlo nervioso
                  score += 5000;
                } else {
                  // Intento resistir
                  score += 100;
                }
              } else {
                // Si la celda está vacía, no la toco al lado de una bomba nivel 3 porque me la roba fácil
                score -= 1000; 
              }
            } 
            else if (neighbor.mass === 2) {
              if (move.mass === 3) {
                // Si exploto mi 3, me como su 2 y se vuelve 3 mío. ¡Hermoso combo!
                score += 2000;
              } else if (move.mass === 2) {
                // Presión psicológica. Subo a 3 para forzarlo
                score += 500;
              }
            }
            else {
              // Comer fichas pequeñas siempre es bueno
              if (move.mass === 3) score += 800;
            }

          } else if (neighbor.owner === botColor) {
            // Sinergia: Fichas juntas se potencian en cadenas
            score += 15;
          }
        }
      }

      // Añadir un poco de aleatoriedad para desempatar puntuaciones iguales
      score += Math.random() * 10;

      if (score > highestScore) {
        highestScore = score;
        bestMove = move;
      }
    }

    if (bestMove) {
      _addMass(bestMove.r, bestMove.c, botColor);
    } else {
      _passTurn(); // Fallback de emergencia
    }
  } catch (err) { console.error("Error en IA:", err); _passTurn(); }
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
      <h1 class="result-title" style="color:var(--text-dim); font-size: 1.4rem;">PROCESANDO RESULTADO...</h1>
    </div>
  `;
  
  try {
    const sb = getSupabase();
    if (!fromDB && window.CW_SESSION.matchId) {
       const { error } = await sb.from('matches').update({ status: 'finished', winner: winnerColor, board_state: window.CW_SESSION.board }).eq('id', window.CW_SESSION.matchId);
       if (error) throw error;
    }
  } catch (e) {}

  _$container.innerHTML = `
    <div class="result-screen" style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; width: 100%; background:var(--bg-dark); position: absolute; top: 0; left: 0; z-index: 999;">
      <h1 class="result-title ${win ? 'result-win' : 'result-lose'}">${win ? '¡VICTORIA!' : 'DERROTA'}</h1>
      <p style="color:var(--text-dim);font-family:var(--font-mono);margin-bottom:2rem; text-align:center;">${win ? '+50 CP acreditados' : 'Perdiste la batalla'}</p>
      <button class="btn btn-primary" id="btn-exit" style="width:200px;">VOLVER AL INICIO</button>
    </div>
  `;
  
  _$container.querySelector('#btn-exit').addEventListener('click', async () => {
    const $btn = _$container.querySelector('#btn-exit'); 
    try {
      $btn.textContent = "SALIENDO..."; $btn.style.opacity = "0.7"; $btn.style.pointerEvents = "none";
      if (window.CW_SESSION && window.CW_SESSION.matchId) {
          const sb = getSupabase(); await sb.from('matches').update({ status: 'finished', winner: winnerColor }).eq('id', window.CW_SESSION.matchId);
      }
      window.CW_SESSION = null; 
      await reloadProfile(); setView('dashboard');
    } catch (error) { setTimeout(() => { setView('dashboard'); }, 2000); }
  });
}
