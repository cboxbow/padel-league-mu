import { useState, useEffect, useMemo } from 'react';
import { getSupabaseClient, getSupabaseRestUrl, isSupabaseConnected, safeSupabaseQuery } from '@/lib/supabase';
import { normalizeJuniorCategory, normalizeTournamentDisplayName } from '@/lib/tournamentNames';
import { MPL_CLUBS, MPL_TOURNAMENTS } from '@/data/mpl2026';
// MOCK_RANKINGS_* conservés pour compatibilité (non utilisés directement)
import type { Division } from '@/lib/index';
import {
  FULL_RANKINGS_MEN,
  FULL_RANKINGS_WOMEN,
  FULL_RANKINGS_MIXED,
  FULL_RANKINGS_JUNIOR,
} from '@/data/fullRankings';

// Type interne pour les données CSV parsées
interface CsvRow { rank: number; name: string; points: number; }

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ClubData {
  id: string; name: string; slug: string; region: string; city: string;
  courts: number; contact: string; phone: string; email?: string;
  total_events: number;
}

export interface TournamentData {
  id: string; name: string; club_id: string; club_name: string;
  date: string; region: string; category: string; division: string;
  type: string; status: string; max_teams: number;
  teams_registered?: number;
  participants_count?: number;  // ← nb équipes réelles depuis tournament_results
  has_results?: boolean;        // ← true si des résultats existent
}

// ── Source de données (debug visuel) ─────────────────────────────────────────
export type DataSource = 'supabase' | 'csv' | 'local';

// ── Chargement CSV public (rankings) ─────────────────────────────────────────
async function fetchPublicCsv(division: 'men' | 'women' | 'junior' | 'mixed'): Promise<CsvRow[] | null> {
  const fileMap: Record<string, string> = {
    men:    'rankings_2026_men.csv',
    women:  'rankings_2026_women.csv',
    junior: 'rankings_2026_junior.csv',
    mixed:  'rankings_2026_mixte.csv',
  };
  const filename = fileMap[division];
  if (!filename) return null;

  // Essayer plusieurs chemins pour couvrir dev local, CDN, et sous-dossiers
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  const urls = [
    `${base}/${filename}`,          // CDN / sous-chemin
    `/${filename}`,                  // racine absolue
    `./${filename}`,                 // relatif
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.trim().length < 10) continue;
      const lines = text.trim().split('\n').slice(1); // skip header
      const parsed = lines.map(line => {
        const cols = line.split(',');
        return {
          rank:   parseInt(cols[0] ?? '0', 10),
          name:   (cols[1] ?? '').trim().replace(/^"|"$/g, ''),
          points: parseInt(cols[2] ?? '0', 10),
        };
      }).filter(r => r.name && !isNaN(r.rank));
      if (parsed.length > 5) {
        console.log(`[useRankings] CSV chargé: ${url} → ${parsed.length} joueurs`);
        return parsed;
      }
    } catch {
      // essayer prochain URL
    }
  }
  console.warn(`[useRankings] CSV public introuvable pour division=${division}, fallback bundle`);
  return null;
}

// ── useClubs ──────────────────────────────────────────────────────────────────
export function useClubs(regionFilter?: string) {
  const [clubs, setClubs]   = useState<ClubData[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource]   = useState<DataSource>('local');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = getSupabaseClient();

      if (isSupabaseConnected() && supabase) {
        let query = supabase.from('clubs').select('*').order('name');
        if (regionFilter && regionFilter !== 'all') query = query.eq('region', regionFilter);

        const { data, error, timedOut } = await safeSupabaseQuery(() => query);

        if (data && !error && !timedOut && (data as ClubData[]).length > 0) {
          setClubs(data as ClubData[]);
          setSource('supabase');
          setLoading(false);
          return;
        }
        if (timedOut) console.warn('[useClubs] Supabase timeout → fallback local');
        if (error)    console.warn('[useClubs] Supabase error:', error, '→ fallback local');
      }

      // Fallback données locales réelles
      const filtered = regionFilter && regionFilter !== 'all'
        ? MPL_CLUBS.filter(c => c.region === regionFilter)
        : [...MPL_CLUBS];
      setClubs(filtered.sort((a, b) => a.name.localeCompare(b.name)));
      setSource('local');
      setLoading(false);
    }
    load();
  }, [regionFilter]);

  return { clubs, loading, source };
}

