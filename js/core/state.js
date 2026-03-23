/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/core/state.js
 * Global State Singleton
 * ═══════════════════════════════════════════════════════
 */

import { getSupabase } from './supabase.js';

// ── Economy constants ──────────────────────────────────
export const ECONOMY = {
  ENTRY_FEE_BS:    200,
  WINNER_PRIZE_BS: 320,
};

// ── Game config ────────────────────────────────────────
export const GAME_CFG = {
  BOARD_SIZE:       5,
  PHASE1_SECS:     10,
  PHASE2_SECS:    180,
  EXPLODE_AT:       4,
  BOT_INTERVAL_MS: 1100,
  BOT_SKILL:       65,   // % of optimal moves
};

// ── Internal state ─────────────────────────────────────
const _state = {
  currentView:  'loading',
  session:      null,   // Supabase session
  profile:      null,   // users table row
  bcvRate:      36.5,   // from sys_config
  currentGame:  null,
  matchmaking: { phase: null, countdown: 0 },
};

// ── Event bus ──────────────────────────────────────────
const _listeners = new Map();

export function subscribe(key, cb) {
  if (!_listeners.has(key)) _listeners.set(key, new Set());
  _listeners.get(key).add(cb);
  return () => _listeners.get(key).delete(cb);
}

function _dispatch(key, val, old) {
  _listeners.get(key)?.forEach(cb => { try { cb(val, old); } catch(e){ console.error('[State]', e); } });
}

function _set(key, val) {
  const old = _state[key];
  _state[key] = val;
  _dispatch(key, val, old);
}

// ── Getters ────────────────────────────────────────────
export const getView         = ()  => _state.currentView;
export const getSession      = ()  => _state.session;
export const getProfile      = ()  => _state.profile;
export const getBcvRate      = ()  => _state.bcvRate;
export const getGame         = ()  => _state.currentGame;
export const getMatchmaking  = ()  => _state.matchmaking;

// ── Navigation ─────────────────────────────────────────
export function setView(view) {
  const allowed = ['loading','auth','dashboard','matchmaking','game','admin'];
  if (!allowed.includes(view)) return;
  _set('currentView', view);
}

// ── Session ────────────────────────────────────────────
export function setSession(session) { _set('session', session); }
export function setProfile(profile) { _set('profile', profile); }

// ── BCV Rate ───────────────────────────────────────────
export function setBcvRate(rate)    { _set('bcvRate', rate); }

// ── Wallet helpers ─────────────────────────────────────
export function getWalletBs()  { return _state.profile?.wallet_bs  ?? 0; }
export function getWalletUSD() { return _state.bcvRate > 0 ? getWalletBs() / _state.bcvRate : 0; }

// ── Profile reload from DB ─────────────────────────────
export async function reloadProfile() {
  const sb      = getSupabase();
  const session = _state.session;
  if (!session?.user?.id) return;

  const { data, error } = await sb
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!error && data) _set('profile', data);
  return data;
}

// ── BCV rate reload from DB ────────────────────────────
export async function reloadBcvRate() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('sys_config')
    .select('bcv_rate')
    .eq('id', 1)
    .single();

  if (!error && data?.bcv_rate) _set('bcvRate', Number(data.bcv_rate));
  return _state.bcvRate;
}

// ── Wallet mutation (optimistic + DB sync) ─────────────
export async function updateWalletBs(newBs) {
  const sb = getSupabase();
  const id = _state.profile?.id;
  if (!id) return { ok: false, error: 'No profile' };

  const { error } = await sb
    .from('users')
    .update({ wallet_bs: newBs })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  _set('profile', { ..._state.profile, wallet_bs: newBs });
  return { ok: true };
}

// ── Game state ─────────────────────────────────────────
export function createEmptyBoard() {
  return Array.from({ length: GAME_CFG.BOARD_SIZE }, () =>
    Array.from({ length: GAME_CFG.BOARD_SIZE }, () =>
      ({ owner: null, mass: 0, blocked: false })
    )
  );
}

export function initGameState() {
  _set('currentGame', {
    phase:       1,
    timeLeft:    GAME_CFG.PHASE1_SECS,
    playerColor: 'pink',
    botColor:    'blue',
    board:       createEmptyBoard(),
    isOver:      false,
    winner:      null,
  });
}

export function updateGameBoard(board) {
  if (!_state.currentGame) return;
  _set('currentGame', { ..._state.currentGame, board });
}

export function setGamePhase2() {
  if (!_state.currentGame) return;
  _set('currentGame', { ..._state.currentGame, phase: 2, timeLeft: GAME_CFG.PHASE2_SECS });
}

export function tickGame() {
  if (!_state.currentGame) return;
  const t = Math.max(0, _state.currentGame.timeLeft - 1);
  _set('currentGame', { ..._state.currentGame, timeLeft: t });
}

export function setGameOver(winner) {
  if (!_state.currentGame) return;
  _set('currentGame', { ..._state.currentGame, isOver: true, winner });
}

export function clearGame() { _set('currentGame', null); }

// ── Matchmaking ────────────────────────────────────────
export function setMatchmakingPhase(phase, countdown = 0) {
  _set('matchmaking', { phase, countdown });
}

// ── Win / Loss record (🛡️ CIRUGÍA: AUTORIDAD DEL SERVIDOR PARA RECOMPENSAS) ──
export async function recordWin() {
  const sb = getSupabase();
  const id = _state.profile?.id;
  if (!id) return;

  await sb.rpc('cobrar_victoria', { p_user_id: id, p_premio: ECONOMY.WINNER_PRIZE_BS });
  await reloadProfile();
}

export async function recordLoss() {
  const sb = getSupabase();
  const id = _state.profile?.id;
  if (!id) return;

  await sb.rpc('registrar_derrota', { p_user_id: id });
  await reloadProfile();
}

// ── Initialization ─────────────────────────────────────
export function initState() {
  console.log('[State] Initialized');
}
