/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/game/board.js
 * MONOLITO MAESTRO: TIEMPO ABSOLUTO + PRESENCE (40s) + MINIMAX
 * ═══════════════════════════════════════════════════════
 */

import { registerView, showToast, escHtml } from '../core/app.js';
import { setView, getProfile, reloadProfile } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

const BOARD_SIZE = 5;
let _active = false;
let _currentTurn = 'pink';
let _isAnimating = false;
let _turnCount = 0;
let _missedTurns = 0; 
let _$container = null; 

// Canales y Relojes
let _matchChannel = null; 
let _presenceChannel = null;
let _masterClockTimer = null; // El único setInterval que controla todo el tiempo
let _isPaused = false;
let _disconnectTimer = 40; // Reloj de emergencia

// Tiempos Absolutos desde DB
let _dbStartTime = null;
let _dbLastMoveTime = null;
let _dbPausedAt = null;
let _dbTotalPausedSecs = 0;

registerView('game', initGameView);

export async function initGameView($container) {
  _$container = $container;
  if (!window.CW_SESSION || !window.CW_SESSION.board) { setView('dashboard'); return; }

  _active = true; _isAnimating = false; _turnCount = 0; _missedTurns = 0; _isPaused = false;
  const sb = getSupabase();

  if (window.CW_SESSION.matchId) {
    try {
      const { data: matchData } = await sb.from('matches').select('*').eq('id', window.CW_SESSION.matchId).single();
      if (matchData) {
        if (matchData.status === 'finished' || matchData.status === 'cancelled') { setView('dashboard'); return; }
        window.CW_SESSION.board = matchData.board_state || window.CW_SESSION.board;
        _currentTurn = matchData.current_turn || 'pink';
        
        // Cargar tiempos de la base de datos
        _dbStartTime = matchData.match_start_time ? new Date(matchData.match_start_time).getTime() : Date.now();
        _dbLastMoveTime = matchData.last_move_time ? new Date(matchData.last_move_time).getTime() : Date.now();
        _dbPausedAt = matchData.paused_at ? new Date(matchData.paused_at).getTime() : null;
        _dbTotalPausedSecs = matchData.total_paused_seconds || 0;

        // Si es el primerísimo turno, sellamos la hora de inicio en Supabase
        if (!matchData.match_start_time) {
            await sb.from('matches').update({ 
                match_start_time: new Date(_dbStartTime).toISOString(),
                last_move_time: new Date(_dbLastMoveTime).toISOString()
            }).eq('id', window.CW_SESSION.matchId);
        }

        let pieces = 0;
        for(let r=0; r<BOARD_SIZE; r++) { for(let c=0; c<BOARD_SIZE; c++) { if (matchData.board_state[r][c].owner) pieces++; } }
        _turnCount = pieces;
      }
    } catch(e) { console.error("Error cargando partida", e); }

    // DETECTOR DE LATIDOS Y CAMBIOS (Si es contra otro humano)
    if (!window.CW_SESSION.isBotMatch) {
      
      // 1. Escuchar jugadas del rival
      _matchChannel = sb.channel(`game_${window.CW_SESSION.matchId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${window.CW_SESSION.matchId}` }, (payload) => {
          const newData = payload.new;
          if (newData.status === 'finished') { if (newData.winner) _finishGame(newData.winner, true); return; }
          
          _dbTotalPausedSecs = newData.total_paused_seconds || 0;
          _dbPausedAt = newData.paused_at ? new Date(newData.paused_at).getTime() : null;

          if (newData.current_turn === window.CW_SESSION.myColor && _currentTurn !== window.CW_SESSION.myColor) {
             window.CW_SESSION.board = newData.board_state; 
             _currentTurn = newData.current_turn;
             _dbLastMoveTime = new Date(newData.last_move_time).getTime();
             _missedTurns = 0; // Se reinicia el AFK al cambiar de turno
             updateDOM(); 
          }
        }).subscribe();

      // 2. Escuchar conexión/desconexión (Presence)
      _presenceChannel = sb.channel(`presence_${window.CW_SESSION.matchId}`);
      _presenceChannel.on('presence', { event: 'sync' }, () => {
          const state = _presenceChannel.presenceState();
          const onlineCount = Object.keys(state).length;
          
          if (onlineCount < 2 && !_dbPausedAt) {
              // El rival se cayó. Congelamos la partida.
              _triggerDisconnect(true);
          } else if (onlineCount >= 2 && _dbPausedAt) {
              // El rival volvió. Descongelamos.
              _triggerDisconnect(false);
          }
      });
      _presenceChannel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await _presenceChannel.track({ user: window.CW_SESSION.myColor, online_at: new Date().toISOString() });
      });
    }
  }

  renderHTML(); updateDOM(); 
  _startMasterClock(); // Arranca el motor del tiempo absoluto
}

