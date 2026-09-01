import { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, TrendingUp, Medal, RefreshCw, X, CalendarDays, ShieldCheck, Database } from 'lucide-react';
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
  player_name?: string;
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
  return { rank: r.rank, player_name: r.player_name, points: parseRankingPoints(r.points), division: div };
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

const DB_TO_DIV: Record<string, Division> = {
  men: 'MEN',
  women: 'WOMEN',
  junior: 'JUNIOR',
  mixed: 'MIXTE',
};

interface GlobalRankingMatch {
  player_name: string;
  division: Division;
  rank: number;
  points: number;
  tournaments_played?: number;
}

function divToDb(div: Division): string {
  return DIV_MAP[div] ?? 'men';
}

function parseRankingPoints(value: unknown): number {
  const parsed = typeof value === 'string'
    ? Number(value.replace(/\s+/g, '').replace(',', '.'))
    : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
    points: parseRankingPoints(r.points),
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
  return parseRankingPoints(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
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

function isGenericMonthDate(date?: string, eventName = ''): boolean {
  if (!date || !/^\d{4}-\d{2}-01$/.test(date)) return false;
  return /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*(\d{2}|\d{4})\b/i.test(eventName);
}

function calendarDateFromEvent(eventName: string, season?: number, divisionKey?: PlayerRankingDetail['division_key'], clubFallback?: string, categoryFallback?: string): string {
  if (season !== 2026) return '';
  const event = compactEventName(eventName);
  const category = inferCategory(eventName, categoryFallback);
  const clubName = inferClubName(eventName, clubFallback);
  const monthMatch = event.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*(26|2026)\b/);
  const month = monthMatch ? MONTHS[monthMatch[1]] : '';
  let candidates = MPL_TOURNAMENTS.filter(tournament => {
    if (!tournament.date?.startsWith('2026-')) return false;
    if (category && compactEventName(tournament.category) !== compactEventName(category)) return false;
    if (month && tournament.date.slice(5, 7) !== month) return false;
    if (divisionKey && tournament.division !== divisionKey) return false;
    return true;
  });
  if (clubName) {
    const sameClub = candidates.filter(tournament => compactEventName(tournament.club_name) === compactEventName(clubName));
    if (sameClub.length) candidates = sameClub;
  }
  if (!candidates.length) {
    candidates = MPL_TOURNAMENTS.filter(tournament => {
      const name = compactEventName(tournament.name);
      if (!tournament.date?.startsWith('2026-')) return false;
      if (category && !name.includes(compactEventName(category))) return false;
      if (month && tournament.date.slice(5, 7) !== month) return false;
      return name.split(' ').some(token => token.length > 2 && event.includes(token));
    });
  }
  const dates = Array.from(new Set(candidates.map(tournament => tournament.date).filter(Boolean)));
  return dates.length === 1 ? dates[0] : '';
}

function resolveEventDate(eventName: string, fallbackDate?: string, fallbackSeason?: number, divisionKey?: PlayerRankingDetail['division_key'], clubFallback?: string, categoryFallback?: string): string {
  const cleanFallback = fallbackDate && /^\d{4}-\d{2}-\d{2}/.test(fallbackDate) ? fallbackDate.slice(0, 10) : '';
  if (cleanFallback && !isGenericMonthDate(cleanFallback, eventName)) return cleanFallback;
  const calendarDate = calendarDateFromEvent(eventName, fallbackSeason, divisionKey, clubFallback, categoryFallback);
  if (calendarDate) return calendarDate;
  return cleanFallback || inferEventDate(eventName, undefined, fallbackSeason);
}

function bestDetailDate(preferred: PlayerRankingDetail, other: PlayerRankingDetail): string | undefined {
  const preferredDate = preferred.event_date || '';
  const otherDate = other.event_date || '';
  if (preferredDate && !isGenericMonthDate(preferredDate, preferred.event_name)) return preferredDate;
  if (otherDate && !isGenericMonthDate(otherDate, other.event_name)) return otherDate;
  return preferredDate || otherDate || undefined;
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

function normalizeDetailDivision(value: unknown, fallback?: PlayerRankingDetail['division_key'], eventName?: unknown, category?: unknown): PlayerRankingDetail['division_key'] {
  const eventText = String(eventName ?? '').toLowerCase();
  const categoryText = String(category ?? '').toLowerCase();
  const text = `${eventText} ${categoryText} ${String(value ?? '').toLowerCase()}`;
  if (/\b(women|woman|dames|dame|femmes|femme|wom|wome)\b/.test(text)) return 'women';
  if (/\b(mixed|mixte|mix)\b/.test(text)) return 'mixed';
  if (text.includes('junior') || /u1[135]/.test(text)) return 'junior';
  if (text.includes('men') || text.includes('hommes')) return 'men';
  return fallback ?? 'men';
}

function explicitDetailDivision(value: unknown, eventName?: unknown, category?: unknown): PlayerRankingDetail['division_key'] | '' {
  const text = `${String(eventName ?? '')} ${String(category ?? '')} ${String(value ?? '')}`.toLowerCase();
  if (/\b(women|woman|dames|dame|femmes|femme|wom|wome)\b/.test(text)) return 'women';
  if (/\b(mixed|mixte|mix)\b/.test(text)) return 'mixed';
  if (text.includes('junior') || /u1[135]/.test(text)) return 'junior';
  if (/\b(men|hommes|homme)\b/.test(text)) return 'men';
  return '';
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

function playerCanonicalKey(value: unknown): string {
  return nameKey(value);
}

function looseNameKey(value: unknown): string {
  return playerCanonicalKey(value)
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
}

function playerNameMatches(value: unknown, playerKey: string, playerLooseKey = looseNameKey(playerKey)): boolean {
  const candidateKey = playerCanonicalKey(value);
  if (!candidateKey || !playerKey) return false;
  return candidateKey === playerKey || looseNameKey(candidateKey) === playerLooseKey;
}

function rowHasPlayer(row: Record<string, unknown>, playerKey: string, playerLooseKey = looseNameKey(playerKey)): boolean {
  return playerNameMatches(row.player1_name, playerKey, playerLooseKey) || playerNameMatches(row.player2_name, playerKey, playerLooseKey);
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
  const playerLoose = looseNameKey(player);
  const p1Raw = normalizePersonName(row.player1_name);
  const p2Raw = normalizePersonName(row.player2_name);
  const p1 = nameKey(p1Raw);
  const p2 = nameKey(p2Raw);
  if (p1 && !playerNameMatches(p1Raw, player, playerLoose)) return p1Raw.toUpperCase();
  if (p2 && !playerNameMatches(p2Raw, player, playerLoose)) return p2Raw.toUpperCase();
  return partnerFromTeamName(String(row.team_name ?? ''), playerName);
}

function detailMonthKey(detail: PlayerRankingDetail): string {
  const date = detail.event_date || inferEventDate(detail.event_name, undefined, detail.season);
  return date ? date.slice(0, 7) : String(detail.season ?? '');
}

function detailRankingMonthKey(detail: PlayerRankingDetail): string {
  const inferred = inferEventDate(detail.event_name, undefined, detail.season);
  const date = detail.source === 'official' ? inferred : (detail.event_date || inferred);
  return date ? date.slice(0, 7) : String(detail.season ?? '');
}

function detailClubKey(detail: PlayerRankingDetail): string {
  const source = compactEventName(`${detail.club_name || ''} ${detail.event_name || ''}`);
  for (const [pattern, club] of CLUB_ALIASES) {
    if (pattern.test(source)) return compactEventName(club);
  }
  return compactEventName(detail.club_name || inferClubName(detail.event_name));
}

function detailDedupKey(detail: PlayerRankingDetail): string {
  const date = detailIsoDate(detail) || detailMonthKey(detail);
  return [
    date,
    detail.division_key || '',
    compactEventName(detail.category || inferCategory(detail.event_name)),
    detailClubKey(detail),
  ].join('|');
}

function detailEventKey(detail: PlayerRankingDetail): string {
  return [
    detailRankingMonthKey(detail),
    detail.division_key || '',
    compactEventName(detail.category || inferCategory(detail.event_name)),
    detailClubKey(detail),
  ].join('|');
}

function detailMatchScore(official: PlayerRankingDetail, detail: PlayerRankingDetail): number {
  let score = 0;
  const officialMonth = detailRankingMonthKey(official);
  const detailMonth = detailRankingMonthKey(detail);
  const officialCategory = compactEventName(official.category || inferCategory(official.event_name));
  const detailCategory = compactEventName(detail.category || inferCategory(detail.event_name));
  const officialClub = detailClubKey(official);
  const detailClub = detailClubKey(detail);
  const officialDivision = official.division_key || '';
  const detailDivision = detail.division_key || '';

  if (officialMonth && officialMonth === detailMonth) score += 35;
  if (officialCategory && officialCategory === detailCategory) score += 30;
  if (officialClub && officialClub === detailClub) score += 30;
  if (officialDivision && officialDivision === detailDivision) score += 10;
  if (parseRankingPoints(official.points) === parseRankingPoints(detail.points)) score += 8;
  if (compactEventName(detail.event_name).includes(compactEventName(official.category || ''))) score += 2;

  return score;
}

function resolveOfficialMatchedDetails(officialDetails: PlayerRankingDetail[], displayDetails: PlayerRankingDetail[]): PlayerRankingDetail[] {
  const matched: PlayerRankingDetail[] = [];
  const used = new Set<number>();

  const officialTop = [...officialDetails]
    .sort((a, b) => b.points - a.points || detailRankingMonthKey(b).localeCompare(detailRankingMonthKey(a)))
    .slice(0, 8);

  for (const official of officialTop) {
    let bestIndex = -1;
    let bestScore = 0;
    displayDetails.forEach((detail, index) => {
      if (used.has(index)) return;
      const score = detailMatchScore(official, detail);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex >= 0 && bestScore >= 75) {
      used.add(bestIndex);
      matched.push(mergeDetailRows(displayDetails[bestIndex], official));
    } else {
      matched.push(official);
    }
  }

  return matched;
}

function detailIsoDate(detail: PlayerRankingDetail): string {
  return detail.event_date || inferEventDate(detail.event_name, undefined, detail.season) || '';
}

function isoDateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addMonthsToDate(date: Date, months: number): Date {
  const next = new Date(date);
  const originalDay = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() !== originalDay) next.setDate(0);
  next.setHours(0, 0, 0, 0);
  return next;
}

function rankingWindowRange() {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = addMonthsToDate(end, -12);
  return {
    start: isoDateOnly(start),
    end: isoDateOnly(end),
  };
}

function formatIsoDateFr(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function detailQuality(detail: PlayerRankingDetail): number {
  let score = 0;
  if (detailHasSourceIdentity(detail)) score += 80;
  if (detail.partner_name) score += 8;
  if (detail.rank && detail.rank > 0) score += 6;
  if (detail.team_name) score += 3;
  if (detail.source === 'current') score += 2;
  if (detail.source === 'historical') score += 1;
  return score;
}

function detailHasSourceIdentity(detail: PlayerRankingDetail): boolean {
  const partner = normalizePersonName(detail.partner_name);
  const player = normalizePersonName(detail.player_name);
  const rank = Number(detail.rank ?? 0);
  return Boolean(partner && partner !== '-' && (!player || nameKey(partner) !== nameKey(player))) && Number.isFinite(rank) && rank > 0 && rank < 999;
}

function detailHasReliableIdentity(detail: PlayerRankingDetail, playerName: string): boolean {
  const partner = detailPartnerLabel(detail, playerName).trim();
  const hasPartner = Boolean(partner && partner !== '-' && partner !== playerName.toUpperCase());
  const rank = Number(detail.rank ?? 0);
  return hasPartner && Number.isFinite(rank) && rank > 0 && rank < 999;
}

function detailStatusLabel(counted: boolean, detail: PlayerRankingDetail, playerName: string): string {
  if (!counted) return 'HORS TOP 8';
  return detailHasReliableIdentity(detail, playerName) ? 'RETENU' : 'RETENU - A CONTROLER';
}

function detailStatusColor(counted: boolean, detail: PlayerRankingDetail, playerName: string): string {
  if (!counted) return '#888';
  return detailHasReliableIdentity(detail, playerName) ? '#4ad569' : '#f59e0b';
}

function detailRankLabel(detail: PlayerRankingDetail): string {
  const rank = Number(detail.rank ?? 0);
  return Number.isFinite(rank) && rank > 0 && rank < 999 ? `#${rank}` : '-';
}

function mergeDetailRows(base: PlayerRankingDetail, incoming: PlayerRankingDetail): PlayerRankingDetail {
  const preferred = detailQuality(incoming) > detailQuality(base) ? incoming : base;
  const other = preferred === incoming ? base : incoming;
  const preferredPoints = parseRankingPoints(preferred.points);
  const otherPoints = parseRankingPoints(other.points);
  const preferredReliable = detailHasSourceIdentity(preferred);
  const otherReliable = detailHasSourceIdentity(other);
  const points = preferredReliable && !otherReliable
    ? preferredPoints
    : otherReliable && !preferredReliable
      ? otherPoints
      : Math.max(preferredPoints, otherPoints);

  return {
    ...preferred,
    event_name: preferred.event_name || other.event_name,
    points,
    season: preferred.season ?? other.season,
    rank: preferred.rank ?? other.rank,
    team_name: preferred.team_name || other.team_name,
    category: preferred.category || other.category,
    club_name: inferClubName(preferred.event_name || other.event_name, preferred.club_name || other.club_name),
    partner_name: preferred.partner_name || other.partner_name,
    event_date: bestDetailDate(preferred, other),
    division_key: preferred.division_key || other.division_key,
  };
}

function detailPartnerLabel(detail: PlayerRankingDetail, playerName: string): string {
  if (detail.partner_name) return detail.partner_name;
  const fromTeam = partnerFromTeamName(detail.team_name || '', playerName);
  if (fromTeam) return fromTeam;
  return detail.team_name || '-';
}

function topCountLabel(items: string[]): string {
  const counts = new Map<string, number>();
  for (const item of items.map(value => value.trim()).filter(Boolean)) {
    if (item === '-') continue;
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return top ? `${top[0]} (${top[1]})` : '-';
}

function detailLooseEventKey(detail: PlayerRankingDetail): string {
  return [
    detailIsoDate(detail) || detailMonthKey(detail),
    detail.division_key || '',
    compactEventName(detail.category || inferCategory(detail.event_name)),
    detailClubKey(detail),
    parseRankingPoints(detail.points),
  ].join('|');
}

function removeWeakDuplicateDetails(details: PlayerRankingDetail[]): PlayerRankingDetail[] {
  const grouped = new Map<string, PlayerRankingDetail[]>();
  for (const detail of details) {
    const key = detailLooseEventKey(detail);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)?.push(detail);
  }

  return details.filter(detail => {
    const group = grouped.get(detailLooseEventKey(detail)) || [];
    if (group.length <= 1) return true;
    const quality = detailQuality(detail);
    const bestQuality = Math.max(...group.map(detailQuality));
    const hasReliable = detailHasSourceIdentity(detail);
    const groupHasReliable = group.some(detailHasSourceIdentity);
    if (groupHasReliable) return hasReliable && quality >= bestQuality;
    const hasIdentity = Boolean(detail.partner_name || detail.team_name || detail.rank);
    return quality >= bestQuality || hasIdentity;
  });
}

function dedupePlayerDetails(details: PlayerRankingDetail[]): PlayerRankingDetail[] {
  const byKey = new Map<string, PlayerRankingDetail>();
  for (const detail of details) {
    const key = detailDedupKey(detail);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeDetailRows(existing, detail) : detail);
  }
  return removeWeakDuplicateDetails(Array.from(byKey.values())).sort((a, b) => {
    const dateA = a.event_date || inferEventDate(a.event_name, undefined, a.season);
    const dateB = b.event_date || inferEventDate(b.event_name, undefined, b.season);
    return dateB.localeCompare(dateA) || b.points - a.points;
  });
}

function detailCorrectionKey(detail: PlayerRankingDetail): string {
  return [
    detailIsoDate(detail),
    detailClubKey(detail),
    parseRankingPoints(detail.points),
  ].join('|');
}

function resolveDetailDivisionConflicts(details: PlayerRankingDetail[]): PlayerRankingDetail[] {
  const corrections = new Map<string, PlayerRankingDetail['division_key']>();
  for (const detail of details) {
    if (detail.source !== 'historical') continue;
    const explicit = explicitDetailDivision(detail.division_key, detail.event_name, detail.category);
    if (explicit) corrections.set(detailCorrectionKey(detail), explicit);
  }

  return details.map(detail => {
    if (detail.source === 'historical') return detail;
    const corrected = corrections.get(detailCorrectionKey(detail));
    return corrected && corrected !== detail.division_key
      ? { ...detail, division_key: corrected }
      : detail;
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
  divisionKey,
  onClose,
}: {
  player: PlayerRanking;
  details: PlayerRankingDetail[];
  careerStats: PlayerCareerStats | null;
  loading: boolean;
  color: string;
  divisionKey: PlayerRankingDetail['division_key'];
  onClose: () => void;
}) {
  const [activeHistoryTab, setActiveHistoryTab] = useState<'all' | 'men' | 'women' | 'mixed' | 'junior'>('all');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setActiveHistoryTab('all');
  }, [player.player_name, divisionKey]);

  const officialDetails = details.filter(detail => detail.source === 'official');
  const realDetails = resolveDetailDivisionConflicts(details.filter(detail => detail.source !== 'official'));
  const realDisplayDetails = dedupePlayerDetails(realDetails);
  const officialUniqueDetails = dedupePlayerDetails(officialDetails);
  const reliableOfficialDetails = officialUniqueDetails.filter(detailHasSourceIdentity);
  const officialDisplayDetails = reliableOfficialDetails.length > 0
    ? reliableOfficialDetails
    : officialUniqueDetails;
  const hasOfficialDetails = officialDisplayDetails.length > 0;
  const displayDetails = hasOfficialDetails
    ? dedupePlayerDetails([...officialDisplayDetails, ...realDisplayDetails])
    : realDisplayDetails;
  const playerDivisionKey = divisionKey;
  const windowRange = rankingWindowRange();
  const calculationDetails = displayDetails;
  const windowDetails = calculationDetails.filter(detail => {
    const date = detailIsoDate(detail);
    if (playerDivisionKey && detail.division_key && detail.division_key !== playerDivisionKey) return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= windowRange.start && date <= windowRange.end;
  });
  const retainedDetails = [...windowDetails]
    .sort((a, b) =>
      b.points - a.points ||
      detailQuality(b) - detailQuality(a) ||
      detailIsoDate(b).localeCompare(detailIsoDate(a))
    )
    .slice(0, 8);
  const retainedDisplayDetails: PlayerRankingDetail[] = [];
  const retainedDetailRefs = new WeakSet<PlayerRankingDetail>();
  const usedDisplayIndexes = new Set<number>();
  const usedRetainedLooseKeys = new Set<string>();
  retainedDetails.forEach(retained => {
    const retainedLooseKey = detailLooseEventKey(retained);
    if (usedRetainedLooseKeys.has(retainedLooseKey)) return;
    usedRetainedLooseKeys.add(retainedLooseKey);

    let bestIndex = -1;
    let bestScore = 0;
    displayDetails.forEach((detail, index) => {
      if (usedDisplayIndexes.has(index)) return;
      let score = 0;
      if (detailDedupKey(detail) === detailDedupKey(retained)) score += 100;
      if (detailEventKey(detail) === detailEventKey(retained)) score += 40;
      if (parseRankingPoints(detail.points) === parseRankingPoints(retained.points)) score += 25;
      if (detail.partner_name || detail.team_name) score += 8;
      if (detail.rank) score += 6;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0 && bestScore >= 65) {
      usedDisplayIndexes.add(bestIndex);
      const merged = mergeDetailRows(displayDetails[bestIndex], retained);
      retainedDisplayDetails.push(merged);
      retainedDetailRefs.add(merged);
    } else {
      retainedDisplayDetails.push(retained);
      retainedDetailRefs.add(retained);
    }
  });
  const retainedLooseKeys = new Set(retainedDisplayDetails.map(detailLooseEventKey));
  const nonRetainedDisplayDetails = displayDetails.filter((detail, index) =>
    !usedDisplayIndexes.has(index) && !retainedLooseKeys.has(detailLooseEventKey(detail))
  );
  const combinedDetails = [...retainedDisplayDetails, ...nonRetainedDisplayDetails];
  const playedCount = Math.max(windowDetails.length, hasOfficialDetails ? 0 : player.tournaments_played || 0);
  const calculatedTop8Total = retainedDetails.reduce((sum, detail) => sum + detail.points, 0);
  const real12MonthTotal = windowDetails.reduce((sum, detail) => sum + detail.points, 0);
  const outOfTop8Count = Math.max(0, windowDetails.length - retainedDetails.length);
  const rankingTotal = calculatedTop8Total || player.points;
  const rankingGap = Math.max(0, real12MonthTotal - rankingTotal);
  const bestPartner = topCountLabel(combinedDetails.map(detail => detailPartnerLabel(detail, player.player_name)));
  const bestClub = topCountLabel(combinedDetails.map(detail => detail.club_name || ''));
  const wins = combinedDetails.filter(detail => Number(detail.rank) === 1).length;
  const podiums = combinedDetails.filter(detail => Number(detail.rank ?? 999) <= 3).length;
  const isRetainedDetail = (detail: PlayerRankingDetail) => retainedDetailRefs.has(detail);
  const rankVisibleDetail = (detail: PlayerRankingDetail) => {
    if (!isRetainedDetail(detail)) return 999;
    const realIndex = retainedDetails.findIndex(retained =>
      detailDedupKey(retained) === detailDedupKey(detail) || detailEventKey(retained) === detailEventKey(detail)
    );
    return realIndex >= 0 ? realIndex : 0;
  };
  const historyTabs = [
    { key: 'all' as const, label: 'Historique', count: combinedDetails.length },
    { key: 'men' as const, label: 'Men', count: combinedDetails.filter(detail => detail.division_key === 'men').length },
    { key: 'women' as const, label: 'Women', count: combinedDetails.filter(detail => detail.division_key === 'women').length },
    { key: 'mixed' as const, label: 'Mixed', count: combinedDetails.filter(detail => detail.division_key === 'mixed').length },
    { key: 'junior' as const, label: 'Junior', count: combinedDetails.filter(detail => detail.division_key === 'junior').length },
  ].filter(tab => tab.key === 'all' || tab.count > 0);
  const filteredDetails = combinedDetails
    .filter(detail => activeHistoryTab === 'all' || detail.division_key === activeHistoryTab);
  const visibleDetails = (filteredDetails.length > 0 ? filteredDetails : combinedDetails)
    .sort((a, b) => {
      const retainedA = isRetainedDetail(a);
      const retainedB = isRetainedDetail(b);
      if (retainedA !== retainedB) return retainedA ? -1 : 1;
      const dateA = a.event_date || inferEventDate(a.event_name, undefined, a.season) || '';
      const dateB = b.event_date || inferEventDate(b.event_name, undefined, b.season) || '';
      if (dateA && dateB && dateA !== dateB) return dateB.localeCompare(dateA);
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;
      if (retainedA && retainedB) return b.points - a.points;
      const rankA = rankVisibleDetail(a);
      const rankB = rankVisibleDetail(b);
      if (rankA !== rankB) return rankA - rankB;
      return Number(b.season ?? 0) - Number(a.season ?? 0) || b.points - a.points;
    });
  const top8Label = playedCount > 8 ? `8/${playedCount}` : String(playedCount);
  const ruleText = `Ranking period: ${formatIsoDateFr(windowRange.start)} to ${formatIsoDateFr(windowRange.end)} - Best 8 scores. Les autres tournois restent visibles mais ne comptent pas dans le Ranking Top 8.`;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.76)', zIndex: 2147483000, display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'center', padding: isMobile ? '8px' : '16px' }}>
      <div onClick={event => event.stopPropagation()} style={{ width: '100%', maxWidth: '920px', maxHeight: isMobile ? 'calc(100dvh - 16px)' : '88vh', overflow: isMobile ? 'auto' : 'hidden', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin', scrollbarColor: `${color} rgba(255,255,255,0.08)`, background: '#101010', border: `1px solid ${color}40`, borderRadius: isMobile ? '12px' : '10px', boxShadow: '0 22px 70px rgba(0,0,0,0.45)', position: 'relative', zIndex: 2147483001 }}>
        <div style={{ padding: isMobile ? '14px 16px' : '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', gap: isMobile ? '10px' : '14px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: isMobile ? '10px' : '12px', minWidth: 0 }}>
            <span style={{ color: '#f59e0b', fontSize: isMobile ? '18px' : '20px', lineHeight: 1.2, flex: '0 0 auto' }}>#{player.rank}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'white', fontSize: isMobile ? '17px' : '16px', fontWeight: 900, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap', lineHeight: 1.08 }}>{player.player_name}</div>
              <div style={{ color: '#777', fontSize: '12px', marginTop: '4px', lineHeight: 1.35 }}>{formatPoints(rankingTotal)} pts Ranking Top 8 - Joues 12 mois: {top8Label} - {displayDetails.length} historique</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: isMobile ? '8px' : '14px', flex: '0 0 auto' }}>
            {!isMobile && <div style={{ color: '#777', fontSize: '12px' }}>{careerStats ? `${careerStats.tournaments_played} tournois carriere` : `${displayDetails.length} lignes`}</div>}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#777', cursor: 'pointer', padding: isMobile ? '8px' : '4px' }}><X size={isMobile ? 20 : 22} /></button>
          </div>
        </div>

        <div style={{ padding: isMobile ? '12px 16px' : '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(59,130,246,0.045)' }}>
          <div style={{ color: '#d0d0d0', fontSize: '12px', fontWeight: 800, lineHeight: 1.45 }}>{ruleText}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(auto-fit,minmax(130px,1fr))', gap: '8px', padding: isMobile ? '12px 16px' : '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { label: 'Ranking Top 8', value: formatPoints(rankingTotal), c: color },
            { label: 'Joues 12 mois', value: top8Label, c: '#4ad569' },
            { label: 'Points joues 12m', value: loading ? '...' : formatPoints(real12MonthTotal), c: '#f59e0b' },
            { label: 'Hors Top 8', value: `${outOfTop8Count} / ${formatPoints(rankingGap)}`, c: '#ef4444' },
            { label: 'Carriere pts', value: careerStats ? formatPoints(careerStats.total_points) : '-', c: '#8b5cf6' },
          ].map(item => (
            <div key={item.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: isMobile ? '10px 12px' : '9px 11px', minWidth: 0 }}>
              <div style={{ color: item.c, fontWeight: 900, fontSize: isMobile ? '19px' : '18px', fontFamily: 'JetBrains Mono, monospace', overflowWrap: 'anywhere' }}>{item.value}</div>
              <div style={{ color: '#666', fontSize: '10px', marginTop: '5px', textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: 1.25 }}>{item.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(auto-fit,minmax(150px,1fr))', gap: '8px', padding: isMobile ? '0 16px 12px' : '0 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { label: 'Partenaire principal', value: bestPartner, c: '#d0d0d0' },
            { label: 'Performance par club', value: bestClub, c: '#d0d0d0' },
            { label: 'Victoires', value: String(careerStats?.wins ?? wins), c: '#4ad569' },
            { label: 'Podiums', value: String(careerStats?.podiums ?? podiums), c: '#f59e0b' },
          ].map(item => (
            <div key={item.label} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.055)', borderRadius: '8px', padding: '9px 11px', minWidth: 0 }}>
              <div style={{ color: item.c, fontWeight: 850, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap', lineHeight: 1.25 }}>{item.value}</div>
              <div style={{ color: '#666', fontSize: '10px', marginTop: '5px', textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: 1.25 }}>{item.label}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: isMobile ? '10px 16px 8px' : '10px 20px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '6px', flexWrap: isMobile ? 'nowrap' : 'wrap', alignItems: 'center', overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch' }}>
          {historyTabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveHistoryTab(tab.key)} style={{ background: activeHistoryTab === tab.key ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.025)', border: activeHistoryTab === tab.key ? `1px solid ${color}45` : '1px solid rgba(255,255,255,0.06)', color: activeHistoryTab === tab.key ? 'white' : '#888', borderRadius: '5px', padding: '5px 9px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer', flex: isMobile ? '0 0 auto' : undefined }}>
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        <div style={{ maxHeight: isMobile ? 'none' : '48vh', overflow: isMobile ? 'visible' : 'auto', padding: isMobile ? '10px 16px 16px' : 0 }}>
          {loading ? (
            <div style={{ padding: '42px', textAlign: 'center', color: '#666' }}>Chargement des details...</div>
          ) : visibleDetails.length === 0 ? (
            <div style={{ padding: '42px', textAlign: 'center', color: '#666' }}>Aucun detail disponible pour ce filtre.</div>
          ) : isMobile ? (
            <div style={{ display: 'grid', gap: '8px' }}>
              {visibleDetails.map((detail, index) => {
                const counted = isRetainedDetail(detail);
                const rankColor = Number(detail.rank) === 1 ? '#4ad569' : Number(detail.rank) <= 3 ? '#f59e0b' : '#888';
                return (
                  <div key={`${detail.event_name}-${index}`} style={{
                    background: counted ? 'rgba(74,213,105,0.09)' : 'rgba(255,255,255,0.025)',
                    border: `1px solid ${counted ? 'rgba(74,213,105,0.22)' : 'rgba(255,255,255,0.055)'}`,
                    borderRadius: '9px',
                    padding: '10px 11px',
                    boxShadow: counted ? 'inset 3px 0 0 rgba(74,213,105,0.55)' : 'none',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ color: detail.category?.startsWith('M') ? '#4ad569' : '#f59e0b', fontSize: '11px', fontWeight: 950 }}>{detail.category || '-'}</span>
                          <span style={{ color: '#7b8495', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}>{detail.event_date || detail.season || '-'}</span>
                          <span style={{ color: detailStatusColor(counted, detail, player.player_name), background: counted ? 'rgba(74,213,105,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${counted ? 'rgba(74,213,105,0.24)' : 'rgba(255,255,255,0.06)'}`, borderRadius: '999px', padding: '2px 7px', fontSize: '9px', fontWeight: 950 }}>
                            {detailStatusLabel(counted, detail, player.player_name)}
                          </span>
                        </div>
                        <div style={{ color: '#9aa4b5', fontSize: '11px', fontWeight: 750, textTransform: 'uppercase', marginTop: '7px', lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                          {detail.club_name || detail.event_name}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                        <div style={{ color: counted ? '#4ad569' : 'white', fontSize: '15px', fontWeight: 950, fontFamily: 'JetBrains Mono, monospace' }}>{formatPoints(detail.points)}</div>
                        <div style={{ color: rankColor, fontSize: '12px', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', marginTop: '3px' }}>{detailRankLabel(detail)}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: '9px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                      <div style={{ color: '#666', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.6px', flex: '0 0 auto' }}>Partenaire</div>
                      <div style={{ color: detailHasReliableIdentity(detail, player.player_name) ? 'white' : '#f59e0b', fontSize: '12px', fontWeight: 950, textTransform: 'uppercase', textAlign: 'right', overflowWrap: 'anywhere' }}>{detailPartnerLabel(detail, player.player_name) === '-' ? 'A COMPLETER' : detailPartnerLabel(detail, player.player_name)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: '#101010' }}>
                  {[['Statut','86px','left'], ['Date','96px','left'], ['Cat','70px','left'], ['Club','1fr','left'], ['Partenaire','180px','left'], ['Rk','54px','right'], ['Pts','88px','right']].map(([label, width, align]) => (
                    <th key={label} style={{ width: width === '1fr' ? undefined : width, textAlign: align as 'left' | 'right', padding: '9px 8px', color: '#555', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleDetails.map((detail, index) => {
                  const counted = isRetainedDetail(detail);
                  return (
                    <tr key={`${detail.event_name}-${index}`} style={{ background: counted ? 'rgba(74,213,105,0.08)' : index % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                      <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: detailStatusColor(counted, detail, player.player_name),
                          background: counted ? 'rgba(74,213,105,0.12)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${counted ? 'rgba(74,213,105,0.28)' : 'rgba(255,255,255,0.07)'}`,
                          borderRadius: '999px',
                          padding: '3px 7px',
                          fontSize: '9px',
                          fontWeight: 950,
                          letterSpacing: '0.4px',
                          whiteSpace: 'nowrap',
                        }}>
                          {detailStatusLabel(counted, detail, player.player_name)}
                        </span>
                      </td>
                      <td style={{ padding: '8px', color: '#666', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>{detail.event_date || detail.season || '-'}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.035)' }}><span style={{ color: detail.category?.startsWith('M') ? '#4ad569' : '#f59e0b', fontSize: '10px', fontWeight: 900 }}>{detail.category || '-'}</span></td>
                      <td style={{ padding: '8px', color: '#8a94a6', fontSize: '11px', textTransform: 'uppercase', lineHeight: 1.25, overflowWrap: 'anywhere', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>{detail.club_name || detail.event_name}</td>
                      <td style={{ padding: '8px', color: detailHasReliableIdentity(detail, player.player_name) ? 'white' : '#f59e0b', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.25, overflowWrap: 'anywhere', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>{detailPartnerLabel(detail, player.player_name) === '-' ? 'A COMPLETER' : detailPartnerLabel(detail, player.player_name)}</td>
                      <td style={{ padding: '8px', color: Number(detail.rank) === 1 ? '#4ad569' : Number(detail.rank) <= 3 ? '#f59e0b' : '#888', fontSize: '12px', fontWeight: 900, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>{detailRankLabel(detail)}</td>
                      <td style={{ padding: '8px', color: counted ? '#4ad569' : 'white', fontSize: '12px', fontWeight: 900, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>{formatPoints(detail.points)}</td>
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
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)');
    const sync = () => setIsCompact(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

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

  const tableColumns = isCompact
    ? '42px minmax(130px,1fr) 82px 68px'
    : '52px minmax(220px,1fr) 110px 100px 90px 90px';

  async function loadTournamentResultDetails(player: PlayerRanking): Promise<PlayerRankingDetail[]> {
    const sb = getSupabaseClient();
    if (!sb) return [];

    const name = player.player_name.trim();
    const playerKey = playerCanonicalKey(name);
    const playerLooseKey = looseNameKey(playerKey);
    const escapedName = name.replace(/[%_,]/g, '').trim();
    const nameTokens = playerKey.split(' ').filter(token => token.length >= 3);
    const lookupTerms = Array.from(new Set([escapedName, ...nameTokens].filter(Boolean)));
    const queries = await Promise.all(
      lookupTerms.flatMap(term => [
        sb
          .from('tournament_results')
          .select('tournament_name,tournament_date,team_name,player1_name,player2_name,rank,points,division,category,club_name')
          .ilike('player1_name', `%${term}%`)
          .limit(1000),
        sb
          .from('tournament_results')
          .select('tournament_name,tournament_date,team_name,player1_name,player2_name,rank,points,division,category,club_name')
          .ilike('player2_name', `%${term}%`)
          .limit(1000),
      ])
    );

    const seen = new Set<string>();
    const rows: PlayerRankingDetail[] = [];

    for (const result of queries) {
      if (result.error || !result.data) continue;
      for (const row of result.data as Record<string, unknown>[]) {
        if (!rowHasPlayer(row, playerKey, playerLooseKey)) continue;
        const eventName = String(row.tournament_name ?? '').trim();
        const date = String(row.tournament_date ?? '').trim();
        const points = parseRankingPoints(row.points);
        const rank = Number(row.rank ?? 0);
        const teamName = String(row.team_name ?? '').trim();
        const key = `${eventName}|${date}|${teamName}|${points}|${rank}`;
        if (!eventName || !points || seen.has(key)) continue;
        seen.add(key);
        rows.push({
          event_name: date ? `${eventName} - ${new Date(date).toLocaleDateString('fr-FR')}` : eventName,
          points: parseRankingPoints(points),
          season: inferEventSeason(eventName, Number(row.season ?? 2026)),
          rank: Number.isFinite(rank) ? rank : undefined,
          team_name: teamName,
          category: inferCategory(eventName),
          club_name: inferClubName(eventName, String(row.club_name ?? '')),
          partner_name: partnerForPlayer(row, player.player_name),
          event_date: resolveEventDate(eventName, date, Number(row.season ?? 2026), normalizeDetailDivision(row.division, divToDb(division) as PlayerRankingDetail['division_key'], eventName, row.category), String(row.club_name ?? ''), inferCategory(eventName, row.category)),
          division_key: normalizeDetailDivision(row.division, divToDb(division) as PlayerRankingDetail['division_key'], eventName, row.category),
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
    const playerKey = playerCanonicalKey(name);
    const playerLooseKey = looseNameKey(playerKey);
    const escapedName = name.replace(/[%_,]/g, '').trim();
    const nameTokens = playerKey.split(' ').filter(token => token.length >= 3);
    const lookupTerms = Array.from(new Set([escapedName, ...nameTokens].filter(Boolean)));
    const historicalRows: Record<string, unknown>[] = [];
    const historicalSeen = new Set<string>();
    const pageSize = 300;

    for (const term of lookupTerms) {
      for (const column of ['player1_name', 'player2_name'] as const) {
        for (let from = 0; from < 3000; from += pageSize) {
          const { data, error } = await sb
            .from('historical_tournament_results')
            .select('id,event_name,season,category,division,rank_min,team_name,player1_name,player2_name,points,club_name,event_date')
            .ilike(column, `%${term}%`)
            .range(from, from + pageSize - 1);

          if (error) {
            console.warn('[Classements] historical_tournament_results error:', error);
            break;
          }

          const batch = (data ?? []) as Record<string, unknown>[];
          for (const row of batch) {
            if (!rowHasPlayer(row, playerKey, playerLooseKey)) continue;
            const key = String(row.id ?? `${row.event_name}|${row.team_name}|${row.points}`);
            if (historicalSeen.has(key)) continue;
            historicalSeen.add(key);
            historicalRows.push(row);
          }
          if (batch.length < pageSize) break;
        }
      }
    }

    const seen = new Set<string>();
    const details: PlayerRankingDetail[] = [];
    if (historicalRows.length) {
      for (const row of historicalRows) {
        const eventName = String(row.event_name ?? '').trim();
        const season = Number(row.season ?? 0) || undefined;
        const points = parseRankingPoints(row.points);
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
          club_name: inferClubName(eventName, String(row.club_name ?? '')),
          partner_name: partnerForPlayer(row, player.player_name),
          event_date: resolveEventDate(eventName, String(row.event_date ?? ''), season, normalizeDetailDivision(row.division, divToDb(division) as PlayerRankingDetail['division_key'], eventName, category), String(row.club_name ?? ''), category),
          division_key: normalizeDetailDivision(row.division, divToDb(division) as PlayerRankingDetail['division_key'], eventName, category),
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
        total_points: parseRankingPoints(row.total_points),
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
      const playerKey = playerCanonicalKey(player.player_name);
      const playerLooseKey = looseNameKey(playerKey);
      const { data: latestBatchRows } = await sb
        .from('official_rankings')
        .select('batch_id,created_at')
        .eq('division', divToDb(division))
        .order('created_at', { ascending: false })
        .limit(1);

      const latestBatchId = String((latestBatchRows as Record<string, unknown>[] | null)?.[0]?.batch_id ?? '');
      const playerTerms = Array.from(new Set([
        String(player.player_name).trim().replace(/[%_,]/g, ''),
        ...playerKey.split(' ').filter(token => token.length >= 3),
      ].filter(Boolean)));
      const buildDetailsQuery = (select: string, scopedToPlayer = true, scopedTerm = String(player.player_name).trim().replace(/[%_,]/g, '')) => {
        let query = sb
          .from('official_ranking_details')
          .select(select)
          .eq('division', divToDb(division))
          .order('points', { ascending: false })
          .limit(5000);

        if (scopedToPlayer) {
          const safeNamePattern = `%${scopedTerm}%`;
          query = query.ilike('player_name', safeNamePattern);
        }

        if (latestBatchId) {
          query = query.eq('batch_id', latestBatchId);
        }
        return query;
      };

      const appendOfficialMatches = (rows: Record<string, unknown>[] | null | undefined, target: Record<string, unknown>[]) => {
        for (const row of rows ?? []) {
          if (!playerNameMatches(row.player_name, playerKey, playerLooseKey)) continue;
          const key = `${row.player_name}|${row.event_name}|${row.points}|${row.season}|${row.batch_id}`;
          if (target.some(existing => `${existing.player_name}|${existing.event_name}|${existing.points}|${existing.season}|${existing.batch_id}` === key)) continue;
          target.push(row);
        }
      };

      let { data, error } = await buildDetailsQuery('player_name,event_name,event_date,category,club_name,partner_name,rank_label,points,season,batch_id,import_id,created_at');
      if (error && /schema cache|Could not find|column/i.test(error.message)) {
        const fallback = await buildDetailsQuery('player_name,event_name,points,season,batch_id');
        data = fallback.data;
        error = fallback.error;
      }
      const officialRows: Record<string, unknown>[] = [];
      if (!error && data) appendOfficialMatches(data as Record<string, unknown>[], officialRows);
      if (!officialRows.length) {
        for (const term of playerTerms) {
          const termResult = await buildDetailsQuery('player_name,event_name,event_date,category,club_name,partner_name,rank_label,points,season,batch_id,import_id,created_at', true, term);
          if (!termResult.error && termResult.data) appendOfficialMatches(termResult.data as Record<string, unknown>[], officialRows);
          if (officialRows.length) break;
        }
      }
      if (!officialRows.length && latestBatchId) {
        const fallback = await buildDetailsQuery('player_name,event_name,points,season,batch_id', false);
        if (!fallback.error && fallback.data) {
          appendOfficialMatches(fallback.data as Record<string, unknown>[], officialRows);
        }
      }

      const officialDetails = officialRows.length
        ? officialRows.map(row => ({
          player_name: String(row.player_name ?? ''),
          event_name: String(row.event_name ?? ''),
          points: parseRankingPoints(row.points),
          season: inferEventSeason(String(row.event_name ?? ''), Number(row.season ?? 2026)),
          rank: Number(String(row.rank_label ?? '').match(/\d+/)?.[0] ?? 0) || undefined,
          category: inferCategory(String(row.event_name ?? ''), String(row.category ?? '')),
          club_name: inferClubName(String(row.event_name ?? ''), String(row.club_name ?? '')),
          partner_name: String(row.partner_name ?? '').trim().toUpperCase(),
          event_date: resolveEventDate(String(row.event_name ?? ''), String(row.event_date ?? ''), Number(row.season ?? 2026), divToDb(division) as PlayerRankingDetail['division_key'], String(row.club_name ?? ''), inferCategory(String(row.event_name ?? ''), String(row.category ?? ''))),
          division_key: divToDb(division) as PlayerRankingDetail['division_key'],
          source: 'official' as const,
        })).filter(detail => detail.event_name && detail.points > 0)
        : [];

      const historical = await loadHistoricalPlayerData(player);
      setPlayerCareerStats(historical.stats);

      const currentDetails = await loadTournamentResultDetails(player);
      setPlayerDetails([...currentDetails, ...historical.details, ...officialDetails]);
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
        display: 'grid', gridTemplateColumns: tableColumns,
        gap: isCompact ? '6px' : '8px', padding: isCompact ? '8px 8px 6px' : '8px 16px 6px',
        color: '#555', fontSize: '11px', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.6px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        marginBottom: '6px',
      }}>
        <span style={{ textAlign: 'center' }}>#</span>
        <span>Joueur</span>
        <span style={{ textAlign: 'right' }}>Points</span>
        <span style={{ textAlign: 'center' }}>{isCompact ? 'Top 8' : 'Top 8 / joues'}</span>
        {!isCompact && <span style={{ textAlign: 'center' }}>Trend</span>}
        {!isCompact && <span style={{ textAlign: 'center' }}>Saison</span>}
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {displayed.map((r, i) => (
          <div key={`${r.id ?? r.player_name}-${i}`}
            className="mpl-table-row"
            onClick={() => openPlayer(r)}
            style={{
              display: 'grid', gridTemplateColumns: tableColumns,
              gap: isCompact ? '6px' : '8px', alignItems: 'center',
              padding: isCompact ? '9px 8px' : '10px 16px',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: isCompact ? '8px' : '12px', overflow: 'hidden', minWidth: 0 }}>
              {!isCompact && <Initials name={r.player_name} color={color} />}
              <span style={{
                color: r.rank <= 3 ? 'white' : 'rgba(255,255,255,0.85)',
                fontWeight: r.rank <= 10 ? 700 : 500,
                fontSize: isCompact ? '12px' : '14px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isCompact ? 'normal' : 'nowrap',
                lineHeight: 1.15,
              }}>
                {r.player_name}
              </span>
            </div>

            {/* Points */}
            <div style={{ textAlign: 'right' }}>
              <span style={{
                color: r.rank === 1 ? '#f59e0b' : r.rank <= 3 ? color : r.rank <= 10 ? 'white' : '#a0a0a0',
                fontWeight: r.rank <= 10 ? 800 : 600,
                fontSize: isCompact ? '12px' : r.rank <= 3 ? '16px' : '14px',
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

            {!isCompact && <TrendCell player={r} />}

            {!isCompact && <div style={{ textAlign: 'center', color: '#666', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace' }}>
              {r.season ?? 2026}
            </div>}
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
          divisionKey={divKey as PlayerRankingDetail['division_key']}
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
  const [globalMatches, setGlobalMatches] = useState<GlobalRankingMatch[]>([]);
  // Count reel par division - mis a jour depuis RankingTable via callback
  const [divCounts, setDivCounts] = useState<Partial<Record<Division,number>>>({});
  const updateCount = (div: Division, n: number) => setDivCounts(prev => ({ ...prev, [div]: n }));

  const activeConfig = TABS.find(t => t.key === activeTab)!;

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setGlobalMatches([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const localMatches = Object.entries(DATA_MAP)
        .flatMap(([division, rows]) => rows
          .filter(row => row.player_name.toLowerCase().includes(q.toLowerCase()))
          .map(row => ({
            player_name: row.player_name,
            division: division as Division,
            rank: row.rank,
            points: row.points,
            tournaments_played: row.tournaments_played,
          })))
        .slice(0, 12);

      if (!isSupabaseConnected()) {
        if (!cancelled) setGlobalMatches(localMatches);
        return;
      }

      const sb = getSupabaseClient();
      if (!sb) {
        if (!cancelled) setGlobalMatches(localMatches);
        return;
      }

      const { data, error } = await sb
        .from('rankings')
        .select('player_name,division,rank,points,tournaments_played')
        .ilike('player_name', `%${q.replace(/[%_,]/g, '')}%`)
        .order('rank', { ascending: true })
        .limit(16);

      if (cancelled) return;
      if (error || !data) {
        setGlobalMatches(localMatches);
        return;
      }

      setGlobalMatches((data as Record<string, unknown>[])
        .map(row => ({
          player_name: String(row.player_name ?? '').trim(),
          division: DB_TO_DIV[String(row.division ?? '').toLowerCase()] ?? 'MEN',
          rank: Number(row.rank ?? 0),
          points: parseRankingPoints(row.points),
          tournaments_played: Number(row.tournaments_played ?? 0),
        }))
        .filter(row => row.player_name)
        .sort((a, b) => a.player_name.localeCompare(b.player_name) || a.rank - b.rank)
        .slice(0, 12));
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search]);

  const stats = [
    { label: lang === 'fr' ? 'Hommes classes' : 'Men ranked',    val: divCounts['MEN']    != null ? `${divCounts['MEN']}`    : '-', icon: 'H', color: '#3b82f6' },
    { label: lang === 'fr' ? 'Dames classees'  : 'Women ranked', val: divCounts['WOMEN']  != null ? `${divCounts['WOMEN']}`  : '-', icon: 'D', color: '#ec4899' },
    { label: lang === 'fr' ? 'Juniors classes' : 'Juniors',      val: divCounts['JUNIOR'] != null ? `${divCounts['JUNIOR']}` : '-', icon: 'J', color: '#f59e0b' },
    { label: lang === 'fr' ? 'Mixte classes'   : 'Mixed',        val: divCounts['MIXTE']  != null ? `${divCounts['MIXTE']}`  : '-', icon: 'M', color: '#8b5cf6' },
  ];
  const activeCount = divCounts[activeTab] != null ? `${divCounts[activeTab]}` : '-';
  const rankingPeriod = rankingWindowRange();
  const rankingPeriodText = `${formatIsoDateFr(rankingPeriod.start)} -> ${formatIsoDateFr(rankingPeriod.end)}`;
  const rankingTodayText = formatIsoDateFr(rankingPeriod.end);

  return (
    <Layout>
      <section style={{ padding: '88px 24px 60px', minHeight: '80vh', position: 'relative', overflowY: 'hidden', overflowX: 'auto', background: 'linear-gradient(180deg, #0a0a0a 0%, #0c0c0c 100%)' }}>
        {/* Dot-wave droit, faible opacite */}
        <DotWaveBackground variant="hero-right" opacity={0.10} animate={false} />
        {/* Top gradient line */}
        <div style={{ position: 'absolute', top: 64, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(74,213,105,0.2) 50%, transparent 100%)' }} />
        <div style={{ maxWidth: '1100px', margin: '0 auto', minWidth: '320px' }}>

          {/* Header */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '18px',
            alignItems: 'end',
            justifyContent: 'space-between',
            marginBottom: '26px',
          }}>
            <div style={{ flex: '1 1 420px', minWidth: 0 }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 11px',
                borderRadius: '999px',
                border: '1px solid rgba(74,213,105,0.28)',
                background: 'rgba(74,213,105,0.08)',
                color: '#4ad569',
                fontSize: '11px',
                fontWeight: 900,
                letterSpacing: '0.9px',
                textTransform: 'uppercase',
                marginBottom: '14px',
              }}>
                <ShieldCheck size={14} />
                {lang === 'fr' ? 'Ranking officiel MPL' : 'Official MPL Ranking'}
              </div>
              <h1 style={{ fontSize: 'clamp(34px,5vw,64px)', fontWeight: 950, color: 'white', margin: '0 0 8px', letterSpacing: '-1px', lineHeight: 0.95 }}>
                {lang === 'fr' ? 'Classements' : 'Rankings'}
              </h1>
              <p style={{ color: '#9ca3af', margin: 0, fontSize: '15px', letterSpacing: '0.1px', lineHeight: 1.55, maxWidth: '680px' }}>
                {lang === 'fr'
                  ? 'Meilleurs 8 resultats sur les 12 derniers mois, calcules depuis les resultats reels.'
                  : 'Best 8 scores over the last 12 months, calculated from real results.'}
              </p>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                alignItems: 'center',
                marginTop: '12px',
                color: '#aeb7c4',
                fontSize: '12px',
                lineHeight: 1.35,
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  borderRadius: '999px',
                  border: '1px solid rgba(59,130,246,0.24)',
                  background: 'rgba(59,130,246,0.08)',
                  color: '#93c5fd',
                  fontWeight: 800,
                }}>
                  <CalendarDays size={13} />
                  {lang === 'fr' ? `Calcul au ${rankingTodayText}` : `Calculated on ${rankingTodayText}`}
                </span>
                <span style={{ color: '#777' }}>
                  {lang === 'fr' ? `Periode ranking: ${rankingPeriodText}` : `Ranking period: ${rankingPeriodText}`}
                </span>
              </div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(110px, 1fr))',
              gap: '10px',
              flex: '1 1 250px',
              maxWidth: '360px',
            }}>
              <div style={{
                border: '1px solid rgba(59,130,246,0.22)',
                background: 'rgba(59,130,246,0.07)',
                borderRadius: '12px',
                padding: '12px 14px',
              }}>
                <div style={{ color: activeConfig.color, fontFamily: 'JetBrains Mono, monospace', fontWeight: 900, fontSize: '22px', lineHeight: 1 }}>{activeCount}</div>
                <div style={{ color: '#777', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: '5px' }}>{lang === 'fr' ? 'Joueurs actifs' : 'Active players'}</div>
              </div>
              <div style={{
                border: '1px solid rgba(245,158,11,0.22)',
                background: 'rgba(245,158,11,0.07)',
                borderRadius: '12px',
                padding: '12px 14px',
              }}>
                <div style={{ color: '#f59e0b', fontFamily: 'JetBrains Mono, monospace', fontWeight: 900, fontSize: '22px', lineHeight: 1 }}>Top 8</div>
                <div style={{ color: '#777', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: '5px' }}>{lang === 'fr' ? 'Regle 12 mois' : '12-month rule'}</div>
              </div>
            </div>
          </div>

          <div style={{
            border: '1px solid rgba(74,213,105,0.18)',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02))',
            borderRadius: '16px',
            padding: '14px',
            marginBottom: '24px',
            boxShadow: '0 18px 50px rgba(0,0,0,0.24)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#777', fontSize: '12px', margin: '0 4px 12px', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#4ad569', fontWeight: 800 }}>
                <Database size={13} />
                {lang === 'fr' ? 'Donnees live' : 'Live data'}
              </span>
              <span>•</span>
              <span>{lang === 'fr' ? 'Classement recalcule automatiquement a chaque publication officielle.' : 'Ranking recalculated automatically after each official publication.'}</span>
            </div>

          {/* Onglets division */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(138px, 1fr))', gap: '10px' }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setSearch(''); }}
                style={{
                  padding: '13px 14px', borderRadius: '12px',
                  cursor: 'pointer', fontSize: '14px', fontWeight: 800,
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  background: activeTab === tab.key
                    ? `linear-gradient(135deg, ${tab.color}22 0%, rgba(255,255,255,0.06) 100%)`
                    : 'rgba(255,255,255,0.035)',
                  color: activeTab === tab.key ? 'white' : 'rgba(255,255,255,0.62)',
                  boxShadow: activeTab === tab.key ? `0 10px 30px ${tab.color}20` : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                  border: activeTab === tab.key ? `1px solid ${tab.color}80` : '1px solid rgba(255,255,255,0.07)',
                  letterSpacing: '0.1px',
                }}
                onMouseEnter={e => { if (activeTab !== tab.key) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.75)'; }}}
                onMouseLeave={e => { if (activeTab !== tab.key) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'; }}}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '8px',
                    background: `${tab.color}20`,
                    color: tab.color,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '12px',
                    fontWeight: 900,
                  }}>{tab.icon}</span>
                  <span>{lang === 'fr' ? tab.label_fr : tab.label_en}</span>
                </span>
                <span style={{
                  color: activeTab === tab.key ? tab.color : '#777',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '12px',
                  fontWeight: 900,
                }}>{divCounts[tab.key] ?? '-'}</span>
              </button>
            ))}
          </div>
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

          {search.trim().length >= 2 && globalMatches.length > 0 && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              alignItems: 'center',
              margin: '-8px 0 18px',
              color: '#777',
              fontSize: '12px',
            }}>
              <span style={{ color: '#888', fontWeight: 700 }}>
                Trouve aussi dans :
              </span>
              {globalMatches.map(match => {
                const tab = TABS.find(item => item.key === match.division);
                const isActiveDivision = match.division === activeTab;
                return (
                  <button
                    key={`${match.division}-${match.player_name}`}
                    onClick={() => setActiveTab(match.division)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      maxWidth: '100%',
                      borderRadius: '999px',
                      border: `1px solid ${tab?.color ?? '#4ad569'}45`,
                      background: isActiveDivision ? `${tab?.color ?? '#4ad569'}18` : 'rgba(255,255,255,0.035)',
                      color: 'rgba(255,255,255,0.85)',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 800,
                    }}
                    title={`Voir ${match.player_name} en ${tab?.label_fr ?? match.division}`}
                  >
                    <span style={{ color: tab?.color ?? '#4ad569' }}>{tab?.label_fr ?? match.division}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.player_name}</span>
                    <span style={{ color: '#f59e0b' }}>#{match.rank}</span>
                    <span style={{ color: '#aaa' }}>{formatPoints(match.points)} pts</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Tableau */}
          <GlassCard style={{ padding: '16px 0' }}>
            <div style={{ padding: '0 16px 12px', color: '#777', fontSize: '12px' }}>
              Ranking officiel: meilleurs 8 resultats sur les 12 derniers mois. Calcul au {rankingTodayText} - periode {rankingPeriodText}.
            </div>
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



