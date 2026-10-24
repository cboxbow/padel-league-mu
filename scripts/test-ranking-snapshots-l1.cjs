/* eslint-disable no-console */
// Banc de test du lot L1 (instantanes de seeding) sur une COPIE locale :
// PostgreSQL embarque (PGlite) + rôles/fonction auth facon Supabase + vraies
// donnees (JSON) + ranking_snapshots_l1_migration.sql. Ne touche a aucune base distante.
//
//   npm i --no-save @electric-sql/pglite@0.5.8   (ou PGLITE_PATH=<dossier node_modules/@electric-sql/pglite>)
//   SNAPSHOT_DIR=<json: players, tournaments, registrations>  WORKBOOK=<RANKINGS SEP 26.xlsx>
//   node scripts/test-ranking-snapshots-l1.cjs

const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const { PGlite } = require(process.env.PGLITE_PATH || '@electric-sql/pglite');
const { nameKey } = require('./lib/mpl-ranking-engine.cjs');

const SNAP = process.env.SNAPSHOT_DIR;
const load = (n) => JSON.parse(fs.readFileSync(path.join(SNAP, `${n}.json`), 'utf8'));
const ADMIN = '00000000-0000-0000-0000-00000000a001';
const ADMIN2 = '00000000-0000-0000-0000-00000000a002';
const USER = '00000000-0000-0000-0000-00000000b001';
let passed = 0; const failures = [];

