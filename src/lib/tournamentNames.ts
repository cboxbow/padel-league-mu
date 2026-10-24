export function normalizeJuniorCategory(category: string): string {
  return category
    .replace(/\bU10\b/g, 'U11')
    .replace(/\bU12\b/g, 'U13')
    .replace(/\bU14\b/g, 'U15');
}

// Noms d'onglets du classeur / des PDF officiels ("M500 - RM T - JAN 26 - MEN",
// "M100 ISLA   - AUG 26 - WOMEN") : on ne garde que la categorie, le club est
// ajoute ensuite. Le nom brut reste en base (sheet_name / event_name).
// Un onglet junior ("M500 ISLA - JUN 26 - U15") devient "Junior U15".
const RAW_SHEET_SUFFIX = /\b(M25|M50|M100|M250|M500|M1000)\b.*?\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{2}\b\s*(?:[-–]\s*(U1[135])\b)?.*$/i;

function stripRawSheetSuffix(_match: string, category: string, junior?: string): string {
  return junior ? `Junior ${junior.toUpperCase()}` : category;
}

export function normalizeTournamentDisplayName(name: string, clubName = ''): string {
  const normalized = normalizeJuniorCategory(name)
    .replace(/^Cascavelle\b/, 'SPARC Cascavelle')
    .replace(/([-\u2013]\s*)Cascavelle\b/g, '$1SPARC Cascavelle')
    .replace(RAW_SHEET_SUFFIX, stripRawSheetSuffix)
    .trim();

  const club = clubName.trim();
  if (!club || normalized.startsWith(club)) return normalized;

  const mixed = normalized.match(/^Mixed Open\s*[-\u2013]\s*.+$/) || normalized.match(/^MIXED\s*[-\u2013]\s*.+$/);
  if (mixed) return `${club} Mixed Open`;

  const junior = normalized.match(/^Junior\s+(.+?)\s*[-\u2013]\s*.+$/);
  if (junior) return `${club} Junior ${junior[1].trim()}`;

  const category = normalized.match(/\b(M25|M50|M100|M250|M500|M1000)\b.*$/);
  if (category) return `${club} ${category[0]}`;

  return `${club} ${normalized}`;
}
