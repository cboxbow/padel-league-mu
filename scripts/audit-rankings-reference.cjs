/* eslint-disable no-console */
// Audit DRY RUN du Ranking MPL : construit un classement de reference
// independant et le compare a ce qui est publie / exporte. N'ECRIT RIEN en base.
//
// Sources de reference :
//   1. Feuilles tournoi du classeur federal (resultats officiels valides).
//   2. Tournois presents uniquement en base (posterieurs au classeur).
//
// Usage :
//   SNAPSHOT_DIR=<dossier json> WORKBOOK=<RANKINGS xlsx> APP_XLSX=<APP xlsx>
//   CSV_DIR=<dossier csv> OUT_DIR=<sortie> RANKING_REF=2026-10-24
//   node scripts/audit-rankings-reference.cjs
// SNAPSHOT_DIR contient les tables Supabase en JSON (historical_tournament_results,
// tournament_results, players, tournaments, rankings, official_ranking_details).

const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const engine = require('./lib/mpl-ranking-engine.cjs');

const { normKey, nameKey, isoDate, bandPoints } = engine;
const env = process.env;
const REF = env.RANKING_REF || '2026-10-24';
const SNAP = env.SNAPSHOT_DIR;
const OUT = env.OUT_DIR;
const DIVS = ['men', 'women', 'mixed'];
const DIV_LABEL = { men: 'Hommes', women: 'Dames', mixed: 'Mixte' };
const load = (name) => JSON.parse(fs.readFileSync(path.join(SNAP, `${name}.json`), 'utf8'));
const log = [];
const audit = (msg) => { log.push({ at: new Date().toISOString(), message: msg }); console.log(msg); };

// ── Alias de noms deja valides dans le script de production ────────────────
const recalcSource = fs.readFileSync(path.join(__dirname, 'recalculate-rankings-from-results.cjs'), 'utf8');
const ALIASES = new Map([...recalcSource.matchAll(/^\s*\['([^']+)',\s*'([^']+)'\],?$/gm)].map(m => [normKey(m[1]), normKey(m[2])]));
// Variantes d'orthographe PROPOSEES par l'audit (a valider avant toute
// fusion en base) : chacune est prouvee par une ligne de resultat identique
// (meme tableau, meme rang, meme partenaire) publiee sous deux noms.
const PROPOSED_ALIASES = [
  ['KEITH LOOONG', 'KEITH LIOONG', 'SPARC M100 12/09/2026 #1 avec Fabrice Nayna'],
  ['KEITH LIONG', 'KEITH LIOONG', 'RM PC M50 26/04 #4 avec Gary Lan ; RM T M50 19/04 #4 avec Darren Li'],
  ['PIERRE DUPREY', 'PIERRE-HUGO DUPEY', 'M500 RM T 17/01 #9 avec Matteo Hoffmann'],
  ['LULU ULCQ', 'LULU ULCOQ', 'MCG M100 11/07 #1 ; Oxygen M100 18/07 #3'],
  ['LUCA NAVARINI', 'LUCA NAVARRINI', 'SPARC M1000 14/03 #25 avec Leonardo Navarrini'],
  ['ENZO VERREN', 'ENZO VEEREN', 'Isla M50 21/03 #6 ; Isla M100 18/04 #21'],
  ['AMAURY DESVAUX', 'A R AMAURY DESVAUX DE MARIGNY', 'RM GB M50 24/05 #5 avec Zaid Jeewon'],
  ['ERIC HOCHEDZ', 'ERIC HOCHEDEZ', 'CH M25 24/01 #4 ; RM H M25 07/02 #4'],
  ['YAZ RUBALLY', 'YAZ RUJBALLY', 'RM GB M25 18/04 #4 avec Theo Fanchette'],
  ['SEBASTIEN PIVEEAU', 'SEBASTIEN TIPVEAU', 'RM GB M1000 06/06 #37 avec Patrice Perraudin'],
  ['KUNAL SEWNATH', 'SURENDRA KUNAL SEWNAUTH', 'Isla M250 23/05 #23 avec Enzo Veeren'],
  ['CYRIL ARMAGOS', 'CYRIL AMARGOS', 'RM GB M1000 06/06 #31-32 avec Marc Goupille'],
  ['SIMI BONJUN', 'SIMI BUNJUN', 'RM A M100 Dames 15/02 #10 avec Sandrine Marot'],
  ['MICHELLE HENRI', 'MICHELE HENRI', 'CH M25 Dames 24/01 #2 avec Roxane Gallet (PDF officiel : MICHELLE HENRI)'],
  ['ANNA ZHMILO', 'ANNA ZHIVILO', 'RM GB M25 Dames 18/04 #5 avec Geraldine Gebert (PDF officiel : ANNA ZHIVILO)'],
  ['OLEG AL', 'OLEG GREBENNIKOV', 'SPARC Mixte 06/09 #13 avec Alesia Drokova (nom tronque dans le classeur)'],
  ['SAV LOVINO', 'SAV IOVINO', 'Urban GB M50 05/09 #13'],
  ['GIOGIO LOVINO', 'GIORGIO IOVINO', 'Urban GB M50 05/09 #13'],
];
for (const [from, to] of PROPOSED_ALIASES) ALIASES.set(normKey(from), normKey(to));
const canonical = (name) => ALIASES.get(normKey(name)) || normKey(name);

