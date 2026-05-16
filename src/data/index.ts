import type { Club, Tournament, Ranking, Sponsor } from '@/lib/index';

// ── Clubs ──────────────────────────────────────────────────────────────────────
export const MOCK_CLUBS: Club[] = [
  { id: '1',  name: 'Grand Baie Padel Club',     slug: 'grand-baie-padel-club',     region: 'Nord',   courts: 4, phone: '+230 5812 3456', email: 'contact@gbpadel.mu' },
  { id: '2',  name: 'Triolet Padel Academy',     slug: 'triolet-padel-academy',     region: 'Nord',   courts: 3, phone: '+230 5823 4567', email: 'info@trioletpadel.mu' },
  { id: '3',  name: 'Pereybere Beach Club',       slug: 'pereybere-beach-club',      region: 'Nord',   courts: 3, phone: '+230 5834 5678', email: 'pereybere@padel.mu' },
  { id: '4',  name: 'Cap Malheureux Padel',       slug: 'cap-malheureux-padel',      region: 'Nord',   courts: 2, phone: '+230 5845 6789', email: 'cap@padel.mu' },
  { id: '5',  name: 'Goodlands Sports Club',      slug: 'goodlands-sports-club',     region: 'Nord',   courts: 2, phone: '+230 5856 7890', email: 'goodlands@padel.mu' },
  { id: '6',  name: 'Flic en Flac Padel',         slug: 'flic-en-flac-padel',        region: 'Ouest',  courts: 4, phone: '+230 5867 8901', email: 'flicenflac@padel.mu' },
  { id: '7',  name: 'Tamarin Bay Club',            slug: 'tamarin-bay-club',          region: 'Ouest',  courts: 3, phone: '+230 5878 9012', email: 'tamarin@padel.mu' },
  { id: '8',  name: 'Black River Padel',           slug: 'black-river-padel',         region: 'Ouest',  courts: 2, phone: '+230 5889 0123', email: 'blackriver@padel.mu' },
  { id: '9',  name: 'Le Morne Sports Club',        slug: 'le-morne-sports-club',      region: 'Ouest',  courts: 3, phone: '+230 5890 1234', email: 'lemorne@padel.mu' },
  { id: '10', name: 'Curepipe Padel Club',         slug: 'curepipe-padel-club',       region: 'Centre', courts: 4, phone: '+230 5801 2345', email: 'curepipe@padel.mu' },
  { id: '11', name: 'Phoenix Padel Academy',       slug: 'phoenix-padel-academy',     region: 'Centre', courts: 3, phone: '+230 5812 3456', email: 'phoenix@padel.mu' },
  { id: '12', name: 'Vacoas Sports Center',        slug: 'vacoas-sports-center',      region: 'Centre', courts: 2, phone: '+230 5823 4567', email: 'vacoas@padel.mu' },
  { id: '13', name: 'Quatre Bornes Club',          slug: 'quatre-bornes-club',        region: 'Centre', courts: 3, phone: '+230 5834 5678', email: 'qb@padel.mu' },
  { id: '14', name: 'Rose Hill Padel',             slug: 'rose-hill-padel',           region: 'Centre', courts: 2, phone: '+230 5845 6789', email: 'rosehill@padel.mu' },
  { id: '15', name: 'Belle Mare Padel Resort',     slug: 'belle-mare-padel-resort',   region: 'Est',    courts: 5, phone: '+230 5856 7890', email: 'bellemare@padel.mu' },
  { id: '16', name: "Trou d'Eau Douce Club",       slug: 'trou-eau-douce-club',       region: 'Est',    courts: 3, phone: '+230 5867 8901', email: 'ted@padel.mu' },
  { id: '17', name: 'Flacq Padel Center',          slug: 'flacq-padel-center',        region: 'Est',    courts: 3, phone: '+230 5878 9012', email: 'flacq@padel.mu' },
  { id: '18', name: 'Poste Lafayette Club',        slug: 'poste-lafayette-club',      region: 'Est',    courts: 2, phone: '+230 5889 0123', email: 'lafayette@padel.mu' },
];

// ── Tournaments ────────────────────────────────────────────────────────────────
export const MOCK_TOURNAMENTS: Tournament[] = [
  { id: '1', name: 'Grand Baie Padel Club Open',        category: 'M100',  division: 'men',    start_date: '2026-03-15', end_date: '2026-03-17',  status: 'open',      max_teams: 32, teams_registered: 24, region: 'Nord',   club: MOCK_CLUBS[0] },
  { id: '2', name: 'Flic en Flac Padel Ladies',         category: 'M50',   division: 'women',  start_date: '2026-03-22', end_date: '2026-03-24',  status: 'closed',    max_teams: 24, teams_registered: 24, region: 'Ouest',  club: MOCK_CLUBS[5] },
  { id: '3', name: 'Curepipe Padel Club Championship',  category: 'M250',  division: 'mixed',  start_date: '2026-04-05', end_date: '2026-04-07', status: 'soon',      max_teams: 28, teams_registered: 8,  region: 'Centre', club: MOCK_CLUBS[9] },
  { id: '4', name: 'Belle Mare Padel Resort Masters',   category: 'M500',  division: 'men',    start_date: '2026-04-12', end_date: '2026-04-14', status: 'soon',      max_teams: 32, teams_registered: 0,  region: 'Est',    club: MOCK_CLUBS[14] },
  { id: '5', name: 'Tamarin Bay Club Junior Cup',       category: 'M25',   division: 'junior', start_date: '2026-04-19', end_date: '2026-04-21',  status: 'open',      max_teams: 16, teams_registered: 10, region: 'Ouest',  club: MOCK_CLUBS[6] },
  { id: '6', name: 'Phoenix Padel Academy Mauritius Padel Open', category: 'M1000', division: 'men',    start_date: '2026-04-26', end_date: '2026-04-28', status: 'soon',      max_teams: 64, teams_registered: 0,  region: 'Centre', club: MOCK_CLUBS[10] },
];

