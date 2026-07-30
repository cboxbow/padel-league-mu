import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Medal, Search, Users, Calendar, MapPin, ChevronDown, ChevronUp, RefreshCw, ExternalLink } from 'lucide-react';
import { DotWaveBackground } from '@/components/DotWaveBackground';
import { Layout, GlassCard } from '@/components/Layout';
import { getSupabaseClient, isSupabaseConnected, safeSupabaseQuery } from '@/lib/supabase';
import { ROUTE_PATHS } from '@/lib/index';
import { normalizeJuniorCategory, normalizeTournamentDisplayName } from '@/lib/tournamentNames';
import { useSeo } from '@/hooks/useSeo';

// ─────────────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface TournamentResult {
  id: string;
  tournament_id: string;
  tournament_name: string;
  tournament_date: string;
  category: string;
  division: string;
  region: string;
  club_name: string;
  rank: number;
  team_name: string;
  player1_name: string;
  player2_name: string;
  points: number;
}

interface HistoricalTournamentResult {
  id: string;
  event_key: string;
  event_name: string;
  event_year: number;
  season: number;
  category: string;
  division: string;
  junior_category?: string | null;
  club_name: string;
  event_date?: string | null;
  region?: string | null;
  rank_label?: string | null;
  rank_min?: number | null;
  rank_max?: number | null;
  team_name?: string | null;
  player1_name: string;
  player2_name: string;
  points: number;
}

interface TournamentGroup {
  key: string;
  tournament_id: string;
  tournament_name: string;
  tournament_date: string;
  category: string;
  region: string;
  club_name: string;
  divisions: {
    division: string;
    results: TournamentResult[];
  }[];
}

// Les anciens résultats de démonstration ont été retirés: cette page affiche uniquement les données live.
const RESULT_COLUMNS = [
  'id',
  'tournament_id',
  'tournament_name',
  'tournament_date',
  'category',
  'division',
  'region',
  'club_name',
  'rank',
  'team_name',
  'player1_name',
  'player2_name',
  'points',
].join(',');

const HISTORICAL_RESULT_COLUMNS = [
  'id',
  'event_key',
  'event_name',
  'event_year',
  'season',
  'category',
  'division',
  'junior_category',
  'club_name',
  'event_date',
  'region',
  'rank_label',
  'rank_min',
  'rank_max',
  'team_name',
  'player1_name',
  'player2_name',
  'points',
].join(',');

