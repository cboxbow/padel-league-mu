/* eslint-disable no-console */
// One-off: "Michelle Gross" (live entry of 2026-05-03, I Padel Port Chambly Mixed
// Open, t080 + its admin_results_backfill mirror) is the same person as
// "Michele Gross" (player MPL0001697). The misspelled rows had no player1_id,
// so the ranking counted her as a second player. Confirmed spelling: Michele Gross.
const { createClient } = require('@supabase/supabase-js');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co', key, { auth: { persistSession: false } });
const PLAYER_ID = '6a5c8cef-60a9-4ede-95c9-1d19acbdad2c';
(async () => {
  for (const table of ['tournament_results', 'historical_tournament_results']) {
    const { data, error } = await sb.from(table).update({ player1_name: 'Michele Gross', player1_id: PLAYER_ID }).eq('player1_name', 'Michelle Gross').select('id');
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`${table}: ${data.length} ligne(s) corrigee(s)`);
  }
})().catch(e => { console.error('ECHEC:', e.message); process.exit(1); });
