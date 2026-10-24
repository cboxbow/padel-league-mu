/* eslint-disable no-console */
// Lot L3 : genere le classement officiel de seeding du mois M (regle du
// 2026-10-24 : finales du 1er jour du mois M-11 au dernier jour du mois M,
// 8 meilleurs resultats ; reference des tournois du mois M+1).
//
// N'ECRIT RIEN EN BASE. Produit dans OUT_DIR :
//   - APERCU_<M>.xlsx : classement, mouvements vs mois precedent, controles ;
//   - <M>_1x_import_validation_<DIV>.sql : brouillon + lignes + detail + validation ;
//   - <M>_2_publication.sql : publication et verrouillage (apres verification).
// Les scripts SQL sont executes par un admin dans l'editeur SQL de Supabase.
//
//   RANKING_MONTH=2026-10 ADMIN_ID=<uuid> OUT_DIR=<dossier>
//   [DIVISIONS=men,women,mixed] [REVISION_REASON="..."]   (si le mois est deja publie)
//   SUPABASE_URL=... (VITE_SUPABASE_ANON_KEY suffit : lecture seule)
//   node scripts/generate-monthly-snapshot.cjs
//   Hors ligne : SIM_DIR=<json> (faux client de scripts/sim).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const XLSX = require('xlsx');
if (process.env.SIM_DIR) require('./sim/preload.cjs');
const { createClient } = require('@supabase/supabase-js');
const { monthlyWindow, nameKey } = require('./lib/mpl-ranking-engine.cjs');