function renderHTML() {
  const myColor = window.CW_SESSION.myColor;
  const rivalName = window.CW_SESSION.rivalName || window.CW_SESSION.botName || 'RIVAL';
  const myName = getProfile()?.username || 'TÚ';

  const youColorVar = myColor === 'pink' ? 'var(--pink)' : 'var(--blue)';
  const rivalColorVar = myColor === 'pink' ? 'var(--blue)' : 'var(--pink)';

  _$container.innerHTML = `
  <div class="game-arena" style="display:flex; flex-direction:column; align-items:center; width:100%; position:relative;">
    
    <div id="disconnect-overlay" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:100; flex-direction:column; justify-content:center; align-items:center; border-radius:15px; backdrop-filter:blur(5px);">
        <span style="font-size:3rem; margin-bottom:10px;">📡</span>
        <h2 style="color:#ff4444; font-family:var(--font-display); margin:0;">RIVAL DESCONECTADO</h2>
        <p style="color:white; font-family:var(--font-mono); font-size:0.9rem;">El tiempo está congelado.</p>
        <div style="font-size:3rem; font-weight:900; color:#ffaa00; margin-top:20px;" id="disconnect-timer">40</div>
        <p style="color:var(--text-dim); font-size:0.75rem; margin-top:10px;">Esperando reconexión...</p>
    </div>

    <div style="background: rgba(10, 10, 15, 0.9); border: 1px solid var(--border-ghost); border-radius: 14px; padding: 12px; margin-bottom: 20px; width: 95%; max-width: 380px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; height: 40px;">
            <div style="width: 30%;"><span style="color:${youColorVar}; font-size: 0.6rem; font-weight: 800;">${escHtml(myName)}</span><br><span style="font-size: 1.2rem; font-weight: 900;" id="score-you">0</span></div>
            <div style="width: 40%; text-align: center;"><span id="global-timer" style="color: #ffaa00; font-family: var(--font-display); font-size: 1.8rem; letter-spacing: 1px;">03:00</span></div>
            <div style="width: 30%; text-align: right;"><span style="color:${rivalColorVar}; font-size: 0.6rem; font-weight: 800;">${escHtml(rivalName)}</span><br><span style="font-size: 1.2rem; font-weight: 900;" id="score-rival">0</span></div>
        </div>
        <div style="height: 25px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px; text-align: center;">
            <span id="turn-indicator" style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: bold; color: white;">PREPARANDO...</span>
        </div>
    </div>

    <div class="board-wrap"><div class="board-grid" id="grid" style="display:grid; grid-template-columns:repeat(5,1fr); gap:5px;">
        ${window.CW_SESSION.board.map((row, r) => row.map((_, c) => `<div class="cell" data-r="${r}" data-c="${c}"><div class="cell-mass"></div></div>`).join('')).join('')}
    </div></div>
    
    <button id="btn-surrender" class="btn btn-ghost" style="margin-top:20px;">🏳️ Abandonar</button>
  </div>`;

  _$container.querySelector('#grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.cell'); if (cell) handlePlayerClick(parseInt(cell.dataset.r), parseInt(cell.dataset.c));
  });
  _$container.querySelector('#btn-surrender').addEventListener('click', () => _finishGame(window.CW_SESSION.myColor === 'pink' ? 'blue' : 'pink', false, "Abandonaste la partida"));
}