// ── useTournaments ────────────────────────────────────────────────────────────

/**
 * Calcule le statut automatique d'un tournoi selon les règles MPL officielles :
 *  - Terminé    : date passée (date < aujourd'hui)
 *  - Draw/Fermé : J-7 à J-1 (inscriptions fermées, tirage imminent)
 *  - Ouvert     : J-21 à J-8 (inscriptions ouvertes)
 *  - À venir    : plus de 21 jours avant la date
 *
 * Si le statut Supabase est explicitement défini (non vide, non 'upcoming', non 'À venir'),
 * il est respecté tel quel (permet à l'admin de forcer un statut).
 */
export function computeTournamentStatus(date: string, supabaseStatus?: string): string {
  const forced = (supabaseStatus ?? '').toString().trim().toLowerCase();
  // Statuts forcés par l'admin → respectés tels quels
  if (forced && !['upcoming', 'à venir', 'a venir', ''].includes(forced)) {
    return supabaseStatus as string;
  }
  if (!date) return 'upcoming';

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tournDay = new Date(date); tournDay.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((tournDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0)   return 'completed';   // date passée
  if (diffDays < 7)   return 'draw';        // tirage / inscriptions fermées
  if (diffDays < 21)  return 'open';        // inscriptions ouvertes
  return 'upcoming';                         // trop tôt pour s'inscrire
}

export function useTournaments(filters?: {
  region?: string; category?: string; division?: string;
  status?: string; month?: string; club_id?: string;
}) {
  const [dbData, setDbData]   = useState<TournamentData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource]   = useState<DataSource>('local');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = getSupabaseClient();

      if (isSupabaseConnected() && supabase) {
        const { data, error, timedOut } = await safeSupabaseQuery(() =>
          supabase.from('tournaments').select('*').limit(2000)
        );

        if (data && !error && !timedOut && (data as unknown[]).length > 0) {
          const rows = data as Record<string, unknown>[];
          const normalized: TournamentData[] = rows.map(r => {
            const date = ((r.tournament_date ?? r.date) as string) ?? '';
            const rawStatus = (r.status as string) ?? '';
            return {
              id:               r.id               as string,
              name:             normalizeTournamentDisplayName(r.name as string, r.club_name as string),
              club_id:          r.club_id          as string,
              club_name:        r.club_name        as string,
              date,
              region:           r.region           as string,
              category:         normalizeJuniorCategory(r.category as string),
              division:         r.division         as string,
              type:             ((r.tournament_type ?? r.type) as string) ?? '',
              // Statut calculé selon les règles MPL (3sem=open, 1sem=draw, passé=completed)
              status:           computeTournamentStatus(date, rawStatus),
              max_teams:        r.max_teams        as number,
              teams_registered: (r.teams_registered ?? 0) as number,
              participants_count: undefined as number | undefined,
              has_results:      false,
            };
          });
          normalized.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

          // ── Enrichissement automatique depuis tournament_results ──────────
          // Compte les équipes réelles par tournament_id
          const { data: resData } = await safeSupabaseQuery(() =>
            supabase!.from('tournament_results')
              .select('tournament_id, rank')
              .limit(10000)
          );
          if (resData && (resData as unknown[]).length > 0) {
            const resRows = resData as Record<string, unknown>[];
            // Compter les équipes max (rang max) par tournoi
            const countMap = new Map<string, number>();
            for (const row of resRows) {
              const tid = row.tournament_id as string;
              if (!tid) continue;
              const rank = Number(row.rank ?? 0);
              const prev = countMap.get(tid) ?? 0;
              if (rank > prev) countMap.set(tid, rank);
            }
            // Injecter participants_count + has_results
            for (const t of normalized) {
              const count = countMap.get(t.id);
              if (count !== undefined && count > 0) {
                t.participants_count = count;
                t.has_results        = true;
              }
            }
          }

          setDbData(normalized);
          setSource('supabase');
          setLoading(false);
          return;
        }
        if (timedOut) console.warn('[useTournaments] Supabase timeout → fallback local');
        if (error)    console.warn('[useTournaments] Supabase error:', error, '→ fallback local');
      }

      setDbData(null);
      setSource('local');
      setLoading(false);
    }
    load();
  }, []);

  const tournaments = useMemo<TournamentData[]>(() => {
    let result: TournamentData[] = dbData ?? (MPL_TOURNAMENTS as TournamentData[]);

    if (filters?.region   && filters.region   !== 'all') result = result.filter(t => t.region   === filters.region);
    if (filters?.category && filters.category !== 'all') {
      if (filters.category === 'JUNIOR') {
        // JUNIOR regroupe U11, U13, U15 et les anciennes valeurs Supabase U10, U12, U14.
        result = result.filter(t =>
          t.category === 'JUNIOR' || ['U11','U13','U15','U10','U12','U14'].includes(t.category) ||
          t.type === 'JUNIOR'
        );
      } else {
        result = result.filter(t => t.category === filters.category);
      }
    }
    if (filters?.division && filters.division !== 'all') {
      if      (filters.division === 'mixed')  result = result.filter(t => t.type === 'MIXED');
      else if (filters.division === 'junior') result = result.filter(t => t.type === 'JUNIOR');
      else if (filters.division === 'men')    result = result.filter(t => t.type === 'MEN');
      else if (filters.division === 'women')  result = result.filter(t => t.type === 'WOMEN');
    }
    if (filters?.status   && filters.status   !== 'all') result = result.filter(t => t.status   === filters.status);
    if (filters?.club_id)                                result = result.filter(t => t.club_id  === filters.club_id);
    if (filters?.month    && filters.month    !== 'all') {
      result = result.filter(t => t.date && t.date.slice(5, 7) === filters.month);
    }
    return result;
  }, [dbData, filters?.region, filters?.category, filters?.division, filters?.status, filters?.month, filters?.club_id]);

  return { tournaments, loading, source };
}

