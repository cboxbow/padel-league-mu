const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const XLSX = require('xlsx');

const DEFAULT_SOURCE = 'D:/MEGA/PADEL LEAGUE/02 TOURNOIS/2026/DESIGN PADEL LEAGUE/WEB OFFICIAL MPL/galerie_rls_401_fix/CALENDRIER MPL 2026.xlsx';
const sourcePath = process.argv[2] || DEFAULT_SOURCE;
const outputTs = path.resolve('src/data/mpl2026.ts');
const outputSql = path.resolve('public/sync_calendar_mpl2026_official.sql');
const today = '2026-07-31';
const CATEGORY_SHEETS = ['M25', 'M50', 'M100', 'M250', 'M500', 'M1000', 'MIXED', 'JUNIOR'];
const OFFICIAL_SHEET = 'DATABASE';

const clubMap = {
  CANA: { id: 'c01', name: 'Caña Beau Plan', slug: 'cana-beau-plan', region: 'Nord', city: 'Beau Plan', courts: 5, contact: 'Mathieu Vallet', phone: '+230 5979 2962' },
  'CLUB MED': { id: 'c02', name: 'Club Med Albion', slug: 'club-med-albion', region: 'Ouest', city: 'Albion', courts: 3, contact: 'Romain Beltrando', phone: '+230 5936 5037' },
  'URBAN SPORT GRAND BAIE': { id: 'c03', name: 'Urban Sport Grand Baie', slug: 'urban-sport-grand-baie', region: 'Nord', city: 'Grand Baie', courts: 3, contact: 'Pascal Hoffmann', phone: '+230 5258 0551' },
  'URBAN SPORT BLACK RIVER': { id: 'c04', name: 'Urban Sport Black River', slug: 'urban-sport-black-river', region: 'Ouest', city: 'Black River', courts: 4, contact: 'Pascal Hoffmann', phone: '+230 5258 0551' },
  'SPARC CASCAVELLE': { id: 'c05', name: 'SPARC Cascavelle', slug: 'sparc-cascavelle', region: 'Ouest', city: 'Cascavelle', courts: 4, contact: 'Maxime Huyse', phone: '+230 5481 0753' },
  'RM CLUB TAMARIN': { id: 'c06', name: 'RM Club Tamarin', slug: 'rm-club-tamarin', region: 'Ouest', city: 'Tamarin', courts: 5, contact: 'Coline Aumard', phone: '+230 5508 0718' },
  'I PADEL HENESSY': { id: 'c07', name: 'I Padel by RM Hennessy', slug: 'i-padel-henessy', region: 'Centre', city: 'Hennessy', courts: 4, contact: 'Coline Aumard', phone: '+230 5508 0718' },
  'RM CLUB GRAND BAIE': { id: 'c08', name: 'RM Club Grand Baie', slug: 'rm-club-grand-baie', region: 'Nord', city: 'Grand Baie', courts: 7, contact: 'Coline Aumard', phone: '+230 5508 0718' },
  'LABOURDONNAIS LSC': { id: 'c09', name: 'Labourdonnais Mapou', slug: 'labourdonnais-mapou', region: 'Nord', city: 'Mapou', courts: 3, contact: 'Mickael Gosch', phone: '+230 5475 2121' },
  'I PADEL PORT CHAMBLY': { id: 'c10', name: 'I Padel by RM Port Chambly', slug: 'i-padel-port-chambly', region: 'Sud', city: 'Port Chambly', courts: 3, contact: 'Coline Aumard', phone: '+230 5508 0718' },
  'STUDIO BY RM AZURI': { id: 'c11', name: 'Studio by RM Azuri', slug: 'studio-by-rm-azuri', region: 'Est', city: 'Azuri', courts: 3, contact: 'Coline Aumard', phone: '+230 5508 0718' },
  'ISLA PADEL GRAND BAIE': { id: 'c12', name: 'Isla Padel Grand Baie', slug: 'isla-padel-grand-baie', region: 'Nord', city: 'Grand Baie', courts: 6, contact: 'Florian Manson', phone: '+230 5755 3320' },
  'TERRES BRUNES TAMARIN': { id: 'c13', name: 'Terres Brunes Sports & Leisure', slug: 'terres-brunes-tamarin', region: 'Ouest', city: 'Tamarin', courts: 3, contact: 'Marinne Giraud', phone: '+230 5423 9475' },
  'MONT CHOISY GOLF': { id: 'c14', name: 'Mont Choisy Golf', slug: 'mont-choisy-golf', region: 'Nord', city: 'Mont Choisy', courts: 2, contact: 'Sarvish Kinnoo', phone: '+230 5772 6006' },
  'OXYGEN MOKA': { id: 'c15', name: 'Oxygen Moka', slug: 'oxygen-moka', region: 'Centre', city: 'Moka', courts: 2, contact: 'Matteo Zinno', phone: '+230 5746 3006' },
  'OXYGEN CUREPIPE': { id: 'c15', name: 'Oxygen Moka', slug: 'oxygen-moka', region: 'Centre', city: 'Moka', courts: 2, contact: 'Matteo Zinno', phone: '+230 5746 3006' },
  'CLUB HOUSE BLACK RIVER': { id: 'c16', name: 'Club House Black River', slug: 'club-house-black-river', region: 'Ouest', city: 'Black River', courts: 2, contact: 'Alexis Lavie', phone: '+230 5494 1771' },
  ENERGIA: { id: 'c17', name: 'Energia Pointe aux Canonniers', slug: 'energia-pointe-aux-canonniers', region: 'Nord', city: 'Pte aux Canonniers', courts: 2, contact: 'Damien Putteea', phone: '+230 5938 6076' },
  'MOKA RANGERS': { id: 'c18', name: 'Moka Rangers', slug: 'moka-rangers', region: 'Centre', city: 'Moka', courts: 4, contact: 'Mathias Ritter', phone: '+230 5801 3256' },
};

