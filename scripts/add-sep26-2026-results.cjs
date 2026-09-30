/* eslint-disable no-console */
// One-off: add results for the 4 tournaments held 2026-09-26 whose PDFs
// arrived in "9 RESULTS SEPTEMBER 2026" (Cana Beau Plan M25 Men,
// Club House Black River M25 Men, RM Club Grand Baie M50 Men+Women,
// Isla Padel Grand Baie M250 Men+Women). No women's results provided for
// Cana Beau Plan / Club House Black River.
//
// NOTE: 3 of the 6 source PDFs show an "M50" badge in the graphic that
// contradicts both the filename and the official calendar (points scale
// confirms it too, e.g. Isla Padel goes up to 250 pts - an M50 tournament
// never scores that high). Cross-checked against the tournaments table by
// club+date: filenames and the calendar agree in every case, so the badge
// graphic is treated as a template error on the organiser's side, not the
// filename.
// Verified beforehand: zero existing rows for these 6 tournament_ids in
// either tournament_results or historical_tournament_results.
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EVENT_DATE = '2026-09-26';

const EVENTS = [
  {
    tournamentId: 't172h', name: 'Caña Beau Plan M25', category: 'M25', division: 'men',
    club: 'Caña Beau Plan', region: 'Nord',
    pairs: [
      ['Lailesh Sidaya', 'Enzo Alleaume', 25],
      ['Gaspard Hippert', 'Nathan Clarenc', 20],
      ['Viv Gujadhur', 'Dip Soohinesh', 19],
      ['Timothy Wade', 'Jeremy Pitard', 18],
      ['Yann Coppola', 'Gianni Coppola', 17],
      ['Jean David Martinet', 'Adrian Huggett', 17],
      ['Geoffrey Glover', 'Julien Paul', 15],
      ['Sarvish Keenoo', 'Jaykishen Mohabeer', 15],
      ['Richard Ysen', 'Alexandre Jean Pierre', 13],
      ['Deny Cornette', 'Vincent Dawagne', 13],
      ['Michel Maurel', 'Jean Luc Fayolle', 11],
      ['Didier Coquet', 'Joshua Coquet', 11],
      ['David Legalant', 'Ruslan Larionov', 9],
      ['Rolph Schmid', 'Lorenzo De Martin', 9],
      ['Dimitri Lam', 'Loic Allet', 7],
      ['Damien Putteea', 'Shehriad Lungut', 7],
      ['John Mc Hardy', 'Ano Mchardy', 4],
      ['Alexis Maurice', 'Simon Hardy', 4],
      ['Patrick Duhaut', 'Benoit Costes', 4],
      ['Alexander Volkhov', 'Philip Rohnacher', 1],
      ['Jean Philippe Momple', 'Cedric Maujean', 1],
      ['Ashfaaq Purahoo', 'Fir-Haan Ghingut', 1],
      ['Jeremy Nobels', 'Oscar Nobels', 1],
    ],
  },
  {
    tournamentId: 't173h', name: 'Club House Black River M25', category: 'M25', division: 'men',
    club: 'Club House Black River', region: 'Ouest',
    pairs: [
      ['Joris Guyot', 'Jordan Alcaraz', 25],
      ['Luigi Paumero Maury', 'Selwyn Moothy', 15],
      ['Laurent Hannelas', 'Yannick Lavictoire', 12],
      ['Vincent Mayer', 'Francois Wiehe', 9],
      ['Jerome Pilot', 'Bradley Britter', 6],
      ['Axel Hardy', 'Ayden Henry', 4],
      ['Marouane Chebbi', 'Sarhan Guediche', 2],
      ['Dimitri Stroinovsky', 'Emmanuel Ruhnau', 1],
    ],
  },
  {
    tournamentId: 't176h', name: 'RM Club Grand Baie M50', category: 'M50', division: 'men',
    club: 'RM Club Grand Baie', region: 'Nord',
    pairs: [
      ['Axel Bourdet', 'Hugues Trijasse', 50],
      ['Fabio Fernandes', 'Gregory Dutreil', 40],
      ['Bryan Foo-Kune', "Thomas D'Unienville", 36],
      ['Andry Ah Choon', 'Enzo Veeren', 34],
      ['Dean Li', 'Darren Li', 32],
      ['Kenny Lam', 'Keith Lioong', 30],
      ['Alexandre Gery', 'Jonathan Mathieu', 28],
      ['Samuel Strauss-Rhodes', 'Sheldon Gray', 26],
      ['Warren Leong', 'Richie Wan', 24],
      ['Nassim Sheikh Ali', 'Esteban Soodun', 22],
      ['Levi Pelissier', 'Nicolas Blanche', 20],
      ['Thierry Bindini', 'Laurent Marmin', 18],
      ['Tony Leung', 'Jordan Leung', 16],
      ['Adam Tarasov', 'Aleksei Grigorev', 14],
      ['Laurent Say', 'Nick Lew', 12],
      ['Lucas Hirigoyen', 'Thibaud De Senneville', 10],
      ['Thierry Jamar', 'Thierry Salles', 8],
      ['Medhi Talbi', 'Remie Jupille', 6],
      ['Kelvin Jagloo', 'Tom Hagen', 4],
      ['Gustave Morand', 'Anuj Parmar', 2],
    ],
  },
  {
    tournamentId: 't176f', name: 'RM Club Grand Baie M50', category: 'M50', division: 'women',
    club: 'RM Club Grand Baie', region: 'Nord',
    pairs: [
      ['Svetlana Sidorova', 'Andrea Stork', 50],
      ['Anna Zhivilo', 'Lotticia Law Lam', 30],
      ['Laurence Mayol', 'Julie Vachet', 24],
      ['Dominique Savreux', 'Anne Laure Jeudy', 18],
      ['Estelle Thomas', 'Jennifer Leckraj', 12],
      ['Mira Piro', 'Nastasia Toothill', 8],
      ['Sienna Hardy', 'Meline Colas', 4],
      ['Aki Gomand', 'Joelle Hirigoyen', 2],
    ],
  },
  {
    tournamentId: 't175h', name: 'Isla Padel Grand Baie M250', category: 'M250', division: 'men',
    club: 'Isla Padel Grand Baie', region: 'Nord',
    pairs: [
      ['Samy Charni', 'Johann Hacklbauer', 250],
      ['Anthony Kwok', 'Fabrice Peroux', 188],
      ['Aaron Sanchez', 'Emile Gustin', 175],
      ['William De Robillard', 'Przemek Palczynski', 163],
      ['Nicolas Rey', 'Thierry Park', 150],
      ['Oscar Mamet', 'Jerome Mamet', 138],
      ['Julien Bee', 'Leo Pellas', 125],
      ['Jules De Speville', 'Victor Lagesse', 118],
      ['Sanjay Delaporte', 'Charlie Goupil', 108],
      ['Nathan Currimjee', 'Baptiste Desvaux de Marigny', 100],
      ['Alvin Tse', 'Andy Tse', 93],
      ['Jake Lam Hau Ching', 'Alexandre Cazin Rodrigues', 83],
      ['Stephane Herve', 'Jadon Rossler', 75],
      ['Pierre Clarenc', 'Megane Rasamimanana', 70],
      ['Florian Manson', 'Fabien Breton', 63],
      ['Axel Demontoux', 'Kevin Boyer', 58],
      ['Leonardo Navarrini', 'Pierre Lebreton', 48],
      ['Jean-Edern Rougagnou', 'Jess Samulian', 48],
      ['Noa Bee', 'Romain Clarenc', 34],
      ['Yannick De Mezieres', 'Lloyd Poelmann', 34],
      ['William Garcia', 'Yannick Garcia', 25],
    ],
  },
  {
    tournamentId: 't175f', name: 'Isla Padel Grand Baie M250', category: 'M250', division: 'women',
    club: 'Isla Padel Grand Baie', region: 'Nord',
    pairs: [
      ['Alice Danjoux', 'Tippi Dalle-Grave', 250],
      ['Valentina Cruciani', 'Audrey Bally', 163],
      ['Desire De Waal', 'Margaux Samuelian', 138],
      ['Stefanie Vermaak', 'Nicole Vermaak', 125],
      ['Laura Nash', 'Martina Hola', 88],
      ['Athina Audibert', 'Lia Giraud', 63],
      ['Aurelie Park', 'Emma Armand', 50],
      ['Clara Koenig', 'Aurelia Bee', 38],
      ['Wendy Ng Foong Po', 'Melanie Noel', 25],
      ['Agathe Selig', 'Pauline Charpentier', 13],
    ],
  },
];

