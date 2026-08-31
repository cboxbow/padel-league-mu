const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')];
      })
  );
}

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

async function fetchAll(sb, table, select) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; from < 50000; from += pageSize) {
    const { data, error } = await sb.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

function playerNames(row) {
  const candidates = [
    row.full_name,
    row.name,
    row.player_name,
    [row.first_name, row.last_name].filter(Boolean).join(' '),
    [row.last_name, row.first_name].filter(Boolean).join(' '),
  ].filter(Boolean);
  return Array.from(new Set(candidates.map(norm).filter(Boolean)));
}

async function main() {
  const env = { ...readEnvFile(path.join(process.cwd(), '.env.local')), ...process.env };
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase config missing');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const players = await fetchAll(sb, 'players', '*');
  const byName = new Map();
  for (const player of players) {
    for (const keyName of playerNames(player)) {
      if (!byName.has(keyName)) byName.set(keyName, []);
      byName.get(keyName).push(player);
    }
  }

  const resultTables = ['tournament_results', 'historical_tournament_results'];
  const summary = {};
  for (const table of resultTables) {
    const rows = await fetchAll(sb, table, 'id,player1_name,player2_name');
    const names = new Set();
    for (const row of rows) {
      const p1 = norm(row.player1_name);
      const p2 = norm(row.player2_name);
      if (p1) names.add(p1);
      if (p2) names.add(p2);
    }
    const linked = [];
    const ambiguous = [];
    const unresolved = [];
    for (const name of names) {
      const matches = byName.get(name) || [];
      if (matches.length === 1) linked.push(name);
      else if (matches.length > 1) ambiguous.push({ name, count: matches.length });
      else unresolved.push(name);
    }
    summary[table] = {
      rows: rows.length,
      uniqueNames: names.size,
      linkedByCanonicalNameOnly: linked.length,
      ambiguous: ambiguous.length,
      unresolved: unresolved.length,
      ambiguousSample: ambiguous.slice(0, 20),
      unresolvedSample: unresolved.slice(0, 30),
    };
  }

  console.log(JSON.stringify({
    players: players.length,
    playerNameKeys: byName.size,
    summary,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
