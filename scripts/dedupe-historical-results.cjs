/* eslint-disable no-console */
// Removes exact-duplicate rows from historical_tournament_results: same
// event_date + club_name + division + player1_name + player2_name + points,
// appearing more than once (found via a general data-quality audit --
// mostly the July/Aug 2026 individual-PDF imports getting re-inserted a
// second time by the "Padel League - RANKINGS 17 august.xlsx" bulk resync,
// plus a self-duplicating backfill script). Keeps the oldest row of each
// group (arbitrary but consistent -- player_id and every other field were
// verified identical across every duplicate pair before writing this).
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function fetchAllPaged(table, select) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

function dupKey(r) {
  return [r.event_date, (r.club_name || '').toLowerCase(), r.division, (r.player1_name || '').toLowerCase(), (r.player2_name || '').toLowerCase(), r.points].join('|');
}

async function main() {
  const rows = await fetchAllPaged('historical_tournament_results', 'id,event_date,club_name,division,player1_name,player2_name,points,created_at');
  console.log(`Lignes totales: ${rows.length}`);

  const groups = new Map();
  rows.forEach(r => {
    const k = dupKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });

  const idsToDelete = [];
  let groupCount = 0;
  groups.forEach(group => {
    if (group.length <= 1) return;
    groupCount += 1;
    const sorted = [...group].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    // keep the oldest, delete the rest
    sorted.slice(1).forEach(r => idsToDelete.push(r.id));
  });

  console.log(`Groupes en double: ${groupCount}, lignes a supprimer: ${idsToDelete.length}`);
  if (!idsToDelete.length) { console.log('Rien a faire.'); return; }

  for (let i = 0; i < idsToDelete.length; i += 200) {
    const chunk = idsToDelete.slice(i, i + 200);
    const { error } = await supabase.from('historical_tournament_results').delete().in('id', chunk);
    if (error) throw new Error(error.message);
  }
  console.log(`OK: ${idsToDelete.length} lignes en double supprimees.`);
}

main().catch(err => { console.error('ECHEC:', err.message); process.exit(1); });
