/* eslint-disable no-console */
// Classeur Excel de controle (+ CSV) a partir de audit-result.json produit par
// scripts/audit-rankings-reference.cjs. Lecture seule, n'ecrit rien en base.
//
// Usage : AUDIT_DIR=<dossier de audit-result.json> OUT_DIR=<sortie>
//         [WB_VS_DB=<wb_vs_db_classified.json>] [MOKA=<moka_impact.json>]
//         [BAREME=<bareme_issues.json>] node scripts/audit-rankings-excel.cjs

const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const { nameKey } = require('./lib/mpl-ranking-engine.cjs');

const env = process.env;
const r = JSON.parse(fs.readFileSync(path.join(env.AUDIT_DIR, 'audit-result.json'), 'utf8'));
const readOpt = (file) => (file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
const wbVsDb = readOpt(env.WB_VS_DB);
const moka = readOpt(env.MOKA);
const bareme = readOpt(env.BAREME);
fs.mkdirSync(env.OUT_DIR, { recursive: true });
const DIVS = { men: 'Hommes', women: 'Dames', mixed: 'Mixte' };

// ── Causes des ecarts reference / publie ────────────────────────────────────
const aliasTo = new Map((r.proposedAliases || []).map(([from, to, proof]) => [nameKey(from), { to, proof }]));
const CAUSES = {
  'AGATHE SELIG': ['6. Mauvaise categorie', 'M100 RM GB 22/02/2026 saisi en Hommes dans tournament_results ; le classeur et le classement Dames publie l ont deja en Dames (#7, 5 pts)'],
  'LAURENCE TOINEL': ['6. Mauvaise categorie', 'M100 RM GB 22/02/2026 saisi en Hommes dans tournament_results ; deja compte en Dames'],
  'KEITH LIOONG': ['7. Mauvaise association joueur/resultat', 'Victoire SPARC M100 12/09 (100 pts) publiee sous "KEITH LOOONG" et non sur sa fiche'],
  'SAV IOVINO': ['7. Mauvaise association joueur/resultat', 'Urban GB M50 05/09 #13 (8 pts) publie sous "SAV LOVINO"'],
  'PAUCOT DAVID': ['7. Mauvaise association joueur/resultat', 'PDF M25 LSC JUN 26 : 3e = Da Silva / Christopher Sinna ; l import Excel donne la place a David Paucot (16 pts)'],
  'LAURA PAYET': ['7. Mauvaise association joueur/resultat', 'PDF M25 CH JAN 26 Dames : 3e = Laura Gaspard ; l import Excel attribue les 12 pts a Laura Payet'],
  'ANNA ZHIVILO': ['5. Mauvaise attribution de points', 'PDF M25 RM GB APR 26 Dames : 5e = 6 pts ; l import Excel en donne 11'],
  'GÉRALDINE GÉBERT': ['5. Mauvaise attribution de points', 'PDF M25 RM GB APR 26 Dames : 5e = 6 pts ; l import Excel en donne 11'],
  'KHAWLA OUDRHIRI': ['10. Autre - a valider', 'Equipe Oudrhiri / Deepoo-Payet (7e, 7 pts) absente du PDF officiel M25 RM GB APR 26 Dames'],
  'JOHANNAH DEEPOO-PAYET': ['10. Autre - a valider', 'Equipe Oudrhiri / Deepoo-Payet (7e, 7 pts) absente du PDF officiel M25 RM GB APR 26 Dames'],
  'STEPHANE HENRY PAYET': ['7. Mauvaise association joueur/resultat - a valider', 'Deux fiches joueur (MPL0001314 "Payet Stephane" et MPL0002062 "Stephane Henry Payet") se partagent ses resultats'],
  'PAYET STEPHANE': ['7. Mauvaise association joueur/resultat - a valider', 'Deux fiches joueur (MPL0001314 / MPL0002062) : meme personne ?'],
};
function causeFor(d) {
  const fixed = CAUSES[d['Player Name']];
  if (fixed) return fixed;
  const alias = aliasTo.get(nameKey(d['Player Name']));
  if (alias) return ['2. Resultat comptabilise deux fois (doublon d identite)', `Ligne fantome : le meme resultat est deja publie chez ${alias.to} (${alias.proof}) -> supprimer cette ligne de classement`];
  return ['10. Autre - non determine', ''];
}

// ── Causes des ecarts APP / reference ───────────────────────────────────────
const ENERGIA = 'M250 ENERGIA - APR 26 - WOMEN';
const energiaPlayers = new Set(r.counted.concat(r.excluded).filter(l => l['Tournament Name'] === ENERGIA).map(l => nameKey(l['Player Name'])));
const refByKey = new Map(r.reference.map(p => [`${p.division}|${nameKey(p.player_name)}`, p]));
function appCause(div, line) {
  const k = nameKey(line['Player Name']);
  const p = refByKey.get(`${div}|${k}`);
  const app = line['APP Points'];
  if (app === '' || app === undefined) return ['Absent de l APP', 'Joueur sans compte dans l APP ou nom different (voir IDENTITY_ISSUES)'];
  const diff = app - line['Calculated Points'];
  if (energiaPlayers.has(k)) return ['6. Mauvaise categorie (APP)', `L APP classe le tableau "${ENERGIA}" (04/04/2026) en Hommes`];
  if (p && p.details.some(d => ['2026-08-22', '2026-09-05'].includes(d.event_date) && /CH|URBAN GB|Club House|Urban Sport Grand Baie/.test(d.event_name) && d.source !== 'classeur')) {
    return ['5. Erreur du classeur federal reprise par l APP', 'M250 CH 22/08 ou M50 Urban GB 05/09 : le document officiel contredit le classeur'];
  }
  if (Math.abs(diff) <= 2 && p && p.details.some(d => Number(d.raw_points) % 1 !== 0)) return ['9. Arrondi des ex aequo', 'L APP arrondit la moyenne de bande au plus proche ; la regle (et la base) arrondit a l entier superieur'];
  return ['10. Non explique - propre a l APP', 'Aucun resultat des sources (classeur, PDF, base) ne justifie ce total : verifier le detail dans l APP'];
}

// ── Onglets ────────────────────────────────────────────────────────────────
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));
const recalcSheet = (div) => (r.sheets[div] || []).map(strip).sort((a, b) => (Number(a['Calculated Rank']) || 1e9) - (Number(b['Calculated Rank']) || 1e9));
const pointDiffs = r.pointDiffs.map(d => { const [cause, proof] = causeFor(d); return { ...d, Cause: cause, Preuve: proof }; });
const appVsRef = [];
for (const div of Object.keys(DIVS)) {
  for (const l of r.sheets[div] || []) {
    if (l['APP Points'] === '' || l['APP Points'] === l['Calculated Points']) continue;
    if (!l['Calculated Points'] && l['APP Points'] === '') continue;
    const [cause, detail] = appCause(div, l);
    appVsRef.push({ Category: DIVS[div], 'Player Name': l['Player Name'], 'Calculated Points': l['Calculated Points'], 'APP Points': l['APP Points'], 'CSV Points': l['CSV Points'], 'Difference APP': l['APP Points'] - l['Calculated Points'], Cause: cause, Detail: detail });
  }
}