function updateDOM() {
  if (!_active) return;
  const game = window.CW_SESSION;
  const cells = _$container.querySelectorAll('.cell');
  if(!cells.length) return;
  let pScore = 0, bScore = 0, idx = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const state = game.board[r][c]; const dom = cells[idx++];
      dom.className = 'cell';
      if (state.owner === 'pink') { dom.classList.add('cell-pink'); pScore++; }
      else if (state.owner === 'blue') { dom.classList.add('cell-blue'); bScore++; }
      let orbs = ''; for(let i=0; i<state.mass; i++) orbs += `<div class="mass-orb"></div>`;
      dom.querySelector('.cell-mass').innerHTML = orbs;
    }
  }
  const myColor = window.CW_SESSION.myColor;
  const sy = _$container.querySelector('#score-you'), sr = _$container.querySelector('#score-rival');
  if (myColor === 'pink') { if(sy) sy.textContent = pScore; if(sr) sr.textContent = bScore; }
  else { if(sy) sy.textContent = bScore; if(sr) sr.textContent = pScore; }
}

// 📡 SISTEMA DE DESCONEXIÓN Y CONGELAMIENTO
async function _triggerDisconnect(isDisconnected) {
    if (!_active || window.CW_SESSION.isBotMatch) return;
    const sb = getSupabase();
    
    if (isDisconnected) {
        _isPaused = true;
        _dbPausedAt = Date.now();
        _$container.querySelector('#disconnect-overlay').style.display = 'flex';
        await sb.from('matches').update({ paused_at: new Date(_dbPausedAt).toISOString() }).eq('id', window.CW_SESSION.matchId);
    } else {
        _isPaused = false;
        _$container.querySelector('#disconnect-overlay').style.display = 'none';
        if (_dbPausedAt) {
            // Calcular cuánto tiempo estuvo congelado y guardarlo en la bóveda
            const pausedDuration = Math.floor((Date.now() - _dbPausedAt) / 1000);
            _dbTotalPausedSecs += pausedDuration;
            _dbPausedAt = null;
            // Se actualiza la base de datos para que el tiempo sea justo
            await sb.from('matches').update({ 
                paused_at: null, 
                total_paused_seconds: _dbTotalPausedSecs 
            }).eq('id', window.CW_SESSION.matchId);
        }
    }
}

