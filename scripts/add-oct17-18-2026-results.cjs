/* eslint-disable no-console */
// One-off: add results for 4 tournaments whose PDFs arrived on 2026-10-21/22 in "10 RESULTS OCTOBER 2026":
//   t183h / t183f  Terres Brunes M100 Men / Women (17/10)
//   t187h          I Padel by RM Hennessy M250 Men (17/10)  - file named "...WOMEN RESULTS" but badge + players are MEN
//   t190h          Studio by RM Azuri M100 Men (18/10)      - file named "...WOMEN RESULTS" but badge + players are MEN (t190f is cancelled)
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
    tournamentId: 't183h',
    pairs: [
      ['Pierre Charpentier', 'Thomas Renneteau', 100],
      ['Alexis Yon', 'Laurent Daruty', 65],
      ['Fabrice Noguera', 'Samuli Salonen', 55],
      ['Fabien Kattic', 'Fabrice Nayna', 50],
      ['Kevin Blanc', 'Emile Gustin', 35],
      ['Sebastien Motte', 'Romain Payet', 25],
      ['Ibrahim Dala', 'Andry Ah Choon', 20],
      ['Thierry Bindini', 'Maxime Huyse', 15],
      ['Roger Dupont', 'Franck Baque', 10],
      ['Gary Lan', 'Julian Lai Cheong', 5],
      ['Didier Desjardins', 'Mathieu Gallet', 3],
      ['Matteo Motta', 'Ekaterina Lyzhnikova', 1],
    ],
  },
  {
    tournamentId: 't183f',
    pairs: [
      ['Laisa Ah Choon', 'Audrey Bally', 100],
      ['Juliette Martin', 'Lesley Jorgensen', 65],
      ['Vicky Vermaak', 'Sophie Gelle', 55],
      ['Pauline Charpentier', 'Agathe Selig', 50],
      ['Stephanie Angoh', 'Anne Lucas', 35],
      ['Roxane Gallet', 'Catherine Ronin', 25],
      ['Catherine De Caritat', 'Laura Payet', 20],
      ['Audrey Gallet', 'Sandrine Marot', 15],
      ['Marina Costa', 'Yaroni Wilken', 10],
      ['Laurence Toinel', 'Anne Lemahieu', 5],
      ['Christine Desmarais', 'Melody De Robillard', 3],
      ['Coralie Dupont', 'Sasha Wagner', 1],
    ],
  },
  {
    tournamentId: 't187h',
    pairs: [
      ['Hugues Trijasse', 'Thibaut Vol', 250],
      ['Jadon Rossler', 'Seth Simpson', 163],
      ['Przemek Palczynski', 'William De Robillard', 138],
      ['Axel Demontoux', 'Ludovic Rousseau', 125],
      ['Stephane Herve', 'Lucas Sanier', 88],
      ['Kevin Boyer', 'Samuel Desjardins', 63],
      ['Pierre-Yves Delabre', 'Julien Bee', 50],
      ['Jean Christophe Schaffo', 'Max Schaffo', 38],
      ['Kirill Lyzhnikov', 'Andrey Shevchenko', 25],
      ['Dean Li', 'Darren Li', 13],
      ['Alice Danjoux', 'Tippi Dalle-Grave', 8],
      ['Abdullah Toorawa', 'Uzayr Joonus', 3],
    ],
  },
  {
    tournamentId: 't190h',
    pairs: [
      ['Tom Schaffo', 'Axel Demontoux', 100],
      ['Keith Lioong', 'Andy Tse', 65],
      ['Felix Herve', 'Pierre-Yves Delabre', 55],
      ['Hicham Rharbaoui', "Thomas D'Unienville", 50],
      ['Max Schaffo', 'Noa Bee', 35],
      ['Zayan Sookia', 'Frederic Geoffroy', 25],
      ['Leonardo Navarrini', 'Luca Navarrini', 20],
      ['Antoine Bosseler', 'Coline Aumard', 15],
      ['Darren Li', 'Fabrice Nayna', 10],
      ['Thierry Nicolas', 'Yoann Secroun', 5],
      ['Bernard Lopez', 'Damien Steyn', 3],
      ['Matthieu Delache', 'Emmanuel Degli', 1],
    ],
  },
];

async function main() {
  const ids = EVENTS.map(ev => ev.tournamentId);
  const { data: tournaments, error: tErr } = await supabase.from('tournaments').select('id,name,tournament_date,club_name,region,category,division').in('id', ids);
  if (tErr) throw new Error(`tournaments: ${tErr.message}`);
  const byId = Object.fromEntries(tournaments.map(t => [t.id, t]));

  const { count, error: cErr } = await supabase.from('tournament_results').select('id', { count: 'exact', head: true }).in('tournament_id', ids);
  if (cErr) throw new Error(`count: ${cErr.message}`);
  if (count) throw new Error(`${count} resultats existent deja pour ces tournois - arret pour eviter les doublons`);

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
        id,
        source_file: 'admin_results',
        sheet_name: t.name,
        event_key: t.id,
        event_name: t.name,
        event_year: 2026,
        season: 2026,
        category: t.category,
        division: t.division,
        junior_category: null,
        club_name: t.club_name,
        event_date: t.tournament_date,
        region: t.region,
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

  console.log(`OK: ${trRows.length} paires ajoutees pour ${EVENTS.length} tableaux.`);
}

main().catch(err => { console.error('ECHEC:', err.message); process.exit(1); });