const rankRows = r.rankDiffs.slice().sort((a, b) => Math.abs(b['Rank Change']) - Math.abs(a['Rank Change']));
const summary = [];
const add = (Indicateur, Hommes, Dames, Mixte, Commentaire = '') => summary.push({ Indicateur, Hommes, Dames, Mixte, Commentaire });
const by = (name) => Object.fromEntries(r.summary.map(s => [s.Category, s[name]]));
add('Date de reference', r.ref, r.ref, r.ref, `Fenetre ${r.window.startIso} -> ${r.window.endIso}, bornes incluses`);
for (const k of ['Joueurs (reference)', 'Joueurs (publie)', 'Points modifies vs publie', 'Publies sans resultat de reference', 'Rang modifie vs publie']) {
  const v = by(k); add(k, v.Hommes, v.Dames, v.Mixte);
}
const count = (list, div, pred = () => true) => list.filter(x => x.Category === DIVS[div] && pred(x)).length;
add('Lignes fantomes a supprimer', count(pointDiffs, 'men', d => /doublon|Mauvaise categorie/.test(d.Cause)), count(pointDiffs, 'women', d => /doublon|Mauvaise categorie/.test(d.Cause)), count(pointDiffs, 'mixed', d => /doublon|Mauvaise categorie/.test(d.Cause)), 'Meme resultat publie sous 2 noms, ou dans 2 divisions');
add('Joueurs reels avec points faux', count(pointDiffs, 'men', d => d['Calculated Points'] > 0), count(pointDiffs, 'women', d => d['Calculated Points'] > 0), count(pointDiffs, 'mixed', d => d['Calculated Points'] > 0));
add('Ecarts APP vs reference', count(appVsRef, 'men'), count(appVsRef, 'women'), count(appVsRef, 'mixed'));
add('Problemes d identite (noms non rattaches / ambigus)', r.identityIssues.length, '', '', 'Toutes divisions');
const ups = rankRows.filter(x => x['Rank Change'] > 0).slice(0, 5).map(x => `${x['Player Name']} (${x.Category}) ${x['Published Rank']}->${x['Calculated Rank']}`).join(' ; ');
const downs = rankRows.filter(x => x['Rank Change'] < 0).slice(0, 5).map(x => `${x['Player Name']} (${x.Category}) ${x['Published Rank']}->${x['Calculated Rank']}`).join(' ; ');
add('Plus fortes hausses de rang', '', '', '', ups);
add('Plus fortes baisses de rang', '', '', '', downs || 'Aucune baisse : la suppression des fantomes ne fait que remonter des joueurs');

