import { useState } from 'react';
import { Download, FileText, Database, RefreshCw, CheckCircle, Wifi, WifiOff } from 'lucide-react';
import { GlassCard } from '@/components/Layout';
import { getSupabaseClient, isSupabaseConnected } from '@/lib/supabase';
import { normalizeJuniorCategory, normalizeTournamentDisplayName } from '@/lib/tournamentNames';
import { MOCK_CLUBS, MOCK_TOURNAMENTS } from '@/data/index';
import { RANKINGS_MEN_CSV, RANKINGS_WOMEN_CSV, RANKINGS_JUNIOR_CSV, RANKINGS_MIXTE_CSV } from '@/data/rankingsCsv';

// ── Timeout plus long pour Supabase (10 s) ──────────────────────────────────
const TIMEOUT_MS = 10_000;

// ── sbQuery : retourne { rows, source } ─────────────────────────────────────
async function sbQuery<T>(
  fn: () => PromiseLike<{ data: T[] | null; error: unknown }>,
  label = ''
): Promise<{ rows: T[]; error: string | null }> {
  try {
    const result = await Promise.race([
      Promise.resolve(fn()),
      new Promise<{ data: null; error: string }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: 'timeout' }), TIMEOUT_MS)
      ),
    ]);
    const { data, error } = result as { data: T[] | null; error: unknown };
    if (error) {
      const msg = typeof error === 'object' && error !== null && 'message' in error
        ? (error as { message: string }).message
        : String(error);
      console.warn(`[Export][${label}] Supabase error:`, error);
      return { rows: [], error: msg };
    }
    return { rows: data ?? [], error: null };
  } catch (e) {
    console.warn(`[Export][${label}] exception:`, e);
    return { rows: [], error: String(e) };
  }
}

// ── Découverte des tables Supabase disponibles ────────────────────────────────
async function discoverTables(): Promise<{ table: string; count: number }[]> {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const candidates = [
    'clubs', 'tournaments', 'players', 'rankings',
    'matches', 'tournament_results', 'results', 'match_results', 'scores',
    'registrations', 'tournament_registrations',
  ];
  const results: { table: string; count: number }[] = [];
  await Promise.all(candidates.map(async (t) => {
    try {
      const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
      if (!error) results.push({ table: t, count: count ?? 0 });
    } catch { /* table doesn't exist */ }
  }));
  return results.sort((a, b) => a.table.localeCompare(b.table));
}

// ── Normalisation division (identique à RankingsAdminPage) ──────────────────
function normDivExport(raw: string | null | undefined): 'MEN' | 'WOMEN' | 'JUNIOR' | 'MIXTE' {
  const v = (raw ?? '').toUpperCase().trim();
  if (v === 'MIXED' || v === 'MIXTE') return 'MIXTE';
  if (v === 'WOMEN') return 'WOMEN';
  if (v === 'JUNIOR') return 'JUNIOR';
  if (v === 'MEN') return 'MEN';
  return 'MEN';
}

// ── Chargement paginé de TOUTE la table rankings (sans filtre SQL) ───────────
// Même stratégie que RankingsAdminPage : charge tout, filtre côté JS
// → insensible à la casse exacte stockée en DB
async function loadAllRankingsFromSupabase(): Promise<Record<string, unknown>[] | null> {
  const sb = getSupabaseClient();
  if (!isSupabaseConnected() || !sb) return null;
  const all: Record<string, unknown>[] = [];
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { rows: chunk, error } = await sbQuery<Record<string, unknown>>(
      () => sb.from('rankings')
        .select('id,player_name,rank,points,division,tournaments_played,trend,season,updated_at')
        .order('division')
        .order('rank')
        .range(from, from + PAGE - 1),
      `rankings_load[${from}]`
    );
    if (error || !chunk.length) break;
    all.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return all.length ? all : null;
}

