const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');

const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.resolve(projectRoot, '..');
const outDir = path.join(projectRoot, 'exports', 'history');
const rankingFiles = [
  'Padel League - RANKINGS - DEC 23.xlsx',
  'Padel League - RANKINGS - DEC 24.xlsx',
  'Padel League - RANKINGS - DEC 25.xlsx',
  'Padel League - RANKINGS - JUN 26.xlsx',
];
const calendarFile = 'CALENDRIER MPL 2026.xlsx';
const historicalCalendarRoots = [
  { year: 2025, root: 'W:/PADEL LEAGUE/0 CALENDRIER 2025' },
  { year: 2024, root: 'W:/PADEL LEAGUE/0 CALENDRIER 2024' },
];
const historicalCalendarWorkbooks = [
  { file: 'W:/PADEL LEAGUE/0 CALENDRIER 2025/0 CALENDRIER 2025/Calendrier PadelLeague.xls', clone2024RowsTo2025: true },
];

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}
function norm(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = clean(value).replace(/,/g, '').replace(/\s/g, '');
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}
function roundUpPoints(value) {
  const num = toNumber(value);
  return num === null ? 0 : Math.ceil(num);
}
function parseRank(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rank = Math.trunc(value);
    return { label: String(rank), min: rank, max: rank };
  }
  const text = clean(value);
  const nums = text.match(/\d+/g)?.map(Number) || [];
  return { label: text, min: nums[0] || null, max: nums.length > 1 ? nums[nums.length - 1] : (nums[0] || null) };
}
function parseYearFromFile(fileName) {
  const match = fileName.match(/(?:DEC|JUN)\s+(\d{2})/i);
  return match ? 2000 + Number(match[1]) : null;
}
function snapshotLabelFromFile(fileName) {
  const match = fileName.match(/(DEC|JUN)\s+(\d{2})/i);
  return match ? match[1].toUpperCase() + ' 20' + match[2] : fileName.replace(/\.xlsx$/i, '');
}

