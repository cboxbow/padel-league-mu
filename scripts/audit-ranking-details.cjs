const fs = require('fs');
const path = require('path');
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

function canonicalName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function hasSourceIdentity(detail) {
  const partner = String(detail.partner_name || '').trim();
  const rank = String(detail.rank_label || '').trim();
  const club = String(detail.club_name || '').trim();
  const eventName = String(detail.event_name || '').trim();
  return Boolean(eventName && (club || partner || rank));
}

async function fetchAll(sb, table, select, filters = []) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  while (true) {
    let query = sb.from(table).select(select).range(from, from + pageSize - 1);
    for (const filter of filters) query = filter(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function main() {
  const env = { ...readEnvFile(path.join(process.cwd(), '.env.local')), ...process.env };
  const url = env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase config missing');

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: latestBatchRows, error: batchError } = await sb
    .from('official_rankings')
    .select('batch_id,created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  if (batchError) throw new Error(batchError.message);
  const latestBatch = latestBatchRows?.[0]?.batch_id;
  if (!latestBatch) throw new Error('No official ranking batch found');

  const batchFilter = query => query.eq('batch_id', latestBatch);
  const rankings = await fetchAll(
    sb,
    'official_rankings',
    'player_name,division,rank,points,tournaments_played,batch_id',
    [batchFilter]
  );
  const details = await fetchAll(
    sb,
    'official_ranking_details',
    'player_name,division,event_name,event_date,category,club_name,partner_name,rank_label,points,season,batch_id',
    [batchFilter]
  );

  const detailMap = new Map();
  for (const detail of details) {
    const keyForDetail = `${detail.division}|${canonicalName(detail.player_name)}`;
    if (!detailMap.has(keyForDetail)) detailMap.set(keyForDetail, []);
    detailMap.get(keyForDetail).push(detail);
  }

  const missingDetails = [];
  const hiddenByReliabilityFilter = [];
  const withDetails = [];
  for (const ranking of rankings) {
    const keyForRanking = `${ranking.division}|${canonicalName(ranking.player_name)}`;
    const matching = detailMap.get(keyForRanking) || [];
    if (!matching.length) {
      missingDetails.push(ranking);
      continue;
    }
    withDetails.push(ranking);
    if (!matching.some(hasSourceIdentity)) {
      hiddenByReliabilityFilter.push({ ...ranking, detail_count: matching.length });
    }
  }

  const byDivision = division => ({
    rankings: rankings.filter(row => row.division === division).length,
    details: details.filter(row => row.division === division).length,
    missingDetails: missingDetails.filter(row => row.division === division).length,
    hiddenByReliabilityFilter: hiddenByReliabilityFilter.filter(row => row.division === division).length,
  });

  const giovanniKey = canonicalName('GIOVANNI ROMEO');
  const giovanniRankings = rankings.filter(row => canonicalName(row.player_name) === giovanniKey);
  const giovanniDetails = details.filter(row => canonicalName(row.player_name) === giovanniKey);

  console.log(JSON.stringify({
    latestBatch,
    rankings: rankings.length,
    details: details.length,
    withDetails: withDetails.length,
    missingDetails: missingDetails.length,
    hiddenByReliabilityFilter: hiddenByReliabilityFilter.length,
    byDivision: {
      men: byDivision('men'),
      women: byDivision('women'),
      mixed: byDivision('mixed'),
      junior: byDivision('junior'),
    },
    giovanni: {
      rankings: giovanniRankings,
      details: giovanniDetails,
    },
    missingSample: missingDetails.slice(0, 20),
    hiddenSample: hiddenByReliabilityFilter.slice(0, 20),
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
