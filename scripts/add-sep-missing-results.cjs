/* eslint-disable no-console */
// One-off: add the 4 September 2026 result sheets that were present in
// "9 RESULTS SEPTEMBER 2026" but not yet stored in Supabase.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')];
      })
  );
}

const env = { ...readEnvFile('.env.local'), ...readEnvFile('.env.admin'), ...process.env };
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL || 'https://ooeusylgxnncyuluakwa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function clean(value) {
  return String(value ?? '').trim();
}

function norm(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

const PLAYER_ALIASES = new Map([
  ['AARON SANCHEZ', 'AARON SANCHEZ ROMERO'],
  ['BAPTISTE DESVAUX', 'BAPTISTE DESVAUX DE MARIGNY'],
  ['FRANCOIS XAVIER PIELTAIN', 'PIELTAIN FRANCOIS XAVIER'],
  ['JULES DE SPEVILLE', 'DOGER DE SPEVILLE JULES'],
  ['NATHAN CURIMJEE', 'NATHAN CURRIMJEE'],
  ['PIERRE YVES DELABRE', 'PIERRE-YVES DELABRE'],
  ['SANDRINE DE SPEVILLE', 'SANDRINE DOGER DE SPEVILLE'],
  ['THIERRY J CHRISTOPHE', 'JEAN CHRISTOPHE SCHOFFO'],
]);

function firstNameTeam(p1, p2) {
  return [p1, p2].map(name => clean(name).split(/\s+/)[0].toUpperCase()).join('/');
}

function rankInfo(label) {
  const text = String(label);
  const parts = text.split('-').map(Number);
  const rankMin = parts[0];
  const rankMax = parts[1] || parts[0];
  return { label: `#${text}`, min: rankMin, max: rankMax };
}

const EVENTS = [
  {
    tournamentId: 't169h',
    eventDate: '2026-09-19',
    eventName: 'RM Club Tamarin M100',
    sheetName: 'M100 RM T - SEP 26 - MEN RESULTS.pdf',
    sourceFile: 'M100 RM T - SEP 26 - MEN RESULTS.pdf',
    category: 'M100',
    division: 'men',
    club: 'RM Club Tamarin',
    region: 'Ouest',
    pairs: [
      ['1', 'Sebastien Motte', 'Romain Payet', 100],
      ['2', 'William Garcia', 'Yannick Garcia', 70],
      ['3', 'Pierre Charpentier', 'Laurent Daruty', 60],
      ['4', 'Alexis Yon', 'Samuel Gallet', 55],
      ['5', 'Joachim Wuilmet', 'Philippe Cavaignac', 45],
      ['6', 'Kevin Blanc', 'Calvin Howarth', 40],
      ['7', 'Pierre-Yves Delabre', 'David Soulage', 35],
      ['8', 'Max Schaffo', 'Alexandre Cazin Rodrigues', 30],
      ['9', 'Andry Ah Choon', 'Fabien Kattic', 25],
      ['10', 'Matteo Motta', 'Mathis Mizoule', 21],
      ['11', 'Thierry Bindini', 'Emmanuel Perrault', 18],
      ['12', 'Thierry Nicolas', 'Denis-Claude Koenig', 15],
      ['13', 'Bertrand Vercamer', 'Nicolas De Caritat', 10],
      ['14', 'Aleksei Grigorev', 'Ronald Van Meurs', 5],
    ],
  },
  {
    tournamentId: 't261h',
    eventDate: '2026-09-20',
    eventName: 'Oxygen Moka M25',
    sheetName: 'M25 OXYGEN - SEP 26 - MEN RESULTS.pdf',
    sourceFile: 'M25 OXYGEN - SEP 26 - MEN RESULTS.pdf',
    category: 'M25',
    division: 'men',
    club: 'Oxygen Moka',
    region: 'Centre',
    pairs: [
      ['1', 'Elie Mathieu', 'Xavier Charoux', 25],
      ['2', 'Krsna Bacha', 'Jonathan Mathieu', 17],
      ['3', 'Tommaso Fortunato', 'Theo Park', 15],
      ['4', 'Laurent Victoire', 'Denis Vinson', 13],
      ['5', 'Shane Fong', 'Atish Iramon', 11],
      ['6', 'Thomas Rousset', 'Franc Dupont', 9],
      ['7', 'Pierre Vigier De Latour', 'Laurent Vigier De Latour', 7],
      ['8', 'Jeremy Pitard', 'Vincent Dawagne', 5],
      ['9', 'Akshay Rambhojun', 'Ashley Rambhojun', 4],
    ],
  },
  {
    tournamentId: 't170h',
    eventDate: '2026-09-19',
    eventName: 'Urban Sport Grand Baie M500',
    sheetName: 'M500 URBAN GB - SEP 26 - MEN RESULTS.pdf',
    sourceFile: 'M500 URBAN GB - SEP 26 - MEN RESULTS.pdf',
    category: 'M500',
    division: 'men',
    club: 'Urban Sport Grand Baie',
    region: 'Nord',
    pairs: [
      ['1', 'Aaron Sanchez', 'Olivier Couacaud', 500],
      ['2', 'Nicolas Legros', 'Josselin Cotin', 375],
      ['3', 'Simon Koenig', 'Thomas Clark', 360],
      ['4', 'Anthony Kwok', 'Pierre Gadait', 335],
      ['5', 'Amaury De Beer', 'Jake Lam Hau Ching', 300],
      ['6', 'Thierry Park', 'Jean Christophe Schaffo', 275],
      ['7', 'Sebastien Tronc', 'Ryan Wong', 250],
      ['8', 'Enzo Merven', 'Ulric Dupont', 255],
      ['9', 'Jerome Mamet', 'Dimitri Raffray', 215],
      ['10', 'Stephane Herve', 'Lucas Sanier', 210],
      ['11', 'Raphael Dorne', 'Francois-Xavier Pieltain', 205],
      ['12', 'Julien Bee', 'Sanjay Delaporte', 175],
      ['13', 'Jadon Rossler', 'Charlie Goupil', 160],
      ['14', 'Edouard Remont', 'Guillaume Cassadin', 150],
      ['15-16', 'Pierre Mouton', 'Florian Manson', 120],
      ['15-16', 'Victor Lagesse', 'Pierre Clarenc', 130],
      ['17-18', 'William Garcia', 'Yannick Garcia', 95],
      ['17-18', 'Jules De Speville', 'Baptiste Desvaux De Marigny', 95],
      ['19-20', 'Nathan Currimjee', 'Romain Clarenc', 68],
      ['19-20', 'Axel Demontoux', 'Kevin Boyer', 68],
      ['21-22', 'Antoine Fraisse', 'Ludovic Rousseau', 38],
      ['21-22', 'Noa Bee', 'Robin Carroi', 38],
    ],
  },
  {
    tournamentId: 't170f',
    eventDate: '2026-09-19',
    eventName: 'Urban Sport Grand Baie M500',
    sheetName: 'M500 URBAN GB - SEP 26 - WOMEN RESULTS.pdf',
    sourceFile: 'M500 URBAN GB - SEP 26 - WOMEN RESULTS.pdf',
    category: 'M500',
    division: 'women',
    club: 'Urban Sport Grand Baie',
    region: 'Nord',
    pairs: [
      ['1', 'Cecile Park', 'Kate Foo Kune', 500],
      ['2', 'Laura Koenig', 'Alice Danjoux', 300],
      ['3', 'Megane Rasamiimanana', 'Melanie Courcoux', 250],
      ['4', 'Cayla Bezuidenhout', 'Martina Hola', 200],
      ['5', 'Elsa Toulet', 'Sandrine De Speville', 125],
      ['6', 'Emma Armand', 'Tippi Dalle-Grave', 50],
      ['7', 'Stefanie Vermaak', 'Nicole Vermaak', 25],
      ['8', 'Yushna Saddul', 'Coline Aumard', 5],
    ],
  },
];

async function hasColumn(table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  return !error;
}

async function buildPlayerResolver() {
  const { data, error } = await supabase.from('players').select('id,first_name,last_name');
  if (error) throw new Error(`players: ${error.message}`);
  const byName = new Map();
  for (const player of data || []) {
    const fullName = `${clean(player.first_name)} ${clean(player.last_name)}`.trim();
    byName.set(norm(fullName), player.id);
  }
  return (name) => {
    const key = norm(name);
    const alias = PLAYER_ALIASES.get(key);
    return byName.get(alias ? norm(alias) : key) || byName.get(key) || null;
  };
}

function optionalIds(row, includeIds) {
  if (includeIds) return row;
  const { player1_id, player2_id, ...rest } = row;
  return rest;
}

async function main() {
  const includeTournamentPlayerIds = await hasColumn('tournament_results', 'player1_id');
  const includeHistoricalPlayerIds = await hasColumn('historical_tournament_results', 'player1_id');
  const resolvePlayerId = await buildPlayerResolver();
  const tournamentIds = EVENTS.map(event => event.tournamentId);

  console.log(`1/4 Nettoyage des 4 tournois cibles: ${tournamentIds.join(', ')}`);
  const { error: delTrErr } = await supabase.from('tournament_results').delete().in('tournament_id', tournamentIds);
  if (delTrErr) throw new Error(`delete tournament_results: ${delTrErr.message}`);
  const { error: delHistErr } = await supabase.from('historical_tournament_results').delete().in('event_key', tournamentIds);
  if (delHistErr) throw new Error(`delete historical_tournament_results: ${delHistErr.message}`);

  const trRows = [];
  const histRows = [];

  for (const event of EVENTS) {
    for (const [rankLabel, player1, player2, points] of event.pairs) {
      const rank = rankInfo(rankLabel);
      const id = crypto.randomUUID();
      const base = {
        id,
        rank: rank.min,
        player1_name: player1,
        player2_name: player2,
        player1_id: resolvePlayerId(player1),
        player2_id: resolvePlayerId(player2),
        points,
        team_name: firstNameTeam(player1, player2),
        tournament_id: event.tournamentId,
        tournament_name: event.eventName,
        tournament_date: event.eventDate,
        category: event.category,
        division: event.division,
        region: event.region,
        club_name: event.club,
      };
      trRows.push(optionalIds(base, includeTournamentPlayerIds));
      histRows.push(optionalIds({
        id,
        source_file: event.sourceFile,
        sheet_name: event.sheetName,
        event_key: event.tournamentId,
        event_name: event.eventName,
        event_year: 2026,
        season: 2026,
        category: event.category,
        division: event.division,
        junior_category: null,
        club_name: event.club,
        event_date: event.eventDate,
        region: event.region,
        rank_label: rank.label,
        rank_min: rank.min,
        rank_max: rank.max,
        team_name: firstNameTeam(player1, player2),
        player1_name: player1,
        player2_name: player2,
        player1_id: resolvePlayerId(player1),
        player2_id: resolvePlayerId(player2),
        points,
      }, includeHistoricalPlayerIds));
    }
  }

  const unresolved = [...trRows.flatMap(row => [
    row.player1_id ? null : row.player1_name,
    row.player2_id ? null : row.player2_name,
  ])].filter(Boolean);
  console.log(`2/4 Joueurs non resolus en player_id: ${[...new Set(unresolved)].length}`);
  if (unresolved.length) console.log([...new Set(unresolved)].sort().join(', '));

  console.log(`3/4 Insertion tournament_results (${trRows.length} lignes)...`);
  const { error: insTrErr } = await supabase.from('tournament_results').insert(trRows);
  if (insTrErr) throw new Error(`insert tournament_results: ${insTrErr.message}`);

  console.log(`4/4 Insertion historical_tournament_results (${histRows.length} lignes)...`);
  const { error: insHistErr } = await supabase.from('historical_tournament_results').insert(histRows);
  if (insHistErr) throw new Error(`insert historical_tournament_results: ${insHistErr.message}`);

  console.log(`OK: ${trRows.length} paires ajoutees pour ${EVENTS.length} tableaux.`);
}

main().catch((error) => {
  console.error('ECHEC:', error.message);
  process.exit(1);
});
