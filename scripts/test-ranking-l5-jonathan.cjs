/* eslint-disable no-console */
// Repetition L5 (E1-E3) : rattachement du resultat "Nathan Wong" a Jonathan Wong
// (MPL0001865) et revision V2 du classement Mixte de septembre, sur une copie
// locale PGlite reproduisant la production apres L4. Aucune base distante.
//
//   PGLITE_PATH=... SNAPSHOT_DIR=<json du jour> L2_DIR=<L2 GEL SEP 2026> node scripts/test-ranking-l5-jonathan.cjs
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createTestCopy, asRole, ADMIN } = require('./lib/pg-test-copy.cjs');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(f, 'utf8');
const env = process.env;
const L5 = path.join(root, 'deploy', 'l5-archives-references');
const J = 'b3ec0a65-de8f-4f45-9e57-35590e459573';
const ROW = 'a9393e13-c82d-43d3-af46-a40f6c802603';
let db;
let passed = 0; const failures = [];
const check = (label, cond, detail = '') => { if (cond) { passed += 1; console.log(`  OK   ${label}${detail ? ` (${detail})` : ''}`); } else { failures.push(label); console.log(`  ECHEC ${label}${detail ? ` (${detail})` : ''}`); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const hash = async (sql) => crypto.createHash('sha256').update(JSON.stringify(await q(sql))).digest('hex');
const withAdmin = (sql) => sql.replace(/<ADMIN_ID>/g, ADMIN);

async function main() {
  ({ db } = await createTestCopy(env.SNAPSHOT_DIR));
  // Lignes de resultats utiles (copie fidele de la ligne SPARC Mixte et de deux lignes temoins).
  await db.exec(`
    create table public.historical_tournament_results (id uuid primary key, event_key text, event_name text, event_date date, division text, rank_label text, rank_min int,
      player1_name text, player2_name text, player1_id uuid, player2_id uuid, points numeric);
    create table public.tournament_results (id uuid primary key, tournament_id text, tournament_name text, tournament_date date, rank int,
      player1_name text, player2_name text, player1_id uuid, player2_id uuid, points numeric);
    insert into public.historical_tournament_results values
      ('${ROW}', 't160', 'SPARC Cascavelle Mixed Open', '2026-09-06', 'mixed', '#11', 11, 'Diana Kuznetsova', 'Nathan Wong', 'f4641f85-f876-4778-a720-e6e84d2a0df6', null, 90),
      ('016336a4-5a98-49cb-a862-6dddbf229eae', 't140h', 'Urban Sport Grand Baie M25 (Hommes)', '2026-08-01', 'men', '#11', 11, 'JAVON WONG', 'JONATHAN WONG', '26f94f9a-3ee5-425c-98ea-39fa328a3afe', '${J}', 2);
    insert into public.tournament_results values
      ('${ROW}', 't160', 'SPARC Cascavelle Mixed Open', '2026-09-06', 11, 'Diana Kuznetsova', 'Nathan Wong', 'f4641f85-f876-4778-a720-e6e84d2a0df6', null, 90);
    create table public.rankings (division text, player_name text, rank int, points numeric);`);
  await db.query(`insert into public.rankings select * from json_populate_recordset(null::public.rankings, $1)`, [read(path.join(env.SNAPSHOT_DIR, 'rankings_live.json'))]);
  check('fiche MPL0001865 presente dans la copie', (await q(`select count(*)::int n from public.players where id = '${J}' and license_no = 'MPL0001865'`))[0].n === 1);

  // Production reproduite (L1, L1.1, L2 + Moka, L3, L4 + periode de septembre).
  for (const f of ['ranking_snapshots_l1_migration.sql', 'ranking_snapshots_l1_1_migration.sql']) await db.exec(read(path.join(root, f)));
  for (const f of ['L2_1a_import_validation_HOMMES_SEP26.sql', 'L2_1b_import_validation_DAMES_SEP26.sql', 'L2_1c_import_validation_MIXTE_SEP26.sql', 'L2_2_publication_SEP26.sql']) await db.exec(read(path.join(env.L2_DIR, f)));
  let l23 = read(path.join(env.L2_DIR, 'L2_3_rattachement_MOKA_M500_SEP26.sql'));
  const prod = { men: ['e77675e4-447f-4f76-abf0-9e35b5ae0897', '940b5a1ba30b6b7b66fcc00976abcd2c86c82f40e961459879ea2f2e5f4e1d88'], women: ['6dd79d37-cd6d-4d00-ba76-96ba57e8e1a2', '00b70d83a9f315f3ae26e320c96bae1f48e80b1903034915098acb4f60a2a095'] };
  for (const r of await q(`select id::text, division, checksum from public.ranking_snapshots`)) if (prod[r.division]) l23 = l23.split(prod[r.division][0]).join(r.id).split(prod[r.division][1]).join(r.checksum);
  await db.exec(l23);
  for (const f of ['ranking_snapshots_l3_migration.sql', 'ranking_snapshots_l4_validity_periods.sql']) await db.exec(read(path.join(root, f)));
  await db.exec(withAdmin(read(path.join(root, 'deploy/l4-seeding-periods/L4_2_periode_septembre_2026.sql'))));

  const v1 = (await q(`select id, checksum, entries_count from public.ranking_snapshots where division = 'mixed' and reference_month = '2026-09-01'`))[0];
  const H = {
    v1: await hash(`select e.* from public.ranking_snapshot_entries e where snapshot_id = '${v1.id}' order by entry_id`),
    menWomen: await hash(`select id, version, status, checksum, validity_start from public.ranking_snapshots where division <> 'mixed' order by division`),
    refs: await hash(`select * from public.tournament_seeding_references order by tournament_id`),
    live: await hash(`select * from public.rankings order by division, rank, player_name`),
    players: await hash(`select id, first_name, last_name, license_no from public.players order by id`),
  };
  console.log(`Mixte septembre v1 : ${v1.entries_count} lignes.`);

  console.log('\nE1. Rattachement du resultat a MPL0001865');
  await db.exec(read(path.join(L5, 'L5_E1_rattachement_resultat_jonathan_wong.sql')));
  const linked = await q(`select (select player2_id::text from public.historical_tournament_results where id = '${ROW}') h, (select player2_id::text from public.tournament_results where id = '${ROW}') t,
    (select player2_name from public.historical_tournament_results where id = '${ROW}') nom, (select points::int from public.historical_tournament_results where id = '${ROW}') pts`);
  check('ligne SPARC rattachee a MPL0001865 dans les deux tables', linked[0].h === J && linked[0].t === J);
  check('nom saisi, rang et points inchanges', linked[0].nom === 'Nathan Wong' && linked[0].pts === 90);
  check('aucune fiche creee, aucun identifiant modifie', await hash(`select id, first_name, last_name, license_no from public.players order by id`) === H.players);
  await db.exec(read(path.join(L5, 'L5_E1_rattachement_resultat_jonathan_wong.sql')));
  check('E1 rejouable sans effet', (await q(`select count(*)::int n from public.historical_tournament_results where player2_id = '${J}'`))[0].n === 2);

  console.log('\nE2. Revision V2 du Mixte de septembre (validee, non publiee)');
  await db.exec(withAdmin(read(path.join(L5, 'L5_E2_revision_v2_mixte_septembre.sql'))));
  const v2 = (await q(`select id, version, status, entries_count, revision_of::text, revision_reason, checksum_version from public.ranking_snapshots where division = 'mixed' and reference_month = '2026-09-01' and version = 2`))[0];
  check('V2 creee et validee, revision de la V1 avec motif', v2 && v2.status === 'validated' && v2.revision_of === v1.id && /JONATHAN WONG/.test(v2.revision_reason));
  check('V2 : 216 lignes (215 + Jonathan Wong)', v2.entries_count === v1.entries_count + 1, String(v2.entries_count));
  const jw = (await q(`select rank, points::float8 p, results_counted, player_id::text from public.ranking_snapshot_entries where snapshot_id = '${v2.id}' and player_name = 'JONATHAN WONG'`))[0];
  check('Jonathan Wong 145e, 90 points, 1 resultat retenu, fiche MPL0001865', jw && jw.rank === 145 && jw.p === 90 && jw.results_counted === 1 && jw.player_id === J);
  const cmp = await q(`select a.player_name, a.rank r1, b.rank r2, a.points::float8 p1, b.points::float8 p2 from public.ranking_snapshot_entries a
    join public.ranking_snapshot_entries b on b.snapshot_id = '${v2.id}' and b.player_name = a.player_name and coalesce(b.player_id::text, '') = coalesce(a.player_id::text, '')
   where a.snapshot_id = '${v1.id}'`);
  check('les 215 joueurs de la V1 sont dans la V2 avec les memes points', cmp.length === 215 && cmp.every((c) => c.p1 === c.p2));
  check('144 joueurs au-dessus de 90 points : rang inchange', cmp.filter((c) => c.p1 > 90).every((c) => c.r1 === c.r2) && cmp.filter((c) => c.p1 > 90).length === 144);
  check('5 joueurs a 90 points : toujours 145e (6 ex aequo avec Jonathan Wong)', cmp.filter((c) => c.p1 === 90).every((c) => c.r1 === 145 && c.r2 === 145) && cmp.filter((c) => c.p1 === 90).length === 5);
  const moved = cmp.filter((c) => c.p1 < 90);
  check('66 joueurs sous 90 points : exactement +1 rang', moved.length === 66 && moved.every((c) => c.r2 === c.r1 + 1), `${Math.min(...moved.map((c) => c.r1))}-${Math.max(...moved.map((c) => c.r1))} -> ${Math.min(...moved.map((c) => c.r2))}-${Math.max(...moved.map((c) => c.r2))}`);
  const det = await q(`select (select count(*)::int from public.ranking_snapshot_results where snapshot_id = '${v1.id}') d1, (select count(*)::int from public.ranking_snapshot_results where snapshot_id = '${v2.id}') d2`);
  check('detail : celui de la V1 + le resultat SPARC de Jonathan Wong', det[0].d2 === det[0].d1 + 1, `${det[0].d1} -> ${det[0].d2}`);
  check('V1 toujours publiee et intacte', (await q(`select status, public.ranking_snapshot_checksum(id) = checksum ok from public.ranking_snapshots where id = '${v1.id}'`))[0].ok
    && await hash(`select e.* from public.ranking_snapshot_entries e where snapshot_id = '${v1.id}' order by entry_id`) === H.v1);
  check('public : la V2 non publiee est invisible', (await asRole(db, 'anon', null, `select count(*)::int n from public.ranking_snapshots where id = '${v2.id}'`)).rows[0].n === 0);
  await db.exec(withAdmin(read(path.join(L5, 'L5_E2_revision_v2_mixte_septembre.sql'))));
  check('E2 rejouable : pas de V3', (await q(`select max(version)::int v from public.ranking_snapshots where division = 'mixed' and reference_month = '2026-09-01'`))[0].v === 2);

  console.log('\nE3. Publication de la V2');
  await db.exec(withAdmin(read(path.join(L5, 'L5_E3_publication_v2_mixte_septembre.sql'))));
  const st = await q(`select version, status, locked, validity_start::text s, validity_end::text e, public.ranking_snapshot_checksum(id) = checksum ok from public.ranking_snapshots where division = 'mixed' and reference_month = '2026-09-01' order by version`);
  check('V1 remplacee (conservee), V2 publiee et verrouillee', st[0].status === 'superseded' && st[0].ok && st[1].status === 'published' && st[1].locked && st[1].ok);
  check('V2 : periode 21/10/2026 -> 20/11/2026', st[1].s === '2026-10-21' && st[1].e === '2026-11-20');
  check('public : V1 (remplacee) et V2 consultables', (await asRole(db, 'anon', null, `select count(*)::int n from public.ranking_snapshots where division = 'mixed' and reference_month = '2026-09-01'`)).rows[0].n === 2);
  await db.exec(withAdmin(read(path.join(L5, 'L5_E3_publication_v2_mixte_septembre.sql'))));
  check('E3 rejouable sans effet', (await q(`select count(*)::int n from public.ranking_snapshots where division = 'mixed' and status = 'published'`))[0].n === 1);

  console.log('\nNon-regression');
  check('Hommes et Dames de septembre inchanges', await hash(`select id, version, status, checksum, validity_start from public.ranking_snapshots where division <> 'mixed' order by division`) === H.menWomen);
  check('references de seeding inchangees (Moka APPROUVE v1)', await hash(`select * from public.tournament_seeding_references order by tournament_id`) === H.refs);
  check('classement en direct inchange', await hash(`select * from public.rankings order by division, rank, player_name`) === H.live);

  console.log(`\nResultat : ${passed} controles OK, ${failures.length} echec(s).`);
  if (failures.length) console.log(failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error('ERREUR :', e.message.slice(0, 3000)); process.exit(1); });
