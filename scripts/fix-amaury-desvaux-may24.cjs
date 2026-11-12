/* eslint-disable no-console */
// One-off (12/11/2026): the 2026-05-24 RM Club Grand Baie M50 Men result of
// "Amaury Desvaux / Zaid Jeewon" (32 pts) was counted twice in the live ranking:
// once from the live row (name "Amaury Desvaux") and once from the workbook row
// (name "A R Amaury Desvaux de Marigny"), because the two names did not dedupe.
// The Excel ranking of 12/11 (reference) keeps two lines - "AMAURY DESVAUX" (Moka Rangers
// M500, 133) and "AMAURY A R DESVAUX" (Dec/Jan/May/Jul, 96) - with the May event on the
// second one. Align: rename the live row to the spelling used by his other live rows
// ("Amaury A R Desvaux"), in tournament_results and its mirror in historical_tournament_results.
// Then recalculate the rankings.
//
// node scripts/fix-amaury-desvaux-may24.cjs          -> dry run
// node scripts/fix-amaury-desvaux-may24.cjs --apply  -> writes
const { createClient } = require('@supabase/supabase-js');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co', KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes('--apply');
const OLD = 'Amaury Desvaux', NEW = 'Amaury A R Desvaux', DATE = '2026-05-24';

(async () => {
  const { data: tr, error } = await sb.from('tournament_results').select('id,tournament_id,tournament_name,rank,points,player1_name,player2_name,player1_id,player2_id').eq('tournament_date', DATE).or(`player1_name.eq.${OLD},player2_name.eq.${OLD}`);
  if (error) throw new Error(error.message);
  console.log(`tournament_results a renommer: ${tr.length}`);
  for (const r of tr) {
    const slot = r.player1_name === OLD ? 'player1_name' : 'player2_name';
    console.log(`  ${r.tournament_id} ${r.tournament_name} #${r.rank} ${r.points} pts | ${r.player1_name} / ${r.player2_name} -> ${slot} = ${NEW}`);
    if (APPLY) {
      const a = await sb.from('tournament_results').update({ [slot]: NEW }).eq('id', r.id); if (a.error) throw new Error(a.error.message);
      const b = await sb.from('historical_tournament_results').update({ [slot]: NEW }).eq('id', r.id); if (b.error) throw new Error(b.error.message);
    }
  }
  console.log(APPLY ? 'OK: renomme (tournament_results + historical). Penser a relancer le recalcul.' : 'ESSAI A BLANC.');
  process.exit(0);
})().catch(e => { console.error('ECHEC:', e.message); process.exit(1); });
