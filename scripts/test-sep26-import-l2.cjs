/* eslint-disable no-console */
// Repetition generale du lot L2 sur une copie locale : L1 + L1.1 + import
// SEP 26 (script 1) + publication (script 2), puis controles de fidelite au
// classeur diffuse et de visibilite. Ne touche a aucune base distante.
//
//   PGLITE_PATH=... SNAPSHOT_DIR=<json> L2_DIR=<dossier des scripts L2> node scripts/test-sep26-import-l2.cjs
const fs = require('node:fs');
const path = require('node:path');
const { createTestCopy, asRole } = require('./lib/pg-test-copy.cjs');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(f, 'utf8');
let passed = 0; const failures = [];
const check = (label, cond, detail = '') => { if (cond) { passed += 1; console.log(`  OK   ${label}${detail ? ` (${detail})` : ''}`); } else { failures.push(label); console.log(`  ECHEC ${label}${detail ? ` (${detail})` : ''}`); } };

async function main() {
  const { db } = await createTestCopy(process.env.SNAPSHOT_DIR);
  const data = JSON.parse(read(path.join(process.env.L2_DIR, 'L2_donnees_SEP26.json')));
  await db.exec(read(path.join(root, 'ranking_snapshots_l1_migration.sql')));
  await db.exec(read(path.join(root, 'ranking_snapshots_l1_1_migration.sql')));
  console.log('L1 + L1.1 appliques.');

  console.log('\nScript 1 : import et validation');
  const t0 = Date.now();
  for (const f of ['L2_1a_import_validation_HOMMES_SEP26.sql', 'L2_1b_import_validation_DAMES_SEP26.sql', 'L2_1c_import_validation_MIXTE_SEP26.sql']) await db.exec(read(path.join(process.env.L2_DIR, f)));
  console.log(`  (execute en ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const snaps = (await db.query(`select id, division, version, status, entries_count, source, created_by::text, validated_by::text from public.ranking_snapshots order by division`)).rows;
  for (const d of ['men', 'women', 'mixed']) {
    const s = snaps.find((x) => x.division === d);
    check(`${d} : brouillon cree puis valide`, s && s.status === 'validated' && s.version === 1 && s.source === 'workbook_import', s && `${s.status}, v${s.version}`);
    check(`${d} : ${data.entries[d].length} lignes comme le classeur`, s && s.entries_count === data.entries[d].length, s && String(s.entries_count));
  }
  check('actions signees par le compte admin', snaps.every((s) => s.created_by === 'a19ee76e-30da-43df-b8b7-d1a15a0e0268' && s.validated_by === s.created_by));

  // Fidelite : chaque ligne diffusee (rang, nom, points) est presente a l'identique.
  for (const d of ['men', 'women', 'mixed']) {
    const rows = (await db.query(`select e.player_name, e.rank, e.points::float8 p, e.player_id::text, e.identity_note from public.ranking_snapshot_entries e join public.ranking_snapshots s on s.id = e.snapshot_id where s.division = $1`, [d])).rows;
    const key = (x) => `${x.player_name}|${x.rank}|${Number(x.p ?? x.points).toFixed(6)}`;
    const db1 = new Set(rows.map(key));
    const missing = data.entries[d].filter((e) => !db1.has(`${e.player_name}|${e.rank}|${Number(e.points).toFixed(6)}`));
    check(`${d} : rang, nom et points identiques au classeur`, missing.length === 0, missing.length ? `${missing.length} differences` : `${rows.length}/${rows.length}`);
    const noId = rows.filter((x) => !x.player_id);
    check(`${d} : lignes sans fiche toutes annotees`, noId.every((x) => x.identity_note), `${noId.length} sans fiche`);
  }
  const vallet = (await db.query(`select e.rank, e.points::float8 p from public.ranking_snapshot_entries e join public.ranking_snapshots s on s.id=e.snapshot_id where s.division='men' and e.player_name='MATHIEU VALLET'`)).rows[0];
  check('Mathieu Vallet : #1, 5 450 pts (valeur diffusee en septembre)', vallet && vallet.rank === 1 && vallet.p === 5450, vallet && `#${vallet.rank} ${vallet.p}`);
  const gosch = (await db.query(`select e.rank, e.player_id, e.identity_note from public.ranking_snapshot_entries e where e.player_name='MICKAEL GOSCH'`)).rows[0];
  check('Mickael Gosch conserve #32 sans fiche, avec note', gosch && gosch.rank === 32 && !gosch.player_id && /Sans fiche/.test(gosch.identity_note));
  const sookia = (await db.query(`select rank, player_id is not null as fiche, identity_note from public.ranking_snapshot_entries where player_name like 'ZAYAN SOOKIA%' order by rank`)).rows;
  check('Zayan Sookia : #401 sur sa fiche, #818 conserve comme doublon annote', sookia.length === 2 && sookia[0].fiche && !sookia[1].fiche && /Doublon de la ligne #401/.test(sookia[1].identity_note));
  const det = (await db.query(`select count(*)::int n, count(*) filter (where status='counted')::int c from public.ranking_snapshot_results`)).rows[0];
  const expected = ['men', 'women', 'mixed'].reduce((s, d) => s + data.results[d].length, 0);
  check('detail des totaux charge', det.n === expected, `${det.n} resultats dont ${det.c} retenus`);
  const anonBefore = (await asRole(db, 'anon', null, `select count(*)::int n from public.ranking_snapshots`)).rows[0].n;
  check('avant publication : rien de visible pour le public', anonBefore === 0);

  console.log('\nScript 2 : publication');
  await db.exec(read(path.join(process.env.L2_DIR, 'L2_2_publication_SEP26.sql')));
  const pub = (await db.query(`select division, status, locked, published_by::text from public.ranking_snapshots order by division`)).rows;
  check('3 instantanes publies et verrouilles', pub.length === 3 && pub.every((x) => x.status === 'published' && x.locked), pub.map((x) => `${x.division}:${x.status}`).join(' '));
  const anon = (await asRole(db, 'anon', null, `select (select count(*)::int from public.ranking_snapshots) s, (select count(*)::int from public.ranking_snapshot_entries) e`)).rows[0];
  const total = ['men', 'women', 'mixed'].reduce((s, d) => s + data.entries[d].length, 0);
  check('apres publication : visible du public', anon.s === 3 && anon.e === total, `${anon.s} instantanes, ${anon.e} lignes`);
  let blocked = false;
  try { await asRole(db, 'service_role', null, `update public.ranking_snapshot_entries set points = points + 1 where player_name = 'MATHIEU VALLET'`); } catch (e) { blocked = /verrouille/.test(e.message); }
  check('contenu publie non modifiable (meme service_role)', blocked);
  const log = (await db.query(`select action, count(*)::int n from public.ranking_audit_log group by action order by action`)).rows;
  check('journal : 3 generate, 3 validate, 3 publish', JSON.stringify(log) === JSON.stringify([{ action: 'generate', n: 3 }, { action: 'publish', n: 3 }, { action: 'validate', n: 3 }]), JSON.stringify(log));
  let again = false;
  try { await db.exec(read(path.join(process.env.L2_DIR, 'L2_1a_import_validation_HOMMES_SEP26.sql'))); } catch (e) { again = /revision/.test(e.message); }
  check('relancer l import par erreur est refuse (revision obligatoire)', again);

  console.log(`\nResultat : ${passed} controles OK, ${failures.length} echec(s).`);
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error('ERREUR :', e.message.slice(0, 2000)); process.exit(1); });
