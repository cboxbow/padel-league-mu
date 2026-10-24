/* eslint-disable no-console */
// Lot L2 : genere les scripts SQL qui figent le classement officiel de
// SEPTEMBRE 2026 (classeur "Padel League - RANKINGS - SEP 26.xlsx") TEL QUE
// DIFFUSE, comme instantane v1 de seeding des tournois d'OCTOBRE 2026.
//
// Entrees : WORKBOOK, RESOLVED (json des lignes rattachees aux fiches joueur),
//           WB_RESULTS + WB_META (feuilles resultat datees), ADMIN_ID, OUT_DIR.
// Sorties : L2_1_import_et_validation_SEP26.sql, L2_2_publication_SEP26.sql
// Aucune ecriture en base : les scripts sont executes par un admin dans
// l'editeur SQL de Supabase.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const XLSX = require('xlsx');

const env = process.env;
const ADMIN_ID = env.ADMIN_ID;
if (!/^[0-9a-f-]{36}$/.test(ADMIN_ID || '')) throw new Error('ADMIN_ID (uuid du profil admin) requis');
const resolved = JSON.parse(fs.readFileSync(env.RESOLVED, 'utf8'));
const wbResults = JSON.parse(fs.readFileSync(env.WB_RESULTS, 'utf8'));
const wbMeta = JSON.parse(fs.readFileSync(env.WB_META, 'utf8'));
const workbookHash = crypto.createHash('sha256').update(fs.readFileSync(env.WORKBOOK)).digest('hex');

const colKey = (s) => String(s || '').toUpperCase().replace(/\bARP\b/g, 'APR')
  .replace(/-\s*(MEN|WOMEN|WOME|WOM|MIXED)(-?\d)?\s*$/, '').replace(/[^A-Z0-9]/g, '');
const pk = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const DIV_SHEET = { men: /-\s*MEN(-\d)?\s*$/i, women: /-\s*WOME?N?(-\d)?\s*$/i, mixed: /MIXED/i };
const DIV_LABEL = { men: 'MEN', women: 'WOMEN', mixed: 'MIXED' };
const sqlText = (s) => `'${String(s).replace(/'/g, "''")}'`;

const out = { entries: {}, results: {}, notes: {}, stats: {} };
for (const division of ['men', 'women', 'mixed']) {
  const sheets = wbMeta.filter((m) => DIV_SHEET[division].test(m.sheet.trim()) && m.date);
  const sheetByCol = new Map(sheets.map((m) => [colKey(m.sheet), m]));
  const rows = resolved[division].filter((r) => r.points > 0);

  // Doublons d'identite : la ligne au plus fort total garde la fiche joueur.
  const byPlayer = new Map();
  for (const r of rows) if (r.player_id) { if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, []); byPlayer.get(r.player_id).push(r); }
  const duplicateOf = new Map();
  for (const list of byPlayer.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => b.points - a.points || a.rank - b.rank);
    for (const r of list.slice(1)) duplicateOf.set(r, list[0]);
  }

  const entries = []; const results = []; const unresolved = []; const duplicates = []; const missingCols = new Set();
  rows.forEach((r, i) => {
    const key = `${division}-${i + 1}`;
    let playerId = r.player_id; let note = null;
    if (duplicateOf.has(r)) {
      const main = duplicateOf.get(r);
      playerId = null; note = `Doublon de la ligne #${main.rank} ${main.name} (${main.points} pts) : meme joueur, identite scindee dans le classeur diffuse`;
      duplicates.push(`#${r.rank} ${r.name} (${r.points}) = #${main.rank} ${main.name} (${main.points})`);
    } else if (!playerId) {
      note = 'Sans fiche joueur dans la table players au moment du gel (nom tel que diffuse)';
      unresolved.push(`#${r.rank} ${r.name} (${r.points})`);
    }
    const cols = [...r.cols].sort((a, b) => b.points - a.points);
    entries.push({ k: key, player_id: playerId, player_name: r.name, rank: r.rank, previous_rank: r.previous_rank, points: r.points,
      results_counted: Math.min(8, cols.length), results_eligible: cols.length, identity_note: note });
    cols.forEach((c, j) => {
      const m = sheetByCol.get(colKey(c.col));
      if (!m) { missingCols.add(c.col); return; }
      const pos = wbResults.find((w) => w.sheet === m.sheet && (pk(w.player1) === pk(r.name) || pk(w.player2) === pk(r.name)));
      results.push({ k: key, player_id: playerId, tournament_id: m.tournament_id || null, event_name: c.col, event_date: m.date,
        category: (c.col.match(/^M\d+/) || ['?'])[0], position: pos ? String(pos.rank_label) : null, points: c.points,
        status: j < 8 ? 'counted' : 'excluded', reason: j < 8 ? `Top 8 (#${j + 1})` : `Au-dela des 8 meilleurs (#${j + 1})` });
    });
  });
  if (missingCols.size) throw new Error(`${division} : colonnes sans feuille datee : ${[...missingCols].join(', ')}`);
  out.entries[division] = entries; out.results[division] = results;
  out.stats[division] = { lignes: entries.length, avec_fiche: entries.filter((e) => e.player_id).length, sans_fiche: unresolved.length, doublons: duplicates.length, resultats: results.length };
  out.notes[division] = [
    `Classement officiel ${DIV_LABEL[division]} de septembre 2026 fige TEL QUE DIFFUSE (decision du 24/10/2026), reference de seeding des tournois d'octobre 2026.`,
    `Source : Padel League - RANKINGS - SEP 26.xlsx (sha256 ${workbookHash}).`,
    `Fenetre du classeur : 12 mois calendaires OCT 2025 -> SEP 2026, 8 meilleurs resultats, points des ex aequo en decimales comme diffuses.`,
    `${entries.length} lignes ; ${unresolved.length} sans fiche joueur ; ${duplicates.length} doublons d'identite conserves avec note.`,
    duplicates.length ? `Doublons : ${duplicates.join(' ; ')}.` : '',
    `Anomalies connues (audit du 24/10/2026, non corrigees dans cette version) : voir RAPPORT_AUDIT_SEPTEMBRE_ET_SEEDING.md et MPL_AUDIT_SEPTEMBRE_2026.xlsx` +
      (division === 'men' ? ' - notamment M250 CH 22/08 (5e/6e inverses : Dupont/Mamet vs Lyzhnikov/Shevchenko), M50 Urban GB 05/09 (ex aequo 5e, 7e, 11e decales), M25 LSC 06/06 (Paucot au lieu de Sinna).'
        : division === 'women' ? ' - notamment M25 RM GB 18/04 (Gebert/Zhivilo 11 au lieu de 6), M25 CH 24/01 (Laura Payet au lieu de Laura Gaspard).'
          : ' - notamment Florian Manson en double, Nathan Wong absent (90 pts M500 SPARC SEP 26).'),
  ].filter(Boolean).join('\n');
}