const identity = [
  ...r.identityIssues.map(i => ({ Type: i.type, Nom: i.name, 'Fiches candidates': i.candidates, 'Premiere occurrence': i.first_seen_in, Proposition: '' })),
  ...(r.proposedAliases || []).map(([from, to, proof]) => ({ Type: 'VARIANTE PROUVEE (a valider)', Nom: from, 'Fiches candidates': to, 'Premiere occurrence': proof, Proposition: `Rattacher "${from}" a "${to}" (alias + player_id)` })),
  { Type: 'HOMONYMES', Nom: 'NICOLAS REY / REY (2) NICOLAS', 'Fiches candidates': 'MPL0000174 / MPL0001389', 'Premiere occurrence': 'M25 LSC 06/06/2026 : saisie site sur la mauvaise fiche', Proposition: 'Corriger player1_id de la ligne tournament_results (Rey (2))' },
  { Type: 'FICHES EN DOUBLE ?', Nom: 'SOAN ROGERS', 'Fiches candidates': 'MPL0002049 / MPL0002043', 'Premiere occurrence': 'table players', Proposition: 'Verifier puis fusionner si meme personne' },
];

const dq = [];
const dqAdd = (Theme, Constat, Impact, Proposition) => dq.push({ Theme, Constat, Impact, Proposition });
for (const [sheet, reason] of r.overrides || []) dqAdd('Classeur federal vs document officiel', `${sheet} : ${reason}`, 'Classeur et APP faux ; base conforme', 'Corriger la feuille du classeur');
for (const f of r.rowFixes || []) dqAdd('Homonyme', f.reason, 'Resultat sur la mauvaise fiche', 'Corriger le player_id en base');
if (wbVsDb) {
  for (const p of wbVsDb.partial) dqAdd('Import partiel en double', p, 'Risque de double comptage (absorbe par le dedoublonnage)', 'Supprimer ces lignes partielles de historical_tournament_results');
  dqAdd('Variantes d orthographe', `${wbVsDb.names.length} equipes identiques (rang + points) ecrites differemment entre classeur et base`, 'Identites scindees, fantomes au classement', 'Normaliser les noms et rattacher par player_id');
}
if (bareme) dqAdd('Bareme', `${bareme.length} resultats d equipe ne suivent pas exactement Points Allocation.xlsx (M500/M1000 : +10/+20 systematique ; tranche selon equipes inscrites)`, 'Aucun changement propose : bonus de poule probable', 'Documenter le bonus et la regle de tranche dans le reglement');
dqAdd('Regle d ex aequo (tournoi)', 'Le classeur utilise la moyenne de bande (87,5), la base l arrondit a l entier superieur (88), l APP au plus proche ; la feuille officielle Urban GB M50 donne aux ex aequo les points de la meilleure place (28 et 28)', 'Ecarts de 1 point APP/CSV, et regle non uniforme', 'Valider une regle unique');
dqAdd('Regle affichee sur le site', 'La page Ligue annonce "10 meilleurs scores sur 12 mois" alors que tous les moteurs appliquent le Top 8', 'Communication contradictoire', 'Corriger le texte apres validation du Top 8');
dqAdd('Femmes en tableau Hommes', 'L Art. 3 ne definit qu un rang d assimilation pour le seeding ; rien sur le classement des points', 'Joueuses classees en Hommes (ex. Magaly Schaffo 215e Hommes)', 'Decision de la Commission');
dqAdd('Tournois sans resultats', 'Terres Brunes M250 03/10 (H et D), Moka Rangers M100 10/10, RM Hennessy M250 Dames 17/10 : statut "upcoming", aucun resultat, aucun PDF', 'Si joues : resultats manquants', 'Confirmer annulation ou saisir les resultats');
dqAdd('Moteurs de calcul multiples', 'scripts/recalculate-rankings-from-results.cjs, ResultsAdminPage.tsx (bouton Publier), OfficialRankingImportPage.tsx (import classeur) et RankingsAdminPage.tsx (edition/CSV) ecrivent tous dans rankings', 'Classements differents selon le chemin utilise', 'Un seul chemin de publication (script), les autres en lecture seule');
dqAdd('Identifiants', 'rankings.id et official_rankings.id sont regeneres a chaque publication (lignes techniques) ; le player_id permanent n etait pas exporte', 'Comparaisons d exports par id impossibles', 'Export corrige : colonne player_id ajoutee');

