const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const deleteStale = process.argv.includes('--delete-stale');

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const source = fs.readFileSync(path.resolve('src/data/mpl2026.ts'), 'utf8');
const block = source.match(/export const MPL_TOURNAMENTS: Tournament\[] = \[\n([\s\S]*?)\n\];/);
if (!block) {
  console.error('MPL_TOURNAMENTS block not found');
  process.exit(1);
}

const rowRe = /\{id:'([^']+)',name:'([^']+)',club_id:'([^']+)',club_name:'([^']+)',date:'([^']+)',region:'([^']+)',category:'([^']+)',division:'([^']+)',type:'([^']+)',status:'([^']+)',max_teams:(\d+)\}/g;
const tournaments = [];
let match;
while ((match = rowRe.exec(block[1]))) {
  const [, id, name, club_id, club_name, date, region, category, division, type, status, max_teams] = match;
  tournaments.push({
    id,
    name,
    club_id,
    club_name,
    date,
    tournament_date: date,
    region,
    category,
    division,
    tournament_type: type,
    status,
    max_teams: Number(max_teams),
  });
}

if (!tournaments.length) {
  console.error('No tournaments parsed from src/data/mpl2026.ts');
  process.exit(1);
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (let index = 0; index < tournaments.length; index += 100) {
    const chunk = tournaments.slice(index, index + 100);
    const { error } = await supabase.from('tournaments').upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
  }

  const keepIds = new Set(tournaments.map(t => t.id));
  const { data: existing, error: readError } = await supabase
    .from('tournaments')
    .select('id,date,tournament_date')
    .or('date.gte.2026-01-01,tournament_date.gte.2026-01-01')
    .or('date.lte.2026-12-31,tournament_date.lte.2026-12-31');
  if (readError) throw readError;

  const staleIds = (existing || [])
    .map(row => row.id)
    .filter(id => /^(t|j)/.test(id) && !keepIds.has(id));

  const staleResultCounts = {};
  for (let index = 0; index < staleIds.length; index += 100) {
    const chunk = staleIds.slice(index, index + 100);
    const { data, error } = await supabase
      .from('tournament_results')
      .select('tournament_id')
      .in('tournament_id', chunk);
    if (error) throw error;
    for (const row of data || []) {
      staleResultCounts[row.tournament_id] = (staleResultCounts[row.tournament_id] || 0) + 1;
    }
  }

  const deletableStaleIds = staleIds.filter(id => !staleResultCounts[id]);
  const protectedStaleIds = staleIds.filter(id => staleResultCounts[id]);

  if (deleteStale) {
    for (let index = 0; index < deletableStaleIds.length; index += 100) {
      const chunk = deletableStaleIds.slice(index, index + 100);
      const { error } = await supabase.from('tournaments').delete().in('id', chunk);
      if (error) throw error;
    }
  }

  const october = tournaments.filter(t => t.date >= '2026-10-01' && t.date <= '2026-10-31');
  console.log(JSON.stringify({
    upserted: tournaments.length,
    staleFound: staleIds.length,
    deleted: deleteStale ? deletableStaleIds.length : 0,
    protectedWithResults: protectedStaleIds.map(id => ({ id, results: staleResultCounts[id] })),
    october: october.map(t => ({ id: t.id, date: t.date, name: t.name, status: t.status })),
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