// ── Script 1 : un fichier par division (brouillon + contenu + validation) ───
// Donnees compactees en tableaux pour tenir dans l'editeur SQL :
//   ligne    = [n, player_id, nom, rang, rang_precedent, points, retenus, admissibles, note]
//   tournoi  = [nom_colonne, date, categorie, tournament_id]
//   resultat = [n, index_tournoi, place, points, ordre (1 = meilleur)]
const FILES = { men: 'L2_1a_import_validation_HOMMES_SEP26.sql', women: 'L2_1b_import_validation_DAMES_SEP26.sql', mixed: 'L2_1c_import_validation_MIXTE_SEP26.sql' };
fs.mkdirSync(env.OUT_DIR, { recursive: true });
for (const division of Object.keys(out.entries)) {
  const entryIndex = new Map(out.entries[division].map((e, i) => [e.k, i + 1]));
  const entryRows = out.entries[division].map((e, i) => [i + 1, e.player_id, e.player_name, e.rank, e.previous_rank, e.points, e.results_counted, e.results_eligible, e.identity_note]);
  const events = []; const eventIndex = new Map();
  const order = new Map();
  const resultRows = out.results[division].map((r) => {
    const ek = `${r.event_name}|${r.event_date}`;
    if (!eventIndex.has(ek)) { eventIndex.set(ek, events.length + 1); events.push([r.event_name, r.event_date, r.category, r.tournament_id]); }
    const n = entryIndex.get(r.k); order.set(n, (order.get(n) || 0) + 1);
    return [n, eventIndex.get(ek), r.position, r.points, order.get(n)];
  });
  const sql = `-- ============================================================================
-- MPL - LOT L2 (1/2) - ${DIV_LABEL[division]} : GEL DU CLASSEMENT OFFICIEL SEP 2026 (tel que diffuse)
-- ============================================================================
-- A executer dans l'editeur SQL de Supabase, APRES ranking_snapshots_l1_1_migration.sql.
-- Cree le brouillon ${DIV_LABEL[division]} "SEP 2026 -> tournois d'OCT 2026" (v1, source classeur),
-- charge ${entryRows.length} lignes et ${resultRows.length} resultats detailles, puis VALIDE (contenu fige).
-- Ne PUBLIE PAS : voir L2_2_publication_SEP26.sql. Tout ou rien.
-- Actions journalisees au nom du compte admin ${ADMIN_ID}.
-- Genere le ${new Date().toISOString().slice(0, 10)} par scripts/build-sep26-snapshot-import.cjs
-- ============================================================================
begin;
select set_config('request.jwt.claim.sub', '${ADMIN_ID}', true);
select set_config('request.jwt.claims', '${JSON.stringify({ sub: ADMIN_ID, role: 'authenticated' })}', true);

do $$
declare
  v_id uuid;
  v_res jsonb;
  v_entries jsonb := ${sqlText(JSON.stringify(entryRows))}::jsonb;
  v_events jsonb := ${sqlText(JSON.stringify(events))}::jsonb;
  v_results jsonb := ${sqlText(JSON.stringify(resultRows))}::jsonb;
begin
  v_id := public.create_ranking_snapshot_draft(
    ${sqlText(division)}, date '2026-09-01', date '2026-10-01', date '2026-09-30', date '2025-10-01', date '2026-09-30',
    ${sqlText(JSON.stringify({ max_results: 8, window: '12 mois calendaires (OCT 2025 - SEP 2026)', tie_points: 'decimales telles que diffusees', ranking: 'rangs tels que diffuses' }))}::jsonb,
    'workbook_import', 'Padel League - RANKINGS - SEP 26.xlsx', ${sqlText(`classeur sha256 ${workbookHash}`)},
    ${sqlText(out.notes[division])});

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
  if (select count(*) from tmp_map) <> jsonb_array_length(v_entries) then
    raise exception 'Correspondance des lignes incomplete';
  end if;

  insert into public.ranking_snapshot_results (snapshot_id, entry_id, player_id, tournament_id, event_name, event_date, category, position, points, status, reason)
  select v_id, m.entry_id, m.player_id, ev->>3, ev->>0, (ev->>1)::date, ev->>2, r->>2, (r->>3)::numeric,
         case when (r->>4)::int <= 8 then 'counted' else 'excluded' end,
         case when (r->>4)::int <= 8 then 'Top 8 (#' || (r->>4) || ')' else 'Au-dela des 8 meilleurs (#' || (r->>4) || ')' end
    from jsonb_array_elements(v_results) r
    join tmp_map m on m.n = (r->>0)::int
    cross join lateral (select v_events -> ((r->>1)::int - 1) as ev) e;
  if (select count(*) from public.ranking_snapshot_results where snapshot_id = v_id) <> jsonb_array_length(v_results) then
    raise exception 'Detail des resultats incomplet';
  end if;

  v_res := public.validate_ranking_snapshot(v_id);
  if not (v_res->>'ok')::boolean then
    raise exception 'Validation ${DIV_LABEL[division]} refusee : %', v_res;
  end if;
  raise notice '${DIV_LABEL[division]} : instantane % valide %', v_id, v_res;
  drop table tmp_map;
end $$;

select division, version, status, entries_count, left(checksum, 16) as checksum
  from public.ranking_snapshots where applicable_month = date '2026-10-01' and division = '${division}';
commit;
`;
  fs.writeFileSync(path.join(env.OUT_DIR, FILES[division]), sql);
}
const oldSingle = path.join(env.OUT_DIR, 'L2_1_import_et_validation_SEP26.sql');
if (fs.existsSync(oldSingle)) fs.unlinkSync(oldSingle);

