// Tests du moteur de Ranking MPL : node --test scripts/test-mpl-ranking-engine.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  bandPoints, computeRankings, dropDuplicatedEvents, dropDuplicatedPlayerRows, monthlyWindow, nameKey, rankingWindow, referenceDate,
} = require('./lib/mpl-ranking-engine.cjs');

const REF = '2026-10-24';
let seq = 0;
function result(player, points, date, extra = {}) {
  seq += 1;
  return {
    player_key: player, player_id: `id-${player}`, player_name: player, division: 'men',
    event_id: `e${seq}`, event_name: `Event ${seq}`, event_date: date, category: 'M100',
    club_name: `Club ${seq}`, rank_min: 1, points, source: 'test', ...extra,
  };
}
const row = (out, player, division = 'men') => out.rows.find(r => r.player_key === player && r.division === division);

test('joueur sans resultat : absent du classement', () => {
  const out = computeRankings([], { refIso: REF });
  assert.equal(out.rows.length, 0);
});

test('joueur avec 0 point uniquement : absent du classement', () => {
  const out = computeRankings([result('A', 0, '2026-05-01')], { refIso: REF });
  assert.equal(row(out, 'A'), undefined);
});

test('moins de 8 resultats : tous additionnes', () => {
  const out = computeRankings([result('A', 100, '2026-05-01'), result('A', 50, '2026-06-01'), result('A', 25, '2026-07-01')], { refIso: REF });
  assert.equal(row(out, 'A').points, 175);
  assert.equal(row(out, 'A').counted_results, 3);
});

test('exactement 8 resultats : tous additionnes', () => {
  const rows = Array.from({ length: 8 }, (_, i) => result('A', 10 * (i + 1), `2026-0${(i % 9) + 1}-10`));
  const out = computeRankings(rows, { refIso: REF });
  assert.equal(row(out, 'A').points, 360);
  assert.equal(row(out, 'A').counted_results, 8);
  assert.equal(row(out, 'A').excluded_results, 0);
});

test('plus de 8 resultats : seuls les 8 meilleurs comptent', () => {
  const pts = [500, 400, 300, 250, 200, 150, 100, 50, 25, 10];
  const out = computeRankings(pts.map((p, i) => result('A', p, `2026-0${(i % 9) + 1}-15`)), { refIso: REF });
  const r = row(out, 'A');
  assert.equal(r.points, 1950);
  assert.equal(r.eligible_results, 10);
  assert.equal(r.counted_results, 8);
  assert.deepEqual(r.details.filter(d => d.status === 'EXCLU').map(d => d.points).sort((a, b) => a - b), [10, 25]);
  // Le total correspond exactement a la somme des lignes RETENU.
  assert.equal(r.details.filter(d => d.status === 'RETENU').reduce((s, d) => s + d.points, 0), r.points);
});

test('fenetre : bornes incluses, un jour avant exclu, futur exclu', () => {
  assert.deepEqual(rankingWindow(REF), { startIso: '2025-10-24', endIso: '2026-10-24' });
  const out = computeRankings([
    result('A', 100, '2025-10-23'), // expire
    result('A', 50, '2025-10-24'),  // borne basse incluse
    result('A', 25, '2026-10-24'),  // borne haute incluse
    result('A', 10, '2026-10-25'),  // futur
  ], { refIso: REF });
  const r = row(out, 'A');
  assert.equal(r.points, 75);
  assert.match(r.details.find(d => d.points === 100).reason, /Hors fenetre/);
  assert.match(r.details.find(d => d.points === 10).reason, /Hors fenetre/);
});

test('29 fevrier : la fenetre commence le 28 fevrier de l annee precedente', () => {
  assert.equal(rankingWindow('2028-02-29').startIso, '2027-02-28');
});

test('ex aequo de tournoi : moyenne de bande arrondie a l entier superieur', () => {
  assert.equal(bandPoints(87.5), 88);
  assert.equal(bandPoints(437.5), 438);
  assert.equal(bandPoints(131.5), 132);
  assert.equal(bandPoints(150), 150);
  assert.equal(bandPoints(0), 0);
});

test('resultats de meme valeur : tous comptes, ordre deterministe', () => {
  const rows = Array.from({ length: 9 }, (_, i) => result('A', 100, `2026-0${i + 1}-01`));
  const out = computeRankings(rows, { refIso: REF });
  assert.equal(row(out, 'A').points, 800);
  // Le plus ancien des 9 est celui qui sort (a points egaux, le plus recent d'abord).
  assert.equal(row(out, 'A').details.find(d => d.status === 'EXCLU').event_date, '2026-01-01');
});

test('ex aequo au classement : meme rang, rang suivant saute', () => {
  const out = computeRankings([result('B', 100, '2026-05-01'), result('A', 100, '2026-05-02'), result('C', 50, '2026-05-03')], { refIso: REF });
  assert.equal(row(out, 'A').rank, 1);
  assert.equal(row(out, 'B').rank, 1);
  assert.equal(row(out, 'C').rank, 3);
});

test('joueur dans plusieurs divisions : totaux separes, aucun transfert', () => {
  const out = computeRankings([
    result('A', 500, '2026-05-01', { division: 'women' }),
    result('A', 75, '2026-06-01', { division: 'men' }),
    result('A', 300, '2026-07-01', { division: 'mixed' }),
  ], { refIso: REF });
  assert.equal(row(out, 'A', 'women').points, 500);
  assert.equal(row(out, 'A', 'men').points, 75);
  assert.equal(row(out, 'A', 'mixed').points, 300);
});

