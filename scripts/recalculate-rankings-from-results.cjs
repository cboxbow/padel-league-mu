/* eslint-disable no-console */
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const index = line.indexOf('=');
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
        return [key, value];
      })
  );
}

const env = { ...readEnvFile('.env.local'), ...readEnvFile('.env.admin'), ...process.env };
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const DIVS = ['men', 'women', 'mixed', 'junior'];
const DIV_LABELS = {
  men: 'Hommes',
  women: 'Dames',
  mixed: 'Mixte',
  junior: 'Junior',
};

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

const PLAYER_NAME_ALIASES = new Map([
  ['DALLE GRAVE TIPPI', 'TIPPI DALLE-GRAVE'],
  ['TIPPI DALLE GRAVE', 'TIPPI DALLE-GRAVE'],
  ['DANE DOHERTY BIGARA', 'DANE DOHERTY-BIGARA'],
  ['SOOHINESH DIP', 'DIP SOOHINESH'],
  ['ROBERT LARRY', 'LARRY ROBERT'],
  ['SHEIKH ALI NASSIM', 'NASSIM SHEIKH ALI'],
  ['SHONA LI QUERY', 'SHONA-LI QUERY'],
  ['ZAKARIA AFIF', 'AFIF ZAKARIA'],
  ['ELIAN BESSONART', 'ELIAN BESSONNART'],
  ['JOHAN ESPITALIER NOEL', 'JOHAN ESPITALIER-NOEL'],
  ['HICHAM HARBAOUI', 'HICHAM RHARBAOUI'],
  ['ANTHONY WOK', 'ANTHONY KWOK'],
  ['SAMUEL AVAN', 'SAMUEL AVA'],
  ['SAMUEL AVAR', 'SAMUEL AVA'],
  ['KIRILL YZHNIKOV', 'KIRILL LYZHNIKOV'],
  ['CHARLIE GOURPIL', 'CHARLIE GOUPIL'],
  ['NATHAN CURIMJEE', 'NATHAN CURRIMJEE'],
  ['QUENTIN TELOHAN', 'QUENTIN THELOHAN'],
  ['FABRICE NOUGERA', 'FABRICE NOGUERA'],
  ['LEONARDO NAVARINI', 'LEONARDO NAVARRINI'],
  ['JORDAN JAUFERET', 'JORDAN JAUFFRET'],
  ['THOMAS RENETEAU', 'THOMAS RENNETEAU'],
  ['MATHIEU DELACHE', 'MATTHIEU DELACHE'],
  ['ANDREW VAN WAH', 'ANDREW KAN WAH'],
  ['DAMIEN PUTTEA', 'DAMIEN PUTTEEA'],
  ['ROMAIN DE BRAKELEER', 'ROMAIN DE BRAEKELEER'],
  ['JEAN EDERIN ROUGAGNOU', 'JEAN-EDERN ROUGAGNOU'],
  ['MAXENCE VAN BENEDEDEN', 'MAXENCE VAN BENEDEN'],
  ['PHILIP ROHNACHET', 'PHILIP ROHNACHER'],
  ['RAJEEV MOHONEE', 'RAJEEV MOHOONEE'],
  ['ELIZABETH RETCHER', 'ELIZABETH RECTER'],
  ['ARMELLE DESVAUX DE MARIGI', 'ARMELLE DESVAUX DE MARIGNY'],
  ['ANNE SOPHIE DE LA GOURNER', 'ANNE-SOPHIE DE LA GOURNERIE'],
  ['CHARLENE PERTERSEN', 'CHARLENE PETERSEN'],
  ['MARINE GIRAUD', 'MARINNE GIRAUD'],
]);

function canonicalPlayerName(value) {
  const cleaned = cleanText(value).replace(/\s+/g, ' ').toUpperCase();
  if (!cleaned) return '';
  return PLAYER_NAME_ALIASES.get(normKey(cleaned)) || cleaned;
}

function playerIdentityKey(row) {
  return cleanText(row.player_id) || normKey(row.player_name);
}

