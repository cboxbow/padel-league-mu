/**
 * supabase.ts — MPL AUTH V2
 * ─────────────────────────────────────────────────────────────────────────────
 * Clés Supabase UNIQUEMENT depuis les variables d'environnement.
 * ZÉRO localStorage pour les clés de connexion.
 * ZÉRO config manuelle dans l'UI.
 *
 * Configurer dans .env.local :
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJhbGci...
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── Lecture des clés (env uniquement) ─────────────────────────────────────────
function normalizeSupabaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.replace(/\/rest\/v1$/i, '');
}

const SUPABASE_URL  = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL ?? '');
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

// ── Client singleton ──────────────────────────────────────────────────────────
let _client: SupabaseClient | null = null;

function buildClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  if (_client) return _client;
  _client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,       // session stockée dans localStorage par Supabase lui-même
      detectSessionInUrl: true,   // nécessaire pour le callback OTP (#access_token=...)
    },
  });
  return _client;
}

_client = buildClient();

export function getSupabaseClient(): SupabaseClient | null {
  return _client ?? buildClient();
}

// Vrai uniquement si URL + KEY sont présentes dans l'env
export function isSupabaseConnected(): boolean {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

export function getSupabaseRestUrl(): string {
  return SUPABASE_URL ? `${SUPABASE_URL}/rest/v1` : '';
}

export function getSupabaseAnonKey(): string {
  return SUPABASE_KEY;
}

// ── Wrapper fetch robuste avec timeout ────────────────────────────────────────
export async function safeSupabaseQuery<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: unknown }>,
  timeoutMs = 5000
): Promise<{ data: T | null; error: unknown; timedOut: boolean }> {
  const client = getSupabaseClient();
  if (!client) return { data: null, error: 'Supabase non configuré', timedOut: false };

  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<{ data: null; error: string; timedOut: true }>(resolve =>
    (timer = setTimeout(() => resolve({ data: null, error: 'timeout', timedOut: true }), timeoutMs))
  );

  try {
    const result = await Promise.race([
      Promise.resolve(queryFn()).then(r => ({ ...r, timedOut: false as const })),
      timeout,
    ]);
    if (timer) clearTimeout(timer);
    return result;
  } catch (e) {
    if (timer) clearTimeout(timer);
    return { data: null, error: e, timedOut: false };
  }
}

// ── Proxy de compatibilité (usages existants hors auth) ───────────────────────
// Les pages qui font `supabase.from(...)` continuent de fonctionner.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getSupabaseClient();
    if (!c) throw new Error('Supabase non configuré — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local');
    return (c as any)[prop];
  },
});

// ── Fonctions retirées (ex-config UI) — stubs pour éviter les erreurs d'import ─
// Ces fonctions ne font plus rien mais restent exportées pour compatibilité
// avec les éventuels imports existants non encore nettoyés.
/** @deprecated Supprimée dans MPL AUTH V2 — clés définies dans .env.local */
export function saveSupabaseConfig(_url: string, _key: string): void {
  console.warn('[MPL AUTH V2] saveSupabaseConfig() est obsolète. Utilisez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local');
}
/** @deprecated Supprimée dans MPL AUTH V2 */
export function clearSupabaseConfig(): void {
  console.warn('[MPL AUTH V2] clearSupabaseConfig() est obsolète.');
}
/** @deprecated Supprimée dans MPL AUTH V2 */
export function getStoredConfig(): { url: string; key: string } {
  return { url: SUPABASE_URL, key: '' };   // key vide pour ne pas exposer
}
/** @deprecated Supprimée dans MPL AUTH V2 */
export async function testSupabaseConnection(): Promise<{ ok: boolean; tables: string[]; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, tables: [], error: 'VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquant dans .env.local' };
  const tableNames = ['clubs', 'tournaments', 'players', 'rankings', 'matches'];
  const found: string[] = [];
  for (const t of tableNames) {
    const { error } = await client.from(t).select('id').limit(1);
    if (!error) found.push(t);
  }
  return found.length > 0 ? { ok: true, tables: found } : { ok: false, tables: [], error: 'Aucune table trouvée' };
}