// ── useTournamentStats ────────────────────────────────────────────────────────
export function useTournamentStats() {
  const { tournaments } = useTournaments();
  return useMemo(() => ({
    total:     tournaments.length,
    upcoming:  tournaments.filter(t => t.status === 'upcoming').length,
    completed: tournaments.filter(t => t.status === 'completed').length,
    open:      tournaments.filter(t => t.status === 'open').length,
    byRegion:  {
      Nord:   tournaments.filter(t => t.region === 'Nord').length,
      Ouest:  tournaments.filter(t => t.region === 'Ouest').length,
      Centre: tournaments.filter(t => t.region === 'Centre').length,
      Est:    tournaments.filter(t => t.region === 'Est').length,
      Sud:    tournaments.filter(t => t.region === 'Sud').length,
    },
  }), [tournaments]);
}

// ── useClubTournaments ────────────────────────────────────────────────────────
export function useClubTournaments(clubId: string) {
  return useTournaments({ club_id: clubId });
}

// ── useRankings ───────────────────────────────────────────────────────────────
// Priorité : 1) Supabase table `rankings`  2) CSV public  3) données mock locales
// Même logique que RankingsAdminPage : charge tout sans filtre SQL, filtre côté JS
interface SimpleRanking {
  rank: number;
  rank_before?: number;
  name: string;
  points: number;
  tournaments_played?: number;
  trend?: 'up' | 'down' | 'same';
  season?: number;
  updated_at?: string;
}
export type { SimpleRanking };

function asTrend(value: unknown): 'up' | 'down' | 'same' {
  return value === 'up' || value === 'down' || value === 'same' ? value : 'same';
}

function trendFromRanks(rank: unknown, rankBefore: unknown, fallback: unknown): 'up' | 'down' | 'same' {
  const current = Number(rank ?? 0);
  const previous = Number(rankBefore ?? 0);
  if (Number.isFinite(current) && Number.isFinite(previous) && current > 0 && previous > 0) {
    if (current < previous) return 'up';
    if (current > previous) return 'down';
    return 'same';
  }
  return asTrend(fallback);
}

/** Normalise la valeur division stockée en DB vers une valeur canonique */
function normDivision(raw: string | null | undefined): string {
  const v = (raw ?? '').toUpperCase().trim();
  if (v === 'MIXED' || v === 'MIXTE') return 'MIXTE';
  if (v === 'WOMEN') return 'WOMEN';
  if (v === 'JUNIOR') return 'JUNIOR';
  return 'MEN';
}