function excelSerialToIso(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.trunc(value) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : '';
}
function monthNumber(value) {
  const n = norm(value);
  const months = [
    [/\bJAN|JANVIER|JANUARY/, 1],
    [/\bFEB|FEV|FEVRIER|FEBRUARY/, 2],
    [/\bMAR|MARS|MARCH/, 3],
    [/\bAPR|AVR|AVRIL|APRIL/, 4],
    [/\bMAY|MAI/, 5],
    [/\bJUN|JUIN|JUNE/, 6],
    [/\bJUL|JUIL|JUILLET|JULY/, 7],
    [/\bAUG|AOUT|AUGUST/, 8],
    [/\bSEP|SEPT|SEPTEMBER/, 9],
    [/\bOCT/, 10],
    [/\bNOV/, 11],
    [/\bDEC|DECEMBRE|DECEMBER/, 12],
  ];
  for (const [pattern, month] of months) if (pattern.test(n)) return month;
  return null;
}
function canonicalCalendarClub(value) {
  const n = norm(value);
  const aliases = [
    [/CANA|BEAU PLAN/, 'Caña Beau Plan'],
    [/CLUB MED|ALBION|CMA/, 'Club Med Albion'],
    [/ENERGIA/, 'Energia Pointe aux Canonniers'],
    [/HENESSY|HENNESSY|RM H/, 'I Padel by RM Hennessy'],
    [/PORT CHAMBLY|RM PC/, 'I Padel by RM Port Chambly'],
    [/ISLA/, 'Isla Padel Grand Baie'],
    [/LABOURDONNAIS|MAPOU|LSC/, 'Labourdonnais Mapou'],
    [/MOKA RANGERS/, 'Moka Rangers'],
    [/MONT CHOISY|MCG/, 'Mont Choisy Golf'],
    [/OXYGEN/, 'Oxygen'],
    [/RM FORBACH/, 'RM Club Grand Baie'],
    [/RM CLUB TAMARIN|RM TAMARIN|RM T/, 'RM Club Tamarin'],
    [/RM CLUB GRAND BAIE|RM GB|GRAND BAIE RM|FORBACH/, 'RM Club Grand Baie'],
    [/SPARC|CASCAVELLE/, 'SPARC Cascavelle'],
    [/STUDIO.*AZURI|RM A|AZURI/, 'Studio by RM Azuri'],
    [/TERRES BRUNES|TAMARIN BAY|\bTB\b/, 'Terres Brunes Sports & Leisure'],
    [/URBAN SPORT BLACK RIVER|URBAN SPORT RN|URBAN BR|URBAN RN/, 'Urban Sport Black River'],
    [/URBAN SPORT GRAND BAIE|URBAN SPORT GB|URBAN GB/, 'Urban Sport Grand Baie'],
    [/CLUB HOUSE BLACK RIVER|CLUBHOUSE|\bCH\b/, 'Club House Black River'],
  ];
  for (const [pattern, club] of aliases) if (pattern.test(n)) return club;
  return clean(value);
}
function normalizeCalendarCategory(value) {
  const n = norm(value);
  const match = n.match(/\b(M\s?25|M\s?50|M\s?100|M\s?250|M\s?500|M\s?1000|U\s?11|U\s?13|U\s?15|MIXED|MIXTE|JUNIOR)\b/);
  if (!match) return '';
  const category = match[1].replace(/\s/g, '');
  return category === 'MIXTE' ? 'MIXED' : category;
}
function addYearsToIso(iso, years) {
  if (!iso) return '';
  const date = new Date(iso + 'T00:00:00Z');
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}
function loadLegacyCalendarWorkbook(filePath, options = {}) {
  if (!fs.existsSync(filePath)) return [];
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const events = [];
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    for (const row of rows) {
      const eventDate = excelSerialToIso(row[1]);
      const clubRaw = clean(row[3]);
      const category = normalizeCalendarCategory(row[5]);
      if (!eventDate || !clubRaw || !category || /CANCELLED/i.test(String(row[1]))) continue;
      const base = {
        event_date: eventDate,
        month: Number(eventDate.slice(5, 7)),
        season: Number(eventDate.slice(0, 4)),
        club_raw: clubRaw,
        club_name: canonicalCalendarClub(clubRaw),
        region: '',
        category,
        type: row[6] && row[7] ? 'MEN&WOMEN' : (row[6] ? 'MEN' : (row[7] ? 'WOMEN' : '')),
      };
      events.push(base);
      if (options.clone2024RowsTo2025 && base.season === 2024) {
        const shifted = addYearsToIso(eventDate, 1);
        events.push({ ...base, event_date: shifted, month: Number(shifted.slice(5, 7)), season: 2025 });
      }
    }
  }
  return events;
}
function inferIsoFromPath(text, year) {
  const n = text.replace(/\\/g, '/');
  const numeric = n.match(/\b(20\d{2})[._-](\d{1,2})[._-](\d{1,2})\b/);
  if (numeric) return numeric[1] + '-' + String(numeric[2]).padStart(2, '0') + '-' + String(numeric[3]).padStart(2, '0');
  const month = monthNumber(n);
  if (!month) return '';
  const monthNames = 'JAN|FEB|FEV|MAR|APR|AVR|MAY|MAI|JUN|JUIN|JUNE|JUL|JUIL|AUG|AOUT|SEP|OCT|NOV|DEC';
  const before = n.match(new RegExp('(?:^|[\\s/_-])(\\d{1,2})(?:\\s*[/._-]\\s*\\d{1,2})?\\s*(?:' + monthNames + ')', 'i'));
  const after = n.match(new RegExp('(?:' + monthNames + ')\\s*(\\d{1,2})(?:\\s*[/._-]\\s*\\d{1,2})?', 'i'));
  const day = Number((before && before[1]) || (after && after[1]) || 1);
  return year + '-' + String(month).padStart(2, '0') + '-' + String(day || 1).padStart(2, '0');
}
function loadFilesystemResultEvents(root, year) {
  if (!fs.existsSync(root)) return [];
  const events = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { stack.push(full); continue; }
      const ext = path.extname(entry.name).toLowerCase();
      if (!['.pdf', '.xlsx', '.xls', '.ods'].includes(ext)) continue;
      const fullText = full.replace(/\\/g, ' / ');
      if (!/RESULT|RESULTS|MAIN DRAW|RANKING|ENTRY LIST/i.test(fullText)) continue;
      const category = normalizeCalendarCategory(fullText);
      const clubName = canonicalCalendarClub(fullText);
      if (!category || !clubName) continue;
      const eventDate = inferIsoFromPath(fullText, year);
      events.push({ event_date: eventDate, month: eventDate ? Number(eventDate.slice(5, 7)) : monthNumber(fullText), season: year, club_raw: clubName, club_name: clubName, region: '', category, type: norm(fullText) });
    }
  }
  return events;
}
function loadCalendarEvents() {
  const filePath = path.join(sourceDir, calendarFile);
  if (!fs.existsSync(filePath)) return [];
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheet = workbook.Sheets.DATABASE || workbook.Sheets.Database || workbook.Sheets.database;
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headerRow = findHeaderRow(rows, ['DATE', 'CLUB', 'CATEGORIE']);
  if (headerRow < 0) return [];
  const headers = rows[headerRow].map(norm);
  const dateIdx = headerIndex(headers, ['DATE']);
  const monthIdx = headerIndex(headers, ['MOIS', 'MONTH']);
  const clubIdx = headerIndex(headers, ['CLUB']);
  const regionIdx = headerIndex(headers, ['ZONE', 'REGION']);
  const categoryIdx = headerIndex(headers, ['CATEGORIE', 'CATEGORY']);
  const typeIdx = headerIndex(headers, ['TYPE']);
  const events = [];
  for (let r = headerRow + 1; r < rows.length; r += 1) {
    const row = rows[r];
    const clubRaw = clubIdx >= 0 ? clean(row[clubIdx]) : '';
    const category = categoryIdx >= 0 ? normalizeCalendarCategory(row[categoryIdx]) : '';
    if (!clubRaw || !category) continue;
    const eventDate = dateIdx >= 0 ? excelSerialToIso(row[dateIdx]) : '';
    events.push({
      event_date: eventDate,
      month: eventDate ? Number(eventDate.slice(5, 7)) : (monthIdx >= 0 ? monthNumber(row[monthIdx]) : null),
      season: eventDate ? Number(eventDate.slice(0, 4)) : 2026,
      club_raw: clubRaw,
      club_name: canonicalCalendarClub(clubRaw),
      region: regionIdx >= 0 ? clean(row[regionIdx]) : '',
      category,
      type: typeIdx >= 0 ? norm(row[typeIdx]) : '',
    });
  }
  for (const item of historicalCalendarWorkbooks) events.push(...loadLegacyCalendarWorkbook(item.file, item));
  for (const item of historicalCalendarRoots) events.push(...loadFilesystemResultEvents(item.root, item.year));
  return events;
}
function calendarCategoryCompatible(sheetCategory, calendarCategory, division) {
  if (!sheetCategory || !calendarCategory) return true;
  if (division === 'junior') return calendarCategory === 'JUNIOR' || calendarCategory === sheetCategory;
  if (division === 'mixed') return calendarCategory === 'MIXED' || sheetCategory === 'MIXED';
  return sheetCategory === calendarCategory;
}
function calendarTypeCompatible(type, division) {
  if (!type || type === 'NOT SPECIFIED') return true;
  if (division === 'men') return /\bMEN\b|MEN WOMEN|MEN&WOMEN|HOMMES/.test(type) && !/WOMEN ONLY/.test(type);
  if (division === 'women') return /\bWOMEN\b|\bWOM\b|MEN WOMEN|MEN&WOMEN|DAMES|FEMMES/.test(type);
  if (division === 'mixed') return /MIXED|MIXTE/.test(type);
  if (division === 'junior') return /JUNIOR|U11|U13|U15/.test(type);
  return true;
}

