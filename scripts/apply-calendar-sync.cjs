const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

function parseOfficialTournaments() {
  const source = fs.readFileSync('src/data/mpl2026.ts', 'utf8');
  const rows = [...source.matchAll(/\{id:'([^']+)',name:'([^']+)',club_id:'([^']+)',club_name:'([^']+)',date:'([^']+)',region:'([^']+)',category:'([^']+)',division:'([^']+)',type:'([^']+)',status:'([^']+)',max_teams:(\d+)\}/g)];
  return rows.map(match => ({
    id: match[1],
    name: match[2],
    club_id: match[3],
    club_name: match[4],
    date: match[5],
    tournament_date: match[5],
    region: match[6],
    category: match[7],
    division: match[8],
    type: match[9],
    tournament_type: match[9],
    status: match[10],
    max_teams: Number(match[11]),
    min_courts: match[7] === 'M1000' ? 4 : match[7] === 'M500' ? 3 : 2,
    selection_mode: ['M500', 'M1000'].includes(match[7]) ? 'ranking' : 'registration',
  }));
}

function pickKnownColumns(row, columns) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (columns.has(key)) out[key] = value;
  }
  return out;
}

async function main() {
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const officialRows = parseOfficialTournaments();
  const officialIds = new Set(officialRows.map(row => row.id));

  const { data: sample, error: sampleError } = await supabase
    .from('tournaments')
    .select('*')
    .limit(1);
  if (sampleError) throw new Error(`Read tournaments schema failed: ${sampleError.message}`);

  const fallbackColumns = ['id', 'name', 'club_id', 'club_name', 'date', 'tournament_date', 'region', 'category', 'division', 'type', 'tournament_type', 'status', 'max_teams', 'min_courts', 'selection_mode'];
  const columns = new Set(sample?.[0] ? Object.keys(sample[0]) : fallbackColumns);
  const payload = officialRows.map(row => pickKnownColumns(row, columns));

  for (let index = 0; index < payload.length; index += 100) {
    const batch = payload.slice(index, index + 100);
    const { error } = await supabase.from('tournaments').upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`Upsert tournaments ${index + 1}-${index + batch.length}: ${error.message}`);
  }

  const dateColumn = columns.has('tournament_date') ? 'tournament_date' : 'date';
  const { data: currentRows, error: currentError } = await supabase
    .from('tournaments')
    .select(`id,${dateColumn}`)
    .gte(dateColumn, '2026-01-01')
    .lte(dateColumn, '2026-12-31')
    .limit(2000);
  if (currentError) throw new Error(`Read current tournaments failed: ${currentError.message}`);

  const staleIds = (currentRows || [])
    .map(row => String(row.id))
    .filter(id => /^(t|j)/.test(id) && !officialIds.has(id));

  for (let index = 0; index < staleIds.length; index += 100) {
    const batch = staleIds.slice(index, index + 100);
    const { error } = await supabase.from('tournaments').delete().in('id', batch);
    if (error) throw new Error(`Delete stale tournaments ${index + 1}-${index + batch.length}: ${error.message}`);
  }

  const verifyColumns = ['id', 'name', 'category', 'division', 'type', 'tournament_type', 'region', 'date', 'tournament_date']
    .filter(column => columns.has(column))
    .join(',');
  const { data: july4Rows, error: july4Error } = await supabase
    .from('tournaments')
    .select(verifyColumns)
    .or('date.eq.2026-07-04,tournament_date.eq.2026-07-04')
    .order('id');
  if (july4Error) throw new Error(`Verify July 4 failed: ${july4Error.message}`);

  console.log(JSON.stringify({
    officialRows: officialRows.length,
    upserted: payload.length,
    deletedStale: staleIds.length,
    july4Rows,
  }, null, 2));
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
