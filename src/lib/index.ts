import { MPL_TOURNAMENTS } from '@/data/mpl2026';
// ── Routes ────────────────────────────────────────────────────────────────────
export const ROUTE_PATHS = {
  HOME: '/',
  LEAGUE: '/ligue',
  REGIONS: '/regions',
  CLUBS: '/clubs',
  CALENDAR: '/calendrier',
  RANKINGS: '/classements',
  PLAYER_SPACE: '/joueurs',
  RESULTS: '/resultats',
  HISTORY: '/historique',
  PADEL_MAURITIUS: '/padel-mauritius',
  ADMIN: '/admin',
  ADMIN_CLUBS: '/admin/clubs',
  ADMIN_PLAYERS: '/admin/joueurs',
  ADMIN_TOURNAMENTS: '/admin/tournois',
  ADMIN_BRACKETS: '/admin/brackets',
  ADMIN_SCORES: '/admin/scores',
  ADMIN_EXPORTS: '/admin/exports',
  OBS_SCOREBOARD: '/obs/scoreboard',
  GALLERY: '/galerie',
  ADMIN_GALLERY: '/admin/galerie',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────
export type Region = 'Nord' | 'Ouest' | 'Centre' | 'Est' | 'Sud';
export type TournamentCategory = 'M25' | 'M50' | 'M100' | 'M250' | 'M500' | 'M1000';
export type TournamentStatus = 'open' | 'closed' | 'soon' | 'ongoing' | 'completed';
export type Division = 'men' | 'women' | 'junior' | 'mixed';
export type Language = 'fr' | 'en';

export interface Club {
  id: string;
  name: string;
  slug: string;
  region: Region;
  courts: number;
  phone?: string;
  email?: string;
  address?: string;
  logo_url?: string;
  created_at?: string;
}

export interface Player {
  id: string;
  first_name: string;
  last_name: string;
  club_id?: string;
  club?: Club;
  region?: Region;
  phone?: string;
  email?: string;
  birth_date?: string;
  license_number?: string;
  created_at?: string;
}

export interface Team {
  id: string;
  player1_id: string;
  player2_id: string;
  player1?: Player;
  player2?: Player;
  tournament_id?: string;
  seed?: number;
  created_at?: string;
}

export interface Tournament {
  id: string;
  name: string;
  category: TournamentCategory;
  division: Division;
  club_id?: string;
  club?: Club;
  region?: Region;
  start_date: string;
  end_date: string;
  status: TournamentStatus;
  max_teams?: number;
  teams_registered?: number;
  description?: string;
  created_at?: string;
}

export interface Ranking {
  rank: number;
  team_name: string;
  player1_name: string;
  player2_name: string;
  club_name: string;
  region: Region;
  points: number;
  tournaments_played: number;
  trend: 'up' | 'down' | 'same';
  division: Division;
}

export interface Sponsor {
  id: string;
  name: string;
  tier: 'title' | 'gold' | 'silver' | 'bronze';
  logo_url?: string;
  website?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
export const CATEGORY_CONFIG: Record<TournamentCategory, {
  label: string;
  color: string;
  bg: string;
  textColor: string;
  description_fr: string;
  description_en: string;
  points: number;
}> = {
  M25:   { label: 'M25',   color: '#10b981', bg: 'rgba(16,185,129,0.15)',  textColor: '#10b981', description_fr: 'Débutant',    description_en: 'Beginner',     points: 25   },
  M50:   { label: 'M50',   color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  textColor: '#3b82f6', description_fr: 'Intermédiaire', description_en: 'Intermediate', points: 50 },
  M100:  { label: 'M100',  color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  textColor: '#f59e0b', description_fr: 'Confirmé',    description_en: 'Confirmed',    points: 100  },
  M250:  { label: 'M250',  color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   textColor: '#ef4444', description_fr: 'Avancé',      description_en: 'Advanced',     points: 250  },
  M500:  { label: 'M500',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)',  textColor: '#8b5cf6', description_fr: 'Majeur',      description_en: 'Major',        points: 500  },
  M1000: { label: 'M1000', color: '#dc2626', bg: 'rgba(220,38,38,0.15)',   textColor: '#dc2626', description_fr: 'Elite',       description_en: 'Elite',        points: 1000 },
};

export const REGION_CONFIG: Record<Region, {
  color: string;
  bg: string;
  name_en: string;
}> = {
  Nord:   { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  name_en: 'North'  },
  Ouest:  { color: '#10b981', bg: 'rgba(16,185,129,0.15)',  name_en: 'West'   },
  Centre: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)',  name_en: 'Centre' },
  Est:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  name_en: 'East'   },
  Sud:    { color: '#ec4899', bg: 'rgba(236,72,153,0.15)',   name_en: 'South'  },
};

export const STATUS_CONFIG: Record<TournamentStatus, {
  label_fr: string;
  label_en: string;
  color: string;
  bg: string;
}> = {
  open:      { label_fr: 'Ouvert',    label_en: 'Open',       color: '#10b981', bg: 'rgba(16,185,129,0.15)'  },
  closed:    { label_fr: 'Fermé',     label_en: 'Closed',     color: '#ef4444', bg: 'rgba(239,68,68,0.15)'   },
  soon:      { label_fr: 'Bientôt',   label_en: 'Coming Soon',color: '#f59e0b', bg: 'rgba(245,158,11,0.15)'  },
  ongoing:   { label_fr: 'En cours',  label_en: 'Ongoing',    color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)'  },
  completed: { label_fr: 'Terminé',   label_en: 'Completed',  color: '#a0a0a0', bg: 'rgba(160,160,160,0.15)' },
};

export const DIVISION_CONFIG: Record<Division, { label_fr: string; label_en: string }> = {
  men:    { label_fr: 'Hommes',   label_en: 'Men'    },
  women:  { label_fr: 'Femmes',   label_en: 'Women'  },
  junior: { label_fr: 'Junior',   label_en: 'Junior' },
  mixed:  { label_fr: 'Mixte',    label_en: 'Mixed'  },
};

// ── Statistiques MPL — SOURCE UNIQUE DE VÉRITÉ ──────────────────────────────
// Pour mettre à jour le nombre de tournois : modifier uniquement TOURNAMENT_COUNT
// Toutes les pages lisent MPL_STATS.tournaments, jamais de valeur codée en dur.

export const TOURNAMENT_COUNT = MPL_TOURNAMENTS.length; // calculé automatiquement

export const MPL_STATS = {
  clubs:       18,                // 18 clubs officiels MPL 2026
  courts:      65,                // 65 terrains (source : Tableau de Bord Excel)
  tournaments: TOURNAMENT_COUNT,  // 🔗 dynamique — se met à jour avec le calendrier
  regions:     4,                 // Nord, Ouest, Centre, Est
  // Breakdown par région (calculé depuis mpl2026.ts)
  by_region: {
    Nord:   MPL_TOURNAMENTS.filter(t => t.region === 'Nord').length,
    Ouest:  MPL_TOURNAMENTS.filter(t => t.region === 'Ouest').length,
    Centre: MPL_TOURNAMENTS.filter(t => t.region === 'Centre').length,
    Est:    MPL_TOURNAMENTS.filter(t => t.region === 'Est').length,
    Sud:    MPL_TOURNAMENTS.filter(t => t.region === 'Sud').length,
  },
};
