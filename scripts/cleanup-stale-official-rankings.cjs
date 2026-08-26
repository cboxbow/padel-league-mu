/* eslint-disable no-console */
// One-off cleanup: recalculate-rankings-from-results.cjs never clears the
// previous batch from official_rankings before inserting a new one, so
// is_current=true can end up stuck on more than one batch at a time.
// This removes the stale batch(es) so only the given KEEP_BATCH_ID remains current.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KEEP_BATCH_ID = process.env.KEEP_BATCH_ID;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !KEEP_BATCH_ID) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or KEEP_BATCH_ID.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log(`Lots is_current=true actuellement (hors ${KEEP_BATCH_ID})...`);
  const { data: staleRows, error: readErr } = await supabase
    .from('official_rankings')
    .select('id,batch_id')
    .eq('is_current', true)
    .neq('batch_id', KEEP_BATCH_ID);
  if (readErr) throw new Error(`read: ${readErr.message}`);

  const staleBatches = [...new Set(staleRows.map((r) => r.batch_id))];
  console.log(`Lots perimes trouves: ${staleBatches.join(', ') || '(aucun)'} (${staleRows.length} lignes)`);
  if (!staleRows.length) {
    console.log('Rien a supprimer.');
    return;
  }

  const ids = staleRows.map((r) => r.id);
  const chunkSize = 500;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { error: delErr } = await supabase.from('official_rankings').delete().in('id', chunk);
    if (delErr) throw new Error(`delete: ${delErr.message}`);
    deleted += chunk.length;
  }
  console.log(`Supprime: ${deleted} lignes.`);

  console.log('Verification par division...');
  for (const division of ['men', 'women', 'mixed', 'junior']) {
    const { count, error: countErr } = await supabase
      .from('official_rankings')
      .select('id', { count: 'exact', head: true })
      .eq('division', division)
      .eq('is_current', true);
    if (countErr) throw new Error(`count ${division}: ${countErr.message}`);
    console.log(`  ${division}: ${count} joueurs actifs`);
  }
}

main().catch((error) => {
  console.error('ECHEC:', error.message);
  process.exit(1);
});
