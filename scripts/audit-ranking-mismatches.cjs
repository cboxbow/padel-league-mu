/* eslint-disable no-console */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const DIVS = ['men', 'women', 'mixed', 'junior'];

function cleanText(value) {
  return String(value ?? '').trim();
}

function normKey(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function compactEventName(value) {
  return normKey(value).replace(/\s+/g, '');
}

function normalizeDivision(value, category) {
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

function normalizeRankingDivision(value, category, eventName = '') {
  const inferred = inferDivisionFromEventName(eventName);
  if (inferred) return inferred;
  const normalized = normalizeDivision(value, category);
  return DIVS.includes(normalized) ? normalized : 'men';
}

function normalizeJuniorCategory(category) {
  const value = cleanText(category).toUpperCase().replace(/\s+/g, ' ');
  if (value === 'U10') return 'U11';
  if (value === 'U12') return 'U13';
  if (value === 'U14') return 'U15';
  if (value === 'JUNIOR U10') return 'JUNIOR U11';
  if (value === 'JUNIOR U12') return 'JUNIOR U13';
  if (value === 'JUNIOR U14') return 'JUNIOR U15';
  return cleanText(category);
}

function categoryKey(value) {
  const raw = normalizeJuniorCategory(value);
  return normKey(raw).replace(/\s+/g, '');
}

function isPlaceholderText(value) {
  const text = cleanText(value);
  return !text || text === '-' || text === '?' || /^#?-?$/.test(text);
}

function normalizeClubName(value) {
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

function inferDivisionFromEventName(eventName) {
  const event = ` ${normKey(eventName)} `;
  if (/\b(JUNIOR|U10|U11|U12|U13|U14|U15)\b/.test(event)) return 'junior';
  if (/\b(MIXED|MIXTE)\b/.test(event)) return 'mixed';
  if (/\b(WOMEN|WOME|WOM|DAMES|DAME|FEMMES|FEMME)\b/.test(event)) return 'women';
  if (/\b(MEN|HOMMES|HOMME)\b/.test(event)) return 'men';
  return '';
}

function eventIdentity(row) {
  const date = cleanText(row.event_date).slice(0, 10);
  const club = compactEventName(normalizeClubName(row.club_name) || row.club_name || row.event_name);
  const division = normalizeRankingDivision(row.division, row.category, row.event_name);
  const category = division === 'mixed' ? 'MIXED' : categoryKey(row.category);
  if (date && club && category) return [date, club, division, category].join('|');
  return compactEventName(row.event_key || row.event_name || row.id);
}

function computeFixedMauritiusPeriod() {
  const todayIso = process.env.RANKING_TODAY || new Date().toLocaleDateString('en-CA', { timeZone: 'Indian/Mauritius' });
  const [year, month, day] = todayIso.split('-').map(Number);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  start.setHours(0, 0, 0, 0);
  return {
    start,
    end,
    startIso: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
    endIso: todayIso,
  };
}

function rankNumber(row) {
  const direct = Number(row.rank_min ?? row.rank_max ?? row.rank);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = cleanText(row.rank_label).match(/\d+/);
  return match ? Number(match[0]) : 999;
}

function historicalToInputs(row, source) {
  const category = normalizeJuniorCategory(row.category || row.junior_category || '');
  const division = normalizeRankingDivision(row.division, category, row.event_name);
  const date = cleanText(row.event_date).slice(0, 10);
  const clubName = normalizeClubName(row.club_name);
  const rank = rankNumber(row);
  const points = Math.ceil(Number(row.points) || 0);
  const player1 = cleanText(row.player1_name);
  const player2 = cleanText(row.player2_name);
  const base = {
    source,
    id: row.id,
    event_key: row.event_key,
    event_name: cleanText(row.event_name),
    event_date: date,
    category,
    division,
    club_name: clubName,
    rank,
    points,
  };
  return [
    player1 ? { ...base, player_name: player1, partner_name: player2 } : null,
    player2 ? { ...base, player_name: player2, partner_name: player1 } : null,
  ].filter(Boolean);
}

function legacyToInputs(row) {
  const category = normalizeJuniorCategory(row.category);
  const division = normalizeRankingDivision(row.division, category, row.tournament_name);
  const date = cleanText(row.tournament_date).slice(0, 10);
  const clubName = normalizeClubName(row.club_name);
  const rank = Number(row.rank ?? 999);
  const points = Math.ceil(Number(row.points) || 0);
  const player1 = cleanText(row.player1_name);
  const player2 = cleanText(row.player2_name);
  const base = {
    source: 'legacy',
    event_name: cleanText(row.tournament_name),
    event_date: date,
    category,
    division,
    club_name: clubName,
    rank,
    points,
  };
  return [
    player1 ? { ...base, player_name: player1, partner_name: player2 } : null,
    player2 ? { ...base, player_name: player2, partner_name: player1 } : null,
  ].filter(Boolean);
}

function dedupeInputs(rows) {
  const byKey = new Map();
  const hasReliableIdentity = (row) => {
    const partner = cleanText(row.partner_name);
    const rank = Number(row.rank);
    return Boolean(!isPlaceholderText(partner) && normKey(partner) !== normKey(row.player_name)) && Number.isFinite(rank) && rank > 0 && rank < 999;
  };
  const isGhostRow = (row) => !hasReliableIdentity(row) && (isPlaceholderText(row.partner_name) || !Number.isFinite(Number(row.rank)) || Number(row.rank) >= 999);
  const qualityScore = (row) => {
    let score = 0;
    if (hasReliableIdentity(row)) score += 100;
    if (!isPlaceholderText(row.partner_name)) score += 12;
    if (Number(row.rank) > 0 && Number(row.rank) < 999) score += 8;
    if (cleanText(row.event_key)) score += 6;
    if (cleanText(row.id)) score += 2;
    if (cleanText(row.club_name)) score += 2;
    if (cleanText(row.event_date)) score += 2;
    if (row.source === 'historical') score += 1;
    return score;
  };
  for (const row of rows) {
    if (!cleanText(row.player_name) || !cleanText(row.event_date) || !Math.ceil(Number(row.points) || 0)) continue;
    const key = [
      eventIdentity(row),
      row.division,
      row.division === 'mixed' ? 'MIXED' : row.category,
      normKey(row.player_name),
    ].join('|');
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const rowReliable = hasReliableIdentity(row);
    const existingReliable = hasReliableIdentity(existing);
    if (isGhostRow(row) && existingReliable) continue;
    if (rowReliable && isGhostRow(existing)) {
      byKey.set(key, row);
      continue;
    }
    if (
      (rowReliable && !existingReliable) ||
      qualityScore(row) > qualityScore(existing) ||
      (qualityScore(row) === qualityScore(existing) && Number(row.points) > Number(existing.points))
    ) {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values());
}

function sumTop8(rows) {
  return rows
    .slice()
    .sort((a, b) => b.points - a.points || b.event_date.localeCompare(a.event_date) || a.rank - b.rank)
    .slice(0, 8)
    .reduce((sum, row) => sum + Math.ceil(Number(row.points) || 0), 0);
}

async function fetchAll(supabase, table, select, buildQuery) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; from < 30000; from += pageSize) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (buildQuery) query = buildQuery(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const period = computeFixedMauritiusPeriod();
  const historicalColumns = [
    'id','event_key','event_name','event_year','season','category','division','junior_category','club_name','event_date',
    'rank_label','rank_min','rank_max','player1_name','player2_name','points',
  ].join(',');
  const rankings = await fetchAll(supabase, 'rankings', 'player_name,rank,points,division,tournaments_played', (q) => q.order('division').order('rank'));
  const historicalRows = await fetchAll(
    supabase,
    'historical_tournament_results',
    historicalColumns,
    (q) => q.gte('event_date', period.startIso).lte('event_date', period.endIso).order('event_date', { ascending: false })
  );
  const legacyRows = await fetchAll(
    supabase,
    'tournament_results',
    '*',
    (q) => q.gte('tournament_date', period.startIso).lte('tournament_date', period.endIso)
  ).catch(() => []);

  const historicalInputs = dedupeInputs(historicalRows.flatMap((row) => historicalToInputs(row, 'historical')));
  const fullInputs = dedupeInputs([...historicalRows.flatMap((row) => historicalToInputs(row, 'historical')), ...legacyRows.flatMap(legacyToInputs)]);

  const byKey = new Map();
  const histByKey = new Map();
  for (const row of fullInputs) {
    const key = `${row.division}|${normKey(row.player_name)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  for (const row of historicalInputs) {
    const key = `${row.division}|${normKey(row.player_name)}`;
    histByKey.set(key, [...(histByKey.get(key) ?? []), row]);
  }

  const mismatches = [];
  for (const row of rankings) {
    const key = `${normalizeRankingDivision(row.division)}|${normKey(row.player_name)}`;
    const published = Math.ceil(Number(row.points) || 0);
    const full = sumTop8(byKey.get(key) ?? []);
    const hist = sumTop8(histByKey.get(key) ?? []);
    if (published !== full || published !== hist) {
      mismatches.push({
        player: row.player_name,
        division: row.division,
        rank: row.rank,
        published,
        full,
        visibleHistorical: hist,
        gapFull: published - full,
        gapVisible: published - hist,
        fullPlayed: (byKey.get(key) ?? []).length,
        historicalPlayed: (histByKey.get(key) ?? []).length,
      });
    }
  }

  console.log(`Period: ${period.startIso} -> ${period.endIso}`);
  console.log(`Rankings: ${rankings.length}`);
  console.log(`Historical player rows: ${historicalInputs.length}`);
  console.log(`Full player rows: ${fullInputs.length}`);
  console.log(`Mismatches vs full: ${mismatches.filter((m) => m.gapFull !== 0).length}`);
  console.log(`Mismatches vs visible historical: ${mismatches.filter((m) => m.gapVisible !== 0).length}`);
  console.log('Top mismatches vs visible historical:');
  console.table(mismatches
    .filter((m) => m.gapVisible !== 0)
    .sort((a, b) => Math.abs(b.gapVisible) - Math.abs(a.gapVisible))
    .slice(0, 25));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
