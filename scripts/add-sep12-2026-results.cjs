/* eslint-disable no-console */
// One-off: add results for the 4 tournaments held 2026-09-12 whose PDFs
// arrived in "RESULTS WORKING/new results" (Mont Choisy Golf M25 M+W,
// Labourdonnais LSC/Mapou M250 Men, Terres Brunes M250 M+W, Studio by RM
// Azuri M50 Men). No women's results provided for Labourdonnais/RM Azuri.
// Verified beforehand: zero existing rows for these clubs/date in either
// tournament_results or historical_tournament_results.
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EVENT_DATE = '2026-09-12';

const EVENTS = [
  {
    tournamentId: 't163h', name: 'Mont Choisy Golf M25', category: 'M25', division: 'men',
    club: 'Mont Choisy Golf', region: 'Nord',
    pairs: [
      ['Nicolas Rey', 'Gregory Stacherski', 25],
      ['Wallace Lewis', 'Mukesh Morar', 15],
      ['Yann Coppola', 'Gianni Coppola', 12],
      ['Sarvish Keenoo', 'David Leung', 9],
      ['Selwyn Moothy', 'Luigi Paumero Maury', 6],
      ['Damien Putteea', 'Shehriad Lungut', 4],
      ['Warrick Van Wyk', 'Sav Iovino', 2],
      ['Jaykishen Mohabeer', 'Brandon Lan', 1],
    ],
  },
  {
    tournamentId: 't163f', name: 'Mont Choisy Golf M25', category: 'M25', division: 'women',
    club: 'Mont Choisy Golf', region: 'Nord',
    pairs: [
      ['Lotticia Law Lam', 'Jennilou Grace', 25],
      ['Michele Gross', 'Anabelle De Robillard', 15],
      ['Meline Colas', 'Sienna Hardy', 12],
      ['Kerry Azoulay', 'Deborah Roberts-Roussel', 9],
      ['Samantha Charoux', 'Valerie Labat', 6],
      ['Charmaine Masseratte', 'Nathalie Leung Shing', 4],
      ['Amelie Le Breton', 'Stephanie Ithier', 2],
      ['Adeline Bechard', 'Cindy Chamblas', 1],
    ],
  },
  {
    tournamentId: 't164h', name: 'Labourdonnais Mapou M250', category: 'M250', division: 'men',
    club: 'Labourdonnais Mapou', region: 'Nord',
    pairs: [
      ['Anthony Kwok', 'Charlie Goupil', 250],
      ['Joey Foo Kune', 'Jake Lam Hau Ching', 175],
      ['Mickael Gosch', 'Antoine De Haas', 150],
      ['Jeremy De Matteis', 'Sanjay Delaporte', 138],
      ['Magaly Schaffo', 'Jules De Speville', 113],
      ['Kevin Boyer', 'Axel Demontoux', 100],
      ['Lulu Ulcoq', 'Pierre Mouton', 88],
      ['Edouard Remont', 'Julien Bee', 75],
      ['Jean Christophe Schaffo', 'Tom Schaffo', 63],
      ['Noa Bee', 'Leonardo Navarrini', 53],
      ['Antoine Fraisse', 'Ludovic Rousseau', 45],
      ['Warren Leong', 'Richie Wan', 38],
      ['Max Schaffo', 'Axel Bourdet', 25],
      ['John Ville Allaman', 'Leo Pellas', 13],
      ['Pierre-Yves Delabre', 'Robin Carroi', 8],
      ['Hicham Rharbaoui', 'Kunal Sewnauth', 3],
    ],
  },
  {
    tournamentId: 't259h', name: 'Terres Brunes Sports & Leisure M250', category: 'M250', division: 'men',
    club: 'Terres Brunes Sports & Leisure', region: 'Ouest',
    pairs: [
      ['Dean Dulthummon', 'Guillaume Cassadin', 250],
      ['Guillaume Desvaux de Marigny', 'Kenny Wong', 163],
      ['Stephane Herve', 'Przemek Palczynski', 138],
      ['Kevin Blanc', 'Emile Gustin', 125],
      ['Pierre Charpentier', 'Thomas Renneteau', 88],
      ['Francois-Xavier Pieltain', 'Julien Bee', 63],
      ['Fabien Kattic', 'Andry Ah Choon', 50],
      ['Ian Koenig', 'Johann Hacklbauer', 38],
      ['William Garcia', 'Yannick Garcia', 25],
    ],
  },
  {
    tournamentId: 't260f', name: 'Terres Brunes Sports & Leisure M250', category: 'M250', division: 'women',
    club: 'Terres Brunes Sports & Leisure', region: 'Ouest',
    pairs: [
      ['Emma Armand', 'Yushna Saddul', 250],
      ['Valentina Cruciani', 'Audrey Bally', 150],
      ['Pascale Ferrat', 'Lesley Jorgensen', 125],
      ['Clea Mamet', 'Marine Lincoln', 100],
      ['Sara Fortunato', 'Anne Lucas', 63],
      ['Nicole Vermaak', 'Stefanie Vermaak', 25],
      ['Vicky Vermaak', 'Anne Lemahieu', 13],
      ['Catherine Ronin', 'Audrey Gallet', 3],
    ],
  },
  {
    tournamentId: 't165h', name: 'Studio by RM Azuri M50', category: 'M50', division: 'men',
    club: 'Studio by RM Azuri', region: 'Est',
    pairs: [
      ['Jerome Clarenc', 'Cedrick Raffray', 50],
      ["Thomas D'Unienville", 'Yannick Yew', 34],
      ['Alexandre Hurdowar', 'Khim Lee Baw', 30],
      ['Darren Li', 'Daryl Lan', 26],
      ['Adam Tarasov', 'Aleksei Grigorev', 22],
      ['Adrian Huggett', 'Ludovic Poilly', 18],
      ['Martin David', 'Jeremy Nobels', 14],
      ['Bernard Lopez', 'Kevin Gooljar', 10],
      ['Gaspard Hippert', 'Antoine Bosseler', 8],
      ['Michael Jones', 'Deny Cornette', 6],
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

  console.log(`OK: ${trRows.length} paires ajoutees pour ${EVENTS.length} tableaux (2026-09-12).`);
}

main().catch(err => { console.error('ECHEC:', err.message); process.exit(1); });
