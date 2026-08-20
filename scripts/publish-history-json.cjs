const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'exports', 'history');

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant.`);
  return value;
}

function loadJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(outDir, fileName), 'utf8'));
}

function nullable(value) {
  return value === '' || value === undefined ? null : value;
}

function errorText(error) {
  return [error.message, error.details, error.hint, error.code].filter(Boolean).join(' | ');
}

function normalizeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = nullable(value);
  }
  return out;
}

async function insertChunks(supabase, table, rows, size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size).map(normalizeRow);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
    process.stdout.write('.');
  }
  process.stdout.write('\n');
}

async function deleteBySources(supabase, table, sourceFiles) {
  let total = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .in('source_file', sourceFiles)
      .limit(100);
    if (error) throw new Error(`${table} select: ${error.message}`);
    const ids = (data || []).map((row) => row.id);
    if (!ids.length) break;
    const { error: deleteError } = await supabase.from(table).delete().in('id', ids);
    if (deleteError) throw new Error(`${table} delete: ${errorText(deleteError)}`);
    total += ids.length;
    process.stdout.write('-');
  }
  process.stdout.write('\n');
  return total;
}

async function main() {
  const url = env('SUPABASE_URL');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const snapshots = loadJson('historical_ranking_snapshots.json');
  const results = loadJson('historical_tournament_results.json');
  const sourceFiles = Array.from(new Set([...snapshots, ...results].map((row) => row.source_file))).filter(Boolean);
  if (!sourceFiles.length) throw new Error('Aucune source detectee dans les exports.');

  console.log(`Sources: ${sourceFiles.join(' | ')}`);
  console.log(`Suppression snapshots existants...`);
  const deletedSnapshots = await deleteBySources(supabase, 'historical_ranking_snapshots', sourceFiles);
  console.log(`Suppression resultats existants...`);
  const deletedResults = await deleteBySources(supabase, 'historical_tournament_results', sourceFiles);

  console.log(`Insertion snapshots: ${snapshots.length}`);
  await insertChunks(supabase, 'historical_ranking_snapshots', snapshots);
  console.log(`Insertion resultats: ${results.length}`);
  await insertChunks(supabase, 'historical_tournament_results', results);

  console.log(JSON.stringify({
    ok: true,
    deletedSnapshots,
    deletedResults,
    insertedSnapshots: snapshots.length,
    insertedResults: results.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
