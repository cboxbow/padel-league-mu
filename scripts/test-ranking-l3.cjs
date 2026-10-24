/* eslint-disable no-console */
// Repetition generale du lot L3 sur une copie locale : L1 + L1.1 + gel SEP 26
// (L2) publie, puis migration L3, dates de finale, et classement mensuel genere
// par scripts/generate-monthly-snapshot.cjs (import, validation, publication).
// Ne touche a aucune base distante.
//
//   PGLITE_PATH=... SNAPSHOT_DIR=<json> L2_DIR=<scripts L2> GEN_DIR=<sortie du generateur> GEN_MONTH=2026_10
//   node scripts/test-ranking-l3.cjs
const fs = require('node:fs');
const path = require('node:path');
const { createTestCopy, asRole, ADMIN } = require('./lib/pg-test-copy.cjs');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(f, 'utf8');
const L2 = process.env.L2_DIR;
const GEN = process.env.GEN_DIR;
const M = process.env.GEN_MONTH || '2026_10';
let passed = 0; const failures = [];
const check = (label, cond, detail = '') => { if (cond) { passed += 1; console.log(`  OK   ${label}${detail ? ` (${detail})` : ''}`); } else { failures.push(label); console.log(`  ECHEC ${label}${detail ? ` (${detail})` : ''}`); } };
let db;
const fails = async (fn, re) => { try { await fn(); return false; } catch (e) { await db.exec("rollback").catch(() => {}); return re.test(e.message); } };

