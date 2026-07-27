import { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, TrendingUp, Medal, RefreshCw, X, CalendarDays } from 'lucide-react';
import { Layout, GlassCard } from '@/components/Layout';
import { DotWaveBackground } from '@/components/DotWaveBackground';
import { useI18n } from '@/hooks/useI18n';
import { useSeo } from '@/hooks/useSeo';
import { useRankings } from '@/hooks/useData';
import { getSupabaseClient, isSupabaseConnected } from '@/lib/supabase';
import { MPL_TOURNAMENTS } from '@/data/mpl2026';

import {
  FULL_RANKINGS_MEN,
  FULL_RANKINGS_WOMEN,
  FULL_RANKINGS_MIXED,
  FULL_RANKINGS_JUNIOR,
  type RankingEntry,
} from '@/data/fullRankings';

//
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
  category?: string;
  club_name?: string;
  partner_name?: string;
  event_date?: string;
  division_key?: 'men' | 'women' | 'mixed' | 'junior';
  source?: 'official' | 'current' | 'historical';
}

interface PlayerCareerStats {
  seasons_played: number;
  tournaments_played: number;
  total_points: number;
  wins: number;
  podiums: number;
  average_points?: number;
}


//
//
function toLocalRanking(r: RankingEntry, div: Division): PlayerRanking {
  return { rank: r.rank, player_name: r.player_name, points: roundUpPoints(r.points), division: div };
}

const DATA_MAP: Record<Division, PlayerRanking[]> = {
  MEN:    FULL_RANKINGS_MEN.map(r => toLocalRanking(r, 'MEN')),
  WOMEN:  FULL_RANKINGS_WOMEN.map(r => toLocalRanking(r, 'WOMEN')),
  JUNIOR: FULL_RANKINGS_JUNIOR.map(r => toLocalRanking(r, 'JUNIOR')),
  MIXTE:  FULL_RANKINGS_MIXED.map(r => toLocalRanking(r, 'MIXTE')),
};

//
const TABS: { key: Division; label_fr: string; label_en: string; color: string; icon: string }[] = [
  { key: 'MEN',    label_fr: 'Hommes', label_en: 'Men',    color: '#3b82f6', icon: 'H' },
  { key: 'WOMEN',  label_fr: 'Dames',  label_en: 'Women',  color: '#ec4899', icon: 'D' },
  { key: 'JUNIOR', label_fr: 'Junior', label_en: 'Junior', color: '#f59e0b', icon: 'J' },
  { key: 'MIXTE',  label_fr: 'Mixte',  label_en: 'Mixed',  color: '#8b5cf6', icon: 'M' },
];

//
function RankBadge({ rank, color }: { rank: number; color: string }) {
  const podiumColors: Record<number, { bg: string; border: string; text: string }> = {
    1: { bg: 'rgba(245,158,11,0.16)', border: 'rgba(245,158,11,0.45)', text: '#f59e0b' },
    2: { bg: 'rgba(148,163,184,0.14)', border: 'rgba(148,163,184,0.35)', text: '#cbd5e1' },
    3: { bg: 'rgba(180,120,60,0.16)', border: 'rgba(180,120,60,0.4)', text: '#d08a45' },
  };
  const podium = podiumColors[rank];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '28px', height: '28px', borderRadius: '50%',
      background: podium?.bg ?? color + '18',
      border: podium ? '1px solid ' + podium.border : '1px solid transparent',
      color: podium?.text ?? color, fontWeight: 800,
      fontSize: '13px', fontFamily: 'JetBrains Mono, monospace',
    }}>
      {rank}
    </span>
  );
}

//
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

//
//
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
  supabase: { label: 'Live Supabase', color: '#4ad569' },
  csv:      { label: 'Classement CSV', color: '#3b82f6' },
  local:    { label: 'Classement local', color: '#f59e0b' },
};

function formatPoints(value: number): string {
  return roundUpPoints(value).toLocaleString('fr-FR');
}