// ⏱️ EL RELOJ MAESTRO (Controla TODO basado en la hora real)
function _startMasterClock() {
    clearInterval(_masterClockTimer);
    _masterClockTimer = setInterval(() => {
        if (!_active) return clearInterval(_masterClockTimer);

        const now = Date.now();

        // 1. Lógica del Reloj de Desconexión (Los 40 segundos)
        if (_isPaused && _dbPausedAt) {
            let offlineSecs = Math.floor((now - _dbPausedAt) / 1000);
            let left = 40 - offlineSecs;
            const dTimer = _$container.querySelector('#disconnect-timer');
            if (dTimer) dTimer.textContent = left > 0 ? left : 0;
            
            if (left <= 0) {
                // Pasaron los 40s. El que está vivo gana.
                _finishGame(window.CW_SESSION.myColor, false, "El rival se desconectó y no volvió");
            }
            return; // Si está en pausa, no calcules los demás relojes.
        }

        // 2. Lógica del Reloj Global (3 Minutos)
        let elapsedGlobalSecs = Math.floor((now - _dbStartTime) / 1000) - _dbTotalPausedSecs;
        let globalLeft = 180 - elapsedGlobalSecs;
        
        const gt = _$container.querySelector('#global-timer');
        if (gt) {
            if (globalLeft < 0) globalLeft = 0;
            let m = Math.floor(globalLeft / 60).toString().padStart(2, '0');
            let s = (globalLeft % 60).toString().padStart(2, '0');
            gt.textContent = `${m}:${s}`;
            if (globalLeft <= 30) gt.style.color = "#ff4444";
        }
        
        if (globalLeft <= 0) {
            _handleTimeOut(); return;
        }

        // 3. Lógica del Reloj de Turno (10 Segundos)
        let elapsedTurnSecs = Math.floor((now - _dbLastMoveTime) / 1000);
        let turnLeft = 10 - elapsedTurnSecs;
        
        const turnEl = _$container.querySelector('#turn-indicator');
        const isMyTurn = _currentTurn === window.CW_SESSION.myColor;

        if (turnEl) {
            let displayTurn = turnLeft > 0 ? turnLeft : 0;
            if (isMyTurn) {
                turnEl.innerHTML = `TU TURNO: <span style="color:var(--text-bright); font-size:1.1em;">${displayTurn.toString().padStart(2, '0')}</span>`; 
                turnEl.style.color = displayTurn <= 3 ? "#ff4444" : "var(--text-bright)";
            } else {
                turnEl.innerHTML = `ESPERANDO RIVAL: <span style="color:var(--text-dim);">${displayTurn.toString().padStart(2, '0')}</span>`; 
                turnEl.style.color = "var(--text-dim)";
            }
        }

        // ¿Qué pasa si el turno llega a cero?
        if (turnLeft <= 0) {
            if (isMyTurn) {
                // Tú perdiste el tiempo. Se reinicia tu reloj y te sumamos un AFK.
                _dbLastMoveTime = now; // Reiniciamos el reloj para el próximo turno
                _missedTurns++;
                
                if (_missedTurns >= 4) {
                    _finishGame(window.CW_SESSION.myColor === 'pink' ? 'blue' : 'pink', false, "Descalificación por Inactividad (AFK)");
                } else {
                    if (_missedTurns === 3) showToast('¡⚠️ ÚLTIMO AVISO! Juega o pierdes', 'warning');
                    else showToast(`Turno saltado (${_missedTurns}/4)`, 'warning');
                    _passTurn();
                }
            } else if (window.CW_SESSION.isBotMatch) {
                // Es el bot, y se le acabó el tiempo (seguro de vida)
                _botMove(); 
            }
        }

        // 4. Inteligencia del Bot (Juega a los 2 segundos de su turno para que parezca humano)
        if (window.CW_SESSION.isBotMatch && !isMyTurn && turnLeft === 8 && !_isAnimating) {
            _botMove();
        }

    }, 1000); // El reloj se recalcula cada segundo basándose en la HORA REAL.
}

// ⚖️ EL JUEZ DEL EMPATE (Calcula Celdas y Masa)
function _handleTimeOut() {
    if (!_active) return;
    _active = false;
    clearInterval(_masterClockTimer);
    
    let pCells = 0, bCells = 0, pMass = 0, bMass = 0;
    const board = window.CW_SESSION.board;
    
    for (let r = 0; r < BOARD_SIZE; r++) {
       for (let c = 0; c < BOARD_SIZE; c++) {
           if (board[r][c].owner === 'pink') { pCells++; pMass += board[r][c].mass; }
           else if (board[r][c].owner === 'blue') { bCells++; bMass += board[r][c].mass; }
       }
    }

    let winner = null; let reason = "";

    if (pCells > bCells) { winner = 'pink'; reason = `Gana por Dominio (${pCells} a ${bCells} casillas)`; } 
    else if (bCells > pCells) { winner = 'blue'; reason = `Gana por Dominio (${bCells} a ${pCells} casillas)`; } 
    else {
        if (pMass > bMass) { winner = 'pink'; reason = `¡DESEMPATE! Gana por Masa Crítica (${pMass} a ${bMass} pts)`; } 
        else if (bMass > pMass) { winner = 'blue'; reason = `¡DESEMPATE! Gana por Masa Crítica (${bMass} a ${pMass} pts)`; } 
        else {
            winner = Math.random() > 0.5 ? 'pink' : 'blue'; reason = `Empate Absoluto. Victoria por decisión.`;
        }
    }

    _$container.innerHTML += `
        <div class="result-screen" style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; width: 100%; background:var(--bg-dark); position: absolute; top: 0; left: 0; z-index: 999;">
          <h1 style="color:#ffaa00; font-family:var(--font-display); font-size: 2rem; text-shadow: 0 0 20px #ffaa00; text-align:center; margin-bottom: 10px;">¡CAMPANA FINAL!</h1>
          <p style="color:white; font-family:var(--font-mono); text-transform:uppercase;">Calculando territorios y masa...</p>
        </div>
    `;

    setTimeout(() => { _finishGame(winner, false, reason); }, 3000);
}

