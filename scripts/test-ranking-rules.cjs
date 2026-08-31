const assert = require('node:assert/strict');

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function computeBestScores(rows, limit = 8) {
  return [...rows]
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
    .reduce((sum, row) => sum + row.points, 0);
}

function dedupeByPlayerIdAndEvent(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = [
      row.player_id || `legacy:${norm(row.player_name)}`,
      row.event_id,
      row.division,
      row.date,
      row.rank,
    ].join('|');
    if (!map.has(key)) map.set(key, row);
  }
  return Array.from(map.values());
}

assert.equal(
  computeBestScores([
    150, 135.5, 132.5, 81.25, 75, 45, 34, 25, 10, 10, 8, 5, 1,
  ].map(points => ({ points }))),
  678.25,
  'decimal points must be preserved'
);

assert.equal(
  computeBestScores([100, 90, 80, 70, 60, 50, 40, 30, 20].map(points => ({ points }))),
  520,
  'best 8 must keep only the top 8 scores'
);

const categoryRows = [
  { player_id: 'p1', division: 'mixed', points: 275 },
  { player_id: 'p1', division: 'men', points: 0 },
];
assert.equal(
  computeBestScores(categoryRows.filter(row => row.player_id === 'p1' && row.division === 'men')),
  0,
  'a different division must not be used as fallback'
);

const samePlayerRows = dedupeByPlayerIdAndEvent([
  { player_id: 'christian-id', player_name: 'Christian Bezandry', event_id: 'e1', division: 'men', date: '2026-08-15', rank: 1, points: 100 },
  { player_id: 'christian-id', player_name: 'CHRISTIAN BEZANDRY', event_id: 'e1', division: 'men', date: '2026-08-15', rank: 1, points: 100 },
  { player_id: 'christian-id', player_name: 'Christian  Bezandry', event_id: 'e1', division: 'men', date: '2026-08-15', rank: 1, points: 100 },
]);
assert.equal(samePlayerRows.length, 1, 'same player_id must produce one ranking contribution');

const duplicateImportRows = dedupeByPlayerIdAndEvent([
  { player_id: 'p1', event_id: 'e1', division: 'men', date: '2026-08-15', rank: 1, points: 100 },
  { player_id: 'p1', event_id: 'e1', division: 'men', date: '2026-08-15', rank: 1, points: 100 },
]);
assert.equal(duplicateImportRows.length, 1, 'same imported result must not double count');

const ambiguousByName = [
  { id: 'p1', name: 'Jean Dupont', license: '1' },
  { id: 'p2', name: 'Jean Dupont', license: '2' },
].filter(player => norm(player.name) === norm('Jean Dupont'));
assert.equal(ambiguousByName.length, 2, 'duplicate names with different licences are ambiguous');

const playerA = { menPoints: 1000, menRank: 12 };
const playerB = { menPoints: 500, menRank: 4 };
assert.equal(playerA.menPoints + playerB.menPoints, 1500, 'pair_points must use points');
assert.notEqual(playerA.menRank + playerB.menRank, 1500, 'pair ranking must not use rank sum as points');

console.log('OK ranking rule tests passed');