const regionMap = { NORD: 'Nord', OUEST: 'Ouest', CENTRE: 'Centre', EST: 'Est', SUD: 'Sud' };
const maxTeams = { M25: 16, M50: 24, M100: 32, M250: 32, M500: 48, M1000: 48, MIXED: 24, U11: 12, U13: 16, U15: 16 };
const cancelledTournamentRules = [
  { date: '2026-02-14', club: 'Mont Choisy Golf', category: 'M50', divisions: ['men', 'women'] },
  { date: '2026-03-01', club: 'I Padel by RM Hennessy', category: 'JUNIOR', divisions: ['junior'] },
  { date: '2026-03-14', club: 'Oxygen Moka', category: 'M100', divisions: ['men', 'women'] },
  { date: '2026-04-04', club: 'Club Med Albion', category: 'MIXED', divisions: ['mixed'] },
  { date: '2026-04-11', club: 'SPARC Cascavelle', category: 'M50', divisions: ['men', 'women'] },
  { date: '2026-04-25', club: 'Club Med Albion', category: 'M25', divisions: ['men'] },
  { date: '2026-04-25', club: 'RM Club Tamarin', category: 'JUNIOR', divisions: ['junior'] },
  { date: '2026-05-16', club: 'Moka Rangers', category: 'M50', divisions: ['men', 'women'] },
  { date: '2026-05-30', club: 'Club Med Albion', category: 'M50', divisions: ['men'] },
  { date: '2026-05-30', club: 'Moka Rangers', category: 'JUNIOR', divisions: ['junior'] },
  { date: '2026-06-06', club: 'Caña Beau Plan', category: 'U11', divisions: ['junior'] },
  { date: '2026-06-06', club: 'Caña Beau Plan', category: 'U13', divisions: ['junior'] },
  { date: '2026-06-07', club: 'Studio by RM Azuri', category: 'M100', divisions: ['men'] },
  { date: '2026-06-20', club: 'Moka Rangers', category: 'M250', divisions: ['men', 'women'] },
  { date: '2026-06-20', club: 'Oxygen Moka', category: 'M50', divisions: ['men'] },
  { date: '2026-06-27', club: 'Club Med Albion', category: 'JUNIOR', divisions: ['junior'] },
  { date: '2026-07-25', club: 'Moka Rangers', category: 'M25', divisions: ['men', 'women'] },
  { date: '2026-07-25', club: 'Urban Sport Black River', category: 'JUNIOR', divisions: ['junior'] },
  { date: '2026-08-08', club: 'I Padel by RM Port Chambly', category: 'JUNIOR', divisions: ['junior'] },
  { date: '2026-08-15', club: 'Moka Rangers', category: 'MIXED', divisions: ['mixed'] },
  { date: '2026-08-22', club: 'Oxygen Moka', category: 'M250', divisions: ['men', 'women'] },
  { date: '2026-08-29', club: 'Club Med Albion', category: 'M25', divisions: ['men', 'women'] },
];

function parseDisplayedDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) {
    return String(value).trim();
  }
  const [m, d, yy] = String(value).trim().split('/').map(Number);
  if (!m || !d || !yy) throw new Error(`Date invalide: ${value}`);
  return `${2000 + yy}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function sql(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function divisionLabel(division) {
  if (division === 'men') return 'Hommes';
  if (division === 'women') return 'Dames';
  if (division === 'mixed') return 'Mixte';
  return 'Junior';
}

function eventName(clubName, category, division) {
  if (division === 'mixed') return `${clubName} Mixed Open`;
  if (division === 'junior') return `${clubName} Junior ${category}`;
  return `${clubName} ${category} (${divisionLabel(division)})`;
}

function tournamentKey(tournament) {
  return [
    tournament.club_name,
    tournament.date,
    tournament.category,
    tournament.division,
  ].map(value => String(value).trim().toUpperCase()).join('|');
}

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function isCancelledTournament(tournament) {
  const club = norm(tournament.club_name);
  const category = norm(tournament.category);
  const isJuniorCategory = ['U11', 'U13', 'U15'].includes(category);

  return cancelledTournamentRules.some(rule => {
    const ruleCategory = norm(rule.category);
    if (rule.date !== tournament.date) return false;
    if (ruleCategory !== category && !(ruleCategory === 'JUNIOR' && isJuniorCategory)) return false;
    if (rule.divisions?.length && !rule.divisions.includes(tournament.division)) return false;
    return club === norm(rule.club);
  });
}

function parseTournamentBlock(text) {
  const block = text.match(/export const MPL_TOURNAMENTS: Tournament\[] = \[\n([\s\S]*?)\n\];/);
  if (!block) return [];
  const rowRe = /\{id:'([^']+)',name:'([^']+)',club_id:'([^']+)',club_name:'([^']+)',date:'([^']+)',region:'([^']+)',category:'([^']+)',division:'([^']+)',type:'([^']+)',status:'([^']+)',max_teams:(\d+)\}/g;
  const tournaments = [];
  let match;
  while ((match = rowRe.exec(block[1]))) {
    const [, id, name, club_id, club_name, date, region, category, division, type, status, max_teams] = match;
    tournaments.push({ id, name, club_id, club_name, date, region, category, division, type, status, max_teams: Number(max_teams) });
  }
  return tournaments;
}

function readExistingIdMap() {
  const texts = [];
  try {
    texts.push(execSync('git show HEAD:src/data/mpl2026.ts', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    // Git history is optional when generating the calendar outside the repo.
  }
  if (fs.existsSync(outputTs)) texts.push(fs.readFileSync(outputTs, 'utf8'));

  const idMap = new Map();
  for (const text of texts) {
    for (const tournament of parseTournamentBlock(text)) {
      const key = tournamentKey(tournament);
      if (!idMap.has(key)) idMap.set(key, tournament.id);
    }
  }
  return idMap;
}

function rowToEvents(row, eventNumber, juniorNumberRef) {
  const sourceClub = String(row.CLUB).trim().toUpperCase();
  const club = clubMap[sourceClub];
  if (!club) throw new Error(`Club non mappe: ${sourceClub}`);

  const date = parseDisplayedDate(row.DATE);
  const sourceCategory = String(row.CATEGORIE).trim().toUpperCase();
  const sourceType = String(row.TYPE).trim().toUpperCase();
  const region = regionMap[String(row.ZONE).trim().toUpperCase()] || club.region;
  const baseId = `t${String(eventNumber).padStart(3, '0')}`;
  const status = date <= today ? 'completed' : 'upcoming';

  if (sourceCategory === 'JUNIOR' || sourceType === 'JUNIOR') {
    return ['U11', 'U13', 'U15'].map(category => {
      const id = `j${juniorNumberRef.value++}`;
      return { id, name: eventName(club.name, category, 'junior'), club_id: club.id, club_name: club.name, date, region, category, division: 'junior', type: 'JUNIOR', status, max_teams: maxTeams[category] };
    });
  }

  if (sourceType === 'MIXED' || sourceCategory === 'MIXED') {
    return [{ id: baseId, name: eventName(club.name, 'MIXED', 'mixed'), club_id: club.id, club_name: club.name, date, region, category: 'MIXED', division: 'mixed', type: 'MIXED', status, max_teams: maxTeams.MIXED }];
  }

  if (sourceType === 'MEN&WOMEN') {
    return [
      { id: `${baseId}h`, name: eventName(club.name, sourceCategory, 'men'), club_id: club.id, club_name: club.name, date, region, category: sourceCategory, division: 'men', type: 'MEN', status, max_teams: maxTeams[sourceCategory] },
      { id: `${baseId}f`, name: eventName(club.name, sourceCategory, 'women'), club_id: club.id, club_name: club.name, date, region, category: sourceCategory, division: 'women', type: 'WOMEN', status, max_teams: maxTeams[sourceCategory] },
    ];
  }

  if (sourceType === 'WOMEN') {
    return [{ id: `${baseId}f`, name: eventName(club.name, sourceCategory, 'women'), club_id: club.id, club_name: club.name, date, region, category: sourceCategory, division: 'women', type: 'WOMEN', status, max_teams: maxTeams[sourceCategory] }];
  }

  return [{ id: baseId, name: eventName(club.name, sourceCategory, 'men'), club_id: club.id, club_name: club.name, date, region, category: sourceCategory, division: 'men', type: 'MEN', status, max_teams: maxTeams[sourceCategory] }];
}

const workbook = XLSX.readFile(sourcePath, { cellDates: true });

function normaliseRow(row) {
  let date;
  try {
    date = parseDisplayedDate(row.DATE);
  } catch {
    return null;
  }
  const club = String(row.CLUB || '').trim().toUpperCase();
  const zone = String(row.ZONE || '').trim().toUpperCase();
  const category = String(row.CATEGORIE || '').trim().toUpperCase();
  const type = String(row.TYPE || '').trim().toUpperCase();
  if (!date || !club || !zone || !category || !type) return null;
  return { DATE: date, CLUB: club, ZONE: zone, CATEGORIE: category, TYPE: type };
}

function readOfficialRows() {
  const sheet = workbook.Sheets[OFFICIAL_SHEET];
  if (!sheet) throw new Error(`Onglet officiel introuvable: ${OFFICIAL_SHEET}`);

  const rows = XLSX.utils
    .sheet_to_json(sheet, { defval: '', raw: false })
    .filter(row => row.DATE && row.CLUB && row.ZONE && row.CATEGORIE && row.TYPE)
    .map(normaliseRow)
    .filter(Boolean);

  const unique = new Map();
  for (const row of rows) {
    const key = [row.DATE, row.CLUB, row.ZONE, row.CATEGORIE, row.TYPE].join('|');
    unique.set(key, row);
  }

  const categoryOrder = new Map(CATEGORY_SHEETS.map((category, index) => [category, index]));
  return Array.from(unique.values()).sort((a, b) =>
    a.DATE.localeCompare(b.DATE) ||
    (categoryOrder.get(a.CATEGORIE) ?? 99) - (categoryOrder.get(b.CATEGORIE) ?? 99) ||
    a.CLUB.localeCompare(b.CLUB) ||
    a.TYPE.localeCompare(b.TYPE)
  );
}

const database = readOfficialRows();
const existingIdMap = readExistingIdMap();

let eventNumber = 1;
const juniorNumberRef = { value: 1000 };
const tournaments = [];
const sourceClubCounts = new Map();

for (const row of database) {
  const sourceClub = String(row.CLUB).trim().toUpperCase();
  const club = clubMap[sourceClub];
  sourceClubCounts.set(club.id, (sourceClubCounts.get(club.id) || 0) + 1);
  const isJunior = String(row.CATEGORIE).trim().toUpperCase() === 'JUNIOR' || String(row.TYPE).trim().toUpperCase() === 'JUNIOR';
  tournaments.push(...rowToEvents(row, eventNumber, juniorNumberRef).map(tournament => {
    const existingId = existingIdMap.get(tournamentKey(tournament));
    return {
      ...tournament,
      id: existingId || tournament.id,
      __stableId: Boolean(existingId),
    };
  }));
  if (!isJunior) eventNumber += 1;
}

function nextFreeTournamentId(tournament, usedIds, counters) {
  if (tournament.division === 'junior') {
    do counters.junior += 1;
    while (usedIds.has(`j${counters.junior}`));
    return `j${counters.junior}`;
  }

  const suffix = tournament.division === 'men' ? 'h' : tournament.division === 'women' ? 'f' : '';
  let id;
  do {
    counters.tournament += 1;
    id = `t${String(counters.tournament).padStart(3, '0')}${suffix}`;
  } while (usedIds.has(id));
  return id;
}

const counters = tournaments.reduce((acc, tournament) => {
  const match = /^([tj])(\d+)/.exec(tournament.id);
  if (!match) return acc;
  const value = Number(match[2]);
  if (match[1] === 't') acc.tournament = Math.max(acc.tournament, value);
  if (match[1] === 'j') acc.junior = Math.max(acc.junior, value);
  return acc;
}, { tournament: 0, junior: 0 });

const usedIds = new Set();
for (const tournament of tournaments) {
  if (!usedIds.has(tournament.id)) {
    usedIds.add(tournament.id);
    delete tournament.__stableId;
    continue;
  }

  if (tournament.__stableId) {
    const duplicate = tournaments.find(item => item !== tournament && item.id === tournament.id);
    if (duplicate && !duplicate.__stableId) {
      duplicate.id = nextFreeTournamentId(duplicate, usedIds, counters);
      usedIds.add(duplicate.id);
      usedIds.add(tournament.id);
      delete tournament.__stableId;
      continue;
    }
  }

  tournament.id = nextFreeTournamentId(tournament, usedIds, counters);
  usedIds.add(tournament.id);
  delete tournament.__stableId;
}

for (const tournament of tournaments) {
  if (isCancelledTournament(tournament)) tournament.status = 'cancelled';
}

const clubs = Object.values(clubMap)
  .filter((club, index, arr) => arr.findIndex(item => item.id === club.id) === index)
  .sort((a, b) => a.id.localeCompare(b.id))
  .map(club => ({ ...club, total_events: sourceClubCounts.get(club.id) || 0 }));

const ts = `// MPL 2026 - Donnees issues de CALENDRIER MPL 2026.xlsx / DATABASE
// Source officielle regeneree le 2026-09-14 depuis l'onglet DATABASE
// ${clubs.length} clubs · ${database.length} lignes calendrier · ${tournaments.length} evenements affichables
// Saison 10/01/2026 - 26/12/2026