function handlePlayerClick(row, col) {
  const myColor = window.CW_SESSION.myColor;
  if (!_active || _isAnimating || _isPaused) return;
  if (_currentTurn !== myColor) { showToast('Espera tu turno', 'warning'); return; }

  const cell = window.CW_SESSION.board[row][col];
  if (cell.owner && cell.owner !== myColor) { showToast('Casilla enemiga', 'error'); return; }

  let myCellsCount = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) { if (window.CW_SESSION.board[r][c].owner === myColor) myCellsCount++; }
  }
  
  if (myCellsCount > 0 && cell.owner !== myColor) { showToast('Debes expandir tus propias fichas', 'warning'); return; }

  // ⏱️ Tocaste legalmente: El Contador Anti-AFK vuelve a cero
  _missedTurns = 0; 
  _addMass(row, col, myColor);
}

async function _passTurn() {
  if (!_active) return;
  _currentTurn = _currentTurn === 'pink' ? 'blue' : 'pink';
  _turnCount++;
  _dbLastMoveTime = Date.now(); // Sellamos la hora del último movimiento

  if (window.CW_SESSION.matchId) {
     const sb = getSupabase();
     // Le enviamos la hora exacta a Supabase para que el otro celular la lea
     sb.from('matches').update({ 
         board_state: window.CW_SESSION.board, 
         current_turn: _currentTurn,
         last_move_time: new Date(_dbLastMoveTime).toISOString()
     }).eq('id', window.CW_SESSION.matchId).catch(()=>{});
  }
  updateDOM();
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
// 🧠 MOTOR MINIMAX (Cerebro del Bot Cuántico)
// ═════════════════════════════════════════════════════════
function _cloneBoard(board) { return board.map(row => row.map(cell => ({ owner: cell.owner, mass: cell.mass }))); }
function _getValidMoves(board, color) {
  let moves = []; let hasCells = false;
  for (let r=0; r<BOARD_SIZE; r++) { for (let c=0; c<BOARD_SIZE; c++) { if (board[r][c].owner === color) hasCells = true; } }
  for (let r=0; r<BOARD_SIZE; r++) { for (let c=0; c<BOARD_SIZE; c++) {
      if (hasCells) { if (board[r][c].owner === color) moves.push({r, c}); } 
      else { if (!board[r][c].owner) moves.push({r, c}); }
  }}
  return moves;
}

function _simulateMove(board, r, c, color) {
  let temp = _cloneBoard(board); let queue = [{r, c, color}]; let iterations = 0;
  while(queue.length > 0 && iterations < 300) {
    iterations++; let current = queue.shift(); let cell = temp[current.r][current.c];
    cell.owner = current.color; cell.mass++;
    if (cell.mass >= 4) {
      cell.mass = 0; cell.owner = null;
      if (current.r > 0) queue.push({r: current.r - 1, c: current.c, color: current.color});
      if (current.r < 4) queue.push({r: current.r + 1, c: current.c, color: current.color});
      if (current.c > 0) queue.push({r: current.r, c: current.c - 1, color: current.color});
      if (current.c < 4) queue.push({r: current.r, c: current.c + 1, color: current.color});
    }
  }
  return temp;
}

function _evaluateBoard(board, botColor, enemyColor) {
  let botScore = 0; let enemyScore = 0;
  for (let r=0; r<BOARD_SIZE; r++) { for (let c=0; c<BOARD_SIZE; c++) {
      let cell = board[r][c];
      if (cell.owner === botColor) { botScore += (cell.mass * 10); if (cell.mass === 3) botScore += 50; } 
      else if (cell.owner === enemyColor) { enemyScore += (cell.mass * 10); if (cell.mass === 3) enemyScore += 50; }
  }}
  if (botScore > 0 && enemyScore === 0) return 999999; 
  if (enemyScore > 0 && botScore === 0) return -999999; 
  return botScore - enemyScore;
}

function _botMove() {
  try {
    const board = window.CW_SESSION.board;
    const enemyColor = window.CW_SESSION.myColor;
    const botColor = enemyColor === 'pink' ? 'blue' : 'pink'; 

    let validMoves = _getValidMoves(board, botColor);
    if (validMoves.length === 0) { _passTurn(); return; }
    if (validMoves.length === 25 && !board[2][2].owner) { _addMass(2, 2, botColor); return; }

    let bestMove = null; let bestScore = -Infinity;
    for (const move of validMoves) {
      let simBoard1 = _simulateMove(board, move.r, move.c, botColor);
      let eval1 = _evaluateBoard(simBoard1, botColor, enemyColor);
      
      if (eval1 > 900000 && _turnCount >= 2) { _addMass(move.r, move.c, botColor); return; }

      let enemyMoves = _getValidMoves(simBoard1, enemyColor);
      let worstCaseScore = Infinity;

      for (const eMove of enemyMoves) {
         let simBoard2 = _simulateMove(simBoard1, eMove.r, eMove.c, enemyColor);
         let eval2 = _evaluateBoard(simBoard2, botColor, enemyColor);
         if (eval2 < worstCaseScore) worstCaseScore = eval2; 
      }
      if (enemyMoves.length === 0) worstCaseScore = 999999;
      worstCaseScore += Math.random();

      if (worstCaseScore > bestScore) { bestScore = worstCaseScore; bestMove = move; }
    }
    if (bestMove) { _addMass(bestMove.r, bestMove.c, botColor); } else { _addMass(validMoves[0].r, validMoves[0].c, botColor); } 
  } catch (err) { console.error("Error en Bot:", err); _passTurn(); }
}

function _checkGameOver() {
  let p = 0, b = 0; const board = window.CW_SESSION.board;
  for (let r = 0; r < BOARD_SIZE; r++) { for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].owner === 'pink') p++; else if (board[r][c].owner === 'blue') b++;
  }}
  if (_turnCount >= 2) {
     if (p === 0 && b > 0) { _finishGame('blue'); return true; }
     if (b === 0 && p > 0) { _finishGame('pink'); return true; }
  }
  return false;
}

