import { registerView, showToast, escHtml } from '../core/app.js';
import { setView } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

const BOARD_SIZE = 5; let _active = false; let _currentTurn = 'pink'; let _isAnimating = false; let _turnCount = 0; let _missedTurns = 0; let _$container = null; let _masterClockTimer = null; let _pollTimer = null; let _dbStartTime = null; let _dbLastMoveTime = null; let _lastDBUpdateTime = null; let _botIsMoving = false;
// 🔒 CIRUGÍA: Variables del candado y strikes del rival
let _lockPollingUntil = 0; let _opponentMissedTurns = 0;

// 🔊 CONFIGURACIÓN DE SONIDOS (Usando Howler)
const sfx = {
  pop:   new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2688/2688-preview.mp3'], volume: 0.7 }), // Pop al presionar fichas
  boom:  new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2579/2579-preview.mp3'], volume: 0.8 }), // La explosión que ya tenías
  win:   new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/544/544-preview.mp3'], volume: 0.9 }),  // Aplausos de victoria
  lose:  new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/3012/3012-preview.mp3'], volume: 0.8 }) // Trompeta triste de derrota
};

registerView('game', initGameView);

export async function initGameView($container) {
  _$container = $container;
  if (!window.CW_SESSION || !window.CW_SESSION.board) { window.CW_SESSION = null; setView('dashboard'); return; }
  _active = true; _isAnimating = false; _turnCount = 0; _missedTurns = 0; _botIsMoving = false; _lastDBUpdateTime = Date.now();
  _lockPollingUntil = 0; _opponentMissedTurns = 0; // Reiniciamos candados y strikes
  const sb = getSupabase();

  if (window.CW_SESSION.matchId) {
    try {
      const { data: matchData } = await sb.from('matches').select('*').eq('id', window.CW_SESSION.matchId).single();
      if (matchData) {
        if (matchData.status === 'finished' || matchData.status === 'cancelled') { window.CW_SESSION = null; setView('dashboard'); return; }
        window.CW_SESSION.board = matchData.board_state || window.CW_SESSION.board; _currentTurn = matchData.current_turn || 'pink'; _dbStartTime = matchData.match_start_time ? new Date(matchData.match_start_time).getTime() : Date.now(); _dbLastMoveTime = Date.now();
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
        
        // 🔒 CIRUGÍA: Candado anti-viajes en el tiempo (Prohibido leer si acabo de mover)
        if (Date.now() > _lockPollingUntil) {
            if (data.current_turn === window.CW_SESSION.myColor && _currentTurn !== window.CW_SESSION.myColor) {
               window.CW_SESSION.board = data.board_state; _currentTurn = data.current_turn; _dbLastMoveTime = new Date(data.last_move_time).getTime(); _missedTurns = 0; _opponentMissedTurns = 0; updateDOM();
            }
        }
      }
    } catch(e) {}
  }, 1500);
}