function manualCalendarFallback(sheetName, meta) {
  if (![2023, 2024, 2025, 2026].includes(meta.season)) return null;
  const n = norm(sheetName);
  const rows = [
    [/\bM500\b.*URBAN.*OCT.*23/, '2023-10-13', 'Urban Sport Grand Baie', 'NORD'],
    [/\bM1000\b.*RM.*OCT.*23/, '2023-10-16', 'RM Club Grand Baie', 'NORD'],
    [/\bM500\b.*RM.*NOV.*23/, '2023-11-11', 'RM Club Grand Baie', 'NORD'],
    [/\bM500\b.*AZURI.*SEP.*23/, '2023-09-19', 'Oxygen', 'EST'],
    [/\bM500\b.*ISLA.*DEC.*23/, '2023-12-01', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM500\b.*AZURI.*JAN.*24/, '2024-01-12', 'Oxygen', 'EST'],
    [/\bM500\b.*AZURI.*FEB.*24.*MIXED/, '2024-02-24', 'Oxygen', 'EST'],
    [/\bM100\b.*AZURI.*FEB.*24/, '2024-02-23', 'Oxygen', 'EST'],
    [/\bM250\b.*AZURI.*MAR.*24/, '2024-03-23', 'Oxygen', 'EST'],
    [/\bM100\b.*AZURI.*APR.*24/, '2024-04-28', 'Oxygen', 'EST'],
    [/\bM250\b.*ISLA.*JAN.*24/, '2024-01-06', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM100\b.*ISLA.*MAR.*24/, '2024-03-02', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM500\b.*ISLA.*APR.*24/, '2024-04-12', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM100\b.*ISLA.*MAY.*24.*MEN$/, '2024-05-24', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM100\b.*ISLA.*MAY.*24.*WOMEN$/, '2024-05-31', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM100\b.*ISLA.*JUN.*24/, '2024-06-29', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM25\b.*ISLA.*AUG.*24/, '2024-08-25', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM100\b.*ISLA.*OCT.*24/, '2024-10-19', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM250\b.*ISLA.*JUL.*24.*2/, '2024-07-26', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM250\b.*ISLA.*JUL.*24/, '2024-07-06', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM250\b.*ISLA.*SEP.*24/, '2024-09-07', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM1000\b.*ISLA.*NOV.*24/, '2024-11-08', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM25\b.*ISLA.*DEC.*24/, '2024-12-07', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM100\b.*RM.*APR.*24/, '2024-04-06', 'RM Club Grand Baie', 'NORD'],
    [/\bM100\b.*RM.*MAY.*24/, '2024-05-04', 'RM Club Grand Baie', 'NORD'],
    [/\bM100\b.*RM.*JUL.*24/, '2024-07-06', 'RM Club Grand Baie', 'NORD'],
    [/\bM100\b.*RM.*AUG.*24/, '2024-08-31', 'RM Club Grand Baie', 'NORD'],
    [/\bM100\b.*RM.*NOV.*24/, '2024-11-30', 'RM Club Tamarin', 'OUEST'],
    [/\bM25\b.*RM.*JUL.*24/, '2024-07-06', 'RM Club Grand Baie', 'NORD'],
    [/\bM250\b.*RM.*AUG.*24/, '2024-08-03', 'RM Club Grand Baie', 'NORD'],
    [/\bM250\b.*RM.*SEP.*24/, '2024-09-21', 'RM Club Grand Baie', 'NORD'],
    [/\bM250\b.*RM.*OCT.*24/, '2024-10-12', 'RM Club Grand Baie', 'NORD'],
    [/\bM250\b.*RM.*NOV.*24.*2/, '2024-11-23', 'RM Club Grand Baie', 'NORD'],
    [/\bM250\b.*RM.*NOV.*24/, '2024-11-02', 'RM Club Tamarin', 'OUEST'],
    [/\bM25\b.*RM.*DEC.*24/, '2024-12-28', 'RM Club Grand Baie', 'NORD'],
    [/\bM500\b.*RM.*MAR.*24/, '2024-03-08', 'RM Club Grand Baie', 'NORD'],
    [/\bM500\b.*RM.*JUN.*24.*MIXED/, '2024-06-22', 'RM Club Grand Baie', 'NORD'],
    [/\bM500\b.*RM.*JUN.*24/, '2024-06-07', 'RM Club Grand Baie', 'NORD'],
    [/\bM500\b.*RM.*AUG.*24/, '2024-08-10', 'RM Club Tamarin', 'OUEST'],
    [/\bM500\b.*RM.*OCT.*24/, '2024-10-19', 'RM Club Tamarin', 'OUEST'],
    [/\bM500\b.*RM.*DEC.*24.*MIXED/, '2024-12-14', 'RM Club Tamarin', 'OUEST'],
    [/\bM100\b.*LSC.*SEP.*24/, '2024-09-21', 'Labourdonnais Mapou', 'NORD'],
    [/\bM25\b.*LSC.*OCT.*24/, '2024-10-26', 'Labourdonnais Mapou', 'NORD'],
    [/\bM100\b.*LSC.*NOV.*24/, '2024-11-23', 'Labourdonnais Mapou', 'NORD'],
    [/\bM250\b.*LSC.*DEC.*24/, '2024-12-21', 'Labourdonnais Mapou', 'NORD'],
    [/\bM25\b.*URBAN.*JAN.*24/, '2024-01-20', 'Urban Sport Grand Baie', 'NORD'],
    [/\bM250\b.*URBAN.*JAN.*24/, '2024-01-20', 'Urban Sport Black River', 'OUEST'],
    [/\bM100\b.*URBAN.*MAR.*24/, '2024-03-16', 'Urban Sport Grand Baie', 'NORD'],
    [/\bM25\b.*URBAN.*MAR.*24/, '2024-03-16', 'Urban Sport Black River', 'OUEST'],
    [/\bM250\b.*URBAN.*APR.*24/, '2024-04-20', 'Urban Sport Grand Baie', 'NORD'],
    [/\bM250\b.*URBAN.*FEB.*24/, '2024-02-17', 'Urban Sport Grand Baie', 'NORD'],
    [/\bM250\b.*URBAN.*AUG.*24/, '2024-08-31', 'Urban Sport Grand Baie', 'NORD'],
    [/\bM250\b.*URBAN.*DEC.*24/, '2024-12-14', 'Urban Sport Black River', 'OUEST'],
    [/\bM500\b.*URBAN.*APR.*24.*MIXED/, '2024-04-27', 'Urban Sport Black River', 'OUEST'],
    [/\bM100\b.*URBAN.*MAY.*24/, '2024-05-18', 'Urban Sport Black River', 'OUEST'],
    [/\bM25\b.*URBAN.*MAY.*24/, '2024-05-25', 'Urban Sport Grand Baie', 'NORD'],
    [/\bM250\b.*URBAN.*MAY.*24/, '2024-05-25', 'Urban Sport Black River', 'OUEST'],
    [/\bM25\b.*URBAN.*JUN.*24/, '2024-06-08', 'Urban Sport Grand Baie', 'NORD'],
    [/\bM250\b.*URBAN.*JUN.*24/, '2024-06-29', 'Urban Sport Black River', 'OUEST'],
    [/\bM100\b.*URBAN.*JUN.*24/, '2024-06-15', 'Urban Sport Grand Baie', 'NORD'],
    [/\bM100\b.*URBAN.*JUL.*24.*2/, '2024-07-27', 'Urban Sport Grand Baie', 'NORD'],
    [/\bM100\b.*URBAN.*JUL.*24/, '2024-07-06', 'Urban Sport Black River', 'OUEST'],
    [/\bM100\b.*URBAN.*SEP.*24/, '2024-09-21', 'Urban Sport Grand Baie', 'NORD'],
    [/\bM25\b.*URBAN.*SEP.*24/, '2024-09-21', 'Urban Sport Black River', 'OUEST'],
    [/\bM100\b.*URBAN.*OCT.*24/, '2024-10-12', 'Urban Sport Black River', 'OUEST'],
    [/\bM100\b.*URBAN.*NOV.*24/, '2024-11-16', 'Urban Sport Black River', 'OUEST'],
    [/\bM250\b.*URBAN.*NOV.*24/, '2024-11-16', 'Urban Sport Grand Baie', 'NORD'],
    [/\bM500\b.*URBAN.*FEB.*24/, '2024-02-09', 'Urban Sport Black River', 'OUEST'],
    [/\bM500\b.*URBAN.*MAY.*24/, '2024-05-10', 'Urban Sport Grand Baie', 'NORD'],
    [/\bM500\b.*URBAN.*JUL.*24/, '2024-07-12', 'Urban Sport Black River', 'OUEST'],
    [/\bM500\b.*URBAN.*SEP.*24/, '2024-09-13', 'Urban Sport Grand Baie', 'NORD'],
    [/\bM500\b.*URBAN.*DEC.*24/, '2024-12-06', 'Oxygen', 'EST'],
    [/\bM100\b.*ENERGIA.*NOV.*24/, '2024-11-02', 'Energia Pointe aux Canonniers', 'NORD'],
    [/\bM250\b.*ENERGIA.*OCT.*24/, '2024-10-26', 'Energia Pointe aux Canonniers', 'NORD'],
    [/\bM25\b.*ENERGIA.*DEC.*24/, '2024-12-01', 'Energia Pointe aux Canonniers', 'NORD'],
    [/\bM1000\b.*ISLA.*APR.*25/, '2025-04-11', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM1000\b.*URBAN.*BR.*NOV.*25/, '2025-10-31', 'Urban Sport Black River', 'OUEST'],
    [/\bM500\b.*ISLA.*FEB.*25/, '2025-02-14', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM500\b.*SPARC.*FEB.*25.*MIXED/, '2025-02-22', 'SPARC Cascavelle', 'OUEST'],
    [/\bM500\b.*URBAN.*BR.*MAR.*25/, '2025-03-07', 'Urban Sport Black River', 'OUEST'],
    [/\bM500\b.*RM.*T.*APR.*25.*MIXED/, '2025-04-19', 'RM Club Tamarin', 'OUEST'],
    [/\bM500\b.*LSC.*MAY.*25/, '2025-05-16', 'Labourdonnais Mapou', 'NORD'],
    [/\bM500\b.*RM.*PC.*JUL.*25/, '2025-07-11', 'I Padel by RM Port Chambly', 'CENTRE'],
    [/\bM500\b.*SPARC.*AUG.*25/, '2025-08-08', 'SPARC Cascavelle', 'OUEST'],
    [/\bM500\b.*RM.*A.*SEP.*25/, '2025-09-19', 'Studio by RM Azuri', 'EST'],
    [/\bM500\b.*URBAN.*GB.*OCT.*25/, '2025-10-17', 'Urban Sport Grand Baie', 'NORD'],
    [/\bM500\b.*RM.*PC.*OCT.*25.*MIXED/, '2025-10-04', 'I Padel by RM Port Chambly', 'CENTRE'],
    [/\bM500\b.*RM.*H.*DEC.*25/, '2025-12-12', 'I Padel by RM Hennessy', 'CENTRE'],
    [/\bM100\b.*ENERGIA.*APR.*25/, '2025-04-26', 'Energia Pointe aux Canonniers', 'NORD'],
    [/\bM100\b.*ENERGIA.*AUG.*25/, '2025-08-09', 'Energia Pointe aux Canonniers', 'NORD'],
    [/\bM100\b.*RM.*PC.*DEC.*25/, '2025-12-27', 'I Padel by RM Port Chambly', 'CENTRE'],
    [/\bM25\b.*ENERGIA.*MAR.*25/, '2025-03-29', 'Energia Pointe aux Canonniers', 'NORD'],
    [/\bM25\b.*ISLA.*SEP.*25/, '2025-09-06', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM25\b.*RM.*A.*APR.*25/, '2025-04-19', 'Studio by RM Azuri', 'EST'],
    [/\bM25\b.*RM.*PC.*OCT.*25/, '2025-10-18', 'I Padel by RM Port Chambly', 'CENTRE'],
    [/\bM25\b.*SPARC.*APR.*25/, '2025-04-12', 'SPARC Cascavelle', 'OUEST'],
    [/\bM25\b.*RM.*GB.*JUL.*25/, '2025-07-05', 'RM Club Grand Baie', 'NORD'],
    [/\bM25\b.*RM.*GB.*MAY.*25/, '2025-05-03', 'RM Club Grand Baie', 'NORD'],
    [/\bM25\b.*RM.*H.*JUL.*25/, '2025-07-05', 'I Padel by RM Hennessy', 'CENTRE'],
    [/\bM25\b.*RM.*H.*MAY.*25/, '2025-05-19', 'I Padel by RM Hennessy', 'CENTRE'],
    [/\bM250\b.*RM.*GB.*JAN.*25/, '2025-01-18', 'RM Club Grand Baie', 'NORD'],
    [/\bM250\b.*RM.*GB.*MAR.*25/, '2025-03-22', 'RM Club Grand Baie', 'NORD'],
    [/\bM250\b.*RM.*GB.*APR.*25/, '2025-04-26', 'RM Club Grand Baie', 'NORD'],
    [/\bM250\b.*ISLA.*MAY.*25/, '2025-05-24', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM250\b.*RM.*PC.*JUN.*25/, '2025-06-22', 'I Padel by RM Port Chambly', 'CENTRE'],
    [/\bM250\b.*ISLA.*JUL.*25/, '2025-07-12', 'Isla Padel Beau Plan', 'NORD'],
    [/\bM250\b.*RM.*GB.*SEP.*25/, '2025-09-27', 'RM Club Grand Baie', 'NORD'],
    [/\bM250\b.*RM.*T.*DEC.*25/, '2025-12-27', 'RM Club Tamarin', 'OUEST'],
    [/\bM1000\b.*SPARC.*MAR/, '2026-03-14', 'SPARC Cascavelle', 'OUEST'],
    [/\bM1000\b.*JUN.*25/, '2025-06-06', 'RM Club Tamarin', 'OUEST'],
    [/\bM100\b.*CMA.*MAR|M100.*CLUB MED.*MAR/, '2026-03-28', 'Club Med Albion', 'OUEST'],
    [/\bM250\b.*ENERGIA.*MAY/, '2026-05-23', 'Energia Pointe aux Canonniers', 'NORD'],
    [/\bM50\b.*OXYGEN.*FEB.*26/, '2026-02-21', 'Oxygen Moka', 'CENTRE'],
    [/\bM250\b.*OXYGEN.*APR.*26/, '2026-04-11', 'Oxygen Moka', 'CENTRE'],
    [/\bM25\b.*OXYGEN.*MAY.*26/, '2026-05-16', 'Oxygen Moka', 'CENTRE'],
    [/\bM500\b.*RM GB.*JUN.*U15/, '2026-06-13', 'RM Club Grand Baie', 'NORD'],
    [/\bM500\b.*ISLA.*JUN.*U15/, '2026-05-09', 'Isla Padel Grand Baie', 'NORD'],
  ];
  for (const [pattern, event_date, club_name, region] of rows) {
    if (pattern.test(n)) return { event_date, club_name, region };
  }
  return null;
}

