/* eslint-disable no-console */
// One-off: add the 16 results for Terres Brunes Sports & Leisure Mixed Open
// (2026-06-13, tournament id t102) -- the admin "Saisie rapide" import kept
// failing for this one, so writing it directly with the same payload shape
// the app itself produces (tournament_results + historical_tournament_results).
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TOURNAMENT_ID = 't102';
const TOURNAMENT_NAME = 'Terres Brunes Sports & Leisure Mixed Open';
const TOURNAMENT_DATE = '2026-06-13';
const CATEGORY = 'MIXED';
const DIVISION = 'mixed';
const CLUB_NAME = 'Terres Brunes Sports & Leisure';
const REGION = 'Ouest';

const PAIRS = [
  ['Kate Foo Kune', 'Francois-Xavier Pieltain', 500],
  ['Yushna Saddul', 'Gabriel Bertoye', 350],
  ['Ekaterina Lyzhnikova', 'Kirill Lyzhnikov', 300],
  ['Marinne Giraud', 'Damien Rae', 275],
  ['Clea Mamet', 'Emmanuel Perrault', 225],
  ['Christine Desmarais', 'Johann Hacklbauer', 200],
  ['Valentina Cruciani', 'Riccardo Fortunato', 175],
  ['Coralie Dupont', 'Francois Van Derton', 150],
  ['Sara Fortunato', 'Clement Bestel', 125],
  ['Laetitia Ballu', 'Luc Merven', 105],
  ['Agathe Selig', 'Mohammad Peersaib', 90],
  ['Anne Lemahieu', 'Max Percival', 75],
  ['Sindy De Robillard', 'William De Robillard', 50],
  ['Lesley Jorgensen', 'Michael Cockrell', 25],
  ['Meline Colas', 'Eric Cheveau', 15],
  ['Vanessa Mamet', 'Olivier Mamet', 5],
];

async function main() {
  const rows = PAIRS.map(([p1, p2, points], i) => {
    const rank = i + 1;
    const id = crypto.randomUUID();
    const teamName = [p1, p2].map(n => n.split(' ')[0].toUpperCase()).join('/');
    return {
      id, rank, player1_name: p1, player2_name: p2, points, team_name: teamName,
      tournament_id: TOURNAMENT_ID, tournament_name: TOURNAMENT_NAME, tournament_date: TOURNAMENT_DATE,
      category: CATEGORY, division: DIVISION, region: REGION, club_name: CLUB_NAME,
    };
  });

  console.log('Upsert tournament_results...');
  const { error: trErr } = await supabase.from('tournament_results').upsert(rows, { onConflict: 'id' });
  if (trErr) throw new Error(`tournament_results: ${trErr.message}`);

  console.log('Upsert historical_tournament_results...');
  const historicalRows = rows.map(r => ({
    id: r.id,
    source_file: 'admin_results',
    sheet_name: `${TOURNAMENT_NAME} - Mixte`,
    event_key: TOURNAMENT_ID,
    event_name: TOURNAMENT_NAME,
    event_year: 2026,
    season: 2026,
    category: CATEGORY,
    division: DIVISION,
    junior_category: null,
    club_name: CLUB_NAME,
    event_date: TOURNAMENT_DATE,
    region: REGION,
    rank_label: `#${r.rank}`,
    rank_min: r.rank,
    rank_max: r.rank,
    team_name: r.team_name,
    player1_name: r.player1_name,
    player2_name: r.player2_name,
    points: r.points,
  }));
  const { error: histErr } = await supabase.from('historical_tournament_results').upsert(historicalRows, { onConflict: 'id' });
  if (histErr) throw new Error(`historical_tournament_results: ${histErr.message}`);

  console.log(`OK: ${rows.length} paires ajoutees pour ${TOURNAMENT_NAME} (${TOURNAMENT_DATE}).`);
}

main().catch(err => { console.error('ECHEC:', err.message); process.exit(1); });