test('noms similaires : jamais fusionnes si les cles different', () => {
  const out = computeRankings([result('NICOLAS REY', 100, '2026-05-01'), result('NICOLAS REY (2)', 50, '2026-05-01')], { refIso: REF });
  assert.equal(out.rows.length, 2);
  assert.equal(nameKey('Vallet Mathieu'), nameKey('MATHIEU VALLET'));
  assert.notEqual(nameKey('Keith Lioong'), nameKey('Keith Liong'));
});

test('tableau importe deux fois sous deux dates : compte une seule fois', () => {
  const teams = ['A', 'B', 'C', 'D', 'E'].map((p, i) => ({ p, rank: i + 1, pts: 100 - i * 10 }));
  const base = { division: 'men', category: 'M100', club_name: 'Club Med Albion' };
  const rows = [
    ...teams.map(t => result(t.p, t.pts, '2026-02-28', { ...base, rank_min: t.rank, event_name: 'CMA FEB' })),
    ...teams.map(t => result(t.p, t.pts, '2026-03-28', { ...base, rank_min: t.rank, event_name: 'CMA MAR' })),
  ];
  const { kept, removed } = dropDuplicatedEvents(rows);
  assert.equal(kept.length, 5);
  assert.equal(removed.length, 5);
  assert.ok(removed.every(r => r.event_date === '2026-03-28'));
});

test('meme resultat refait dans un vrai autre tournoi : compte deux fois', () => {
  // Magaly / Marinne : M500 RM Hennessy gagne le 2025-12-12 ET le 2026-06-20.
  const base = { division: 'women', category: 'M500', club_name: 'I Padel by RM Hennessy', rank_min: 1 };
  const rows = [
    result('MAGALY', 500, '2025-12-12', base), result('MARINNE', 500, '2025-12-12', base),
    result('X1', 325, '2025-12-12', { ...base, rank_min: 2 }), result('X2', 325, '2025-12-12', { ...base, rank_min: 2 }),
    result('MAGALY', 500, '2026-06-20', base), result('MARINNE', 500, '2026-06-20', base),
    result('Y1', 325, '2026-06-20', { ...base, rank_min: 2 }), result('Y2', 325, '2026-06-20', { ...base, rank_min: 2 }),
  ];
  const { kept } = dropDuplicatedEvents(rows);
  const out = computeRankings(kept, { refIso: REF });
  assert.equal(row(out, 'MAGALY', 'women').points, 1000);
});

test('deux lignes du meme joueur dans le meme tableau : une seule gardee', () => {
  const base = { club_name: 'Club X', category: 'M250' };
  const { kept, removed } = dropDuplicatedPlayerRows([
    result('A', 63, '2026-09-12', base), result('A', 113, '2026-09-12', base),
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].points, 113);
  assert.equal(removed.length, 1);
});

test('recalcul repete sur les memes donnees : resultat identique', () => {
  const rows = [result('A', 100, '2026-05-01'), result('B', 100, '2026-05-02'), result('C', 75, '2026-05-03')];
  const a = JSON.stringify(computeRankings(rows, { refIso: REF }));
  const b = JSON.stringify(computeRankings([...rows].reverse(), { refIso: REF }));
  assert.equal(a, b);
});

test('stabilite des identifiants : le player_id du resultat est conserve', () => {
  const out = computeRankings([result('A', 100, '2026-05-01', { player_id: 'perm-123' })], { refIso: REF });
  assert.equal(row(out, 'A').player_id, 'perm-123');
});

// ── Regle mensuelle officielle (decision du 2026-10-24) ─────────────────────
test('fenetre mensuelle : classement de septembre 2026 = finales du 01/10/2025 au 30/09/2026', () => {
  assert.deepEqual(monthlyWindow('2026-09'), { referenceMonth: '2026-09-01', applicableMonth: '2026-10-01', startIso: '2025-10-01', endIso: '2026-09-30' });
  assert.deepEqual(monthlyWindow('2026-02'), { referenceMonth: '2026-02-01', applicableMonth: '2026-03-01', startIso: '2025-03-01', endIso: '2026-02-28' });
  assert.equal(monthlyWindow('2026-12').applicableMonth, '2027-01-01');
  assert.throws(() => monthlyWindow('09/2026'));
});

test('fenetre mensuelle : bornes incluses, mois precedent et suivant exclus', () => {
  const out = computeRankings([
    result('A', 100, '2025-09-30'), result('A', 50, '2025-10-01'), result('A', 25, '2026-09-30'), result('A', 10, '2026-10-01'),
  ], { referenceMonth: '2026-09' });
  assert.equal(row(out, 'A').points, 75);
});

test('date de reference = finale : tournoi commence le 31/10 et fini le 02/11 compte en novembre', () => {
  const m1000 = result('A', 1000, '2025-10-31', { event_end_date: '2025-11-02', category: 'M1000' });
  assert.equal(referenceDate(m1000), '2025-11-02');
  // Classement d'octobre 2026 (finales nov. 2025 -> oct. 2026) : compte.
  assert.equal(row(computeRankings([m1000], { referenceMonth: '2026-10' }), 'A').points, 1000);
  // Classement de novembre 2026 (finales dec. 2025 -> nov. 2026) : expire.
  assert.equal(row(computeRankings([m1000], { referenceMonth: '2026-11' }), 'A'), undefined);
  // Sans date de fin, le meme tournoi aurait expire des le classement d'octobre 2026.
  assert.equal(row(computeRankings([{ ...m1000, event_end_date: null }], { referenceMonth: '2026-10' }), 'A'), undefined);
});

test('tournoi d un jour : date de fin absente = date du tableau', () => {
  assert.equal(referenceDate(result('A', 25, '2026-01-31')), '2026-01-31');
});