// ── Rankings ──────────────────────────────────────────────────────────────────
export const MOCK_RANKINGS_MEN: Ranking[] = [
  { rank: 1, team_name: 'Dupont / Martin',   player1_name: 'Jean Dupont',    player2_name: 'Pierre Martin',  club_name: 'Grand Baie Padel Club',   region: 'Nord',   points: 1250, tournaments_played: 12, trend: 'up',   division: 'men' },
  { rank: 2, team_name: 'Bernard / Leroy',   player1_name: 'Paul Bernard',   player2_name: 'Marc Leroy',     club_name: 'Flic en Flac Padel',      region: 'Ouest',  points: 1180, tournaments_played: 11, trend: 'same', division: 'men' },
  { rank: 3, team_name: 'Moreau / Wilson',   player1_name: 'Luc Moreau',     player2_name: 'Tom Wilson',     club_name: 'Curepipe Padel Club',     region: 'Centre', points: 1120, tournaments_played: 10, trend: 'down', division: 'men' },
  { rank: 4, team_name: 'Johnson / Brown',   player1_name: 'Alex Johnson',   player2_name: 'Mike Brown',     club_name: 'Belle Mare Padel Resort', region: 'Est',    points: 1050, tournaments_played: 13, trend: 'up',   division: 'men' },
  { rank: 5, team_name: 'Davis / Miller',    player1_name: 'Chris Davis',    player2_name: 'Sam Miller',     club_name: 'Tamarin Bay Club',        region: 'Ouest',  points: 980,  tournaments_played: 9,  trend: 'up',   division: 'men' },
  { rank: 6, team_name: 'Petit / Dubois',    player1_name: 'Marc Petit',     player2_name: 'Jules Dubois',   club_name: 'Phoenix Padel Academy',   region: 'Centre', points: 920,  tournaments_played: 8,  trend: 'down', division: 'men' },
  { rank: 7, team_name: 'Foulon / Ricard',   player1_name: 'Éric Foulon',    player2_name: 'Simon Ricard',   club_name: 'Triolet Padel Academy',   region: 'Nord',   points: 860,  tournaments_played: 10, trend: 'same', division: 'men' },
  { rank: 8, team_name: 'Laurent / Fabre',   player1_name: 'Hugo Laurent',   player2_name: 'Théo Fabre',     club_name: "Trou d'Eau Douce Club",   region: 'Est',    points: 800,  tournaments_played: 7,  trend: 'up',   division: 'men' },
];

export const MOCK_RANKINGS_WOMEN: Ranking[] = [
  { rank: 1, team_name: 'André / Laval',     player1_name: 'Sophie André',   player2_name: 'Claire Laval',   club_name: 'Grand Baie Padel Club',   region: 'Nord',   points: 980,  tournaments_played: 10, trend: 'up',   division: 'women' },
  { rank: 2, team_name: 'Mercier / Roy',     player1_name: 'Lisa Mercier',   player2_name: 'Emma Roy',       club_name: 'Flic en Flac Padel',      region: 'Ouest',  points: 920,  tournaments_played: 9,  trend: 'same', division: 'women' },
  { rank: 3, team_name: 'Blanc / Morin',     player1_name: 'Anna Blanc',     player2_name: 'Julie Morin',    club_name: 'Belle Mare Padel Resort', region: 'Est',    points: 860,  tournaments_played: 8,  trend: 'down', division: 'women' },
  { rank: 4, team_name: 'Garcia / Lopez',    player1_name: 'Maria Garcia',   player2_name: 'Carmen Lopez',   club_name: 'Curepipe Padel Club',     region: 'Centre', points: 800,  tournaments_played: 7,  trend: 'up',   division: 'women' },
  { rank: 5, team_name: 'Simon / Thomas',    player1_name: 'Léa Simon',      player2_name: 'Zoé Thomas',     club_name: 'Phoenix Padel Academy',   region: 'Centre', points: 740,  tournaments_played: 11, trend: 'up',   division: 'women' },
];

export const MOCK_RANKINGS_JUNIOR: Ranking[] = [
  { rank: 1, team_name: 'Adam / Noah',       player1_name: 'Adam Dupont',    player2_name: 'Noah Martin',    club_name: 'Tamarin Bay Club',        region: 'Ouest',  points: 520,  tournaments_played: 6,  trend: 'up',   division: 'junior' },
  { rank: 2, team_name: 'Ethan / Liam',      player1_name: 'Ethan Bernard',  player2_name: 'Liam Leroy',     club_name: 'Triolet Padel Academy',   region: 'Nord',   points: 480,  tournaments_played: 5,  trend: 'same', division: 'junior' },
  { rank: 3, team_name: 'Lucas / Hugo',      player1_name: 'Lucas Moreau',   player2_name: 'Hugo Wilson',    club_name: 'Grand Baie Padel Club',   region: 'Nord',   points: 440,  tournaments_played: 7,  trend: 'down', division: 'junior' },
];

export const MOCK_SPONSORS: Sponsor[] = [
  { id: '1', name: 'AfrAsia Bank', tier: 'title',  website: 'https://afrasiabank.com' },
  { id: '2', name: 'Air Mauritius', tier: 'gold',  website: 'https://airmauritius.com' },
  { id: '3', name: 'Rogers Capital', tier: 'gold', website: 'https://rogerscapital.mu' },
];
