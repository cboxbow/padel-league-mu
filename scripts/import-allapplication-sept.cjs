/* eslint-disable no-console */
// Creates the players confirmed NEW by scripts/audit-allapplication-sept.cjs
// (.scratch_new_rows.json) -- people present in "AllApplication 6 sept
// 2026).xlsx" with no matching row (by email or normalized full name) in
// public.players. Never touches rows already matched -- see the audit script
// header for why (license_no wipe risk).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 24 of the 71 "new" rows share this club-front-desk address -- players.email
// has a UNIQUE constraint, so it must be nulled rather than reused verbatim.
const GENERIC_EMAILS = new Set(['info@urbansport.mu']);

// players.level est numerique (1-9) ; l'audit produit un libelle "P1".."P8"/"Elite".
function levelLabelToDb(label) {
  if (!label) return null;
  if (/^elite$/i.test(label)) return 9;
  const m = /^p(\d+)$/i.exec(String(label).trim());
  if (m) return Number(m[1]);
  const n = Number(label);
  return Number.isFinite(n) ? n : null;
}

function inferRegion(clubId) {
  if (['c01', 'c03', 'c08', 'c09', 'c12', 'c14', 'c17'].includes(clubId)) return 'Nord';
  if (['c02', 'c04', 'c05', 'c06', 'c13', 'c16'].includes(clubId)) return 'Ouest';
  if (['c07', 'c10', 'c15', 'c18'].includes(clubId)) return 'Centre';
  if (['c11'].includes(clubId)) return 'Est';
  return 'Nord';
}

async function main() {
  const rows = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '.scratch_new_rows.json'), 'utf8'));
  console.log(`Lignes a creer: ${rows.length}`);

  console.log('Determination du prochain numero de licence...');
  const existing = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('players').select('license_no').range(from, from + 999);
    if (error) throw new Error(error.message);
    existing.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const nums = existing.map(p => Number(p.license_no)).filter(n => Number.isFinite(n));
  let nextLicense = (nums.length ? Math.max(...nums) : 0) + 1;
  console.log(`   Licence max existante: ${nums.length ? Math.max(...nums) : 'aucune'} -> depart a ${nextLicense}.`);

  // club_id sur public.players est un uuid (FK vers clubs.id) -- les
  // pseudo-ids "c01".."c18" utilises par l'admin UI pour son select statique
  // n'y correspondent pas ("invalid input syntax for type uuid"). On ne
  // renseigne que le nom du club en texte, comme le fait deja tout le reste
  // de la base pour les joueurs importes.
  const payload = rows.map(r => ({
    id: crypto.randomUUID(),
    first_name: r.first_name,
    last_name: r.last_name,
    email: r.email && !GENERIC_EMAILS.has(r.email) ? r.email : null,
    phone: r.phone || null,
    club: r.club_name || null,
    region: inferRegion(r.club_id),
    division: r.division || (r.gender === 'F' ? 'women' : 'men'),
    gender: r.gender || null,
    level: levelLabelToDb(r.level),
    active: r.active !== false,
    license_no: String(nextLicense++),
  }));

  console.log('Insertion dans public.players...');
  for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200);
    const { error } = await supabase.from('players').insert(chunk);
    if (error) throw new Error(`insert players (batch ${i}): ${error.message}`);
  }
  console.log(`OK: ${payload.length} joueurs crees, licences ${payload[0].license_no}-${payload[payload.length - 1].license_no}.`);
}

main().catch(err => { console.error('ECHEC:', err.message); process.exit(1); });