function playerNameCandidates(player) {
  return [
    [player.first_name, player.last_name].filter(Boolean).join(' '),
    [player.last_name, player.first_name].filter(Boolean).join(' '),
    player.player_name,
    player.full_name,
    player.name,
  ].map(canonicalPlayerName).filter(Boolean);
}

function createPlayerResolver(players) {
  const byName = new Map();
  for (const player of players) {
    for (const name of playerNameCandidates(player)) {
      const key = normKey(name);
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(player);
    }
  }
  return (name) => {
    const matches = byName.get(normKey(canonicalPlayerName(name))) || [];
    const uniqueIds = Array.from(new Set(matches.map((player) => player.id).filter(Boolean)));
    return uniqueIds.length === 1 ? uniqueIds[0] : null;
  };
}

function compactEventName(value) {
  return normKey(value).replace(/\s+/g, '');
}

function categoryKey(value) {
  const raw = normalizeJuniorCategory(value);
  return normKey(raw).replace(/\s+/g, '');
}

function isPlaceholderText(value) {
  const text = cleanText(value);
  return !text || text === '-' || text === '?' || /^#?-?$/.test(text);
}

function eventIdentity(row) {
  const date = cleanText(row.event_date).slice(0, 10);
  const club = compactEventName(normalizeClubName(row.club_name) || row.club_name || row.event_name);
  const division = normalizeRankingDivision(row.division, row.category, row.event_name);
  const category = division === 'mixed' ? 'MIXED' : categoryKey(row.category);
  if (date && club && category) return [date, club, division, category].join('|');
  return compactEventName(row.event_key || row.event_name || row.id);
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

function normalizeClubName(value) {
  const name = cleanText(value);
  if (!name) return '';
  return name
    .replace(/^SPARC$/i, 'SPARC Cascavelle')
    .replace(/\bCascavelle\b/gi, 'SPARC Cascavelle')
    .replace(/Ca\?a|Ca\u00f1a|CANA/gi, 'Ca\u00f1a')
    .replace(/Isla Padel de Beau Plan/gi, 'Isla Padel Beau Plan')
    .replace(/Labourdonnais Sports Club|LAB SPORTS CLUB/gi, 'Labourdonnais Mapou')
    .replace(/RM\s*Forbach|RM Club Grand Baie\s*\(Forbach\)|Grand Baie\s*\(Forbach\)/gi, 'RM Club Grand Baie')
    .replace(/I Padel RM/gi, 'I Padel by RM')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTournamentDisplayName(name, clubName = '') {
  const original = cleanText(name);
  const club = normalizeClubName(clubName);
  if (!original) return club || 'Tournoi MPL';
  return original
    .replace(/Cascavelle/gi, 'SPARC Cascavelle')
    .replace(/RM\s*Forbach|RM Club Grand Baie\s*\(Forbach\)|Grand Baie\s*\(Forbach\)/gi, 'RM Club Grand Baie')
    .replace(/Ca\?a|Ca\u00f1a|CANA/gi, 'Ca\u00f1a')
    .replace(/Isla Padel de Beau Plan/gi, 'Isla Padel Beau Plan')
    .replace(/Junior U10/gi, 'Junior U11')
    .replace(/Junior U12/gi, 'Junior U13')
    .replace(/Junior U14/gi, 'Junior U15')
    .replace(/\s+/g, ' ')
    .trim();
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

function inferDivisionFromEventName(eventName) {
  const event = ` ${normKey(eventName)} `;
  if (/\b(JUNIOR|U10|U11|U12|U13|U14|U15)\b/.test(event)) return 'junior';
  if (/\b(MIXED|MIXTE)\b/.test(event)) return 'mixed';
  if (/\b(WOMEN|WOME|WOM|DAMES|DAME|FEMMES|FEMME)\b/.test(event)) return 'women';
  if (/\b(MEN|HOMMES|HOMME)\b/.test(event)) return 'men';
  return '';
}

function normalizeRankingDivision(value, category, eventName = '') {
  const eventDivision = inferDivisionFromEventName(eventName);
  if (eventDivision) return eventDivision;
  const normalized = normalizeDivision(value, category);
  return DIVS.includes(normalized) ? normalized : 'men';
}

function newId() {
  return crypto.randomUUID();
}

function computeRollingPeriod(today = new Date()) {
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  start.setHours(0, 0, 0, 0);
  return {
    start,
    end,
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10),
    season: end.getFullYear(),
  };
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
    season: year,
  };
}

function rankNumber(row) {
  const direct = Number(row.rank_min ?? row.rank_max ?? row.rank);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = cleanText(row.rank_label).match(/\d+/);
  return match ? Number(match[0]) : 999;
}

function parseRankingPoints(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = cleanText(value).replace(/\s+/g, '').replace(',', '.');
  if (!text || text === '-') return 0;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function historicalToRankingInputs(row) {
  const rawCategory = normalizeJuniorCategory(row.category || row.junior_category || '');
  const division = normalizeRankingDivision(row.division, rawCategory, row.event_name);
  const category = division === 'mixed' ? 'MIXED' : rawCategory;
  const date = cleanText(row.event_date).slice(0, 10);
  const clubName = normalizeClubName(row.club_name);
  const rank = rankNumber(row);
  const points = parseRankingPoints(row.points);
  const player1 = canonicalPlayerName(row.player1_name);
  const player2 = canonicalPlayerName(row.player2_name);
  const base = {
    id: row.id,
    event_key: row.event_key,
    event_name: normalizeTournamentDisplayName(row.event_name, clubName),
    event_date: date,
    category,
    division,
    club_name: clubName,
    rank,
    points,
    source: 'historical',
  };
  return [
    player1 ? { ...base, player_name: player1, partner_name: player2, player_id: row.player1_id ?? null, partner_id: row.player2_id ?? null } : null,
    player2 ? { ...base, player_name: player2, partner_name: player1, player_id: row.player2_id ?? null, partner_id: row.player1_id ?? null } : null,
  ].filter(Boolean);
}

function resultToRankingInputs(row) {
  const rawCategory = normalizeJuniorCategory(row.category);
  const division = normalizeRankingDivision(row.division, rawCategory, row.tournament_name);
  const category = division === 'mixed' ? 'MIXED' : rawCategory;
  const date = cleanText(row.tournament_date).slice(0, 10);
  const clubName = normalizeClubName(row.club_name);
  const points = parseRankingPoints(row.points);
  const player1 = canonicalPlayerName(row.player1_name);
  const player2 = canonicalPlayerName(row.player2_name);
  const base = {
    id: row.id,
    event_name: normalizeTournamentDisplayName(row.tournament_name, clubName),
    event_date: date,
    category,
    division,
    club_name: clubName,
    rank: Number(row.rank ?? 999),
    points,
    source: 'current',
  };
  return [
    player1 ? { ...base, player_name: player1, partner_name: player2, player_id: row.player1_id ?? null, partner_id: row.player2_id ?? null } : null,
    player2 ? { ...base, player_name: player2, partner_name: player1, player_id: row.player2_id ?? null, partner_id: row.player1_id ?? null } : null,
  ].filter(Boolean);
}

function dedupeRankingInputs(rows) {
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
    if (cleanText(row.source) === 'historical') score += 4;
    if (cleanText(row.source) === 'current') score += 3;
    return score;
  };
  for (const row of rows) {
    if (!cleanText(row.player_name) || !cleanText(row.event_date) || !parseRankingPoints(row.points)) continue;
    const key = [
      eventIdentity(row),
      row.division,
      row.division === 'mixed' ? 'MIXED' : row.category,
      playerIdentityKey(row),
    ].join('|');
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const rowQuality = qualityScore(row);
    const existingQuality = qualityScore(existing);
    const rowReliable = hasReliableIdentity(row);
    const existingReliable = hasReliableIdentity(existing);
    if (isGhostRow(row) && existingReliable) continue;
    if (rowReliable && isGhostRow(existing)) {
      byKey.set(key, row);
      continue;
    }
    const samePoints = parseRankingPoints(row.points) === parseRankingPoints(existing.points);
    if (
      (rowReliable && !existingReliable) ||
      (rowReliable === existingReliable && rowQuality > existingQuality) ||
      (rowReliable === existingReliable && rowQuality === existingQuality && samePoints && cleanText(row.source) === 'historical' && cleanText(existing.source) !== 'historical') ||
      (rowReliable === existingReliable && rowQuality === existingQuality && parseRankingPoints(row.points) > parseRankingPoints(existing.points) && !existingReliable)
    ) {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values());
}

function rankTrend(rank, rankBefore) {
  if (!rankBefore || rankBefore === rank) return 'same';
  return rank < rankBefore ? 'up' : 'down';
}

function computeRankingRows(inputs, previousRanks, period) {
  const byDivision = new Map();
  for (const row of inputs) {
    const date = new Date(`${row.event_date}T12:00:00`);
    if (!row.player_name || !row.event_date || Number.isNaN(date.getTime())) continue;
    if (date < period.start || date > period.end) continue;
    if (!byDivision.has(row.division)) byDivision.set(row.division, new Map());
    const playerName = canonicalPlayerName(row.player_name);
    const key = cleanText(row.player_id) || normKey(playerName);
    const playerRows = byDivision.get(row.division);
    playerRows.set(key, [...(playerRows.get(key) ?? []), { ...row, player_name: playerName }]);
  }

  const computed = [];
  for (const [division, players] of byDivision) {
    const divisionRows = Array.from(players.values())
      .map((playerRows) => {
        const sortedDetails = [...playerRows].sort((a, b) =>
          b.points - a.points ||
          b.event_date.localeCompare(a.event_date) ||
          a.rank - b.rank
        );
        const retained = sortedDetails.slice(0, 8);
        const retainedTotal = retained.reduce((sum, row) => sum + parseRankingPoints(row.points), 0);
        return {
          player_name: sortedDetails[0].player_name,
          points: retainedTotal,
          tournaments_played: sortedDetails.length,
          division,
          details: sortedDetails.map((detail, index) => ({ ...detail, is_retained: index < 8 })),
        };
      })
      .filter((row) => row.points > 0)
      .sort((a, b) => b.points - a.points || a.player_name.localeCompare(b.player_name));

    let lastPoints = -1;
    let lastRank = 0;
    divisionRows.forEach((row, index) => {
      const rank = row.points === lastPoints ? lastRank : index + 1;
      lastPoints = row.points;
      lastRank = rank;
      const rankBefore = previousRanks.get(`${division}|${playerIdentityKey(row)}`) ?? rank;
      computed.push({
        id: newId(),
        player_id: cleanText(row.details[0]?.player_id) || null,
        player_name: row.player_name,
        rank,
        rank_before: rankBefore,
        points: parseRankingPoints(row.points),
        division,
        tournaments_played: row.tournaments_played,
        trend: rankTrend(rank, rankBefore),
        season: period.season,
        details: row.details,
      });
    });
  }
  return computed;
}

function assertRankingDetailsMatch(rows) {
  const mismatches = rows
    .map((row) => {
      const detailTotal = row.details
        .filter((detail) => detail.is_retained)
        .reduce((sum, detail) => sum + parseRankingPoints(detail.points), 0);
      return {
        row,
        detailTotal,
        gap: parseRankingPoints(row.points) - detailTotal,
      };
    })
    .filter((entry) => entry.gap !== 0);

  if (mismatches.length) {
    const sample = mismatches.slice(0, 12).map(({ row, detailTotal, gap }) =>
      `${row.division} | ${row.player_name} | ranking ${row.points} | details ${detailTotal} | ecart ${gap}`
    ).join('\n');
    throw new Error(`Controle Top 8 impossible: ${mismatches.length} joueurs avec ecart.\n${sample}`);
  }
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

async function hasColumn(supabase, table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  return !error;
}

function withOptionalFields(row, fields) {
  const optionalFields = new Set(['player_id']);
  return Object.fromEntries(Object.entries(row).filter(([key, value]) =>
    value !== null && value !== undefined && (!optionalFields.has(key) || fields.has(key))
  ));
}

async function deleteByDivision(supabase, table, division) {
  for (;;) {
    const { data, error } = await supabase.from(table).select('id').eq('division', division).limit(250);
    if (error) throw new Error(`${table}: ${error.message}`);
    const ids = (data ?? []).map((row) => row.id).filter(Boolean);
    if (!ids.length) break;
    const { error: deleteError } = await supabase.from(table).delete().in('id', ids);
    if (deleteError) throw new Error(`${table}: ${deleteError.message}`);
  }
}

async function insertChunks(supabase, table, payload, chunkSize) {
  for (let i = 0; i < payload.length; i += chunkSize) {
    const { error } = await supabase.from(table).insert(payload.slice(i, i + chunkSize));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('1/5 Correction tournoi Women Urban GB Oct 2025...');
  const { data: badRows, error: readBadError } = await supabase
    .from('historical_tournament_results')
    .select('id,event_name,division,category,player1_name,player2_name,points')
    .ilike('event_name', '%URBAN GB%OCT%25%WOME%');
  if (readBadError) throw readBadError;

  const idsToFix = (badRows ?? []).filter((row) => row.division !== 'women').map((row) => row.id);
  if (idsToFix.length) {
    const { error } = await supabase
      .from('historical_tournament_results')
      .update({ division: 'women' })
      .in('id', idsToFix);
    if (error) throw error;
  }
  console.log(`   ${idsToFix.length} lignes corrigees en women.`);

  const period = computeFixedMauritiusPeriod();
  console.log(`2/5 Lecture resultats ${period.startIso} -> ${period.endIso}...`);
  const schema = {
    historicalPlayerIds: await hasColumn(supabase, 'historical_tournament_results', 'player1_id'),
    tournamentPlayerIds: await hasColumn(supabase, 'tournament_results', 'player1_id'),
    rankingsPlayerId: await hasColumn(supabase, 'rankings', 'player_id'),
    officialRankingsPlayerId: await hasColumn(supabase, 'official_rankings', 'player_id'),
    officialDetailsPlayerId: await hasColumn(supabase, 'official_ranking_details', 'player_id'),
  };
  const players = await fetchAll(supabase, 'players', 'id,first_name,last_name');
  const resolvePlayerId = createPlayerResolver(players);
  const historicalColumns = [
    'id','source_file','sheet_name','event_key','event_name','event_year','season','category','division',
    'junior_category','club_name','event_date','region','rank_label','rank_min','rank_max','team_name',
    'player1_name','player2_name','points',
    ...(schema.historicalPlayerIds ? ['player1_id','player2_id'] : []),
  ].join(',');
  const historical = await fetchAll(
    supabase,
    'historical_tournament_results',
    historicalColumns,
    (query) => query.gte('event_date', period.startIso).lte('event_date', period.endIso).order('event_date', { ascending: false })
  );
  let inputs = historical.flatMap(historicalToRankingInputs);

  try {
    const legacyColumns = schema.tournamentPlayerIds ? '*' : [
      'id','tournament_id','tournament_name','tournament_date','category','division','region','club_name',
      'rank','team_name','player1_name','player2_name','points','created_at',
    ].join(',');
    const legacy = await fetchAll(
      supabase,
      'tournament_results',
      legacyColumns,
      (query) => query.gte('tournament_date', period.startIso).lte('tournament_date', period.endIso)
    );
    inputs.push(...legacy.flatMap(resultToRankingInputs));
  } catch (error) {
    console.warn(`   tournament_results ignore: ${error.message}`);
  }
  inputs = inputs.map((row) => ({
    ...row,
    player_id: cleanText(row.player_id) || resolvePlayerId(row.player_name),
    partner_id: cleanText(row.partner_id) || resolvePlayerId(row.partner_name),
  }));
  inputs = dedupeRankingInputs(inputs);
  console.log(`   ${inputs.length} lignes joueurs detectees.`);

  console.log('3/5 Calcul Top 8 et rangs...');
  const previousRows = await fetchAll(
    supabase,
    'official_rankings',
    schema.officialRankingsPlayerId ? 'player_id,player_name,division,rank,batch_id,created_at' : 'player_name,division,rank,batch_id,created_at',
    (query) => query.order('created_at', { ascending: false }).limit(5000)
  );
  const latestBatch = String(previousRows.find((row) => row.batch_id)?.batch_id ?? '');
  const latestCreatedAt = String(previousRows[0]?.created_at ?? '').slice(0, 16);
  const previousRanks = new Map();
  for (const row of previousRows) {
    if (latestBatch && String(row.batch_id ?? '') !== latestBatch) continue;
    if (!latestBatch && latestCreatedAt && String(row.created_at ?? '').slice(0, 16) !== latestCreatedAt) continue;
    const division = normalizeRankingDivision(row.division);
    const name = cleanText(row.player_id) || normKey(canonicalPlayerName(row.player_name));
    const rank = Number(row.rank ?? 0);
    if (name && Number.isFinite(rank) && rank > 0) previousRanks.set(`${division}|${name}`, rank);
  }
  const rows = computeRankingRows(inputs, previousRanks, period);
  if (!rows.length) throw new Error('Aucun classement calcule.');
  assertRankingDetailsMatch(rows);
  const divisions = Array.from(new Set(rows.map((row) => row.division)));
  const batchId = newId();
  const now = new Date().toISOString();

  console.log('4/5 Publication rankings et official_rankings...');
  for (const division of divisions) {
    await deleteByDivision(supabase, 'rankings', division);
  }
  await insertChunks(supabase, 'rankings', rows.map((row) => withOptionalFields({
    id: row.id,
    player_id: row.player_id,
    player_name: row.player_name,
    rank: row.rank,
    rank_before: row.rank_before,
    points: row.points,
    division: row.division,
    tournaments_played: row.tournaments_played,
    trend: row.trend,
    season: row.season,
    updated_at: now,
  }, schema.rankingsPlayerId ? new Set(['player_id']) : new Set())), 250);

  for (const division of divisions) {
    await deleteByDivision(supabase, 'official_rankings', division);
  }
  await insertChunks(supabase, 'official_rankings', rows.map((row) => withOptionalFields({
    id: newId(),
    player_id: row.player_id,
    player_name: row.player_name,
    rank: row.rank,
    rank_before: row.rank_before,
    points: row.points,
    division: row.division,
    tournaments_played: row.tournaments_played,
    trend: row.trend,
    season: row.season,
    is_current: true,
    batch_id: batchId,
  }, schema.officialRankingsPlayerId ? new Set(['player_id']) : new Set())), 250);

  console.log('5/5 Publication details officiels...');
  for (const division of divisions) {
    await deleteByDivision(supabase, 'official_ranking_details', division);
  }
  const details = rows.flatMap((row) => row.details.map((detail) => ({
    id: newId(),
    player_id: row.player_id,
    player_name: row.player_name,
    division: row.division,
    event_name: detail.event_name,
    event_date: detail.event_date,
    category: detail.category,
    club_name: detail.club_name,
    partner_name: detail.partner_name,
    rank_label: Number(detail.rank) > 0 && Number(detail.rank) < 999 ? `#${detail.rank}` : '',
    points: parseRankingPoints(detail.points),
    season: Number(detail.event_date.slice(0, 4)) || row.season,
    batch_id: batchId,
  })).map((row) => withOptionalFields(row, schema.officialDetailsPlayerId ? new Set(['player_id']) : new Set())));
  const leanDetails = details.map((detail) => ({
    id: detail.id,
    player_name: detail.player_name,
    division: detail.division,
    event_name: detail.event_name,
    points: detail.points,
    season: detail.season,
    batch_id: detail.batch_id,
  }));
  try {
    await insertChunks(supabase, 'official_ranking_details', details, 500);
  } catch (error) {
    if (!String(error.message || '').includes('schema cache') && !String(error.message || '').includes('Could not find') && !String(error.message || '').includes('column')) {
      throw error;
    }
    await insertChunks(supabase, 'official_ranking_details', leanDetails, 500);
  }

  const kate = rows.find((row) => row.division === 'women' && normKey(row.player_name) === 'KATE FOO KUNE');
  console.log(`OK: ${rows.length} joueurs, ${details.length} details, batch ${batchId}.`);
  if (kate) {
    console.log(`KATE FOO KUNE women: rank #${kate.rank}, points ${kate.points}, joues ${kate.tournaments_played}.`);
    console.log(kate.details.slice(0, 10).map((d) => `${d.event_date} | ${d.category} | ${d.event_name} | ${d.points}`).join('\\n'));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
