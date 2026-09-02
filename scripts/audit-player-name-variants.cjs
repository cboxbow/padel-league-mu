/* eslint-disable no-console */
const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const i = line.indexOf('=');
        return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
      })
  );
}

const env = { ...readEnvFile('.env.local'), ...readEnvFile('.env.admin'), ...process.env };
const supabase = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function loose(value) {
  return norm(value).split(' ').filter(Boolean).sort().join(' ');
}

function compact(value) {
  return norm(value).replace(/\s+/g, '');
}

function distance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

async function fetchAll(table, select, buildQuery) {
  const rows = [];
  for (let from = 0; from < 30000; from += 1000) {
    let query = supabase.from(table).select(select).range(from, from + 999);
    if (buildQuery) query = buildQuery(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function main() {
  const { data: batchRows, error: batchError } = await supabase
    .from('official_rankings')
    .select('batch_id,created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  if (batchError) throw batchError;
  const batchId = batchRows?.[0]?.batch_id;

  const rankings = await fetchAll(
    'official_rankings',
    'player_name,division,rank,points,tournaments_played,batch_id',
    query => query.eq('batch_id', batchId)
  );

  const groups = new Map();
  for (const row of rankings) {
    const key = `${row.division}|${loose(row.player_name)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const inverted = Array.from(groups.values())
    .filter(group => new Set(group.map(row => norm(row.player_name))).size > 1)
    .map(group => group.map(({ division, player_name, rank, points, tournaments_played }) => ({
      division,
      player_name,
      rank,
      points,
      tournaments_played,
    })));

  const fuzzy = [];
  for (const division of new Set(rankings.map(row => row.division))) {
    const rows = rankings.filter(row => row.division === division);
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const a = rows[i];
        const b = rows[j];
        const aTokens = norm(a.player_name).split(' ').filter(Boolean);
        const bTokens = norm(b.player_name).split(' ').filter(Boolean);
        const sharedLongToken = aTokens.some(token => token.length >= 6 && bTokens.includes(token));
        const d = distance(compact(a.player_name), compact(b.player_name));
        if (sharedLongToken && d > 0 && d <= 2) {
          fuzzy.push({
            division,
            a: a.player_name,
            b: b.player_name,
            distance: d,
            points: `${a.points}/${b.points}`,
            ranks: `#${a.rank}/#${b.rank}`,
          });
        }
      }
    }
  }

  const watchTerms = ['AFIF', 'BESSON', 'DALLE', 'DESVAUX', 'JUGDARREE', 'LYZHNIKOV'];
  const watched = rankings
    .filter(row => watchTerms.some(term => norm(row.player_name).includes(term)))
    .map(({ division, player_name, rank, points, tournaments_played }) => ({
      division,
      player_name,
      rank,
      points,
      tournaments_played,
    }));

  console.log(JSON.stringify({
    batchId,
    totalPlayers: rankings.length,
    invertedNameGroups: inverted,
    fuzzyCandidates: fuzzy.slice(0, 50),
    watched,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
