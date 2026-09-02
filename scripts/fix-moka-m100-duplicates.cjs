/* eslint-disable no-console */
// One-off cleanup: the historicalPayload() id bug (fixed in dda88f7) meant
// every admin import of t156h (Moka Rangers M100 Hommes, 2026-08-29) silently
// duplicated rows in tournament_results (2x per pair, "0 OK" shown to the
// admin both times) while historical_tournament_results stayed empty.
// This clears the duplicates and inserts one clean copy into both tables.
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

const TOURNAMENT_ID = 't156h';
const meta = {
  tournament_name: 'Moka Rangers M100 (Hommes)',
  tournament_date: '2026-08-29',
  category: 'M100',
  division: 'men',
  region: 'Centre',
  club_name: 'Moka Rangers',
};

const PAIRS = [
  [1, 'Yanick Bax', 'Mathias Ritter', 100],
  [2, 'Kevin Blanc', 'Pierre Charpentier', 65],
  [3, 'Pierre-Yves Delabre', 'Martin David', 55],
  [4, 'Samuel Gallet', 'Laurent Daruty', 50],
  [5, 'Abdullah Toorawa', 'Uzayr Joonus', 35],
  [6, 'Alexis Yon', 'Damien Gouron', 25],
  [7, 'Christian Bezandry', 'Rolph Schmid', 20],
  [8, 'Andry Ah Choon', 'Fabien Kattic', 15],
  [9, 'Samuel De Gersigny', 'Laurent Piat', 10],
  [10, 'Arnaud Boulle', 'Fabrice Nayna', 5],
  [11, 'Remor Lagesse', 'Jean Pierre Runghen', 3],
];

function teamName(p1, p2) {
  return `${p1.split(' ')[0].toUpperCase()}/${p2.split(' ')[0].toUpperCase()}`;
}

async function main() {
  console.log('1/3 Suppression des doublons existants dans tournament_results...');
  const { error: delErr } = await supabase.from('tournament_results').delete().eq('tournament_id', TOURNAMENT_ID);
  if (delErr) throw new Error(`delete tournament_results: ${delErr.message}`);

  console.log('2/3 Insertion propre dans tournament_results...');
  const trRows = PAIRS.map(([rank, p1, p2, points]) => ({
    id: crypto.randomUUID(),
    tournament_id: TOURNAMENT_ID,
    tournament_name: meta.tournament_name,
    tournament_date: meta.tournament_date,
    category: meta.category,
    division: meta.division,
    region: meta.region,
    club_name: meta.club_name,
    rank,
    team_name: teamName(p1, p2),
    player1_name: p1,
    player2_name: p2,
    points,
  }));
  const { error: insTrErr } = await supabase.from('tournament_results').insert(trRows);
  if (insTrErr) throw new Error(`insert tournament_results: ${insTrErr.message}`);
  console.log(`   ${trRows.length} lignes inserees.`);

  console.log('3/3 Insertion dans historical_tournament_results...');
  const histRows = PAIRS.map(([rank, p1, p2, points]) => ({
    id: crypto.randomUUID(),
    source_file: 'admin_results',
    sheet_name: `${meta.tournament_name} - Hommes`,
    event_key: TOURNAMENT_ID,
    event_name: meta.tournament_name,
    event_year: 2026,
    season: 2026,
    category: meta.category,
    division: meta.division,
    junior_category: null,
    club_name: meta.club_name,
    event_date: meta.tournament_date,
    region: meta.region.toUpperCase(),
    rank_label: `#${rank}`,
    rank_min: rank,
    team_name: teamName(p1, p2),
    player1_name: p1,
    player2_name: p2,
    points,
  }));
  const { error: insHistErr } = await supabase.from('historical_tournament_results').insert(histRows);
  if (insHistErr) throw new Error(`insert historical_tournament_results: ${insHistErr.message}`);
  console.log(`   ${histRows.length} lignes inserees.`);

  console.log('Verification...');
  const { count } = await supabase
    .from('tournament_results')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', TOURNAMENT_ID);
  console.log(`   tournament_results: ${count} lignes pour ${TOURNAMENT_ID}.`);
  console.log('OK.');
}

main().catch((error) => {
  console.error('ECHEC:', error.message);
  process.exit(1);
});
