/* eslint-disable no-console */
// One-off: reformat players.license_no from plain sequential numbers
// (e.g. "223") to "MPL" + 7-digit zero-padded number (e.g. "MPL0000223").
// The existing numeric value is preserved as the padded suffix - no
// renumbering. Run once; safe to re-run (idempotent: rows already in
// MPL format are skipped).
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('players').select('id,license_no').range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...data);
    if (data.length < 1000) break;
  }
  console.log('Joueurs charges:', all.length);

  const toUpdate = all
    .filter(r => r.license_no != null && /^\d+$/.test(String(r.license_no)))
    .map(r => ({ id: r.id, license_no: 'MPL' + String(r.license_no).padStart(7, '0') }));

  const alreadyDone = all.filter(r => r.license_no != null && /^MPL\d{7}$/.test(String(r.license_no)));
  const skipped = all.length - toUpdate.length - alreadyDone.length;
  console.log('A migrer:', toUpdate.length, '| deja au bon format:', alreadyDone.length, '| ignores (format inattendu):', skipped);

  let done = 0;
  for (const row of toUpdate) {
    const { error } = await supabase.from('players').update({ license_no: row.license_no }).eq('id', row.id);
    if (error) throw new Error(`echec sur ${row.id}: ${error.message}`);
    done++;
    if (done % 200 === 0) console.log(done, '/', toUpdate.length);
  }
  console.log('OK:', done, 'licences reformatees.');
}

main().catch(err => { console.error('ECHEC:', err.message); process.exit(1); });
