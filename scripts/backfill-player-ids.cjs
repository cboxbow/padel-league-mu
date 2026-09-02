/* eslint-disable no-console */
const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const i = line.indexOf('=');
        return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
      })
  );
}

const env = { ...readEnvFile('.env.local'), ...readEnvFile('.env.admin'), ...process.env };
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function normKey(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

const PLAYER_NAME_ALIASES = new Map([
  ['DALLE GRAVE TIPPI', 'TIPPI DALLE-GRAVE'],
  ['TIPPI DALLE GRAVE', 'TIPPI DALLE-GRAVE'],
  ['DANE DOHERTY BIGARA', 'DANE DOHERTY-BIGARA'],
  ['SOOHINESH DIP', 'DIP SOOHINESH'],
  ['ROBERT LARRY', 'LARRY ROBERT'],
  ['SHEIKH ALI NASSIM', 'NASSIM SHEIKH ALI'],
  ['SHONA LI QUERY', 'SHONA-LI QUERY'],
  ['ZAKARIA AFIF', 'AFIF ZAKARIA'],
  ['ELIAN BESSONART', 'ELIAN BESSONNART'],
  ['JOHAN ESPITALIER NOEL', 'JOHAN ESPITALIER-NOEL'],
  ['HICHAM HARBAOUI', 'HICHAM RHARBAOUI'],
  ['ANTHONY WOK', 'ANTHONY KWOK'],
  ['SAMUEL AVAN', 'SAMUEL AVA'],
  ['SAMUEL AVAR', 'SAMUEL AVA'],
  ['KIRILL YZHNIKOV', 'KIRILL LYZHNIKOV'],
  ['CHARLIE GOURPIL', 'CHARLIE GOUPIL'],
  ['NATHAN CURIMJEE', 'NATHAN CURRIMJEE'],
  ['QUENTIN TELOHAN', 'QUENTIN THELOHAN'],
  ['FABRICE NOUGERA', 'FABRICE NOGUERA'],
  ['LEONARDO NAVARINI', 'LEONARDO NAVARRINI'],
  ['JORDAN JAUFERET', 'JORDAN JAUFFRET'],
  ['THOMAS RENETEAU', 'THOMAS RENNETEAU'],
  ['MATHIEU DELACHE', 'MATTHIEU DELACHE'],
  ['ANDREW VAN WAH', 'ANDREW KAN WAH'],
  ['DAMIEN PUTTEA', 'DAMIEN PUTTEEA'],
  ['ROMAIN DE BRAKELEER', 'ROMAIN DE BRAEKELEER'],
  ['JEAN EDERIN ROUGAGNOU', 'JEAN-EDERN ROUGAGNOU'],
  ['MAXENCE VAN BENEDEDEN', 'MAXENCE VAN BENEDEN'],
  ['PHILIP ROHNACHET', 'PHILIP ROHNACHER'],
  ['RAJEEV MOHONEE', 'RAJEEV MOHOONEE'],
  ['ELIZABETH RETCHER', 'ELIZABETH RECTER'],
  ['ARMELLE DESVAUX DE MARIGI', 'ARMELLE DESVAUX DE MARIGNY'],
  ['ANNE SOPHIE DE LA GOURNER', 'ANNE-SOPHIE DE LA GOURNERIE'],
  ['CHARLENE PERTERSEN', 'CHARLENE PETERSEN'],
  ['MARINE GIRAUD', 'MARINNE GIRAUD'],
]);

function canonicalPlayerName(value) {
  const cleaned = cleanText(value).replace(/\s+/g, ' ').toUpperCase();
  if (!cleaned) return '';
  return PLAYER_NAME_ALIASES.get(normKey(cleaned)) || cleaned;
}

function playerNameCandidates(player) {
  return [
    [player.first_name, player.last_name].filter(Boolean).join(' '),
    [player.last_name, player.first_name].filter(Boolean).join(' '),
    player.player_name,
    player.full_name,
    player.name,
  ].map(canonicalPlayerName).filter(Boolean);
}

function createPlayerResolver(players) {
  const byName = new Map();
  for (const player of players) {
    for (const name of playerNameCandidates(player)) {
      const key = normKey(name);
      if (!key) continue;
      byName.set(key, [...(byName.get(key) ?? []), player]);
    }
  }
  return (name) => {
    const matches = byName.get(normKey(canonicalPlayerName(name))) || [];
    const ids = Array.from(new Set(matches.map(player => player.id).filter(Boolean)));
    return ids.length === 1 ? ids[0] : null;
  };
}

async function fetchAll(supabase, table, select) {
  const rows = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

async function hasColumn(supabase, table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  return !error;
}

async function updatePairs(supabase, table, resolvePlayerId) {
  if (!(await hasColumn(supabase, table, 'player1_id'))) {
    console.log(`${table}: colonnes player_id absentes, migration SQL requise.`);
    return { table, updated: 0, unresolved: 0, skipped: true };
  }
  const rows = await fetchAll(supabase, table, 'id,player1_name,player2_name,player1_id,player2_id');
  let unresolved = 0;
  const updates = [];
  for (const row of rows) {
    const player1Id = cleanText(row.player1_id) || resolvePlayerId(row.player1_name);
    const player2Id = cleanText(row.player2_id) || resolvePlayerId(row.player2_name);
    if (row.player1_name && !player1Id) unresolved += 1;
    if (row.player2_name && !player2Id) unresolved += 1;
    if (player1Id === row.player1_id && player2Id === row.player2_id) continue;
    updates.push({ id: row.id, player1_id: player1Id, player2_id: player2Id });
  }
  let updated = 0;
  const concurrency = 12;
  for (let i = 0; i < updates.length; i += concurrency) {
    const batch = updates.slice(i, i + concurrency);
    await Promise.all(batch.map(async (row) => {
      const { error } = await supabase
        .from(table)
        .update({ player1_id: row.player1_id, player2_id: row.player2_id })
        .eq('id', row.id);
      if (error) throw new Error(`${table} update ${row.id}: ${error.message}`);
    }));
    updated += batch.length;
    if (updated % 240 === 0 || updated === updates.length) {
      console.log(`${table}: ${updated}/${updates.length} lignes mises a jour`);
    }
  }
  return { table, rows: rows.length, updated, unresolved, skipped: false };
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const players = await fetchAll(supabase, 'players', 'id,first_name,last_name');
  const resolvePlayerId = createPlayerResolver(players);
  const summary = [];
  for (const table of ['historical_tournament_results', 'tournament_results', 'player_registration_requests']) {
    try {
      summary.push(await updatePairs(supabase, table, resolvePlayerId));
    } catch (error) {
      summary.push({ table, error: error.message });
    }
  }
  console.log(JSON.stringify({ players: players.length, summary }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