function findCalendarEvent(sheetName, meta, calendarEvents) {
  if (!calendarEvents.length) return null;
  const month = monthNumber(sheetName);
  let candidates = calendarEvents.filter((event) => {
    if (event.season && event.season !== meta.season) return false;
    if (month && event.month && month !== event.month) return false;
    if (!calendarCategoryCompatible(meta.category, event.category, meta.division)) return false;
    return calendarTypeCompatible(event.type, meta.division);
  });
  const inferredClub = inferClubName(sheetName);
  if (inferredClub) {
    const sameClub = candidates.filter((event) => event.club_name === inferredClub);
    if (sameClub.length) candidates = sameClub;
    const dated = candidates.filter((event) => event.event_date);
    const uniqueDates = new Set(dated.map((event) => event.event_date));
    if (uniqueDates.size === 1) return dated[0];
  }
  const uniqueKeys = new Set(candidates.map((event) => `${event.club_name}|${event.event_date}|${event.category}|${event.type}`));
  if (uniqueKeys.size === 1) return candidates[0];
  const uniqueClubs = new Set(candidates.map((event) => event.club_name).filter(Boolean));
  if (!inferredClub && uniqueClubs.size === 1) return candidates.find((event) => event.event_date) || candidates[0];
  return candidates.length === 1 ? candidates[0] : null;
}
const calendarEvents = loadCalendarEvents();

