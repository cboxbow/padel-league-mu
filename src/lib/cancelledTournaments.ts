type DivisionKey = 'men' | 'women' | 'mixed' | 'junior';

export type TournamentLike = {
  id?: string;
  name?: string;
  club?: string;
  clubName?: string;
  club_name?: string;
  date?: string;
  tournament_date?: string;
  category?: string;
  type?: string;
  tournament_type?: string;
  division?: string;
  status?: string | null;
};

type CancelledTournamentRule = {
  date: string;
  club: string;
  category: string;
  divisions?: DivisionKey[];
};

export const CANCELLED_TOURNAMENTS_2026: CancelledTournamentRule[] = [
  // Calendar Update 2026: active events stay visible; only obsolete/replaced rows are hidden.
  { date: '2026-03-01', club: 'I Padel by RM Hennessy', category: 'JUNIOR', divisions: ['junior'] },
  { date: '2026-04-04', club: 'Club Med Albion', category: 'MIXED', divisions: ['mixed'] },
  { date: '2026-04-25', club: 'Club Med Albion', category: 'M25', divisions: ['men'] },
  { date: '2026-04-25', club: 'RM Club Tamarin', category: 'JUNIOR', divisions: ['junior'] },
  { date: '2026-05-16', club: 'Moka Rangers', category: 'M50', divisions: ['men', 'women'] },
  { date: '2026-05-30', club: 'Club Med Albion', category: 'M50', divisions: ['men'] },
  { date: '2026-05-30', club: 'Moka Rangers', category: 'JUNIOR', divisions: ['junior'] },
  { date: '2026-06-06', club: 'Cana Beau Plan', category: 'JUNIOR', divisions: ['junior'] },
  { date: '2026-06-07', club: 'Studio by RM Azuri', category: 'M100', divisions: ['men'] },
  { date: '2026-06-20', club: 'Moka Rangers', category: 'M250', divisions: ['men', 'women'] },
  { date: '2026-06-27', club: 'Club Med Albion', category: 'JUNIOR', divisions: ['junior'] },
  { date: '2026-07-25', club: 'Moka Rangers', category: 'M25', divisions: ['men', 'women'] },
  { date: '2026-07-25', club: 'Urban Sport Black River', category: 'JUNIOR', divisions: ['junior'] },
  { date: '2026-08-08', club: 'I Padel by RM Port Chambly', category: 'JUNIOR', divisions: ['junior'] },
  { date: '2026-08-15', club: 'Moka Rangers', category: 'MIXED', divisions: ['mixed'] },
  { date: '2026-08-29', club: 'Club Med Albion', category: 'M25', divisions: ['men', 'women'] },
  { date: '2026-09-26', club: 'Club Med Albion', category: 'M50', divisions: ['men', 'women'] },
  { date: '2026-10-03', club: 'Terres Brunes Sports & Leisure', category: 'M250', divisions: ['men', 'women'] },
  { date: '2026-10-17', club: 'Urban Sport Grand Baie', category: 'JUNIOR', divisions: ['junior'] },
  { date: '2026-10-31', club: 'Club Med Albion', category: 'M100', divisions: ['men', 'women'] },
  { date: '2026-11-07', club: 'Labourdonnais Mapou', category: 'JUNIOR', divisions: ['junior'] },
  { date: '2026-12-05', club: 'Studio by RM Azuri', category: 'JUNIOR', divisions: ['junior'] },
  { date: '2026-12-26', club: 'Club Med Albion', category: 'M25', divisions: ['men', 'women'] },
];

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function norm(value: unknown): string {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizeClub(value: unknown): string {
  const text = norm(value);
  if (!text) return '';
  if (text.includes('CANA')) return 'CANA BEAU PLAN';
  if (text.includes('CLUB MED')) return 'CLUB MED ALBION';
  if (text.includes('PORT CHAMBLY')) return 'I PADEL BY RM PORT CHAMBLY';
  if (text.includes('HENNESSY')) return 'I PADEL BY RM HENNESSY';
  if (text.includes('LABOURDONNAIS') || text.includes('LSC')) return 'LABOURDONNAIS MAPOU';
  if (text.includes('TERRES BRUNES')) return 'TERRES BRUNES SPORTS LEISURE';
  if (text.includes('SPARC')) return 'SPARC CASCAVELLE';
  if (text.includes('AZURI')) return 'STUDIO BY RM AZURI';
  if (text.includes('OXYGEN')) return 'OXYGEN MOKA';
  if (text.includes('SYNERGY')) return 'MOKA RANGERS';
  if (text.includes('MOKA RANGERS')) return 'MOKA RANGERS';
  if (text.includes('MONT CHOISY')) return 'MONT CHOISY GOLF';
  if (text.includes('URBAN SPORT BLACK RIVER') || text.includes('URBAN BR')) return 'URBAN SPORT BLACK RIVER';
  if (text.includes('URBAN SPORT GRAND BAIE') || text.includes('URBAN GB')) return 'URBAN SPORT GRAND BAIE';
  if (text.includes('RM CLUB TAMARIN') || text.includes('RM T')) return 'RM CLUB TAMARIN';
  if (text.includes('RM CLUB GRAND BAIE') || text.includes('RM GB') || text.includes('RM FORBACH')) return 'RM CLUB GRAND BAIE';
  return text;
}

function normalizeCategory(value: unknown, fallbackText?: unknown): string {
  const text = norm(`${clean(value)} ${clean(fallbackText)}`);
  if (text.includes('JUNIOR') || /\bU1[135]\b/.test(text) || /\bU1[024]\b/.test(text)) return 'JUNIOR';
  if (text.includes('MIXED') || text.includes('MIXTE')) return 'MIXED';
  const match = text.match(/\bM(25|50|100|250|500|1000)\b/);
  return match ? `M${match[1]}` : norm(value);
}

function normalizeDivision(value: unknown, category?: unknown, fallbackText?: unknown): DivisionKey | '' {
  const text = norm(`${clean(value)} ${clean(fallbackText)}`);
  const cat = normalizeCategory(category, fallbackText);
  if (cat === 'JUNIOR' || text.includes('JUNIOR')) return 'junior';
  if (cat === 'MIXED' || text.includes('MIXED') || text.includes('MIXTE')) return 'mixed';
  if (text.includes('WOMEN') || text.includes('DAMES') || text.includes('FEMMES')) return 'women';
  if (text.includes('MEN') || text.includes('HOMMES')) return 'men';
  return '';
}

function dateKey(value: unknown): string {
  return clean(value).slice(0, 10);
}

export function isCancelledTournament(tournament: TournamentLike): boolean {
  const date = dateKey(tournament.tournament_date ?? tournament.date);
  if (!date) return false;

  const name = clean(tournament.name);
  const category = normalizeCategory(tournament.category ?? tournament.tournament_type ?? tournament.type, name);
  const division = normalizeDivision(tournament.division ?? tournament.tournament_type ?? tournament.type, category, name);
  const club = normalizeClub(tournament.club_name ?? tournament.clubName ?? tournament.club ?? name);

  return CANCELLED_TOURNAMENTS_2026.some(rule => {
    if (rule.date !== date) return false;
    if (normalizeCategory(rule.category) !== category) return false;
    if (rule.divisions?.length && division && !rule.divisions.includes(division)) return false;
    const ruleClub = normalizeClub(rule.club);
    return club === ruleClub || club.includes(ruleClub) || ruleClub.includes(club);
  });
}

export function applyCancelledTournamentStatus<T extends TournamentLike>(tournament: T): T {
  if (!isCancelledTournament(tournament)) return tournament;
  return { ...tournament, status: 'cancelled' } as T;
}
