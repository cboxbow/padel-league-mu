import { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, TrendingUp, Medal, RefreshCw, X, CalendarDays } from 'lucide-react';
import { Layout, GlassCard } from '@/components/Layout';
import { DotWaveBackground } from '@/components/DotWaveBackground';
import { useI18n } from '@/hooks/useI18n';
import { useSeo } from '@/hooks/useSeo';
import { useRankings } from '@/hooks/useData';
import { getSupabaseClient, isSupabaseConnected } from '@/lib/supabase';

import {
  FULL_RANKINGS_MEN,
  FULL_RANKINGS_WOMEN,
  FULL_RANKINGS_MIXED,
  FULL_RANKINGS_JUNIOR,
  type RankingEntry,
} from '@/data/fullRankings';

// ── Types ─────────────────────────────────────────────────────────────────────
type Division = 'MEN' | 'WOMEN' | 'JUNIOR' | 'MIXTE';

interface PlayerRanking {
  id?: string;
  rank: number;
  rank_before?: number;
  player_name: string;
  points: number;
  division: Division;
  tournaments_played?: number;
  trend?: 'up' | 'down' | 'same';
  season?: number;
  updated_at?: string;
}

interface PlayerRankingDetail {
  event_name: string;
  points: number;
  season?: number;
  rank?: number;
  team_name?: string;
}


// ── Données complètes bundlées (fallback garanti) ───────────────────────────
// Converties en PlayerRanking pour compatibilité interne
function toLocalRanking(r: RankingEntry, div: Division): PlayerRanking {
  return { rank: r.rank, player_name: r.player_name, points: roundUpPoints(r.points), division: div };
}

const DATA_MAP: Record<Division, PlayerRanking[]> = {
  MEN:    FULL_RANKINGS_MEN.map(r => toLocalRanking(r, 'MEN')),
  WOMEN:  FULL_RANKINGS_WOMEN.map(r => toLocalRanking(r, 'WOMEN')),
  JUNIOR: FULL_RANKINGS_JUNIOR.map(r => toLocalRanking(r, 'JUNIOR')),
  MIXTE:  FULL_RANKINGS_MIXED.map(r => toLocalRanking(r, 'MIXTE')),
};

// ── Onglets de division ───────────────────────────────────────────────────────
const TABS: { key: Division; label_fr: string; label_en: string; color: string; icon: string }[] = [
  { key: 'MEN',   label_fr: 'Hommes', label_en: 'Men',    color: '#3b82f6', icon: '😎' },
  { key: 'WOMEN', label_fr: 'Dames',  label_en: 'Women',  color: '#ec4899', icon: '🌸' },
  { key: 'JUNIOR',label_fr: 'Junior', label_en: 'Junior', color: '#f59e0b', icon: '⭐' },
  { key: 'MIXTE', label_fr: 'Mixte',  label_en: 'Mixed',  color: '#8b5cf6', icon: '🎾' },
];

// ── Médaille ──────────────────────────────────────────────────────────────────
function RankBadge({ rank, color }: { rank: number; color: string }) {
  if (rank === 1) return <span style={{ fontSize: '20px' }}>🥇</span>;
  if (rank === 2) return <span style={{ fontSize: '20px' }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: '20px' }}>🥉</span>;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '28px', height: '28px', borderRadius: '50%',
      background: `${color}18`, color, fontWeight: 800,
      fontSize: '13px', fontFamily: 'JetBrains Mono, monospace',
    }}>
      {rank}
    </span>
  );
}

// ── Initiales ─────────────────────────────────────────────────────────────────
function Initials({ name, color }: { name: string; color: string }) {
  const parts = name.trim().split(/\s+/);
  const ini   = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
      background: `${color}20`, color, fontWeight: 800, fontSize: '13px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.5px',
    }}>
      {ini}
    </div>
  );
}

// ── Tableau classement ────────────────────────────────────────────────────────
// Mapping Division locale (majuscules) → Division useRankings (minuscules)
const DIV_MAP: Record<string, 'men' | 'women' | 'junior' | 'mixed'> = {
  MEN: 'men', WOMEN: 'women', JUNIOR: 'junior', MIXTE: 'mixed',
};

function divToDb(div: Division): string {
  return DIV_MAP[div] ?? 'men';
}