// ── Clubs : cle stable (les libelles varient entre sources) ────────────────
function clubKey(value) {
  const k = normKey(value);
  const rules = [
    [/ISLA/, 'ISLA'], [/SPARC|CASCAVELLE/, 'SPARC'], [/HENNESSY|\bRM H\b/, 'RM H'], [/PORT CHAMBLY|\bRM PC\b/, 'RM PC'],
    [/AZURI|\bRM A\b/, 'RM A'], [/TAMARIN|\bRM T\b/, 'RM T'], [/GRAND BAIE/, k.includes('URBAN') ? 'URBAN GB' : 'RM GB'],
    [/\bRM GB\b/, 'RM GB'], [/LABOURDONNAIS|\bLSC\b/, 'LSC'], [/CANA/, 'CANA'], [/BLACK RIVER|URBAN BR/, k.includes('CLUB HOUSE') ? 'CH' : 'URBAN BR'],
    [/CLUB HOUSE|^CH$/, 'CH'], [/MONT CHOISY|\bMCG\b/, 'MCG'], [/TERRES BRUNES|^TB$/, 'TB'], [/OXYGEN/, 'OXYGEN'],
    [/ENERGIA/, 'ENERGIA'], [/CLUB MED|\bCMA\b/, 'CMA'], [/MOKA RANGERS|^MR$/, 'MR'], [/URBAN/, 'URBAN GB'],
  ];
  for (const [re, key] of rules) if (re.test(k)) return key;
  return k;
}
const catKey = (value, division) => (division === 'mixed' ? 'MIXED' : normKey(value).replace(/\s+/g, ''));

