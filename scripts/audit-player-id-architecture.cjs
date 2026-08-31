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
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')];
      })
  );
}

async function tableExists(sb, table) {
  const { error, count } = await sb.from(table).select('*', { count: 'exact', head: true });
  return { exists: !error, count: count ?? null, error: error?.message ?? null };
}

async function columnExists(sb, table, column) {
  const { error } = await sb.from(table).select(column).limit(1);
  return !error;
}

async function main() {
  const env = { ...readEnvFile(path.join(process.cwd(), '.env.local')), ...process.env };
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase config missing');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const candidateTables = [
    'players',
    'player_profiles',
    'users',
    'members',
    'licences',
    'player_registry',
    'player_directory',
    'rankings',
    'official_rankings',
    'official_ranking_details',
    'historical_tournament_results',
    'tournament_results',
    'player_registration_requests',
  ];

  const columns = [
    'id',
    'player_id',
    'player1_id',
    'player2_id',
    'player_name',
    'player1_name',
    'player2_name',
    'player1_key',
    'player2_key',
    'license_no',
    'licence',
    'email',
    'phone',
    'gender',
    'division',
    'points',
    'rank',
  ];

  const report = {};
  for (const table of candidateTables) {
    const status = await tableExists(sb, table);
    if (!status.exists) {
      report[table] = status;
      continue;
    }
    const presentColumns = [];
    for (const column of columns) {
      if (await columnExists(sb, table, column)) presentColumns.push(column);
    }
    report[table] = { ...status, columns: presentColumns };
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
