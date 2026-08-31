/* eslint-disable no-console */
const crypto = require('node:crypto');
const path = require('node:path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.resolve(projectRoot, '..');
const workbookPath = process.env.RANKING_WORKBOOK
  ? path.resolve(process.env.RANKING_WORKBOOK)
  : path.join(sourceDir, 'Padel League - RANKINGS 17 august.xlsx');

const rankingMonth = process.env.RANKING_MONTH || '2026-08-17';
const rankingSeason = Number(process.env.RANKING_SEASON || 2026);
const batchId = process.env.RANKING_BATCH_ID || crypto.randomUUID();

const DIVISION_LABELS = {
  men: 'Hommes',
  women: 'Dames',
  mixed: 'Mixte',
  junior: 'Junior',
};

function clean(value) {
  return String(value ?? '').trim();
}

function norm(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function headerKey(value) {
  return norm(value).replace(/\s+/g, '');
}

function parseNumber(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const text = clean(value).replace(/\s+/g, '').replace(',', '.');
  if (!text || text === '-') return fallback;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return fallback;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseRankingPoints(value) {
  return parseNumber(value, 0);
}

function divisionFromSheet(sheetName) {
  const key = norm(sheetName);
  if (key.includes('WOMEN') || key.includes('DAMES')) return 'women';
  if (key.includes('MIXED') || key.includes('MIXTE')) return 'mixed';
  if (/\bU1[135]\b/.test(key) || key.includes('JUNIOR')) return 'junior';
  if (key.includes('MEN') || key.includes('HOMMES')) return 'men';
  return '';
}

function trendFromRanks(rank, rankBefore) {
  const current = Number(rank);
  const previous = Number(rankBefore);
  if (!Number.isFinite(previous) || previous <= 0 || !Number.isFinite(current) || current <= 0) return 'same';
  if (previous > current) return 'up';
  if (previous < current) return 'down';
  return 'same';
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const keys = rows[i].map(headerKey);
    if (keys.includes('PLAYERS') && keys.includes('TOTALPOINTS')) return i;
  }
  return -1;
}

function findColumn(headers, candidates) {
  const wanted = candidates.map(headerKey);
  return headers.findIndex((header) => wanted.includes(headerKey(header)));
}

function parseRank(value) {
  const parsed = parseNumber(value, NaN);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function parseRankingSheet(workbook, sheetName) {
  const division = divisionFromSheet(sheetName);
  if (!division) return [];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
  const headerRow = findHeaderRow(rows);
  if (headerRow < 0) return [];

  const headers = rows[headerRow];
  const rankIndex = findColumn(headers, ['RANK']);
  const rankBeforeIndex = headers.findIndex((header, index) => index > rankIndex && headerKey(header) === 'RANK');
  const playerIndex = findColumn(headers, ['PLAYERS', 'PLAYER', 'JOUEUR', 'JOUEURS']);
  const pointsIndex = findColumn(headers, ['TOTAL POINTS', 'POINTS', 'TOTAL']);

  if (rankIndex < 0 || playerIndex < 0 || pointsIndex < 0) {
    throw new Error(`Colonnes ranking introuvables dans ${sheetName}.`);
  }

  const eventIndexes = headers
    .map((header, index) => ({ header: clean(header), index }))
    .filter(({ header, index }) => index > pointsIndex && header && !/^RANK$/i.test(header));

  const out = [];
  for (let i = headerRow + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const playerName = clean(row[playerIndex]).replace(/\s+/g, ' ');
    if (!playerName) continue;
    if (norm(playerName).startsWith('TOTAL')) continue;

    const rank = parseRank(row[rankIndex]);
    const points = parseRankingPoints(row[pointsIndex]);
    if (!rank || points < 0) continue;

    const rankBefore = rankBeforeIndex >= 0 ? parseRank(row[rankBeforeIndex]) : null;
    const tournamentsPlayed = eventIndexes.reduce((count, { index }) => {
      return count + (parseNumber(row[index], 0) > 0 ? 1 : 0);
    }, 0);

    out.push({
      id: crypto.randomUUID(),
      player_name: playerName,
      rank,
      rank_before: rankBefore ?? rank,
      points,
      division,
      tournaments_played: tournamentsPlayed,
      trend: trendFromRanks(rank, rankBefore),
      season: rankingSeason,
      updated_at: new Date().toISOString(),
      source_sheet: sheetName,
    });
  }
  return out;
}

function validateRows(rows) {
  const byPlayer = new Map();
  const byRank = new Map();
  const issues = [];

  for (const row of rows) {
    const playerKey = `${row.division}|${norm(row.player_name)}`;
    if (byPlayer.has(playerKey)) {
      issues.push(`Joueur en doublon dans ${DIVISION_LABELS[row.division]}: ${row.player_name}`);
    }
    byPlayer.set(playerKey, row);

    const rankKey = `${row.division}|${row.rank}`;
    const sameRankRows = byRank.get(rankKey) ?? [];
    const conflicting = sameRankRows.find((existing) => existing.points !== row.points);
    if (conflicting) {
      issues.push(
        `Rang #${row.rank} en doublon avec points differents dans ${DIVISION_LABELS[row.division]}: ` +
        `${conflicting.player_name}=${conflicting.points}, ${row.player_name}=${row.points}`
      );
    }
    sameRankRows.push(row);
    byRank.set(rankKey, sameRankRows);
  }

  if (issues.length) {
    throw new Error(`Validation ranking echouee:\n- ${issues.slice(0, 20).join('\n- ')}`);
  }
}

function dedupePlayerRows(rows) {
  const byPlayer = new Map();
  const dropped = [];
  for (const row of rows) {
    const key = `${row.division}|${norm(row.player_name)}`;
    const current = byPlayer.get(key);
    if (!current) {
      byPlayer.set(key, row);
      continue;
    }
    const preferred = row.points > current.points || (row.points === current.points && row.rank < current.rank)
      ? row
      : current;
    const rejected = preferred === row ? current : row;
    byPlayer.set(key, preferred);
    dropped.push({
      division: row.division,
      player: preferred.player_name,
      keptRank: preferred.rank,
      keptPoints: preferred.points,
      droppedRank: rejected.rank,
      droppedPoints: rejected.points,
    });
  }
  return { rows: Array.from(byPlayer.values()), dropped };
}

async function fetchAll(supabase, table, select, buildQuery) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; from < 50000; from += pageSize) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (buildQuery) query = buildQuery(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

async function deleteRankingsByDivision(supabase, division) {
  const ids = await fetchAll(supabase, 'rankings', 'id', (query) => query.eq('division', division));
  for (let i = 0; i < ids.length; i += 250) {
    const slice = ids.slice(i, i + 250).map((row) => row.id).filter(Boolean);
    if (!slice.length) continue;
    const { error } = await supabase.from('rankings').delete().in('id', slice);
    if (error) throw new Error(`rankings delete ${division}: ${error.message}`);
  }
}

async function insertChunks(supabase, table, rows, size = 250) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`${table} insert ${i + 1}-${i + chunk.length}: ${error.message}`);
  }
}

