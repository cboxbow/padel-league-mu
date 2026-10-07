/* eslint-disable no-console */
// One-off: add results for the 2 tournaments held 2026-10-03 whose PDFs
// arrived in "10 RESULTS OCTOBER 2026": Energia Pointe aux Canonniers M50
// Men (t178) and I Padel by RM Hennessy Mixed M500-level (t179).
// Neither PDF shows a date; matched by club + category against the
// tournaments table. Verified beforehand: zero existing results for either
// tournament_id.
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EVENT_DATE = '2026-10-03';

const EVENTS = [
  {
    tournamentId: 't178', category: 'M50', division: 'men',
    club: 'Energia Pointe aux Canonniers', region: 'Nord',
    pairs: [
      ['Keith Lioong', 'Andry Ah Choon', 50],
      ['Nicholas Pinagapamy', 'Fabien Kattic', 30],
      ['Bertrand De Coriolis', 'Khim Lee Baw', 24],
      ['Bryan Foo-Kune', 'Guillaume Louison', 18],
      ['Michael Jones', 'Damien Steyn', 12],
      ['Zaid Jeewon', 'Gary Lan', 8],
      ['Guillaume Lefebure', 'Theo Park', 4],
      ['Poubalen Parasuraman', 'Dhruv Desai', 2],
    ],
  },
  {
    tournamentId: 't179', category: 'MIXED', division: 'mixed',
    club: 'I Padel by RM Hennessy', region: 'Centre',
    pairs: [
      ['Coline Aumard', 'Guillaume Cassadin', 500],
      ['Cayla Bezuidenhout', 'Yannick De Mezieres', 300],
      ['Yushna Saddul', 'Francois-Xavier Pieltain', 250],
      ['Margaux Samuelian', 'Jess Samuelian', 200],
      ['Ekaterina Lyzhnikova', 'Kirill Lyzhnikov', 125],
      ['Clea Mamet', 'Emmanuel Perrault', 50],
      ['Tippi Dalle-Grave', 'Rolph Schmid', 25],
      ['Martina Hola', 'Jimmy Lajolie', 5],
    ],
  },
];

async function main() {
  const ids = EVENTS.map(ev => ev.tournamentId);
  const { data: tournaments, error: tErr } = await supabase.from('tournaments').select('id,name').in('id', ids);
  if (tErr) throw new Error(`tournaments: ${tErr.message}`);
  const nameById = Object.fromEntries(tournaments.map(t => [t.id, t.name]));

  const trRows = [];
  const histRows = [];

  for (const ev of EVENTS) {
    const tName = nameById[ev.tournamentId];
    if (!tName) throw new Error(`Tournoi introuvable: ${ev.tournamentId}`);
    ev.pairs.forEach(([p1, p2, points], i) => {
      const rank = i + 1;
      const id = crypto.randomUUID();
      const teamName = [p1, p2].map(n => n.trim().split(' ')[0].toUpperCase()).join('/');
      trRows.push({
        id, rank, player1_name: p1, player2_name: p2, points, team_name: teamName,
        tournament_id: ev.tournamentId, tournament_name: tName, tournament_date: EVENT_DATE,
        category: ev.category, division: ev.division, region: ev.region, club_name: ev.club,
      });
      histRows.push({
        id,
        source_file: 'admin_results',
        sheet_name: tName,
        event_key: ev.tournamentId,
        event_name: tName,
        event_year: 2026,
        season: 2026,
        category: ev.category,
        division: ev.division,
        junior_category: null,
        club_name: ev.club,
        event_date: EVENT_DATE,
        region: ev.region,
        rank_label: `#${rank}`,
        rank_min: rank,
        rank_max: rank,
        team_name: teamName,
        player1_name: p1,
        player2_name: p2,
        points,
      });
    });
  }

  console.log(`Upsert tournament_results (${trRows.length} lignes)...`);
  const { error: trErr } = await supabase.from('tournament_results').upsert(trRows, { onConflict: 'id' });
  if (trErr) throw new Error(`tournament_results: ${trErr.message}`);

  console.log(`Upsert historical_tournament_results (${histRows.length} lignes)...`);
  const { error: histErr } = await supabase.from('historical_tournament_results').upsert(histRows, { onConflict: 'id' });
  if (histErr) throw new Error(`historical_tournament_results: ${histErr.message}`);

  const { error: statusErr } = await supabase.from('tournaments').update({ status: 'completed' }).in('id', ids);
  if (statusErr) throw new Error(`tournaments status: ${statusErr.message}`);

  console.log(`OK: ${trRows.length} paires ajoutees pour ${EVENTS.length} tableaux (${EVENT_DATE}).`);
}

main().catch(err => { console.error('ECHEC:', err.message); process.exit(1); });