// ── CSV public fallback ───────────────────────────────────────────────────────
async function fetchPublicCsv(filename: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(`/${filename}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map((line) => {
      const values = line.split(',');
      const row: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        const v = (values[i] ?? '').trim().replace(/^"|"$/g, '');
        row[h] = v !== '' && !isNaN(Number(v)) ? Number(v) : v;
      });
      return row;
    });
  } catch (e) {
    console.warn(`[Export] CSV public fetch failed for ${filename}:`, e);
    return [];
  }
}

// ── Flatten objet (pour inclure toutes les colonnes dans le CSV) ─────────────
function flattenRow(row: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      // Nested object (ex: club join) — aplatir avec préfixe
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        flat[`${k}_${sk}`] = sv;
      }
    } else if (!Array.isArray(v)) {
      flat[k] = v;
    }
    // Arrays ignorées pour le CSV
  }
  return flat;
}

function normalizeExportTournamentRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(row => ({
    ...row,
    name: typeof row.name === 'string'
      ? normalizeTournamentDisplayName(row.name, typeof row.club_name === 'string' ? row.club_name : '')
      : row.name,
    tournament_name: typeof row.tournament_name === 'string'
      ? normalizeTournamentDisplayName(row.tournament_name, typeof row.club_name === 'string' ? row.club_name : '')
      : row.tournament_name,
    category: typeof row.category === 'string' ? normalizeJuniorCategory(row.category) : row.category,
  }));
}

// ── Type source ──────────────────────────────────────────────────────────────
type DataSource = 'supabase' | 'csv_public' | 'mock';

interface FetchResult {
  rows: Record<string, unknown>[];
  source: DataSource;
  sourceLabel: string;
  error: string | null;
}

// ── fetchData : essaie Supabase d'abord, puis CSV public, puis mock ───────────
async function fetchData(target: ExportTarget): Promise<FetchResult> {
  const sb   = getSupabaseClient();
  const sbOk = isSupabaseConnected() && !!sb;

  // ── Clubs ──────────────────────────────────────────────────────────────────
  if (target === 'clubs') {
    if (sbOk) {
      const { rows, error } = await sbQuery<Record<string, unknown>>(
        () => sb!.from('clubs').select('*').order('name').limit(500),
        'clubs'
      );
      if (rows.length) return { rows: rows.map(flattenRow), source: 'supabase', sourceLabel: `Supabase (${rows.length} clubs)`, error: null };
      if (error) return { rows: MOCK_CLUBS as unknown as Record<string, unknown>[], source: 'mock', sourceLabel: `Fallback mock (erreur: ${error})`, error };
    }
    return { rows: MOCK_CLUBS as unknown as Record<string, unknown>[], source: 'mock', sourceLabel: 'Fallback mock (Supabase non connecté)', error: null };
  }

  // ── Joueurs ────────────────────────────────────────────────────────────────
  if (target === 'players') {
    if (sbOk) {
      try {
        const allPlayers: Record<string, unknown>[] = [];
        let from = 0;
        const PAGE = 1000;
        let lastError: string | null = null;
        while (true) {
          const { rows, error } = await sbQuery<Record<string, unknown>>(
            () => sb!.from('players').select('*').order('last_name').range(from, from + PAGE - 1),
            `players[${from}]`
          );
          if (error) { lastError = error; break; }
          if (!rows.length) break;
          allPlayers.push(...rows.map(flattenRow));
          if (rows.length < PAGE) break;
          from += PAGE;
        }
        if (allPlayers.length) return { rows: allPlayers, source: 'supabase', sourceLabel: `Supabase (${allPlayers.length} joueurs)`, error: null };
        if (lastError) return { rows: [], source: 'supabase', sourceLabel: `Supabase — aucune donnée (erreur: ${lastError})`, error: lastError };
      } catch (e) {
        console.warn('[Export] players pagination error:', e);
      }
    }
    const fallback = [
      ...RANKINGS_MEN_CSV,
      ...RANKINGS_WOMEN_CSV,
      ...RANKINGS_JUNIOR_CSV,
      ...RANKINGS_MIXTE_CSV,
    ] as unknown as Record<string, unknown>[];
    return { rows: fallback, source: 'csv_public', sourceLabel: `Fallback CSV rankings (${fallback.length} lignes)`, error: null };
  }

  // ── Tournois ───────────────────────────────────────────────────────────────
  // NOTE: pas de FK tournaments→clubs / id est TEXT / colonnes exactes inconnues
  // → essayer plusieurs ordres possibles + pagination
  if (target === 'tournaments') {
    if (sbOk) {
      // Essai 1 : order start_date
      let { rows, error } = await sbQuery<Record<string, unknown>>(
        () => sb!.from('tournaments').select('*').order('start_date', { ascending: true }).limit(1000),
        'tournaments[start_date]'
      );
      // Essai 2 : si start_date inexistant, essayer date
      if (!rows.length && error) {
        ({ rows, error } = await sbQuery<Record<string, unknown>>(
          () => sb!.from('tournaments').select('*').order('date', { ascending: true }).limit(1000),
          'tournaments[date]'
        ));
      }
      // Essai 3 : order id (toujours disponible)
      if (!rows.length) {
        ({ rows, error } = await sbQuery<Record<string, unknown>>(
          () => sb!.from('tournaments').select('*').order('id').limit(1000),
          'tournaments[id]'
        ));
      }
      if (rows.length) return { rows: normalizeExportTournamentRows(rows.map(flattenRow)), source: 'supabase', sourceLabel: `Supabase (${rows.length} tournois)`, error: null };
      if (error) return { rows: normalizeExportTournamentRows(MOCK_TOURNAMENTS as unknown as Record<string, unknown>[]), source: 'mock', sourceLabel: `Fallback mock (erreur: ${error})`, error };
      return { rows: normalizeExportTournamentRows(MOCK_TOURNAMENTS as unknown as Record<string, unknown>[]), source: 'mock', sourceLabel: 'Supabase vide — fallback mock', error: null };
    }
    return { rows: normalizeExportTournamentRows(MOCK_TOURNAMENTS as unknown as Record<string, unknown>[]), source: 'mock', sourceLabel: 'Fallback mock (Supabase non connecté)', error: null };
  }

  // ── Rankings ─────────────────────────────────────────────────────────────
  // loadAllRankingsFromSupabase() charge tout sans filtre SQL puis on filtre JS
  // Les cibles division possibles normalisées :
  // rankings_men → MEN | rankings_women → WOMEN | rankings_junior → JUNIOR | rankings_mixte → MIXTE
  const RANK_DIV_NORM: Record<string, 'MEN' | 'WOMEN' | 'JUNIOR' | 'MIXTE'> = {
    rankings_men:    'MEN',
    rankings_women:  'WOMEN',
    rankings_junior: 'JUNIOR',
    rankings_mixte:  'MIXTE',
  };
  const CSV_LOCAL: Record<string, Record<string, unknown>[]> = {
    rankings_men:    RANKINGS_MEN_CSV    as unknown as Record<string, unknown>[],
    rankings_women:  RANKINGS_WOMEN_CSV  as unknown as Record<string, unknown>[],
    rankings_junior: RANKINGS_JUNIOR_CSV as unknown as Record<string, unknown>[],
    rankings_mixte:  RANKINGS_MIXTE_CSV  as unknown as Record<string, unknown>[],
  };
  const CSV_FILES: Record<string, string> = {
    rankings_men:    'rankings_2026_men.csv',
    rankings_women:  'rankings_2026_women.csv',
    rankings_junior: 'rankings_2026_junior.csv',
    rankings_mixte:  'rankings_2026_mixte.csv',
  };

  if (target in RANK_DIV_NORM || target === 'rankings_all') {
    // 1. Essai Supabase — charge tout sans filtre SQL, filtre côté JS
    const allSb = await loadAllRankingsFromSupabase();

    if (target === 'rankings_all') {
      if (allSb && allSb.length) {
        return { rows: allSb, source: 'supabase', sourceLabel: `Supabase rankings toutes divisions (${allSb.length} joueurs)`, error: null };
      }
      // Fallback : CSV publics en parallèle
      const [men, women, junior, mixte] = await Promise.all([
        fetchPublicCsv('rankings_2026_men.csv'),
        fetchPublicCsv('rankings_2026_women.csv'),
        fetchPublicCsv('rankings_2026_junior.csv'),
        fetchPublicCsv('rankings_2026_mixte.csv'),
      ]);
      const combined = [...men, ...women, ...junior, ...mixte];
      if (combined.length) return { rows: combined, source: 'csv_public', sourceLabel: `CSV officiel MPL complet (${combined.length} joueurs)`, error: null };
      const fb = [...(RANKINGS_MEN_CSV as unknown as Record<string,unknown>[]), ...(RANKINGS_WOMEN_CSV as unknown as Record<string,unknown>[]), ...(RANKINGS_JUNIOR_CSV as unknown as Record<string,unknown>[]), ...(RANKINGS_MIXTE_CSV as unknown as Record<string,unknown>[])];
      return { rows: fb, source: 'csv_public', sourceLabel: `Fallback inline (${fb.length} lignes)`, error: null };
    }

    // Division spécifique
    const normTarget = RANK_DIV_NORM[target];
    if (allSb && allSb.length) {
      const filtered = allSb.filter(r => normDivExport(r.division as string) === normTarget);
      if (filtered.length) {
        return { rows: filtered, source: 'supabase', sourceLabel: `Supabase rankings (${filtered.length} joueurs)`, error: null };
      }
      // allSb chargé mais division introuvable (0 résultats) → CSV fallback
      console.warn(`[Export] rankings[${target}]: division "${normTarget}" absente dans Supabase (${allSb.length} lignes totales)`);
    }

    // 2. CSV public officiel
    const csvRows = await fetchPublicCsv(CSV_FILES[target]);
    if (csvRows.length) return { rows: csvRows, source: 'csv_public', sourceLabel: `CSV officiel MPL (${csvRows.length} joueurs)`, error: null };

    // 3. Inline bundlé
    const local = CSV_LOCAL[target];
    return { rows: local, source: 'csv_public', sourceLabel: `Fallback inline (${local.length} lignes)`, error: null };
  }

  // ── Résultats ─────────────────────────────────────────────────────────────
  // NOTE: pas de FK tournament_results→tournaments → select('*') sans join
  // Colonnes réelles: id, tournament_id, tournament_name, tournament_date,
  //   category, division, region, club_name, rank, team_name,
  //   player1_name, player2_name, points, created_at
  if (target === 'results') {
    if (sbOk) {
      // 1. Essai principal: tournament_results
      const { rows: r1, error: e1 } = await sbQuery<Record<string, unknown>>(
        () => sb!.from('tournament_results').select('*').order('tournament_date', { ascending: false }).limit(2000),
        'tournament_results'
      );
      if (r1.length) return { rows: normalizeExportTournamentRows(r1), source: 'supabase', sourceLabel: `Supabase tournament_results (${r1.length} résultats)`, error: null };
      console.warn('[Export] tournament_results error:', e1);

      // 2. Fallback: matches (même si vide, essayer)
      const { rows: r2, error: e2 } = await sbQuery<Record<string, unknown>>(
        () => sb!.from('matches').select('*').order('created_at', { ascending: false }).limit(2000),
        'matches'
      );
      if (r2.length) return { rows: normalizeExportTournamentRows(r2.map(flattenRow)), source: 'supabase', sourceLabel: `Supabase matches (${r2.length} résultats)`, error: null };
      console.warn('[Export] matches error:', e2);

      // 3. Aucune donnée trouvée — indiquer clairement sans injecter de données de démo
      const errMsg = e1 ?? e2 ?? 'Table vide';
      return {
        rows: [],
        source: 'supabase',
        sourceLabel: `Supabase résultats vide (${errMsg})`,
        error: errMsg,
      };
    }
    return { rows: normalizeExportTournamentRows(MOCK_RESULTS), source: 'mock', sourceLabel: 'Fallback mock (Supabase non connecté)', error: null };
  }

  // ── Inscriptions ──────────────────────────────────────────────────────────
  // NOTE: pas de FK registrations→tournaments ni →players dans la DB
  // → select('*') simple, pas de join
  if (target === 'registrations') {
    if (sbOk) {
      const { rows: r1 } = await sbQuery<Record<string, unknown>>(
        () => sb!.from('registrations').select('*').order('registered_at', { ascending: false }).limit(2000),
        'registrations'
      );
      if (r1.length) return { rows: r1, source: 'supabase', sourceLabel: `Supabase registrations (${r1.length} inscriptions)`, error: null };

      // Essai alternatif
      const { rows: r2 } = await sbQuery<Record<string, unknown>>(
        () => sb!.from('tournament_registrations').select('*').limit(2000),
        'tournament_registrations'
      );
      if (r2.length) return { rows: r2, source: 'supabase', sourceLabel: `Supabase tournament_registrations (${r2.length} inscriptions)`, error: null };

      return { rows: [], source: 'supabase', sourceLabel: 'Supabase inscriptions vide (0 ligne)', error: null };
    }
    return { rows: normalizeExportTournamentRows(MOCK_REGISTRATIONS), source: 'mock', sourceLabel: 'Fallback mock (Supabase non connecté)', error: null };
  }

  return { rows: [], source: 'mock', sourceLabel: 'Inconnu', error: 'Cible inconnue' };
}

// ── Données mock ─────────────────────────────────────────────────────────────
const MOCK_RESULTS = [
  { tournament_name: 'Urban Sport Grand Baie M50',        tournament_date: '2026-03-21', category: 'M50',   division: 'men',   rank: 1, player1_name: 'Vallet Mathieu',   player2_name: 'de Beer Amaury',  points: 125 },
  { tournament_name: 'Urban Sport Grand Baie M250',       tournament_date: '2026-03-21', category: 'M250',  division: 'men',   rank: 1, player1_name: 'Cotin Josselin',   player2_name: 'Legros Nicolas',  points: 400 },
  { tournament_name: 'Urban Sport Black River Mixed Open', tournament_date: '2026-03-21', category: 'Mixed', division: 'mixed', rank: 1, player1_name: 'Lyzhnikov Kirill', player2_name: 'Danjoux Alice',   points: 300 },
  { tournament_name: 'RM Club Tamarin M25',                tournament_date: '2026-03-22', category: 'M25',   division: 'men',   rank: 1, player1_name: 'Mamet Oscar',       player2_name: 'Charni Samy',     points: 62  },
];
const MOCK_REGISTRATIONS = [
  { id: 'reg1', tournament_name: 'Urban Sport Grand Baie Open M100', team_name: 'Vallet / de Beer',  division: 'men',    confirmed: true,  registered_at: '2026-03-01' },
  { id: 'reg2', tournament_name: 'Urban Sport Grand Baie Open M100', team_name: 'Cotin / Legros',     division: 'men',    confirmed: true,  registered_at: '2026-03-02' },
  { id: 'reg3', tournament_name: 'Flic en Flac Padel Ladies',        team_name: 'Danjoux / Koenig',   division: 'women',  confirmed: true,  registered_at: '2026-03-05' },
  { id: 'reg4', tournament_name: 'RM Club Tamarin Junior Cup',        team_name: 'Lagesse / Lebreton', division: 'junior', confirmed: true,  registered_at: '2026-03-10' },
];

// ── CSV / JSON helpers ────────────────────────────────────────────────────────
type ExportFormat = 'csv' | 'json';
type ExportTarget =
  | 'clubs' | 'players' | 'tournaments'
  | 'rankings_men' | 'rankings_women' | 'rankings_junior' | 'rankings_mixte' | 'rankings_all'
  | 'results' | 'registrations';

function toCSV(data: Record<string, unknown>[]): string {
  if (!data.length) return 'Aucune donnée disponible';
  const keys = Object.keys(data[0]).filter(k => typeof data[0][k] !== 'object' || data[0][k] === null);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(','), ...data.map(row => keys.map(k => esc(row[k])).join(','))].join('\n');
}

function downloadFile(content: string, filename: string, mime: string) {
  const BOM  = mime.includes('csv') ? '\uFEFF' : '';
  const full = BOM + content;
  try {
    const blob = new Blob([full], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    a.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(a);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    setTimeout(() => { try { document.body.removeChild(a); } catch { /**/ } URL.revokeObjectURL(url); }, 500);
    return;
  } catch { /**/ }
  try {
    const blob = new Blob([full], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (win) { setTimeout(() => URL.revokeObjectURL(url), 2000); return; }
  } catch { /**/ }
  alert('Impossible de télécharger. Utilisez le bouton "Copier CSV".');
}

// ── Exports cards config ──────────────────────────────────────────────────────
interface ExportCard { target: ExportTarget; label: string; desc: string; icon: string; color: string }
const EXPORTS: ExportCard[] = [
  { target: 'clubs',           label: 'Clubs',              desc: 'Clubs officiels MPL — table clubs Supabase',                                      icon: '🏟️', color: '#3b82f6' },
  { target: 'players',         label: 'Joueurs',            desc: 'Tous les joueurs actifs — table players Supabase (pagination)',                 icon: '👥', color: '#8b5cf6' },
  { target: 'tournaments',     label: 'Tournois',           desc: 'Calendrier 2026 — table tournaments Supabase',                                   icon: '🏆', color: '#f59e0b' },
  { target: 'rankings_men',    label: 'Classement Hommes',  desc: 'Supabase rankings [division=men] → CSV officiel MPL en fallback',               icon: '👨', color: '#3b82f6' },
  { target: 'rankings_women',  label: 'Classement Dames',   desc: 'Supabase rankings [division=women] → CSV officiel MPL en fallback',             icon: '👩', color: '#ec4899' },
  { target: 'rankings_junior', label: 'Classement Junior',  desc: 'Supabase rankings [division=junior] → CSV officiel MPL en fallback',            icon: '⭐', color: '#f59e0b' },
  { target: 'rankings_mixte',  label: 'Classement Mixte',   desc: 'Supabase rankings [division=mixte/mixed] → CSV officiel MPL en fallback',       icon: '🎾', color: '#8b5cf6' },
  { target: 'rankings_all',    label: 'Classement Complet', desc: 'Supabase rankings toutes divisions → CSV officiel MPL en fallback',            icon: '📊', color: '#4ad569' },
  { target: 'results',         label: 'Résultats',          desc: 'Table tournament_results Supabase — export live',                              icon: '📋', color: '#10b981' },
  { target: 'registrations',   label: 'Inscriptions',       desc: 'Table registrations Supabase avec statuts',                                      icon: '📝', color: '#f97316' },
];

// ── Source badge ─────────────────────────────────────────────────────────────
function SourceBadge({ source, label }: { source: DataSource; label: string }) {
  const cfg: Record<DataSource, { color: string; bg: string; icon: string }> = {
    supabase:   { color: '#4ad569', bg: 'rgba(74,213,105,0.12)',  icon: '🟢' },
    csv_public: { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', icon: '📁' },
    mock:       { color: '#f97316', bg: 'rgba(249,115,22,0.12)',  icon: '⚠️' },
  };
  const { color, bg, icon } = cfg[source];
  return (
    <span title={label} style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: bg, color, display: 'inline-flex', alignItems: 'center', gap: '4px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {icon} {label}
    </span>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function ExportsPage() {
  const [loading,  setLoading]  = useState<ExportTarget | null>(null);
  const [done,     setDone]     = useState<ExportTarget | null>(null);
  const [format,   setFormat]   = useState<ExportFormat>('csv');
  const [preview,  setPreview]  = useState<{ target: ExportTarget; data: Record<string, unknown>[]; total: number; result: FetchResult } | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Record<ExportTarget, FetchResult | null>>({} as Record<ExportTarget, FetchResult | null>);

  // Connexion info
  const connected = isSupabaseConnected();

  // ── Debug panel ──────────────────────────────────────────────────────────
  const [showDebug, setShowDebug] = useState(false);
  const [tableList, setTableList] = useState<{ table: string; count: number }[]>([]);
  const [testingConn, setTestingConn] = useState(false);

  const testConnection = async () => {
    setTestingConn(true);
    const tables = await discoverTables();
    setTableList(tables);
    setTestingConn(false);
    setShowDebug(true);
  };

  const handleExport = async (target: ExportTarget) => {
    setLoading(target); setError(null);
    try {
      const result = await fetchData(target);
      setLastResult(prev => ({ ...prev, [target]: result }));
      if (!result.rows.length) {
        setError(`Aucune donnée pour "${EXPORTS.find(e => e.target === target)?.label}" — ${result.sourceLabel}`);
        setLoading(null); return;
      }
      if (result.source === 'mock') {
        setError(`⚠️ "${EXPORTS.find(e => e.target === target)?.label}" — données mock utilisées (Supabase indisponible ou table vide)`);
      }
      const ts = new Date().toISOString().slice(0, 10);
      if (format === 'csv') {
        downloadFile(toCSV(result.rows), `mpl2026_${target}_${ts}.csv`, 'text/csv;charset=utf-8;');
      } else {
        downloadFile(JSON.stringify(result.rows, null, 2), `mpl2026_${target}_${ts}.json`, 'application/json');
      }
      setDone(target);
      setTimeout(() => setDone(null), 3000);
    } catch (e) {
      setError(`Erreur lors de l'export: ${e}`);
    }
    setLoading(null);
  };

  const handlePreview = async (target: ExportTarget) => {
    setLoading(target); setError(null);
    try {
      const result = await fetchData(target);
      setLastResult(prev => ({ ...prev, [target]: result }));
      setPreview({ target, data: result.rows.slice(0, 8), total: result.rows.length, result });
      if (result.source === 'mock') {
        setError(`⚠️ Aperçu mock — Supabase non connecté ou table vide pour "${EXPORTS.find(e => e.target === target)?.label}"`);
      }
    } catch (e) {
      setError(`Erreur aperçu: ${e}`);
    }
    setLoading(null);
  };

  const handleExportAll = async () => {
    setError(null);
    for (const e of EXPORTS) {
      await handleExport(e.target);
      await new Promise(r => setTimeout(r, 400));
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ color: 'white', fontWeight: 700, margin: '0 0 4px' }}>Exports</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {connected
              ? <span style={{ color: '#4ad569', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}><Wifi size={13} /> Supabase connecté — données live</span>
              : <span style={{ color: '#f97316', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}><WifiOff size={13} /> Supabase non configuré — fallback CSV/mock</span>
            }
            <button onClick={testConnection} disabled={testingConn}
              style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: '#a0a0a0', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
              {testingConn ? '⏳ Test…' : '🔍 Tester tables Supabase'}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '3px' }}>
            {(['csv', 'json'] as ExportFormat[]).map(f => (
              <button key={f} onClick={() => setFormat(f)}
                style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                  background: format === f ? '#4ad569' : 'transparent', color: format === f ? '#0a0a0a' : '#666', transition: 'all 0.2s' }}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          <button onClick={handleExportAll}
            style={{ background: 'rgba(74,213,105,0.1)', color: '#4ad569', border: '1px solid rgba(74,213,105,0.3)', borderRadius: '8px', padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Database size={14} /> Tout exporter
          </button>
        </div>
      </div>

      {/* Debug — table discovery */}
      {showDebug && (
        <GlassCard style={{ padding: '16px', marginBottom: '16px', borderColor: 'rgba(96,165,250,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: '13px' }}>🔍 Tables Supabase détectées ({tableList.length})</span>
            <button onClick={() => setShowDebug(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '18px' }}>×</button>
          </div>
          {tableList.length === 0
            ? <span style={{ color: '#f97316', fontSize: '13px' }}>Aucune table accessible — vérifiez les clés Supabase et les politiques RLS</span>
            : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {tableList.map(t => (
                  <span key={t.table} style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '6px', background: 'rgba(74,213,105,0.1)', color: '#4ad569', fontFamily: 'monospace' }}>
                    {t.table} <span style={{ color: '#666' }}>({t.count.toLocaleString('fr-FR')})</span>
                  </span>
                ))}
              </div>
          }
        </GlassCard>
      )}

      {/* Erreur */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '12px 16px', color: '#f87171', fontSize: '13px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ lineHeight: 1.5 }}>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '18px', lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
      )}

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '16px', marginBottom: '32px' }}>
        {EXPORTS.map(e => {
          const lastRes = lastResult[e.target];
          return (
            <GlassCard key={e.target} style={{ padding: '20px' }}>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${e.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>{e.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ color: 'white', fontWeight: 700, margin: '0 0 2px', fontSize: '15px' }}>{e.label}</h3>
                  <p style={{ color: '#666', fontSize: '12px', margin: '0 0 4px' }}>{e.desc}</p>
                  {lastRes && <SourceBadge source={lastRes.source} label={lastRes.sourceLabel} />}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleExport(e.target)} disabled={loading === e.target}
                  style={{ flex: 1, background: done === e.target ? 'rgba(74,213,105,0.15)' : `${e.color}18`,
                    color: done === e.target ? '#4ad569' : e.color,
                    border: `1px solid ${done === e.target ? 'rgba(74,213,105,0.4)' : e.color + '33'}`,
                    borderRadius: '8px', padding: '8px', fontSize: '13px', fontWeight: 600,
                    cursor: loading === e.target ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    opacity: loading === e.target ? 0.7 : 1 }}>
                  {loading === e.target
                    ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Chargement…</>
                    : done === e.target
                      ? <><CheckCircle size={13} /> Téléchargé !</>
                      : <><Download size={13} /> {format.toUpperCase()}</>}
                </button>
                <button onClick={() => handlePreview(e.target)} disabled={loading === e.target}
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#a0a0a0', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', padding: '8px 12px', fontSize: '12px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '4px', opacity: loading === e.target ? 0.5 : 1 }}>
                  <FileText size={12} /> Aperçu
                </button>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Aperçu */}
      {preview && preview.data.length > 0 && (
        <GlassCard style={{ padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ color: 'white', fontWeight: 700, margin: '0 0 4px', fontSize: '15px' }}>
                Aperçu — {EXPORTS.find(e => e.target === preview.target)?.label}
                <span style={{ color: '#666', fontWeight: 400, marginLeft: '8px', fontSize: '13px' }}>{preview.total.toLocaleString('fr-FR')} lignes</span>
              </h3>
              <SourceBadge source={preview.result.source} label={preview.result.sourceLabel} />
            </div>
            <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '20px' }}>×</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(74,213,105,0.15)' }}>
                  {Object.keys(preview.data[0] ?? {})
                    .filter(k => typeof preview.data[0][k] !== 'object' || preview.data[0][k] === null)
                    .map(k => (
                      <th key={k} style={{ padding: '8px 12px', textAlign: 'left', color: '#4ad569', fontWeight: 600, textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{k}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {preview.data.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    {Object.entries(row).filter(([, v]) => typeof v !== 'object' || v === null).map(([k, v]) => (
                      <td key={k} style={{ padding: '8px 12px', color: '#a0a0a0', whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {v === null || v === undefined ? <span style={{ color: '#444' }}>—</span> : String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => handleExport(preview.target)}
              style={{ background: '#4ad569', color: '#0a0a0a', border: 'none', borderRadius: '8px', padding: '8px 18px', fontWeight: 700, cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Download size={14} /> Télécharger tout ({preview.total.toLocaleString('fr-FR')} lignes)
            </button>
            <button onClick={async () => {
              const result = await fetchData(preview.target);
              const csv = toCSV(result.rows);
              await navigator.clipboard.writeText(csv).then(
                () => alert(`✅ ${result.rows.length} lignes copiées dans le presse-papiers.`),
                () => alert('❌ Impossible de copier. Utilisez Ctrl+A dans l\'aperçu.')
              );
            }}
              style={{ background: 'rgba(255,255,255,0.06)', color: '#a0a0a0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📋 Copier CSV
            </button>
          </div>
        </GlassCard>
      )}

      {/* Légende sources */}
      <GlassCard style={{ padding: '20px' }}>
        <h3 style={{ color: 'white', fontWeight: 700, margin: '0 0 12px', fontSize: '14px' }}>📌 Sources de données</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '12px' }}>
          {[
            { color: '#4ad569', icon: '🟢', title: 'Supabase live',   desc: 'Données temps réel depuis votre base de données Supabase.' },
            { color: '#60a5fa', icon: '📁', title: 'CSV public',      desc: 'Fichiers CSV officiels MPL dans /public. Rankings complets.' },
            { color: '#f97316', icon: '⚠️', title: 'Mock (fallback)', desc: 'Données de démonstration — Supabase indisponible ou table vide.' },
          ].map((g) => (
            <div key={g.title} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '16px', marginTop: '1px' }}>{g.icon}</span>
              <div>
                <div style={{ color: g.color, fontWeight: 700, fontSize: '13px', marginBottom: '2px' }}>{g.title}</div>
                <div style={{ color: '#555', fontSize: '12px', lineHeight: 1.5 }}>{g.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
