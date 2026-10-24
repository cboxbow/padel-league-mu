/* eslint-disable no-console */
// Lot L4 (P3) : genere les scripts SQL qui figent un classement officiel
// mensuel TEL QUE DIFFUSE a partir de son classeur Excel (archives juin,
// juillet, aout 2026...). Meme methode que le gel de septembre (L2).
//
// N'ECRIT RIEN EN BASE. Lecture seule de la base (fiches joueur, dates des
// feuilles) avec la cle publique ; les scripts SQL produits sont executes
// par un admin, apres verification, dans l'editeur SQL de Supabase.
//
//   WORKBOOK=<classeur .xlsx> REFERENCE_MONTH=2026-06 ADMIN_ID=<uuid> OUT_DIR=<dossier>
//   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=...   (ou SIM_DIR=<json> hors ligne)
//   node scripts/build-workbook-snapshot-import.cjs
//
// Controles bloquants sur le classeur (avant tout SQL) :
//   - total de chaque ligne = somme de ses 8 meilleures colonnes (tolerance 0,01) ;
//   - colonnes de tournois toutes dans les 12 mois calendaires de la fenetre ;
//   - rangs coherents (plus de points => rang strictement meilleur ; memes points => meme rang).
// Identites : rattachement a une fiche joueur UNIQUEMENT sur correspondance
// exacte et unique du nom (prenom/nom dans les deux ordres) ; sinon ligne sans
// fiche, avec note. Jamais de fusion sur des noms approchants.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const XLSX = require('xlsx');
if (process.env.SIM_DIR) require('./sim/preload.cjs');
const { createClient } = require('@supabase/supabase-js');
const { monthlyWindow, nameKey } = require('./lib/mpl-ranking-engine.cjs');

const env = process.env;
const MONTH = env.REFERENCE_MONTH;
const ADMIN_ID = env.ADMIN_ID;
if (!/^\d{4}-\d{2}$/.test(MONTH || '') || !env.WORKBOOK || !env.OUT_DIR || !/^[0-9a-f-]{36}$/.test(ADMIN_ID || '')) {
  console.error('WORKBOOK, REFERENCE_MONTH (AAAA-MM), ADMIN_ID (uuid admin) et OUT_DIR sont requis.');
  process.exit(1);
}
const W = monthlyWindow(MONTH);
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const FR = ['JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE'];
const monthTag = `${MONTHS[Number(MONTH.slice(5)) - 1]}${MONTH.slice(2, 4)}`;
const monthFr = `${FR[Number(MONTH.slice(5)) - 1]} ${MONTH.slice(0, 4)}`;
const DIVS = { men: { re: /^RANKING\s*-?\s*MEN\s*$/i, label: 'HOMMES', code: 'MEN' }, women: { re: /^RANKING\s*-?\s*WOMEN\s*$/i, label: 'DAMES', code: 'WOMEN' }, mixed: { re: /^RANKING\s*-?\s*MIXED\s*$/i, label: 'MIXTE', code: 'MIXED' } };
const sqlText = (s) => `'${String(s).replace(/'/g, "''")}'`;
const colKey = (s) => String(s || '').toUpperCase().replace(/\bARP\b/g, 'APR').replace(/-\s*(MEN|WOMEN|WOME|WOM|MIXED)(-?\d)?\s*$/, '').replace(/[^A-Z0-9]/g, '');
const colMonth = (c) => { const m = String(c).toUpperCase().replace(/\bARP\b/g, 'APR').match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*(\d{2})\b/); return m ? `20${m[2]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}` : null; };

