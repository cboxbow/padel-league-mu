/* eslint-disable no-console */
// Sauvegarde en LECTURE SEULE des tables du classement officiel et du seeding,
// avant une migration (ex. lot L4). Ecrit un fichier JSON par table + un
// manifeste avec nombre de lignes et SHA-256. N'ecrit rien en base.
//
//   SUPABASE_URL=https://<projet>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<cle, en variable d'environnement uniquement>
//   OUT_DIR=<dossier> node scripts/backup-ranking-tables.cjs
//
// La cle de service donne acces aux tables non publiques (journal, brouillons) :
// la passer UNIQUEMENT par variable d'environnement, jamais dans un fichier.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const env = process.env;
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.OUT_DIR) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et OUT_DIR sont requis.');
  process.exit(1);
}
const TABLES = [
  ['ranking_settings', 'key'],
  ['ranking_snapshots', 'id'],
  ['ranking_snapshot_entries', 'entry_id'],
  ['ranking_snapshot_results', 'id'],
  ['tournament_seeding_references', 'tournament_id'],
  ['ranking_audit_log', 'id'],
  ['tournaments', 'id'],
  ['ranking_validity_periods', 'reference_month'], // absente avant L4 : ignoree
];

(async () => {
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(env.OUT_DIR, `SAUVEGARDE_CLASSEMENTS_${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = { created_at: new Date().toISOString(), project: env.SUPABASE_URL, tables: {} };
  for (const [table, order] of TABLES) {
    const rows = [];
    let error = null;
    for (let i = 0; ; i += 1000) {
      const r = await sb.from(table).select('*').order(order).range(i, i + 999);
      if (r.error) { error = r.error.message; break; }
      rows.push(...r.data);
      if (r.data.length < 1000) break;
    }
    if (error) { manifest.tables[table] = { error }; console.log(`  ${table} : ignoree (${error})`); continue; }
    const body = JSON.stringify(rows);
    fs.writeFileSync(path.join(dir, `${table}.json`), body);
    manifest.tables[table] = { rows: rows.length, sha256: crypto.createHash('sha256').update(body).digest('hex') };
    console.log(`  ${table} : ${rows.length} lignes`);
  }
  fs.writeFileSync(path.join(dir, 'MANIFESTE.json'), JSON.stringify(manifest, null, 1));
  console.log(`Sauvegarde : ${dir}`);
})().catch((e) => { console.error('ECHEC :', e.message); process.exit(1); });