function detectDivision(text) {
  const n = norm(text);
  if (/\bMIXED\b|\bMIXTE\b/.test(n)) return { division: 'mixed', juniorCategory: '' };
  if (/\bWOMEN\b|\bWOM\b|\bDAMES\b|\bFEMMES\b/.test(n)) return { division: 'women', juniorCategory: '' };
  if (/\bU\s?11\b/.test(n)) return { division: 'junior', juniorCategory: 'U11' };
  if (/\bU\s?13\b/.test(n)) return { division: 'junior', juniorCategory: 'U13' };
  if (/\bU\s?15\b/.test(n)) return { division: 'junior', juniorCategory: 'U15' };
  if (/\bJUNIOR\b|\bU\s?10\b|\bU\s?12\b|\bU\s?14\b/.test(n)) return { division: 'junior', juniorCategory: '' };
  return { division: 'men', juniorCategory: '' };
}
function inferClubName(eventName) {
  const n = norm(eventName);
  const aliases = [
    [/\bSPARC\b|CASCAVELLE/, 'SPARC Cascavelle'],
    [/\bM500\b.*AZURI.*SEP.*23/, 'Oxygen'],
    [/\bM500\b.*ISLA.*DEC.*23/, 'Isla Padel Beau Plan'],
    [/\bM500\b.*URBAN.*OCT.*23/, 'Urban Sport Grand Baie'],
    [/\bM1000\b.*RM.*OCT.*23|M500.*RM.*NOV.*23/, 'RM Club Grand Baie'],
    [/\bRM\s*GB\b|FORBACH/, 'RM Club Grand Baie'],
    [/\bRM\s*H\b|HENESSY|HENNESSY/, 'I Padel by RM Hennessy'],
    [/\bRM\s*T\b/, 'RM Club Tamarin'],
    [/\bRM\s*PC\b|PORT CHAMBLY/, 'I Padel by RM Port Chambly'],
    [/\bURBAN\s*BR\b/, 'Urban Sport Black River'],
    [/\bURBAN\s*GB\b/, 'Urban Sport Grand Baie'],
    [/\bCH\b|CLUBHOUSE|CLUB HOUSE/, 'Club House Black River'],
    [/\bRM\s*A\b|AZURI/, 'Studio by RM Azuri'],
    [/\bISLA\b/, 'Isla Padel Grand Baie'],
    [/\bLSC\b|LABOURDONNAIS/, 'Labourdonnais Mapou'],
    [/\bCANA\b|CAÑA|CANA BEAU PLAN|BEAU PLAN/, 'Caña Beau Plan'],
    [/\bTB\b|TERRES BRUNES|TAMARIN BAY/, 'Terres Brunes Sports & Leisure'],
    [/\bCMA\b|CLUB MED|ALBION/, 'Club Med Albion'],
    [/\bMCG\b|MONT CHOISY/, 'Mont Choisy Golf'],
    [/OXYGEN/, 'Oxygen Moka'],
    [/ENERGIA/, 'Energia Pointe aux Canonniers'],
    [/MOKA RANGERS/, 'Moka Rangers'],
  ];
  for (const [pattern, club] of aliases) if (pattern.test(n)) return club;
  return '';
}
function parseEventMeta(sheetName) {
  const { division, juniorCategory } = detectDivision(sheetName);
  const categoryMatch = norm(sheetName).match(/\b(M\s?25|M\s?50|M\s?100|M\s?250|M\s?500|M\s?1000|U\s?11|U\s?13|U\s?15)\b/);
  let category = categoryMatch ? categoryMatch[1].replace(/\s/g, '') : '';
  if (division === 'junior' && juniorCategory) category = juniorCategory;
  const yearTokens = sheetName.match(/(?:20)?\d{2}/g) || [];
  const season = yearTokens.map((y) => Number(y.length === 2 ? `20${y}` : y)).filter((y) => y >= 2023 && y <= 2026).pop() || 2025;
  const eventName = clean(sheetName);
  const sheetEventKey = norm(`${season} ${division} ${category} ${eventName}`).toLowerCase().replace(/\s+/g, '-');
  const baseMeta = { eventName, eventKey: sheetEventKey, eventYear: season, season, category, division, juniorCategory };
  const matchedCalendarEvent = findCalendarEvent(sheetName, baseMeta, calendarEvents);
  const fallbackCalendarEvent = manualCalendarFallback(sheetName, baseMeta);
  const calendarEvent = matchedCalendarEvent?.event_date ? matchedCalendarEvent : (fallbackCalendarEvent || matchedCalendarEvent);
  let clubName = calendarEvent?.club_name || inferClubName(sheetName);
  if ((baseMeta.season === 2024 || baseMeta.season === 2025) && /\bISLA\b/i.test(sheetName)) {
    clubName = 'Isla Padel Beau Plan';
  }
  if (/^Labourdonnais Sports Club$/i.test(clubName)) {
    clubName = 'Labourdonnais Mapou';
  }
  const eventDate = calendarEvent?.event_date || '';
  const region = calendarEvent?.region || '';
  const calendarEventKey = eventDate
    ? norm(`${eventDate} ${division} ${category} ${clubName}`).toLowerCase().replace(/\s+/g, '-')
    : sheetEventKey;
  return { ...baseMeta, eventKey: calendarEventKey, clubName, eventDate, region };
}
function findHeaderRow(rows, required) {
  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
    const headers = rows[i].map(norm);
    if (required.every((token) => headers.some((h) => h.includes(token)))) return i;
  }
  return -1;
}
function headerIndex(headers, candidates, start = 0) {
  for (let i = start; i < headers.length; i += 1) {
    if (candidates.some((candidate) => headers[i] === candidate || headers[i].includes(candidate))) return i;
  }
  return -1;
}
function escapeCsv(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function writeCsv(fileName, rows, columns) {
  const lines = [columns.join(';')];
  for (const row of rows) lines.push(columns.map((col) => escapeCsv(row[col])).join(';'));
  fs.writeFileSync(path.join(outDir, fileName), lines.join('\n'), 'utf8');
}
function sqlValue(value) {
  if (value === null || value === undefined || value === '') return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}
function insertSql(table, rows, columns, chunkSize = 350) {
  const blocks = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const values = rows.slice(i, i + chunkSize).map((row) => `(${columns.map((col) => sqlValue(row[col])).join(', ')})`).join(',\n');
    blocks.push(`insert into public.${table} (${columns.join(', ')}) values\n${values};`);
  }
  return blocks.join('\n\n');
}
function extractRankingSnapshots() {
  const out = [];
  for (const fileName of rankingFiles) {
    const workbook = XLSX.readFile(path.join(sourceDir, fileName), { cellDates: false });
    const snapshotYear = parseYearFromFile(fileName);
    for (const sheetName of workbook.SheetNames) {
      if (!/^RANKING/i.test(sheetName)) continue;
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
      const headerRow = findHeaderRow(rows, ['RANK', 'PLAYER']);
      if (headerRow < 0) continue;
      const headers = rows[headerRow].map(norm);
      const rankIdx = headerIndex(headers, ['RANK']);
      const playerIdx = headerIndex(headers, ['PLAYERS', 'PLAYER', 'JOUEUR']);
      const pointsIdx = headerIndex(headers, ['TOTAL POINTS', 'POINTS']);
      const secondRankIdx = headerIndex(headers, ['RANK'], rankIdx + 1);
      if (rankIdx < 0 || playerIdx < 0 || pointsIdx < 0) continue;
      const { division, juniorCategory } = detectDivision(sheetName);
      for (let r = headerRow + 1; r < rows.length; r += 1) {
        const row = rows[r];
        const playerName = clean(row[playerIdx]).toUpperCase();
        const rank = parseRank(row[rankIdx]);
        const totalPoints = roundUpPoints(row[pointsIdx]);
        if (!playerName || playerName === 'PLAYERS' || !rank.min || totalPoints <= 0) continue;
        const rankBefore = secondRankIdx >= 0 && secondRankIdx < playerIdx ? toNumber(row[secondRankIdx]) : null;
        out.push({ id: crypto.randomUUID(), source_file: fileName, snapshot_year: snapshotYear, snapshot_label: snapshotLabelFromFile(fileName), division, junior_category: juniorCategory, rank: rank.min, rank_label: rank.label, rank_before: rankBefore === null ? null : Math.trunc(rankBefore), player_name: playerName, total_points: totalPoints, season: snapshotYear });
      }
    }
  }
  return out;
}
function eventResultSourceYear(fileName) {
  const year = parseYearFromFile(fileName);
  return year === 2026 ? 2026 : year;
}
function eventResultSourceIsCanonical(fileName, meta) {
  const sourceYear = eventResultSourceYear(fileName);
  return Boolean(sourceYear && meta.season === sourceYear);
}
function eventResultDedupeKey(row) {
  const players = [row.player1_name, row.player2_name].filter(Boolean).sort().join('|');
  return [
    row.event_date || row.season,
    norm(row.event_key || row.sheet_name),
    row.division,
    row.category,
    row.rank_label,
    row.points,
    players,
  ].join('::');
}
function extractTournamentResults() {
  const out = [];
  const seen = new Set();
  for (const fileName of rankingFiles) {
    const workbook = XLSX.readFile(path.join(sourceDir, fileName), { cellDates: false });
    for (const sheetName of workbook.SheetNames) {
      if (/^RANKING/i.test(sheetName)) continue;
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
      const headerRow = findHeaderRow(rows, ['RANK', 'PLAYER', 'POINTS']);
      if (headerRow < 0) continue;
      const headers = rows[headerRow].map(norm);
      const rankIdx = headerIndex(headers, ['RANK']);
      const teamIdx = headerIndex(headers, ['TEAM']);
      const p1Idx = headerIndex(headers, ['PLAYER 1', 'PLAYER1']);
      const p2Idx = headerIndex(headers, ['PLAYER 2', 'PLAYER2']);
      const pointsIdx = headerIndex(headers, ['POINTS']);
      if (rankIdx < 0 || p1Idx < 0 || pointsIdx < 0) continue;
      const meta = parseEventMeta(sheetName);
      if (!eventResultSourceIsCanonical(fileName, meta)) continue;
      for (let r = headerRow + 1; r < rows.length; r += 1) {
        const row = rows[r];
        const player1 = clean(row[p1Idx]).toUpperCase();
        const player2 = p2Idx >= 0 ? clean(row[p2Idx]).toUpperCase() : '';
        const points = roundUpPoints(row[pointsIdx]);
        if (!player1 || points <= 0) continue;
        const rank = parseRank(row[rankIdx]);
        const result = { id: crypto.randomUUID(), source_file: fileName, sheet_name: sheetName, event_key: meta.eventKey, event_name: meta.eventName, event_year: meta.eventYear, season: meta.season, category: meta.category, division: meta.division, junior_category: meta.juniorCategory, club_name: meta.clubName, event_date: meta.eventDate, region: meta.region, rank_label: rank.label, rank_min: rank.min, rank_max: rank.max, team_name: teamIdx >= 0 ? clean(row[teamIdx]).toUpperCase() : '', player1_name: player1, player2_name: player2, points };
        const key = eventResultDedupeKey(result);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(result);
      }
    }
  }
  return out;
}
function countBy(rows, key) {
  return rows.reduce((acc, row) => { const value = row[key] || 'unknown'; acc[value] = (acc[value] || 0) + 1; return acc; }, {});
}
function writeIntegrityAudit(results) {
  const playerStats = new Map();
  const eventSources = new Map();
  const rowKeys = new Map();
  const noDateRows = [];

  for (const row of results) {
    const players = [row.player1_name, row.player2_name].filter(Boolean);
    for (const player of players) {
      const stats = playerStats.get(player) || { player_name: player, total: 0, season_2023: 0, season_2024: 0, season_2025: 0, season_2026: 0 };
      stats.total += 1;
      const seasonKey = `season_${row.season}`;
      if (seasonKey in stats) stats[seasonKey] += 1;
      playerStats.set(player, stats);
    }

    const eventKey = [row.season, row.sheet_name, row.division, row.category].join('|');
    const eventSourceSet = eventSources.get(eventKey) || new Set();
    eventSourceSet.add(row.source_file);
    eventSources.set(eventKey, eventSourceSet);

    const playerPair = players.slice().sort().join('|');
    const rowKey = [row.season, row.sheet_name, row.division, row.category, row.rank_label, row.points, playerPair].join('|');
    rowKeys.set(rowKey, (rowKeys.get(rowKey) || 0) + 1);

    if (!row.event_date) noDateRows.push(row);
  }

  const playerRows = Array.from(playerStats.values()).sort((a, b) => b.total - a.total || a.player_name.localeCompare(b.player_name));
  writeCsv('historical_player_audit.csv', playerRows, ['player_name', 'total', 'season_2023', 'season_2024', 'season_2025', 'season_2026']);

  const issueRows = [];
  for (const row of noDateRows) {
    issueRows.push({ issue: 'missing_date', season: row.season, sheet_name: row.sheet_name, club_name: row.club_name, source_file: row.source_file, player1_name: row.player1_name, player2_name: row.player2_name, rank_label: row.rank_label, points: row.points });
  }
  for (const [key, count] of rowKeys.entries()) {
    if (count > 1) issueRows.push({ issue: `duplicate_result_row_x${count}`, season: '', sheet_name: key, club_name: '', source_file: '', player1_name: '', player2_name: '', rank_label: '', points: '' });
  }
  for (const [key, sourceSet] of eventSources.entries()) {
    if (sourceSet.size > 1) issueRows.push({ issue: 'duplicate_event_sources', season: '', sheet_name: key, club_name: '', source_file: Array.from(sourceSet).join('|'), player1_name: '', player2_name: '', rank_label: '', points: '' });
  }
  writeCsv('historical_integrity_issues.csv', issueRows, ['issue', 'season', 'sheet_name', 'club_name', 'source_file', 'player1_name', 'player2_name', 'rank_label', 'points']);

  return {
    players: playerRows.length,
    with2023: playerRows.filter((row) => row.season_2023 > 0).length,
    with2024: playerRows.filter((row) => row.season_2024 > 0).length,
    with2025: playerRows.filter((row) => row.season_2025 > 0).length,
    with2026: playerRows.filter((row) => row.season_2026 > 0).length,
    duplicateEventGroups: Array.from(eventSources.values()).filter((set) => set.size > 1).length,
    duplicateResultRows: Array.from(rowKeys.values()).filter((count) => count > 1).length,
    noDateRows: noDateRows.length,
  };
}

