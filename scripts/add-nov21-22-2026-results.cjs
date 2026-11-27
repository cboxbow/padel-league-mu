/* eslint-disable no-console */
// One-off: add results for 4 draws whose PDFs arrived on 2026-11-24/26 in "11 RESULTS NOVEMBER 2026":
//   t209   RM Club Grand Baie M500 Mixed Open     (21/11)
//   t210h  Urban Sport Black River M50 Men        (21/11)
//   t211   Urban Sport Grand Baie M100 Men        (21/11) - the calendar had it as M250 (Men); the PDF is
//          an M100 (100/60/50/40/25/10/5/1 scale), so t211 is first renamed/re-categorised to M100
//          (name + category in the tournaments table; mpl2026.ts and the sync SQL are edited alongside).
//   t212f  RM Club Tamarin M25 Women              (22/11)
// PDFs show no date; club, region, date come from the tournaments table.
// Verified beforehand: zero existing results for these tournament_ids.
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EVENTS = [
  {
    tournamentId: 't209',
    pairs: [
      ['Cayla Bezuidenhout', 'Thomas Clark', 500],
      ['Alice Danjoux', 'Axel Bourdet', 350],
      ['Charlotte Clairet', 'Thibaut Vol', 300],
      ['Clea Mamet', 'Emmanuel Perrault', 275],
      ['Margaux Samuelian', 'Jess Samuelian', 225],
      ['Ekaterina Lyzhnikova', 'Kirill Lyzhnikov', 200],
      ['Yushna Saddul', 'Francois-Xavier Pieltain', 175],
      ['Emma Armand', 'Julien Hue', 150],
      ['Megane Rasamimanana', 'Brice Lescroart', 125],
      ['Martina Hola', 'Florian Manson', 105],
      ['Anne Lucas', 'Luca Navarrini', 90],
      ['Agnes Koenig', 'Serge Grigorieff', 75],
      ['Elodie Fournier', 'Fabien Fournier', 50],
      ['Celia Tadeo', 'Hugues Trijasse', 25],
      ['Meline Colas', 'Enzo Veeren', 15],
      ['Christel Leveque', 'Olivier Vincent', 5],
    ],
  },
  {
    tournamentId: 't210h',
    pairs: [
      ['Ibrahim Dala', 'Keith Lioong', 50],
      ['Andre Gerard', 'Maxime Huyse', 36],
      ['Laurent Jeudy', 'Tom Schaffo', 32],
      ['Laurent De Rosnay', 'Bruno Bosquet', 30],
      ['Philippe Cavaignac', 'Bertrand Cavaignac', 28],
      ['John Keeve', 'Retief Keeve', 26],
      ['Elie Mathieu', 'Xavier Charoux', 24],
      ['Nicholas Pinagapamy', 'Andria Laritiana', 22],
      ['Emile Gustin', 'Alexandre Mascarin', 20],
      ['Denis-Claude Koenig', 'Edgar Koenig', 18],
      ['Aleksei Grigorev', 'Sebastien Lye', 14],
      ['Valentina Cruciani', 'Tommaso Fortunato', 10],
      ['Michael Jones', 'Viv Gujadhur', 8],
      ['Miguel Beltran', 'Alain Clementi', 6],
      ['Mathias Lagesse', 'Ayden Henry', 4],
      ['Jean Michel Henry', 'Sean Barnes', 2],
    ],
  },
  {
    tournamentId: 't211',
    pairs: [
      ['Romain Clarenc', 'Pierre Clarenc', 100],
      ['Gregory Vayre', 'Max Schaffo', 60],
      ['William Garcia', 'Enzo Garcia', 50],
      ['Tom Hagen', 'Esteban Soodun', 40],
      ['Matthieu Delache', 'Michael Marti', 25],
      ['Pierre-Yves Delabre', 'Aldric Meneghel', 10],
      ['Reza Alimamod Nayan', 'Mathias Stawski', 5],
      ['Jonathan Wong', 'Dmitrii Peachman', 1],
    ],
  },
  {
    tournamentId: 't212f',
    pairs: [
      ['Steffi Kwo', 'Shama Aboobakar', 25],
      ['Sabryna Lerat', 'Keren Cohen', 17],
      ['Peggy Rachex', 'Aurelie Hardy', 15],
      ['Stephanie Antoine', 'Caroline De Robillard', 13],
      ['Laura Bocage', 'Amber Lam', 11],
      ['Jade Blanc', 'Julie Lapendry', 9],
      ['Elodie Garrigues', 'Sophie Doger De Speville', 7],
      ['Jennyfer Cheniart', 'Sophie Fracasso', 5],
      ['Diana Kuznetsova', 'Ekaterina Baranova', 4],
      ['Alix Soodun', 'Emmeline Boes', 3],
      ['Daria Grigoreva', 'Karina Kuleshova', 2],
    ],
  },
];

async function main() {
  const ids = EVENTS.map(ev => ev.tournamentId);
  const { count, error: cErr } = await supabase.from('tournament_results').select('id', { count: 'exact', head: true }).in('tournament_id', ids);
  if (cErr) throw new Error(`count: ${cErr.message}`);
  if (count) throw new Error(`${count} resultats existent deja pour ces tournois - arret pour eviter les doublons`);

  const { error: reErr } = await supabase.from('tournaments').update({ name: 'Urban Sport Grand Baie M100 (Hommes)', category: 'M100' }).eq('id', 't211');
  if (reErr) throw new Error(`t211 M100: ${reErr.message}`);
  console.log('t211 -> Urban Sport Grand Baie M100 (Hommes)');

  const { data: tournaments, error: tErr } = await supabase.from('tournaments').select('id,name,tournament_date,club_name,region,category,division').in('id', ids);
  if (tErr) throw new Error(`tournaments: ${tErr.message}`);
  const byId = Object.fromEntries(tournaments.map(t => [t.id, t]));

  const trRows = [];
  const histRows = [];
  for (const ev of EVENTS) {
    const t = byId[ev.tournamentId];
    if (!t) throw new Error(`Tournoi introuvable: ${ev.tournamentId}`);
    console.log(`${ev.tournamentId}: ${t.name} | ${t.tournament_date} | ${t.club_name} | ${t.region} | ${t.category} ${t.division} | ${ev.pairs.length} paires`);
    ev.pairs.forEach(([p1, p2, points], i) => {
      const rank = i + 1;
      const id = crypto.randomUUID();
      const teamName = [p1, p2].map(n => n.trim().split(' ')[0].toUpperCase()).join('/');
      trRows.push({
        id, rank, player1_name: p1, player2_name: p2, points, team_name: teamName,
        tournament_id: t.id, tournament_name: t.name, tournament_date: t.tournament_date,
        category: t.category, division: t.division, region: t.region, club_name: t.club_name,
      });
      histRows.push({
        id, source_file: 'admin_results', sheet_name: t.name, event_key: t.id, event_name: t.name,
        event_year: 2026, season: 2026, category: t.category, division: t.division, junior_category: null,
        club_name: t.club_name, event_date: t.tournament_date, region: t.region,
        rank_label: `#${rank}`, rank_min: rank, rank_max: rank, team_name: teamName,
        player1_name: p1, player2_name: p2, points,
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
  console.log(`OK: ${trRows.length} paires ajoutees pour ${EVENTS.length} tableaux.`);
}

main().catch(err => { console.error('ECHEC:', err.message); process.exit(1); });