// ⚡ SALIDA BLINDADA
async function _finishGame(winnerColor, fromDB = false, customReason = null) {
  if (!_active) return; 
  _active = false;
  clearInterval(_masterClockTimer);
  if (_matchChannel) _matchChannel.unsubscribe();
  if (_presenceChannel) _presenceChannel.unsubscribe();
  
  const myColor = window.CW_SESSION.myColor;
  const win = winnerColor === myColor;
  const displayReason = customReason ? customReason : (win ? '+50 CP acreditados' : 'Perdiste la batalla');

  _$container.innerHTML += `
    <div class="result-screen" style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; width: 100%; background:var(--bg-dark); position: absolute; top: 0; left: 0; z-index: 9999;">
      <h1 class="result-title" style="color:var(--text-dim); font-size: 1.4rem;">PROCESANDO...</h1>
    </div>
  `;
  
  try {
    const sb = getSupabase();
    if (!fromDB && window.CW_SESSION.matchId) {
       await sb.from('matches').update({ status: 'finished', winner: winnerColor, board_state: window.CW_SESSION.board }).eq('id', window.CW_SESSION.matchId);
    }
  } catch (e) { console.error(e); }

  _$container.innerHTML = `
    <div class="result-screen" style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; width: 100%; background:var(--bg-dark); position: absolute; top: 0; left: 0; z-index: 9999;">
      <h1 class="result-title ${win ? 'result-win' : 'result-lose'}">${win ? '¡VICTORIA!' : 'DERROTA'}</h1>
      <p style="color:var(--text-dim);font-family:var(--font-mono);margin-bottom:2rem; text-align:center; max-width: 80%;">${displayReason}</p>
      <button class="btn btn-primary" id="btn-exit" style="width:200px;">VOLVER AL INICIO</button>
    </div>
  `;
  
  _$container.querySelector('#btn-exit').addEventListener('click', async () => {
    const $btn = _$container.querySelector('#btn-exit'); 
    $btn.textContent = "SALIENDO..."; $btn.style.opacity = "0.7"; $btn.style.pointerEvents = "none";
    window.CW_SESSION = null; await reloadProfile(); setView('dashboard');
  });
}
