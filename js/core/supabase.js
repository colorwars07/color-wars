/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/core/supabase.js
 * Supabase client singleton
 * ═══════════════════════════════════════════════════════
 */

// ── CONFIG — Llaves reales de Color Wars ──
const SUPABASE_URL      = 'https://jykubacvcysohszqmrpu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5a3ViYWN2Y3lzb2hzenFtcnB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2OTgwNDcsImV4cCI6MjA4OTI3NDA0N30.stp5GQpHhqfg5tJTe-zkk-xx3E8tRhQH2ywe6OGVubA';

let _client = null;

/**
 * Inicializa el cliente (se llama una vez al arrancar)
 */
export function initSupabase() {
  if (_client) return _client;

  if (!window.supabase || !window.supabase.createClient) {
    throw new Error('Supabase CDN no cargado. Revisa tu conexión a internet.');
  }

  _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession:    true,
      autoRefreshToken:  true,
      detectSessionInUrl: true,
    },
  });

  console.log('[Supabase] Cliente inicializado con éxito');
  return _client;
}

/**
 * Obtiene el cliente inicializado
 */
export function getSupabase() {
  if (!_client) throw new Error('[Supabase] Cliente no inicializado. Llama a initSupabase() primero.');
  return _client;
}
