/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/board.js
 * Arena visual del juego - BLINDADO
 * ═══════════════════════════════════════════════════════
 */
import { registerView, showToast } from '../core/app.js';
import { getGame, setView } from '../core/state.js'; // Quitamos dependencias peligrosas
import { playerClick, startEngine, stopEngine, getCellCounts } from './engine.js';

const BOARD_SIZE = 5;

registerView('game', initGameView);

export async function initGameView($container) {
  try {
    const game = getGame();
    if (!game) { setView('dashboard'); return; }

    // FAILSAFE: Si el tablero viene corrupto o vacío, lo creamos de emergencia
    if (!game.board || game.board.length === 0) {
        game.board = Array(BOARD_SIZE).fill(null).map(() => 
            Array(BOARD_SIZE).fill(null).map(() => ({ owner: null, mass: 0, blocked: false }))
        );
    }

    renderBoard($container, game);
    startEngine(
      () => updateBoardDOM($container),
      (winner) => showResult($container, winner)
    );
    
  } catch (error) {
    console.error("Error fatal en la arena:", error);
    showToast('Error cargando la arena. El saldo ha sido devuelto.', 'error');
    setView('dashboard');
  }
}

function renderBoard($c, game) {
  $c.innerHTML = `
  <div class="game-arena">
    <div class="game-hud">
      <div style="color:var(--pink);font-weight:700;font-size:1.2rem;">TÚ: <span id="score-pink">0</span></div>
      <div class="hud-timer">00:10</div>
      <div style="color:var(--blue);font-weight:700;font-size:1.2rem;">BOT: <span id="score-blue">0</span></div>
    </div>
    <div class="board-wrap">
      <div class="board-grid" id="grid">
        ${game.board.map((row, r) => row.map((cell, c) => `
          <div class="cell" data-r="${r}" data-c="${c}">
            <div class="cell-mass"></div>
          </div>
        `).join('')).join('')}
      </div>
    </div>
    <button id="btn-surrender" class="btn btn-ghost" style="margin-top:20px;font-size:0.7rem;">🏳️ Rendirse</button>
  </div>`;

  $c.querySelector('#grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    playerClick(parseInt(cell.dataset.r), parseInt(cell.dataset.c));
  });

  $c.querySelector('#btn-surrender').addEventListener('click', () => {
     stopEngine();
     setView('dashboard');
     showToast('Te has rendido.', 'warning');
  });

  updateBoardDOM($c);
}

function updateBoardDOM($c) {
  const game = getGame();
  if (!game || !game.board) return;

  const cells = $c.querySelectorAll('.cell');
  if (!cells.length) return;

  let idx = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const stateCell = game.board[r][c];
      const domCell = cells[idx++];

      domCell.className = 'cell';
      if (stateCell.blocked) domCell.classList.add('blocked');
      else if (stateCell.owner === 'pink') domCell.classList.add('cell-pink');
      else if (stateCell.owner === 'blue') domCell.classList.add('cell-blue');

      let orbs = '';
      for(let i=0; i<stateCell.mass; i++) orbs += `<div class="mass-orb"></div>`;
      domCell.querySelector('.cell-mass').innerHTML = orbs;
    }
  }

  const counts = getCellCounts();
  const $sp = $c.querySelector('#score-pink');
  const $sb = $c.querySelector('#score-blue');
  if ($sp) $sp.textContent = counts.pink;
  if ($sb) $sb.textContent = counts.blue;
}

function showResult($c, winner) {
  const win = winner === 'pink';
  const div = document.createElement('div');
  div.className = 'result-screen';
  div.innerHTML = `
    <h1 class="result-title ${win ? 'result-win' : 'result-lose'}">${win ? '¡VICTORIA!' : 'DERROTA'}</h1>
    <p style="color:var(--text-dim);font-family:var(--font-mono);margin-bottom:2rem;">${win ? '+ Premio acreditado a tu cuenta' : 'El bot te ha masacrado'}</p>
    <button class="btn btn-primary" id="btn-exit">VOLVER AL INICIO</button>
  `;
  $c.appendChild(div);
  div.querySelector('#btn-exit').addEventListener('click', () => setView('dashboard'));
}
