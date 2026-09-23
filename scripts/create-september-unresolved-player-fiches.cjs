/* eslint-disable no-console */
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PLAYERS_TO_CREATE = [
  { first_name: 'Mathis', last_name: 'Mizoule', gender: 'M' },
  { first_name: 'Megane', last_name: 'Rasamiimanana', gender: 'F' },
  { first_name: 'Nicole', last_name: 'Vermaak', gender: 'F' },
  { first_name: 'Aaron', last_name: 'Sanchez', gender: 'M' },
  { first_name: 'Jonathan', last_name: 'Mathieu', gender: 'M' },
  { first_name: 'Laurent', last_name: 'Victoire', gender: 'M' },
  { first_name: 'Laurent', last_name: 'Vigier De Latour', gender: 'M' },
  { first_name: 'Shane', last_name: 'Fong', gender: 'M' },
  { first_name: 'Xavier', last_name: 'Charoux', gender: 'M' },
];

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function playerKeys(player) {
  return [
    [player.first_name, player.last_name].filter(Boolean).join(' '),
    [player.last_name, player.first_name].filter(Boolean).join(' '),
  ].map(norm).filter(Boolean);
}

async function fetchAll(table, select) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function main() {
  const existingPlayers = await fetchAll('players', 'id,first_name,last_name,license_no');
  const existingNames = new Set(existingPlayers.flatMap(playerKeys));
  const existingLicenses = existingPlayers
    .map((player) => String(player.license_no ?? '').match(/(\d+)$/)?.[1])
    .map((license) => Number(license))
    .filter((license) => Number.isFinite(license));
  let nextLicense = (existingLicenses.length ? Math.max(...existingLicenses) : 0) + 1;

  const payload = PLAYERS_TO_CREATE
    .filter((player) => playerKeys(player).every((key) => !existingNames.has(key)))
    .map((player) => ({
      id: crypto.randomUUID(),
      first_name: player.first_name,
      last_name: player.last_name,
      gender: player.gender,
      license_no: `MPL${String(nextLicense++).padStart(7, '0')}`,
      active: true,
    }));

  if (!payload.length) {
    console.log('OK: aucune fiche a creer, tous les joueurs existent deja.');
    return;
  }

  console.log(JSON.stringify(payload.map(({ first_name, last_name, gender, license_no }) => ({
    first_name,
    last_name,
    gender,
    license_no,
  })), null, 2));

  const { error } = await supabase.from('players').insert(payload);
  if (error) throw new Error(`insert players: ${error.message}`);
  console.log(`OK: ${payload.length} fiches joueurs creees.`);
}

main().catch((error) => {
  console.error('ECHEC:', error.message);
  process.exit(1);
});
