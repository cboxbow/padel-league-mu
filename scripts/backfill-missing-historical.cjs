/* eslint-disable no-console */
// One-off backfill: an audit found 9 tournaments with results in
// tournament_results (visible on the public Resultats page) but entirely
// absent from historical_tournament_results, the only table
// recalculate-rankings-from-results.cjs reads -- meaning these players'
// results never counted toward their official ranking points, even though
// the results were published. Likely all predate the historicalPayload id
// fix (dda88f7): admin_results.json's 9 IDs below never got as far as a
// working historical insert.
//
// Source of truth for the data is tournament_results itself (already
// clean), read from .scratch_audit/missing9.json (fetched via REST just
// before writing this script) rather than re-typed.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DIV_LABELS = { men: 'Hommes', women: 'Dames', mixed: 'Mixte', junior: 'Junior' };
const TOURNAMENT_IDS = ['j1020', 't080', 't096', 't064', 't035', 't020', 't051', 't031', 't012'];

async function main() {
  const rows = JSON.parse(fs.readFileSync('.scratch_audit/missing9.json', 'utf8'));
  console.log(`Lignes source (tournament_results): ${rows.length}`);

  console.log('1/2 Verification qu aucune de ces 9 IDs n a deja une entree historique (event_key)...');
  const { data: existing, error: existErr } = await supabase
    .from('historical_tournament_results')
    .select('event_key')
    .in('event_key', TOURNAMENT_IDS);
  if (existErr) throw new Error(`check existing: ${existErr.message}`);
  if (existing.length) {
    console.log('   Deja presentes (skip pour eviter doublon):', [...new Set(existing.map(e => e.event_key))]);
  }
  const alreadyDone = new Set(existing.map(e => e.event_key));
  const toInsert = rows.filter(r => !alreadyDone.has(r.tournament_id));
  console.log(`   ${toInsert.length} lignes a inserer (sur ${rows.length}).`);

  console.log('2/2 Insertion dans historical_tournament_results...');
  const histRows = toInsert.map(r => ({
    id: crypto.randomUUID(),
    source_file: 'admin_results_backfill',
    sheet_name: `${r.tournament_name} - ${DIV_LABELS[r.division] ?? r.division}`,
    event_key: r.tournament_id,
    event_name: r.tournament_name,
    event_year: Number(String(r.tournament_date).slice(0, 4)) || 2026,
    season: Number(String(r.tournament_date).slice(0, 4)) || 2026,
    category: r.category,
    division: r.division,
    junior_category: r.division === 'junior' ? r.category : null,
    club_name: r.club_name,
    event_date: r.tournament_date,
    region: String(r.region ?? '').toUpperCase(),
    rank_label: `#${r.rank}`,
    rank_min: r.rank,
    rank_max: r.rank,
    team_name: r.team_name,
    player1_name: r.player1_name,
    player2_name: r.player2_name,
    points: r.points,
  }));

  for (let i = 0; i < histRows.length; i += 200) {
    const chunk = histRows.slice(i, i + 200);
    const { error } = await supabase.from('historical_tournament_results').insert(chunk);
    if (error) throw new Error(`insert historical_tournament_results: ${error.message}`);
  }
  console.log(`   ${histRows.length} lignes inserees.`);
  console.log('OK.');
}

main().catch((error) => {
  console.error('ECHEC:', error.message);
  process.exit(1);
});