async function main() {
  const buf = fs.readFileSync(env.WORKBOOK);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const stat = fs.statSync(env.WORKBOOK);
  const wb = XLSX.read(buf);
  const hidden = (wb.Workbook?.Sheets || []).filter((s) => s.Hidden).map((s) => s.name);
  console.log(`Classeur ${path.basename(env.WORKBOOK)} : ${wb.SheetNames.length} feuilles, ${hidden.length} masquees, sha256 ${sha}, modifie le ${stat.mtime.toISOString()}`);
  console.log(`Classement de ${monthFr} : fenetre ${W.startIso} -> ${W.endIso}, inscriptions ${W.applicableMonth.slice(0, 7)}`);

  // Base (lecture seule) : fiches joueur et dates des feuilles resultat.
  const sb = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL || 'http://simulation', env.VITE_SUPABASE_ANON_KEY || 'simulation', { auth: { persistSession: false } });
  const fetchAll = async (table, cols, f = (q) => q) => { const out = []; for (let i = 0; ; i += 1000) { const { data, error } = await f(sb.from(table).select(cols)).range(i, i + 999); if (error) throw new Error(`${table}: ${error.message}`); out.push(...data); if (data.length < 1000) break; } return out; };
  const players = await fetchAll('players', 'id,first_name,last_name', (q) => q.order('id'));
  const byName = new Map();
  for (const p of players) for (const n of [`${p.first_name} ${p.last_name}`, `${p.last_name} ${p.first_name}`]) {
    const k = nameKey(n); if (!k) continue; if (!byName.has(k)) byName.set(k, new Set()); byName.get(k).add(p.id);
  }
  const hist = await fetchAll('historical_tournament_results', 'sheet_name,event_name,event_date,event_end_date', (q) => q.gte('event_date', W.startIso).lte('event_date', W.endIso).order('id'));
  const sheetDate = new Map();
  for (const h of hist) for (const nm of new Set([h.sheet_name, h.event_name].filter(Boolean))) { const k = colKey(nm); const d = h.event_end_date || h.event_date; const m = sheetDate.get(k) || new Map(); m.set(d, (m.get(d) || 0) + 1); sheetDate.set(k, m); }
  // Repli : dates des feuilles etablies par l'audit de septembre (WB_META, tableaux saisis via le site).
  if (env.WB_META) {
    for (const m of JSON.parse(fs.readFileSync(env.WB_META, 'utf8'))) {
      const k = colKey(m.sheet);
      if (m.date && !sheetDate.has(k)) sheetDate.set(k, new Map([[m.date, 1]]));
    }
  }
  const dateOf = (col) => { const m = sheetDate.get(colKey(col)); return m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : null; };

  const report = { classeur: path.basename(env.WORKBOOK), sha256: sha, modifie_le: stat.mtime.toISOString(), feuilles: wb.SheetNames.length, masquees: hidden, fenetre: `${W.startIso} -> ${W.endIso}`, divisions: {} };
  const files = [];
  for (const [division, cfg] of Object.entries(DIVS)) {
    const name = wb.SheetNames.find((n) => cfg.re.test(n.trim()));
    if (!name) throw new Error(`${division} : feuille de classement introuvable`);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    const h = rows.findIndex((r) => r.some((c) => /^RANK/i.test(String(c).trim())));
    const hdr = rows[h].map((c) => String(c).trim());
    const rankCols = hdr.map((c, i) => (/^RANK/i.test(c) ? i : -1)).filter((i) => i >= 0);
    const iName = hdr.findIndex((c) => /PLAYER|NAME/i.test(c));
    const iTotal = hdr.findIndex((c) => /TOTAL/i.test(c));
    const eventCols = hdr.map((c, i) => ({ c, i })).filter((x) => x.i > iTotal && x.c);
    const errors = []; const warnings = [];
    for (const e of eventCols) {
      const mo = colMonth(e.c);
      if (!mo) errors.push(`colonne sans mois : ${e.c}`);
      else if (`${mo}-01` < W.startIso || `${mo}-01` > W.endIso) errors.push(`colonne hors fenetre : ${e.c}`);
    }
    const lines = [];
    for (const r of rows.slice(h + 1)) {
      const nm = String(r[iName] || '').trim(); const total = Number(r[iTotal]) || 0;
      if (!nm || !(total > 0)) continue;
      const cols = eventCols.map((e) => ({ col: e.c, points: Number(r[e.i]) || 0 })).filter((x) => x.points > 0).sort((a, b) => b.points - a.points);
      const best8 = cols.slice(0, 8).reduce((s, x) => s + x.points, 0);
      if (Math.abs(best8 - total) >= 0.01) errors.push(`${nm} : total ${total} <> somme des 8 meilleurs ${best8}`);
      lines.push({ name: nm, rank: Number(r[rankCols[0]]), previous_rank: rankCols[1] != null && Number(r[rankCols[1]]) ? Number(r[rankCols[1]]) : null, points: total, cols });
    }
    // Coherence des rangs (regle d'un import tel que diffuse).
    const sorted = [...lines].sort((a, b) => b.points - a.points);
    for (let i = 1; i < sorted.length; i += 1) {
      const a = sorted[i - 1]; const b = sorted[i];
      if (a.points > b.points && !(a.rank < b.rank)) errors.push(`rang incoherent : ${a.name} ${a.points} (#${a.rank}) vs ${b.name} ${b.points} (#${b.rank})`);
      if (a.points === b.points && a.rank !== b.rank) errors.push(`ex aequo de rangs differents : ${a.name} #${a.rank} / ${b.name} #${b.rank} (${a.points})`);
    }
    // Identites : correspondance exacte et unique uniquement.
    const used = new Map();
    let noFiche = 0; let dup = 0;
    for (const l of lines.sort((a, b) => a.rank - b.rank || b.points - a.points)) {
      const ids = byName.get(nameKey(l.name));
      if (ids && ids.size === 1) {
        const id = [...ids][0];
        if (used.has(id)) { l.player_id = null; l.note = `Doublon de la ligne #${used.get(id).rank} ${used.get(id).name} : meme fiche joueur, identite scindee dans le classeur diffuse`; dup += 1; }
        else { l.player_id = id; used.set(id, l); }
      } else {
        l.player_id = null;
        l.note = ids && ids.size > 1 ? `Nom porte par ${ids.size} fiches joueur : rattachement a valider (tel que diffuse)` : 'Sans fiche joueur a nom identique (nom tel que diffuse)';
        noFiche += 1;
      }
    }
    // Detail : date de chaque colonne (feuille resultat en base) ; a defaut 1er jour du mois, signale.
    let approx = 0;
    for (const l of lines) for (const [j, c] of l.cols.entries()) {
      c.date = dateOf(c.col);
      if (!c.date) { c.date = `${colMonth(c.col)}-01`; c.approx = true; approx += 1; }
      c.status = j < 8 ? 'counted' : 'excluded';
      c.order = j + 1;
    }
    const approxCols = [...new Set(lines.flatMap((l) => l.cols.filter((c) => c.approx).map((c) => c.col)))];
    if (approxCols.length) warnings.push(`${approxCols.length} colonne(s) sans feuille resultat datee en base, date = 1er jour du mois : ${approxCols.join(', ')}`);
    report.divisions[division] = { feuille: name, lignes: lines.length, colonnes: eventCols.length, sans_fiche: noFiche, doublons: dup, dates_approximatives: approx, erreurs: errors, avertissements: warnings };
    console.log(`  ${cfg.label} : ${lines.length} lignes, ${eventCols.length} colonnes, ${noFiche} sans fiche, ${dup} doublons, ${errors.length} erreur(s), ${warnings.length} avertissement(s)`);
    if (errors.length) { for (const e of errors.slice(0, 20)) console.log(`     ERREUR ${e}`); continue; }

    // SQL (meme format que L2).
    const entryRows = lines.map((l, i) => [i + 1, l.player_id, l.name, l.rank, l.previous_rank, l.points, Math.min(8, l.cols.length), l.cols.length, l.note || null]);
    const events = []; const evIdx = new Map(); const resultRows = [];
    lines.forEach((l, i) => l.cols.forEach((c) => {
      const k = `${c.col}|${c.date}`;
      if (!evIdx.has(k)) { evIdx.set(k, events.length + 1); events.push([c.col, c.date, (c.col.match(/^M\d+/i) || ['?'])[0].toUpperCase(), null]); }
      resultRows.push([i + 1, evIdx.get(k), null, c.points, c.order]);
    }));
    const notes = [
      `Classement officiel ${cfg.label} de ${monthFr} fige TEL QUE DIFFUSE (archive, decision MPL du 24/10/2026), reference de seeding des tournois de sa periode de validite.`,
      `Source : ${path.basename(env.WORKBOOK)} (sha256 ${sha}, fichier modifie le ${stat.mtime.toISOString().slice(0, 16).replace('T', ' ')}).`,
      `Fenetre du classeur : 12 mois calendaires ${W.startIso} -> ${W.endIso}, 8 meilleurs resultats, points des ex aequo en decimales comme diffuses.`,
      `${lines.length} lignes ; ${noFiche} sans fiche joueur ; ${dup} doublons d'identite conserves avec note.`,
      warnings.length ? `Avertissements : ${warnings.join(' ; ')}.` : '',
      'Non reconstruit a partir des points actuels : contenu identique au classeur diffuse.',
    ].filter(Boolean).join('\n');
    const file = `L4_3_${monthTag}_${cfg.code}_import_validation.sql`;
    fs.mkdirSync(env.OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(env.OUT_DIR, file), `-- ============================================================================
-- MPL - LOT L4 (P3) - ${cfg.label} : ARCHIVE DU CLASSEMENT OFFICIEL DE ${monthFr} (tel que diffuse)
-- ============================================================================
-- Prerequis : ranking_snapshots_l4_validity_periods.sql (periode confirmee).
-- Cree le brouillon (v1, source classeur), charge ${entryRows.length} lignes et ${resultRows.length}
-- resultats, puis VALIDE. Ne publie pas : voir L4_4_${monthTag}_publication.sql. Tout ou rien.
-- Genere le ${new Date().toISOString().slice(0, 10)} par scripts/build-workbook-snapshot-import.cjs
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
    ${sqlText(division)}, date '${W.referenceMonth}', date '${W.applicableMonth}', date '${W.endIso}', date '${W.startIso}', date '${W.endIso}',
    ${sqlText(JSON.stringify({ max_results: 8, window: `12 mois calendaires (${W.startIso} - ${W.endIso})`, tie_points: 'decimales telles que diffusees', ranking: 'rangs tels que diffuses' }))}::jsonb,
    'workbook_import', ${sqlText(path.basename(env.WORKBOOK))}, ${sqlText(`classeur sha256 ${sha}`)}, ${sqlText(notes)});

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
         case when (r->>4)::int <= 8 then 'counted' else 'excluded' end,
         case when (r->>4)::int <= 8 then 'Top 8 (#' || (r->>4) || ')' else 'Au-dela des 8 meilleurs (#' || (r->>4) || ')' end
    from jsonb_array_elements(v_results) r
    join tmp_map m on m.n = (r->>0)::int
    cross join lateral (select v_events -> ((r->>1)::int - 1) as ev) e;
  if (select count(*) from public.ranking_snapshot_results where snapshot_id = v_id) <> jsonb_array_length(v_results) then raise exception 'Detail incomplet'; end if;

  v_res := public.validate_ranking_snapshot(v_id);
  if not (v_res->>'ok')::boolean then raise exception 'Validation ${cfg.label} refusee : %', v_res; end if;
  raise notice '${cfg.label} ${monthFr} : instantane % valide %', v_id, v_res;
  drop table tmp_map;
end $$;

select division, version, status, entries_count, left(checksum, 16) as checksum
  from public.ranking_snapshots where applicable_month = date '${W.applicableMonth}' and division = '${division}';
commit;
`);
    files.push(file);
  }
  const blocking = Object.values(report.divisions).some((d) => d.erreurs.length);
  const pub = `L4_4_${monthTag}_publication.sql`;
  if (!blocking) {
    fs.writeFileSync(path.join(env.OUT_DIR, pub), `-- ============================================================================
-- MPL - LOT L4 (P3) : PUBLICATION DE L'ARCHIVE ${monthFr} (Hommes, Dames, Mixte)
-- ============================================================================
-- APRES verification des instantanes valides. La publication fige la periode de
-- validite CONFIRMEE (ranking_validity_periods) ; refusee si elle est absente.
-- ============================================================================
begin;
select set_config('request.jwt.claim.sub', '${ADMIN_ID}', true);
select set_config('request.jwt.claims', '${JSON.stringify({ sub: ADMIN_ID, role: 'authenticated' })}', true);
${Object.entries(DIVS).map(([d, c]) => `select public.publish_ranking_snapshot(
  (select id from public.ranking_snapshots where division = '${d}' and applicable_month = date '${W.applicableMonth}' and status = 'validated'),
  'PUBLIER ${c.code} ${W.applicableMonth.slice(0, 7)}');`).join('\n')}
select division, version, status, locked, validity_start, validity_end, entries_count
  from public.ranking_snapshots where applicable_month = date '${W.applicableMonth}' order by division;
commit;
`);
    files.push(pub);
  }
  fs.mkdirSync(env.OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(env.OUT_DIR, `L4_3_${monthTag}_verification.json`), JSON.stringify(report, null, 1));
  console.log(blocking ? 'ECHEC : controles bloquants, aucun SQL de publication genere' : `Fichiers : ${files.join(', ')}`);
  if (blocking) process.exitCode = 2;
}

main().catch((e) => { console.error('ECHEC :', e.message); process.exit(1); });
