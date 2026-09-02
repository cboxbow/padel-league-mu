/* eslint-disable no-console */
// One-off import: 276 people confirmed (by fuzzy name match, then manual
// verification of the matching logic) to have real ranked results and a
// real account in the app's user registry (AllApplicationUsers export,
// 1812 rows) but no row at all in public.players (1480 rows) -- the
// table the recalculate script resolves player_id against. A name alias
// can only fix a *spelling* mismatch; these people have no players row to
// alias to at all.
//
// Source: D:/Downloads/AllApplicationUsers (14).xlsx, built into
// .scratch_players_to_create.json (git-ignored, run the matching pass
// again if this file is missing -- see the audit conversation for the
// matching logic: fuzzy name-token overlap, first+last name required,
// unambiguous top match only).
//
// license_no: the source file has no license number, only "License Type".
// All 1480 existing players already carry one (simple incrementing text
// digits, no prefix -- min 12, max 1744 as of 2026-09-02), so new rows get
// sequential numbers continuing from that max, keeping the same convention
// and guaranteeing no collision. This also makes them usable immediately
// with the email+license login on Espace Joueur.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const GENERIC_EMAILS = new Set(['info@urbansport.mu']);

function mapGender(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'male') return 'M';
  if (v === 'female') return 'F';
  return null;
}

async function fetchAllPaged(supabaseClient, table, select, from = 0) {
  const pageSize = 1000;
  const all = [];
  for (;;) {
    const { data, error } = await supabaseClient.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  const rows = JSON.parse(fs.readFileSync('.scratch_players_to_create.json', 'utf8'));
  console.log(`Lignes source: ${rows.length}`);

  console.log('Determination du prochain numero de licence...');
  const existing = await fetchAllPaged(supabase, 'players', 'license_no');
  const nums = existing.map((p) => Number(p.license_no)).filter((n) => Number.isFinite(n));
  let nextLicense = (nums.length ? Math.max(...nums) : 0) + 1;
  console.log(`   Licence max existante: ${nums.length ? Math.max(...nums) : 'aucune'} -> depart a ${nextLicense}.`);

  const payload = rows.map((r) => {
    const email = String(r.email || '').trim().toLowerCase();
    return {
      id: crypto.randomUUID(),
      first_name: r.first_name,
      last_name: r.last_name,
      // Adresse generique partagee par 44 comptes club (info@urbansport.mu) :
      // gardee nulle plutot que de laisser croire que 44 personnes differentes
      // partagent la meme boite mail.
      email: email && !GENERIC_EMAILS.has(email) ? email : null,
      phone: r.phone || null,
      club: r.club || null,
      gender: mapGender(r.gender),
      level: Number.isFinite(Number(r.level)) && r.level !== '' ? Number(r.level) : null,
      active: !!r.active,
      license_no: String(nextLicense++),
    };
  });

  console.log('Insertion dans public.players...');
  for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200);
    const { error } = await supabase.from('players').insert(chunk);
    if (error) throw new Error(`insert players (batch ${i}): ${error.message}`);
  }
  console.log(`   ${payload.length} joueurs crees.`);
  console.log('OK. Relancer scripts/recalculate-rankings-from-results.cjs pour resoudre les player_id.');
}

main().catch((error) => {
  console.error('ECHEC:', error.message);
  process.exit(1);
});