fs.mkdirSync(outDir, { recursive: true });
const snapshots = extractRankingSnapshots();
const results = extractTournamentResults();
const snapshotColumns = ['id', 'source_file', 'snapshot_year', 'snapshot_label', 'division', 'junior_category', 'rank', 'rank_label', 'rank_before', 'player_name', 'total_points', 'season'];
const resultColumns = ['id', 'source_file', 'sheet_name', 'event_key', 'event_name', 'event_year', 'season', 'category', 'division', 'junior_category', 'club_name', 'event_date', 'region', 'rank_label', 'rank_min', 'rank_max', 'team_name', 'player1_name', 'player2_name', 'points'];
writeCsv('historical_ranking_snapshots.csv', snapshots, snapshotColumns);
writeCsv('historical_tournament_results.csv', results, resultColumns);
const integrityAudit = writeIntegrityAudit(results);
const sql = ['begin;', "delete from public.historical_ranking_snapshots where source_file in ('Padel League - RANKINGS - DEC 23.xlsx', 'Padel League - RANKINGS - DEC 24.xlsx', 'Padel League - RANKINGS - DEC 25.xlsx', 'Padel League - RANKINGS - JUN 26.xlsx');", "delete from public.historical_tournament_results where source_file in ('Padel League - RANKINGS - DEC 23.xlsx', 'Padel League - RANKINGS - DEC 24.xlsx', 'Padel League - RANKINGS - DEC 25.xlsx', 'Padel League - RANKINGS - JUN 26.xlsx');", insertSql('historical_ranking_snapshots', snapshots, snapshotColumns), insertSql('historical_tournament_results', results, resultColumns), 'commit;'].filter(Boolean).join('\n\n');
fs.writeFileSync(path.join(outDir, 'historical_import.sql'), sql, 'utf8');
const uniquePlayers = new Set();
for (const row of results) { if (row.player1_name) uniquePlayers.add(row.player1_name); if (row.player2_name) uniquePlayers.add(row.player2_name); }
const summary = { sourceDir, generatedAt: new Date().toISOString(), strategy: 'Event details are imported from the canonical workbook for each season: DEC23 for 2023, DEC24 for 2024, DEC25 for 2025, JUN26 for 2026. Older repeated sheets inside later workbooks are skipped to avoid duplicated tournaments. All four files are still imported as ranking snapshots.', snapshots: { rows: snapshots.length, byYear: countBy(snapshots, 'snapshot_year'), byDivision: countBy(snapshots, 'division') }, tournamentResults: { rows: results.length, uniquePlayers: uniquePlayers.size, bySourceFile: countBy(results, 'source_file'), bySeason: countBy(results, 'season'), byDivision: countBy(results, 'division'), byCategory: countBy(results, 'category'), withCalendarDate: results.filter((row) => row.event_date).length, withClub: results.filter((row) => row.club_name).length }, integrityAudit };
fs.writeFileSync(path.join(outDir, 'historical_summary.json'), JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify(summary, null, 2));