/** Retourne la valeur normalisée attendue pour une division hook */
function hookDivToNorm(division: 'men' | 'women' | 'junior' | 'mixed'): string {
  if (division === 'mixed')  return 'MIXTE';
  if (division === 'women')  return 'WOMEN';
  if (division === 'junior') return 'JUNIOR';
  return 'MEN';
}

export function useRankings(division: 'men' | 'women' | 'junior' | 'mixed') {
  const [rankings, setRankings] = useState<SimpleRanking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [source, setSource]     = useState<DataSource>('local');
  // refreshTick monte chaque fois que l'admin modifie un classement
  const [refreshTick, setRefreshTick] = useState(0);

  // Écoute les mises à jour de classements :
  // • CustomEvent  = même onglet (admin modifie et public est dans le même tab)
  // • BroadcastChannel = onglets différents (admin dans tab A, public dans tab B)
  // • storage event = fallback universel cross-tab
  useEffect(() => {
    const handleUpdate = (div?: string) => {
      if (!div || div === division) {
        setRefreshTick(t => t + 1);
      }
    };

    // Same-tab event
    const localHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { division?: string };
      handleUpdate(detail?.division);
    };
    window.addEventListener('mpl:rankings:updated', localHandler);

    // Cross-tab via BroadcastChannel
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('mpl_rankings_update');
      bc.onmessage = (e: MessageEvent<{ division?: string }>) => {
        handleUpdate(e.data?.division);
      };
    } catch {
      // BroadcastChannel non supporté (très vieux navigateurs)
    }

    // Cross-tab via storage event (fallback universel)
    const storageHandler = (e: StorageEvent) => {
      if (e.key === 'mpl_rankings_updated') {
        try {
          const data = JSON.parse(e.newValue ?? '{}') as { division?: string };
          handleUpdate(data.division);
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', storageHandler);

    return () => {
      window.removeEventListener('mpl:rankings:updated', localHandler);
      window.removeEventListener('storage', storageHandler);
      bc?.close();
    };
  }, [division]);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const sbUrl = getSupabaseRestUrl();
      const sbKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
      const hasValidKey = !!(sbUrl && sbKey && sbKey !== 'VOTRE_ANON_KEY_ICI');
      const normTarget = hookDivToNorm(division);
      const dbDivision = division;

      async function enrichWithOfficialDetails(baseRows: SimpleRanking[]): Promise<SimpleRanking[]> {
        if (!baseRows.length) return baseRows;

        const detailCounts = new Map<string, number>();
        const officialMeta = new Map<string, { trend?: 'up' | 'down' | 'same'; tournaments_played?: number }>();

        try {
          let detailsOffset = 0;
          const PAGE = 1000;
          for (;;) {
            const params = new URLSearchParams({
              select: 'player_name,division',
              division: `eq.${dbDivision}`,
              limit: String(PAGE),
              offset: String(detailsOffset),
            });
            const res = await fetch(`${sbUrl}/official_ranking_details?${params}`, {
              headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Accept': 'application/json' },
            });
            if (!res.ok) break;
            const batch = await res.json() as Record<string, unknown>[];
            if (!Array.isArray(batch) || !batch.length) break;
            for (const row of batch) {
              const name = String(row.player_name ?? '').trim().toLowerCase();
              if (name) detailCounts.set(name, (detailCounts.get(name) ?? 0) + 1);
            }
            if (batch.length < PAGE) break;
            detailsOffset += PAGE;
          }
        } catch {
          // La table de details est optionnelle tant que le SQL n'a pas ete execute.
        }

        try {
          let metaOffset = 0;
          const PAGE = 1000;
          for (;;) {
            const params = new URLSearchParams({
            select: 'player_name,division,rank,rank_before,tournaments_played,trend,is_current',
              division: `eq.${dbDivision}`,
              is_current: 'eq.true',
              limit: String(PAGE),
              offset: String(metaOffset),
            });
            const res = await fetch(`${sbUrl}/official_rankings?${params}`, {
              headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Accept': 'application/json' },
            });
            if (!res.ok) break;
            const batch = await res.json() as Record<string, unknown>[];
            if (!Array.isArray(batch) || !batch.length) break;
            for (const row of batch) {
              const name = String(row.player_name ?? '').trim().toLowerCase();
              if (!name) continue;
              officialMeta.set(name, {
                trend: trendFromRanks(row.rank, row.rank_before, row.trend),
                tournaments_played: Number(row.tournaments_played ?? 0),
              });
            }
            if (batch.length < PAGE) break;
            metaOffset += PAGE;
          }
        } catch {
          // On garde les donnees rankings si official_rankings n'est pas complet.
        }

        return baseRows.map(row => {
          const key = row.name.trim().toLowerCase();
          const meta = officialMeta.get(key);
          const detailCount = detailCounts.get(key) ?? 0;
          return {
            ...row,
            tournaments_played: detailCount || meta?.tournaments_played || row.tournaments_played || 0,
            trend: row.trend && row.trend !== 'same' ? row.trend : meta?.trend ?? row.trend ?? 'same',
          };
        });
      }

      // ── 1️⃣ Supabase table `rankings` — même stratégie que RankingsAdminPage ──
      // Charge TOUT sans filtre SQL (pagination par tranches de 1000), filtre côté JS
      // → insensible à la casse exacte stockée en DB
      if (hasValidKey) {
        try {
          const officialParams = new URLSearchParams({
            select: 'player_name,rank,rank_before,points,division,tournaments_played,trend,season,batch_id,created_at',
            division: `eq.${dbDivision}`,
            order: 'created_at.desc,rank.asc',
            limit: '5000',
          });
          const officialRes = await fetch(`${sbUrl}/official_rankings?${officialParams}`, {
            headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Accept': 'application/json' },
          });
          if (officialRes.ok) {
            const officialRows = await officialRes.json() as Record<string, unknown>[];
            if (Array.isArray(officialRows) && officialRows.length > 0) {
              const latestBatchId = String(officialRows.find(row => row.batch_id)?.batch_id ?? '');
              const latestCreatedAt = String(officialRows[0]?.created_at ?? '');
              const currentRows = latestBatchId
                ? officialRows.filter(row => String(row.batch_id ?? '') === latestBatchId)
                : officialRows.filter(row => String(row.created_at ?? '').slice(0, 16) === latestCreatedAt.slice(0, 16));
              const officialSorted = currentRows
                .sort((a, b) => Number(a.rank ?? 9999) - Number(b.rank ?? 9999))
                .map(r => ({
                  rank:               Number(r.rank ?? 0),
                  rank_before:        Number(r.rank_before ?? r.rank ?? 0),
                  name:               String(r.player_name ?? '').trim(),
                  points:             Number(r.points ?? 0),
                  tournaments_played: Number(r.tournaments_played ?? 0),
                  trend:              trendFromRanks(r.rank, r.rank_before, r.trend),
                  season:             Number(r.season ?? 2026),
                  updated_at:         r.created_at as string | undefined,
                }))
                .filter(r => r.name);
              if (officialSorted.length) {
                console.log(`[useRankings] ✅ official_rankings: ${officialSorted.length} joueurs (${division})`);
                setRankings(await enrichWithOfficialDetails(officialSorted));
                setSource('supabase');
                setLoading(false);
                return;
              }
            }
          }

          const allRows: Record<string, unknown>[] = [];
          let offset = 0;
          const PAGE = 1000;
          for (;;) {
            const controller = new AbortController();
            const tId = setTimeout(() => controller.abort(), 12000);
            const params = new URLSearchParams({
              select: 'player_name,rank,rank_before,points,division,tournaments_played,trend,season,updated_at',
              order: 'division,rank',
              limit: String(PAGE),
              offset: String(offset),
            });
            const res = await fetch(`${sbUrl}/rankings?${params}`, {
              signal: controller.signal,
              headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Accept': 'application/json' },
            });
            clearTimeout(tId);
            if (!res.ok) { console.warn(`[useRankings] rankings HTTP ${res.status}`); break; }
            const batch = await res.json() as Record<string, unknown>[];
            if (!Array.isArray(batch) || !batch.length) break;
            allRows.push(...batch);
            if (batch.length < PAGE) break;
            offset += PAGE;
          }

          if (allRows.length) {
            // Filtre côté JS — insensible à la casse
            const filtered = allRows.filter(r => normDivision(r.division as string) === normTarget);
            if (filtered.length) {
              const sorted = filtered
                .sort((a, b) => Number(a.rank ?? 9999) - Number(b.rank ?? 9999))
                .map(r => ({
                  rank:               Number(r.rank ?? 0),
                  rank_before:        Number(r.rank_before ?? r.rank ?? 0),
                  name:               String(r.player_name ?? '').trim(),
                  points:             Number(r.points ?? 0),
                  tournaments_played: Number(r.tournaments_played ?? 0),
                  trend:              trendFromRanks(r.rank, r.rank_before, r.trend),
                  season:             Number(r.season ?? 2026),
                  updated_at:         r.updated_at as string | undefined,
                }))
                .filter(r => r.name);
              if (sorted.length) {
                const enriched = await enrichWithOfficialDetails(sorted);
                console.log(`[useRankings] ✅ Supabase rankings: ${sorted.length} joueurs (${division})`);
                setRankings(enriched);
                setSource('supabase');
                setLoading(false);
                return;
              }
            }
            console.warn(`[useRankings] rankings: division "${normTarget}" absente (${allRows.length} lignes totales) → fallback tournament_results`);
          }

          // ── Fallback interne : tournament_results agrégé (si rankings vide) ──
          const divVariants = division === 'mixed'
            ? ['mixte', 'mixed', 'MIXTE', 'MIXED', 'Mixte']
            : [division, division.toUpperCase(), division.charAt(0).toUpperCase() + division.slice(1)];
          const trRows: Record<string, unknown>[] = [];
          let trOffset = 0;
          for (;;) {
            const controller = new AbortController();
            const tId = setTimeout(() => controller.abort(), 10000);
            const res = await fetch(
              `${sbUrl}/tournament_results?select=player1_name,player2_name,points,division&division=in.(${divVariants.join(',')})&order=points.desc&limit=1000&offset=${trOffset}`,
              { signal: controller.signal, headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Accept': 'application/json' } }
            );
            clearTimeout(tId);
            if (!res.ok) break;
            const batch = await res.json() as Record<string, unknown>[];
            if (!Array.isArray(batch) || !batch.length) break;
            trRows.push(...batch);
            if (batch.length < 1000) break;
            trOffset += 1000;
          }
          if (trRows.length) {
            const pts: Record<string, number> = {};
            for (const r of trRows) {
              const p = Number(r.points ?? 0);
              for (const k of ['player1_name', 'player2_name'] as const) {
                const n = String(r[k] ?? '').trim();
                if (n) pts[n] = (pts[n] ?? 0) + p;
              }
            }
            const sorted2 = Object.entries(pts).sort(([,a],[,b]) => b-a)
              .map(([name, points], i) => ({ rank: i+1, name, points }));
            if (sorted2.length) {
              console.log(`[useRankings] ✅ Supabase tournament_results fallback: ${sorted2.length} joueurs (${division})`);
              setRankings(sorted2);
              setSource('supabase');
              setLoading(false);
              return;
            }
          }
          console.warn(`[useRankings] Supabase vide pour ${division} → CSV`);
        } catch (e) {
          console.warn('[useRankings] Supabase erreur:', e);
        }
      } else {
        console.info(`[useRankings] Pas de clé Supabase valide → CSV puis bundle`);
      }

      // 2️⃣ CSV public (fichiers /public/rankings_2026_*.csv)
      const csvData = await fetchPublicCsv(division);
      if (csvData && csvData.length > 0) {
        setRankings(csvData);
        setSource('csv');
        setLoading(false);
        return;
      }

      // 3️⃣ Données COMPLÈTES bundlées (1131/494/330/37 joueurs)
      const fullMap: Record<string, { rank: number; player_name: string; points: number }[]> = {
        men:    FULL_RANKINGS_MEN,
        women:  FULL_RANKINGS_WOMEN,
        junior: FULL_RANKINGS_JUNIOR,
        mixed:  FULL_RANKINGS_MIXED,
      };
      const full = (fullMap[division] ?? []).map(r => ({
        rank: r.rank, name: r.player_name, points: r.points,
      }));
      setRankings(full);
      setSource('local');
      setLoading(false);
    }
    load();
  }, [division, refreshTick]);

  return { rankings, loading, source };
}
