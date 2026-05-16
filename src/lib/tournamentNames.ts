export function normalizeJuniorCategory(category: string): string {
  return category
    .replace(/\bU10\b/g, 'U11')
    .replace(/\bU12\b/g, 'U13')
    .replace(/\bU14\b/g, 'U15');
}

export function normalizeTournamentDisplayName(name: string, clubName = ''): string {
  const normalized = normalizeJuniorCategory(name)
    .replace(/^Cascavelle\b/, 'SPARC Cascavelle')
    .replace(/([-\u2013]\s*)Cascavelle\b/g, '$1SPARC Cascavelle');

  const club = clubName.trim();
  if (!club || normalized.startsWith(club)) return normalized;

  const mixed = normalized.match(/^Mixed Open\s*[-\u2013]\s*.+$/);
  if (mixed) return `${club} Mixed Open`;

  const junior = normalized.match(/^Junior\s+(.+?)\s*[-\u2013]\s*.+$/);
  if (junior) return `${club} Junior ${junior[1].trim()}`;

  const category = normalized.match(/\b(M25|M50|M100|M250|M500|M1000)\b.*$/);
  if (category) return `${club} ${category[0]}`;

  return `${club} ${normalized}`;
}