const env = process.env;
const MONTH = env.RANKING_MONTH;
const ADMIN_ID = env.ADMIN_ID;
const OUT = env.OUT_DIR;
const DIVS = (env.DIVISIONS || 'men,women,mixed').split(',').map((d) => d.trim()).filter(Boolean);
const LABEL = { men: 'HOMMES', women: 'DAMES', mixed: 'MIXTE', junior: 'JUNIOR' };
if (!MONTH || !OUT || !/^[0-9a-f-]{36}$/.test(ADMIN_ID || '')) {
  console.error('RANKING_MONTH (AAAA-MM), ADMIN_ID (uuid admin) et OUT_DIR sont requis.');
  process.exit(1);
}
const W = monthlyWindow(MONTH);
const sqlText = (s) => `'${String(s).replace(/'/g, "''")}'`;
const monthTag = MONTH.replace('-', '_');
const confirmMonth = W.applicableMonth.slice(0, 7);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`Classement du mois ${MONTH} : finales du ${W.startIso} au ${W.endIso} (inscriptions ${confirmMonth})`);

  // ── 1. Calcul par le moteur de production (simulation, aucune ecriture) ──
  const tmpOut = path.join(OUT, `.calcul_${monthTag}.json`);
  const childEnv = { ...env, DRY_RUN: '1', RANKING_MONTH: MONTH, RANKING_DIVISIONS: DIVS.join(','), DRY_RUN_OUT: tmpOut };
  const args = [...(env.SIM_DIR ? ['-r', path.join(__dirname, 'sim', 'preload.cjs')] : []), path.join(__dirname, 'recalculate-rankings-from-results.cjs')];
  const run = spawnSync(process.execPath, args, { env: childEnv, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) { console.error(run.stdout, run.stderr); throw new Error('Calcul du classement en echec'); }
  const calcLog = run.stdout.split('\n').filter((l) => /Date de reference|Tableau en double|lignes joueurs|Lecture/.test(l)).map((l) => l.trim());
  calcLog.forEach((l) => console.log(`  ${l}`));
  const rows = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
  const period = JSON.parse(fs.readFileSync(`${tmpOut}.period.json`, 'utf8'));
  fs.unlinkSync(tmpOut); fs.unlinkSync(`${tmpOut}.period.json`);
  if (!period.monthly || period.startIso !== W.startIso || period.endIso !== W.endIso) throw new Error(`Fenetre inattendue : ${JSON.stringify(period)}`);

  // ── 2. Mois precedent publie (lecture publique) et mois cible deja publie ? ──
  const sb = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL || 'http://simulation', env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY || 'simulation', { auth: { persistSession: false } });
  const prevApplicable = W.referenceMonth; // l'instantane du mois M-1 s'applique au mois M
  // Periode de validite (lot L4) : tournois dont la DATE DE DEBUT tombe dans la periode.
  // La publication est refusee en base tant qu'elle n'est pas CONFIRMEE.
  const perRes = await sb.from('ranking_validity_periods').select('*').eq('reference_month', W.referenceMonth);
  const validity = (!perRes.error && perRes.data && perRes.data[0]) || null;
  const periodLabel = validity
    ? `${validity.validity_start} -> ${validity.validity_end} (${validity.status === 'confirmed' ? 'confirmee' : 'PROVISOIRE'})`
    : 'NON SAISIE';
  console.log(`  Periode de validite : tournois commencant ${periodLabel}`);
  if (!validity || validity.status !== 'confirmed') console.log("  ATTENTION : la publication sera refusee tant que la periode n'est pas confirmee (set_ranking_validity_period).");
  const fetchSnapshot = async (applicable, division) => {
    const { data, error } = await sb.from('ranking_snapshots').select('id,division,version,status,checksum,applicable_month')
      .eq('applicable_month', applicable).eq('division', division).eq('status', 'published');
    if (error) throw new Error(`ranking_snapshots : ${error.message}`);
    return (data || [])[0] || null;
  };
  const fetchEntries = async (snapshotId) => {
    const out = [];
    for (let i = 0; ; i += 1000) {
      const { data, error } = await sb.from('ranking_snapshot_entries').select('player_id,player_name,rank,points').eq('snapshot_id', snapshotId).order('rank').range(i, i + 999);
      if (error) throw new Error(`ranking_snapshot_entries : ${error.message}`);
      out.push(...data); if (data.length < 1000) break;
    }
    return out;
  };

  // Tableaux commences les 2 derniers jours d'un mois-frontiere (fin du mois
  // M-12 : peut entrer dans la fenetre ; fin du mois M : peut en sortir) sans
  // date de finale renseignee -> compte au jour du tableau, a verifier.
  const hasCol = async (t, c) => !(await sb.from(t).select(c).limit(1)).error;
  const edge = new Set();
  const lastDays = (iso) => { const d = new Date(`${iso}T12:00:00Z`); const a = new Date(d); a.setUTCDate(d.getUTCDate() - 1); return [a.toISOString().slice(0, 10), iso]; };
  const prevEnd = new Date(`${W.startIso}T12:00:00Z`); prevEnd.setUTCDate(0);
  const histEnd = await hasCol('historical_tournament_results', 'event_end_date');
  const tourEnd = await hasCol('tournaments', 'end_date');
  for (const [from, to] of [lastDays(prevEnd.toISOString().slice(0, 10)), lastDays(W.endIso)]) {
    const h = await sb.from('historical_tournament_results').select(`event_name,event_date${histEnd ? ',event_end_date' : ''}`).gte('event_date', from).lte('event_date', to);
    if (h.error) throw new Error(`historical_tournament_results : ${h.error.message}`);
    for (const r of h.data) if (!r.event_end_date) edge.add(`${r.event_date} ${r.event_name}`);
    const t = await sb.from('tournaments').select(`id,name,tournament_date${tourEnd ? ',end_date' : ''}`).gte('tournament_date', from).lte('tournament_date', to);
    if (t.error) throw new Error(`tournaments : ${t.error.message}`);
    for (const r of t.data) if (!r.end_date) edge.add(`${r.tournament_date} ${r.name} (${r.id})`);
  }
  if (edge.size) console.log(`  ${edge.size} tableau(x) commence(s) en fin de mois-frontiere sans date de finale : a verifier`);

  const engineVersion = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(__dirname, 'recalculate-rankings-from-results.cjs')))
    .update(fs.readFileSync(path.join(__dirname, 'lib', 'mpl-ranking-engine.cjs'))).digest('hex');
  const sheets = { SYNTHESE: [], MOUVEMENTS: [], CONTROLES: [] };
  const sqlFiles = [];

  for (const [i, division] of DIVS.entries()) {
    const list = rows.filter((r) => r.division === division).sort((a, b) => a.rank - b.rank || a.player_name.localeCompare(b.player_name));
    const prevSnap = await fetchSnapshot(prevApplicable, division);
    const prevEntries = prevSnap ? await fetchEntries(prevSnap.id) : [];
    const prevById = new Map(prevEntries.filter((e) => e.player_id).map((e) => [e.player_id, e]));
    const prevByName = new Map(prevEntries.map((e) => [nameKey(e.player_name), e]));
    const existing = await fetchSnapshot(W.applicableMonth, division);
    if (existing && !env.REVISION_REASON) {
      throw new Error(`${division} : un classement est deja publie pour ${confirmMonth} (v${existing.version}). Fournir REVISION_REASON pour creer une revision.`);
    }

    // Controles d'integrite (avant tout SQL).
    const checks = [];
    const ids = new Map();
    let noFiche = 0;
    const entries = list.map((r, n) => {
      const counted = r.details.filter((d) => d.is_retained);
      const sum = counted.reduce((s, d) => s + Number(d.points), 0);
      if (Math.abs(sum - Number(r.points)) >= 0.01) checks.push({ Division: LABEL[division], Controle: 'total = 8 meilleurs', Joueur: r.player_name, Detail: `${r.points} vs ${sum}` });
      if (counted.length > 8) checks.push({ Division: LABEL[division], Controle: 'maximum 8 resultats', Joueur: r.player_name, Detail: `${counted.length}` });
      for (const d of counted) if (d.reference_date < W.startIso || d.reference_date > W.endIso) checks.push({ Division: LABEL[division], Controle: 'fenetre', Joueur: r.player_name, Detail: `${d.event_name} ${d.reference_date}` });
      if (r.player_id) { if (ids.has(r.player_id)) checks.push({ Division: LABEL[division], Controle: 'joueur en double', Joueur: r.player_name, Detail: ids.get(r.player_id) }); ids.set(r.player_id, r.player_name); } else noFiche += 1;
      const prev = (r.player_id && prevById.get(r.player_id)) || prevByName.get(nameKey(r.player_name)) || null;
      return { n: n + 1, r, prev, counted };
    });
    for (const e of edge) checks.push({ Division: LABEL[division], Controle: 'date de finale a verifier', Joueur: '', Detail: `${e} : commence en fin de mois, finale non renseignee (comptee le jour meme)` });
    const blocking = checks.filter((c) => c.Controle !== 'date de finale a verifier');
    if (blocking.length) { console.error(blocking); throw new Error(`${division} : controles d'integrite en echec`); }

    // Mouvements vs mois precedent.
    const moves = entries.map(({ r, prev }) => ({ Division: LABEL[division], Rang: r.rank, Joueur: r.player_name, Points: r.points, 'Rang precedent': prev ? prev.rank : 'nouveau', 'Points precedents': prev ? Number(prev.points) : '', Evolution: prev ? prev.rank - r.rank : '' }));
    sheets[`CLASSEMENT_${LABEL[division]}`] = moves;
    const known = new Set(entries.filter((e) => e.prev).map((e) => (e.prev.player_id || nameKey(e.prev.player_name))));
    const exits = prevEntries.filter((p) => !known.has(p.player_id || nameKey(p.player_name)));
    const ups = moves.filter((m) => typeof m.Evolution === 'number').sort((a, b) => b.Evolution - a.Evolution);
    sheets.MOUVEMENTS.push(...ups.slice(0, 15).map((m) => ({ ...m, Sens: 'hausse' })), ...ups.slice(-15).reverse().map((m) => ({ ...m, Sens: 'baisse' })),
      ...moves.filter((m) => m['Rang precedent'] === 'nouveau').slice(0, 30).map((m) => ({ ...m, Sens: 'entree' })),
      ...exits.slice(0, 30).map((p) => ({ Division: LABEL[division], Rang: '', Joueur: p.player_name, Points: '', 'Rang precedent': p.rank, 'Points precedents': Number(p.points), Evolution: '', Sens: 'sortie' })));
    sheets.CONTROLES.push(...checks);
    sheets.SYNTHESE.push({ Division: LABEL[division], 'Mois de reference': MONTH, 'Inscriptions': confirmMonth, 'Valable pour les tournois commencant': periodLabel, 'Finales du': W.startIso, au: W.endIso,
      Joueurs: list.length, 'Sans fiche joueur': noFiche, 'Mois precedent publie': prevSnap ? `v${prevSnap.version} (${prevEntries.length} joueurs)` : 'aucun',
      Entrees: moves.filter((m) => m['Rang precedent'] === 'nouveau').length, Sorties: exits.length, 'Dates de finale a verifier': edge.size,
      Revision: existing ? `v${existing.version + 1} (motif : ${env.REVISION_REASON})` : 'v1' });

    // ── SQL : brouillon + lignes + detail + validation ──
    const entryRows = entries.map(({ n, r, prev }) => [n, r.player_id || null, r.player_name, r.rank, prev ? prev.rank : null, Number(r.points),
      Math.min(8, r.details.filter((d) => d.is_retained).length), r.details.length, r.player_id ? null : 'Sans fiche joueur : rattachement par le nom (calcul moteur)']);
    const events = []; const eventIndex = new Map(); const resultRows = [];
    for (const { n, r } of entries) {
      r.details.forEach((d, j) => {
        const key = `${d.event_name}|${d.reference_date}|${d.tournament_id || ''}`;
        if (!eventIndex.has(key)) { eventIndex.set(key, events.length + 1); events.push([d.event_name, d.reference_date, d.category || '?', d.tournament_id || null]); }
        resultRows.push([n, eventIndex.get(key), d.rank_label || (d.rank && d.rank < 999 ? `#${d.rank}` : null), Number(d.points), d.is_retained ? 1 : 0, j + 1]);
      });
    }
    const notes = [
      `Classement officiel ${LABEL[division]} du mois ${MONTH}, calcule par le moteur (regle du 24/10/2026) : finales du ${W.startIso} au ${W.endIso}, 8 meilleurs resultats, date de reference = jour de la finale.`,
      `Reference de seeding des tournois commencant ${periodLabel} (inscriptions ${confirmMonth}). ${list.length} joueurs, ${noFiche} sans fiche joueur (note d'identite).`,
      edge.size ? `Dates de finale a verifier : ${[...edge].join(' ; ')}.` : '',
      existing ? `Revision de la v${existing.version} : ${env.REVISION_REASON}` : '',
    ].filter(Boolean).join('\n');
    const file = `${monthTag}_1${String.fromCharCode(97 + i)}_import_validation_${LABEL[division]}.sql`;
    fs.writeFileSync(path.join(OUT, file), `-- ============================================================================
-- MPL - CLASSEMENT OFFICIEL ${MONTH} (${LABEL[division]}) -> tournois commencant ${periodLabel}
-- ============================================================================
-- Genere par scripts/generate-monthly-snapshot.cjs (moteur sha256 ${engineVersion.slice(0, 16)}...).
-- Cree le brouillon, charge ${entryRows.length} lignes et ${resultRows.length} resultats, puis VALIDE.
-- Ne publie pas : voir ${monthTag}_2_publication.sql. Tout ou rien.
-- Journalise au nom du compte admin ${ADMIN_ID}.
-- ============================================================================
begin;
select set_config('request.jwt.claim.sub', '${ADMIN_ID}', true);
select set_config('request.jwt.claims', '${JSON.stringify({ sub: ADMIN_ID, role: 'authenticated' })}', true);

do $$
declare
  v_id uuid;
  v_res jsonb;
  v_prev uuid;
  v_entries jsonb := ${sqlText(JSON.stringify(entryRows))}::jsonb;
  v_events jsonb := ${sqlText(JSON.stringify(events))}::jsonb;
  v_results jsonb := ${sqlText(JSON.stringify(resultRows))}::jsonb;
begin
  select id into v_prev from public.ranking_snapshots
   where division = ${sqlText(division)} and applicable_month = date '${W.applicableMonth}' and status = 'published';
  if v_prev is not null and ${existing ? 'false' : 'true'} then
    raise exception 'Un classement est deja publie pour ce mois : regenerer avec REVISION_REASON';
  end if;
  v_id := public.create_ranking_snapshot_draft(
    ${sqlText(division)}, date '${W.referenceMonth}', date '${W.applicableMonth}', date '${W.endIso}', date '${W.startIso}', date '${W.endIso}',
    ${sqlText(JSON.stringify({ max_results: 8, window: '12 mois calendaires', reference_date: 'jour de la finale', decided: '2026-10-24' }))}::jsonb,
    'engine', 'scripts/recalculate-rankings-from-results.cjs', ${sqlText(engineVersion)}, ${sqlText(notes)},
    v_prev, ${existing ? sqlText(env.REVISION_REASON) : 'null'});

  create temporary table tmp_map (n int primary key, entry_id bigint, player_id uuid) on commit drop;
  with src as (
    select (x->>0)::int n, nullif(x->>1, '')::uuid player_id, x->>2 player_name, (x->>3)::int rank, (x->>4)::int previous_rank,
           (x->>5)::numeric points, (x->>6)::int results_counted, (x->>7)::int results_eligible, x->>8 identity_note
      from jsonb_array_elements(v_entries) x
  ), ins as (
    insert into public.ranking_snapshot_entries (snapshot_id, player_id, player_name, rank, previous_rank, points, results_counted, results_eligible, identity_note)
    select v_id, player_id, player_name, rank, previous_rank, points, results_counted, results_eligible, identity_note from src
    returning entry_id, player_name, rank, points
  )
  insert into tmp_map (n, entry_id, player_id)
  select s.n, i.entry_id, s.player_id from src s join ins i on i.player_name = s.player_name and i.rank = s.rank and i.points = s.points;
  if (select count(*) from tmp_map) <> jsonb_array_length(v_entries) then raise exception 'Correspondance des lignes incomplete'; end if;

  insert into public.ranking_snapshot_results (snapshot_id, entry_id, player_id, tournament_id, event_name, event_date, category, position, points, status, reason)
  select v_id, m.entry_id, m.player_id, ev->>3, ev->>0, (ev->>1)::date, ev->>2, r->>2, (r->>3)::numeric,
         case when (r->>4)::int = 1 then 'counted' else 'excluded' end,
         case when (r->>4)::int = 1 then 'Top 8 (#' || (r->>5) || ')' else 'Au-dela des 8 meilleurs (#' || (r->>5) || ')' end
    from jsonb_array_elements(v_results) r
    join tmp_map m on m.n = (r->>0)::int
    cross join lateral (select v_events -> ((r->>1)::int - 1) as ev) e;
  if (select count(*) from public.ranking_snapshot_results where snapshot_id = v_id) <> jsonb_array_length(v_results) then raise exception 'Detail incomplet'; end if;

  v_res := public.validate_ranking_snapshot(v_id);
  if not (v_res->>'ok')::boolean then raise exception 'Validation refusee : %', v_res; end if;
  raise notice '${LABEL[division]} ${MONTH} : instantane % valide %', v_id, v_res;
  drop table tmp_map;
end $$;

select division, version, status, entries_count, checksum_version, left(checksum, 16) as checksum
  from public.ranking_snapshots where applicable_month = date '${W.applicableMonth}' and division = ${sqlText(division)} order by version;
commit;
`);
    sqlFiles.push(file);
    console.log(`  ${LABEL[division]} : ${list.length} joueurs (${noFiche} sans fiche), ${resultRows.length} resultats, mois precedent ${prevSnap ? `v${prevSnap.version}` : 'absent'}, ${edge.size} date(s) de finale a verifier`);
  }

  // ── Publication ──
  const pubFile = `${monthTag}_2_publication.sql`;
  fs.writeFileSync(path.join(OUT, pubFile), `-- ============================================================================
-- MPL - PUBLICATION DU CLASSEMENT OFFICIEL ${MONTH} -> tournois commencant ${periodLabel}
-- ============================================================================
-- A executer APRES verification des instantanes valides. Irreversible hors
-- revision documentee. Journalise au nom de ${ADMIN_ID}.
-- ============================================================================
begin;
select set_config('request.jwt.claim.sub', '${ADMIN_ID}', true);
select set_config('request.jwt.claims', '${JSON.stringify({ sub: ADMIN_ID, role: 'authenticated' })}', true);
${DIVS.map((d) => `select public.publish_ranking_snapshot(
  (select id from public.ranking_snapshots where division = '${d}' and applicable_month = date '${W.applicableMonth}' and status = 'validated'),
  'PUBLIER ${d.toUpperCase()} ${confirmMonth}');`).join('\n')}
select division, version, status, locked, published_at, entries_count
  from public.ranking_snapshots where applicable_month = date '${W.applicableMonth}' order by division, version;
commit;
`);

  // ── Apercu Excel ──
  const wb = XLSX.utils.book_new();
  for (const [name, data] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ Info: 'Aucune ligne' }]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, path.join(OUT, `APERCU_${monthTag}.xlsx`));
  console.log(`\nFichiers : APERCU_${monthTag}.xlsx, ${sqlFiles.join(', ')}, ${pubFile}`);
}

main().catch((e) => { console.error('ECHEC :', e.message); process.exit(1); });