function roundUpPoints(value: unknown): number {
  return Math.ceil(Number(value) || 0);
}

// Convertit un objet SimpleRanking (useData) en PlayerRanking (local)
function toPlayerRanking(r: {
  rank: number;
  rank_before?: number;
  name: string;
  points: number;
  tournaments_played?: number;
  trend?: 'up' | 'down' | 'same';
  season?: number;
  updated_at?: string;
}): PlayerRanking {
  return {
    rank: r.rank,
    rank_before: r.rank_before,
    player_name: r.name,
    points: roundUpPoints(r.points),
    division: 'MEN',
    tournaments_played: r.tournaments_played,
    trend: r.trend,
    season: r.season,
    updated_at: r.updated_at,
  };
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  supabase: { label: '● Live Supabase',          color: '#4ad569' },
  csv:      { label: '● Classement CSV (25 mars)', color: '#3b82f6' },
  local:    { label: '● Classement 25 mars 2026',  color: '#f59e0b' },
};

function formatPoints(value: number): string {
  return roundUpPoints(value).toLocaleString('fr-FR');
}

function rankMovement(player: PlayerRanking) {
  const current = Number(player.rank);
  const previous = Number(player.rank_before ?? 0);
  if (Number.isFinite(current) && Number.isFinite(previous) && current > 0 && previous > 0 && current !== previous) {
    return {
      trend: current < previous ? 'up' as const : 'down' as const,
      delta: Math.abs(previous - current),
      title: `Avant: #${previous}`,
    };
  }
  return { trend: 'same' as const, delta: 0, title: 'Stable' };
}

function TrendCell({ player }: { player: PlayerRanking }) {
  const movement = rankMovement(player);
  const color = movement.trend === 'up' ? '#4ad569' : movement.trend === 'down' ? '#ef4444' : '#777';
  const label = movement.trend === 'up'
    ? `↑ ${movement.delta}`
    : movement.trend === 'down'
      ? `↓ ${movement.delta}`
      : '→';

  return (
    <div
      title={movement.title}
      style={{ textAlign: 'center', color, fontSize: '12px', fontWeight: 700 }}
    >
      {label}
    </div>
  );
}

