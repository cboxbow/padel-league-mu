import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Award,
  CalendarDays,
  Database,
  MapPin,
  Medal,
  RefreshCw,
  Search,
  ShieldCheck,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { Layout, GlassCard } from '@/components/Layout';
import { DotWaveBackground } from '@/components/DotWaveBackground';
import { getSupabaseAnonKey, getSupabaseRestUrl, isSupabaseConnected } from '@/lib/supabase';
import { useSeo } from '@/hooks/useSeo';

type DivisionKey = 'men' | 'women' | 'mixed' | 'junior';
type ViewKey = 'tournois' | 'joueurs' | DivisionKey | 'clubs' | 'records';

interface HistoricalResult {
  id: string;
  event_key: string;
  event_name: string;
  event_year: number;
  season: number;
  category: string;
  division: DivisionKey;
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

interface CurrentRankingInfo {
  player_name: string;
  division: DivisionKey;
  rank: number;
  points: number;
  tournaments_played?: number;
}

interface TournamentGroup {
  key: string;
  eventName: string;
  year: number;
  date: string;
  category: string;
  club: string;
  region: string;
  rows: HistoricalResult[];
  divisions: DivisionKey[];
}

interface PlayerSummary {
  name: string;
  tournaments: number;
  wins: number;
  podiums: number;
  points: number;
  seasons: Set<number>;
  partners: Map<string, number>;
  clubs: Map<string, number>;
  divisions: Set<DivisionKey>;
  bestResult?: HistoricalResult;
}

type CurrentRankingMap = Map<string, CurrentRankingInfo[]>;

interface ClubSummary {
  club: string;
  rows: number;
  tournamentGroups: number;
  wins: number;
  podiums: number;
  points: number;
  seasons: Set<number>;
  categories: Set<string>;
  categoryCounts: Map<string, number>;
  divisions: Set<DivisionKey>;
  latestDate: string;
  latestEvent: string;
  topWinners: Map<string, number>;
}

interface ClubEventGroup {
  key: string;
  eventName: string;
  date: string;
  year: number;
  category: string;
  region: string;
  rows: HistoricalResult[];
  divisions: DivisionKey[];
  winners: HistoricalResult[];
}

const DIVISION_CONFIG: Record<DivisionKey, { label: string; color: string; bg: string }> = {
  men: { label: 'Hommes', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  women: { label: 'Dames', color: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
  mixed: { label: 'Mixte', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  junior: { label: 'Junior', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
};

const CATEGORY_COLORS: Record<string, string> = {
  M25: '#10b981',
  M50: '#3b82f6',
  M100: '#f59e0b',
  M250: '#ef4444',
  M500: '#4ad569',
  M1000: '#a78bfa',
  U11: '#f59e0b',
  U13: '#f59e0b',
  U15: '#f59e0b',
};

const RESULT_COLUMNS = [
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

function normalizeName(value: unknown): string {
  const cleaned = cleanText(value).replace(/\s+/g, ' ').toUpperCase();
  const aliases: Record<string, string> = {
    'DALLE GRAVE TIPPI': 'TIPPI DALLE-GRAVE',
    'TIPPI DALLE GRAVE': 'TIPPI DALLE-GRAVE',
    'DANE DOHERTY BIGARA': 'DANE DOHERTY-BIGARA',
    'SOOHINESH DIP': 'DIP SOOHINESH',
    'ROBERT LARRY': 'LARRY ROBERT',
    'SHEIKH ALI NASSIM': 'NASSIM SHEIKH ALI',
    'SHONA LI QUERY': 'SHONA-LI QUERY',
    'ZAKARIA AFIF': 'AFIF ZAKARIA',
    'JOHAN ESPITALIER NOEL': 'JOHAN ESPITALIER-NOEL',
  };
  const key = cleaned
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  return aliases[key] || cleaned;
}

function playerKey(value: unknown): string {
  return normalizeName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function roundPoints(value: unknown): number {
  return Math.ceil(Number(value) || 0);
}

async function fetchRestPage<T>(table: string, params: URLSearchParams): Promise<T[]> {
  const restUrl = getSupabaseRestUrl();
  const anonKey = getSupabaseAnonKey();
  if (!restUrl || !anonKey) return [];

  const res = await fetch(`${restUrl}/${table}?${params.toString()}`, {
    cache: 'no-store',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
  return await res.json() as T[];
}

function formatPoints(value: unknown): string {
  return roundPoints(value).toLocaleString('fr-FR');
}

function formatDate(value?: string | null): string {
  if (!value) return 'Date a confirmer';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date a confirmer';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function rankNumber(row: HistoricalResult): number {
  return Number(row.rank_min ?? row.rank_max ?? row.rank_label ?? 999);
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function primaryPartner(row: HistoricalResult, playerName: string): string {
  const p1 = normalizeName(row.player1_name);
  const p2 = normalizeName(row.player2_name);
  const target = normalizeName(playerName);
  if (p1 === target) return normalizeName(row.player2_name);
  if (p2 === target) return normalizeName(row.player1_name);
  return p2 || p1;
}

function divisionLabel(division: string): string {
  return DIVISION_CONFIG[division as DivisionKey]?.label ?? division;
}

function qualityLabel(rows: HistoricalResult[]): { text: string; color: string } {
  const missingDates = rows.filter(row => !row.event_date).length;
  if (!rows.length) return { text: 'Aucune donnee chargee', color: '#ef4444' };
  if (missingDates === 0) return { text: 'Archives verifiees', color: '#4ad569' };
  return { text: `${missingDates} lignes a dater`, color: '#f59e0b' };
}

function buildTournamentGroups(rows: HistoricalResult[]): TournamentGroup[] {
  const map = new Map<string, TournamentGroup>();
  for (const row of rows) {
    const key = row.event_key || `${row.event_year}-${row.event_name}-${row.division}-${row.club_name}-${row.event_date}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        eventName: row.event_name,
        year: Number(row.event_year || row.season || 0),
        date: row.event_date || '',
        category: row.category || row.junior_category || '',
        club: row.club_name,
        region: row.region || '',
        rows: [row],
        divisions: [row.division],
      });
    } else {
      existing.rows.push(row);
      if (!existing.divisions.includes(row.division)) existing.divisions.push(row.division);
      if (!existing.date && row.event_date) existing.date = row.event_date;
    }
  }

  return Array.from(map.values())
    .map(group => ({
      ...group,
      rows: group.rows.sort((a, b) => rankNumber(a) - rankNumber(b)),
      divisions: unique(group.divisions),
    }))
    .sort((a, b) => {
      const at = a.date ? new Date(a.date).getTime() : 0;
      const bt = b.date ? new Date(b.date).getTime() : 0;
      return bt - at || b.year - a.year || a.eventName.localeCompare(b.eventName);
    });
}

function baseEventName(row: HistoricalResult): string {
  return (row.event_name || '').replace(/ - (MEN|WOMEN|MIXED|JUNIOR)$/i, '');
}

function clubEventKey(row: HistoricalResult): string {
  return `${row.event_date || row.event_year}|${baseEventName(row)}|${row.category || row.junior_category}`;
}

function buildClubEventGroups(rows: HistoricalResult[]): ClubEventGroup[] {
  const map = new Map<string, ClubEventGroup>();
  for (const row of rows) {
    const key = clubEventKey(row);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        eventName: baseEventName(row) || row.event_name,
        date: row.event_date || '',
        year: Number(row.event_year || row.season || 0),
        category: row.category || row.junior_category || '',
        region: row.region || '',
        rows: [row],
        divisions: [row.division],
        winners: rankNumber(row) === 1 ? [row] : [],
      });
    } else {
      existing.rows.push(row);
      if (!existing.divisions.includes(row.division)) existing.divisions.push(row.division);
      if (rankNumber(row) === 1) existing.winners.push(row);
      if (!existing.date && row.event_date) existing.date = row.event_date;
      if (!existing.region && row.region) existing.region = row.region;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const at = a.date ? new Date(a.date).getTime() : 0;
    const bt = b.date ? new Date(b.date).getTime() : 0;
    return bt - at || b.year - a.year || a.eventName.localeCompare(b.eventName);
  });
}

function buildPlayerSummaries(rows: HistoricalResult[], allowedPlayerKeys?: Set<string>): PlayerSummary[] {
  const map = new Map<string, PlayerSummary>();

  for (const row of rows) {
    for (const rawName of [row.player1_name, row.player2_name]) {
      const name = normalizeName(rawName);
      if (!name) continue;
      if (allowedPlayerKeys && !allowedPlayerKeys.has(playerKey(name))) continue;
      const current = map.get(name) ?? {
        name,
        tournaments: 0,
        wins: 0,
        podiums: 0,
        points: 0,
        seasons: new Set<number>(),
        partners: new Map<string, number>(),
        clubs: new Map<string, number>(),
        divisions: new Set<DivisionKey>(),
      };

      current.tournaments += 1;
      current.points += roundPoints(row.points);
      current.seasons.add(Number(row.event_year || row.season));
      current.divisions.add(row.division);
      current.clubs.set(row.club_name, (current.clubs.get(row.club_name) || 0) + 1);

      const partner = primaryPartner(row, name);
      if (partner && partner !== name) current.partners.set(partner, (current.partners.get(partner) || 0) + 1);

      const rank = rankNumber(row);
      if (rank === 1) current.wins += 1;
      if (rank <= 3) current.podiums += 1;
      if (!current.bestResult || roundPoints(row.points) > roundPoints(current.bestResult.points)) current.bestResult = row;
      map.set(name, current);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
}

function buildClubSummaries(rows: HistoricalResult[]): ClubSummary[] {
  const map = new Map<string, ClubSummary>();
  const groupMap = new Map<string, Set<string>>();
  const categoryGroupMap = new Map<string, Map<string, Set<string>>>();

  for (const row of rows) {
    const club = row.club_name || 'Club a confirmer';
    const eventKey = clubEventKey(row);
    const current = map.get(club) ?? {
      club,
      rows: 0,
      tournamentGroups: 0,
      wins: 0,
      podiums: 0,
      points: 0,
      seasons: new Set<number>(),
      categories: new Set<string>(),
      categoryCounts: new Map<string, number>(),
      divisions: new Set<DivisionKey>(),
      latestDate: '',
      latestEvent: '',
      topWinners: new Map<string, number>(),
    };
    const eventSet = groupMap.get(club) ?? new Set<string>();
    const isNewEventForClub = !eventSet.has(eventKey);
    eventSet.add(eventKey);
    groupMap.set(club, eventSet);

    const categorySetByClub = categoryGroupMap.get(club) ?? new Map<string, Set<string>>();
    const categoryKey = row.category || row.junior_category || 'MPL';
    const categorySet = categorySetByClub.get(categoryKey) ?? new Set<string>();
    categorySet.add(eventKey);
    categorySetByClub.set(categoryKey, categorySet);
    categoryGroupMap.set(club, categorySetByClub);

    current.rows += 1;
    current.points += roundPoints(row.points);
    current.seasons.add(Number(row.event_year || row.season));
    current.categories.add(categoryKey);
    current.divisions.add(row.division);
    if (isNewEventForClub && row.event_date && (!current.latestDate || new Date(row.event_date).getTime() > new Date(current.latestDate).getTime())) {
      current.latestDate = row.event_date;
      current.latestEvent = row.event_name;
    }
    const rank = rankNumber(row);
    if (rank === 1) {
      current.wins += 1;
      const winners = `${normalizeName(row.player1_name)} / ${normalizeName(row.player2_name)}`;
      current.topWinners.set(winners, (current.topWinners.get(winners) || 0) + 1);
    }
    if (rank <= 3) current.podiums += 1;
    map.set(club, current);
  }

  return Array.from(map.values())
    .map(item => {
      const categoryCounts = new Map<string, number>();
      const categorySets = categoryGroupMap.get(item.club);
      categorySets?.forEach((events, category) => categoryCounts.set(category, events.size));
      return {
        ...item,
        categoryCounts,
        tournamentGroups: groupMap.get(item.club)?.size ?? 0,
      };
    })
    .sort((a, b) => b.tournamentGroups - a.tournamentGroups || b.rows - a.rows || a.club.localeCompare(b.club));
}

function topMapLabel(map: Map<string, number>): string {
  const top = Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0];
  return top ? `${top[0]} (${top[1]})` : '-';
}

function compactList(values: Iterable<string>, max = 4): string {
  const list = Array.from(values).filter(Boolean).sort();
  if (!list.length) return '-';
  return list.length > max ? `${list.slice(0, max).join(', ')} +${list.length - max}` : list.join(', ');
}

function categoryMixLabel(map: Map<string, number>): string {
  const order = ['M1000', 'M500', 'M250', 'M100', 'M50', 'M25', 'U15', 'U13', 'U11'];
  const entries = Array.from(map.entries()).sort((a, b) => {
    const ai = order.indexOf(a[0]);
    const bi = order.indexOf(b[0]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a[0].localeCompare(b[0]);
  });
  if (!entries.length) return '-';
  return entries.map(([category, count]) => `${category} ${count}`).join(' · ');
}

function tournamentProfile(map: Map<string, number>): { label: string; value: number; color: string; detail: string }[] {
  const major = (map.get('M1000') || 0) + (map.get('M500') || 0);
  const challenger = (map.get('M250') || 0) + (map.get('M100') || 0) + (map.get('M50') || 0) + (map.get('M25') || 0);
  const junior = (map.get('U11') || 0) + (map.get('U13') || 0) + (map.get('U15') || 0);
  return [
    { label: 'Majeurs', value: major, color: '#a78bfa', detail: 'M1000 + M500' },
    { label: 'Challengers', value: challenger, color: '#3b82f6', detail: 'M250 / M100 / M50 / M25' },
    { label: 'Juniors', value: junior, color: '#f59e0b', detail: 'U11 a U15' },
  ];
}

function topPairDetails(map: Map<string, number>): { pair: string; count: number } | null {
  const top = Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return top ? { pair: top[0], count: top[1] } : null;
}

function pairLabel(row: HistoricalResult): string {
  return `${normalizeName(row.player1_name)} / ${normalizeName(row.player2_name)}`;
}

function pairKey(row: HistoricalResult): string {
  return [playerKey(row.player1_name), playerKey(row.player2_name)].sort().join('|');
}

function seasonsLabel(seasons: Set<number>): string {
  const list = Array.from(seasons).filter(Boolean).sort((a, b) => a - b);
  if (!list.length) return '-';
  if (list.length === 1) return String(list[0]);
  return `${list[0]}-${list[list.length - 1]}`;
}

async function fetchHistoricalResultsPaged(): Promise<HistoricalResult[]> {
  const pageSize = 250;
  const allRows: HistoricalResult[] = [];

  for (let from = 0; from < 12000; from += pageSize) {
    const params = new URLSearchParams({
      select: RESULT_COLUMNS,
      order: 'event_date.desc.nullslast,event_year.desc,rank_min.asc',
      limit: String(pageSize),
      offset: String(from),
    });
    const batch = await fetchRestPage<HistoricalResult>('historical_tournament_results', params);
    allRows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return allRows;
}

async function fetchCurrentRankingsPaged(): Promise<CurrentRankingInfo[]> {
  const pageSize = 500;
  const allRows: CurrentRankingInfo[] = [];

  for (let from = 0; from < 6000; from += pageSize) {
    const params = new URLSearchParams({
      select: 'player_name,division,rank,points,tournaments_played',
      limit: String(pageSize),
      offset: String(from),
    });
    const batch = await fetchRestPage<Record<string, unknown>>('rankings', params);
    allRows.push(...batch.map(row => ({
      player_name: normalizeName(row.player_name),
      division: cleanText(row.division).toLowerCase() as DivisionKey,
      rank: Number(row.rank ?? 0),
      points: roundPoints(row.points),
      tournaments_played: Number(row.tournaments_played ?? 0),
    })).filter(row => row.player_name && row.division));
    if (batch.length < pageSize) break;
  }

  return allRows;
}

function StatTile({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div style={{
      background: `${color}10`,
      border: `1px solid ${color}35`,
      borderRadius: '8px',
      padding: '14px 16px',
      minWidth: '130px',
    }}>
      <div style={{ color, fontWeight: 900, fontSize: '26px', lineHeight: 1, fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
      <div style={{ color: 'white', fontWeight: 800, fontSize: '12px', marginTop: '8px', textTransform: 'uppercase' }}>{label}</div>
      {sub && <div style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function PillButton({ active, children, color, onClick }: { active: boolean; children: ReactNode; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${color}24` : 'rgba(255,255,255,0.04)',
        color: active ? color : '#a0a0a0',
        border: `1px solid ${active ? color : 'rgba(255,255,255,0.10)'}`,
        borderRadius: '8px',
        padding: '9px 14px',
        fontWeight: 800,
        fontSize: '13px',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function TournamentDetailModal({ group, onClose }: { group: TournamentGroup; onClose: () => void }) {
  const color = CATEGORY_COLORS[group.category] ?? '#4ad569';
  const divisionGroups = group.divisions.map(division => ({
    division,
    rows: group.rows.filter(row => row.division === division).sort((a, b) => rankNumber(a) - rankNumber(b)),
  }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          width: 'min(1080px, 100%)',
          maxHeight: '86vh',
          overflow: 'hidden',
          background: '#0d0d0d',
          border: '1px solid rgba(74,213,105,0.28)',
          borderRadius: '10px',
          boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '22px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ color, background: `${color}16`, border: `1px solid ${color}35`, borderRadius: '7px', padding: '4px 9px', fontWeight: 900, fontSize: '12px' }}>
                {group.category || 'MPL'}
              </span>
              <span style={{ color: '#777', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace' }}>{group.year}</span>
              {group.divisions.map(div => (
                <span key={div} style={{ color: DIVISION_CONFIG[div]?.color, background: DIVISION_CONFIG[div]?.bg, borderRadius: '999px', padding: '3px 8px', fontSize: '11px', fontWeight: 800 }}>
                  {divisionLabel(div)}
                </span>
              ))}
            </div>
            <h2 style={{ color: 'white', fontSize: '26px', margin: 0, fontWeight: 950 }}>{group.eventName}</h2>
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginTop: '10px', color: '#9ca3af', fontSize: '13px' }}>
              <span style={{ display: 'inline-flex', gap: '5px', alignItems: 'center' }}><CalendarDays size={13} /> {formatDate(group.date)}</span>
              <span style={{ display: 'inline-flex', gap: '5px', alignItems: 'center' }}><MapPin size={13} /> {group.club}</span>
              {group.region && <span>{group.region}</span>}
              <span>{group.rows.length} lignes</span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.04)',
              color: '#999',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ overflow: 'auto', padding: '18px 24px 24px' }}>
          {divisionGroups.map(({ division, rows }) => {
            const cfg = DIVISION_CONFIG[division] ?? DIVISION_CONFIG.men;
            return (
              <div key={division} style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <Trophy size={16} color={cfg.color} />
                  <h3 style={{ color: cfg.color, margin: 0, fontSize: '15px', fontWeight: 900 }}>{cfg.label}</h3>
                  <span style={{ color: '#666', fontSize: '12px' }}>{rows.length} paires</span>
                </div>
                <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', overflow: 'hidden', minWidth: '760px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1.2fr 1fr 1fr 110px', gap: '12px', padding: '10px 14px', background: 'rgba(255,255,255,0.025)', color: '#666', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>
                    <span>Rang</span>
                    <span>Paire</span>
                    <span>Joueur 1</span>
                    <span>Joueur 2</span>
                    <span style={{ textAlign: 'right' }}>Points</span>
                  </div>
                  {rows.map(row => {
                    const rank = rankNumber(row);
                    const isWinner = rank === 1;
                    const isPodium = rank <= 3;
                    return (
                      <div key={row.id} style={{
                        display: 'grid',
                        gridTemplateColumns: '80px 1.2fr 1fr 1fr 110px',
                        gap: '12px',
                        alignItems: 'center',
                        padding: '11px 14px',
                        borderTop: '1px solid rgba(255,255,255,0.045)',
                        background: isWinner ? 'rgba(74,213,105,0.10)' : isPodium ? `${cfg.color}08` : 'transparent',
                      }}>
                        <span style={{ color: isWinner ? '#4ad569' : isPodium ? '#f59e0b' : '#888', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace' }}>
                          #{row.rank_label || rank}
                        </span>
                        <span style={{ color: 'white', fontWeight: 900, fontSize: '13px' }}>{row.team_name || `${row.player1_name} / ${row.player2_name}`}</span>
                        <span style={{ color: '#d0d0d0', fontWeight: 800, fontSize: '13px' }}>{row.player1_name}</span>
                        <span style={{ color: '#d0d0d0', fontWeight: 800, fontSize: '13px' }}>{row.player2_name}</span>
                        <span style={{ color, fontWeight: 950, fontFamily: 'JetBrains Mono, monospace', textAlign: 'right' }}>{formatPoints(row.points)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ClubDetailModal({ clubName, rows, onClose }: { clubName: string; rows: HistoricalResult[]; onClose: () => void }) {
  const clubRows = rows.filter(row => row.club_name === clubName);
  const summary = buildClubSummaries(clubRows)[0];
  const events = buildClubEventGroups(clubRows);
  const players = buildPlayerSummaries(clubRows).slice(0, 8);
  const topPairs = Array.from(summary?.topWinners.entries() ?? [])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6);
  const profile = tournamentProfile(summary?.categoryCounts ?? new Map());

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 320,
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          width: 'min(1180px, 100%)',
          maxHeight: '86vh',
          overflow: 'hidden',
          background: '#0d0d0d',
          border: '1px solid rgba(167,139,250,0.30)',
          borderRadius: '10px',
          boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '22px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px' }}>
          <div>
            <div style={{ color: '#a78bfa', fontWeight: 900, fontSize: '13px', textTransform: 'uppercase', marginBottom: '8px' }}>Club organisateur</div>
            <h2 style={{ color: 'white', fontSize: '30px', margin: 0, fontWeight: 950, lineHeight: 1.1 }}>{clubName}</h2>
            <div style={{ color: '#777', fontSize: '13px', marginTop: '8px' }}>
              {seasonsLabel(summary?.seasons ?? new Set())} · {events.length} evenement{events.length > 1 ? 's' : ''} organise{events.length > 1 ? 's' : ''} · {compactList(Array.from(summary?.divisions ?? []).map(divisionLabel))}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.04)',
              color: '#999',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ overflow: 'auto', padding: '18px 24px 24px', display: 'grid', gap: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '12px' }}>
            <StatTile label="Evenements" value={events.length} sub="dates tournoi" color="#3b82f6" />
            <StatTile label="Titres attribues" value={summary?.wins ?? 0} sub="paires gagnantes" color="#f59e0b" />
            <StatTile label="Podiums attribues" value={summary?.podiums ?? 0} sub="paires top 3" color="#4ad569" />
            <StatTile label="Joueurs marquants" value={players.length} sub="meilleurs profils ici" color="#a78bfa" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,0.8fr) minmax(360px,1.2fr)', gap: '14px' }}>
            <GlassCard style={{ padding: '16px' }}>
              <h3 style={{ color: 'white', fontSize: '15px', margin: '0 0 12px', fontWeight: 900 }}>Profil tournois</h3>
              <div style={{ display: 'grid', gap: '10px' }}>
                {profile.map(item => (
                  <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: '#d0d0d0', fontSize: '13px', fontWeight: 850 }}>{item.label}</div>
                      <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>{item.detail}</div>
                    </div>
                    <div style={{ color: item.color, fontWeight: 950, fontFamily: 'JetBrains Mono, monospace', fontSize: '18px' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard style={{ padding: '16px' }}>
              <h3 style={{ color: 'white', fontSize: '15px', margin: '0 0 12px', fontWeight: 900 }}>Meilleures paires sur ce club</h3>
              <div style={{ display: 'grid', gap: '9px' }}>
                {topPairs.length ? topPairs.map(([pair, count], index) => (
                  <div key={pair} style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: '10px', alignItems: 'center' }}>
                    <span style={{ color: '#a78bfa', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace' }}>#{index + 1}</span>
                    <span style={{ color: 'white', fontWeight: 850, fontSize: '12px', lineHeight: 1.25, overflowWrap: 'anywhere' }}>{pair}</span>
                    <span style={{ color: '#f59e0b', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace' }}>{count}</span>
                  </div>
                )) : <div style={{ color: '#777', fontSize: '13px' }}>Aucune paire gagnante detectee.</div>}
              </div>
            </GlassCard>
          </div>

          <GlassCard style={{ padding: 0, overflow: 'auto', maxHeight: '360px', overscrollBehavior: 'contain' }}>
            <div style={{ padding: '14px 14px 0', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
              <h3 style={{ color: 'white', fontSize: '15px', margin: 0, fontWeight: 900 }}>Evenements organises</h3>
              <span style={{ color: '#777', fontSize: '12px' }}>{events.length} evenement{events.length > 1 ? 's' : ''}</span>
            </div>
            <div style={{ minWidth: '980px', padding: '12px 14px', display: 'grid', gridTemplateColumns: '120px 90px minmax(230px,1fr) 180px minmax(260px,1.1fr)', gap: '12px', color: '#666', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span>Date</span><span>Cat</span><span>Tournoi</span><span>Divisions</span><span>Vainqueurs</span>
            </div>
            {events.slice(0, 80).map(event => {
              const color = CATEGORY_COLORS[event.category] ?? '#4ad569';
              const winnerBlocks = event.divisions
                .map(division => ({
                  division,
                  winners: event.winners.filter(winner => winner.division === division),
                }))
                .filter(block => block.winners.length > 0);
              return (
                <div key={event.key} style={{ minWidth: '980px', padding: '12px 14px', display: 'grid', gridTemplateColumns: '120px 90px minmax(230px,1fr) 180px minmax(260px,1.1fr)', gap: '12px', alignItems: 'start', borderBottom: '1px solid rgba(255,255,255,0.045)' }}>
                  <span style={{ color: '#777', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>{formatDate(event.date)}</span>
                  <span style={{ color, fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>{event.category}</span>
                  <div>
                    <div style={{ color: 'white', fontWeight: 850, fontSize: '12px', lineHeight: 1.25 }}>{event.eventName}</div>
                    {event.region && <div style={{ color: '#666', fontSize: '11px', marginTop: '3px' }}>{event.region}</div>}
                  </div>
                  <span style={{ color: '#9ca3af', fontSize: '12px' }}>{compactList(event.divisions.map(divisionLabel))}</span>
                  <div style={{ display: 'grid', gap: '5px' }}>
                    {winnerBlocks.length ? winnerBlocks.map(block => (
                      <div key={block.division} style={{ display: 'grid', gap: '2px' }}>
                        <div style={{ color: DIVISION_CONFIG[block.division]?.color ?? '#f59e0b', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}>
                          {divisionLabel(block.division)}
                        </div>
                        {block.winners.map(winner => (
                          <div key={winner.id} style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 850, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
                            {normalizeName(winner.player1_name)} / {normalizeName(winner.player2_name)}
                          </div>
                        ))}
                      </div>
                    )) : <span style={{ color: '#777', fontSize: '12px' }}>-</span>}
                  </div>
                </div>
              );
            })}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function TournamentCard({ group, onOpen }: { group: TournamentGroup; onOpen: () => void }) {
  const winners = group.rows.filter(row => rankNumber(row) === 1).slice(0, 4);
  const color = CATEGORY_COLORS[group.category] ?? '#4ad569';

  return (
    <button
      onClick={onOpen}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        textAlign: 'left',
        cursor: 'pointer',
        width: '100%',
        color: 'inherit',
      }}
    >
    <GlassCard style={{ padding: 0, overflow: 'hidden', height: '100%' }}>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'grid', gridTemplateColumns: '1fr auto', gap: '14px', alignItems: 'start' }}>
        <div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ color, background: `${color}16`, border: `1px solid ${color}35`, borderRadius: '7px', padding: '4px 9px', fontWeight: 900, fontSize: '12px' }}>
              {group.category || 'MPL'}
            </span>
            <span style={{ color: '#777', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace' }}>{group.year}</span>
            {group.divisions.map(div => (
              <span key={div} style={{ color: DIVISION_CONFIG[div]?.color, background: DIVISION_CONFIG[div]?.bg, borderRadius: '999px', padding: '3px 8px', fontSize: '11px', fontWeight: 800 }}>
                {divisionLabel(div)}
              </span>
            ))}
          </div>
          <h3 style={{ color: 'white', fontSize: '18px', margin: 0, fontWeight: 900 }}>{group.eventName}</h3>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '10px', color: '#888', fontSize: '13px' }}>
            <span style={{ display: 'inline-flex', gap: '5px', alignItems: 'center' }}><CalendarDays size={13} /> {formatDate(group.date)}</span>
            <span style={{ display: 'inline-flex', gap: '5px', alignItems: 'center' }}><MapPin size={13} /> {group.club}</span>
            {group.region && <span>{group.region}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', color: '#777', fontSize: '12px' }}>
          <strong style={{ color: '#d0d0d0', fontSize: '18px', display: 'block' }}>{group.rows.length}</strong>
          lignes
        </div>
      </div>
      <div style={{ padding: '14px 20px', display: 'grid', gap: '9px' }}>
        {winners.length ? winners.map(row => (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center', background: 'rgba(74,213,105,0.08)', border: '1px solid rgba(74,213,105,0.16)', borderRadius: '8px', padding: '10px 12px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#4ad569', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>Vainqueurs {divisionLabel(row.division)}</div>
              <div style={{ color: 'white', fontWeight: 900, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {normalizeName(row.player1_name)} / {normalizeName(row.player2_name)}
              </div>
            </div>
            <div style={{ color: color, fontWeight: 900, fontFamily: 'JetBrains Mono, monospace' }}>{formatPoints(row.points)} pts</div>
          </div>
        )) : (
          <div style={{ color: '#777', fontSize: '13px' }}>Aucun vainqueur detecte.</div>
        )}
      </div>
    </GlassCard>
    </button>
  );
}

function CurrentRankingBadges({ player, currentRankings }: { player: PlayerSummary; currentRankings: CurrentRankingMap }) {
  const current = (currentRankings.get(playerKey(player.name)) ?? []).sort((a, b) => a.rank - b.rank);
  if (!current.length) {
    return (
      <span style={{ color: '#888', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '999px', padding: '4px 8px', fontSize: '10px', fontWeight: 900 }}>
        Historique seul
      </span>
    );
  }
  return (
    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', minWidth: 0 }}>
      {current.map(item => {
        const cfg = DIVISION_CONFIG[item.division] ?? DIVISION_CONFIG.men;
        return (
          <span key={`${item.division}-${item.rank}`} style={{ color: cfg.color, background: `${cfg.color}14`, border: `1px solid ${cfg.color}30`, borderRadius: '999px', padding: '4px 8px', fontSize: '10px', fontWeight: 900, whiteSpace: 'nowrap' }}>
            {divisionLabel(item.division)} #{item.rank} · {formatPoints(item.points)}
          </span>
        );
      })}
    </div>
  );
}

function PlayerRow({
  player,
  index,
  color,
  currentRankings,
  onOpen,
}: {
  player: PlayerSummary;
  index: number;
  color: string;
  currentRankings: CurrentRankingMap;
  onOpen?: (playerName: string) => void;
}) {
  const divisions = Array.from(player.divisions).map(div => divisionLabel(div)).join(', ');
  return (
    <button
      onClick={() => onOpen?.(player.name)}
      style={{
      display: 'grid',
      gridTemplateColumns: '54px minmax(220px,1fr) minmax(210px,1fr) repeat(4, minmax(80px,110px)) minmax(220px,1fr)',
      gap: '12px',
      alignItems: 'center',
      padding: '13px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.045)',
      background: index < 3 ? `${color}10` : 'transparent',
      minWidth: '1180px',
      width: '100%',
      border: 'none',
      textAlign: 'left',
      cursor: onOpen ? 'pointer' : 'default',
      font: 'inherit',
    }}>
      <div style={{ color: index < 3 ? '#f59e0b' : color, fontWeight: 900, fontFamily: 'JetBrains Mono, monospace' }}>#{index + 1}</div>
      <div>
        <div style={{ color: 'white', fontWeight: 900, fontSize: '14px' }}>{player.name}</div>
        <div style={{ color: '#666', fontSize: '11px', marginTop: '3px' }}>{divisions}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <CurrentRankingBadges player={player} currentRankings={currentRankings} />
      </div>
      <div style={{ color, fontWeight: 900, fontFamily: 'JetBrains Mono, monospace' }}>{formatPoints(player.points)}</div>
      <div style={{ color: '#f59e0b', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace' }}>{player.wins}</div>
      <div style={{ color: '#a78bfa', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace' }}>{player.podiums}</div>
      <div style={{ color: '#d0d0d0', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace' }}>{player.tournaments}</div>
      <div style={{ color: '#9ca3af', fontSize: '12px' }}>{topMapLabel(player.partners)}</div>
    </button>
  );
}

function DivisionPlayerView({ division, rows, currentRankings, onOpenPlayer, allowedPlayerKeys }: { division: DivisionKey; rows: HistoricalResult[]; currentRankings: CurrentRankingMap; onOpenPlayer: (playerName: string) => void; allowedPlayerKeys?: Set<string> }) {
  const cfg = DIVISION_CONFIG[division];
  const divisionRows = rows.filter(row => row.division === division);
  const players = buildPlayerSummaries(divisionRows, allowedPlayerKeys);
  const wins = divisionRows.filter(row => rankNumber(row) === 1).length;
  const groups = buildTournamentGroups(divisionRows);

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '12px' }}>
        <StatTile label="Joueurs" value={players.length.toLocaleString('fr-FR')} sub={`division ${cfg.label}`} color={cfg.color} />
        <StatTile label="Resultats" value={divisionRows.length.toLocaleString('fr-FR')} sub="lignes historiques" color="#4ad569" />
        <StatTile label="Tournois" value={groups.length} sub="groupes division" color="#f59e0b" />
        <StatTile label="Victoires" value={wins} sub="titres detectes" color="#a78bfa" />
      </div>
      <GlassCard style={{ padding: 0, overflowX: 'auto' }}>
        <div style={{ minWidth: '1180px', padding: '14px 16px', display: 'grid', gridTemplateColumns: '54px minmax(220px,1fr) minmax(210px,1fr) repeat(4, minmax(80px,110px)) minmax(220px,1fr)', gap: '12px', color: '#666', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span>#</span><span>Joueur</span><span>Statut actuel</span><span>Pts carriere</span><span>Victoires</span><span>Podiums</span><span>Joues</span><span>Partenaire principal</span>
        </div>
        {players.slice(0, 160).map((player, index) => <PlayerRow key={player.name} player={player} index={index} color={cfg.color} currentRankings={currentRankings} onOpen={onOpenPlayer} />)}
      </GlassCard>
    </div>
  );
}

function CareerPlayersView({ rows, currentRankings, onOpenPlayer, allowedPlayerKeys }: { rows: HistoricalResult[]; currentRankings: CurrentRankingMap; onOpenPlayer: (playerName: string) => void; allowedPlayerKeys?: Set<string> }) {
  const players = buildPlayerSummaries(rows, allowedPlayerKeys);
  const activePlayers = players.filter(player => (currentRankings.get(playerKey(player.name)) ?? []).length > 0);
  const historicalOnly = players.length - activePlayers.length;

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '12px' }}>
        <StatTile label="Joueurs carriere" value={players.length.toLocaleString('fr-FR')} sub="depuis 2023" color="#f59e0b" />
        <StatTile label="Classes actuellement" value={activePlayers.length.toLocaleString('fr-FR')} sub="ranking actif" color="#4ad569" />
        <StatTile label="Historique seul" value={historicalOnly.toLocaleString('fr-FR')} sub="non classes aujourd'hui" color="#8b5cf6" />
        <StatTile label="Resultats" value={rows.length.toLocaleString('fr-FR')} sub="lignes filtrees" color="#3b82f6" />
      </div>
      <GlassCard style={{ padding: 0, overflowX: 'auto' }}>
        <div style={{ minWidth: '1180px', padding: '14px 16px', display: 'grid', gridTemplateColumns: '54px minmax(220px,1fr) minmax(210px,1fr) repeat(4, minmax(80px,110px)) minmax(220px,1fr)', gap: '12px', color: '#666', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span>#</span><span>Joueur</span><span>Statut actuel</span><span>Pts carriere</span><span>Victoires</span><span>Podiums</span><span>Joues</span><span>Partenaire principal</span>
        </div>
        {players.slice(0, 300).map((player, index) => (
          <PlayerRow key={player.name} player={player} index={index} color="#f59e0b" currentRankings={currentRankings} onOpen={onOpenPlayer} />
        ))}
      </GlassCard>
    </div>
  );
}

function PlayerCareerModal({
  playerName,
  rows,
  currentRankings,
  onClose,
}: {
  playerName: string;
  rows: HistoricalResult[];
  currentRankings: CurrentRankingMap;
  onClose: () => void;
}) {
  const key = playerKey(playerName);
  const playerRows = rows
    .filter(row => playerKey(row.player1_name) === key || playerKey(row.player2_name) === key)
    .sort((a, b) => {
      const dateA = a.event_date ? new Date(a.event_date).getTime() : 0;
      const dateB = b.event_date ? new Date(b.event_date).getTime() : 0;
      return dateB - dateA || rankNumber(a) - rankNumber(b);
    });
  const summary = buildPlayerSummaries(playerRows)[0];
  const current = (currentRankings.get(key) ?? []).sort((a, b) => a.rank - b.rank);
  const partners = summary ? Array.from(summary.partners.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5) : [];
  const clubs = summary ? Array.from(summary.clubs.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5) : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 340,
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          width: 'min(1180px, 100%)',
          maxHeight: '86vh',
          overflow: 'hidden',
          background: '#0d0d0d',
          border: '1px solid rgba(245,158,11,0.30)',
          borderRadius: '10px',
          boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '22px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px' }}>
          <div>
            <div style={{ color: '#f59e0b', fontWeight: 900, fontSize: '13px', textTransform: 'uppercase', marginBottom: '8px' }}>
              Profil joueur historique
            </div>
            <h2 style={{ color: 'white', fontSize: '30px', margin: 0, fontWeight: 950, lineHeight: 1.1 }}>{normalizeName(playerName)}</h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '10px' }}>
              {current.length ? current.map(item => (
                <span key={`${item.division}-${item.rank}`} style={{ color: '#4ad569', background: 'rgba(74,213,105,0.10)', border: '1px solid rgba(74,213,105,0.25)', borderRadius: '999px', padding: '4px 9px', fontSize: '11px', fontWeight: 900 }}>
                  {divisionLabel(item.division)} #{item.rank} · {formatPoints(item.points)} pts
                </span>
              )) : (
                <span style={{ color: '#aaa', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '999px', padding: '4px 9px', fontSize: '11px', fontWeight: 900 }}>
                  Historique uniquement
                </span>
              )}
              <span style={{ color: '#777', fontSize: '12px' }}>{playerRows.length} resultats carriere</span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.04)',
              color: '#999',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', overflowX: 'hidden', padding: '18px 24px 24px', display: 'grid', gap: '18px', minHeight: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '12px' }}>
            <StatTile label="Pts carriere" value={formatPoints(summary?.points ?? 0)} sub="depuis 2023" color="#f59e0b" />
            <StatTile label="Victoires" value={summary?.wins ?? 0} sub="titres detectes" color="#4ad569" />
            <StatTile label="Podiums" value={summary?.podiums ?? 0} sub="top 3" color="#a78bfa" />
            <StatTile label="Saisons" value={seasonsLabel(summary?.seasons ?? new Set())} sub="participation" color="#3b82f6" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '14px' }}>
            <GlassCard style={{ padding: '16px' }}>
              <h3 style={{ color: 'white', fontSize: '15px', margin: '0 0 12px', fontWeight: 900 }}>Partenaires principaux</h3>
              <div style={{ display: 'grid', gap: '8px' }}>
                {partners.length ? partners.map(([partner, count]) => (
                  <div key={partner} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', color: '#d0d0d0', fontSize: '13px' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{partner}</span>
                    <strong style={{ color: '#f59e0b' }}>{count}</strong>
                  </div>
                )) : <span style={{ color: '#777', fontSize: '13px' }}>Aucun partenaire detecte.</span>}
              </div>
            </GlassCard>
            <GlassCard style={{ padding: '16px' }}>
              <h3 style={{ color: 'white', fontSize: '15px', margin: '0 0 12px', fontWeight: 900 }}>Performance par club</h3>
              <div style={{ display: 'grid', gap: '8px' }}>
                {clubs.length ? clubs.map(([club, count]) => (
                  <div key={club} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', color: '#d0d0d0', fontSize: '13px' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club}</span>
                    <strong style={{ color: '#3b82f6' }}>{count}</strong>
                  </div>
                )) : <span style={{ color: '#777', fontSize: '13px' }}>Aucun club detecte.</span>}
              </div>
            </GlassCard>
          </div>

          <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
              <h3 style={{ color: 'white', fontSize: '15px', margin: 0, fontWeight: 900 }}>Resultats detailles</h3>
              <span style={{ color: '#777', fontSize: '12px' }}>{playerRows.length} lignes</span>
            </div>
            <div style={{ overflow: 'auto', maxHeight: 'min(42vh, 390px)' }}>
              <div style={{ minWidth: '980px', display: 'grid', gridTemplateColumns: '112px 70px minmax(190px,1fr) minmax(170px,1fr) 100px 74px 90px', gap: '12px', padding: '12px 14px', color: '#666', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 2, background: '#111' }}>
                <span>Date</span><span>Cat</span><span>Club</span><span>Partenaire</span><span>Division</span><span>Rang</span><span style={{ textAlign: 'right' }}>Points</span>
              </div>
              {playerRows.map(row => {
                const cfg = DIVISION_CONFIG[row.division] ?? DIVISION_CONFIG.men;
                const partner = primaryPartner(row, playerName);
                const rank = rankNumber(row);
                return (
                  <div key={row.id} style={{ minWidth: '980px', display: 'grid', gridTemplateColumns: '112px 70px minmax(190px,1fr) minmax(170px,1fr) 100px 74px 90px', gap: '12px', alignItems: 'center', padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.045)', background: rank === 1 ? 'rgba(74,213,105,0.08)' : rank <= 3 ? 'rgba(245,158,11,0.06)' : 'transparent' }}>
                    <span style={{ color: '#777', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace' }}>{formatDate(row.event_date)}</span>
                    <span style={{ color: CATEGORY_COLORS[row.category] ?? '#4ad569', fontSize: '11px', fontWeight: 900 }}>{row.category}</span>
                    <span style={{ color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.event_name}>{row.club_name}</span>
                    <span style={{ color: 'white', fontSize: '12px', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{partner || '-'}</span>
                    <span style={{ color: cfg.color, fontSize: '12px', fontWeight: 900 }}>{divisionLabel(row.division)}</span>
                    <span style={{ color: rank === 1 ? '#4ad569' : rank <= 3 ? '#f59e0b' : '#888', fontSize: '12px', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace' }}>#{row.rank_label || rank}</span>
                    <span style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 950, fontFamily: 'JetBrains Mono, monospace', textAlign: 'right' }}>{formatPoints(row.points)}</span>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function ClubsView({ rows, onOpenClub }: { rows: HistoricalResult[]; onOpenClub: (clubName: string) => void }) {
  const clubs = buildClubSummaries(rows);
  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '12px' }}>
        <StatTile label="Clubs organisateurs" value={clubs.length} sub="lieux historiques" color="#a78bfa" />
        <StatTile label="Tournois archives" value={clubs.reduce((total, item) => total + item.tournamentGroups, 0)} sub="epreuves historiques" color="#3b82f6" />
        <StatTile label="Titres attribues" value={clubs.reduce((total, item) => total + item.wins, 0)} sub="paires gagnantes" color="#f59e0b" />
        <StatTile label="Podiums attribues" value={clubs.reduce((total, item) => total + item.podiums, 0)} sub="paires top 3" color="#4ad569" />
      </div>
      <GlassCard style={{ padding: 0, overflowX: 'auto' }}>
        <div style={{ minWidth: '1180px', padding: '14px 16px', display: 'grid', gridTemplateColumns: '54px minmax(210px,0.9fr) 92px minmax(280px,1.1fr) minmax(190px,0.75fr) minmax(320px,1.2fr)', gap: '12px', color: '#666', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span>#</span><span>Club</span><span>Tournois</span><span>Profil</span><span>Dernier evenement</span><span>Meilleure paire</span>
        </div>
        {clubs.map((item, index) => {
          const topPair = topPairDetails(item.topWinners);
          return (
          <button
            key={item.club}
            onClick={() => onOpenClub(item.club)}
            style={{
              minWidth: '1180px',
              padding: '13px 16px',
              display: 'grid',
              gridTemplateColumns: '54px minmax(210px,0.9fr) 92px minmax(280px,1.1fr) minmax(190px,0.75fr) minmax(320px,1.2fr)',
              gap: '12px',
              alignItems: 'center',
              border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.045)',
              background: index < 3 ? 'rgba(139,92,246,0.08)' : 'transparent',
              color: 'inherit',
              textAlign: 'left',
              cursor: 'pointer',
              width: '100%',
            }}
          >
              <span style={{ color: '#a78bfa', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace' }}>#{index + 1}</span>
              <div>
                <div style={{ color: 'white', fontWeight: 900 }}>{item.club}</div>
                <div style={{ color: '#666', fontSize: '11px', marginTop: '3px' }}>
                  {seasonsLabel(item.seasons)}
                </div>
              </div>
              <span style={{ color: '#3b82f6', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace' }}>{item.tournamentGroups}</span>
              <div title={categoryMixLabel(item.categoryCounts)}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px', alignItems: 'center' }}>
                  {tournamentProfile(item.categoryCounts).map(profile => (
                    <span key={profile.label} style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                      {profile.label} <strong style={{ color: profile.color, fontFamily: 'JetBrains Mono, monospace' }}>{profile.value}</strong>
                    </span>
                  ))}
                </div>
                <div style={{ color: '#666', fontSize: '11px', marginTop: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {compactList(Array.from(item.divisions).map(divisionLabel))}
                </div>
              </div>
              <div>
                <div style={{ color: '#d0d0d0', fontSize: '12px', fontWeight: 800, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{item.latestEvent || '-'}</div>
                <div style={{ color: '#666', fontSize: '11px', marginTop: '3px' }}>{formatDate(item.latestDate)}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 900, lineHeight: 1.25, overflowWrap: 'anywhere', wordBreak: 'normal' }}>
                  {topPair?.pair || '-'}
                </div>
                {topPair && <div style={{ color: '#666', fontSize: '11px', marginTop: '3px' }}>{topPair.count} titre{topPair.count > 1 ? 's' : ''} sur ce club</div>}
              </div>
            </button>
          );
        })}
      </GlassCard>
    </div>
  );
}

function RecordPanel({
  title,
  icon,
  color,
  children,
}: {
  title: string;
  icon: ReactNode;
  color: string;
  children: ReactNode;
}) {
  return (
    <GlassCard style={{ padding: '20px', minWidth: 0 }}>
      <h3 style={{ color: 'white', margin: '0 0 14px', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '16px' }}>
        <span style={{ color }}>{icon}</span> {title}
      </h3>
      <div style={{ display: 'grid', gap: '2px' }}>
        {children}
      </div>
    </GlassCard>
  );
}

function PlayerRecordLine({
  player,
  index,
  value,
  color,
  onOpen,
}: {
  player: PlayerSummary;
  index: number;
  value: string | number;
  color: string;
  onOpen: (playerName: string) => void;
}) {
  return (
    <button
      onClick={() => onOpen(player.name)}
      style={{
        display: 'grid',
        gridTemplateColumns: '34px minmax(0,1fr) auto',
        gap: '10px',
        alignItems: 'center',
        width: '100%',
        padding: '10px 0',
        border: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ color, fontWeight: 950, fontFamily: 'JetBrains Mono, monospace' }}>#{index + 1}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ color: 'white', fontWeight: 900, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
        <span style={{ color: '#666', fontSize: '11px', marginTop: '3px', display: 'block' }}>
          {player.tournaments} resultats · {compactList(Array.from(player.divisions).map(divisionLabel), 3)}
        </span>
      </span>
      <span style={{ color, fontWeight: 950, fontFamily: 'JetBrains Mono, monospace' }}>{value}</span>
    </button>
  );
}

function ClubRecordLine({
  item,
  index,
  color,
  onOpen,
}: {
  item: ClubSummary;
  index: number;
  color: string;
  onOpen: (clubName: string) => void;
}) {
  return (
    <button
      onClick={() => onOpen(item.club)}
      style={{
        display: 'grid',
        gridTemplateColumns: '34px minmax(0,1fr) auto',
        gap: '10px',
        alignItems: 'center',
        width: '100%',
        padding: '10px 0',
        border: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ color, fontWeight: 950, fontFamily: 'JetBrains Mono, monospace' }}>#{index + 1}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ color: 'white', fontWeight: 900, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.club}</span>
        <span style={{ color: '#666', fontSize: '11px', marginTop: '3px', display: 'block' }}>
          {item.wins} titres · {item.podiums} podiums · {seasonsLabel(item.seasons)}
        </span>
      </span>
      <span style={{ color, fontWeight: 950, fontFamily: 'JetBrains Mono, monospace' }}>{item.tournamentGroups}</span>
    </button>
  );
}

export default function Historique() {
  useSeo({
    title: 'Historique Resultats MPL - Mauritius Padel League',
    description: 'Archives historiques MPL depuis 2023: tournois, joueurs, clubs, victoires, podiums et points carriere.',
    keywords: 'historique padel mauritius, archives MPL, resultats padel 2023 2024 2025 2026',
    canonical: 'https://padelleague.mu/#/historique',
  });

  const location = useLocation();
  const initialSearch = useMemo(() => new URLSearchParams(location.search).get('q') ?? '', [location.search]);

  const [rows, setRows] = useState<HistoricalResult[]>([]);
  const [currentRankings, setCurrentRankings] = useState<CurrentRankingMap>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fromSupabase, setFromSupabase] = useState(false);
  const [view, setView] = useState<ViewKey>('tournois');
  const [search, setSearch] = useState(initialSearch);
  const [year, setYear] = useState('all');
  const [division, setDivision] = useState('all');
  const [category, setCategory] = useState('all');
  const [club, setClub] = useState('all');
  const [selectedGroup, setSelectedGroup] = useState<TournamentGroup | null>(null);
  const [selectedClub, setSelectedClub] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');

    if (!isSupabaseConnected()) {
      setRows([]);
      setCurrentRankings(new Map());
      setFromSupabase(false);
      setError('Connexion live indisponible. Les archives seront affichees des que Supabase sera joignable.');
      setLoading(false);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<{ data: null; error: string; timedOut: true }>(resolve => {
      timeoutId = setTimeout(() => resolve({ data: null, error: 'timeout', timedOut: true }), 75000);
    });
    const request = (async (): Promise<{ data: { historical: HistoricalResult[]; rankings: CurrentRankingInfo[] } | null; error: unknown; timedOut: false }> => {
      try {
        const historical = await fetchHistoricalResultsPaged();
        const rankings = await fetchCurrentRankingsPaged();
        return { data: { historical, rankings }, error: null, timedOut: false };
      } catch (requestError) {
        return { data: null, error: requestError, timedOut: false };
      }
    })();
    const { data, error: err, timedOut } = await Promise.race([request, timeout]);
    if (timeoutId) clearTimeout(timeoutId);

    if (timedOut) {
      setRows([]);
      setCurrentRankings(new Map());
      setFromSupabase(false);
      setError('Lecture des archives trop longue. Reessayez dans quelques instants.');
    } else if (err) {
      setRows([]);
      setCurrentRankings(new Map());
      setFromSupabase(false);
      setError(`Connexion archives indisponible: ${String((err as { message?: string })?.message ?? err)}`);
    } else {
      const normalized = (data?.historical ?? []).map(row => ({
        ...row,
        event_year: Number(row.event_year || row.season),
        season: Number(row.season || row.event_year),
        category: cleanText(row.category || row.junior_category).toUpperCase(),
        division: cleanText(row.division).toLowerCase() as DivisionKey,
        club_name: normalizeClubName(row.club_name),
        player1_name: normalizeName(row.player1_name),
        player2_name: normalizeName(row.player2_name),
        points: roundPoints(row.points),
      })).filter(row => row.player1_name && row.player2_name && row.division);
      const rankingMap: CurrentRankingMap = new Map();
      for (const ranking of data?.rankings ?? []) {
        const key = playerKey(ranking.player_name);
        if (!key) continue;
        const list = rankingMap.get(key) ?? [];
        list.push(ranking);
        rankingMap.set(key, list);
      }
      setRows(normalized);
      setCurrentRankings(rankingMap);
      setFromSupabase(normalized.length > 0);
      if (!normalized.length) setError('Aucune archive historique trouvee dans Supabase.');
    }

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const query = new URLSearchParams(location.search).get('q') ?? '';
    if (query) {
      setSearch(query);
      setView('joueurs');
    }
  }, [location.search]);

  const years = useMemo(() => unique(rows.map(row => String(row.event_year))).sort((a, b) => Number(b) - Number(a)), [rows]);
  const categories = useMemo(() => unique(rows.map(row => row.category).filter(Boolean)).sort(), [rows]);
  const clubs = useMemo(() => unique(rows.map(row => row.club_name).filter(Boolean)).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(row => {
      if (year !== 'all' && String(row.event_year) !== year) return false;
      if (division !== 'all' && row.division !== division) return false;
      if (category !== 'all' && row.category !== category) return false;
      if (club !== 'all' && row.club_name !== club) return false;
      if (!q) return true;
      return [
        row.event_name,
        row.club_name,
        row.region,
        row.player1_name,
        row.player2_name,
        row.team_name,
        row.category,
      ].some(value => cleanText(value).toLowerCase().includes(q));
    });
  }, [rows, search, year, division, category, club]);

  const playerFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchedNames = new Set<string>();

    for (const row of rows) {
      if (year !== 'all' && String(row.event_year) !== year) continue;
      if (division !== 'all' && row.division !== division) continue;
      if (category !== 'all' && row.category !== category) continue;
      if (club !== 'all' && row.club_name !== club) continue;

      const p1 = normalizeName(row.player1_name);
      const p2 = normalizeName(row.player2_name);
      if (!q || p1.toLowerCase().includes(q)) matchedNames.add(playerKey(p1));
      if (!q || p2.toLowerCase().includes(q)) matchedNames.add(playerKey(p2));
    }

    if (!q) {
      return rows.filter(row => {
        if (year !== 'all' && String(row.event_year) !== year) return false;
        if (division !== 'all' && row.division !== division) return false;
        if (category !== 'all' && row.category !== category) return false;
        if (club !== 'all' && row.club_name !== club) return false;
        return true;
      });
    }

    return rows.filter(row => {
      if (year !== 'all' && String(row.event_year) !== year) return false;
      if (division !== 'all' && row.division !== division) return false;
      if (category !== 'all' && row.category !== category) return false;
      if (club !== 'all' && row.club_name !== club) return false;
      return matchedNames.has(playerKey(row.player1_name)) || matchedNames.has(playerKey(row.player2_name));
    });
  }, [rows, search, year, division, category, club]);

  const searchedPlayerKeys = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return undefined;
    const keys = new Set<string>();
    for (const row of rows) {
      if (year !== 'all' && String(row.event_year) !== year) continue;
      if (division !== 'all' && row.division !== division) continue;
      if (category !== 'all' && row.category !== category) continue;
      if (club !== 'all' && row.club_name !== club) continue;
      const p1 = normalizeName(row.player1_name);
      const p2 = normalizeName(row.player2_name);
      if (p1.toLowerCase().includes(q)) keys.add(playerKey(p1));
      if (p2.toLowerCase().includes(q)) keys.add(playerKey(p2));
    }
    return keys;
  }, [rows, search, year, division, category, club]);

  const groups = useMemo(() => buildTournamentGroups(filtered), [filtered]);
  const allPlayers = useMemo(() => buildPlayerSummaries(rows), [rows]);
  const quality = qualityLabel(rows);

  const stats = useMemo(() => {
    const allGroups = buildTournamentGroups(rows);
    const winners = rows.filter(row => rankNumber(row) === 1);
    return {
      rows: rows.length,
      groups: allGroups.length,
      players: allPlayers.length,
      winners: winners.length,
      clubs: clubs.length,
      missingDates: rows.filter(row => !row.event_date).length,
    };
  }, [rows, allPlayers.length, clubs.length]);

  const recordRows = useMemo(() => {
    const recordPlayers = buildPlayerSummaries(filtered);
    const byPair = new Map<string, { pair: string; rows: number; wins: number; podiums: number; points: number; seasons: Set<number>; divisions: Set<DivisionKey> }>();
    for (const row of filtered) {
      const key = pairKey(row);
      const entry = byPair.get(key) ?? {
        pair: pairLabel(row),
        rows: 0,
        wins: 0,
        podiums: 0,
        points: 0,
        seasons: new Set<number>(),
        divisions: new Set<DivisionKey>(),
      };
      const rank = rankNumber(row);
      entry.rows += 1;
      entry.points += roundPoints(row.points);
      entry.seasons.add(Number(row.event_year || row.season));
      entry.divisions.add(row.division);
      if (rank === 1) entry.wins += 1;
      if (rank <= 3) entry.podiums += 1;
      byPair.set(key, entry);
    }

    const bySeason = unique(filtered.map(row => row.event_year).filter(Boolean))
      .sort((a, b) => Number(b) - Number(a))
      .map(season => {
        const seasonPlayers = buildPlayerSummaries(filtered.filter(row => Number(row.event_year) === Number(season)));
        return { season, top: seasonPlayers[0] };
      })
      .filter(item => item.top);

    return {
      points: recordPlayers.slice(0, 10),
      wins: [...recordPlayers].sort((a, b) => b.wins - a.wins || b.points - a.points).slice(0, 10),
      podiums: [...recordPlayers].sort((a, b) => b.podiums - a.podiums || b.points - a.points).slice(0, 10),
      played: [...recordPlayers].sort((a, b) => b.tournaments - a.tournaments || b.points - a.points).slice(0, 10),
      pairs: Array.from(byPair.values()).sort((a, b) => b.wins - a.wins || b.points - a.points || b.rows - a.rows).slice(0, 10),
      clubs: buildClubSummaries(filtered).slice(0, 10),
      seasons: bySeason,
    };
  }, [filtered]);

  const selectStyle: CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.10)',
    color: '#d0d0d0',
    borderRadius: '8px',
    padding: '11px 12px',
    fontSize: '13px',
    outline: 'none',
    colorScheme: 'dark',
  };

  const unavailable = !!error && !loading && rows.length === 0;
  const viewTabs: { key: ViewKey; label: string; color: string }[] = [
    { key: 'tournois', label: 'Tournois', color: '#4ad569' },
    { key: 'joueurs', label: 'Joueurs', color: '#f59e0b' },
    { key: 'men', label: 'Hommes', color: DIVISION_CONFIG.men.color },
    { key: 'women', label: 'Dames', color: DIVISION_CONFIG.women.color },
    { key: 'mixed', label: 'Mixte', color: DIVISION_CONFIG.mixed.color },
    { key: 'junior', label: 'Junior', color: DIVISION_CONFIG.junior.color },
    { key: 'clubs', label: 'Clubs', color: '#a78bfa' },
    { key: 'records', label: 'Records', color: '#f59e0b' },
  ];

  return (
    <Layout>
      <section style={{ padding: '72px 24px 80px', minHeight: '80vh', position: 'relative', overflowX: 'auto', background: 'linear-gradient(180deg, #080808 0%, #0c0c0c 100%)' }}>
        <DotWaveBackground variant="corner-tl" opacity={0.08} animate={false} />
        <div style={{ maxWidth: '1280px', margin: '0 auto', minWidth: '320px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '28px' }}>
            <div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                <Database size={26} color="#4ad569" />
                <h1 style={{ color: 'white', fontWeight: 950, fontSize: 'clamp(30px,5vw,58px)', margin: 0, letterSpacing: 0 }}>Historique</h1>
                <span style={{ background: `${quality.color}14`, color: quality.color, border: `1px solid ${quality.color}35`, borderRadius: '999px', padding: '5px 10px', fontSize: '12px', fontWeight: 800 }}>
                  {quality.text}
                </span>
              </div>
              <p style={{ color: '#8a8a8a', margin: 0, fontSize: '16px' }}>
                Archives MPL depuis 2023: tournois, joueurs, clubs, victoires, podiums et points carriere.
              </p>
            </div>
            <button onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#d0d0d0', borderRadius: '8px', padding: '11px 15px', cursor: 'pointer', fontWeight: 700 }}>
              <RefreshCw size={15} /> Actualiser
            </button>
          </div>

          {!unavailable && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '12px', marginBottom: '22px' }}>
              <StatTile label="Resultats" value={stats.rows.toLocaleString('fr-FR')} sub="lignes historiques" color="#4ad569" />
              <StatTile label="Tournois" value={stats.groups} sub="groupes division" color="#3b82f6" />
              <StatTile label="Joueurs" value={stats.players.toLocaleString('fr-FR')} sub="carriere detectee" color="#f59e0b" />
              <StatTile label="Clubs" value={stats.clubs} sub="lieux historiques" color="#a78bfa" />
              <StatTile label="A dater" value={stats.missingDates} sub="controle qualite" color={stats.missingDates ? '#ef4444' : '#4ad569'} />
            </div>
          )}

          {fromSupabase && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#4ad569', fontSize: '12px', fontWeight: 800, marginBottom: '18px' }}>
              <ShieldCheck size={15} /> Donnees live Supabase connectees
            </div>
          )}

          {error && (
            <div style={{ background: unavailable ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)', border: `1px solid ${unavailable ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`, color: unavailable ? '#ef4444' : '#f59e0b', borderRadius: '8px', padding: '12px 14px', marginBottom: '18px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {!unavailable && (
            <>
              <GlassCard style={{ padding: '16px', marginBottom: '18px' }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: '1 1 260px' }}>
                    <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
                    <input
                      value={search}
                      onChange={event => setSearch(event.target.value)}
                      placeholder={view === 'joueurs' ? 'Nom du joueur...' : 'Joueur, tournoi, club...'}
                      style={{ ...selectStyle, width: '100%', paddingLeft: '36px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <select value={year} onChange={event => setYear(event.target.value)} style={selectStyle}>
                    <option value="all">Toutes saisons</option>
                    {years.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <select value={division} onChange={event => setDivision(event.target.value)} style={selectStyle}>
                    <option value="all">Toutes divisions</option>
                    <option value="men">Hommes</option>
                    <option value="women">Dames</option>
                    <option value="mixed">Mixte</option>
                    <option value="junior">Junior</option>
                  </select>
                  <select value={category} onChange={event => setCategory(event.target.value)} style={selectStyle}>
                    <option value="all">Toutes categories</option>
                    {categories.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <select value={club} onChange={event => setClub(event.target.value)} style={{ ...selectStyle, maxWidth: '230px' }}>
                    <option value="all">Tous clubs</option>
                    {clubs.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
              </GlassCard>

              <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap', marginBottom: '18px' }}>
                {viewTabs.map(tab => (
                  <PillButton key={tab.key} active={view === tab.key} color={tab.color} onClick={() => {
                    setView(tab.key);
                    if (tab.key === 'men' || tab.key === 'women' || tab.key === 'mixed' || tab.key === 'junior') setDivision('all');
                  }}>
                    {tab.label}
                  </PillButton>
                ))}
              </div>
            </>
          )}

          {loading ? (
            <GlassCard style={{ padding: '70px 20px', textAlign: 'center' }}>
              <RefreshCw size={30} color="#4ad569" style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
              <p style={{ color: '#888', margin: 0 }}>Chargement des archives...</p>
            </GlassCard>
          ) : unavailable ? (
            <GlassCard style={{ padding: '70px 20px', textAlign: 'center' }}>
              <Database size={42} color="#333" style={{ marginBottom: '14px' }} />
              <h2 style={{ color: 'white', margin: '0 0 8px', fontSize: '22px' }}>Archives temporairement indisponibles</h2>
              <p style={{ color: '#777', margin: '0 0 20px', fontSize: '14px' }}>Aucune donnee fictive n'est affichee. Reessayez quand Supabase est disponible.</p>
              <button onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#d0d0d0', borderRadius: '8px', padding: '11px 15px', cursor: 'pointer', fontWeight: 700 }}>
                <RefreshCw size={15} /> Reessayer
              </button>
            </GlassCard>
          ) : view === 'tournois' ? (
            groups.length ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: '16px' }}>
                {groups.map(group => <TournamentCard key={group.key} group={group} onOpen={() => setSelectedGroup(group)} />)}
              </div>
            ) : (
              <GlassCard style={{ padding: '60px', textAlign: 'center', color: '#777' }}>Aucun tournoi trouve.</GlassCard>
            )
          ) : view === 'joueurs' ? (
            <CareerPlayersView rows={playerFiltered} currentRankings={currentRankings} onOpenPlayer={setSelectedPlayer} allowedPlayerKeys={searchedPlayerKeys} />
          ) : view === 'men' || view === 'women' || view === 'mixed' || view === 'junior' ? (
            <DivisionPlayerView division={view} rows={filtered} currentRankings={currentRankings} onOpenPlayer={setSelectedPlayer} allowedPlayerKeys={searchedPlayerKeys} />
          ) : view === 'clubs' ? (
            <ClubsView rows={filtered} onOpenClub={setSelectedClub} />
          ) : (
            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '12px' }}>
                <StatTile label="Joueurs filtres" value={buildPlayerSummaries(filtered).length.toLocaleString('fr-FR')} sub="hall of fame" color="#f59e0b" />
                <StatTile label="Paires" value={recordRows.pairs.length ? new Set(filtered.map(pairKey)).size.toLocaleString('fr-FR') : 0} sub="associations detectees" color="#8b5cf6" />
                <StatTile label="Clubs" value={recordRows.clubs.length} sub="organisateurs filtres" color="#3b82f6" />
                <StatTile label="Resultats" value={filtered.length.toLocaleString('fr-FR')} sub="base des records" color="#4ad569" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: '16px' }}>
                <RecordPanel title="Points carriere" icon={<Trophy size={18} />} color="#4ad569">
                  {recordRows.points.map((player, index) => <PlayerRecordLine key={player.name} player={player} index={index} value={formatPoints(player.points)} color="#4ad569" onOpen={setSelectedPlayer} />)}
                </RecordPanel>

                <RecordPanel title="Victoires" icon={<Award size={18} />} color="#f59e0b">
                  {recordRows.wins.map((player, index) => <PlayerRecordLine key={player.name} player={player} index={index} value={player.wins} color="#f59e0b" onOpen={setSelectedPlayer} />)}
                </RecordPanel>

                <RecordPanel title="Podiums" icon={<Medal size={18} />} color="#a78bfa">
                  {recordRows.podiums.map((player, index) => <PlayerRecordLine key={player.name} player={player} index={index} value={player.podiums} color="#a78bfa" onOpen={setSelectedPlayer} />)}
                </RecordPanel>

                <RecordPanel title="Tournois joues" icon={<CalendarDays size={18} />} color="#3b82f6">
                  {recordRows.played.map((player, index) => <PlayerRecordLine key={player.name} player={player} index={index} value={player.tournaments} color="#3b82f6" onOpen={setSelectedPlayer} />)}
                </RecordPanel>

                <RecordPanel title="Meilleures paires" icon={<Users size={18} />} color="#8b5cf6">
                  {recordRows.pairs.map((pair, index) => (
                    <div key={pair.pair} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) auto', gap: '10px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ color: '#8b5cf6', fontWeight: 950, fontFamily: 'JetBrains Mono, monospace' }}>#{index + 1}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ color: 'white', fontWeight: 900, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pair.pair}</span>
                        <span style={{ color: '#666', fontSize: '11px', marginTop: '3px', display: 'block' }}>{pair.rows} resultats · {pair.podiums} podiums · {compactList(Array.from(pair.divisions).map(divisionLabel), 3)}</span>
                      </span>
                      <span style={{ color: '#8b5cf6', fontWeight: 950, fontFamily: 'JetBrains Mono, monospace' }}>{pair.wins}</span>
                    </div>
                  ))}
                </RecordPanel>

                <RecordPanel title="Activite clubs" icon={<ShieldCheck size={18} />} color="#22c55e">
                  {recordRows.clubs.map((item, index) => <ClubRecordLine key={item.club} item={item} index={index} color="#22c55e" onOpen={setSelectedClub} />)}
                </RecordPanel>
              </div>

              {!!recordRows.seasons.length && (
                <GlassCard style={{ padding: '20px' }}>
                  <h3 style={{ color: 'white', margin: '0 0 14px', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '16px' }}>
                    <CalendarDays size={18} color="#f59e0b" /> Leaders par saison
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '10px' }}>
                    {recordRows.seasons.map(item => item.top && (
                      <button key={item.season} onClick={() => setSelectedPlayer(item.top.name)} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '12px', textAlign: 'left', cursor: 'pointer' }}>
                        <div style={{ color: '#f59e0b', fontWeight: 950, fontFamily: 'JetBrains Mono, monospace', marginBottom: '5px' }}>{item.season}</div>
                        <div style={{ color: 'white', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.top.name}</div>
                        <div style={{ color: '#777', fontSize: '12px', marginTop: '4px' }}>{formatPoints(item.top.points)} pts · {item.top.wins} titres</div>
                      </button>
                    ))}
                  </div>
                </GlassCard>
              )}
            </div>
          )}
        </div>
      </section>
      {selectedGroup && <TournamentDetailModal group={selectedGroup} onClose={() => setSelectedGroup(null)} />}
      {selectedClub && <ClubDetailModal clubName={selectedClub} rows={rows} onClose={() => setSelectedClub(null)} />}
      {selectedPlayer && <PlayerCareerModal playerName={selectedPlayer} rows={rows} currentRankings={currentRankings} onClose={() => setSelectedPlayer(null)} />}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Layout>
  );
}
