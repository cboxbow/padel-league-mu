/* eslint-disable no-console */
// One-off: add results for 3 draws whose PDFs arrived on 2026-11-18 in "11 RESULTS NOVEMBER 2026":
//   t203h  Labourdonnais Mapou M50 Men   (14/11)   t203f Women
//   t207h  I Padel by RM Hennessy M100 Men (15/11)
// PDFs show no date; tournament name, club, region, date come from the tournaments table.
// Verified beforehand: zero existing results for these tournament_ids.
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EVENTS = [
  {
    tournamentId: 't203h',
    pairs: [
      ['Martin David', 'Fran Gomez', 50],
      ['Thomas Baeumlin', 'Lucas Hirigoyen', 36],
      ['Ibrahim Dala', 'Guillaume Louison', 32],
      ['Edouard Bizot', 'Aldric Meneghel', 30],
      ['Gary Lan', 'Dick Jia', 28],
      ['Theo Park', 'Aurelie Park', 26],
      ['Stevens Angoh', 'Bertrand De Coriolis', 24],
      ['Romain Spinazzola', 'Brice Germain', 22],
      ['Remi Wielgosik', 'Alexandre Fargeas', 20],
      ['Deva Ramsamy', 'Gabriel Magnan', 18],
      ['Joffrey Chabanne', "Hugo D'Unienville", 14],
      ['Samuel Strauss-Rhodes', 'Sheldon Gray', 10],
      ['Christophe Quinta', 'Eric Thoreux', 8],
      ['Yohance Deora', 'Rafael Lebrasse', 6],
      ['Sebastien Valgresy', 'Boris Faget', 4],
    ],
  },
  {
    tournamentId: 't203f',
    pairs: [
      ['Anna Zhivilo', 'Andrea Stork', 50],
      ['Meline Colas', 'Sienna Hardy', 30],
      ['Dominique Savreux', 'Anne Laure Jeudy', 24],
      ['Farah Magnan', 'Yuna Magnan', 18],
      ['France Lini', 'Jennilou Grace', 12],
      ['Caroline Piat', 'Florence Boulard', 8],
      ['Estelle Thomas', 'Amber Lam', 4],
      ['Eugenie Valgresy', 'Maryne Box', 2],
    ],
  },
  {
    tournamentId: 't207h',
    pairs: [
      ['Keith Lioong', 'Fabrice Nayna', 100],
      ['Edmund Dibden', 'Matthieu Delache', 65],
      ['Andry Ah Choon', 'Emmanuel Perrault', 55],
      ['Romain Beltrando', 'Julien Vivier', 50],
      ['William Garcia', 'Enzo Garcia', 35],
      ['Coline Aumard', 'Kevin Boyer', 25],
      ['Hicham Rharbaoui', 'Antoine Bosseler', 20],
      ['Jonathan Wong', 'Neel Booth', 15],
      ['Jean David Martinet', 'Bruno Bosquet', 10],
      ['Aleksei Grigorev', 'Dmitrii Peachman', 5],
    ],
  },
];

async function main() {
  const ids = EVENTS.map(ev => ev.tournamentId);
  const { count, error: cErr } = await supabase.from('tournament_results').select('id', { count: 'exact', head: true }).in('tournament_id', ids);
  if (cErr) throw new Error(`count: ${cErr.message}`);
  if (count) throw new Error(`${count} resultats existent deja pour ces tournois - arret pour eviter les doublons`);

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