async function main() {
  ({ db } = await createTestCopy(process.env.SNAPSHOT_DIR));
  // Table des resultats historiques (colonnes utiles) : M1000 a cheval + un tableau d'un jour.
  await db.exec(`
    create table public.historical_tournament_results (id bigint generated always as identity primary key, event_name text, event_date date, player1_name text, points numeric);
    insert into public.historical_tournament_results (event_name, event_date, player1_name, points)
    select 'M1000 - URBAN BR - NOV 25 - ' || d, date '2025-10-31', 'J' || g, 100 from unnest(array['MEN','WOM','U15']) d, generate_series(1, 3) g;
    insert into public.historical_tournament_results (event_name, event_date, player1_name, points) values ('M100 X - OCT 25 - MEN', date '2025-10-31', 'Z', 50);
  `);
  for (const f of ['ranking_snapshots_l1_migration.sql', 'ranking_snapshots_l1_1_migration.sql']) await db.exec(read(path.join(root, f)));
  for (const f of ['L2_1a_import_validation_HOMMES_SEP26.sql', 'L2_1b_import_validation_DAMES_SEP26.sql', 'L2_1c_import_validation_MIXTE_SEP26.sql', 'L2_2_publication_SEP26.sql']) await db.exec(read(path.join(L2, f)));
  const sep = (await db.query(`select id, division, checksum from public.ranking_snapshots where status = 'published' order by division`)).rows;
  console.log(`L1 + L1.1 + SEP 2026 publie (${sep.length} instantanes).`);

  console.log('\nMigration L3');
  await db.exec(read(path.join(root, 'ranking_snapshots_l3_migration.sql')));
  await db.exec(read(path.join(root, 'ranking_snapshots_l3_migration.sql')));
  check('migration rejouable sans erreur', true);
  const after = (await db.query(`select id, checksum_version, public.ranking_snapshot_checksum(id) = checksum as same, status, locked from public.ranking_snapshots order by division`)).rows;
  check('SEP 2026 : somme de controle v1 conservee et toujours exacte', after.every((s) => s.checksum_version === 1 && s.same && s.status === 'published' && s.locked));
  const rule = (await db.query(`select value from public.ranking_settings where key = 'snapshot_window'`)).rows[0];
  check('regle enregistree (12 mois calendaires, finale)', rule && rule.value.months === 12 && rule.value.type === 'calendar');
  check('version de somme de controle d un instantane publie : non modifiable',
    await fails(() => asRole(db, 'service_role', null, `update public.ranking_snapshots set checksum_version = 2 where id = '${sep[0].id}'`), /verrouill/));
  check('date de fin anterieure au debut refusee (tournoi)',
    await fails(() => db.query(`update public.tournaments set end_date = coalesce(date, tournament_date) - 1 where id = (select id from public.tournaments where coalesce(date, tournament_date) is not null limit 1)`), /tournaments_end_date_ck/));

  console.log('\nDates de finale');
  await db.exec(read(path.join(root, 'ranking_l3_dates_de_fin.sql')));
  const ends = (await db.query(`select event_name like 'M1000%' m1000, count(*)::int n, min(event_end_date)::text fin from public.historical_tournament_results group by 1 order by 1`)).rows;
  check('M1000 Urban BR : finale au 02/11/2025 sur ses 3 tableaux', ends.find((x) => x.m1000).fin === '2025-11-02' && ends.find((x) => x.m1000).n === 9);
  check('les autres tableaux du 31/10 ne sont pas touches', ends.find((x) => !x.m1000).fin === null);
  await db.exec(read(path.join(root, 'ranking_l3_dates_de_fin.sql')));
  check('script des dates rejouable', true);
  const t31 = (await db.query(`select count(*) filter (where end_date = date '2026-10-31')::int fin, count(*)::int n from public.tournaments where id in ('t263h','t264f','t197h','t197f','t195h','t195f')`)).rows[0];
  check('tournois du 31/10/2026 : finale le jour meme enregistree', t31.n === 0 || t31.fin === t31.n, `${t31.fin}/${t31.n}`);

  console.log(`\nClassement genere ${M}`);
  const files = fs.readdirSync(GEN).filter((f) => f.startsWith(`${M}_1`)).sort();
  for (const f of files) {
    try { await db.exec(read(path.join(GEN, f))); } catch (e) { console.log(`  ${f} : ${e.message.slice(0, 400)}`); throw e; }
  }
  const snaps = (await db.query(`select id, division, version, status, source, checksum_version, entries_count, window_start::text ws, window_end::text we, applicable_month::text am, created_by::text from public.ranking_snapshots where applicable_month = date '${M.replace('_', '-')}-01' + interval '1 month' order by division`)).rows;
  check(`${files.length} instantanes moteur valides`, snaps.length === files.length && snaps.every((s) => s.status === 'validated' && s.source === 'engine' && s.version === 1), snaps.map((s) => `${s.division}:${s.status}/${s.entries_count}`).join(' '));
  check('somme de controle v2', snaps.every((s) => s.checksum_version === 2));
  check('fenetre 12 mois calendaires', snaps.every((s) => s.ws.endsWith('-01') && s.we.slice(0, 7) === M.replace('_', '-')), `${snaps[0].ws} -> ${snaps[0].we}, tournois de ${snaps[0].am}`);
  check('signes par le compte admin', snaps.every((s) => s.created_by === ADMIN));
  const val = (await db.query(`select details from public.ranking_audit_log where action = 'validate' and snapshot_id = any($1::uuid[])`, [snaps.map((s) => s.id)])).rows;
  check('lignes sans fiche : avertissement, pas blocage', val.length === snaps.length && val.every((v) => Array.isArray(v.details.warnings)), val.map((v) => v.details.warnings.join(',') || '-').join(' | '));
  const prev = (await db.query(`select count(*) filter (where previous_rank is not null)::int avec, count(*)::int n from public.ranking_snapshot_entries e join public.ranking_snapshots s on s.id = e.snapshot_id where s.id = any($1::uuid[])`, [snaps.map((s) => s.id)])).rows[0];
  check('rang precedent (septembre) renseigne', prev.avec > 0, `${prev.avec}/${prev.n}`);
  const totals = (await db.query(`select count(*)::int bad from public.ranking_snapshot_entries e where e.snapshot_id = any($1::uuid[]) and abs(e.points - coalesce((select sum(points) from public.ranking_snapshot_results r where r.entry_id = e.entry_id and r.status = 'counted'), 0)) >= 0.01`, [snaps.map((s) => s.id)])).rows[0];
  check('chaque total = somme des 8 meilleurs resultats detailles', totals.bad === 0);
  check('rien de visible pour le public avant publication', (await asRole(db, 'anon', null, `select count(*)::int n from public.ranking_snapshots where id = any('{${snaps.map((s) => s.id).join(',')}}'::uuid[])`)).rows[0].n === 0);
  check('relancer un import du meme mois est refuse', await fails(() => db.exec(read(path.join(GEN, files[0]))), /revision|deja publie|existe deja/));

  console.log('\nPublication');
  const bad = read(path.join(GEN, `${M}_2_publication.sql`)).replace(/'PUBLIER MEN /, "'PUBLIER HOMMES ");
  check('mauvaise phrase de confirmation refusee', await fails(() => db.exec(bad), /Confirmation invalide/));
  await db.exec(read(path.join(GEN, `${M}_2_publication.sql`)));
  const pub = (await db.query(`select status, locked from public.ranking_snapshots where id = any($1::uuid[])`, [snaps.map((s) => s.id)])).rows;
  check('publies et verrouilles', pub.every((p) => p.status === 'published' && p.locked));
  const sepAfter = (await db.query(`select count(*)::int n from public.ranking_snapshots where id = any($1::uuid[]) and status = 'published' and public.ranking_snapshot_checksum(id) = checksum`, [sep.map((s) => s.id)])).rows[0];
  check('SEP 2026 reste publie et intact (tournois d octobre)', sepAfter.n === sep.length);
  const anon = (await asRole(db, 'anon', null, `select count(*)::int n from public.ranking_snapshots`)).rows[0];
  check('public : septembre + nouveau mois visibles', anon.n === sep.length + snaps.length, String(anon.n));
  check('contenu publie non modifiable (meme service_role)',
    await fails(() => asRole(db, 'service_role', null, `update public.ranking_snapshot_entries set points = points + 1 where snapshot_id = '${snaps[0].id}'`), /verrouill/));

  console.log(`\nResultat : ${passed} controles OK, ${failures.length} echec(s).`);
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error('ERREUR :', e.message.slice(0, 2000)); process.exit(1); });