export interface Club {
  id: string; name: string; slug: string; region: string; city: string;
  courts: number; contact: string; phone: string; total_events: number;
}

export interface Tournament {
  id: string; name: string; club_id: string; club_name: string; date: string;
  region: string; category: string; division: string; type: string;
  status: string; max_teams: number;
}

export const MPL_CLUBS: Club[] = [
${clubs.map(c => `  ${JSON.stringify(c).replace(/"([^"]+)":/g, '$1:').replace(/"/g, "'")}`).join(',\n')}
];

export const MPL_TOURNAMENTS: Tournament[] = [
${tournaments.map(t => `  ${JSON.stringify(t).replace(/"([^"]+)":/g, '$1:').replace(/"/g, "'")}`).join(',\n')}
];

export const getClubById = (id: string): Club | undefined =>
  MPL_CLUBS.find(c => c.id === id);

export const getTournamentsByClub = (club_id: string): Tournament[] =>
  MPL_TOURNAMENTS.filter(t => t.club_id === club_id);

export const getTournamentsByRegion = (region: string): Tournament[] => {
  if (region === 'all') return MPL_TOURNAMENTS;
  return MPL_TOURNAMENTS.filter(t => t.region === region);
};

export const getTournamentsByCategory = (category: string): Tournament[] => {
  if (category === 'all') return MPL_TOURNAMENTS;
  return MPL_TOURNAMENTS.filter(t => t.category === category);
};