function inferEventSeason(eventName: string, fallback?: number): number | undefined {
  const text = eventName.toUpperCase();
  const monthYear = text.match(/(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*(\d{2}|\d{4})\b/);
  const yearToken = monthYear?.[1];
  if (yearToken) {
    const year = Number(yearToken.length === 2 ? `20${yearToken}` : yearToken);
    if (year >= 2023 && year <= 2026) return year;
  }
  return fallback;
}

const MONTHS: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

function inferEventDate(eventName: string, fallbackDate?: string, fallbackSeason?: number): string {
  if (fallbackDate && /^\d{4}-\d{2}-\d{2}/.test(fallbackDate)) return fallbackDate.slice(0, 10);
  const text = eventName.toUpperCase();
  const match = text.match(/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*(\d{2}|\d{4})\b/);
  if (match) {
    const year = match[2].length === 2 ? `20${match[2]}` : match[2];
    return `${year}-${MONTHS[match[1]]}-01`;
  }
  return fallbackSeason ? `${fallbackSeason}-01-01` : '';
}

function inferCategory(eventName: string, fallback?: string): string {
  const match = eventName.toUpperCase().match(/\b(M25|M100|M250|M500|M1000|U11|U13|U15)\b/);
  return match?.[1] ?? fallback ?? '';
}

const CLUB_ALIASES: Array<[RegExp, string]> = [
  [/\bSPARC\b|CASCAVELLE/, 'SPARC Cascavelle'],
  [/\bRM\s*GB\b|RM CLUB GRAND BAIE|GRAND BAIE (FORBACH)|FORBACH/, 'RM Club Grand Baie'],
  [/\bRM\s*H\b|HENESSY|HENNESSY|I PADEL HEN/, 'I Padel by RM Hennessy'],
  [/\bRM\s*T\b|RM CLUB TAMARIN/, 'RM Club Tamarin'],
  [/\bRM\s*A\b|RM AZURI/, 'Studio by RM Azuri'],
  [/\bRM\s*BR\b/, 'Club House Black River'],
  [/\bRM\s*PC\b|PORT CHAMBLY/, 'I Padel by RM Port Chambly'],
  [/\bURBAN\s*BR\b|URBAN SPORT BLACK RIVER|BLACK RIVER/, 'Urban Sport Black River'],
  [/\bURBAN\s*GB\b|URBAN SPORT GRAND BAIE/, 'Urban Sport Grand Baie'],
  [/\bCH\b|\bCLUBHOUSE\b|\bCLUB HOUSE\b|CLUB HOUSE BLACK RIVER/, 'Club House Black River'],
  [/\bAZURI\b|STUDIO BY RM AZURI/, 'Studio by RM Azuri'],
  [/\bISLA\b|ISLA PADEL GRAND BAIE/, 'Isla Padel Grand Baie'],
  [/\bLSC\b|LABOURDONNAIS|MAPOU/, 'Labourdonnais Mapou'],
  [/\bCANA\b|CAÑA|CANA BEAU PLAN|BEAU PLAN/, 'Caña Beau Plan'],
  [/\bTB\b|TERRES BRUNES|TAMARIN BAY/, 'Terres Brunes Sports & Leisure'],
  [/\bCMA\b|CLUB MED|ALBION/, 'Club Med Albion'],
  [/\bMCG\b|MONT CHOISY/, 'Mont Choisy Golf'],
  [/OXYGEN|MOKA OXYGEN/, 'Oxygen Moka'],
  [/MOKA RANGERS/, 'Moka Rangers'],
  [/ENERGIA|POINTE AUX CANONNIERS|CANONNIERS/, 'Energia Pointe aux Canonniers'],
];

function compactEventName(value: string): string {
  return value.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();
}

function findCalendarClub(eventName: string): string {
  const event = compactEventName(eventName);
  let best = { club: '', score: 0 };
  for (const tournament of MPL_TOURNAMENTS) {
    const name = compactEventName(tournament.name);
    const category = compactEventName(tournament.category);
    const club = compactEventName(tournament.club_name);
    let score = 0;
    if (category && event.includes(category)) score += 2;
    if (club && event.includes(club)) score += 5;
    for (const token of club.split(' ').filter(t => t.length > 2)) {
      if (event.includes(token)) score += 1;
    }
    for (const token of name.split(' ').filter(t => t.length > 2)) {
      if (event.includes(token)) score += 0.25;
    }
    if (score > best.score) best = { club: tournament.club_name, score };
  }
  return best.score >= 3 ? best.club : '';
}

function inferClubName(eventName: string, fallback?: string): string {
  if (fallback?.trim()) return fallback.trim();
  const normalized = compactEventName(eventName);
  for (const [pattern, club] of CLUB_ALIASES) {
    if (pattern.test(normalized)) return club;
  }
  const calendarClub = findCalendarClub(eventName);
  if (calendarClub) return calendarClub;
  let text = eventName.toUpperCase();
  text = text.replace(/\b(M25|M50|M100|M250|M500|M1000|U11|U13|U15)\b/g, '').trim();
  text = text.replace(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*(\d{2}|\d{4})\b/g, '').trim();
  text = text.replace(/\b(MEN|WOMEN|MIXED|MIXTE|JUNIOR)\b/g, '').trim();
  text = text.replace(/^[\s-]+|[\s-]+$/g, '').replace(/\s+-\s+/g, ' ').replace(/\s{2,}/g, ' ');
  return text || 'MPL';
}

function normalizeDetailDivision(value: unknown, fallback?: PlayerRankingDetail['division_key']): PlayerRankingDetail['division_key'] {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('women') || text.includes('dames')) return 'women';
  if (text.includes('mixed') || text.includes('mixte')) return 'mixed';
  if (text.includes('junior') || /u1[135]/.test(text)) return 'junior';
  if (text.includes('men') || text.includes('hommes')) return 'men';
  return fallback ?? 'men';
}