async function publishImportLog(supabase, rows) {
  const payload = {
    source_file: path.basename(workbookPath),
    ranking_month: rankingMonth,
    season: rankingSeason,
    rows_total: rows.length,
    rows_valid: rows.length,
    status: 'published',
    batch_id: batchId,
  };
  const { error } = await supabase.from('official_ranking_imports').upsert(payload, {
    onConflict: 'source_file,ranking_month',
  });
  if (error) console.warn(`official_ranking_imports ignore: ${error.message}`);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  const workbook = XLSX.readFile(workbookPath, { cellDates: false });
  const rawRows = workbook.SheetNames
    .filter((sheetName) => /^RANKING/i.test(sheetName))
    .flatMap((sheetName) => parseRankingSheet(workbook, sheetName));
  const { rows, dropped } = dedupePlayerRows(rawRows);

  validateRows(rows);
  if (!rows.length) throw new Error('Aucune ligne ranking detectee.');

  const byDivision = rows.reduce((acc, row) => {
    acc[row.division] = (acc[row.division] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Source: ${workbookPath}`);
  console.log(`Ranking month: ${rankingMonth}`);
  console.log(`Rows: ${rows.length}`);
  if (dropped.length) {
    console.log(`Dedupe joueurs: ${dropped.length}`);
    for (const item of dropped.slice(0, 20)) {
      console.log(`- ${DIVISION_LABELS[item.division]} ${item.player}: garde #${item.keptRank} ${item.keptPoints}, ignore #${item.droppedRank} ${item.droppedPoints}`);
    }
  }
  console.log(JSON.stringify(byDivision, null, 2));

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const divisions = Array.from(new Set(rows.map((row) => row.division)));
  for (const division of divisions) {
    await deleteRankingsByDivision(supabase, division);
  }

  await insertChunks(supabase, 'rankings', rows.map(({ source_sheet, ...row }) => row));

  const { error: resetError } = await supabase
    .from('official_rankings')
    .update({ is_current: false })
    .eq('is_current', true);
  if (resetError) console.warn(`official_rankings reset ignore: ${resetError.message}`);

  await insertChunks(supabase, 'official_rankings', rows.map((row) => ({
    id: crypto.randomUUID(),
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
  })));

  await publishImportLog(supabase, rows);

  console.log('Publication terminee.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