function renderHTML() {
  const myColor = window.CW_SESSION.myColor; const rivalName = window.CW_SESSION.rivalName || window.CW_SESSION.botName || 'RIVAL'; 
  
  // 🔥 CIRUGÍA VISUAL: Reemplazamos el 'blue' por Morado Suave (#a855f7)
  const youColorVar = myColor === 'pink' ? 'var(--pink)' : '#a855f7'; 
  const rivalColorVar = myColor === 'pink' ? '#a855f7' : 'var(--pink)';
  
  _$container.innerHTML = `
  <style>
    /* 🔥 FORZAR MORADO SUAVE EN LAS FICHAS AZULES (Aplica en ambos modos) */
    .cell-blue .mass-orb { background-color: #a855f7 !important; box-shadow: 0 0 8px #a855f7 !important; }
    
    /* 🌓 SOBREESCRITURAS DEL MODO CLARO ÉLITE (Solo se activa con la clase html.light) */
    html.light .game-arena > div:first-child { background: #ffffff !important; border: 1px solid #e0e0ea !important; box-shadow: 0 8px 25px rgba(0,0,0,0.05) !important; }
    html.light .game-arena span { color: #11111a !important; text-shadow: none !important; }
    html.light #global-timer { color: #ffaa00 !important; } /* Preservamos el naranja del reloj */
    html.light #score-you, html.light #score-rival { color: #11111a !important; }
    html.light .board-wrap, html.light #grid { background: #f4f4f7 !important; border: 1px solid #c0c0c8 !important; box-shadow: 0 4px 15px rgba(0,0,0,0.05) !important; }
    html.light .cell { background: #ffffff !important; border: 1px solid #e0e0ea !important; }
    html.light #btn-surrender { border-color: #11111a !important; color: #11111a !important; }
    
    /* Efecto de pulso suave para las fichas */
    .cell-mass { transition: transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
  </style>
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

  _$container.querySelector('#grid').addEventListener('click', (e) => { const cell = e.target.closest('.cell'); if (cell) handlePlayerClick(parseInt(cell.dataset.r), parseInt(cell.dataset.c)); });
  
  _$container.querySelector('#btn-surrender').addEventListener('click', () => {
     if (!confirm("¿Seguro que quieres abandonar?")) return;
     _finishGame(window.CW_SESSION.myColor === 'pink' ? 'blue' : 'pink', false, "ABANDONASTE LA ARENA");
  });
}

function updateDOM() {
  if (!_active) return; const game = window.CW_SESSION; const cells = _$container.querySelectorAll('.cell'); let pS = 0, bS = 0, idx = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const state = game.board[r][c]; const dom = cells[idx++]; if (!dom) continue; dom.className = 'cell';
      if (state.owner === 'pink') { dom.classList.add('cell-pink'); pS++; } else if (state.owner === 'blue') { dom.classList.add('cell-blue'); bS++; }
      let orbs = ''; for(let i=0; i<state.mass; i++) orbs += `<div class="mass-orb"></div>`; dom.querySelector('.cell-mass').innerHTML = orbs;
    }
  }
  const myColor = window.CW_SESSION.myColor; const sy = _$container.querySelector('#score-you'), sr = _$container.querySelector('#score-rival');
  if (myColor === 'pink') { if(sy) sy.textContent = pS; if(sr) sr.textContent = bS; } else { if(sy) sy.textContent = bS; if(sr) sr.textContent = pS; }
}

function _resolveTimeOutWinner() {
    let pCells = 0, bCells = 0, pMass = 0, bMass = 0;
    window.CW_SESSION.board.forEach(row => row.forEach(c => { if(c.owner === 'pink') { pCells++; pMass += c.mass; } else if(c.owner === 'blue') { bCells++; bMass += c.mass; } }));
    if (pCells > bCells) return 'pink'; if (bCells > pCells) return 'blue';
    if (pMass > bMass) return 'pink'; if (bMass > pMass) return 'blue';
    return _currentTurn === 'pink' ? 'blue' : 'pink'; 
}

function _startMasterClock() {
    clearInterval(_masterClockTimer);
    _masterClockTimer = setInterval(() => {
        if (!_active) return clearInterval(_masterClockTimer);
        const now = Date.now();

        // 🗑️ CIRUGÍA: Extirpada la regla vieja de los 40s (ahora se usan strikes AFK)

        let globalLeft = 180 - Math.floor((now - _dbStartTime) / 1000);
        if (globalLeft < 0) globalLeft = 0; 
        const gt = _$container.querySelector('#global-timer');
        if (gt) gt.textContent = `${Math.floor(globalLeft / 60).toString().padStart(2, '0')}:${(globalLeft % 60).toString().padStart(2, '0')}`;
        
        if (globalLeft <= 0) { _finishGame(_resolveTimeOutWinner(), false, "TIEMPO AGOTADO (VICTORIA POR PUNTOS)"); return; }

        let turnLeft = 10 - Math.floor((now - _dbLastMoveTime) / 1000);
        const turnEl = _$container.querySelector('#turn-indicator'); const isMyTurn = _currentTurn === window.CW_SESSION.myColor;
        
        if (isMyTurn) {
            if (turnEl) turnEl.innerHTML = `<span style="color:var(--pink);">TU TURNO: ${Math.max(0, turnLeft)}s</span>`;
            if (turnLeft <= 0 && !_isAnimating) {
                _missedTurns++; _dbLastMoveTime = now;
                if (_missedTurns >= 3) _finishGame(window.CW_SESSION.myColor==='pink'?'blue':'pink', false, "ELIMINADO POR INACTIVIDAD (3/3)");
                else { showToast(`¡TURNO SALTADO! Advertencia ${_missedTurns}/3`, 'warning'); _passTurn(); }
            }
        } else {
            if (turnEl) turnEl.innerHTML = `<span style="color:#aaa;">ESPERANDO RIVAL: ${Math.max(0, turnLeft)}s</span>`;
            
            // 🛡️ CIRUGÍA: ÁRBITRO AFK (El que tiene internet castiga al desconectado)
            if (!window.CW_SESSION.isBotMatch && turnLeft <= -2 && !_isAnimating) {
                _opponentMissedTurns++; _dbLastMoveTime = now;
                if (_opponentMissedTurns >= 3) {
                    _finishGame(window.CW_SESSION.myColor, false, "RIVAL ELIMINADO POR INACTIVIDAD (3/3)");
                } else {
                    showToast(`El rival perdió su turno. Strike ${_opponentMissedTurns}/3`, 'info');
                    _passTurn();
                }
            } else if (window.CW_SESSION.isBotMatch && turnLeft <= 8 && !_isAnimating && !_botIsMoving) { 
                _botIsMoving = true; setTimeout(() => { _botMove(); }, 800); 
            }
        }
    }, 1000);
}

function handlePlayerClick(row, col) {
  if (!_active || _isAnimating || _currentTurn !== window.CW_SESSION.myColor) return;
  const cell = window.CW_SESSION.board[row][col]; const myColor = window.CW_SESSION.myColor;
  let myPieces = 0; window.CW_SESSION.board.forEach(r => r.forEach(c => { if (c.owner === myColor) myPieces++; }));
  if (myPieces > 0 && cell.owner !== myColor) { showToast("Solo puedes presionar tus fichas", "warning"); return; }
  if (cell.owner && cell.owner !== myColor) return;

  // ⚡ FEEDBACK: Sonido Pop + Vibración + Animación GSAP
  sfx.pop.play();
  if (navigator.vibrate) navigator.vibrate(15);
  const domCell = _$container.querySelector(`[data-r="${row}"][data-c="${col}"]`);
  if (domCell && window.gsap) gsap.from(domCell, { scale: 0.8, duration: 0.12, ease: "back.out(2)" });

  _missedTurns = 0; _addMass(row, col, myColor); // Resetea tus strikes si tocas una ficha
}

async function _addMass(row, col, color) {
  if (_isAnimating) return; _isAnimating = true;
  try { await _processMass(row, col, color); if (_active && !_checkGameOver()) _passTurn(); } catch(e) {} finally { _isAnimating = false; _botIsMoving = false; }
}

async function _processMass(row, col, color) {
  const cell = window.CW_SESSION.board[row][col]; cell.owner = color; cell.mass++;
  
  // ⚡ ANIMACIÓN GSAP: Salto al crecer la masa
  const domCell = _$container.querySelector(`[data-r="${row}"][data-c="${col}"]`);
  if (domCell && window.gsap) gsap.to(domCell.querySelector('.cell-mass'), { scale: 1.25, duration: 0.08, yoyo: true, repeat: 1 });

  if (cell.mass >= 4) {
    // 💥 EXPLOSIÓN Y SACUDIDA
    sfx.boom.play();
    if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
    if (window.gsap) gsap.to(".board-wrap", { x: 5, y: 5, duration: 0.05, repeat: 5, yoyo: true });
    
    await _explode(row, col, color); 
  } else {
    // Sonido pop en las reacciones en cadena
    sfx.pop.play();
    updateDOM();
  }
}

async function _explode(row, col, color) {
  window.CW_SESSION.board[row][col].mass = 0; window.CW_SESSION.board[row][col].owner = null; updateDOM();
  const n = [];
  if (row > 0) n.push({row: row - 1, col}); if (row < 4) n.push({row: row + 1, col});
  if (col > 0) n.push({row, col: col - 1}); if (col < 4) n.push({row, col: col + 1});
  await new Promise(r => setTimeout(r, 200));
  for (const pos of n) await _processMass(pos.row, pos.col, color);
}

function _passTurn() {
  _currentTurn = _currentTurn === 'pink' ? 'blue' : 'pink'; _dbLastMoveTime = Date.now(); _turnCount++; updateDOM();
  
  // 🔒 CIRUGÍA: CERRAMOS EL CANDADO (No escuchar a Supabase por 2.5s al pasar turno)
  _lockPollingUntil = Date.now() + 2500;
  
  if (window.CW_SESSION.matchId) { getSupabase().from('matches').update({ board_state: window.CW_SESSION.board, current_turn: _currentTurn, last_move_time: new Date(_dbLastMoveTime).toISOString() }).eq('id', window.CW_SESSION.matchId).then(); }
}

function _botMove() {
  const botColor = window.CW_SESSION.myColor === 'pink' ? 'blue' : 'pink';
  const playerColor = window.CW_SESSION.myColor;
  const board = window.CW_SESSION.board;
  
  let botPieces = 0;
  board.forEach(r => r.forEach(c => { if(c.owner === botColor) botPieces++; }));

  let validMoves = [];
  for(let r=0; r<5; r++) {
      for(let c=0; c<5; c++) {
          if (botPieces > 0) {
              if (board[r][c].owner === botColor) validMoves.push({r,c});
          } else {
              if (!board[r][c].owner) validMoves.push({r,c});
          }
      }
  }

  if (validMoves.length === 0) { _botIsMoving = false; return; }

  let bestMove = validMoves[0];
  let maxScore = -Infinity;

  for (let move of validMoves) {
      let simBoard = JSON.parse(JSON.stringify(board));
      _simulateAddMass(simBoard, move.r, move.c, botColor);
      let score = _evaluateSimulatedBoard(simBoard, botColor, playerColor);
      score += Math.random() * 0.5; 
      
      if (score > maxScore) {
          maxScore = score;
          bestMove = move;
      }
  }
  
  _addMass(bestMove.r, bestMove.c, botColor);
}

function _simulateAddMass(board, r, c, color) {
    board[r][c].owner = color;
    board[r][c].mass++;
    if (board[r][c].mass >= 4) {
        _simulateExplode(board, r, c, color);
    }
}

function _simulateExplode(board, r, c, color) {
    board[r][c].mass = 0;
    board[r][c].owner = null;
    const n = [];
    if (r > 0) n.push({r: r - 1, c});
    if (r < 4) n.push({r: r + 1, c});
    if (c > 0) n.push({r, c: c - 1});
    if (c < 4) n.push({r, c: c + 1});
    for (const pos of n) {
        _simulateAddMass(board, pos.r, pos.c, color);
    }
}

function _evaluateSimulatedBoard(board, botColor, playerColor) {
    let score = 0;
    for(let r=0; r<5; r++) {
        for(let c=0; c<5; c++) {
            const cell = board[r][c];
            if (cell.owner === botColor) {
                score += 10 + (cell.mass * 5);
                if (cell.mass === 3) score += 30; 
            } else if (cell.owner === playerColor) {
                score -= 10 + (cell.mass * 5);
                if (cell.mass === 3) score -= 50; 
            }
        }
    }
    return score;
}

function _checkGameOver() {
  let p = 0, b = 0;
  window.CW_SESSION.board.forEach(row => row.forEach(c => { if(c.owner==='pink') p++; else if(c.owner==='blue') b++; }));
  if (_turnCount >= 2) { if (p === 0) { _finishGame('blue'); return true; } if (b === 0) { _finishGame('pink'); return true; } }
  return false;
}

function _finishGame(winnerColor, fromDB = false, reason = null) {
  if (!_active) return; 
  _active = false;
  
  clearInterval(_masterClockTimer); clearInterval(_pollTimer); 
  
  const win = winnerColor === window.CW_SESSION.myColor;
  
  // ⚡ FEEDBACK FINAL: Victoria o Derrota
  if (win) { 
    sfx.win.play(); 
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 400]); 
  } else {
    sfx.lose.play();
    if (navigator.vibrate) navigator.vibrate([300, 200, 300]); 
  }

  const myRealColor = window.CW_SESSION.myColor === 'pink' ? 'var(--pink)' : '#a855f7';
  const titleColor = win ? myRealColor : '#ff4444';
  const titleText = win ? 'VICTORIA' : 'DERROTA';
  
  const overlay = document.createElement('div');
  overlay.id = "cw-final-overlay";
  overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(10, 10, 15, 0.95); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; backdrop-filter: blur(12px); opacity: 0;`;
  
  overlay.innerHTML = `
    <h1 id="final-title" style="color:${titleColor}; font-size:3.5rem; font-family:var(--font-display); text-transform:uppercase; margin-bottom:10px; text-shadow: 0 0 20px ${titleColor}; letter-spacing: 2px;">${titleText}</h1>
    <p style="color:#aaa; font-family:var(--font-mono); font-size:1rem; margin-bottom:40px; text-transform:uppercase; letter-spacing:1px;">${reason || (win ? '+50 CP AÑADIDOS' : 'Sigue practicando en la arena')}</p>
    <button class="btn btn-primary" id="btn-return-dash-final" style="width:250px; font-size:1.2rem; padding:15px;">VOLVER AL MENÚ</button>
  `;
  document.body.appendChild(overlay);

  // ⚡ ANIMACIÓN GSAP
  if (window.gsap) {
    gsap.to(overlay, { opacity: 1, duration: 0.5 });
    gsap.from("#final-title", { scale: 0.5, duration: 0.6, ease: "elastic.out(1, 0.3)" });
  } else {
    overlay.style.opacity = 1;
  }

  document.getElementById('btn-return-dash-final').addEventListener('click', () => {
     const btn = document.getElementById('btn-return-dash-final');
     btn.textContent = "SALIENDO..."; btn.disabled = true;
     
     window.sessionStorage.setItem('cw_skip_recon', '1');
     
     if (window.CW_SESSION && window.CW_SESSION.matchId) { getSupabase().from('matches').update({ status:'finished' }).eq('id', window.CW_SESSION.matchId).then(); }
     
     window.CW_SESSION = null; 
     document.body.removeChild(overlay); 
     setView('dashboard'); 
  });

  if (!fromDB && window.CW_SESSION.matchId) { getSupabase().from('matches').update({ status:'finished', winner:winnerColor }).eq('id', window.CW_SESSION.matchId).then(); }
}
