/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/board.js
 * MONOLITO FINAL: MOTOR DE AJEDREZ (MINIMAX) + ANTI-BUCLES
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
  
  // Regla de Oro
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
      }, 1000 + Math.random() * 500); 
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

  if (