export const getTournamentsByStatus = (status: string): Tournament[] => {
  if (status === 'all') return MPL_TOURNAMENTS;
  return MPL_TOURNAMENTS.filter(t => t.status === status);
};
`;

const sqlRows = tournaments.map(t => {
  const selection = ['M500', 'M1000'].includes(t.category) ? 'ranking' : 'registration';
  const minCourts = t.category === 'M1000' ? 4 : t.category === 'M500' ? 3 : 2;
  return `(${sql(t.id)}, ${sql(t.name)}, ${sql(t.club_id)}, ${sql(t.club_name)}, ${sql(t.date)}, ${sql(t.region)}, ${sql(t.category)}, ${sql(t.division)}, ${sql(t.type)}, ${sql(t.status)}, ${t.max_teams}, ${minCourts}, ${sql(selection)})`;
});

const sqlText = `-- MPL 2026 - Synchronisation calendrier officiel
-- Source: CALENDRIER MPL 2026.xlsx / onglet DATABASE
-- Genere le 2026-09-14

ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS tournament_date DATE;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS min_courts INTEGER DEFAULT 2;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS selection_mode TEXT DEFAULT 'registration';
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS max_teams INTEGER DEFAULT 16;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS teams_registered INTEGER DEFAULT 0;

CREATE TEMP TABLE _mpl2026_official_calendar (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  club_id TEXT NOT NULL,
  club_name TEXT NOT NULL,
  tournament_date DATE NOT NULL,
  region TEXT NOT NULL,
  category TEXT NOT NULL,
  division TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  max_teams INTEGER NOT NULL,
  min_courts INTEGER NOT NULL,
  selection_mode TEXT NOT NULL
);