async function main() {
  const db = new PGlite();

  // ── Socle facon Supabase ────────────────────────────────────────────────
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create table public.profiles (id uuid primary key, email text, full_name text, role text);
    create table public.players (id uuid primary key, first_name text, last_name text, gender text, division text, license_no text, active boolean, user_id uuid, created_at timestamptz);
    create table public.tournaments (id text primary key, name text, club_name text, tournament_date date, date date, region text, category text, division text, tournament_type text, status text, max_teams int);
    create table public.registrations (id uuid primary key, tournament_id text, team_id uuid, seed int, confirmed boolean, registered_at timestamptz, player1_name text, player2_name text, division text, club_name text, checked_in boolean, withdrawn boolean, withdrawal_reason text);
    create table public.player_registration_requests (id uuid primary key default gen_random_uuid(), tournament_id text, player1_name text, player2_name text, player1_rank int, player2_rank int, status text default 'pending');
    -- Droits par defaut de Supabase sur le schema public (la migration doit les restreindre).
    grant all on all tables in schema public to anon, authenticated, service_role;
    -- Comme Supabase : toute nouvelle table/fonction/sequence du schema public est
    -- ouverte par defaut a anon, authenticated et service_role.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  await db.query(`insert into public.profiles values ($1,'admin@mpl','Admin 1','admin'), ($2,'admin2@mpl','Admin 2','superadmin'), ($3,'joueur@mpl','Joueur',null)`, [ADMIN, ADMIN2, USER]);

  // ── Copie des donnees reelles ───────────────────────────────────────────
  const players = load('players');
  for (let i = 0; i < players.length; i += 500) {
    const chunk = players.slice(i, i + 500);
    await db.query(`insert into public.players select * from json_populate_recordset(null::public.players, $1)`, [JSON.stringify(chunk)]);
  }
  await db.query(`insert into public.tournaments select * from json_populate_recordset(null::public.tournaments, $1)`, [JSON.stringify(load('tournaments'))]);
  await db.query(`insert into public.registrations select * from json_populate_recordset(null::public.registrations, $1)`, [JSON.stringify(load('registrations'))]);
  const counts = (await db.query(`select (select count(*) from players) p, (select count(*) from tournaments) t, (select count(*) from registrations) r`)).rows[0];
  console.log(`Copie de test : ${counts.p} joueurs, ${counts.t} tournois, ${counts.r} inscriptions`);

  // ── Migration L1 (2 fois : elle doit etre rejouable) ────────────────────
  const migration = fs.readFileSync(path.join(__dirname, '..', 'ranking_snapshots_l1_migration.sql'), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  console.log('Migration L1 appliquee deux fois sans erreur.');
  const l11 = path.join(__dirname, '..', 'ranking_snapshots_l1_1_migration.sql');
  if (fs.existsSync(l11)) { await db.exec(fs.readFileSync(l11, 'utf8')); await db.exec(fs.readFileSync(l11, 'utf8')); console.log('Complement L1.1 applique deux fois sans erreur.'); }

  // ── Outils ─────────────────────────────────────────────────────────────
  const as = async (role, uid, sql, params = []) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`);
    try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
  };
  const ok = async (label, fn) => {
    try { const r = await fn(); passed += 1; console.log(`  OK   ${label}`); return r; } catch (e) { failures.push(`${label} : ${e.message}`); console.log(`  ECHEC ${label} : ${e.message}`); return null; }
  };
  const ko = async (label, fn, expect) => {
    try { await fn(); failures.push(`${label} : aurait du echouer`); console.log(`  ECHEC ${label} : aurait du echouer`); } catch (e) {
      if (expect && !new RegExp(expect, 'i').test(e.message)) { failures.push(`${label} : erreur inattendue (${e.message})`); console.log(`  ECHEC ${label} : ${e.message}`); return; }
      passed += 1; console.log(`  OK   ${label} -> refuse (${e.message.split('\n')[0].slice(0, 90)})`);
    }
  };
  const draft = (uid, month = '2026-10-01', extra = {}) => as('authenticated', uid,
    `select public.create_ranking_snapshot_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) id`,
    ['men', '2026-09-01', month, '2026-09-30', '2025-10-01', '2026-09-30', JSON.stringify({ max_results: 8, window: '12 mois calendaires', tie_rounding: 'ceil' }),
     extra.source || 'workbook_import', 'Padel League - RANKINGS - SEP 26.xlsx', null, extra.notes || null, extra.revisionOf || null, extra.reason || null]);

  // Contenu realiste : classement Hommes SEP 26 du classeur, joueurs rattaches a une fiche.
  const byName = new Map();
  for (const p of players) for (const n of [`${p.first_name} ${p.last_name}`, `${p.last_name} ${p.first_name}`]) {
    const k = nameKey(n); if (!byName.has(k)) byName.set(k, new Set()); byName.get(k).add(p.id);
  }
  const wb = XLSX.readFile(process.env.WORKBOOK, { sheets: ['RANKING - MEN'] });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['RANKING - MEN'], { header: 1, defval: '' }).slice(1).filter((r) => Number(r[3]) > 0);
  const seen = new Set(); const entries = [];
  for (const r of rows) {
    const ids = [...(byName.get(nameKey(String(r[2]).trim())) || [])];
    if (ids.length !== 1 || seen.has(ids[0])) continue;
    seen.add(ids[0]);
    entries.push({ player_id: ids[0], player_name: String(r[2]).trim(), points: Math.ceil(Number(r[3]) - 1e-9), previous_rank: Number(r[1]) || null, results_counted: 8, results_eligible: 8 });
  }
  entries.sort((a, b) => b.points - a.points);
  entries.forEach((e, i) => { e.rank = i > 0 && entries[i - 1].points === e.points ? entries[i - 1].rank : i + 1; e.results_counted = 0; e.results_eligible = 0; });
  console.log(`Contenu de test : ${entries.length} joueurs du classement Hommes SEP 26 rattaches a une fiche (sur ${rows.length}).`);
  const insertEntries = (uid, snapshotId, list) => as('authenticated', uid,
    `insert into public.ranking_snapshot_entries (snapshot_id, player_id, player_name, rank, previous_rank, points, results_counted, results_eligible)
     select $1, player_id, player_name, rank, previous_rank, points, results_counted, results_eligible from json_populate_recordset(null::public.ranking_snapshot_entries, $2)`,
    [snapshotId, JSON.stringify(list)]);

  console.log('\n1. Droits de creation');
  await ko('anon ne peut pas creer de brouillon', () => as('anon', null, `select public.create_ranking_snapshot_draft('men','2026-09-01','2026-10-01','2026-09-30','2025-10-01','2026-09-30','{}','engine')`), 'permission denied');
  await ko('joueur connecte non admin ne peut pas creer de brouillon', () => draft(USER), 'administrateurs');
  await ko('insertion directe d un instantane deja publie (meme service_role)', () => as('service_role', null,
    `insert into public.ranking_snapshots (division, reference_month, applicable_month, cutoff_date, window_start, window_end, source, status, locked, checksum, validated_at, published_at) values ('men','2026-09-01','2026-10-01','2026-09-30','2025-10-01','2026-09-30','engine','published',true,'x',now(),now())`), 'brouillon');
  const v1 = (await ok('admin cree le brouillon SEP 26 -> OCT 2026 (v1)', () => draft(ADMIN)))?.rows[0].id;
  await ko('second brouillon du meme mois sans motif de revision', () => draft(ADMIN), 'revision');

  console.log('\n2. Contenu du brouillon et visibilite');
  await ok(`admin ajoute ${entries.length} lignes`, () => insertEntries(ADMIN, v1, entries));
  await ko('un meme joueur deux fois dans l instantane', () => insertEntries(ADMIN, v1, [entries[0]]), 'duplicate key|unique');
  await ko('joueur non admin ne peut pas ajouter de ligne', () => insertEntries(USER, v1, [{ ...entries[0], player_id: entries[1].player_id }]), 'row-level security|permission');
  await ok('anon ne voit pas le brouillon', async () => { const r = await as('anon', null, `select count(*)::int n from public.ranking_snapshots`); if (r.rows[0].n !== 0) throw new Error(`voit ${r.rows[0].n} instantane(s)`); });
  await ok('anon ne voit pas les lignes du brouillon', async () => { const r = await as('anon', null, `select count(*)::int n from public.ranking_snapshot_entries`); if (r.rows[0].n !== 0) throw new Error(`voit ${r.rows[0].n} lignes`); });
  await ok('admin voit le brouillon', async () => { const r = await as('authenticated', ADMIN, `select count(*)::int n from public.ranking_snapshots where id=$1`, [v1]); if (r.rows[0].n !== 1) throw new Error('invisible'); });

  console.log('\n3. Validation');
  await ok('rang volontairement faux -> validation refusee avec motif', async () => {
    await as('authenticated', ADMIN, `update public.ranking_snapshot_entries set rank = rank + 1 where snapshot_id=$1 and rank = 1`, [v1]);
    const r = await as('authenticated', ADMIN, `select public.validate_ranking_snapshot($1) res`, [v1]);
    if (r.rows[0].res.ok !== false) throw new Error('validation acceptee');
    await as('authenticated', ADMIN, `update public.ranking_snapshot_entries set rank = 1 where snapshot_id=$1 and rank = 2 and points = (select max(points) from public.ranking_snapshot_entries where snapshot_id=$1)`, [v1]);
  });
  await ko('changement de statut direct sans passer par la fonction (service_role)', () => as('service_role', null, `update public.ranking_snapshots set status='validated' where id=$1`, [v1]), 'uniquement via');
  const val = await ok('admin valide (controles OK, somme de controle calculee)', async () => {
    const r = await as('authenticated', ADMIN, `select public.validate_ranking_snapshot($1) res`, [v1]);
    if (!r.rows[0].res.ok) throw new Error(JSON.stringify(r.rows[0].res.errors)); return r.rows[0].res;
  });
  if (val) console.log(`       ${val.entries} lignes, somme de controle ${String(val.checksum).slice(0, 16)}...`);
  await ko('contenu fige apres validation (ajout de ligne)', () => insertEntries(ADMIN, v1, [{ ...entries[0], player_id: players.find((p) => !seen.has(p.id)).id }]), 'verrouille');
  await ko('contenu fige apres validation (modification de points, service_role)', () => as('service_role', null, `update public.ranking_snapshot_entries set points = points + 1 where snapshot_id=$1`, [v1]), 'verrouille');

  console.log('\n4. Publication et verrouillage');
  await ko('publication avec un mauvais mot de confirmation', () => as('authenticated', ADMIN, `select public.publish_ranking_snapshot($1,'PUBLIER')`, [v1]), 'Confirmation invalide');
  await ok('regle des deux personnes activable', async () => {
    await db.exec(`update public.ranking_settings set value='true' where key='require_two_person_publication'`);
    try { await as('authenticated', ADMIN, `select public.publish_ranking_snapshot($1,'PUBLIER MEN 2026-10')`, [v1]); throw new Error('le validateur a pu publier'); } catch (e) { if (!/deux personnes/.test(e.message)) throw e; }
    await db.exec(`update public.ranking_settings set value='false' where key='require_two_person_publication'`);
  });
  await ok('publication par un admin avec le bon mot "PUBLIER MEN 2026-10"', () => as('authenticated', ADMIN2, `select public.publish_ranking_snapshot($1,'PUBLIER MEN 2026-10') res`, [v1]));
  await ko('suppression d une ligne publiee (service_role)', () => as('service_role', null, `delete from public.ranking_snapshot_entries where snapshot_id=$1`, [v1]), 'verrouille');
  await ko('suppression de l instantane publie (service_role)', () => as('service_role', null, `delete from public.ranking_snapshots where id=$1`, [v1]), 'suppression interdite');
  await ko('modification de la somme de controle publiee (service_role)', () => as('service_role', null, `update public.ranking_snapshots set checksum='falsifie' where id=$1`, [v1]), 'verrouill');
  await ko('modification de la fenetre de calcul publiee (service_role)', () => as('service_role', null, `update public.ranking_snapshots set window_start='2025-09-01' where id=$1`, [v1]), 'verrouill');
  await ok('anon voit l instantane publie et ses lignes', async () => {
    const r = await as('anon', null, `select (select count(*)::int from public.ranking_snapshots) s, (select count(*)::int from public.ranking_snapshot_entries) e`);
    if (r.rows[0].s !== 1 || r.rows[0].e !== entries.length) throw new Error(JSON.stringify(r.rows[0]));
  });
  await ko('anon ne peut pas ecrire dans les lignes publiees', () => as('anon', null, `update public.ranking_snapshot_entries set points = 0`), 'permission denied');

  console.log('\n5. Revision documentee');
  await ko('revision sans motif', () => draft(ADMIN, '2026-10-01', { revisionOf: v1 }), 'motif|revision');
  const v2 = (await ok('revision v2 avec motif', () => draft(ADMIN, '2026-10-01', { revisionOf: v1, reason: 'Identites reunies (Sookia, Soohinesh...) - decision Commission' })))?.rows[0].id;
  await ok('v2 : contenu corrige, validation, publication', async () => {
    const fixed = entries.map((e) => ({ ...e }));
    await insertEntries(ADMIN, v2, fixed);
    const r = await as('authenticated', ADMIN, `select public.validate_ranking_snapshot($1) res`, [v2]);
    if (!r.rows[0].res.ok) throw new Error(JSON.stringify(r.rows[0].res));
    await as('authenticated', ADMIN, `select public.publish_ranking_snapshot($1,'PUBLIER MEN 2026-10')`, [v2]);
  });
  await ok('v1 conservee au statut "superseded", une seule version publiee', async () => {
    const r = await db.query(`select version, status from public.ranking_snapshots order by version`);
    const st = r.rows.map((x) => `v${x.version}:${x.status}`).join(' ');
    if (st !== 'v1:superseded v2:published') throw new Error(st);
  });
  await ok('anon voit v1 (archive) et v2', async () => { const r = await as('anon', null, `select count(*)::int n from public.ranking_snapshots`); if (r.rows[0].n !== 2) throw new Error(String(r.rows[0].n)); });

  console.log('\n6. Reference de seeding des tournois');
  await ko('affecter un instantane non publie (v1 remplace)', () => as('authenticated', ADMIN, `select public.assign_tournament_seeding('t263h','men',$1)`, [v1]), 'publie');
  await ok('M500 Moka Rangers Hommes (31/10) -> instantane d octobre v2', () => as('authenticated', ADMIN, `select public.assign_tournament_seeding('t263h','men',$1)`, [v2]));
  await ko('tournoi de novembre avec l instantane d octobre sans motif', () => as('authenticated', ADMIN, `select public.assign_tournament_seeding('t217h','men',$1)`, [v2]), 'motif obligatoire');
  await ko('division incoherente (instantane Hommes pour un tableau Dames)', () => as('authenticated', ADMIN, `select public.assign_tournament_seeding('t264f','women',$1)`, [v2]), 'Division');
  await ko('changement direct de la reference sans motif (service_role)', () => as('service_role', null, `update public.tournament_seeding_references set snapshot_id=$1 where tournament_id='t263h'`, [v1]), 'sans motif');
  await ko('suppression de la reference d un tournoi', () => as('service_role', null, `delete from public.tournament_seeding_references`), 'suppression interdite');
  await ko('retrait d un instantane utilise par un tournoi', () => as('authenticated', ADMIN, `select public.withdraw_ranking_snapshot($1,'test')`, [v2]), 'utilise par des tournois');

  console.log('\n7. Journal d audit');
  await ok('chaque action est journalisee', async () => {
    const r = await db.query(`select action, count(*)::int n from public.ranking_audit_log group by action order by action`);
    const m = Object.fromEntries(r.rows.map((x) => [x.action, x.n]));
    for (const a of ['generate', 'validate', 'validate_rejected', 'publish', 'assign_seeding']) if (!m[a]) throw new Error(`action ${a} absente : ${JSON.stringify(m)}`);
    console.log(`       ${JSON.stringify(m)}`);
  });
  await ko('anon ne lit pas le journal', () => as('anon', null, `select * from public.ranking_audit_log`), 'permission denied');
  await ok('joueur connecte non admin : journal vide', async () => { const r = await as('authenticated', USER, `select count(*)::int n from public.ranking_audit_log`); if (r.rows[0].n !== 0) throw new Error(String(r.rows[0].n)); });
  await ko('effacement du journal (service_role)', () => as('service_role', null, `delete from public.ranking_audit_log`), 'ajout seul');

  console.log('\n8. Non-regression des tables existantes');
  await ok('inscriptions existantes intactes, nouvelles colonnes vides', async () => {
    const r = await db.query(`select count(*)::int n, count(seeding_snapshot_id)::int s, count(team_weight)::int w from public.registrations`);
    if (r.rows[0].n !== counts.r || r.rows[0].s !== 0 || r.rows[0].w !== 0) throw new Error(JSON.stringify(r.rows[0]));
  });
  await ok('les droits existants sur registrations ne sont pas modifies', async () => {
    await as('anon', null, `select count(*) from public.registrations`);
  });

  console.log('\n9. Retour arriere');
  await ok('rollback L1 puis reapplication', async () => {
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'ranking_snapshots_l1_rollback.sql'), 'utf8'));
    const r = await db.query(`select to_regclass('public.ranking_snapshots') t, (select count(*)::int from public.registrations) n`);
    if (r.rows[0].t !== null || r.rows[0].n !== counts.r) throw new Error(JSON.stringify(r.rows[0]));
    await db.exec(migration);
  });

  console.log(`\nResultat : ${passed} controles OK, ${failures.length} echec(s).`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error('ERREUR :', e.message); process.exit(1); });