// ── Joueurs ─────────────────────────────────────────────────────────────────
const players = load('players');
const playerById = new Map(players.map(p => [p.id, p]));
const byName = new Map();
for (const p of players) {
  for (const n of [`${p.first_name} ${p.last_name}`, `${p.last_name} ${p.first_name}`]) {
    const k = nameKey(canonical(n));
    if (!byName.has(k)) byName.set(k, new Set());
    byName.get(k).add(p.id);
  }
}
const identityIssues = [];
const identitySeen = new Set();
function resolvePlayer(name, idHint, context) {
  const display = String(name ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (idHint && playerById.has(idHint)) return { key: idHint, id: idHint, name: display };
  const ids = [...(byName.get(nameKey(canonical(name))) || [])];
  if (ids.length === 1) return { key: ids[0], id: ids[0], name: display };
  const issueKey = `${nameKey(name)}|${ids.length}`;
  if (!identitySeen.has(issueKey)) {
    identitySeen.add(issueKey);
    identityIssues.push({
      type: ids.length > 1 ? 'AMBIGU (plusieurs fiches joueur)' : 'NON RATTACHE (aucune fiche joueur)',
      name: display, candidates: ids.map(id => { const p = playerById.get(id); return `${p.first_name} ${p.last_name} (${p.license_no})`; }).join(' / '),
      first_seen_in: context,
    });
  }
  return { key: `NOM:${nameKey(canonical(name))}`, id: null, name: display };
}

// ── 1. Classeur federal ─────────────────────────────────────────────────────
function parseWorkbook(file) {
  const wb = XLSX.readFile(file);
  const historical = load('historical_tournament_results');
  const tournaments = load('tournaments');
  const sheetDates = new Map();
  for (const r of historical) {
    if (!r.sheet_name || !r.event_date) continue;
    const k = r.sheet_name.trim();
    if (!sheetDates.has(k)) sheetDates.set(k, new Map());
    sheetDates.get(k).set(r.event_date, (sheetDates.get(k).get(r.event_date) || 0) + 1);
  }
  const MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  const rows = [];
  const sheets = [];
  for (const name of wb.SheetNames) {
    if (/^RANKING/i.test(name)) continue;
    const m = name.toUpperCase().match(/^(M\d+)\s*-?\s*(.*?)\s*-\s*([A-Z]{3})\s+(\d{2})\s*-\s*([A-Z0-9]+)/);
    if (!m) { sheets.push({ sheet: name, status: 'nom non reconnu' }); continue; }
    const divRaw = m[5];
    const division = /MIX/.test(divRaw) ? 'mixed' : /WOM/.test(divRaw) ? 'women' : /MEN/.test(divRaw) ? 'men' : 'junior';
    if (!DIVS.includes(division)) continue;
    const yy = 2000 + Number(m[4]);
    const mon = MON[m[3]];
    const club = clubKey(m[2]);
    const category = catKey(m[1], division);
    let date = [...(sheetDates.get(name.trim()) || new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    let dateSource = date ? 'historique.sheet_name' : '';
    if (!date) {
      const cands = tournaments.filter(t => t.date && t.status !== 'cancelled'
        && Number(t.date.slice(0, 4)) === yy && Number(t.date.slice(5, 7)) === mon
        && clubKey(t.club_name) === club && catKey(t.category, division) === category
        && (division === 'mixed' ? t.division === 'mixed' : t.division === division));
      if (cands.length === 1) { date = cands[0].date; dateSource = `calendrier ${cands[0].id}`; }
    }
    // Feuilles hors de toute fenetre possible : inutile d'aller plus loin.
    if (yy < 2025 || (yy === 2025 && mon < 9)) continue;
    const data = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    const hdr = (data[0] || []).map(h => String(h).toUpperCase().trim());
    const iR = hdr.indexOf('RANK'); const i1 = hdr.indexOf('PLAYER 1'); const i2 = hdr.indexOf('PLAYER 2'); const iP = hdr.indexOf('POINTS');
    sheets.push({ sheet: name, division, category, club, date, date_source: dateSource || 'INTROUVABLE', teams: data.length - 1, status: iR < 0 || i1 < 0 || iP < 0 ? 'colonnes manquantes' : 'ok' });
    if (iR < 0 || i1 < 0 || iP < 0 || !date) continue;
    for (const r of data.slice(1)) {
      const label = String(r[iR]).trim();
      if (!label && !r[i1]) continue;
      const [a] = label.split('-').map(Number);
      for (const [pi, partner] of [[i1, i2], [i2, i1]]) {
        const pname = String(r[pi] ?? '').trim();
        if (!pname) continue;
        rows.push({ source: 'classeur', sheet: name, event_name: name, event_date: date, division, category, club, rank_label: label, rank_min: a || null, points: Number(r[iP]) || 0, raw_points: Number(r[iP]) || 0, player_name: pname, partner_name: String(r[partner] ?? '').trim() });
      }
    }
  }
  return { rows, sheets };
}

// ── 2. Base : historique + resultats site ───────────────────────────────────
function dbRows() {
  const rows = [];
  for (const r of load('historical_tournament_results')) {
    const division = r.division === 'mixed' ? 'mixed' : r.division;
    if (!DIVS.includes(division)) continue;
    for (const [n, id, partner] of [[r.player1_name, r.player1_id, r.player2_name], [r.player2_name, r.player2_id, r.player1_name]]) {
      if (!String(n ?? '').trim()) continue;
      rows.push({ source: `historique (${r.source_file || '?'})`, table: 'historical', row_id: r.id, event_name: r.event_name, event_date: isoDate(r.event_date), division, category: catKey(r.category, division), club: clubKey(r.club_name), rank_label: r.rank_label || (r.rank_min ? `#${r.rank_min}` : ''), rank_min: r.rank_min, points: Number(r.points) || 0, player_name: n, player_id_hint: id, partner_name: partner });
    }
  }
  for (const r of load('tournament_results')) {
    const division = r.division === 'mixed' ? 'mixed' : r.division;
    if (!DIVS.includes(division)) continue;
    for (const [n, id, partner] of [[r.player1_name, r.player1_id, r.player2_name], [r.player2_name, r.player2_id, r.player1_name]]) {
      if (!String(n ?? '').trim()) continue;
      rows.push({ source: 'resultats site', table: 'tournament_results', row_id: r.id, tournament_id: r.tournament_id, event_name: r.tournament_name, event_date: isoDate(r.tournament_date), division, category: catKey(r.category, division), club: clubKey(r.club_name), rank_label: `#${r.rank}`, rank_min: r.rank, points: Number(r.points) || 0, player_name: n, player_id_hint: id, partner_name: partner });
    }
  }
  return rows;
}

// Feuilles du classeur contredites par le document officiel publie (PDF/JPG
// du dossier RESULTS) : pour ces tableaux, la reference prend les lignes de
// la base, conformes au document officiel.
const OFFICIAL_DOCUMENT_OVERRIDES = new Map([
  ['M250 CH - AUG 26 - MEN', 'PDF "M250 CH - AUG 26 - MEN RESULTS.pdf" : Dupont/Mamet 5e (63), Lyzhnikov/Shevchenko 6e (25) - le classeur inverse les deux equipes'],
  ['M50 URBAN GB - SEP 26 - MEN', 'Feuille officielle "M 50 MEN URBAN SPORT GBAIE 5 SEPT.jpg" : ex aequo 5e (28), 7e (24), 11e (14) - le classeur decale ces equipes d une place'],
  ['M25 LSC - JUN 26 - MEN', 'PDF "M25 LSC - JUN 26 - MEN RESULTS.pdf" : 3e Romain Da Silva / Christopher Sinna (16) - le classeur indique David Paucot'],
  ['M25 - CH - JAN 26 - WOMEN', 'PDF "11 M25 CH - JAN 26 - WOMEN RESULTS.pdf" : 3e Laura Gaspard / Prune Maingard (12) - le classeur indique Laura Payet'],
  ['M25 RM GB - APR 26 - WOMEN', 'PDF "M25 RM GB - APR 26 - WOMEN RESULTS.pdf" : 5e Geraldine Gebert / Anna Zhivilo (6) - le classeur indique 11 points'],
]);

// Lignes isolees attribuees au mauvais homonyme, corrigees d'apres le
// document officiel du tableau.
const OFFICIAL_ROW_FIXES = [
  { division: 'men', category: 'M25', club: 'LSC', date: '2026-06-06', table: 'tournament_results', name: 'NICOLAS REY', playerId: 'ceff90f4-55b6-492c-ac56-e1b83bdd23dc', reason: 'PDF "M25 LSC - JUN 26 - MEN RESULTS.pdf" : 8e NICOLAS REY (2) / Gregory Stacherski - la saisie site pointe sur l homonyme Nicolas Rey (MPL0000174) au lieu de Rey (2) (MPL0001389)' },
];

const dayGap = (a, b) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000;

function main() {
  if (!SNAP || !OUT || !env.WORKBOOK) {
    console.error('SNAPSHOT_DIR, WORKBOOK et OUT_DIR sont requis.');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const window = engine.rankingWindow(REF);
  audit(`Date de reference ${REF} - fenetre ${window.startIso} -> ${window.endIso} (bornes incluses)`);
  const wb = parseWorkbook(env.WORKBOOK);
  const wbRows = wb.rows.filter(r => r.event_date >= window.startIso && r.event_date <= window.endIso && !OFFICIAL_DOCUMENT_OVERRIDES.has(r.sheet));
  audit(`Classeur federal : ${wb.sheets.length} feuilles seniors lues, ${wbRows.length} lignes joueur dans la fenetre`);
  for (const [sheet, reason] of OFFICIAL_DOCUMENT_OVERRIDES) audit(`Correction par document officiel - ${sheet} : ${reason}`);
  const lastWbDate = wbRows.reduce((m, r) => (r.event_date > m ? r.event_date : m), '');

  // Evenements couverts par le classeur.
  const wbEvents = new Map();
  for (const r of wbRows) wbEvents.set(`${r.division}|${r.category}|${r.club}|${r.event_date}`, r.sheet);
  const coveredByWorkbook = (r) => {
    for (const k of wbEvents.keys()) {
      const [d, c, club, date] = k.split('|');
      if (d === r.division && c === r.category && club === r.club && dayGap(date, r.event_date) <= 3) return true;
    }
    return false;
  };
  const db = dbRows().filter(r => r.event_date && r.event_date >= window.startIso && r.event_date <= window.endIso);
  for (const fix of OFFICIAL_ROW_FIXES) {
    for (const r of db) {
      if (r.table === fix.table && r.division === fix.division && r.category === fix.category && r.club === fix.club && r.event_date === fix.date && normKey(r.player_name) === normKey(fix.name)) {
        r.player_id_hint = fix.playerId;
        r.player_name = `${playerById.get(fix.playerId).first_name} ${playerById.get(fix.playerId).last_name}`;
        audit(`Correction ligne : ${fix.reason}`);
      }
    }
  }
  const dbOnly = db.filter(r => !coveredByWorkbook(r));
  // Un seul jeu de lignes par tableau : la table qui a le plus d'equipes.
  const byEvent = new Map();
  for (const r of dbOnly) {
    const k = `${r.division}|${r.category}|${r.club}|${r.event_date}`;
    if (!byEvent.has(k)) byEvent.set(k, { historical: [], tournament_results: [] });
    byEvent.get(k)[r.table].push(r);
  }
  const dbOnlyChosen = [];
  const dbOnlyEvents = [];
  const overriddenEvents = wb.rows.filter(r => OFFICIAL_DOCUMENT_OVERRIDES.has(r.sheet));
  for (const [k, v] of byEvent) {
    const [division, category, club, date] = k.split('|');
    // Tableaux corriges par document officiel : la saisie site (conforme au
    // document) prime sur l'import Excel de l'historique (qui reprend l'erreur).
    const overridden = overriddenEvents.some(r => r.division === division && r.category === category && r.club === club && dayGap(r.event_date, date) <= 3);
    const pick = overridden && v.tournament_results.length
      ? 'tournament_results'
      : v.historical.length >= v.tournament_results.length ? 'historical' : 'tournament_results';
    dbOnlyChosen.push(...v[pick]);
    dbOnlyEvents.push({ event: k, name: v[pick][0].event_name, source: pick, player_rows: v[pick].length, other_table_rows: v[pick === 'historical' ? 'tournament_results' : 'historical'].length });
  }
  audit(`Base : ${db.length} lignes joueur dans la fenetre, dont ${dbOnly.length} sur des tableaux absents du classeur (${byEvent.size} tableaux, dernier tableau du classeur : ${lastWbDate})`);

  const refInput = [...wbRows, ...dbOnlyChosen].map((r) => {
    const p = resolvePlayer(r.player_name, r.player_id_hint, `${r.event_name} (${r.event_date})`);
    return { ...r, player_key: p.key, player_id: p.id, player_name: p.id ? `${playerById.get(p.id).first_name} ${playerById.get(p.id).last_name}`.toUpperCase() : p.name, club_name: r.club, event_id: `${r.division}|${r.category}|${r.club}|${r.event_date}` };
  });
  const dedupEvents = engine.dropDuplicatedEvents(refInput);
  const dedupPlayers = engine.dropDuplicatedPlayerRows(dedupEvents.kept);
  const removedRows = [...dedupEvents.removed, ...dedupPlayers.removed];
  audit(`Dedoublonnage : ${dedupEvents.removed.length} lignes de tableaux en double, ${dedupPlayers.removed.length} lignes joueur en double dans un meme tableau`);
  const reference = engine.computeRankings(dedupPlayers.kept, { refIso: REF });

  // ── Publie (Supabase rankings) / CSV / APP ────────────────────────────────
  const published = load('rankings').filter(r => DIVS.includes(r.division === 'mixte' ? 'mixed' : r.division));
  const csvDir = env.CSV_DIR;
  const readCsv = (div) => {
    if (!csvDir) return [];
    const file = fs.readdirSync(csvDir).find(f => f.startsWith(`mpl2026_rankings_${div === 'mixed' ? 'mixte' : div}_`) && f.endsWith('(1).csv'));
    if (!file) return [];
    const lines = fs.readFileSync(path.join(csvDir, file), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
    const head = lines[0].split(',');
    return lines.slice(1).map(l => Object.fromEntries(l.split(',').map((v, i) => [head[i], v])));
  };
  const app = env.APP_XLSX ? XLSX.readFile(env.APP_XLSX) : null;
  const appRows = (div) => (app ? XLSX.utils.sheet_to_json(app.Sheets[{ men: 'MEN', women: 'WOMEN', mixed: 'MIXED' }[div]], { header: 1 }).map(r => ({ rank: r[0], name: String(r[1] ?? ''), points: Number(r[2]) || 0 })) : []);

  const sheets = {};
  const pointDiffs = [];
  const rankDiffs = [];
  const summary = [];
  for (const div of DIVS) {
    const ref = reference.rows.filter(r => r.division === div);
    const pub = published.filter(r => (r.division === 'mixte' ? 'mixed' : r.division) === div);
    const csv = readCsv(div);
    const appList = appRows(div);
    const index = (list, keyFn) => { const m = new Map(); for (const x of list) { const k = keyFn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
    const pubById = index(pub.filter(r => r.player_id), r => r.player_id);
    const pubByName = index(pub, r => nameKey(canonical(r.player_name)));
    const csvByName = index(csv, r => nameKey(canonical(r.player_name)));
    const appByName = index(appList, r => nameKey(canonical(r.name)));
    const usedPub = new Set();
    const lines = ref.map((r) => {
      const pubRow = (r.player_id && pubById.get(r.player_id)?.[0]) || pubByName.get(nameKey(canonical(r.player_name)))?.[0];
      if (pubRow) usedPub.add(pubRow);
      const names = [r.player_name, ...(r.player_id ? [`${playerById.get(r.player_id).last_name} ${playerById.get(r.player_id).first_name}`] : [])];
      const csvRow = names.map(n => csvByName.get(nameKey(canonical(n)))?.[0]).find(Boolean);
      const appRow = names.map(n => appByName.get(nameKey(canonical(n)))?.[0]).find(Boolean);
      return {
        'Player ID': r.player_id || '', 'Player Name': r.player_name, Category: DIV_LABEL[div],
        'Eligible Results': r.eligible_results, 'Counted Results': r.counted_results, 'Excluded Results': r.excluded_results,
        'Calculated Points': r.points, 'Calculated Rank': r.rank,
        'Published Points': pubRow ? Number(pubRow.points) : '', 'Published Rank': pubRow ? Number(pubRow.rank) : '',
        'APP Points': appRow ? appRow.points : '', 'APP Rank': appRow ? appRow.rank : '',
        'CSV Points': csvRow ? Number(csvRow.points) : '', 'CSV Rank': csvRow ? Number(csvRow.rank) : '',
        'Difference Published': pubRow ? r.points - Number(pubRow.points) : 'absent',
        'Difference APP': appRow ? r.points - appRow.points : 'absent',
        'Difference CSV': csvRow ? r.points - Number(csvRow.points) : 'absent',
        _ref: r, _pub: pubRow,
      };
    });
    for (const p of pub) if (!usedPub.has(p)) lines.push({ 'Player ID': p.player_id || '', 'Player Name': p.player_name, Category: DIV_LABEL[div], 'Eligible Results': 0, 'Counted Results': 0, 'Excluded Results': 0, 'Calculated Points': 0, 'Calculated Rank': '', 'Published Points': Number(p.points), 'Published Rank': Number(p.rank), 'APP Points': '', 'APP Rank': '', 'CSV Points': '', 'CSV Rank': '', 'Difference Published': -Number(p.points), 'Difference APP': '', 'Difference CSV': '', _ref: null, _pub: p });
    sheets[div] = lines;
    const changed = lines.filter(l => typeof l['Difference Published'] === 'number' && l['Difference Published'] !== 0);
    const absentPub = lines.filter(l => l['Difference Published'] === 'absent');
    const rankChanged = lines.filter(l => l._ref && l._pub && l['Calculated Rank'] !== l['Published Rank']);
    for (const l of [...changed, ...absentPub]) pointDiffs.push({ Category: DIV_LABEL[div], 'Player ID': l['Player ID'], 'Player Name': l['Player Name'], 'Calculated Points': l['Calculated Points'], 'Published Points': l['Published Points'], Difference: l['Difference Published'], 'APP Points': l['APP Points'], 'CSV Points': l['CSV Points'] });
    for (const l of rankChanged) rankDiffs.push({ Category: DIV_LABEL[div], 'Player ID': l['Player ID'], 'Player Name': l['Player Name'], 'Calculated Rank': l['Calculated Rank'], 'Published Rank': l['Published Rank'], 'Rank Change': l['Published Rank'] - l['Calculated Rank'], 'Calculated Points': l['Calculated Points'], 'Published Points': l['Published Points'] });
    summary.push({ Category: DIV_LABEL[div], 'Joueurs (reference)': ref.length, 'Joueurs (publie)': pub.length, 'Points modifies vs publie': changed.length, 'Absents du publie': absentPub.length, 'Publies sans resultat de reference': lines.filter(l => !l._ref).length, 'Rang modifie vs publie': rankChanged.length });
  }

  const counted = [];
  const excluded = [];
  for (const r of reference.rows) {
    for (const d of r.details) {
      const line = { Category: DIV_LABEL[r.division], 'Player ID': r.player_id || '', 'Player Name': r.player_name, 'Tournament ID': d.event_id, 'Tournament Name': d.event_name, 'Tournament Date': d.event_date, 'Tournament Category': d.category, Position: d.rank_label, 'Raw Points': d.raw_points ?? d.points, Points: d.points, Partner: d.partner_name, Source: d.source, Status: d.status, Reason: d.reason };
      (d.status === 'RETENU' ? counted : excluded).push(line);
    }
  }
  for (const r of removedRows) excluded.push({ Category: DIV_LABEL[r.division], 'Player ID': r.player_id || '', 'Player Name': r.player_name, 'Tournament ID': r.event_id, 'Tournament Name': r.event_name, 'Tournament Date': r.event_date, 'Tournament Category': r.category, Position: r.rank_label, 'Raw Points': r.points, Points: bandPoints(r.points), Partner: r.partner_name, Source: r.source, Status: 'EXCLU', Reason: r.reason });

  const result = { ref: REF, window, proposedAliases: PROPOSED_ALIASES, overrides: [...OFFICIAL_DOCUMENT_OVERRIDES], rowFixes: OFFICIAL_ROW_FIXES, summary, sheets, pointDiffs, rankDiffs, counted, excluded, identityIssues, wbSheets: wb.sheets, dbOnlyEvents, log, reference: reference.rows };
  fs.writeFileSync(path.join(OUT, 'audit-result.json'), JSON.stringify(result, (k, v) => (k === '_ref' || k === '_pub' ? undefined : v)));
  console.table(summary);
  return result;
}

module.exports = { main, clubKey };
if (require.main === module) main();