INSERT INTO _mpl2026_official_calendar
  (id, name, club_id, club_name, tournament_date, region, category, division, type, status, max_teams, min_courts, selection_mode)
VALUES
${sqlRows.join(',\n')};

INSERT INTO public.tournaments
  (id, name, club_id, club_name, date, tournament_date, region, category, division, type, status, max_teams, min_courts, selection_mode)
SELECT id, name, club_id, club_name, tournament_date, tournament_date, region, category, division, type, status, max_teams, min_courts, selection_mode
FROM _mpl2026_official_calendar
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  club_id = EXCLUDED.club_id,
  club_name = EXCLUDED.club_name,
  date = EXCLUDED.date,
  tournament_date = EXCLUDED.tournament_date,
  region = EXCLUDED.region,
  category = EXCLUDED.category,
  division = EXCLUDED.division,
  type = EXCLUDED.type,
  status = EXCLUDED.status,
  max_teams = EXCLUDED.max_teams,
  min_courts = EXCLUDED.min_courts,
  selection_mode = EXCLUDED.selection_mode;

DELETE FROM public.tournaments t
WHERE (t.date BETWEEN DATE '2026-01-01' AND DATE '2026-12-31' OR t.tournament_date BETWEEN DATE '2026-01-01' AND DATE '2026-12-31')
  AND (t.id LIKE 't%' OR t.id LIKE 'j%')
  AND NOT EXISTS (SELECT 1 FROM _mpl2026_official_calendar o WHERE o.id = t.id)
  AND NOT EXISTS (SELECT 1 FROM public.tournament_results r WHERE r.tournament_id = t.id);

SELECT
  COUNT(*) AS total_lignes,
  COUNT(*) FILTER (WHERE category = 'M100') AS m100,
  COUNT(*) FILTER (WHERE category = 'M50') AS m50,
  COUNT(*) FILTER (WHERE tournament_date = DATE '2026-07-04') AS lignes_04_juillet
FROM public.tournaments
WHERE tournament_date BETWEEN DATE '2026-01-01' AND DATE '2026-12-31';
`;

fs.writeFileSync(outputTs, ts, 'utf8');
fs.writeFileSync(outputSql, sqlText, 'utf8');
console.log(`Generated ${outputTs}`);
console.log(`Generated ${outputSql}`);
console.log(`${database.length} source rows -> ${tournaments.length} display rows`);
console.log(`2026-07-04 rows:`);
for (const t of tournaments.filter(t => t.date === '2026-07-04')) {
  console.log(`- ${t.name} | ${t.category} | ${t.type} | ${t.region}`);
}