function normalizePersonName(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function nameKey(value: unknown): string {
  return normalizePersonName(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function partnerFromTeamName(teamName: string, playerName: string): string {
  const player = nameKey(playerName);
  if (!teamName || !player) return '';
  const parts = teamName
    .split(/\s*(?:\/|&|\+|\bET\b)\s*/i)
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return '';
  const other = parts.find(part => !player.includes(nameKey(part)) && !nameKey(part).includes(player));
  return other ? other.toUpperCase() : '';
}

function partnerForPlayer(row: Record<string, unknown>, playerName: string): string {
  const player = nameKey(playerName);
  const p1Raw = normalizePersonName(row.player1_name);
  const p2Raw = normalizePersonName(row.player2_name);
  const p1 = nameKey(p1Raw);
  const p2 = nameKey(p2Raw);
  if (p1 && p1 !== player) return p1Raw.toUpperCase();
  if (p2 && p2 !== player) return p2Raw.toUpperCase();
  return partnerFromTeamName(String(row.team_name ?? ''), playerName);
}

function detailMonthKey(detail: PlayerRankingDetail): string {
  const date = detail.event_date || inferEventDate(detail.event_name, undefined, detail.season);
  return date ? date.slice(0, 7) : String(detail.season ?? '');
}

function detailDedupKey(detail: PlayerRankingDetail): string {
  return [
    detailMonthKey(detail),
    compactEventName(detail.category || inferCategory(detail.event_name)),
    compactEventName(detail.club_name || inferClubName(detail.event_name)),
    roundUpPoints(detail.points),
  ].join('|');
}

function detailQuality(detail: PlayerRankingDetail): number {
  let score = 0;
  if (detail.partner_name) score += 8;
  if (detail.rank && detail.rank > 0) score += 6;
  if (detail.team_name) score += 3;
  if (detail.source === 'current') score += 2;
  if (detail.source === 'historical') score += 1;
  return score;
}

function mergeDetailRows(base: PlayerRankingDetail, incoming: PlayerRankingDetail): PlayerRankingDetail {
  const preferred = detailQuality(incoming) > detailQuality(base) ? incoming : base;
  const other = preferred === incoming ? base : incoming;
  return {
    ...preferred,
    event_name: preferred.event_name || other.event_name,
    points: Math.max(roundUpPoints(preferred.points), roundUpPoints(other.points)),
    season: preferred.season ?? other.season,
    rank: preferred.rank ?? other.rank,
    team_name: preferred.team_name || other.team_name,
    category: preferred.category || other.category,
    club_name: inferClubName(preferred.event_name || other.event_name, preferred.club_name || other.club_name),
    partner_name: preferred.partner_name || other.partner_name,
    event_date: preferred.event_date || other.event_date,
    division_key: preferred.division_key || other.division_key,
  };
}

function detailPartnerLabel(detail: PlayerRankingDetail, playerName: string): string {
  if (detail.partner_name) return detail.partner_name;
  const fromTeam = partnerFromTeamName(detail.team_name || '', playerName);
  if (fromTeam) return fromTeam;
  return detail.team_name || '-';
}
function dedupePlayerDetails(details: PlayerRankingDetail[]): PlayerRankingDetail[] {
  const byKey = new Map<string, PlayerRankingDetail>();
  for (const detail of details) {
    const key = detailDedupKey(detail);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeDetailRows(existing, detail) : detail);
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const dateA = a.event_date || inferEventDate(a.event_name, undefined, a.season);
    const dateB = b.event_date || inferEventDate(b.event_name, undefined, b.season);
    return dateB.localeCompare(dateA) || b.points - a.points;
  });
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
    ? '+' + movement.delta
    : movement.trend === 'down'
      ? '-' + movement.delta
      : '=';

  return (
    <div
      title={movement.title}
      style={{ textAlign: 'center', color, fontSize: '12px', fontWeight: 800 }}
    >
      {label}
    </div>
  );
}

function PlayerDetailModal({
  player,
  details,
  careerStats,
  loading,
  color,
  onClose,
}: {
  player: PlayerRanking;
  details: PlayerRankingDetail[];
  careerStats: PlayerCareerStats | null;
  loading: boolean;
  color: string;
  onClose: () => void;
}) {
  const [activeHistoryTab, setActiveHistoryTab] = useState<'all' | 'men' | 'women' | 'mixed' | 'junior'>('all');
  const currentDetails = details.filter(detail => detail.source !== 'historical');
  const historicalDetails = details.filter(detail => detail.source === 'historical');
  const countedCurrentDetails = [...currentDetails].sort((a, b) => b.points - a.points).slice(0, 8);
  const countedCurrentSet = new Set(countedCurrentDetails);
  const playedCount = currentDetails.length || player.tournaments_played || 0;
  const rankingTotal = countedCurrentDetails.length > 0 ? countedCurrentDetails.reduce((sum, detail) => sum + detail.points, 0) : player.points;
  const historyTabs = [
    { key: 'all' as const, label: 'Historique', count: details.length },
    { key: 'men' as const, label: 'Men', count: details.filter(detail => detail.division_key === 'men').length },
    { key: 'women' as const, label: 'Women', count: details.filter(detail => detail.division_key === 'women').length },
    { key: 'mixed' as const, label: 'Mixed', count: details.filter(detail => detail.division_key === 'mixed').length },
    { key: 'junior' as const, label: 'Junior', count: details.filter(detail => detail.division_key === 'junior').length },
  ].filter(tab => tab.key === 'all' || tab.count > 0);
  const visibleDetails = details
    .filter(detail => activeHistoryTab === 'all' || detail.division_key === activeHistoryTab)
    .sort((a, b) => (b.event_date ?? '').localeCompare(a.event_date ?? '') || b.points - a.points);
  const top8Label = playedCount > 8 ? `8/${playedCount}` : String(playedCount);

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.76)', zIndex: 2147483000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={event => event.stopPropagation()} style={{ width: '100%', maxWidth: '920px', maxHeight: '88vh', overflow: 'hidden', background: '#101010', border: `1px solid ${color}40`, borderRadius: '10px', boxShadow: '0 22px 70px rgba(0,0,0,0.45)', position: 'relative', zIndex: 2147483001 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <span style={{ color: '#f59e0b', fontSize: '20px', lineHeight: 1 }}>#</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'white', fontSize: '16px', fontWeight: 900, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.player_name}</div>
              <div style={{ color: '#777', fontSize: '12px', marginTop: '2px' }}>{formatPoints(player.points)} pts ranking - Top 8 / 12 mois: {top8Label} - {historicalDetails.length} historique</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ color: '#777', fontSize: '12px' }}>{careerStats ? `${careerStats.tournaments_played} tournois carriere` : `${details.length} lignes`}</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: 0 }}><X size={22} /></button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '8px', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { label: 'Ranking', value: formatPoints(player.points), c: color },
            { label: 'Top 8 retenus', value: loading ? '...' : formatPoints(rankingTotal), c: '#4ad569' },
            { label: 'Joues 12 mois', value: top8Label, c: '#f59e0b' },
            { label: 'Carriere pts', value: careerStats ? formatPoints(careerStats.total_points) : '-', c: '#8b5cf6' },
            { label: 'Victoires', value: careerStats ? String(careerStats.wins) : '-', c: '#4ad569' },
          ].map(item => (
            <div key={item.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', padding: '9px 11px' }}>
              <div style={{ color: item.c, fontWeight: 900, fontSize: '18px', fontFamily: 'JetBrains Mono, monospace' }}>{item.value}</div>
              <div style={{ color: '#666', fontSize: '10px', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '10px 20px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {historyTabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveHistoryTab(tab.key)} style={{ background: activeHistoryTab === tab.key ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.025)', border: activeHistoryTab === tab.key ? `1px solid ${color}45` : '1px solid rgba(255,255,255,0.06)', color: activeHistoryTab === tab.key ? 'white' : '#888', borderRadius: '5px', padding: '5px 9px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}>
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        <div style={{ maxHeight: '48vh', overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: '42px', textAlign: 'center', color: '#666' }}>Chargement des details...</div>
          ) : visibleDetails.length === 0 ? (
            <div style={{ padding: '42px', textAlign: 'center', color: '#666' }}>Aucun detail disponible pour ce filtre.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: '#101010' }}>
                  {[['Date','96px','left'], ['Cat','74px','left'], ['Club','1fr','left'], ['Partenaire','180px','left'], ['Rk','56px','right'], ['Pts','84px','right']].map(([label, width, align]) => (
                    <th key={label} style={{ width: width === '1fr' ? undefined : width, textAlign: align as 'left' | 'right', padding: '9px 8px', color: '#555', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleDetails.map((detail, index) => {
                  const counted = detail.source !== 'historical' && countedCurrentSet.has(detail);
                  const muted = detail.source !== 'historical' && !counted;
                  return (
                    <tr key={`${detail.event_name}-${index}`} style={{ background: counted ? 'rgba(74,213,105,0.08)' : index % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent', opacity: muted ? 0.52 : 1 }}>
                      <td style={{ padding: '8px', color: '#666', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>{detail.event_date || detail.season || '-'}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.035)' }}><span style={{ color: detail.category?.startsWith('M') ? '#4ad569' : '#f59e0b', fontSize: '10px', fontWeight: 900 }}>{detail.category || '-'}</span></td>
                      <td style={{ padding: '8px', color: '#8a94a6', fontSize: '11px', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>{detail.club_name || detail.event_name}</td>
                      <td style={{ padding: '8px', color: 'white', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>{detailPartnerLabel(detail, player.player_name)}</td>
                      <td style={{ padding: '8px', color: Number(detail.rank) === 1 ? '#4ad569' : Number(detail.rank) <= 3 ? '#f59e0b' : '#888', fontSize: '12px', fontWeight: 900, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>#{detail.rank ?? '-'}</td>
                      <td style={{ padding: '8px', color: counted ? '#4ad569' : 'white', fontSize: '12px', fontWeight: 900, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>{formatPoints(detail.points)}{counted ? ' OK' : ''}</td>
                    </tr>
                  );
                })}
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
  const [playerCareerStats, setPlayerCareerStats] = useState<PlayerCareerStats | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Met a jour l'heure de dernier refresh chaque fois que les donnees changent
  useEffect(() => {
    if (!loading && rawRankings.length > 0) setLastRefresh(new Date());
  }, [rawRankings, loading]);

  // Forcer un refresh manuel via l'event useRankings
  const forceRefresh = useCallback(() => {
    window.dispatchEvent(new CustomEvent('mpl:rankings:updated', { detail: { division: divKey } }));
  }, [divKey]);

  // Convertir si necessaire (les donnees CSV/Supabase ont "name", les locales "player_name")
  const liveRows: PlayerRanking[] = useMemo(() => rawRankings.map(toPlayerRanking), [rawRankings]);

  // Fallback donnees locales statiques si le hook n'a rien retourne
  const staticData = DATA_MAP[division];
  const rows = liveRows.length > 0 ? liveRows : staticData;

  // Remonter le count reel au parent
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
    const escapedName = name.replace(/[%_,]/g, '');
    const namePattern = `%${escapedName}%`;
    const queries = await Promise.all([
      sb
        .from('tournament_results')
        .select('tournament_name,tournament_date,team_name,player1_name,player2_name,rank,points,season,division,club_name')
        .ilike('player1_name', namePattern)
        .limit(500),
      sb
        .from('tournament_results')
        .select('tournament_name,tournament_date,team_name,player1_name,player2_name,rank,points,season,division,club_name')
        .ilike('player2_name', namePattern)
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
          season: inferEventSeason(eventName, Number(row.season ?? 2026)),
          rank: Number.isFinite(rank) ? rank : undefined,
          team_name: teamName,
          category: inferCategory(eventName),
          club_name: inferClubName(eventName, String(row.club_name ?? '')),
          partner_name: partnerForPlayer(row, player.player_name),
          event_date: inferEventDate(eventName, date, Number(row.season ?? 2026)),
          division_key: normalizeDetailDivision(row.division, divToDb(division) as PlayerRankingDetail['division_key']),
          source: 'current',
        });
      }
    }

    return rows.sort((a, b) => b.points - a.points);
  }

  async function loadHistoricalPlayerData(player: PlayerRanking): Promise<{ details: PlayerRankingDetail[]; stats: PlayerCareerStats | null }> {
    const sb = getSupabaseClient();
    if (!sb) return { details: [], stats: null };

    const name = player.player_name.trim();
    const escapedName = name.replace(/[%_,]/g, '');
    const { data: historicalRows, error: historicalError } = await sb
      .from('historical_tournament_results')
      .select('event_name,season,category,division,rank_min,team_name,player1_name,player2_name,points')
      .or(`player1_name.ilike.%${escapedName}%,player2_name.ilike.%${escapedName}%`)
      .limit(2000);

    const seen = new Set<string>();
    const details: PlayerRankingDetail[] = [];
    if (!historicalError && historicalRows) {
      for (const row of historicalRows as Record<string, unknown>[]) {
        const eventName = String(row.event_name ?? '').trim();
        const season = Number(row.season ?? 0) || undefined;
        const points = roundUpPoints(row.points);
        const rank = Number(row.rank_min ?? 0);
        const teamName = String(row.team_name ?? '').trim();
        const category = inferCategory(eventName, String(row.category ?? '').trim());
        const key = `${eventName}|${season}|${teamName}|${points}|${rank}`;
        if (!eventName || !points || seen.has(key)) continue;
        seen.add(key);
        details.push({
          event_name: eventName,
          points,
          season,
          rank: Number.isFinite(rank) && rank > 0 ? rank : undefined,
          team_name: teamName,
          category,
          club_name: inferClubName(eventName),
          partner_name: partnerForPlayer(row, player.player_name),
          event_date: inferEventDate(eventName, undefined, season),
          division_key: normalizeDetailDivision(row.division, divToDb(division) as PlayerRankingDetail['division_key']),
          source: 'historical',
        });
      }
    }

    let stats: PlayerCareerStats | null = null;
    const { data: summary } = await sb
      .from('historical_player_career_summary')
      .select('seasons_played,tournaments_played,total_points,wins,podiums,average_points')
      .ilike('player_name', name)
      .maybeSingle();

    if (summary) {
      const row = summary as Record<string, unknown>;
      stats = {
        seasons_played: Number(row.seasons_played ?? 0),
        tournaments_played: Number(row.tournaments_played ?? 0),
        total_points: roundUpPoints(row.total_points),
        wins: Number(row.wins ?? 0),
        podiums: Number(row.podiums ?? 0),
        average_points: Number(row.average_points ?? 0),
      };
    } else if (details.length) {
      const seasons = new Set(details.map(detail => detail.season).filter(Boolean));
      const totalPoints = details.reduce((sum, detail) => sum + detail.points, 0);
      stats = {
        seasons_played: seasons.size,
        tournaments_played: details.length,
        total_points: totalPoints,
        wins: details.filter(detail => detail.rank === 1).length,
        podiums: details.filter(detail => Number(detail.rank ?? 999) <= 3).length,
        average_points: Math.round(totalPoints / details.length),
      };
    }

    return { details: details.sort((a, b) => Number(b.season ?? 0) - Number(a.season ?? 0) || b.points - a.points), stats };
  }

  async function openPlayer(player: PlayerRanking) {
    setSelectedPlayer(player);
    setPlayerDetails([]);
    setPlayerCareerStats(null);

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
          season: inferEventSeason(String(row.event_name ?? ''), Number(row.season ?? 2026)),
          rank: undefined,
          category: inferCategory(String(row.event_name ?? '')),
          club_name: inferClubName(String(row.event_name ?? '')),
          event_date: inferEventDate(String(row.event_name ?? ''), undefined, Number(row.season ?? 2026)),
          division_key: divToDb(division) as PlayerRankingDetail['division_key'],
          source: 'official' as const,
        })).filter(detail => detail.event_name && detail.points > 0)
        : [];

      const historical = await loadHistoricalPlayerData(player);
      setPlayerCareerStats(historical.stats);

      const currentDetails = await loadTournamentResultDetails(player);
      setPlayerDetails(dedupePlayerDetails([...currentDetails, ...officialDetails, ...historical.details]));
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
        <p>Aucun joueur trouve pour "{search}"</p>
      </div>
    );
  }

  return (
    <div>
      {/* Legende colonnes */}
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
        <span style={{ textAlign: 'center' }}>Top 8 / joues</span>
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
                {r.points > 0 ? formatPoints(r.points) : <span style={{ color: '#444', fontSize: '12px' }}>-</span>}
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
                {r.tournaments_played && r.tournaments_played > 8 ? `8/${r.tournaments_played}` : (r.tournaments_played ?? 0)}
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
          careerStats={playerCareerStats}
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
          {SOURCE_LABELS[source]?.label} - {rows.length} joueurs
          {source === 'supabase' && (
            <span style={{ color: '#444', fontSize: '11px', marginLeft: '4px' }}>
              - maj {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </span>
        {source === 'supabase' && (
          <button
            onClick={forceRefresh}
            disabled={loading}
            title="Rafraichir depuis Supabase"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'rgba(74,213,105,0.08)', color: '#4ad569',
              border: '1px solid rgba(74,213,105,0.2)',
              borderRadius: '6px', padding: '4px 10px',
              fontSize: '11px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            <RefreshCw size={11} className={loading ? 'spin' : ''} />
            Rafraichir
          </button>
        )}
      </div>
    </div>
  );
}

//
export default function Classements() {
  const { lang } = useI18n();
  useSeo({
    title: "Classement Padel Maurice 2026 - Ranking Officiel MPL",
    description: "Classement officiel padel Mauritius 2026 : Hommes, Dames, Mixte, Junior. Top 10 scores des 12 derniers mois. Mauritius Padel League.",
    keywords: "padel ranking mauritius, classement padel mauritius 2026, padel ranking MPL, classement padel hommes dames",
    canonical: "https://padelleague.mu/#/classements",
  });
  const [activeTab, setActiveTab] = useState<Division>('MEN');
  const [search, setSearch]       = useState('');
  // Count reel par division - mis a jour depuis RankingTable via callback
  const [divCounts, setDivCounts] = useState<Partial<Record<Division,number>>>({});
  const updateCount = (div: Division, n: number) => setDivCounts(prev => ({ ...prev, [div]: n }));

  const activeConfig = TABS.find(t => t.key === activeTab)!;

  const stats = [
    { label: lang === 'fr' ? 'Hommes classes' : 'Men ranked',    val: divCounts['MEN']    != null ? `${divCounts['MEN']}`    : '-', icon: 'H', color: '#3b82f6' },
    { label: lang === 'fr' ? 'Dames classees'  : 'Women ranked', val: divCounts['WOMEN']  != null ? `${divCounts['WOMEN']}`  : '-', icon: 'D', color: '#ec4899' },
    { label: lang === 'fr' ? 'Juniors classes' : 'Juniors',      val: divCounts['JUNIOR'] != null ? `${divCounts['JUNIOR']}` : '-', icon: 'J', color: '#f59e0b' },
    { label: lang === 'fr' ? 'Mixte classes'   : 'Mixed',        val: divCounts['MIXTE']  != null ? `${divCounts['MIXTE']}`  : '-', icon: 'M', color: '#8b5cf6' },
  ];

  return (
    <Layout>
      <section style={{ padding: '88px 24px 60px', minHeight: '80vh', position: 'relative', overflowY: 'hidden', overflowX: 'auto', background: 'linear-gradient(180deg, #0a0a0a 0%, #0c0c0c 100%)' }}>
        {/* Dot-wave droit, faible opacite */}
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
                placeholder={lang === 'fr' ? 'Rechercher un joueur...' : 'Search a player...'}
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
              &nbsp;-&nbsp;
              <span style={{ color: '#666', fontWeight: 400, fontSize: '13px' }}>
                {divCounts[activeTab] != null ? `${divCounts[activeTab]} joueurs` : '-'}
              </span>
            </div>
          </div>

          {/* Tableau */}
          <GlassCard style={{ padding: '16px 0' }}>
            <div style={{ padding: '0 16px 12px', color: '#777', fontSize: '12px' }}>Ranking officiel: meilleurs 8 resultats sur les 12 derniers mois.</div>
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



