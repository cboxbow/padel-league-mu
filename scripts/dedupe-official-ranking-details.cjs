/* eslint-disable no-console */
// One-off: official_ranking_details has the same real match stored twice
// per player, under two different event_name spellings (one from
// historical_tournament_results-style naming, one from tournament_results
// "ClubName Category (Hommes)" naming) - recalculate-rankings-from-results.cjs
// merges both sources but its de-dup key doesn't collapse these variants.
// Keeps one row per (player, division, event_date, points, rank_label,
// partner_name) group - a real match cannot legitimately repeat with all
// of those identical, so this is a safe exact-duplicate cleanup.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('official_ranking_details')
      .select('id,player_name,division,event_date,points,rank_label,partner_name,event_name')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...data);
    if (data.length < 1000) break;
  }
  console.log('Lignes chargees:', all.length);

  const groups = new Map();
  for (const row of all) {
    const key = [row.player_name, row.division, row.event_date, row.points, row.rank_label, row.partner_name].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const toDelete = [];
  for (const rows of groups.values()) {
    if (rows.length <= 1) continue;
    // Garde la ligne dont le nom ressemble au vrai nom de tournoi du site
    // ("Club Categorie (Hommes/Dames)") plutot que le format d'import
    // historique ("Club Categorie CLUB - MOIS AN - DIVISION"), sinon la 1ere.
    const keep = rows.find(r => /\(Hommes\)|\(Dames\)|\(Mixte\)/i.test(r.event_name)) || rows[0];
    for (const row of rows) {
      if (row.id !== keep.id) toDelete.push(row.id);
    }
  }
  console.log('Groupes en double:', [...groups.values()].filter(r => r.length > 1).length);
  console.log('Lignes a supprimer:', toDelete.length);

  const chunkSize = 500;
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += chunkSize) {
    const chunk = toDelete.slice(i, i + chunkSize);
    const { error } = await supabase.from('official_ranking_details').delete().in('id', chunk);
    if (error) throw new Error(error.message);
    deleted += chunk.length;
  }
  console.log('OK: supprime', deleted, 'lignes en double.');
}

main().catch(err => { console.error('ECHEC:', err.message); process.exit(1); });
