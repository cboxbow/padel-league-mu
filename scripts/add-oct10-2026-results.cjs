/* eslint-disable no-console */
// One-off: add results for the 2 tournaments held 2026-10-10 whose PDFs arrived in "10 RESULTS OCTOBER 2026": Labourdonnais Mapou M25 Men (t184) and Mont Choisy Golf M50 Men (t186).
// Neither PDF shows a date; matched by club + category against the tournaments table.
// Verified beforehand: zero existing results for either tournament_id.
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EVENT_DATE = '2026-10-10';

const EVENTS = [
  {
    tournamentId: 't184', category: 'M25', division: 'men',
    club: 'Labourdonnais Mapou', region: 'Nord',
    pairs: [
      ['Sylvain Liotard', 'Sergei Vasilev', 25],
      ['Benjamin Savreux', 'Maxime Savreux', 18],
      ['Dean Li', 'William Tsin', 16],
      ['Thomas Rousset', 'Dmitry Novopashin', 15],
      ['Viv Gujadhur', 'Michael Jones', 14],
      ['Jordan Leung', 'Deny Cornette', 13],
      ['Clement Molina', 'Gregory Vayre', 12],
      ['Gianni Coppola', 'Yann Coppola', 11],
      ['Sebastien Jauffret', 'Jean Luc Fayolle', 10],
      ['Michel Maurel', 'Damien Steyn', 9],
      ['Anuj Parmar', 'Michael Ziganek', 7],
      ['Soan Rogers', 'Nathan Clarenc', 5],
      ['Alexander Volkhov', 'Ludovic Poilly', 4],
      ['Patrice Demontoux', 'Xavier Mottier', 3],
      ['Aymeric De Chazal', 'Alexandre Mascarin', 2],
    ],
  },
  {
    tournamentId: 't186', category: 'M50', division: 'men',
    club: 'Mont Choisy Golf', region: 'Nord',
    pairs: [
      ['Fabien Kattic', 'Andry Ah Choon', 50],
      ['Cedrick Raffray', 'Jerome Clarenc', 30],
      ['Sarvish Keenoo', 'Levi Pelissier', 24],
      ['Damien Putteea', 'Shehriad Lungut', 18],
      ['Poubalen Parasuraman', 'Dhruv Desai', 12],
      ['Gregory Stacherski', 'Nicolas Rey (2)', 8],
      ['Wallace Lewis', 'Mukesh Morar', 4],
      ['Dominique Autrey', 'Darren Plumb', 2],
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
