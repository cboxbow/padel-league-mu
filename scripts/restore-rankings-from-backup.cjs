/* eslint-disable no-console */
// Retour arriere : remet les tables de classement publiees dans l'etat d'une
// sauvegarde JSON (ex. "SAUVEGARDE_PRODUCTION_2026-10-24").
//
// Sans CONFIRM=RESTAURER, le script ne fait qu'afficher ce qu'il ferait.
//
//   BACKUP_DIR=<dossier> RANKING_DIVISIONS=men,women \
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... [CONFIRM=RESTAURER] \
//   node scripts/restore-rankings-from-backup.cjs

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const env = process.env;
const TABLES = ['rankings', 'official_rankings', 'official_ranking_details'];
const divisions = String(env.RANKING_DIVISIONS || '').split(',').map(d => d.trim()).filter(Boolean);
if (!env.BACKUP_DIR || !divisions.length) {
  console.error('BACKUP_DIR et RANKING_DIVISIONS (ex. men,women) sont requis.');
  process.exit(1);
}
const write = env.CONFIRM === 'RESTAURER';

// Verifie l'integrite de la sauvegarde avant toute chose.
const sumsFile = path.join(env.BACKUP_DIR, 'SHA256SUMS.txt');
if (fs.existsSync(sumsFile)) {
  for (const line of fs.readFileSync(sumsFile, 'utf8').trim().split(/\r?\n/)) {
    const [hash, name] = line.trim().split(/\s+\*?/);
    if (!TABLES.includes(name.replace(/\.json$/, ''))) continue;
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(env.BACKUP_DIR, name))).digest('hex');
    if (actual !== hash) throw new Error(`Sauvegarde alteree : ${name}`);
  }
  console.log('Sommes de controle de la sauvegarde : OK');
}

async function main() {
  const backup = Object.fromEntries(TABLES.map(t => [t, JSON.parse(fs.readFileSync(path.join(env.BACKUP_DIR, `${t}.json`), 'utf8')).filter(r => divisions.includes(r.division))]));
  for (const t of TABLES) console.log(`${t} : ${backup[t].length} lignes a restaurer pour ${divisions.join(', ')}`);
  if (!write) {
    console.log('Simulation uniquement. Relancer avec CONFIRM=RESTAURER pour ecrire.');
    return;
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.');
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  for (const t of TABLES) {
    for (const division of divisions) {
      for (;;) {
        const { data, error } = await sb.from(t).select('id').eq('division', division).limit(250);
        if (error) throw new Error(`${t}: ${error.message}`);
        if (!data.length) break;
        const { error: delError } = await sb.from(t).delete().in('id', data.map(r => r.id));
        if (delError) throw new Error(`${t}: ${delError.message}`);
      }
    }
    for (let i = 0; i < backup[t].length; i += 250) {
      const { error } = await sb.from(t).upsert(backup[t].slice(i, i + 250), { onConflict: 'id' });
      if (error) throw new Error(`${t}: ${error.message}`);
    }
    console.log(`${t} : restaure.`);
  }
}

main().catch((error) => { console.error(error.message); process.exit(1); });