function supabaseErrorMessage(error: unknown): string {
  if (!error) return 'Erreur inconnue';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  const record = error as Record<string, unknown>;
  return String(record.message ?? record.details ?? record.hint ?? JSON.stringify(record));
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const DIVISION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  men:    { label: 'Hommes',  color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  women:  { label: 'Dames',   color: '#f472b6', bg: 'rgba(244,114,182,0.12)' },
  mixed:  { label: 'Mixte',   color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  junior: { label: 'Junior',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
};

const CATEGORY_COLORS: Record<string, string> = {
  M25: '#6b7280', M50: '#10b981', M100: '#3b82f6',
  M250: '#8b5cf6', M500: '#f59e0b', M1000: '#ef4444',
};

function rankMedal(rank: number) {
  if (rank === 1) return { emoji: '🥇', color: '#f59e0b' };
  if (rank === 2) return { emoji: '🥈', color: '#94a3b8' };
  if (rank === 3) return { emoji: '🥉', color: '#cd7c2f' };
  return { emoji: `#${rank}`, color: '#6b7280' };
}

function formatDate(d: string): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return d; }
}

function searchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeClubName(value: unknown): string {
  const name = cleanText(value);
  if (!name) return '';
  return name
    .replace(/Ca\?a|Ca\u00f1a|CANA/gi, 'Ca\u00f1a')
    .replace(/Isla Padel de Beau Plan/gi, 'Isla Padel Beau Plan')
    .replace(/Labourdonnais Sports Club|LAB SPORTS CLUB/gi, 'Labourdonnais Mapou')
    .replace(/RM\s*Forbach|RM Club Grand Baie\s*\(Forbach\)|Grand Baie\s*\(Forbach\)/gi, 'RM Club Grand Baie')
    .replace(/I Padel RM/gi, 'I Padel by RM')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDivision(value: unknown, category?: unknown): string {
  const raw = cleanText(value).toLowerCase();
  if (['men', 'hommes', 'h', 'mens'].includes(raw)) return 'men';
  if (['women', 'dames', 'femmes', 'w'].includes(raw)) return 'women';
  if (['mixed', 'mixte'].includes(raw)) return 'mixed';
  if (['junior', 'juniors'].includes(raw)) return 'junior';

  const cat = cleanText(category).toUpperCase();
  if (['U11', 'U13', 'U15', 'U10', 'U12', 'U14'].includes(cat)) return 'junior';
  if (cat === 'MIXED') return 'mixed';
  return raw || 'men';
}

function rankNumberFromHistorical(row: HistoricalTournamentResult): number {
  const direct = Number(row.rank_min ?? row.rank_max);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = cleanText(row.rank_label).match(/\d+/);
  return match ? Number(match[0]) : 999;
}

function roundPoints(value: unknown): number {
  return Math.ceil(Number(value) || 0);
}

function playerHistoryPath(name: string): string {
  return `${ROUTE_PATHS.HISTORY}?q=${encodeURIComponent(formatName(name))}`;
}

function mapHistoricalResult(row: HistoricalTournamentResult): TournamentResult {
  const category = normalizeJuniorCategory(row.category || row.junior_category || '');
  const clubName = normalizeClubName(row.club_name);
  const player1 = formatName(row.player1_name ?? '');
  const player2 = formatName(row.player2_name ?? '');

  return {
    id: `historical-${row.id}`,
    tournament_id: row.event_key || `historical-${row.event_year}-${row.event_name}-${clubName}`,
    tournament_name: normalizeTournamentDisplayName(row.event_name || row.event_key || 'Tournoi MPL', clubName),
    tournament_date: row.event_date || `${row.event_year || row.season || 2026}-01-01`,
    category,
    division: normalizeDivision(row.division, category),
    region: cleanText(row.region),
    club_name: clubName,
    rank: rankNumberFromHistorical(row),
    team_name: row.team_name || `${player1} / ${player2}`,
    player1_name: player1,
    player2_name: player2,
    points: roundPoints(row.points),
  };
}

async function fetchHistoricalResults2026(sb: ReturnType<typeof getSupabaseClient>): Promise<TournamentResult[]> {
  if (!sb) return [];
  const pageSize = 1000;
  const allRows: HistoricalTournamentResult[] = [];

  for (let from = 0; from < 6000; from += pageSize) {
    const { data, error } = await sb
      .from('historical_tournament_results')
      .select(HISTORICAL_RESULT_COLUMNS)
      .eq('event_year', 2026)
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('rank_min', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const batch = (data ?? []) as HistoricalTournamentResult[];
    allRows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return allRows.map(mapHistoricalResult).filter(row => row.player1_name || row.player2_name);
}

async function fetchLegacyResults2026(sb: ReturnType<typeof getSupabaseClient>): Promise<TournamentResult[]> {
  if (!sb) return [];
  const { data, error } = await sb.from('tournament_results')
    .select(RESULT_COLUMNS)
    .order('tournament_date', { ascending: false })
    .order('rank', { ascending: true })
    .limit(5000);

  if (error) throw error;
  return (data ?? []) as TournamentResult[];
}

/** Convertit un nom en format Prénom Nom (première lettre de chaque mot en majuscule)
 *  Gère les cas: "NICOLAS DE CARITAT" → "Nicolas De Caritat"
 *  et laisse intact si déjà bien formaté */
/** Formate un nom de joueur depuis Supabase (CamelCase ou tout-majuscules ou normal)
 *  "MaxSchaffo"        → "Max Schaffo"
 *  "JeanMarieSylvain"  → "Jean Marie Sylvain"
 *  "NICOLAS DURAND"    → "Nicolas Durand"
 *  "Nicolas Durand"    → "Nicolas Durand" (inchangé)
 */
function formatName(raw: string): string {
  if (!raw) return '';
  // 1. CamelCase : insérer espace avant chaque majuscule précédée d'une minuscule
  const step1 = raw.replace(/([a-z])([A-Z])/g, '$1 $2');
  // 2. Title case sur chaque mot séparé
  return step1
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Rendu premium d'un nom : prénom en gris clair + NOM en blanc gras */
function PremiumName({ name, podium }: { name: string; podium: boolean }) {
  const formatted = formatName(name);
  const parts = formatted.trim().split(' ');
  // Dernier mot = NOM DE FAMILLE (majuscules), reste = prénom(s)
  const lastName  = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : formatted.toUpperCase();
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '5px' }}>
      {firstName && (
        <span style={{ fontSize: '11px', fontWeight: 500, color: podium ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.4)', letterSpacing: '0.2px' }}>
          {firstName}
        </span>
      )}
      <span style={{ fontSize: '13px', fontWeight: 800, color: podium ? 'white' : 'rgba(255,255,255,0.9)', letterSpacing: '0.3px' }}>
        {lastName}
      </span>
    </span>
  );
}
/** Normalise un nom de tournoi pour le groupement : retire les parenthèses,
 *  met en minuscules, retire les espaces — ex: "Azuri M100 (Dames)" → "azurim100" */
function normalizeTournName(name: string): string {
  return name.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').replace(/[^a-z0-9]/g, '');
}

function groupByTournament(results: TournamentResult[]): TournamentGroup[] {
  const map = new Map<string, TournamentGroup>();
  // Table de résolution : normKey → key retenu (premier vu)
  const normToKey = new Map<string, string>();

  for (const r of results) {
    // Clé normalisée : category + club_name + date (robuste aux variations de nom)
    const normKey = `${r.category}__${(r.club_name ?? '').toLowerCase().replace(/\s/g,'')}__${r.tournament_date}`;
    // Clé d'affichage (stable = premier nom rencontré pour ce normKey)
    let key = normToKey.get(normKey);
    if (!key) {
      // Préférer le nom le plus court / sans parenthèses
      key = `${normalizeTournName(r.tournament_name)}__${r.tournament_date}`;
      normToKey.set(normKey, key);
    }

    if (!map.has(key)) {
      map.set(key, {
        key,
        tournament_id: r.tournament_id,
        tournament_name: normalizeTournamentDisplayName(r.tournament_name, r.club_name),
        tournament_date: r.tournament_date,
        category: r.category,
        region: r.region,
        club_name: r.club_name,
        divisions: [],
      });
    }
    const grp = map.get(key)!;
    // Garder le nom le plus court (sans "(Dames)" etc.)
    if (r.tournament_name.length < grp.tournament_name.length) {
      grp.tournament_name = normalizeTournamentDisplayName(r.tournament_name, r.club_name);
    }
    let div = grp.divisions.find(d => d.division === r.division);
    if (!div) { div = { division: r.division, results: [] }; grp.divisions.push(div); }
    div.results.push(r);
  }
  // Trier les divisions (men → women → mixed → junior)
  const divOrder = ['men', 'women', 'mixed', 'junior'];
  for (const grp of map.values()) {
    grp.divisions.sort((a, b) => divOrder.indexOf(a.division) - divOrder.indexOf(b.division));
    for (const d of grp.divisions) d.results.sort((a, b) => a.rank - b.rank);
  }
  return Array.from(map.values()).sort((a, b) =>
    new Date(b.tournament_date).getTime() - new Date(a.tournament_date).getTime()
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMPOSANT CARTE D'UN TOURNOI
// ─────────────────────────────────────────────────────────────────────────────
function TournamentCard({ group, filterDiv = 'all', initialOpen = false }: { group: TournamentGroup; filterDiv?: string; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const navigate = useNavigate();
  const catColor = CATEGORY_COLORS[group.category] ?? '#4ad569';

  // Filtrer les divisions à afficher selon le filtre actif
  const visibleDivisions = filterDiv === 'all'
    ? group.divisions
    : group.divisions.filter(d => d.division === filterDiv);

  return (
    <GlassCard style={{ padding: 0, overflow: 'hidden', marginBottom: '20px' }}>
      {/* En-tête du tournoi */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '20px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, flexWrap: 'wrap' }}>
          {/* Badge catégorie */}
          <span style={{
            background: `${catColor}20`, color: catColor,
            border: `1px solid ${catColor}40`, borderRadius: '8px',
            padding: '4px 12px', fontWeight: 800, fontSize: '13px', whiteSpace: 'nowrap',
          }}>
            {group.category}
          </span>
          {/* Nom — supprimer les suffixes (Dames)/(Hommes)/(Women)/(Men) du titre principal */}
          <span style={{ color: 'white', fontWeight: 700, fontSize: '18px', textAlign: 'left' }}>
            {group.tournament_name.replace(/\s*\((Dames|Hommes|Women|Men|Femmes)\)\s*/gi, '').trim()}
          </span>
          {/* Infos */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ color: '#888', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={13} /> {formatDate(group.tournament_date)}
            </span>
            <span style={{ color: '#888', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={13} /> {group.region}
            </span>
            {group.club_name && (
              <span style={{ color: '#888', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Users size={13} /> {group.club_name}
              </span>
            )}
          </div>
          {/* Pills divisions */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {group.divisions.map(d => {
              const cfg = DIVISION_CONFIG[d.division] ?? { label: d.division, color: '#aaa', bg: 'rgba(170,170,170,0.1)' };
              return (
                <span key={d.division} style={{
                  background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40`,
                  borderRadius: '20px', padding: '2px 10px', fontSize: '12px', fontWeight: 600,
                }}>
                  {cfg.label}
                </span>
              );
            })}
          </div>
        </div>
        <div style={{ color: '#666', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Lien vers le Calendrier */}
          <span
            onClick={e => { e.stopPropagation(); navigate(`${ROUTE_PATHS.CALENDAR}?q=${encodeURIComponent(group.tournament_name)}`); }}
            title="Voir dans le Calendrier"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'rgba(74,213,105,0.08)', color: '#4ad569',
              border: '1px solid rgba(74,213,105,0.2)',
              borderRadius: '8px', padding: '5px 10px',
              fontSize: '11px', fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.15s', whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,213,105,0.18)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(74,213,105,0.08)')}
          >
            <Calendar size={12} /> Calendrier <ExternalLink size={10} />
          </span>
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {/* Résultats dépliables */}
      {open && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '0 24px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(320px, 1fr))`, gap: '20px', paddingTop: '20px' }}>
            {visibleDivisions.map(div => {
              const cfg = DIVISION_CONFIG[div.division] ?? { label: div.division, color: '#aaa', bg: 'rgba(170,170,170,0.1)' };
              return (
                <div key={div.division}>
                  {/* Titre division */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    marginBottom: '12px', paddingBottom: '8px',
                    borderBottom: `1px solid ${cfg.color}30`,
                  }}>
                    <Medal size={16} color={cfg.color} />
                    <span style={{ color: cfg.color, fontWeight: 700, fontSize: '15px' }}>{cfg.label}</span>
                    <span style={{ color: '#555', fontSize: '12px', marginLeft: 'auto' }}>
                      {div.results.length} paires
                    </span>
                  </div>

                  {/* Tableau résultats */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {div.results.map(r => {
                      const medal = rankMedal(r.rank);
                      const isPodium = r.rank <= 3;
                      return (
                        <div key={r.id} style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '10px 14px',
                          background: isPodium ? `${cfg.color}08` : 'rgba(255,255,255,0.02)',
                          borderRadius: '10px',
                          border: isPodium ? `1px solid ${cfg.color}20` : '1px solid transparent',
                          transition: 'background 0.15s',
                        }}>
                          {/* Rang */}
                          <div style={{
                            minWidth: '36px', textAlign: 'center',
                            fontSize: r.rank <= 3 ? '18px' : '13px',
                            fontWeight: 800,
                            color: medal.color,
                          }}>
                            {r.rank <= 3 ? medal.emoji : `#${r.rank}`}
                          </div>

                          {/* Joueurs — rendu premium */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', lineHeight: 1.5 }}>
                              <button type="button" onClick={() => navigate(playerHistoryPath(r.player1_name))} title="Voir le profil historique" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                                <PremiumName name={r.player1_name} podium={isPodium} />
                              </button>
                              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', fontWeight: 300 }}>?</span>
                              <button type="button" onClick={() => navigate(playerHistoryPath(r.player2_name))} title="Voir le profil historique" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                                <PremiumName name={r.player2_name} podium={isPodium} />
                              </button>
                            </div>
                          </div>

                          {/* Points */}
                          <div style={{
                            textAlign: 'right', flexShrink: 0,
                          }}>
                            <span style={{
                              background: `${catColor}18`, color: catColor,
                              border: `1px solid ${catColor}30`,
                              borderRadius: '8px', padding: '3px 10px',
                              fontWeight: 700, fontSize: '13px',
                            }}>
                              +{r.points} pts
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE PRINCIPALE
// ─────────────────────────────────────────────────────────────────────────────
export default function Resultats() {
  useSeo({
    title: "Résultats Tournois Padel Maurice 2026 — MPL",
    description: "Résultats complets des tournois de padel à Maurice 2026. Classements par tournoi, équipes, scores. Mauritius Padel League.",
    keywords: "resultats padel mauritius, padel results mauritius, scores padel MPL 2026",
    canonical: "https://padelleague.mu/#/resultats",
  });
  const navigate = useNavigate();
  const [allResults, setAllResults]   = useState<TournamentResult[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [fromSupabase, setFromSupabase] = useState(false);

  // Filtres
  const [search, setSearch]           = useState('');
  const [filterDiv, setFilterDiv]     = useState('all');
  const [filterCat, setFilterCat]     = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');

  const load = async () => {
    setLoading(true); setError('');
    const sb = getSupabaseClient();
    if (isSupabaseConnected() && sb) {
      const { data, error: err, timedOut } = await safeSupabaseQuery<TournamentResult[]>(async () => {
        try {
          const historical = await fetchHistoricalResults2026(sb);
          if (historical.length > 0) return { data: historical, error: null };
        } catch (historyError) {
          console.warn('[Resultats] Historical Supabase error, fallback legacy:', historyError);
        }

        try {
          const legacy = await fetchLegacyResults2026(sb);
          return { data: legacy, error: null };
        } catch (legacyError) {
          return { data: null, error: legacyError };
        }
      }, 20000);
      if (timedOut) {
        setError('Connexion live temporairement indisponible. Réessayez dans quelques instants.');
        setAllResults([]);
        setFromSupabase(false);
      } else if (err) {
        console.warn('[Resultats] Supabase error:', err);
        setError(`Connexion live temporairement indisponible: ${supabaseErrorMessage(err)}`);
        setAllResults([]);
        setFromSupabase(false);
      } else if (data && data.length > 0) {
        // ── Normalisation division depuis Supabase ──────────────────────────
        // Certains résultats ont tournament_type/category au lieu de division='junior'
        // → on normalise pour que tous les filtres fonctionnent correctement
        const normalized = (data as TournamentResult[]).map(r => {
          let div = (r.division ?? '').toLowerCase().trim();
          // Si division manquante ou invalide, déduire depuis category ou tournament_type
          if (!div || !['men','women','mixed','junior'].includes(div)) {
            const cat  = (r.category ?? '').toUpperCase();
            const type = ((r as unknown as Record<string,unknown>).tournament_type as string ?? '').toUpperCase();
            if (type === 'JUNIOR' || cat === 'U11' || cat === 'U13' || cat === 'U15' || cat === 'U10' || cat === 'U12' || cat === 'U14') {
              div = 'junior';
            } else if (type === 'MIXED' || cat === 'MIXED') {
              div = 'mixed';
            } else if (type === 'WOMEN' || type === 'DAMES') {
              div = 'women';
            } else if (type === 'MEN' || type === 'HOMMES') {
              div = 'men';
            } else if (type === 'MEN&WOMEN' || type === 'MEN&WOMEN') {
              // MEN&WOMEN → garder la valeur existante ou mettre 'men' par défaut
              div = div || 'men';
            }
          }
          return {
            ...r,
            category: normalizeJuniorCategory(r.category),
            tournament_name: normalizeTournamentDisplayName(r.tournament_name, r.club_name),
            division: div || r.division,
            // Normaliser les noms collés depuis Supabase
            player1_name: formatName(r.player1_name ?? ''),
            player2_name: formatName(r.player2_name ?? ''),
          };
        });
        setAllResults(normalized);
        setFromSupabase(true);
      } else {
        setAllResults([]);
        setFromSupabase(false);
      }
    } else {
      setError('Connexion live indisponible. Les résultats seront affichés dès que Supabase sera joignable.');
      setAllResults([]);
      setFromSupabase(false);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Grouper par tournoi
  const groups = useMemo(() => {
    let filtered = allResults;
    if (search.trim()) {
      const q = searchText(search);
      filtered = filtered.filter(r =>
        searchText(r.tournament_name).includes(q) ||
        searchText(r.player1_name).includes(q) ||
        searchText(r.player2_name).includes(q) ||
        searchText(r.club_name).includes(q) ||
        searchText(r.team_name).includes(q)
      );
    }
    if (filterDiv !== 'all')    filtered = filtered.filter(r => r.division === filterDiv);
    if (filterCat !== 'all')    filtered = filtered.filter(r => r.category === filterCat);
    if (filterRegion !== 'all') filtered = filtered.filter(r => r.region === filterRegion);
    return groupByTournament(filtered);
  }, [allResults, search, filterDiv, filterCat, filterRegion]);

  // Statistiques globales
  const stats = useMemo(() => {
    const eventGroups = groupByTournament(allResults);
    const byDiv = (div: string) => eventGroups.filter(group => group.divisions.some(item => item.division === div)).length;
    return {
      tournaments: eventGroups.length,
      men:    byDiv('men'),
      women:  byDiv('women'),
      mixed:  byDiv('mixed'),
      junior: byDiv('junior'),
      entries: allResults.length,
    };
  }, [allResults]);

  const cats    = useMemo(() => [...new Set(allResults.map(r => r.category))].sort(), [allResults]);
  const regions = useMemo(() => [...new Set(allResults.map(r => r.region).filter(Boolean))].sort(), [allResults]);
  const unavailable = !!error && !loading && allResults.length === 0;

  const selStyle: React.CSSProperties = {
    background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '10px', padding: '9px 14px', color: 'white', fontSize: '13px',
    outline: 'none', cursor: 'pointer',
    colorScheme: 'dark',
  };

  return (
    <Layout>
      <section style={{ padding: '72px 24px 80px', minHeight: '80vh', position: 'relative', overflowX: 'auto', background: 'linear-gradient(180deg, #0a0a0a 0%, #0c0c0c 100%)' }}>
        <DotWaveBackground variant="corner-tl" opacity={0.08} animate={false} />
        <div style={{ position: 'absolute', top: 64, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(74,213,105,0.15) 50%, transparent 100%)' }} />
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>

          {/* ── En-tête ── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Trophy size={28} color="#4ad569" />
                <h1 style={{ fontSize: 'clamp(24px,4vw,42px)', fontWeight: 900, color: 'white', margin: 0 }}>
                  Résultats
                </h1>
                <span style={{
                  background: fromSupabase ? 'rgba(74,213,105,0.15)' : 'rgba(239,68,68,0.1)',
                  color: fromSupabase ? '#4ad569' : '#ef4444',
                  border: `1px solid ${fromSupabase ? 'rgba(74,213,105,0.3)' : 'rgba(239,68,68,0.25)'}`,
                  borderRadius: '20px', padding: '3px 12px', fontSize: '12px', fontWeight: 600,
                }}>
                  {fromSupabase ? '● Supabase' : '● Live indisponible'}
                </span>
              </div>
              <p style={{ color: '#888', fontSize: '15px', margin: 0 }}>
                Saison 2026 · Tous les tournois disputés
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={() => navigate(ROUTE_PATHS.HISTORY)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'rgba(74,213,105,0.08)', border: '1px solid rgba(74,213,105,0.22)',
                  borderRadius: '10px', padding: '10px 16px', color: '#4ad569',
                  cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                }}
              >
                Archives 2023-2026 <ExternalLink size={12} />
              </button>
              <button
                onClick={load}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', padding: '10px 16px', color: '#a0a0a0',
                  cursor: 'pointer', fontSize: '13px',
                }}
              >
                <RefreshCw size={14} /> Actualiser
              </button>
            </div>
          </div>

          {/* ── Stats chips ── */}
          {!unavailable && <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '28px' }}>
            {[
              { label: 'Tournois',  value: stats.tournaments, color: '#4ad569',  sub: 'saison 2026' },
              { label: 'Hommes',    value: stats.men,          color: '#60a5fa',  sub: 'divisions H' },
              { label: 'Dames',     value: stats.women,        color: '#f472b6',  sub: 'divisions Dames' },
              { label: 'Mixte',     value: stats.mixed,        color: '#a78bfa',  sub: 'mixed' },
              { label: 'Junior',    value: stats.junior,       color: '#4ade80',  sub: 'U11/U13/U15' },
            ].map(s => (
              <div key={s.label} style={{
                background: `${s.color}12`, border: `1px solid ${s.color}30`,
                borderRadius: '12px', padding: '10px 18px', textAlign: 'center', minWidth: '80px',
              }}>
                <div style={{ color: s.color, fontWeight: 800, fontSize: '22px', lineHeight: 1 }}>{s.value}</div>
                <div style={{ color: '#888', fontSize: '12px', marginTop: '2px', fontWeight: 600 }}>{s.label}</div>
                <div style={{ color: '#444', fontSize: '10px', marginTop: '2px' }}>{s.sub}</div>
              </div>
            ))}
            {/* Entrées totales */}
            <div style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px', padding: '10px 18px', textAlign: 'center', minWidth: '80px',
            }}>
              <div style={{ color: '#f59e0b', fontWeight: 800, fontSize: '22px', lineHeight: 1 }}>{stats.entries.toLocaleString('fr-FR')}</div>
              <div style={{ color: '#888', fontSize: '12px', marginTop: '2px', fontWeight: 600 }}>Entrées</div>
              <div style={{ color: '#444', fontSize: '10px', marginTop: '2px' }}>résultats total</div>
            </div>
          </div>}

          {/* ── Erreur ── */}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {/* ── Filtres ── */}
          {!unavailable && <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'center' }}>
            {/* Recherche */}
            <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '200px' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Nom, joueur, club..."
                style={{ ...selStyle, paddingLeft: '36px', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            {/* Division */}
            <select value={filterDiv} onChange={e => setFilterDiv(e.target.value)} style={selStyle}>
              <option value="all">Toutes divisions</option>
              <option value="men">Hommes</option>
              <option value="women">Dames</option>
              <option value="mixed">Mixte</option>
              <option value="junior">Junior</option>
            </select>
            {/* Catégorie */}
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={selStyle}>
              <option value="all">Toutes catégories</option>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {/* Région */}
            <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={selStyle}>
              <option value="all">Toutes régions</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>}

          {/* ── Contenu ── */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#666' }}>
              <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
              <p style={{ margin: 0 }}>Chargement des résultats...</p>
            </div>
          ) : unavailable ? (
            <GlassCard style={{ padding: '60px', textAlign: 'center' }}>
              <Trophy size={40} color="#333" style={{ marginBottom: '12px' }} />
              <p style={{ color: '#d0d0d0', margin: '0 0 8px', fontWeight: 700 }}>
                Résultats temporairement indisponibles
              </p>
              <p style={{ color: '#666', margin: '0 0 20px', fontSize: '14px', lineHeight: 1.6 }}>
                Les données live ne sont pas accessibles pour le moment. Aucune donnée fictive n'est affichée.
              </p>
              <button
                onClick={load}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px', padding: '10px 16px', color: '#a0a0a0',
                  cursor: 'pointer', fontSize: '13px',
                }}
              >
                <RefreshCw size={14} /> Réessayer
              </button>
            </GlassCard>
          ) : groups.length === 0 ? (
            <GlassCard style={{ padding: '60px', textAlign: 'center' }}>
              <Trophy size={40} color="#333" style={{ marginBottom: '12px' }} />
              <p style={{ color: '#666', margin: 0 }}>Aucun résultat trouvé</p>
            </GlassCard>
          ) : (
            <>
              <div style={{ color: '#666', fontSize: '13px', marginBottom: '16px' }}>
                {groups.length} tournoi{groups.length > 1 ? 's' : ''} · résultats du plus récent au plus ancien
              </div>
              {groups.map((g, index) => <TournamentCard key={g.key} group={g} filterDiv={filterDiv} initialOpen={index === 0} />)}
            </>
          )}

        </div>
      </section>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </Layout>
  );
}