async function main() {
  const trRows = [];
  const histRows = [];

  for (const ev of EVENTS) {
    ev.pairs.forEach(([p1, p2, points], i) => {
      const rank = i + 1;
      const id = crypto.randomUUID();
      const teamName = [p1, p2].map(n => n.trim().split(' ')[0].toUpperCase()).join('/');
      trRows.push({
        id, rank, player1_name: p1, player2_name: p2, points, team_name: teamName,
        tournament_id: ev.tournamentId, tournament_name: ev.name, tournament_date: EVENT_DATE,
        category: ev.category, division: ev.division, region: ev.region, club_name: ev.club,
      });
      histRows.push({
        id,
        source_file: 'admin_results',
        sheet_name: `${ev.name} - ${ev.division === 'men' ? 'Hommes' : 'Dames'}`,
        event_key: ev.tournamentId,
        event_name: ev.name,
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

  console.log('Marquage des tournois comme completed...');
  const ids = EVENTS.map(ev => ev.tournamentId);
  const { error: statusErr } = await supabase.from('tournaments').update({ status: 'completed' }).in('id', ids);
  if (statusErr) throw new Error(`tournaments status: ${statusErr.message}`);

  console.log(`OK: ${trRows.length} paires ajoutees pour ${EVENTS.length} tableaux (2026-09-26).`);
}

main().catch(err => { console.error('ECHEC:', err.message); process.exit(1); });
