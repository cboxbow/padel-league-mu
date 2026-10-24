/* eslint-disable no-console */
// Repetition du lot L5 sur une copie locale PGlite reproduisant la production
// apres L4 (L1 -> L4 + periode de septembre) : propositions des references,
// archives juin-aout idempotentes, retour arriere, periode d'octobre provisoire,
// et non-regression (septembre, Moka, classement en direct, inscriptions,
// resultats, identifiants joueurs, bornes, ecritures exterieures).
//
//   PGLITE_PATH=... SNAPSHOT_DIR=<json, tournois du jour> L2_DIR=<L2 GEL SEP 2026>
//   IMPORTS_DIR=<L4_3/L4_4 generes en L5> node scripts/test-ranking-l5.cjs
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createTestCopy, asRole, ADMIN } = require('./lib/pg-test-copy.cjs');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(f, 'utf8');
const env = process.env;
const L5 = path.join(root, 'deploy', 'l5-archives-references');
let db;
let passed = 0; const failures = [];
const check = (label, cond, detail = '') => { if (cond) { passed += 1; console.log(`  OK   ${label}${detail ? ` (${detail})` : ''}`); } else { failures.push(label); console.log(`  ECHEC ${label}${detail ? ` (${detail})` : ''}`); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const hash = async (sql) => crypto.createHash('sha256').update(JSON.stringify(await q(sql))).digest('hex');
const fails = async (fn, re) => { try { await fn(); return false; } catch (e) { await db.exec('rollback').catch(() => {}); return re.test(e.message) || (console.log(`       message : ${e.message.slice(0, 200)}`), false); } };
const asAdmin = async (sql) => {
  await db.exec('begin');
  try {
    await db.exec(`select set_config('request.jwt.claim.sub', '${ADMIN}', true); select set_config('request.jwt.claims', '${JSON.stringify({ sub: ADMIN, role: 'authenticated' })}', true); set local role authenticated;`);
    const r = await db.query(sql); await db.exec('commit'); return r.rows;
  } catch (e) { await db.exec('rollback'); throw e; }
};
const IMPORT_ORDER = ['JUN26', 'JUL26', 'AUG26'];
const importMonth = async (m, publish) => {
  for (const d of ['MEN', 'WOMEN', 'MIXED']) await db.exec(read(path.join(env.IMPORTS_DIR, `L4_3_${m}_${d}_import_validation.sql`)));
  if (publish) await db.exec(read(path.join(env.IMPORTS_DIR, `L4_4_${m}_publication.sql`)));
};

async function main() {
  ({ db } = await createTestCopy(env.SNAPSHOT_DIR));
  // Tables lues par les controles de non-regression (copies fideles des donnees du jour).
  await db.exec(`create table public.historical_tournament_results (id bigint generated always as identity primary key, sheet_name text, event_name text, event_date date, player1_name text, points numeric);
    insert into public.historical_tournament_results (event_name, event_date, player1_name, points)
    select 'M1000 - URBAN BR - NOV 25 - MEN', date '2025-10-31', 'J' || g, 100 from generate_series(1, 3) g;
    create table public.rankings (division text, player_name text, rank int, points numeric);`);
  await db.query(`insert into public.rankings select * from json_populate_recordset(null::public.rankings, $1)`, [read(path.join(env.SNAPSHOT_DIR, 'rankings_live.json'))]);

  // Production reproduite : L1, L1.1, gel SEP (L2), Moka (L2_3), L3, L4 + periode de septembre.
  for (const f of ['ranking_snapshots_l1_migration.sql', 'ranking_snapshots_l1_1_migration.sql']) await db.exec(read(path.join(root, f)));
  for (const f of ['L2_1a_import_validation_HOMMES_SEP26.sql', 'L2_1b_import_validation_DAMES_SEP26.sql', 'L2_1c_import_validation_MIXTE_SEP26.sql', 'L2_2_publication_SEP26.sql']) await db.exec(read(path.join(env.L2_DIR, f)));
  let l23 = read(path.join(env.L2_DIR, 'L2_3_rattachement_MOKA_M500_SEP26.sql'));
  const prod = { men: ['e77675e4-447f-4f76-abf0-9e35b5ae0897', '940b5a1ba30b6b7b66fcc00976abcd2c86c82f40e961459879ea2f2e5f4e1d88'], women: ['6dd79d37-cd6d-4d00-ba76-96ba57e8e1a2', '00b70d83a9f315f3ae26e320c96bae1f48e80b1903034915098acb4f60a2a095'] };
  for (const r of await q(`select id::text, division, checksum from public.ranking_snapshots`)) if (prod[r.division]) l23 = l23.split(prod[r.division][0]).join(r.id).split(prod[r.division][1]).join(r.checksum);
  await db.exec(l23);
  for (const f of ['ranking_snapshots_l3_migration.sql', 'ranking_l3_dates_de_fin.sql', 'ranking_snapshots_l4_validity_periods.sql']) await db.exec(read(path.join(root, f)));
  await db.exec(read(path.join(root, 'deploy/l4-seeding-periods/L4_2_periode_septembre_2026.sql')).replace(/<ADMIN_ID>/g, ADMIN));
  const st0 = await q(`select seeding_status, count(*)::int n from public.tournament_seeding_status where start_date between '2026-10-21' and '2026-11-20' and tournament_status <> 'cancelled' group by 1 order by 1`);
  console.log(`Etat de production reproduit (apres L4) : ${st0.map((x) => `${x.seeding_status} ${x.n}`).join(', ')}`);
  check('meme etat que la production : 34 tournois (32 a proposer, 2 approuves)', JSON.stringify(st0) === JSON.stringify([{ seeding_status: 'approved', n: 2 }, { seeding_status: 'not_assigned', n: 32 }]));

  // Empreintes de non-regression.
  const H = {
    sep: await hash(`select id, division, version, status, checksum, validity_start, validity_end, public.ranking_snapshot_checksum(id) = checksum ok from public.ranking_snapshots where reference_month = '2026-09-01' order by division`),
    sepEntries: await hash(`select e.* from public.ranking_snapshot_entries e join public.ranking_snapshots s on s.id = e.snapshot_id where s.reference_month = '2026-09-01' order by e.entry_id`),
    moka: await hash(`select tournament_id, division, snapshot_id, snapshot_version, approval_status, approved_at from public.tournament_seeding_references where tournament_id in ('t263h', 't264f') order by 1`),
    live: await hash(`select * from public.rankings order by division, rank, player_name`),
    regs: await hash(`select * from public.registrations order by id`),
    results: await hash(`select * from public.historical_tournament_results order by id`),
    players: await hash(`select id, first_name, last_name, license_no from public.players order by id`),
    tournaments: await hash(`select * from public.tournaments order by id`),
  };

  console.log('\nA. Propositions des references (L5_A)');
  await db.exec(read(path.join(L5, 'L5_A_propositions_references.sql')));
  const refs = await q(`select tournament_id, division, approval_status, snapshot_version, to_char(expected_reference_month, 'YYYY-MM') m from public.tournament_seeding_references order by 1, 2`);
  const proposed = refs.filter((r) => r.approval_status === 'proposed');
  check('26 references proposees, toutes sur SEPTEMBRE v1, aucune approuvee', proposed.length === 26 && proposed.every((r) => r.m === '2026-09' && r.snapshot_version === 1));
  check('seuls les 2 Moka restent approuves', refs.filter((r) => r.approval_status === 'approved').map((r) => r.tournament_id).join(',') === 't263h,t264f');
  check('les 6 tournois du 24/10 ne sont pas touches (revue manuelle)', ['t191f', 't191h', 't192f', 't192h', 't193f', 't193h'].every((id) => !refs.some((r) => r.tournament_id === id)));
  await db.exec(read(path.join(L5, 'L5_A_propositions_references.sql')));
  check('rejouable : 28 references, sans doublon ni changement d approbation', (await q(`select count(*)::int n from public.tournament_seeding_references`))[0].n === 28
    && (await q(`select count(*)::int n from public.tournament_seeding_references where approval_status = 'approved'`))[0].n === 2);
  const st1 = await q(`select seeding_status, count(*)::int n from public.tournament_seeding_status where start_date between '2026-10-21' and '2026-11-20' group by 1 order by 1`);
  check('vue : 2 approuves, 26 proposes, 6 a revoir', JSON.stringify(st1) === JSON.stringify([{ seeding_status: 'approved', n: 2 }, { seeding_status: 'not_assigned', n: 6 }, { seeding_status: 'proposed', n: 26 }]), JSON.stringify(st1));

  console.log('\nB. Archives juin, juillet, aout : imports idempotents et retour arriere');
  await importMonth('JUN26', false);
  check('juin importe et valide (non publie)', (await q(`select count(*)::int n from public.ranking_snapshots where reference_month = '2026-06-01' and status = 'validated'`))[0].n === 3);
  await importMonth('JUN26', false);
  check('relance de l import : aucun doublon (3 classements de juin)', (await q(`select count(*)::int n from public.ranking_snapshots where reference_month = '2026-06-01'`))[0].n === 3);
  await db.exec(read(path.join(L5, 'L5_B_retour_arriere_archives.sql')));
  check('retour arriere avant publication : archives repassees en brouillon (invisibles, conservees pour l audit)', (await q(`select count(*)::int n from public.ranking_snapshots where reference_month < '2026-09-01' and status = 'draft'`))[0].n === 3 && (await asRole(db, 'anon', null, `select count(*)::int n from public.ranking_snapshots where reference_month < '2026-09-01'`)).rows[0].n === 0);
  for (const m of IMPORT_ORDER) await importMonth(m, true);
  for (const m of IMPORT_ORDER) await importMonth(m, true);
  const arch = await q(`select to_char(reference_month, 'YYYY-MM') m, division, status, entries_count n, validity_start::text s, validity_end::text e from public.ranking_snapshots where reference_month < '2026-09-01' order by 1, 2`);
  check('import + publication rejoues deux fois : 9 archives publiees, aucun doublon', arch.length === 9 && arch.every((a) => a.status === 'published'), arch.map((a) => `${a.m}/${a.division}:${a.n}`).join(' '));
  const cnt = Object.fromEntries(arch.map((a) => [`${a.m}/${a.division}`, a.n]));
  check('lignes conformes aux classeurs (juin 895/319/213, juillet 928/324/224, aout 940/318/219)',
    cnt['2026-06/men'] === 895 && cnt['2026-06/women'] === 319 && cnt['2026-06/mixed'] === 213 && cnt['2026-07/men'] === 928 && cnt['2026-07/women'] === 324
    && cnt['2026-07/mixed'] === 224 && cnt['2026-08/men'] === 940 && cnt['2026-08/women'] === 318 && cnt['2026-08/mixed'] === 219);
  const exp = { '2026-06': ['2026-07-21', '2026-08-20'], '2026-07': ['2026-08-21', '2026-09-20'], '2026-08': ['2026-09-21', '2026-10-20'] };
  check('periodes historiques figees (21/07-20/08, 21/08-20/09, 21/09-20/10)', arch.every((a) => a.s === exp[a.m][0] && a.e === exp[a.m][1]));
  const ids = await q(`select count(*)::int n, count(*) filter (where e.player_id is null and coalesce(e.identity_note, '') = '')::int bad from public.ranking_snapshot_entries e join public.ranking_snapshots s on s.id = e.snapshot_id where s.reference_month < '2026-09-01'`);
  check('chaque ligne sans fiche porte une note (aucune identite perdue)', ids[0].bad === 0, `${ids[0].n} lignes`);
  check('une archive differente pour un mois deja importe est refusee', await fails(() => db.exec(read(path.join(env.IMPORTS_DIR, 'L4_3_JUL26_MEN_import_validation.sql')).replace(/classeur sha256 [0-9a-f]{64}/g, 'classeur sha256 autre')), /un autre classement existe deja/));
  await db.exec(read(path.join(L5, 'L5_B_retour_arriere_archives.sql')));
  const after = await q(`select to_char(reference_month, 'YYYY-MM') m, status, count(*)::int n from public.ranking_snapshots group by 1, 2 order by 1, 2`);
  check('retour arriere apres publication : archives retirees (jamais supprimees), septembre intact', after.filter((a) => a.m < '2026-09').every((a) => a.status === 'withdrawn') && after.some((a) => a.m === '2026-09' && a.status === 'published' && a.n === 3), JSON.stringify(after));

  console.log('\nC. Periode d octobre provisoire (L5_C)');
  await db.exec(read(path.join(L5, 'L5_C_periode_octobre_provisoire.sql')));
  const oct = (await q(`select validity_start::text s, validity_end::text e, status from public.ranking_validity_periods where reference_month = '2026-10-01'`))[0];
  check('octobre : 21/11 -> 20/12, statut provisoire', oct && oct.s === '2026-11-21' && oct.e === '2026-12-20' && oct.status === 'provisional');
  const t1121 = await q(`select id from public.tournaments where date between '2026-11-21' and '2026-12-20' and status <> 'cancelled' order by date limit 1`);
  if (t1121.length) check('tournoi apres le 20/11 : jamais propose sur une periode provisoire', await fails(() => asAdmin(`select public.propose_tournament_seeding('${t1121[0].id}', (select division from public.tournaments where id = '${t1121[0].id}'))`), /validation manuelle/));
  check('bornes : 20/11 -> septembre, 21/11 -> aucune periode confirmee', (await q(`select string_agg(to_char(reference_month, 'YYYY-MM'), ',') r from public.ranking_period_for_date('2026-11-20') where status = 'confirmed'`))[0].r === '2026-09'
    && (await q(`select count(*)::int n from public.ranking_period_for_date('2026-11-21') where status = 'confirmed'`))[0].n === 0);

  console.log('\nF. Non-regression');
  check('septembre inchange (contenu, version, periode, somme de controle)', await hash(`select id, division, version, status, checksum, validity_start, validity_end, public.ranking_snapshot_checksum(id) = checksum ok from public.ranking_snapshots where reference_month = '2026-09-01' order by division`) === H.sep
    && await hash(`select e.* from public.ranking_snapshot_entries e join public.ranking_snapshots s on s.id = e.snapshot_id where s.reference_month = '2026-09-01' order by e.entry_id`) === H.sepEntries);
  check('Moka M500 toujours APPROUVE v1', await hash(`select tournament_id, division, snapshot_id, snapshot_version, approval_status, approved_at from public.tournament_seeding_references where tournament_id in ('t263h', 't264f') order by 1`) === H.moka);
  check('classement en direct inchange', await hash(`select * from public.rankings order by division, rank, player_name`) === H.live);
  check('inscriptions inchangees', await hash(`select * from public.registrations order by id`) === H.regs);
  check('resultats de tournois inchanges', await hash(`select * from public.historical_tournament_results order by id`) === H.results);
  check('identifiants joueurs inchanges', await hash(`select id, first_name, last_name, license_no from public.players order by id`) === H.players);
  check('tournois inchanges (dates, statuts, categories)', await hash(`select * from public.tournaments order by id`) === H.tournaments);
  check('ecriture exterieure refusee (periodes)', await fails(() => asRole(db, 'anon', null, `insert into public.ranking_validity_periods values ('2027-01-01','2027-02-21','2027-03-20','2027-02-01','confirmed','x')`), /permission|denied/));
  check('ecriture exterieure refusee (references)', await fails(() => asRole(db, 'anon', null, `select public.propose_tournament_seeding('t198', 'men')`), /permission|denied|Reserve/));
  check('modification directe d une reference refusee (meme service_role)', await fails(() => asRole(db, 'service_role', null, `update public.tournament_seeding_references set snapshot_version = 9 where tournament_id = 't198'`), /uniquement via les fonctions/));

  console.log(`\nResultat : ${passed} controles OK, ${failures.length} echec(s).`);
  if (failures.length) console.log(failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error('ERREUR :', e.message.slice(0, 3000)); process.exit(1); });