// ── Script 2 : publication ──────────────────────────────────────────────────
const publish = `-- ============================================================================
-- MPL - LOT L2 (2/2) : PUBLICATION ET VERROUILLAGE DU CLASSEMENT SEP 2026
-- ============================================================================
-- A executer APRES verification du resultat de L2_1. Publie et verrouille les
-- 3 instantanes valides (Hommes, Dames, Mixte) pour les tournois d'octobre 2026.
-- Irreversible hors revision documentee (v2). Journalise au nom de ${ADMIN_ID}.
-- ============================================================================
begin;
select set_config('request.jwt.claim.sub', '${ADMIN_ID}', true);
select set_config('request.jwt.claims', '${JSON.stringify({ sub: ADMIN_ID, role: 'authenticated' })}', true);
${['men', 'women', 'mixed'].map((d) => `select public.publish_ranking_snapshot(
  (select id from public.ranking_snapshots where division = '${d}' and applicable_month = date '2026-10-01' and status = 'validated'),
  'PUBLIER ${DIV_LABEL[d]} 2026-10');`).join('\n')}
select division, version, status, locked, published_at, entries_count
  from public.ranking_snapshots where applicable_month = date '2026-10-01' order by division;
commit;
`;
fs.writeFileSync(path.join(env.OUT_DIR, 'L2_2_publication_SEP26.sql'), publish);
fs.writeFileSync(path.join(env.OUT_DIR, 'L2_donnees_SEP26.json'), JSON.stringify(out));
console.log(JSON.stringify(out.stats));
for (const f of [...Object.values(FILES), 'L2_2_publication_SEP26.sql']) console.log(f, (fs.statSync(path.join(env.OUT_DIR, f)).size / 1024).toFixed(0), 'Ko');