function PlayerDetailModal({
  player,
  details,
  loading,
  color,
  onClose,
}: {
  player: PlayerRanking;
  details: PlayerRankingDetail[];
  loading: boolean;
  color: string;
  onClose: () => void;
}) {
  const realTotal = details.reduce((sum, detail) => sum + detail.points, 0);
  const displayedRealTotal = details.length > 0 ? realTotal : player.points;
  const delta = displayedRealTotal - player.points;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.76)',
        zIndex: 2147483000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '760px',
          maxHeight: '88vh',
          overflow: 'hidden',
          background: '#101010',
          border: `1px solid ${color}40`,
          borderRadius: '14px',
          boxShadow: '0 22px 70px rgba(0,0,0,0.45)',
          position: 'relative',
          zIndex: 2147483001,
        }}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'flex-start' }}>
          <div>
            <div style={{ color, fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Rang #{player.rank}
            </div>
            <h3 style={{ margin: '4px 0 6px', color: 'white', fontSize: '22px', fontWeight: 900 }}>
              {player.player_name}
            </h3>
            <div style={{ color: '#777', fontSize: '13px' }}>
              {formatPoints(player.points)} points officiels · {(details.length || player.tournaments_played || 0)} tournois comptabilisés · saison {player.season ?? 2026}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
            <X size={22} />
          </button>
        </div>

        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '10px' }}>
          {[
            { label: 'Total classement', value: formatPoints(player.points), c: color },
            { label: details.length > 0 ? 'Points reels tournois' : 'Points classement', value: loading ? '...' : formatPoints(displayedRealTotal), c: '#4ad569' },
            { label: 'Écart', value: loading ? '...' : formatPoints(delta), c: delta === 0 ? '#777' : '#f59e0b' },
          ].map(item => (
            <div key={item.label} style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ color: item.c, fontWeight: 900, fontSize: '20px' }}>{item.value}</div>
              <div style={{ color: '#666', fontSize: '11px', marginTop: '3px' }}>{item.label}</div>
            </div>
          ))}
        </div>

        <div style={{ maxHeight: '48vh', overflow: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {loading ? (
            <div style={{ padding: '42px', textAlign: 'center', color: '#666' }}>Chargement des détails...</div>
          ) : details.length === 0 ? (
            <div style={{ padding: '42px', textAlign: 'center', color: '#666' }}>
              Aucun tournoi détaille trouve pour ce joueur. Le total affiche reste celui du classement officiel publie.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 18px', color: '#555', fontSize: '11px', textTransform: 'uppercase' }}>Tournoi / match</th>
                  <th style={{ textAlign: 'right', padding: '10px 18px', color: '#555', fontSize: '11px', textTransform: 'uppercase' }}>Points</th>
                </tr>
              </thead>
              <tbody>
                {details.map((detail, index) => (
                  <tr key={`${detail.event_name}-${index}`}>
                    <td style={{ padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'white', fontWeight: 600, fontSize: '13px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CalendarDays size={13} color={color} /> 
                        <span>
                          {detail.event_name}
                          {(detail.rank || detail.team_name) && (
                            <span style={{ display: 'block', color: '#666', fontSize: '11px', fontWeight: 600, marginTop: '2px' }}>
                              {detail.rank ? `Rang ${detail.rank}` : ''}{detail.rank && detail.team_name ? ' · ' : ''}{detail.team_name}
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td style={{ padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#f59e0b', textAlign: 'right', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace' }}>
                      {formatPoints(detail.points)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function RankingTable({ division, color, search, onCountChange }: { division: Division; color: string; search: string; onCountChange?: (n: number) => void }) {
  const divKey = DIV_MAP[division] ?? 'men';
  const { rankings: rawRankings, loading, source } = useRankings(divKey);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRanking | null>(null);
  const [playerDetails, setPlayerDetails] = useState<PlayerRankingDetail[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Met à jour l'heure de dernier refresh chaque fois que les données changent
  useEffect(() => {
    if (!loading && rawRankings.length > 0) setLastRefresh(new Date());
  }, [rawRankings, loading]);

  // Forcer un refresh manuel (déclenche useRankings via l'event)
  const forceRefresh = useCallback(() => {
    window.dispatchEvent(new CustomEvent('mpl:rankings:updated', { detail: { division: divKey } }));
  }, [divKey]);

  // Convertir si nécessaire (les données CSV/Supabase ont "name", les locales "player_name")
  const liveRows: PlayerRanking[] = useMemo(() => rawRankings.map(toPlayerRanking), [rawRankings]);

  // Fallback données locales statiques si le hook n'a rien retourné
  const staticData = DATA_MAP[division];
  const rows = liveRows.length > 0 ? liveRows : staticData;

  // Remonter le count réel au parent
  useEffect(() => { if (!loading) onCountChange?.(rows.length); }, [rows.length, loading]);

  const displayed = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.player_name.toLowerCase().includes(q));
  }, [rows, search]);

  async function loadTournamentResultDetails(player: PlayerRanking): Promise<PlayerRankingDetail[]> {
    const sb = getSupabaseClient();
    if (!sb) return [];

    const name = player.player_name.trim();
    const queries = await Promise.all([
      sb
        .from('tournament_results')
        .select('tournament_name,tournament_date,team_name,player1_name,player2_name,rank,points,season,division')
        .ilike('player1_name', name)
        .limit(500),
      sb
        .from('tournament_results')
        .select('tournament_name,tournament_date,team_name,player1_name,player2_name,rank,points,season,division')
        .ilike('player2_name', name)
        .limit(500),
    ]);

    const seen = new Set<string>();
    const rows: PlayerRankingDetail[] = [];

    for (const result of queries) {
      if (result.error || !result.data) continue;
      for (const row of result.data as Record<string, unknown>[]) {
        const eventName = String(row.tournament_name ?? '').trim();
        const date = String(row.tournament_date ?? '').trim();
        const points = roundUpPoints(row.points);
        const rank = Number(row.rank ?? 0);
        const teamName = String(row.team_name ?? '').trim();
        const key = `${eventName}|${date}|${teamName}|${points}|${rank}`;
        if (!eventName || !points || seen.has(key)) continue;
        seen.add(key);
        rows.push({
          event_name: date ? `${eventName} - ${new Date(date).toLocaleDateString('fr-FR')}` : eventName,
          points: roundUpPoints(points),
          season: Number(row.season ?? 2026),
          rank: Number.isFinite(rank) ? rank : undefined,
          team_name: teamName,
        });
      }
    }

    return rows.sort((a, b) => b.points - a.points);
  }

  async function openPlayer(player: PlayerRanking) {
    setSelectedPlayer(player);
    setPlayerDetails([]);

    if (!isSupabaseConnected()) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    setDetailsLoading(true);
    try {
      const { data, error } = await sb
        .from('official_ranking_details')
        .select('event_name,points,season')
        .ilike('player_name', player.player_name)
        .eq('division', divToDb(division))
        .order('points', { ascending: false });

      const officialDetails = !error && data
        ? (data as Record<string, unknown>[]).map(row => ({
          event_name: String(row.event_name ?? ''),
          points: roundUpPoints(row.points),
          season: Number(row.season ?? 2026),
        })).filter(detail => detail.event_name && detail.points > 0)
        : [];

      if (officialDetails.length > 0) {
        setPlayerDetails(officialDetails);
        return;
      }

      setPlayerDetails(await loadTournamentResultDetails(player));
    } finally {
      setDetailsLoading(false);
    }
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#555' }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${color}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      <p>Chargement...</p>
    </div>
  );

  if (displayed.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: '#555' }}>
        <Search size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
        <p>Aucun joueur trouvé pour « {search} »</p>
      </div>
    );
  }

  return (
    <div>
      {/* Légende colonnes */}
      <div style={{
        display: 'grid', gridTemplateColumns: '52px minmax(220px,1fr) 110px 100px 90px 90px',
        gap: '8px', padding: '8px 16px 6px',
        color: '#555', fontSize: '11px', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.6px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        marginBottom: '6px',
      }}>
        <span style={{ textAlign: 'center' }}>#</span>
        <span>Joueur</span>
        <span style={{ textAlign: 'right' }}>Points</span>
        <span style={{ textAlign: 'center' }}>Tournois</span>
        <span style={{ textAlign: 'center' }}>Trend</span>
        <span style={{ textAlign: 'center' }}>Saison</span>
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {displayed.map((r, i) => (
          <div key={`${r.id ?? r.player_name}-${i}`}
            className="mpl-table-row"
            onClick={() => openPlayer(r)}
            style={{
              display: 'grid', gridTemplateColumns: '52px minmax(220px,1fr) 110px 100px 90px 90px',
              gap: '8px', alignItems: 'center',
              padding: '10px 16px',
              background: r.rank === 1
                ? 'rgba(201,168,76,0.07)'
                : r.rank === 2
                ? 'rgba(180,180,180,0.05)'
                : r.rank === 3
                ? 'rgba(180,120,60,0.05)'
                : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
              borderRadius: '10px',
              border: r.rank <= 3
                ? `1px solid ${r.rank === 1 ? 'rgba(201,168,76,0.2)' : `${color}22`}`
                : '1px solid transparent',
              transition: 'all 0.2s ease',
              position: 'relative',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${color}0d`; (e.currentTarget as HTMLElement).style.transform = 'translateX(3px)'; (e.currentTarget as HTMLElement).style.borderColor = `${color}25`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = r.rank === 1 ? 'rgba(201,168,76,0.07)' : r.rank === 2 ? 'rgba(180,180,180,0.05)' : r.rank === 3 ? 'rgba(180,120,60,0.05)' : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'; (e.currentTarget as HTMLElement).style.transform = 'translateX(0)'; (e.currentTarget as HTMLElement).style.borderColor = r.rank <= 3 ? `${r.rank === 1 ? 'rgba(201,168,76,0.2)' : `${color}22`}` : 'transparent'; }}
          >
            {/* Rang */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <RankBadge rank={r.rank} color={color} />
            </div>

            {/* Joueur */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
              <Initials name={r.player_name} color={color} />
              <span style={{
                color: r.rank <= 3 ? 'white' : 'rgba(255,255,255,0.85)',
                fontWeight: r.rank <= 10 ? 700 : 500,
                fontSize: '14px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {r.player_name}
              </span>
            </div>

            {/* Points */}
            <div style={{ textAlign: 'right' }}>
              <span style={{
                color: r.rank === 1 ? '#f59e0b' : r.rank <= 3 ? color : r.rank <= 10 ? 'white' : '#a0a0a0',
                fontWeight: r.rank <= 10 ? 800 : 600,
                fontSize: r.rank <= 3 ? '16px' : '14px',
                fontFamily: 'JetBrains Mono, monospace',
              }}>
                {r.points > 0 ? formatPoints(r.points) : <span style={{ color: '#444', fontSize: '12px' }}>—</span>}
              </span>
            </div>

            <div style={{ textAlign: 'center' }}>
              <span style={{
                color: r.tournaments_played ? '#4ad569' : '#444',
                background: r.tournaments_played ? 'rgba(74,213,105,0.08)' : 'transparent',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '12px',
                fontWeight: 700,
              }}>
                {r.tournaments_played ?? 0}
              </span>
            </div>

            <TrendCell player={r} />

            <div style={{ textAlign: 'center', color: '#666', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace' }}>
              {r.season ?? 2026}
            </div>
          </div>
        ))}
      </div>

      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          details={playerDetails}
          loading={detailsLoading}
          color={color}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      <div style={{
        padding: '12px 16px', fontSize: '12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: SOURCE_LABELS[source]?.color ?? '#888' }}>
          <TrendingUp size={12} />
          {SOURCE_LABELS[source]?.label} · {rows.length} joueurs
          {source === 'supabase' && (
            <span style={{ color: '#444', fontSize: '11px', marginLeft: '4px' }}>
              · màj {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </span>
        {source === 'supabase' && (
          <button
            onClick={forceRefresh}
            disabled={loading}
            title="Rafraîchir depuis Supabase"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'rgba(74,213,105,0.08)', color: '#4ad569',
              border: '1px solid rgba(74,213,105,0.2)',
              borderRadius: '6px', padding: '4px 10px',
              fontSize: '11px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            <RefreshCw size={11} className={loading ? 'spin' : ''} />
            Rafraîchir
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page Classements ──────────────────────────────────────────────────────────
export default function Classements() {
  const { lang } = useI18n();
  useSeo({
    title: "Classement Padel Maurice 2026 — Ranking Officiel MPL",
    description: "Classement officiel padel Mauritius 2026 : Hommes, Dames, Mixte, Junior. Top 10 scores des 12 derniers mois. Mauritius Padel League.",
    keywords: "padel ranking mauritius, classement padel mauritius 2026, padel ranking MPL, classement padel hommes dames",
    canonical: "https://padelleague.mu/#/classements",
  });
  const [activeTab, setActiveTab] = useState<Division>('MEN');
  const [search, setSearch]       = useState('');
  // Count réel par division — mis à jour depuis RankingTable via callback
  const [divCounts, setDivCounts] = useState<Partial<Record<Division,number>>>({});
  const updateCount = (div: Division, n: number) => setDivCounts(prev => ({ ...prev, [div]: n }));

  const activeConfig = TABS.find(t => t.key === activeTab)!;

  const stats = [
    { label: lang === 'fr' ? 'Hommes classés' : 'Men ranked',    val: divCounts['MEN']    != null ? `${divCounts['MEN']}`    : '—', icon: '👨', color: '#3b82f6' },
    { label: lang === 'fr' ? 'Dames classées'  : 'Women ranked', val: divCounts['WOMEN']  != null ? `${divCounts['WOMEN']}`  : '—', icon: '👩', color: '#ec4899' },
    { label: lang === 'fr' ? 'Juniors classés' : 'Juniors',      val: divCounts['JUNIOR'] != null ? `${divCounts['JUNIOR']}` : '—', icon: '⭐', color: '#f59e0b' },
    { label: lang === 'fr' ? 'Mixte classés'   : 'Mixed',        val: divCounts['MIXTE']  != null ? `${divCounts['MIXTE']}`  : '—', icon: '🎾', color: '#8b5cf6' },
  ];

  return (
    <Layout>
      <section style={{ padding: '88px 24px 60px', minHeight: '80vh', position: 'relative', overflowY: 'hidden', overflowX: 'auto', background: 'linear-gradient(180deg, #0a0a0a 0%, #0c0c0c 100%)' }}>
        {/* Dot-wave — droit, faible opacité */}
        <DotWaveBackground variant="hero-right" opacity={0.10} animate={false} />
        {/* Top gradient line */}
        <div style={{ position: 'absolute', top: 64, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(74,213,105,0.2) 50%, transparent 100%)' }} />
        <div style={{ maxWidth: '1100px', margin: '0 auto', minWidth: '320px' }}>

          {/* Header */}
          <h1 style={{ fontSize: 'clamp(28px,4vw,52px)', fontWeight: 900, color: 'white', margin: '0 0 6px', letterSpacing: '-1px' }}>
            {lang === 'fr' ? 'Classements' : 'Rankings'}
          </h1>
          <p style={{ color: '#777', marginBottom: '36px', fontSize: '14px', letterSpacing: '0.1px' }}>
            {lang === 'fr' ? 'Classements individuels officiels MPL Saison 2026' : 'Official MPL 2026 Season Individual Rankings'}
          </p>

          {/* Onglets division */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '28px' }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setSearch(''); }}
                style={{
                  padding: '10px 22px', borderRadius: '10px',
                  cursor: 'pointer', fontSize: '14px', fontWeight: 700,
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  background: activeTab === tab.key
                    ? `linear-gradient(135deg, ${tab.color} 0%, ${tab.color}cc 100%)`
                    : 'rgba(255,255,255,0.04)',
                  color: activeTab === tab.key ? (tab.key === 'WOMEN' ? 'white' : '#0a0a0a') : 'rgba(255,255,255,0.45)',
                  boxShadow: activeTab === tab.key ? `0 4px 24px ${tab.color}45` : 'none',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  border: activeTab === tab.key ? 'none' : '1px solid rgba(255,255,255,0.06)',
                  letterSpacing: '0.1px',
                }}
                onMouseEnter={e => { if (activeTab !== tab.key) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.75)'; }}}
                onMouseLeave={e => { if (activeTab !== tab.key) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'; }}}
              >
                <span>{tab.icon}</span>
                <span>{lang === 'fr' ? tab.label_fr : tab.label_en}</span>
                
              </button>
            ))}
          </div>

          {/* Recherche + indicateur */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '400px' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#555' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={lang === 'fr' ? 'Rechercher un joueur…' : 'Search a player…'}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${activeConfig.color}40`,
                  borderRadius: '10px', padding: '9px 12px 9px 36px', color: 'white',
                  fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  boxShadow: `0 0 0 0px ${activeConfig.color}20`,
                }}
                onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = activeConfig.color; (e.currentTarget as HTMLInputElement).style.boxShadow = `0 0 0 3px ${activeConfig.color}18`; }}
                onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = `${activeConfig.color}40`; (e.currentTarget as HTMLInputElement).style.boxShadow = 'none'; }}
              />
            </div>
            <div style={{ color: activeConfig.color, fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Medal size={14} />
                {lang === 'fr' ? `Division ${activeConfig.label_fr}` : `${activeConfig.label_en} Division`}
              &nbsp;·&nbsp;
              <span style={{ color: '#666', fontWeight: 400, fontSize: '13px' }}>
                {divCounts[activeTab] != null ? `${divCounts[activeTab]} joueurs` : '—'}
              </span>
            </div>
          </div>

          {/* Tableau */}
          <GlassCard style={{ padding: '16px 0' }}>
            <RankingTable key={activeTab} division={activeTab} color={activeConfig.color} search={search} onCountChange={n => updateCount(activeTab, n)} />
          </GlassCard>

          {/* Statistiques saison */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '14px', marginTop: '40px' }}>
            {stats.map((s, i) => (
              <div key={i} className="mpl-card" style={{ border: `1px solid ${s.color}18`, padding: '20px', textAlign: 'center', transition: 'all 0.25s ease' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${s.color}45`; (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = `${s.color}18`; (e.currentTarget as HTMLElement).style.transform = 'none'; }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>{s.icon}</div>
                <div style={{ color: s.color, fontWeight: 800, fontSize: '26px', lineHeight: 1, fontFamily: 'JetBrains Mono, monospace' }}>{s.val}</div>
                <div style={{ color: '#666', fontSize: '12px', marginTop: '6px' }}>{s.label}</div>
              </div>
            ))}
          </div>

        </div>
      </section>
    </Layout>
  );
}
