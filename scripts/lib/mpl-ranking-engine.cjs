/* eslint-disable no-console */
// Moteur de calcul du Ranking MPL - fonctions pures, sans acces reseau.
//
// Regles appliquees (a valider par la Commission MPL, cf. rapport d'audit
// du 2026-10-24) :
//   - Fenetre glissante : du meme jour un an avant la date de reference
//     jusqu'a la date de reference, les deux bornes INCLUSES
//     (ref 2026-10-24 -> 2025-10-24 .. 2026-10-24).
//   - Classement = somme des 8 meilleurs resultats admissibles de la fenetre,
//     par division (men / women / mixed / junior) - pas de transfert entre
//     divisions.
//   - Ex aequo dans un tournoi (bande "5-6", "7-8"...) : moyenne des points
//     de la bande, arrondie a l'entier superieur.
//   - Ex aequo au classement : meme rang pour un meme total (1, 1, 3...),
//     ordre d'affichage par nom. Aucune autre regle de departage n'est
//     inventee ici.
//
// Un "resultat" = une ligne joueur : { player_key, player_id, player_name,
// division, event_id, event_name, event_date, category, club_name, rank_label,
// rank_min, points, source }.

const DEFAULT_MAX_RESULTS = 8;

function cleanText(value) {
  return String(value ?? '').trim();
}

function normKey(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Cle de nom insensible a l'ordre prenom/nom ("VALLET MATHIEU" = "MATHIEU VALLET").
function nameKey(value) {
  return normKey(value).split(' ').filter(Boolean).sort().join(' ');
}

function isoDate(value) {
  const text = cleanText(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function rankingWindow(refIso) {
  const ref = isoDate(refIso);
  if (!ref) throw new Error(`Date de reference invalide: ${refIso}`);
  const [year, month, day] = ref.split('-').map(Number);
  // 29 fevrier -> 28 fevrier de l'annee precedente.
  const start = new Date(Date.UTC(year - 1, month - 1, day));
  if (start.getUTCMonth() !== month - 1) start.setUTCDate(0);
  return { startIso: start.toISOString().slice(0, 10), endIso: ref };
}

// Regle officielle des classements mensuels (decision du 2026-10-24) : le
// classement du mois M compte les tournois dont la FINALE a eu lieu du 1er
// jour du mois M-11 au dernier jour du mois M ; il sert aux tournois de M+1.
function monthlyWindow(referenceMonth) {
  const m = String(referenceMonth || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error(`Mois de reference invalide (AAAA-MM attendu) : ${referenceMonth}`);
  const year = Number(m[1]); const month = Number(m[2]);
  const iso = (d) => d.toISOString().slice(0, 10);
  return {
    referenceMonth: `${m[1]}-${m[2]}-01`,
    applicableMonth: iso(new Date(Date.UTC(year, month, 1))),
    startIso: iso(new Date(Date.UTC(year, month - 12, 1))),
    endIso: iso(new Date(Date.UTC(year, month, 0))),
  };
}

// Date de reference d'un resultat : jour de la finale ; a defaut (tournoi d'un
// jour, ou date de fin non renseignee), la date du tableau.
function referenceDate(row) {
  return isoDate(row.event_end_date) || isoDate(row.end_date) || isoDate(row.event_date);
}

function bandPoints(value) {
  const points = Number(value);
  if (!Number.isFinite(points) || points <= 0) return 0;
  // Tolerance flottante : 87.5000000001 ne doit pas devenir 88 par erreur
  // d'arrondi binaire, 87.5 doit devenir 88.
  return Math.ceil(points - 1e-9);
}

// Un meme tableau peut exister deux fois (import Excel + saisie site, ou
// meme feuille datee a J+1). On le detecte au niveau du tableau entier :
// meme division/categorie/club, dates differentes, >= 80 % de lignes
// identiques (joueur + rang + points). On garde la date la plus ancienne.
function dropDuplicatedEvents(results, { minOverlap = 0.8, minRows = 4 } = {}) {
  const events = new Map();
  for (const row of results) {
    const scope = [row.division, row.category, normKey(row.club_name)].join('|');
    const key = `${scope}|${row.event_date}`;
    if (!events.has(key)) events.set(key, { key, scope, date: row.event_date, name: row.event_name, signatures: new Set() });
    events.get(key).signatures.add([row.player_key, Number(row.rank_min) || 0, bandPoints(row.points)].join('|'));
  }
  const dropped = new Map();
  const sorted = [...events.values()].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i];
    if (dropped.has(a.key)) continue;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j];
      if (dropped.has(b.key) || b.scope !== a.scope || b.date === a.date) continue;
      const smaller = Math.min(a.signatures.size, b.signatures.size);
      if (smaller < minRows) continue;
      let common = 0;
      for (const signature of b.signatures) if (a.signatures.has(signature)) common += 1;
      if (common / smaller >= minOverlap) dropped.set(b.key, { kept: a, common, smaller });
    }
  }
  const kept = [];
  const removed = [];
  for (const row of results) {
    const key = `${[row.division, row.category, normKey(row.club_name)].join('|')}|${row.event_date}`;
    const info = dropped.get(key);
    if (info) removed.push({ ...row, reason: `Tableau en double de ${info.kept.date} "${info.kept.name}" (${info.common}/${info.smaller} lignes identiques)` });
    else kept.push(row);
  }
  return { kept, removed };
}