const sheets = {
  SUMMARY: summary,
  MEN_RECALCULATED: recalcSheet('men'),
  WOMEN_RECALCULATED: recalcSheet('women'),
  MIXED_RECALCULATED: recalcSheet('mixed'),
  POINT_DIFFERENCES: pointDiffs,
  RANK_DIFFERENCES: rankRows,
  COUNTED_RESULTS: r.counted,
  EXCLUDED_RESULTS: r.excluded,
  IDENTITY_ISSUES: identity,
  DATA_QUALITY: dq,
  AUDIT_LOG: r.log,
  APP_VS_REFERENCE: appVsRef,
  ...(moka ? { MOKA_M500_IMPACT: moka } : {}),
};
const wb = XLSX.utils.book_new();
for (const [name, rows] of Object.entries(sheets)) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'Aucune ligne' }]);
  const cols = Object.keys(rows[0] || { Info: '' });
  ws['!cols'] = cols.map(c => ({ wch: Math.min(60, Math.max(10, c.length + 2, ...rows.slice(0, 200).map(x => String(x[c] ?? '').length + 1))) }));
  ws['!autofilter'] = { ref: ws['!ref'] };
  XLSX.utils.book_append_sheet(wb, ws, name);
  fs.writeFileSync(path.join(env.OUT_DIR, `${name}.csv`), `﻿${XLSX.utils.sheet_to_csv(ws)}`);
}
const file = path.join(env.OUT_DIR, `MPL_AUDIT_RANKINGS_${r.ref}.xlsx`);
XLSX.writeFile(wb, file);
console.log(`Ecrit : ${file}`);
for (const [name, rows] of Object.entries(sheets)) console.log(`  ${name}: ${rows.length} lignes`);
