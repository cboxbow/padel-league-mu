/* eslint-disable no-console */
// One-off: create the 15 players found in LISTE_UPDATE_15_SEPT_2026.xlsx
// that had no match (by name or email) in public.players, per the cross-check
// report from this session. License numbers continue sequentially from the
// current max (paginated read, since PostgREST caps at 1000 rows).
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function mapGender(g) {
  const v = (g || '').toString().trim().toLowerCase();
  if (v === 'female' || v === 'femme') return 'F';
  return 'M';
}

// [surname, name, mobile, email, club, gender, level, status]
const MISSING = [
  ['Master', 'Zakkee', '', 'zakkee@hotmail.co.uk', 'Urban Sport - Grand Baie', 'Male', null, 'pending'],
  ['Rali', 'Kerssane', '', 'rali.kerssane@gmail.com', 'RM Club - Grand Baie', 'Male', null, 'pending'],
  ['Samuelian', 'Margaux', '', 'margaux.samuelian@gmail.com', 'Isla Padel - Grand Baie', 'Female', null, 'pending'],
  ['Samuelian', 'Jess', '', 'jess.samuelian@yahoo.fr', 'Isla Padel - Grand Baie', 'Male', null, 'pending'],
  ['Sidaya', 'Lailesh', '', 'lailesh.sidaya@gmail.com', 'Moka Rangers - Moka', 'Male', null, 'active'],
  ['Charoux', 'Samantha', '', 'Samanthacharoux@gmail.com', 'RM Club - Grand Baie', 'Female', null, 'active'],
  ['Adeline', 'Bechard', '', 'adelineduchenne@hotmail.com', 'Mont Choisy Golf - Mont Choisy', 'Female', null, 'active'],
  ['Leung Shing', 'Nathalie', '', 'Nathls@yahoo.com', 'Mont Choisy Golf - Mont Choisy', 'Female', null, 'pending'],
  ['Le Breton', 'Amelie', '', 'amelielebreton15@gmail.com', 'Mont Choisy Golf - Mont Choisy', 'Female', null, 'active'],
  ['Leong', 'David', '', 'David.leonglone@gmail.com', 'Mont Choisy Golf - Mont Choisy', 'Male', null, 'active'],
  ['Van Wyk', 'Warrick', '', 'warrickvanwyk4@gmail.com', 'Mont Choisy Golf - Mont Choisy', 'Male', null, 'active'],
  ['Chamblas', 'Cindy', '', 'cindychamblas8@gmail.com', 'Mont Choisy Golf - Mont Choisy', 'Female', null, 'active'],
  ['Joachim', 'Wuilmet', '', 'jwuilmet@gmail.com', 'Sparc - Cascavelle', 'Male', null, 'active'],
  ['Ashley', 'Rambhojun', '', 'ashley@upfluence.agency', 'Moka Rangers - Moka', 'Male', null, 'active'],
  ['Hardy', 'Simon', '', 'simon.hardy1806@gmail.com', 'CAÑA - Beau Plan', 'Male', null, 'active'],
];

async function main() {
  // Re-read the source Excel for mobile + exact level (kept out of the
  // hardcoded list above to avoid retyping error-prone numbers by hand).
  const xlsx = require('xlsx');
  const wb = xlsx.readFile('C:\\Users\\cbeza\\.claude\\uploads\\acbe35fa-e4f2-467a-92fb-97d94156ac06\\49859a99-LISTE_UPDATE_15_SEPT_2026.xlsx');
  const rows = xlsx.utils.sheet_to_json(wb.Sheets['Sheet1'], { header: 1, defval: '' }).slice(1);
  function findRow(surname, name) {
    return rows.find(r => String(r[0]).trim().toLowerCase() === surname.toLowerCase() && String(r[1]).trim().toLowerCase() === name.toLowerCase());
  }

  const existingLicenses = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('players').select('license_no').range(from, from + 999);
    if (error) throw new Error(error.message);
    existingLicenses.push(...data);
    if (data.length < 1000) break;
  }
  const nums = existingLicenses.map(r => Number(r.license_no)).filter(n => Number.isFinite(n));
  let nextLicense = (nums.length ? Math.max(...nums) : 0) + 1;
  console.log('Prochain numero de licence:', nextLicense);

  const payload = MISSING.map(([surname, name, , email, club, genderFallback]) => {
    const srcRow = findRow(surname, name);
    const mobile = srcRow ? String(srcRow[2] || '').trim() : '';
    const genderRaw = srcRow ? srcRow[5] : genderFallback;
    const level = srcRow && Number.isFinite(Number(srcRow[6])) && srcRow[6] !== '' ? Number(srcRow[6]) : null;
    return {
      id: crypto.randomUUID(),
      first_name: name,
      last_name: surname,
      email: email || undefined,
      phone: mobile || undefined,
      gender: mapGender(genderRaw),
      club,
      level: level ?? undefined,
      license_no: String(nextLicense++),
      active: true,
    };
  });

  console.log(JSON.stringify(payload, null, 2));

  const { error } = await supabase.from('players').insert(payload);
  if (error) throw new Error(error.message);
  console.log(`OK: ${payload.length} joueurs crees, licences ${payload[0].license_no}-${payload[payload.length - 1].license_no}.`);
}

main().catch(err => { console.error('ECHEC:', err.message); process.exit(1); });
