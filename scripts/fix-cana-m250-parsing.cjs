/* eslint-disable no-console */
// One-off cleanup: t154 (Caña Beau Plan M250 Hommes, 2026-08-29) was entered
// while the quick-entry parser still had the "15-16." tie-range bug (fixed
// in 1b41d2a) -- player1_name/team_name for ranks 5-16 got the leftover
// range label baked in (e.g. "5-6. Leo Pellas"). Also missing entirely from
// historical_tournament_results, same root cause as the Moka Rangers fix.
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

const TOURNAMENT_ID = 't154';
const meta = {
  tournament_name: 'Caña Beau Plan M250 (Hommes)',
  tournament_date: '2026-08-29',
  category: 'M250',
  division: 'men',
  region: 'Nord',
  club_name: 'Caña Beau Plan',
};

// [rankMin, rankMax, p1, p2, points] -- cleaned of the "N-M." prefix that
// leaked into player1_name for the tied rows.
const PAIRS = [
  [1, 1, 'Dylan Dulthummon', 'Jake Lam Hau Ching', 250],
  [2, 2, 'Dean Dulthummon', 'Anthony Kwok', 188],
  [3, 3, 'Clinton Ellis', 'Adam Auckland', 163],
  [4, 4, 'Guillaume Cassadin', 'Jerome Mamet', 150],
  [5, 6, 'Leo Pellas', 'Mathieu Vallet', 132],
  [5, 6, 'Florian Manson', 'Pierre Mouton', 132],
  [7, 8, 'Julien Bee', 'Edouard Remont', 107],
  [7, 8, 'William De Robillard', 'Przemek Palczynski', 107],
  [9, 10, 'Francois-Xavier Pieltain', 'Fabien Breton', 82],
  [9, 10, 'Jules De Speville', 'Noah Lagesse', 82],
  [11, 12, 'Sanjay Delaporte', 'Jeremy De Matteis', 61],
  [11, 12, 'Charlie Goupil', 'Julien Hue', 61],
  [13, 14, 'Johan Espitalier Noel', 'Tristan Wiehe', 48],
  [13, 14, 'Romain Clarenc', 'Baptiste Desvaux De Marigny', 48],
  [15, 16, 'Thomas Mousseron', 'Romain Giraud', 34],
  [15, 16, 'Kevin Boyer', 'Axel Demontoux', 34],
  [17, 17, 'Pierre Clarenc', 'Victor Lagesse', 25],
  [18, 18, 'Leonardo Noa Navarrini', 'Noa Bee', 13],
  [19, 19, 'Jean-Ederin Rougagnou', 'Damien Gard', 8],
  [20, 20, 'David Maurel', 'Hubert Koenig', 3],
];

function teamName(p1, p2) {
  return `${p1.split(' ')[0].toUpperCase()}/${p2.split(' ')[0].toUpperCase()}`;
}

async function main() {
  console.log('1/3 Suppression des lignes corrompues dans tournament_results...');
  const { error: delErr } = await supabase.from('tournament_results').delete().eq('tournament_id', TOURNAMENT_ID);
  if (delErr) throw new Error(`delete tournament_results: ${delErr.message}`);

  console.log('2/3 Insertion propre dans tournament_results...');
  const trRows = PAIRS.map(([rankMin, , p1, p2, points]) => ({
    id: crypto.randomUUID(),
    tournament_id: TOURNAMENT_ID,
    tournament_name: meta.tournament_name,
    tournament_date: meta.tournament_date,
    category: meta.category,
    division: meta.division,
    region: meta.region,
    club_name: meta.club_name,
    rank: rankMin,
    team_name: teamName(p1, p2),
    player1_name: p1,
    player2_name: p2,
    points,
  }));
  const { error: insTrErr } = await supabase.from('tournament_results').insert(trRows);
  if (insTrErr) throw new Error(`insert tournament_results: ${insTrErr.message}`);
  console.log(`   ${trRows.length} lignes inserees.`);

  console.log('3/3 Insertion dans historical_tournament_results...');
  const histRows = PAIRS.map(([rankMin, rankMax, p1, p2, points]) => ({
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
    rank_label: rankMin === rankMax ? `#${rankMin}` : `#${rankMin}-${rankMax}`,
    rank_min: rankMin,
    rank_max: rankMax,
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
