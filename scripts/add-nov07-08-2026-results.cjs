/* eslint-disable no-console */
// One-off: add results for 7 draws whose PDFs arrived on 2026-11-11 in "11 RESULTS NOVEMBER 2026":
//   t198   Energia M100 Men        (07/11)
//   t199h  RM Club Grand Baie M250 Men   (07/11)   t199f Women
//   t200h  Terres Brunes M25 Men   (07/11)         t200f Women
//   t201   I Padel by RM Hennessy M50 Men (08/11)
//   t206h  SPARC Cascavelle M25 Men - SPARC brought its tournament forward from 14/11 to 07/11,
//          so t206h AND t206f are moved to 2026-11-07 here before the results are attached.
// PDFs show no date; tournament name, club, region, date come from the tournaments table.
// Verified beforehand: zero existing results for these tournament_ids.
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SPARC_NEW_DATE = '2026-11-07';

const EVENTS = [
  {
    tournamentId: 't198',
    pairs: [
      ['Brandon Lim', 'Daryl Li', 100],
      ['Cedric Vachet', 'Emmanuel Corneillet', 60],
      ['Alexis Lavie', 'Alexis Yon', 50],
      ['Thomas Mousseron', 'Romain Giraud', 40],
      ['Andry Ah Choon', 'Warren Leong', 25],
      ['Enzo Veeren', 'Levi Pelissier', 10],
      ['Guillaume Lefebure', 'Romain Clarenc', 5],
      ['Emmanuel Pierre Louis', 'Dilan Olivier', 1],
    ],
  },
  {
    tournamentId: 't200h',
    pairs: [
      ['Lailesh Sidaya', 'Enzo Alleaume', 25],
      ['Nicolas Richard', 'Jean Francois Richard', 17],
      ['Denis-Claude Koenig', 'Bruno Bosquet', 15],
      ['Stefanie Vermaak', 'Nicole Vermaak', 13],
      ['Jonathan Wong', 'Neel Booth', 11],
      ['Dmitry Novopashin', 'Thomas Rousset', 9],
      ['Marouane Chebbi', 'Sarhan Guediche', 7],
      ['Eric Hochedez', 'Adrien Schwarz', 5],
      ['Simon Hardy', 'Lucca Serret', 4],
      ['Jean Philippe Momple', 'Cedric Maujean', 3],
      ['Robert Ferrat', 'Emmanuel Mamet', 2],
      ['Peter Oxenham', 'Samuel Maujean', 1],
    ],
  },
  {
    tournamentId: 't200f',
    pairs: [
      ['Sonia Pougnet', 'Sarah De Maroussem', 25],
      ['Laura Bocage', 'Saskia Bax', 17],
      ['Anais Riviere', 'Maeva Bontemps', 15],
      ['Alix Soodun', 'Emmeline Boes', 13],
      ['Nathalie Lam', 'Chantall Meikle-Braes', 11],
      ['Diana Kuznetsova', 'Ekaterina Baranova', 9],
      ['Karina Kuleshova', 'Alesia Drokova', 7],
      ['Daria Grigoreva', 'Bianke Herbst', 5],
      ['Elodie Garrigues', 'Savannah De Tessieres', 4],
    ],
  },
  {
    tournamentId: 't199h',
    pairs: [
      ['Thibaut Vol', 'Pierre-Yves Delabre', 250],
      ['Emile Gustin', 'Aaron Sanchez', 188],
      ['Sanjay Delaporte', 'Jeremy De Matteis', 163],
      ['Tom Schaffo', 'Jake Lam Hau Ching', 150],
      ['Jean Christophe Schaffo', 'Max Schaffo', 138],
      ['Ludovic Rousseau', 'Axel Demontoux', 125],
      ['Edouard Remont', 'Robin Carroi', 113],
      ['Charlie Goupil', 'Anthony Kwok', 100],
      ['Kevin Boyer', 'Mickael Gosch', 88],
      ['Axel Bellancourt', 'Raphael Dorne', 75],
      ['Pierre Charpentier', 'Emmanuel Perrault', 63],
      ['Leonardo Navarrini', 'Cameron De Robillard', 58],
      ['Edmund Dibden', 'Cedrick Raffray', 50],
      ['Nathan Currimjee', 'Jules De Speville', 45],
      ['Hugo Curt', 'David Soulage', 38],
      ['Guillaume Cassadin', 'Fabien Breton', 30],
      ['Gregory Vayre', 'Jess Samuelian', 25],
      ['Julien Bee', 'Noa Bee', 13],
      ['Martin David', 'Antoine Fraisse', 8],
      ['Philipp Demidoff', 'Adrian Miotto', 3],
    ],
  },
  {
    tournamentId: 't199f',
    pairs: [
      ['Alice Danjoux', 'Catherine Alleaume', 250],
      ['Martina Hola', 'Laura Nash', 150],
      ['Desire De Waal', 'Margaux Samuelian', 125],
      ['Athina Audibert', 'Pascale Ferrat', 100],
      ['Valentina Cruciani', 'Audrey Bally', 63],
      ['Sara Fortunato', 'Laisa Ah Choon', 25],
      ['Coralie Hardy', 'Sienna Hardy', 13],
      ['Eloise Boyer', 'Melanie Noel', 3],
    ],
  },
  {
    tournamentId: 't201',
    pairs: [
      ['Hugues Trijasse', 'Max Schaffo', 50],
      ['Gary Lan', 'Adrien Wong', 36],
      ['Bryan Foo-Kune', 'Fabien Kattic', 32],
      ['Andry Ah Choon', 'Thierry Bindini', 30],
      ['Julian Lai Cheong', 'Stevens Angoh', 28],
      ['Darren Li', 'Adrian Huggett', 26],
      ['Aleksei Grigorev', 'Dmitrii Peachman', 24],
      ['Kelvin Jagloo', 'Michael Jones', 22],
      ['Ibrahim Dala', 'Andre Gerard', 20],
      ['Riccardo Fortunato', 'Tommaso Fortunato', 18],
      ['Jean David Martinet', 'Philip Rohnacher', 14],
      ['Jordan Leung', 'Alexandre Jean Pierre', 10],
      ['Amaury Nicolin', 'Gregory Rose', 8],
      ['Sebastien Convert', 'Denis Lam', 6],
      ['Matteo Motta', 'Emmanuel Jacquemard', 4],
      ['Jean Michel Henry', 'Jerome Pilot', 2],
    ],
  },
  {
    tournamentId: 't206h',
    pairs: [
      ['Sylvain Liotard', 'Thomas Rousset', 25],
      ['Denis Vinson', 'Cyprien Feilhes', 17],
      ['Mohammad Peersaib', 'Pascal Ava', 15],
      ['Jonathan Wong', 'Dmitry Novopashin', 13],
      ['Hussein Karaki', 'Martin Hitt', 11],
      ['Marouane Chebbi', 'Sarhan Guediche', 9],
      ['Axel Hardy', 'Ayden Henry', 7],
      ['Minhaal Fazal', 'Dhruv Karia', 5],
      ['Antonio Basta', 'Zaid Shaikh', 4],
      ['Dev Kaba', 'Hussein Dhalla', 3],
    ],
  },
];

async function main() {
  const ids = EVENTS.map(ev => ev.tournamentId);

  const { count, error: cErr } = await supabase.from('tournament_results').select('id', { count: 'exact', head: true }).in('tournament_id', ids);
  if (cErr) throw new Error(`count: ${cErr.message}`);
  if (count) throw new Error(`${count} resultats existent deja pour ces tournois - arret pour eviter les doublons`);

  const { error: dErr } = await supabase.from('tournaments').update({ tournament_date: SPARC_NEW_DATE, date: SPARC_NEW_DATE }).in('id', ['t206h', 't206f']);
  if (dErr) throw new Error(`date SPARC: ${dErr.message}`);
  console.log(`SPARC Cascavelle M25 (t206h, t206f) -> ${SPARC_NEW_DATE}`);

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