// Un joueur ne peut avoir qu'un resultat par tableau : si deux lignes du
// meme joueur tombent dans le meme tableau (meme division/categorie/club/date),
// on garde la meilleure et on signale l'autre.
function dropDuplicatedPlayerRows(results) {
  const byKey = new Map();
  const removed = [];
  for (const row of results) {
    const key = [row.player_key, row.division, row.category, normKey(row.club_name), row.event_date].join('|');
    const existing = byKey.get(key);
    if (!existing) { byKey.set(key, row); continue; }
    const keepNew = bandPoints(row.points) > bandPoints(existing.points);
    const loser = keepNew ? existing : row;
    if (keepNew) byKey.set(key, row);
    removed.push({ ...loser, reason: 'Deux lignes du meme joueur dans le meme tableau' });
  }
  return { kept: [...byKey.values()], removed };
}

function compareResults(a, b) {
  return bandPoints(b.points) - bandPoints(a.points)
    || b.event_date.localeCompare(a.event_date)
    || cleanText(a.event_id).localeCompare(cleanText(b.event_id));
}

function computeRankings(results, { refIso, referenceMonth, maxResults = DEFAULT_MAX_RESULTS } = {}) {
  // referenceMonth (AAAA-MM) : fenetre mensuelle officielle, dates = finales.
  // refIso : fenetre glissante au jour pres (classement en direct).
  const window = referenceMonth ? monthlyWindow(referenceMonth) : rankingWindow(refIso);
  if (referenceMonth) results = results.map((row) => ({ ...row, event_date: referenceDate(row) }));
  const players = new Map();
  for (const row of results) {
    const key = `${row.division}|${row.player_key}`;
    if (!players.has(key)) players.set(key, { division: row.division, player_key: row.player_key, player_id: row.player_id || null, player_name: row.player_name, rows: [] });
    const entry = players.get(key);
    if (!entry.player_id && row.player_id) entry.player_id = row.player_id;
    entry.rows.push(row);
  }

  const ranked = [];
  for (const entry of players.values()) {
    const details = [];
    const eligible = [];
    for (const row of entry.rows) {
      const date = isoDate(row.event_date);
      const points = bandPoints(row.points);
      if (!date) details.push({ ...row, points, status: 'EXCLU', reason: 'Date de tournoi manquante' });
      else if (date < window.startIso) details.push({ ...row, points, status: 'EXCLU', reason: `Hors fenetre (avant ${window.startIso})` });
      else if (date > window.endIso) details.push({ ...row, points, status: 'EXCLU', reason: `Hors fenetre (apres ${window.endIso})` });
      else if (points <= 0) details.push({ ...row, points, status: 'EXCLU', reason: '0 point' });
      else eligible.push({ ...row, points });
    }
    eligible.sort(compareResults);
    eligible.forEach((row, index) => {
      details.push(index < maxResults
        ? { ...row, status: 'RETENU', reason: `Top ${maxResults} (#${index + 1})` }
        : { ...row, status: 'EXCLU', reason: `Au-dela des ${maxResults} meilleurs (#${index + 1})` });
    });
    const counted = eligible.slice(0, maxResults);
    const total = counted.reduce((sum, row) => sum + row.points, 0);
    if (total <= 0) continue;
    ranked.push({
      division: entry.division,
      player_key: entry.player_key,
      player_id: entry.player_id,
      player_name: entry.player_name,
      eligible_results: eligible.length,
      counted_results: counted.length,
      excluded_results: details.length - counted.length,
      points: total,
      details: details.sort((a, b) => (a.status === b.status ? compareResults(a, b) : a.status === 'RETENU' ? -1 : 1)),
    });
  }

  const byDivision = new Map();
  for (const row of ranked) {
    if (!byDivision.has(row.division)) byDivision.set(row.division, []);
    byDivision.get(row.division).push(row);
  }
  const out = [];
  for (const [division, rows] of byDivision) {
    rows.sort((a, b) => b.points - a.points || normKey(a.player_name).localeCompare(normKey(b.player_name)) || cleanText(a.player_key).localeCompare(cleanText(b.player_key)));
    let lastPoints = null;
    let lastRank = 0;
    rows.forEach((row, index) => {
      const rank = row.points === lastPoints ? lastRank : index + 1;
      lastPoints = row.points;
      lastRank = rank;
      out.push({ ...row, division, rank });
    });
  }
  return { window, rows: out };
}

module.exports = {
  DEFAULT_MAX_RESULTS,
  bandPoints,
  cleanText,
  computeRankings,
  dropDuplicatedEvents,
  dropDuplicatedPlayerRows,
  isoDate,
  monthlyWindow,
  nameKey,
  normKey,
  rankingWindow,
  referenceDate,
};
