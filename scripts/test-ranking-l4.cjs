/* eslint-disable no-console */
// Repetition du lot L4 (periodes 21 -> 20, references de seeding approuvees,
// archives juin-aout) sur une copie locale PGlite. Ne touche a aucune base distante.
//
//   PGLITE_PATH=... SNAPSHOT_DIR=<json> L2_DIR=<scripts L2 + L2_3> IMPORTS_DIR=<L4_3/L4_4 generes>
//   [OCT_DIR=<scripts du classement d'octobre generes (L3)>]
//   node scripts/test-ranking-l4.cjs
const fs = require('node:fs');
const path = require('node:path');
const { createTestCopy, asRole, ADMIN, ADMIN2 } = require('./lib/pg-test-copy.cjs');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(f, 'utf8');
const env = process.env;
let db;
let passed = 0; const failures = [];
const check = (label, cond, detail = '') => { if (cond) { passed += 1; console.log(`  OK   ${label}${detail ? ` (${detail})` : ''}`); } else { failures.push(label); console.log(`  ECHEC ${label}${detail ? ` (${detail})` : ''}`); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const claims = (uid) => `select set_config('request.jwt.claim.sub', '${uid}', true); select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid, role: 'authenticated' })}', true);`;
// Execute en tant qu'admin connecte (role authenticated), dans une transaction.
const asAdmin = async (sql, uid = ADMIN) => {
  await db.exec('begin');
  try {
    await db.exec(`${claims(uid)} set local role authenticated;`);
    const r = await db.query(sql);
    await db.exec('commit');
    return r.rows;
  } catch (e) { await db.exec('rollback'); throw e; }
};
const fails = async (fn, re) => { try { await fn(); return false; } catch (e) { await db.exec('rollback').catch(() => {}); return re.test(e.message) || (console.log(`       message : ${e.message.slice(0, 200)}`), false); } };

async function main() {
  ({ db } = await createTestCopy(env.SNAPSHOT_DIR));
  await db.exec(`create table public.historical_tournament_results (id bigint generated always as identity primary key, sheet_name text, event_name text, event_date date, player1_name text, points numeric);`);
  for (const f of ['ranking_snapshots_l1_migration.sql', 'ranking_snapshots_l1_1_migration.sql']) await db.exec(read(path.join(root, f)));
  for (const f of ['L2_1a_import_validation_HOMMES_SEP26.sql', 'L2_1b_import_validation_DAMES_SEP26.sql', 'L2_1c_import_validation_MIXTE_SEP26.sql', 'L2_2_publication_SEP26.sql']) await db.exec(read(path.join(env.L2_DIR, f)));
  // L2_3 tel qu'execute en production : la copie a d'autres uuid et sommes de controle (collation), on les aligne.
  let l23 = read(path.join(env.L2_DIR, 'L2_3_rattachement_MOKA_M500_SEP26.sql'));
  const prod = { men: ['e77675e4-447f-4f76-abf0-9e35b5ae0897', '940b5a1ba30b6b7b66fcc00976abcd2c86c82f40e961459879ea2f2e5f4e1d88'], women: ['6dd79d37-cd6d-4d00-ba76-96ba57e8e1a2', '00b70d83a9f315f3ae26e320c96bae1f48e80b1903034915098acb4f60a2a095'] };
  for (const r of await q(`select id::text, division, checksum from public.ranking_snapshots`)) if (prod[r.division]) l23 = l23.split(prod[r.division][0]).join(r.id).split(prod[r.division][1]).join(r.checksum);
  await db.exec(l23);
  for (const f of ['ranking_snapshots_l3_migration.sql', 'ranking_l3_dates_de_fin.sql']) await db.exec(read(path.join(root, f)));
  const sepBefore = await q(`select id, division, checksum, version from public.ranking_snapshots where reference_month = '2026-09-01' order by division`);
  const mokaBefore = await q(`select tournament_id, division, snapshot_id::text, locked_at::text from public.tournament_seeding_references order by tournament_id`);
  console.log(`Etat de production reproduit : SEP 2026 publie (${sepBefore.length}), references Moka (${mokaBefore.length}).`);

  console.log('\nMigration L4');
  await db.exec(read(path.join(root, 'ranking_snapshots_l4_validity_periods.sql')));
  await db.exec(read(path.join(root, 'ranking_snapshots_l4_validity_periods.sql')));
  check('migration rejouable', true);
  const sepAfter = await q(`select id, checksum, version, public.ranking_snapshot_checksum(id) = checksum ok, validity_start from public.ranking_snapshots where reference_month = '2026-09-01' order by division`);
  check('SEP 2026 : contenu et somme de controle inchanges', sepAfter.every((s, i) => s.ok && s.checksum === sepBefore[i].checksum && s.version === 1));
  const moka = await q(`select tournament_id, snapshot_id::text, snapshot_version, approval_status, reference_date::text, validity_start::text, validity_end::text, expected_reference_month::text, approved_at is not null approved from public.tournament_seeding_references order by tournament_id`);
  check('Moka M500 : meme instantane, v1, approuve, periode 21/10 -> 20/11, date de debut 31/10',
    moka.length === 2 && moka.every((m, i) => m.snapshot_id === mokaBefore[i].snapshot_id && m.snapshot_version === 1 && m.approval_status === 'approved'
      && m.validity_start === '2026-10-21' && m.validity_end === '2026-11-20' && m.reference_date === '2026-10-31' && m.expected_reference_month === '2026-09-01' && m.approved));
  const periods = await q(`select reference_month::text r, validity_start::text s, validity_end::text e, status from public.ranking_validity_periods order by 1`);
  check('4 periodes confirmees (juin -> septembre 2026)', periods.length === 4 && periods.every((p) => p.status === 'confirmed'), periods.map((p) => `${p.r.slice(0, 7)}:${p.s.slice(5)}->${p.e.slice(5)}`).join(' '));

  console.log('\nBornes du 20 et du 21 (date de debut)');
  const per = async (d) => (await q(`select reference_month::text r from public.ranking_period_for_date($1::date)`, [d])).map((x) => x.r.slice(0, 7)).join(',') || 'aucune';
  const cases = [['2026-07-20', 'aucune'], ['2026-07-21', '2026-06'], ['2026-08-20', '2026-06'], ['2026-08-21', '2026-07'], ['2026-09-20', '2026-07'], ['2026-09-21', '2026-08'],
    ['2026-10-20', '2026-08'], ['2026-10-21', '2026-09'], ['2026-10-31', '2026-09'], ['2026-11-20', '2026-09'], ['2026-11-21', 'aucune']];
  for (const [d, exp] of cases) check(`debut ${d} -> classement ${exp}`, (await per(d)) === exp, await per(d));
  const def = await q(`select validity_start::text s, validity_end::text e, registration_opening_month::text r from public.ranking_default_validity('2026-10-01')`);
  check('cycle par defaut (propose, non confirme) : octobre -> 21/11 au 20/12', def[0].s === '2026-11-21' && def[0].e === '2026-12-20' && def[0].r === '2026-11-01');
  check('chevauchement de periodes refuse', await fails(() => asAdmin(`select public.set_ranking_validity_period('2026-10-01', '2026-11-15', '2026-12-20', '2026-11-01', 'provisional', 'test')`), /chevauche/));
  check('suppression d une periode refusee', await fails(() => db.query(`delete from public.ranking_validity_periods where reference_month = '2026-06-01'`), /suppression interdite/));
  check('public : lecture des periodes autorisee', (await asRole(db, 'anon', null, `select count(*)::int n from public.ranking_validity_periods`)).rows[0].n === 4);
  check('public : ecriture des periodes refusee', await fails(() => asRole(db, 'anon', null, `insert into public.ranking_validity_periods values ('2026-12-01','2027-01-21','2027-02-20','2027-01-01','confirmed','x')`), /permission|denied/));

  console.log('\nPeriode figee sur septembre (L4_2)');
  check('modification directe de la periode refusee (meme service_role)', await fails(() => asRole(db, 'service_role', null, `update public.ranking_snapshots set validity_start = '2026-10-21', validity_end = '2026-11-20' where reference_month = '2026-09-01'`), /periode de validite|verrouill/i));
  await db.exec(read(path.join(root, 'deploy/l4-seeding-periods/L4_2_periode_septembre_2026.sql')).replace(/<ADMIN_ID>/g, ADMIN));
  const sepV = await q(`select validity_start::text s, validity_end::text e, public.ranking_snapshot_checksum(id) = checksum ok from public.ranking_snapshots where reference_month = '2026-09-01'`);
  check('SEP 2026 : periode 21/10 -> 20/11 figee, contenu intact', sepV.length === 3 && sepV.every((x) => x.s === '2026-10-21' && x.e === '2026-11-20' && x.ok));
  check('periode deja figee : second passage refuse', await fails(() => asAdmin(`select public.set_snapshot_validity((select id from public.ranking_snapshots where reference_month = '2026-09-01' and division = 'men'), 'encore')`), /deja figee/));
  check('periode d un classement publie : plus modifiable dans la table des periodes', await fails(() => asAdmin(`select public.set_ranking_validity_period('2026-09-01', '2026-10-22', '2026-11-20', '2026-10-01', 'confirmed', 'test')`), /deja figee/));

  console.log('\nReferences de seeding : proposition, approbation, generation');
  await db.exec(`insert into public.tournaments (id, name, date, tournament_date, end_date, category, division, status) values
    ('x20', 'Test 20/11 -> 22/11', '2026-11-20', '2026-11-20', '2026-11-22', 'M250', 'men', 'upcoming'),
    ('x21', 'Test 21/11', '2026-11-21', '2026-11-21', null, 'M100', 'men', 'upcoming'),
    ('x1020', 'Test 20/10', '2026-10-20', '2026-10-20', null, 'M50', 'men', 'completed'),
    ('x1021', 'Test 21/10 Dames', '2026-10-21', '2026-10-21', null, 'M50', 'women', 'upcoming'),
    ('x0903', 'Test 03/10', '2026-10-03', '2026-10-03', null, 'M250', 'men', 'completed'),
    ('x1101', 'Test 01/11', '2026-11-01', '2026-11-01', null, 'M100', 'men', 'upcoming')`);
  const p20 = (await asAdmin(`select public.propose_tournament_seeding('x20', 'men') r`))[0].r;
  check('tournoi du 20/11 au 22/11 -> SEPTEMBRE (date de debut), propose', p20.status === 'proposed' && p20.expected_reference_month === '2026-09-01' && p20.snapshot_version === 1, JSON.stringify(p20));
  check('tournoi du 21/11 : aucune periode confirmee -> validation manuelle', await fails(() => asAdmin(`select public.propose_tournament_seeding('x21', 'men')`), /validation manuelle/));
  const p1020 = (await asAdmin(`select public.propose_tournament_seeding('x1020', 'men') r`))[0].r;
  check('tournoi du 20/10 -> AOUT, classement non publie -> en attente', p1020.status === 'pending_snapshot' && p1020.expected_reference_month === '2026-08-01' && !p1020.snapshot_id, JSON.stringify(p1020));
  check('approbation impossible tant que le classement attendu manque', await fails(() => asAdmin(`select public.approve_tournament_seeding('x1020', 'men', 'APPROUVER x1020 MEN')`), /non publie/));
  check('seeding final bloque sans approbation', await fails(() => asAdmin(`select public.mark_tournament_seeding_generated('x1020', 'men')`), /non approuvee/));
  const p1021 = (await asAdmin(`select public.propose_tournament_seeding('x1021', 'women') r`))[0].r;
  check('tournoi Dames du 21/10 -> SEPTEMBRE Dames', p1021.status === 'proposed' && p1021.expected_reference_month === '2026-09-01');
  check('mauvaise phrase d approbation refusee', await fails(() => asAdmin(`select public.approve_tournament_seeding('x20', 'men', 'OK')`), /Confirmation invalide/));
  await asAdmin(`select public.approve_tournament_seeding('x20', 'men', 'APPROUVER x20 MEN')`);
  const a20 = (await q(`select approval_status, snapshot_version, approved_at is not null a, approved_by::text by from public.tournament_seeding_references where tournament_id = 'x20'`))[0];
  check('approuve : version 1 figee, horodatage et administrateur enregistres', a20.approval_status === 'approved' && a20.snapshot_version === 1 && a20.a && a20.by === ADMIN);
  check('re-proposer une reference approuvee refuse', await fails(() => asAdmin(`select public.propose_tournament_seeding('x20', 'men')`), /deja approuvee/));
  await asAdmin(`select public.mark_tournament_seeding_generated('x20', 'men')`, ADMIN2);
  const g20 = (await q(`select seeding_generated_at is not null g, seeding_generated_by::text by from public.tournament_seeding_references where tournament_id = 'x20'`))[0];
  check('generation du seeding horodatee (administrateur responsable)', g20.g && g20.by === ADMIN2);
  check('generation une seule fois', await fails(() => asAdmin(`select public.mark_tournament_seeding_generated('x20', 'men')`), /deja genere/));
  check('ecriture directe d une reference refusee (meme service_role)', await fails(() => asRole(db, 'service_role', null, `update public.tournament_seeding_references set snapshot_version = 2 where tournament_id = 'x20'`), /uniquement via les fonctions/));
  check('suppression d une reference refusee', await fails(() => db.query(`delete from public.tournament_seeding_references where tournament_id = 'x20'`), /suppression interdite/));
  check('assign : tournoi du 03/10 (AOUT) sur SEPTEMBRE sans motif refuse', await fails(() => asAdmin(`select public.assign_tournament_seeding('x0903', 'men', (select id from public.ranking_snapshots where reference_month = '2026-09-01' and division = 'men'))`), /motif obligatoire/));
  await asAdmin(`select public.approve_tournament_seeding_exception('x1020', 'men', (select id from public.ranking_snapshots where reference_month = '2026-09-01' and division = 'men'), 'Test : classement d''aout non publie a temps, decision du comite')`);
  const e1020 = (await q(`select approval_status, override_reason, expected_reference_month::text m from public.tournament_seeding_references where tournament_id = 'x1020'`))[0];
  check('cas exceptionnel : approuve avec motif, periode attendue conservee (AOUT)', e1020.approval_status === 'approved' && /comite/.test(e1020.override_reason) && e1020.m === '2026-08-01');
  const audit = await q(`select action, count(*)::int n from public.ranking_audit_log where action like '%seeding%' or action like '%validity%' group by 1 order by 1`);
  check('journal : propositions, approbations, exception, generation, periodes', ['approve_seeding', 'approve_seeding_exception', 'propose_seeding', 'seeding_generated', 'set_snapshot_validity'].every((a) => audit.some((x) => x.action === a)), audit.map((x) => `${x.action}:${x.n}`).join(' '));

  console.log('\nArchives officielles juin, juillet, aout 2026 (P3)');
  for (const m of ['JUN26', 'JUL26', 'AUG26']) {
    for (const d of ['MEN', 'WOMEN', 'MIXED']) await db.exec(read(path.join(env.IMPORTS_DIR, `L4_3_${m}_${d}_import_validation.sql`)));
    await db.exec(read(path.join(env.IMPORTS_DIR, `L4_4_${m}_publication.sql`)));
  }
  const arch = await q(`select to_char(reference_month, 'YYYY-MM') m, division, status, locked, entries_count n, validity_start::text s, validity_end::text e, checksum_version cv from public.ranking_snapshots where reference_month < '2026-09-01' order by 1, 2`);
  check('9 archives publiees et verrouillees', arch.length === 9 && arch.every((a) => a.status === 'published' && a.locked), arch.map((a) => `${a.m}/${a.division}:${a.n}`).join(' '));
  const expectV = { '2026-06': ['2026-07-21', '2026-08-20'], '2026-07': ['2026-08-21', '2026-09-20'], '2026-08': ['2026-09-21', '2026-10-20'] };
  check('periodes figees a la publication (juin 21/07-20/08, juillet 21/08-20/09, aout 21/09-20/10)', arch.every((a) => a.s === expectV[a.m][0] && a.e === expectV[a.m][1]));
  const cnt = Object.fromEntries(arch.map((a) => [`${a.m}/${a.division}`, a.n]));
  check('lignes identiques aux classeurs (juin 895/319/213, juillet 928/324/224, aout 940/318/219)',
    cnt['2026-06/men'] === 895 && cnt['2026-06/women'] === 319 && cnt['2026-06/mixed'] === 213 && cnt['2026-07/men'] === 928 && cnt['2026-07/women'] === 324
    && cnt['2026-07/mixed'] === 224 && cnt['2026-08/men'] === 940 && cnt['2026-08/women'] === 318 && cnt['2026-08/mixed'] === 219);
  check('archives non modifiables (meme service_role)', await fails(() => asRole(db, 'service_role', null, `update public.ranking_snapshot_entries set points = points + 1 where snapshot_id = (select id from public.ranking_snapshots where reference_month = '2026-06-01' and division = 'men')`), /verrouill/));
  const vallet = await q(`select to_char(s.reference_month, 'YYYY-MM') m, e.rank, e.points::float8 p from public.ranking_snapshot_entries e join public.ranking_snapshots s on s.id = e.snapshot_id where s.division = 'men' and e.player_name = 'MATHIEU VALLET' order by 1`);
  check('exemple Mathieu Vallet present dans chaque archive', vallet.length === 4, vallet.map((v) => `${v.m}:#${v.rank} ${v.p}`).join(' '));
  const pAug = (await asAdmin(`select public.propose_tournament_seeding('x0903', 'men') r`))[0].r;
  check('apres archive d aout : tournoi du 03/10 propose sur AOUT v1', pAug.status === 'proposed' && pAug.expected_reference_month === '2026-08-01' && pAug.snapshot_version === 1);
  const still = (await q(`select approval_status, snapshot_id::text, expected_reference_month::text m from public.tournament_seeding_references where tournament_id = 'x1020'`))[0];
  check('reference approuvee par exception inchangee apres publication d aout', still.approval_status === 'approved' && still.m === '2026-08-01');

  console.log('\nRevision publiee et recalcul : les references approuvees ne bougent pas');
  const sepMen = (await q(`select id from public.ranking_snapshots where reference_month = '2026-09-01' and division = 'men' and status = 'published'`))[0].id;
  await asAdmin(`select public.propose_tournament_seeding('x1101', 'men')`);
  const players = (await q(`select id from public.players order by id limit 2`)).map((p) => p.id);
  await asAdmin(`do $$ declare v uuid; begin
    v := public.create_ranking_snapshot_draft('men', date '2026-09-01', date '2026-10-01', date '2026-09-30', date '2025-10-01', date '2026-09-30',
         '{}'::jsonb, 'workbook_import', 'test', 'test', 'revision de test', '${sepMen}', 'Test de revision v2');
    insert into public.ranking_snapshot_entries (snapshot_id, player_id, player_name, rank, points, results_counted, results_eligible)
    values (v, '${players[0]}', 'A', 1, 100, 1, 1), (v, '${players[1]}', 'B', 2, 50, 1, 1);
    perform public.validate_ranking_snapshot(v);
    perform public.publish_ranking_snapshot(v, 'PUBLIER MEN 2026-10');
  end $$;`);
  const v2 = await q(`select version, status, validity_start::text s from public.ranking_snapshots where reference_month = '2026-09-01' and division = 'men' order by version`);
  check('revision v2 de septembre publiee (v1 remplacee, consultable)', v2.length === 2 && v2[0].status === 'superseded' && v2[1].status === 'published' && v2[1].s === '2026-10-21');
  const mokaNow = await q(`select tournament_id, snapshot_id::text, snapshot_version from public.tournament_seeding_references where tournament_id in ('t263h', 'x20') order by 1`);
  check('Moka M500 Hommes et tournoi x20 gardent septembre v1', mokaNow.every((m) => m.snapshot_id === sepMen && m.snapshot_version === 1));
  check('proposition faite sur v1 non approuvable apres la v2 (a reproposer)', await fails(() => asAdmin(`select public.approve_tournament_seeding('x1101', 'men', 'APPROUVER x1101 MEN')`), /plus la version publiee/));
  const re = (await asAdmin(`select public.propose_tournament_seeding('x1101', 'men') r`))[0].r;
  check('reproposee : septembre v2', re.status === 'proposed' && re.snapshot_version === 2);
  const stView = await asRole(db, 'anon', null, `select tournament_id, seeding_status, snapshot_version, expected_snapshot_version from public.tournament_seeding_status where tournament_id in ('t263h', 'x20', 'x21', 'x1020') order by 1`);
  const sv = Object.fromEntries(stView.rows.map((r) => [r.tournament_id, r]));
  check('vue publique : approuve v1 alors que la version publiee attendue est v2 (historique preserve)', sv.t263h?.seeding_status === 'approved' && sv.t263h.snapshot_version === 1 && sv.t263h.expected_snapshot_version === 2 && sv.x21?.seeding_status === 'no_period', JSON.stringify(stView.rows));
  await db.exec(`create table if not exists public.rankings (id serial primary key, player_name text, division text, rank int, points numeric); insert into public.rankings (player_name, division, rank, points) values ('A', 'men', 1, 10);`);
  const before = JSON.stringify(await q(`select tournament_id, division, snapshot_id, snapshot_version, approval_status, approved_at from public.tournament_seeding_references order by 1, 2`));
  await db.exec(`update public.rankings set points = points + 500, rank = 2;`);
  const after = JSON.stringify(await q(`select tournament_id, division, snapshot_id, snapshot_version, approval_status, approved_at from public.tournament_seeding_references order by 1, 2`));
  check('recalcul du classement en direct : aucune reference de seeding modifiee', before === after);

  console.log('\nPublication : periode confirmee obligatoire');
  if (env.OCT_DIR) {
    for (const f of fs.readdirSync(env.OCT_DIR).filter((x) => /^2026_10_1/.test(x)).sort()) await db.exec(read(path.join(env.OCT_DIR, f)));
    check('octobre 2026 : publication refusee sans periode confirmee', await fails(() => db.exec(read(path.join(env.OCT_DIR, '2026_10_2_publication.sql'))), /non confirmee/));
    await asAdmin(`select public.set_ranking_validity_period('2026-10-01', '2026-11-21', '2026-12-20', '2026-11-01', 'provisional', 'Cycle par defaut, en attente MSRA/MPL')`);
    check('periode provisoire : publication toujours refusee', await fails(() => db.exec(read(path.join(env.OCT_DIR, '2026_10_2_publication.sql'))), /non confirmee/));
    check('tournoi du 21/11 sur periode provisoire : toujours validation manuelle', await fails(() => asAdmin(`select public.propose_tournament_seeding('x21', 'men')`), /validation manuelle/));
  } else console.log('  (OCT_DIR absent : controle de publication d octobre ignore)');

  console.log(`\nResultat : ${passed} controles OK, ${failures.length} echec(s).`);
  if (failures.length) console.log(failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error('ERREUR :', e.message.slice(0, 3000)); process.exit(1); });
