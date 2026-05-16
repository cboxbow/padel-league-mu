import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Medal, Search, Users, Calendar, MapPin, ChevronDown, ChevronUp, RefreshCw, ExternalLink } from 'lucide-react';
import { DotWaveBackground } from '@/components/DotWaveBackground';
import { Layout, GlassCard } from '@/components/Layout';
import { getSupabaseClient, isSupabaseConnected, safeSupabaseQuery } from '@/lib/supabase';
import { ROUTE_PATHS } from '@/lib/index';
import { normalizeJuniorCategory, normalizeTournamentDisplayName } from '@/lib/tournamentNames';
import { useSeo } from '@/hooks/useSeo';

// ─────────────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface TournamentResult {
  id: string;
  tournament_id: string;
  tournament_name: string;
  tournament_date: string;
  category: string;
  division: string;
  region: string;
  club_name: string;
  rank: number;
  team_name: string;
  player1_name: string;
  player2_name: string;
  points: number;
}

interface TournamentGroup {
  key: string;
  tournament_id: string;
  tournament_name: string;
  tournament_date: string;
  category: string;
  region: string;
  club_name: string;
  divisions: {
    division: string;
    results: TournamentResult[];
  }[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  DONNÉES SEED (Club House Jan 2026) — affichées si Supabase non configuré
// ─────────────────────────────────────────────────────────────────────────────
const SEED_RESULTS: TournamentResult[] = [
  // HOMMES — M25 Club House 10 Jan 2026
  { id:'res-t001-m-1', tournament_id:'t001', tournament_name:'M25 Club House', tournament_date:'2026-01-24', category:'M25', division:'men', region:'Ouest', club_name:'Club House', rank:1, team_name:'NICOLAS/VALENTIN',     player1_name:'Nicolas De Caritat',  player2_name:'Valentin Beriot',     points:25 },
  { id:'res-t001-m-2', tournament_id:'t001', tournament_name:'M25 Club House', tournament_date:'2026-01-24', category:'M25', division:'men', region:'Ouest', club_name:'Club House', rank:2, team_name:'IBRAHIM/MOHAMMAD',     player1_name:'Ibrahim Dala',        player2_name:'Mohammad Peersaib',   points:15 },
  { id:'res-t001-m-3', tournament_id:'t001', tournament_name:'M25 Club House', tournament_date:'2026-01-24', category:'M25', division:'men', region:'Ouest', club_name:'Club House', rank:3, team_name:'MAHE/JEAN FRANCOIS',   player1_name:'Mahe Henri',          player2_name:'Jean François Henri', points:12 },
  { id:'res-t001-m-4', tournament_id:'t001', tournament_name:'M25 Club House', tournament_date:'2026-01-24', category:'M25', division:'men', region:'Ouest', club_name:'Club House', rank:4, team_name:'ERIC/GEORGES',         player1_name:'Eric Hochedez',       player2_name:'Georges Guigui',      points:9  },
  { id:'res-t001-m-5', tournament_id:'t001', tournament_name:'M25 Club House', tournament_date:'2026-01-24', category:'M25', division:'men', region:'Ouest', club_name:'Club House', rank:5, team_name:'SYLVAIN/BERTRAND',     player1_name:'Sylvain Nguyen',      player2_name:'Bertrand De Boisset', points:6  },
  { id:'res-t001-m-6', tournament_id:'t001', tournament_name:'M25 Club House', tournament_date:'2026-01-24', category:'M25', division:'men', region:'Ouest', club_name:'Club House', rank:6, team_name:'FABRICE/DENIS-CLAUDE', player1_name:'Fabrice Durand',      player2_name:'Denis-Claude Koenig', points:4  },
  { id:'res-t001-m-7', tournament_id:'t001', tournament_name:'M25 Club House', tournament_date:'2026-01-24', category:'M25', division:'men', region:'Ouest', club_name:'Club House', rank:7, team_name:'THIERRY/LUDOVIC',      player1_name:'Thierry Bindini',     player2_name:'Ludovic Balloux',     points:2  },
  { id:'res-t001-m-8', tournament_id:'t001', tournament_name:'M25 Club House', tournament_date:'2026-01-24', category:'M25', division:'men', region:'Ouest', club_name:'Club House', rank:8, team_name:'DARELL/LUCAS',         player1_name:'Darell Carpen',       player2_name:'Lucas Cimiotti',      points:1  },
  // DAMES — M25 Club House 10 Jan 2026
  { id:'res-t001-w-1', tournament_id:'t001-w', tournament_name:'M25 Club House', tournament_date:'2026-01-24', category:'M25', division:'women', region:'Ouest', club_name:'Club House', rank:1, team_name:'CATHERINE/AUDREY',  player1_name:'Catherine Ronin',      player2_name:'Audrey Gallet',    points:25 },
  { id:'res-t001-w-2', tournament_id:'t001-w', tournament_name:'M25 Club House', tournament_date:'2026-01-24', category:'M25', division:'women', region:'Ouest', club_name:'Club House', rank:2, team_name:'ROXANE/MICHELLE',   player1_name:'Roxane Gallet',        player2_name:'Michelle Henri',   points:15 },
  { id:'res-t001-w-3', tournament_id:'t001-w', tournament_name:'M25 Club House', tournament_date:'2026-01-24', category:'M25', division:'women', region:'Ouest', club_name:'Club House', rank:3, team_name:'LAURA/PRUNE',       player1_name:'Laura Gaspard',        player2_name:'Prune Maingard',   points:12 },
  { id:'res-t001-w-4', tournament_id:'t001-w', tournament_name:'M25 Club House', tournament_date:'2026-01-24', category:'M25', division:'women', region:'Ouest', club_name:'Club House', rank:4, team_name:'CATHERINE/SASKIA',  player1_name:'Catherine De Caritat', player2_name:'Saskia Bax',        points:9  },
  { id:'res-t001-w-5', tournament_id:'t001-w', tournament_name:'M25 Club House', tournament_date:'2026-01-24', category:'M25', division:'women', region:'Ouest', club_name:'Club House', rank:5, team_name:'MADISON/SEFORA',    player1_name:'Madison Nayna',        player2_name:'Sefora Felix',      points:6  },
  { id:'res-t001-w-6', tournament_id:'t001-w', tournament_name:'M25 Club House', tournament_date:'2026-01-24', category:'M25', division:'women', region:'Ouest', club_name:'Club House', rank:6, team_name:'VANESSA/LAURA',     player1_name:'Vanessa Mamet',        player2_name:'Laura Bocage',      points:4  },
  { id:'res-t001-w-7', tournament_id:'t001-w', tournament_name:'M25 Club House', tournament_date:'2026-01-24', category:'M25', division:'women', region:'Ouest', club_name:'Club House', rank:7, team_name:'ELINOR/KEREN',      player1_name:'Elinor Cohen',         player2_name:'Keren Cohen',       points:2  },
  { id:'res-t001-w-8', tournament_id:'t001-w', tournament_name:'M25 Club House', tournament_date:'2026-01-24', category:'M25', division:'women', region:'Ouest', club_name:'Club House', rank:8, team_name:'AMBRE/CHLOE',       player1_name:'Ambre Carpentier',     player2_name:'Chloe Schaefer',    points:1  },

  // HOMMES — M25 Energia Pointe aux Canonniers 17 Jan 2026
  { id:'res-t006h-1', tournament_id:'t006h', tournament_name:'M25 Energia',  tournament_date:'2026-01-17', category:'M25', division:'men',   region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:1, team_name:'FABIO/THOMAS',       player1_name:'Fabio Fernandes',       player2_name:'Thomas Colombier',         points:25 },
  { id:'res-t006h-2', tournament_id:'t006h', tournament_name:'M25 Energia',  tournament_date:'2026-01-17', category:'M25', division:'men',   region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:2, team_name:'STEPAN/MARTIN',      player1_name:'Stepan Holy',           player2_name:'Martin Holy',              points:17 },
  { id:'res-t006h-3', tournament_id:'t006h', tournament_name:'M25 Energia',  tournament_date:'2026-01-17', category:'M25', division:'men',   region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:3, team_name:'DAMIEN/POUBALEN',    player1_name:'Damien Putteea',        player2_name:'Poubalen Parasuraman',     points:15 },
  { id:'res-t006h-4', tournament_id:'t006h', tournament_name:'M25 Energia',  tournament_date:'2026-01-17', category:'M25', division:'men',   region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:4, team_name:'THIERRY/TONY',       player1_name:'Thierry Jeanne',        player2_name:'Tony Leung',               points:13 },
  { id:'res-t006h-5', tournament_id:'t006h', tournament_name:'M25 Energia',  tournament_date:'2026-01-17', category:'M25', division:'men',   region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:5, team_name:'LAURENT/EDOUARD',    player1_name:'Laurent Jeudy',         player2_name:'Edouard Bizot',            points:11 },
  { id:'res-t006h-6', tournament_id:'t006h', tournament_name:'M25 Energia',  tournament_date:'2026-01-17', category:'M25', division:'men',   region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:6, team_name:'JEFFREY/GREGORY',    player1_name:'Jeffrey Driver',        player2_name:'Gregory Driver',           points:9  },
  { id:'res-t006h-7', tournament_id:'t006h', tournament_name:'M25 Energia',  tournament_date:'2026-01-17', category:'M25', division:'men',   region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:7, team_name:'JONATHAN/ANDREW',    player1_name:'Jonathan Gray',         player2_name:'Andrew Schlebusch',        points:7  },
  { id:'res-t006h-8', tournament_id:'t006h', tournament_name:'M25 Energia',  tournament_date:'2026-01-17', category:'M25', division:'men',   region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:8, team_name:'MICHAEL/DARRYL',     player1_name:'Michael Jones',         player2_name:'Darryl Young',             points:5  },
  { id:'res-t006h-9', tournament_id:'t006h', tournament_name:'M25 Energia',  tournament_date:'2026-01-17', category:'M25', division:'men',   region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:9, team_name:'ROMAIN/ROMAIN',      player1_name:'Romain Da Silva',       player2_name:'Romain De Brakeleer',      points:4  },

  // HOMMES — M50 Azuri (Studio by RM) 18 Jan 2026
  { id:'res-t010h-1', tournament_id:'t010h', tournament_name:'M50 Azuri',    tournament_date:'2026-01-18', category:'M50', division:'men',   region:'Est',  club_name:'Studio by RM Azuri',            rank:1, team_name:'CEDRIC/PIERRE-YVES',  player1_name:'Cedric Rahmouni',       player2_name:'Pierre-Yves Delabre',      points:50 },
  { id:'res-t010h-2', tournament_id:'t010h', tournament_name:'M50 Azuri',    tournament_date:'2026-01-18', category:'M50', division:'men',   region:'Est',  club_name:'Studio by RM Azuri',            rank:2, team_name:'THOMAS/MATHIEU',      player1_name:'Thomas D\'Unienville',  player2_name:'Mathieu Mamet',            points:34 },
  { id:'res-t010h-3', tournament_id:'t010h', tournament_name:'M50 Azuri',    tournament_date:'2026-01-18', category:'M50', division:'men',   region:'Est',  club_name:'Studio by RM Azuri',            rank:3, team_name:'WILLIAM/ENZO',        player1_name:'William Garcia',        player2_name:'Enzo Garcia',              points:30 },
  { id:'res-t010h-4', tournament_id:'t010h', tournament_name:'M50 Azuri',    tournament_date:'2026-01-18', category:'M50', division:'men',   region:'Est',  club_name:'Studio by RM Azuri',            rank:4, team_name:'ERWAN/REZA',          player1_name:'Erwan Coince',          player2_name:'Reza Alimamod Nayan',      points:26 },
  { id:'res-t010h-5', tournament_id:'t010h', tournament_name:'M50 Azuri',    tournament_date:'2026-01-18', category:'M50', division:'men',   region:'Est',  club_name:'Studio by RM Azuri',            rank:5, team_name:'BERTRAND/GUILLAUME',  player1_name:'Bertrand De Coriolis',  player2_name:'Guillaume Louison',        points:22 },
  { id:'res-t010h-6', tournament_id:'t010h', tournament_name:'M50 Azuri',    tournament_date:'2026-01-18', category:'M50', division:'men',   region:'Est',  club_name:'Studio by RM Azuri',            rank:6, team_name:'JIMMY/ANDRY',         player1_name:'Jimmy Devinaz',         player2_name:'Andry Ah Choon',           points:18 },
  { id:'res-t010h-7', tournament_id:'t010h', tournament_name:'M50 Azuri',    tournament_date:'2026-01-18', category:'M50', division:'men',   region:'Est',  club_name:'Studio by RM Azuri',            rank:7, team_name:'PAMELA/ERIC',         player1_name:'Pamela Jugdarree',      player2_name:'Eric Laporte',             points:14 },
  { id:'res-t010h-8', tournament_id:'t010h', tournament_name:'M50 Azuri',    tournament_date:'2026-01-18', category:'M50', division:'men',   region:'Est',  club_name:'Studio by RM Azuri',            rank:8, team_name:'BERNARD/KEVIN',       player1_name:'Bernard Lopez',         player2_name:'Kevin Gooljar',            points:10 },
  { id:'res-t010h-9', tournament_id:'t010h', tournament_name:'M50 Azuri',    tournament_date:'2026-01-18', category:'M50', division:'men',   region:'Est',  club_name:'Studio by RM Azuri',            rank:9, team_name:'THIERRY/MATHIS',      player1_name:'Thierry Bindini',       player2_name:'Mathis Dehez',             points:8  },

  // DAMES — M50 Azuri (Studio by RM) 18 Jan 2026
  { id:'res-t010f-1',  tournament_id:'t010f', tournament_name:'M50 Azuri',   tournament_date:'2026-01-18', category:'M50', division:'women', region:'Est',  club_name:'Studio by RM Azuri',            rank:1,  team_name:'AGNES/ARMELLE',        player1_name:'Agnes Koenig',          player2_name:'Armelle Desvaux De Marigi', points:50 },
  { id:'res-t010f-2',  tournament_id:'t010f', tournament_name:'M50 Azuri',   tournament_date:'2026-01-18', category:'M50', division:'women', region:'Est',  club_name:'Studio by RM Azuri',            rank:2,  team_name:'CATHERINE/WENDY',      player1_name:'Catherine Chong',       player2_name:'Wendy Ng Foong Po',         points:34 },
  { id:'res-t010f-3',  tournament_id:'t010f', tournament_name:'M50 Azuri',   tournament_date:'2026-01-18', category:'M50', division:'women', region:'Est',  club_name:'Studio by RM Azuri',            rank:3,  team_name:'LAISA/ELOISE',         player1_name:'Laisa Ah Choon',        player2_name:'Eloise Boyer',              points:30 },
  { id:'res-t010f-4',  tournament_id:'t010f', tournament_name:'M50 Azuri',   tournament_date:'2026-01-18', category:'M50', division:'women', region:'Est',  club_name:'Studio by RM Azuri',            rank:4,  team_name:'CATHERINE/YANNICK',    player1_name:'Catherine Vallet',      player2_name:'Yannick Pellegrin',         points:26 },
  { id:'res-t010f-5',  tournament_id:'t010f', tournament_name:'M50 Azuri',   tournament_date:'2026-01-18', category:'M50', division:'women', region:'Est',  club_name:'Studio by RM Azuri',            rank:5,  team_name:'AKI/JOELLE',           player1_name:'Aki Gomand',            player2_name:'Joelle Hirigoyen',          points:22 },
  { id:'res-t010f-6',  tournament_id:'t010f', tournament_name:'M50 Azuri',   tournament_date:'2026-01-18', category:'M50', division:'women', region:'Est',  club_name:'Studio by RM Azuri',            rank:6,  team_name:'ANNE/DOMINIQUE',       player1_name:'Anne Laure Jeudy',      player2_name:'Dominique Savreux',         points:18 },
  { id:'res-t010f-7',  tournament_id:'t010f', tournament_name:'M50 Azuri',   tournament_date:'2026-01-18', category:'M50', division:'women', region:'Est',  club_name:'Studio by RM Azuri',            rank:7,  team_name:'SAAKSHEE/MADELEINE',   player1_name:'Saakshee Ramjutan',     player2_name:'Madeleine Dauguet',         points:14 },
  { id:'res-t010f-8',  tournament_id:'t010f', tournament_name:'M50 Azuri',   tournament_date:'2026-01-18', category:'M50', division:'women', region:'Est',  club_name:'Studio by RM Azuri',            rank:8,  team_name:'MARINE/OPHELIE',       player1_name:'Marine Noel',           player2_name:'Ophelie Merle',             points:10 },
  { id:'res-t010f-9',  tournament_id:'t010f', tournament_name:'M50 Azuri',   tournament_date:'2026-01-18', category:'M50', division:'women', region:'Est',  club_name:'Studio by RM Azuri',            rank:9,  team_name:'KIRSTY/MICHELLE',      player1_name:'Kirsty Durrheim',       player2_name:'Michelle Allen',            points:8  },
  { id:'res-t010f-10', tournament_id:'t010f', tournament_name:'M50 Azuri',   tournament_date:'2026-01-18', category:'M50', division:'women', region:'Est',  club_name:'Studio by RM Azuri',            rank:10, team_name:'SVETLANA/ANDREA',      player1_name:'Svetlana Sidorova',     player2_name:'Andrea Stork',              points:6  },
  { id:'res-t010f-11', tournament_id:'t010f', tournament_name:'M50 Azuri',   tournament_date:'2026-01-18', category:'M50', division:'women', region:'Est',  club_name:'Studio by RM Azuri',            rank:11, team_name:'HAVISHA/AMBER',        player1_name:'Havisha Simi Bunjun',   player2_name:'Amber Lam',                 points:4  },

  // HOMMES — M25 Mont Choisy Golf 10 Jan 2026
  { id:'res-t005-1', tournament_id:'t005', tournament_name:'M25 Mont Choisy', tournament_date:'2026-01-10', category:'M25', division:'men', region:'Nord', club_name:'Mont Choisy Golf', rank:1,  team_name:'SAMUEL/ROMAIN',       player1_name:'Samuel Soussi',             player2_name:'Romain Beltrando',          points:25 },
  { id:'res-t005-2', tournament_id:'t005', tournament_name:'M25 Mont Choisy', tournament_date:'2026-01-10', category:'M25', division:'men', region:'Nord', club_name:'Mont Choisy Golf', rank:2,  team_name:'LEVI/NICOLAS',        player1_name:'Levi Pelissier',            player2_name:'Nicolas Blanche',           points:18 },
  { id:'res-t005-3', tournament_id:'t005', tournament_name:'M25 Mont Choisy', tournament_date:'2026-01-10', category:'M25', division:'men', region:'Nord', club_name:'Mont Choisy Golf', rank:3,  team_name:'MIKAEL/NICOLAS',      player1_name:'Mikael Guillamot',          player2_name:'Nicolas Thomas',            points:16 },
  { id:'res-t005-4', tournament_id:'t005', tournament_name:'M25 Mont Choisy', tournament_date:'2026-01-10', category:'M25', division:'men', region:'Nord', club_name:'Mont Choisy Golf', rank:4,  team_name:'SAFIR/GABRIEL',       player1_name:'Safir Koukeb',              player2_name:'Gabriel Delerue',           points:16 },
  { id:'res-t005-5', tournament_id:'t005', tournament_name:'M25 Mont Choisy', tournament_date:'2026-01-10', category:'M25', division:'men', region:'Nord', club_name:'Mont Choisy Golf', rank:5,  team_name:'FABIO/THOMAS',        player1_name:'Fabio Fernandes',           player2_name:'Thomas Colombier',          points:13 },
  { id:'res-t005-6', tournament_id:'t005', tournament_name:'M25 Mont Choisy', tournament_date:'2026-01-10', category:'M25', division:'men', region:'Nord', club_name:'Mont Choisy Golf', rank:6,  team_name:'MICHEL/ENZO',         player1_name:'Michel Maurel',             player2_name:'Enzo Alleaume',             points:13 },
  { id:'res-t005-7', tournament_id:'t005', tournament_name:'M25 Mont Choisy', tournament_date:'2026-01-10', category:'M25', division:'men', region:'Nord', club_name:'Mont Choisy Golf', rank:7,  team_name:'POUBALEN/DAMIEN',     player1_name:'Poubalen Parasuraman',      player2_name:'Damien Putteea',            points:13 },
  { id:'res-t005-8', tournament_id:'t005', tournament_name:'M25 Mont Choisy', tournament_date:'2026-01-10', category:'M25', division:'men', region:'Nord', club_name:'Mont Choisy Golf', rank:8,  team_name:'THOMAS/JEREMY',       player1_name:'Thomas Brunet',             player2_name:'Jeremy Noel',               points:13 },
  { id:'res-t005-9', tournament_id:'t005', tournament_name:'M25 Mont Choisy', tournament_date:'2026-01-10', category:'M25', division:'men', region:'Nord', club_name:'Mont Choisy Golf', rank:9,  team_name:'STEPAN/MARTIN',       player1_name:'Stepan Holy',               player2_name:'Martin Holy',               points:8  },
  { id:'res-t005-10',tournament_id:'t005', tournament_name:'M25 Mont Choisy', tournament_date:'2026-01-10', category:'M25', division:'men', region:'Nord', club_name:'Mont Choisy Golf', rank:10, team_name:'THIBAUT/SYLVAIN',     player1_name:'Thibaut Bosquillon De Jenlis',player2_name:'Sylvain Nguyen',          points:8  },
  { id:'res-t005-11',tournament_id:'t005', tournament_name:'M25 Mont Choisy', tournament_date:'2026-01-10', category:'M25', division:'men', region:'Nord', club_name:'Mont Choisy Golf', rank:11, team_name:'MAXWELL/JEAN',        player1_name:'Maxwell Ternel',            player2_name:'Jean Francois Richard',     points:8  },
  { id:'res-t005-12',tournament_id:'t005', tournament_name:'M25 Mont Choisy', tournament_date:'2026-01-10', category:'M25', division:'men', region:'Nord', club_name:'Mont Choisy Golf', rank:12, team_name:'ROMAIN/ROMAIN',       player1_name:'Romain Da Silva',           player2_name:'Romain De Brakeleer',       points:8  },

  // HOMMES — M50 Caña Beau Plan 10 Jan 2026
  { id:'res-t001h-1', tournament_id:'t001h', tournament_name:'M50 Caña Beau Plan', tournament_date:'2026-01-10', category:'M50', division:'men', region:'Nord', club_name:'Caña Beau Plan', rank:1,  team_name:'EMANUEL/PIERRE',       player1_name:'Emanuel Labour',        player2_name:'Pierre Pellegrin',       points:50 },
  { id:'res-t001h-2', tournament_id:'t001h', tournament_name:'M50 Caña Beau Plan', tournament_date:'2026-01-10', category:'M50', division:'men', region:'Nord', club_name:'Caña Beau Plan', rank:2,  team_name:'ALEXIS/DAMIEN',        player1_name:'Alexis Yon',            player2_name:'Damien Gouron',          points:40 },
  { id:'res-t001h-3', tournament_id:'t001h', tournament_name:'M50 Caña Beau Plan', tournament_date:'2026-01-10', category:'M50', division:'men', region:'Nord', club_name:'Caña Beau Plan', rank:3,  team_name:'NATHAN/JULES',         player1_name:'Nathan Currimjee',      player2_name:'Jules De Speville',      points:36 },
  { id:'res-t001h-4', tournament_id:'t001h', tournament_name:'M50 Caña Beau Plan', tournament_date:'2026-01-10', category:'M50', division:'men', region:'Nord', club_name:'Caña Beau Plan', rank:4,  team_name:'FRANCOIS/AMAURY',      player1_name:'Francois Audibert',     player2_name:'Amaury A R Desvaux',     points:34 },
  { id:'res-t001h-5', tournament_id:'t001h', tournament_name:'M50 Caña Beau Plan', tournament_date:'2026-01-10', category:'M50', division:'men', region:'Nord', club_name:'Caña Beau Plan', rank:5,  team_name:'STEPHANE/THOMAS',      player1_name:'Stephane Maurel',       player2_name:'Thomas D\'Unienville',   points:31 },
  { id:'res-t001h-6', tournament_id:'t001h', tournament_name:'M50 Caña Beau Plan', tournament_date:'2026-01-10', category:'M50', division:'men', region:'Nord', club_name:'Caña Beau Plan', rank:6,  team_name:'AMRIT/STEVENS',        player1_name:'Amrit Dindoyal',        player2_name:'Stevens Angoh',          points:31 },
  { id:'res-t001h-7', tournament_id:'t001h', tournament_name:'M50 Caña Beau Plan', tournament_date:'2026-01-10', category:'M50', division:'men', region:'Nord', club_name:'Caña Beau Plan', rank:7,  team_name:'KEVIN/ALEXIS',         player1_name:'Kevin Blanc',           player2_name:'Alexis Gangloff',        points:27 },
  { id:'res-t001h-8', tournament_id:'t001h', tournament_name:'M50 Caña Beau Plan', tournament_date:'2026-01-10', category:'M50', division:'men', region:'Nord', club_name:'Caña Beau Plan', rank:8,  team_name:'GUILLAUME/MATHIEU',    player1_name:'Guillaume Lefebure',    player2_name:'Mathieu Mamet',          points:27 },

  // HOMMES — M250 Labourdonnais Mapou 10 Jan 2026
  { id:'res-t004-1', tournament_id:'t004', tournament_name:'M250 Mapou', tournament_date:'2026-01-10', category:'M250', division:'men', region:'Nord', club_name:'Labourdonnais Mapou', rank:1,  team_name:'KIRILL/FEDOR',         player1_name:'Kirill Lyzhnikov',      player2_name:'Fedor Lyzhnikov',        points:250 },
  { id:'res-t004-2', tournament_id:'t004', tournament_name:'M250 Mapou', tournament_date:'2026-01-10', category:'M250', division:'men', region:'Nord', club_name:'Labourdonnais Mapou', rank:2,  team_name:'HUGO/MATTEO',          player1_name:'Hugo Hoffmann',         player2_name:'Matteo Hoffmann',        points:163 },
  { id:'res-t004-3', tournament_id:'t004', tournament_name:'M250 Mapou', tournament_date:'2026-01-10', category:'M250', division:'men', region:'Nord', club_name:'Labourdonnais Mapou', rank:3,  team_name:'ULRIC/ADAM',           player1_name:'Ulric Dupont',          player2_name:'Adam Auckland',          points:138 },
  { id:'res-t004-4', tournament_id:'t004', tournament_name:'M250 Mapou', tournament_date:'2026-01-10', category:'M250', division:'men', region:'Nord', club_name:'Labourdonnais Mapou', rank:4,  team_name:'JAKE/SAMUEL',          player1_name:'Jake Lam Hau Ching',    player2_name:'Samuel Ava',             points:125 },
  { id:'res-t004-5', tournament_id:'t004', tournament_name:'M250 Mapou', tournament_date:'2026-01-10', category:'M250', division:'men', region:'Nord', club_name:'Labourdonnais Mapou', rank:5,  team_name:'SANJAY/JOHN',          player1_name:'Sanjay Delaporte',      player2_name:'John Ville Allaman',     points:88  },
  { id:'res-t004-6', tournament_id:'t004', tournament_name:'M250 Mapou', tournament_date:'2026-01-10', category:'M250', division:'men', region:'Nord', club_name:'Labourdonnais Mapou', rank:6,  team_name:'JEROME/CHARLIE',       player1_name:'Jerome Mamet',          player2_name:'Charlie Goupil',         points:63  },
  { id:'res-t004-7', tournament_id:'t004', tournament_name:'M250 Mapou', tournament_date:'2026-01-10', category:'M250', division:'men', region:'Nord', club_name:'Labourdonnais Mapou', rank:7,  team_name:'MICKAEL/ANTOINE',      player1_name:'Mickael Gosch',         player2_name:'Antoine De Haas',        points:50  },
  { id:'res-t004-8', tournament_id:'t004', tournament_name:'M250 Mapou', tournament_date:'2026-01-10', category:'M250', division:'men', region:'Nord', club_name:'Labourdonnais Mapou', rank:8,  team_name:'BAPTISTE/AXEL',        player1_name:'Baptiste Trouabal',     player2_name:'Axel Bourdet',           points:38  },

  // HOMMES — M50 Urban Sport Grand Baie 24 Jan 2026
  { id:'res-t014-1', tournament_id:'t014', tournament_name:'M50 Urban Grand Baie', tournament_date:'2026-01-24', category:'M50', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:1,  team_name:'SAMUEL/ROMAIN',      player1_name:'Samuel Soussi',         player2_name:'Romain Beltrando',       points:50 },
  { id:'res-t014-2', tournament_id:'t014', tournament_name:'M50 Urban Grand Baie', tournament_date:'2026-01-24', category:'M50', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:2,  team_name:'QUENTIN/AXEL',       player1_name:'Quentin Thelohan',      player2_name:'Axel Demontoux',         points:36 },
  { id:'res-t014-3', tournament_id:'t014', tournament_name:'M50 Urban Grand Baie', tournament_date:'2026-01-24', category:'M50', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:3,  team_name:'SAJAD/NATHAN',       player1_name:'Sajad Nurani',          player2_name:'Nathan Currimjee',       points:32 },
  { id:'res-t014-4', tournament_id:'t014', tournament_name:'M50 Urban Grand Baie', tournament_date:'2026-01-24', category:'M50', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:4,  team_name:'FRAN/MARTIN',        player1_name:'Fran Gomez',            player2_name:'Martin David',           points:30 },
  { id:'res-t014-5', tournament_id:'t014', tournament_name:'M50 Urban Grand Baie', tournament_date:'2026-01-24', category:'M50', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:5,  team_name:'ANDRE/FABIEN',       player1_name:'Andre Gerard',          player2_name:'Fabien Hocquez',         points:28 },
  { id:'res-t014-6', tournament_id:'t014', tournament_name:'M50 Urban Grand Baie', tournament_date:'2026-01-24', category:'M50', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:6,  team_name:'JOHN/RETIEF',        player1_name:'John Keeve',            player2_name:'Retief Keeve',           points:26 },
  { id:'res-t014-7', tournament_id:'t014', tournament_name:'M50 Urban Grand Baie', tournament_date:'2026-01-24', category:'M50', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:7,  team_name:'ZAID/LOIS',          player1_name:'Zaid Jeewon',           player2_name:'Lois De Ricquebourg',    points:24 },
  { id:'res-t014-8', tournament_id:'t014', tournament_name:'M50 Urban Grand Baie', tournament_date:'2026-01-24', category:'M50', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:8,  team_name:'JIMMY/CHRISTOPHE',   player1_name:'Jimmy Devinaz',         player2_name:'Christophe Quinta',      points:22 },
  { id:'res-t014-9', tournament_id:'t014', tournament_name:'M50 Urban Grand Baie', tournament_date:'2026-01-24', category:'M50', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:9,  team_name:'LOIC/LAURENT',       player1_name:'Loic Boncoeur',         player2_name:'Laurent Hannelas',       points:20 },
  { id:'res-t014-10',tournament_id:'t014', tournament_name:'M50 Urban Grand Baie', tournament_date:'2026-01-24', category:'M50', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:10, team_name:'FABRICE/VIRGILE',    player1_name:'Fabrice Henaut',        player2_name:'Virgile Henaut',         points:18 },
  { id:'res-t014-11',tournament_id:'t014', tournament_name:'M50 Urban Grand Baie', tournament_date:'2026-01-24', category:'M50', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:11, team_name:'ANDRY/NICHOLAS',     player1_name:'Andry Ah Choon',        player2_name:'Nicholas Pinagapamy',    points:14 },
  { id:'res-t014-12',tournament_id:'t014', tournament_name:'M50 Urban Grand Baie', tournament_date:'2026-01-24', category:'M50', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:12, team_name:'GARY/STEVENS',       player1_name:'Gary Lan',              player2_name:'Stevens Angoh',          points:10 },
  { id:'res-t014-13',tournament_id:'t014', tournament_name:'M50 Urban Grand Baie', tournament_date:'2026-01-24', category:'M50', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:13, team_name:'NICOLAS/ENZO',       player1_name:'Nicolas Marie',         player2_name:'Enzo Veeren',            points:8  },
  { id:'res-t014-14',tournament_id:'t014', tournament_name:'M50 Urban Grand Baie', tournament_date:'2026-01-24', category:'M50', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:14, team_name:'ELIE/SAMUEL',        player1_name:'Elie Mathieu',          player2_name:'Samuel Bathfield',       points:6  },
  { id:'res-t014-15',tournament_id:'t014', tournament_name:'M50 Urban Grand Baie', tournament_date:'2026-01-24', category:'M50', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:15, team_name:'FREDERIC/MICHAEL',   player1_name:'Frederic Olivier',      player2_name:'Michael Jamot',          points:4  },
  { id:'res-t014-16',tournament_id:'t014', tournament_name:'M50 Urban Grand Baie', tournament_date:'2026-01-24', category:'M50', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:16, team_name:'FABIO/THOMAS',       player1_name:'Fabio Fernandes',       player2_name:'Thomas Colombier',       points:2  },

  // MIXTE — M500 Studio by RM Azuri 24 Jan 2026
  { id:'res-t012-1', tournament_id:'t012', tournament_name:'M500 Mixte Azuri',  tournament_date:'2026-01-24', category:'M500', division:'mixed', region:'Est', club_name:'Studio by RM Azuri', rank:1,  team_name:'COLINE/CHRISTIAN',       player1_name:'Coline Aumard',         player2_name:'Christian Bezandry',     points:500 },
  { id:'res-t012-2', tournament_id:'t012', tournament_name:'M500 Mixte Azuri',  tournament_date:'2026-01-24', category:'M500', division:'mixed', region:'Est', club_name:'Studio by RM Azuri', rank:2,  team_name:'YUSHNA/FX',              player1_name:'Yushna Saddul',         player2_name:'Francois-Xavier Pieltain', points:375 },
  { id:'res-t012-3', tournament_id:'t012', tournament_name:'M500 Mixte Azuri',  tournament_date:'2026-01-24', category:'M500', division:'mixed', region:'Est', club_name:'Studio by RM Azuri', rank:3,  team_name:'EMMA/EMANUEL',           player1_name:'Emma Armand',           player2_name:'Emanuel Labour',         points:325 },
  { id:'res-t012-4', tournament_id:'t012', tournament_name:'M500 Mixte Azuri',  tournament_date:'2026-01-24', category:'M500', division:'mixed', region:'Est', club_name:'Studio by RM Azuri', rank:4,  team_name:'AGNES/FABIEN',           player1_name:'Agnes Desvaux',         player2_name:'Fabien Breton',          points:300 },
  { id:'res-t012-5', tournament_id:'t012', tournament_name:'M500 Mixte Azuri',  tournament_date:'2026-01-24', category:'M500', division:'mixed', region:'Est', club_name:'Studio by RM Azuri', rank:5,  team_name:'SANDRA/ADAM',            player1_name:'Sandra Bezandry',       player2_name:'Adam Auckland',          points:275 },
  { id:'res-t012-6', tournament_id:'t012', tournament_name:'M500 Mixte Azuri',  tournament_date:'2026-01-24', category:'M500', division:'mixed', region:'Est', club_name:'Studio by RM Azuri', rank:6,  team_name:'CARLA/JONATHAN',         player1_name:'Carla Allison',         player2_name:'Jonathan Mathieu',       points:250 },
  { id:'res-t012-7', tournament_id:'t012', tournament_name:'M500 Mixte Azuri',  tournament_date:'2026-01-24', category:'M500', division:'mixed', region:'Est', club_name:'Studio by RM Azuri', rank:7,  team_name:'NICCI/LOIC',             player1_name:'Nicci Holvec',          player2_name:'Loic Hardy',             points:225 },
  { id:'res-t012-8', tournament_id:'t012', tournament_name:'M500 Mixte Azuri',  tournament_date:'2026-01-24', category:'M500', division:'mixed', region:'Est', club_name:'Studio by RM Azuri', rank:8,  team_name:'ELSA/JEAN-MICHEL',       player1_name:'Elsa Paul',             player2_name:'Jean-Michel Lacide',     points:200 },
  { id:'res-t012-9', tournament_id:'t012', tournament_name:'M500 Mixte Azuri',  tournament_date:'2026-01-24', category:'M500', division:'mixed', region:'Est', club_name:'Studio by RM Azuri', rank:9,  team_name:'CLEA/EMMANUEL',          player1_name:'Clea Mamet',            player2_name:'Emmanuel Perrault',      points:175 },
  { id:'res-t012-10',tournament_id:'t012', tournament_name:'M500 Mixte Azuri',  tournament_date:'2026-01-24', category:'M500', division:'mixed', region:'Est', club_name:'Studio by RM Azuri', rank:10, team_name:'ANNE LAURE/LAURENT',     player1_name:'Anne Laure Jeudy',      player2_name:'Laurent Jeudy',          points:150 },

  // HOMMES — M100 I Padel Port Chambly 31 Jan 2026
  { id:'res-t018h-1', tournament_id:'t018h', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'men',   region:'Sud', club_name:'I Padel by RM Port Chambly', rank:1,  team_name:'EDOUARD/JULIEN',    player1_name:'Edouard Remont',        player2_name:'Julien Bee',             points:100 },
  { id:'res-t018h-2', tournament_id:'t018h', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'men',   region:'Sud', club_name:'I Padel by RM Port Chambly', rank:2,  team_name:'OLIVIER/FABRICE',   player1_name:'Olivier Hannelas',      player2_name:'Fabrice Nayna',          points:65  },
  { id:'res-t018h-3', tournament_id:'t018h', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'men',   region:'Sud', club_name:'I Padel by RM Port Chambly', rank:3,  team_name:'FRAN/MARTIN',       player1_name:'Fran Gomez',            player2_name:'Martin David',           points:55  },
  { id:'res-t018h-4', tournament_id:'t018h', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'men',   region:'Sud', club_name:'I Padel by RM Port Chambly', rank:4,  team_name:'ANDY/JOEY',         player1_name:'Andy Tse',              player2_name:'Joey Foo Kune',          points:50  },
  { id:'res-t018h-5', tournament_id:'t018h', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'men',   region:'Sud', club_name:'I Padel by RM Port Chambly', rank:5,  team_name:'KHIM/ASHLEY',       player1_name:'Khim Lee Baw',          player2_name:'Ashley Jugdarree',       points:35  },
  { id:'res-t018h-6', tournament_id:'t018h', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'men',   region:'Sud', club_name:'I Padel by RM Port Chambly', rank:6,  team_name:'EDMUND/CEDRICK',    player1_name:'Edmund Dibden',         player2_name:'Cedrick Raffray',        points:25  },
  { id:'res-t018h-7', tournament_id:'t018h', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'men',   region:'Sud', club_name:'I Padel by RM Port Chambly', rank:7,  team_name:'EMMANUEL/FABIEN',   player1_name:'Emmanuel Perrault',     player2_name:'Fabien Kattic',          points:20  },
  { id:'res-t018h-8', tournament_id:'t018h', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'men',   region:'Sud', club_name:'I Padel by RM Port Chambly', rank:8,  team_name:'REMI/ROBIN',        player1_name:'Remi Dubois',           player2_name:'Robin Carroi',           points:15  },
  { id:'res-t018h-9', tournament_id:'t018h', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'men',   region:'Sud', club_name:'I Padel by RM Port Chambly', rank:9,  team_name:'PHILIPPE/THOMAS',   player1_name:'Philippe Cavaignac',    player2_name:'Thomas Renneteau',       points:10  },
  { id:'res-t018h-10',tournament_id:'t018h', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'men',   region:'Sud', club_name:'I Padel by RM Port Chambly', rank:10, team_name:'NOA/NATHAN',        player1_name:'Noa Bee',               player2_name:'Nathan Currimjee',       points:5   },

  // DAMES — M100 I Padel Port Chambly 31 Jan 2026
  { id:'res-t018f-1', tournament_id:'t018f', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'women', region:'Sud', club_name:'I Padel by RM Port Chambly', rank:1,  team_name:'MELANIE/ISABELLE',  player1_name:'Melanie Noel',          player2_name:'Isabelle Robert',        points:100 },
  { id:'res-t018f-2', tournament_id:'t018f', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'women', region:'Sud', club_name:'I Padel by RM Port Chambly', rank:2,  team_name:'CATHERINE/WENDY',   player1_name:'Catherine Chong',       player2_name:'Wendy Ng Foong Po',      points:65  },
  { id:'res-t018f-3', tournament_id:'t018f', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'women', region:'Sud', club_name:'I Padel by RM Port Chambly', rank:3,  team_name:'AKI/AURELIA',       player1_name:'Aki Gomand',            player2_name:'Aurelia Bee',            points:55  },
  { id:'res-t018f-4', tournament_id:'t018f', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'women', region:'Sud', club_name:'I Padel by RM Port Chambly', rank:4,  team_name:'MADELEINE/SANDRA',  player1_name:'Madeleine Dauguet',     player2_name:'Sandra Bezandry',        points:50  },
  { id:'res-t018f-5', tournament_id:'t018f', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'women', region:'Sud', club_name:'I Padel by RM Port Chambly', rank:5,  team_name:'STEFANIE/NICOLE',   player1_name:'Stefanie Vermaak',      player2_name:'Nicole Vermaak',         points:35  },
  { id:'res-t018f-6', tournament_id:'t018f', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'women', region:'Sud', club_name:'I Padel by RM Port Chambly', rank:6,  team_name:'LAURENCE/AGATHE',   player1_name:'Laurence Toinel',       player2_name:'Agathe Selig',           points:25  },
  { id:'res-t018f-7', tournament_id:'t018f', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'women', region:'Sud', club_name:'I Padel by RM Port Chambly', rank:7,  team_name:'ELOISE/AMELIE',     player1_name:'Eloise Boyer',          player2_name:'Amelie Fafournoux',      points:20  },
  { id:'res-t018f-8', tournament_id:'t018f', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'women', region:'Sud', club_name:'I Padel by RM Port Chambly', rank:8,  team_name:'LAISA/STEPHANIE',   player1_name:'Laisa Ah Choon',        player2_name:'Stephanie Angoh',        points:15  },
  { id:'res-t018f-9', tournament_id:'t018f', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'women', region:'Sud', club_name:'I Padel by RM Port Chambly', rank:9,  team_name:'HAVISHA/SANDRINE',  player1_name:'Havisha Simi Bunjun',   player2_name:'Sandrine Marot',         points:10  },
  { id:'res-t018f-10',tournament_id:'t018f', tournament_name:'M100 Port Chambly', tournament_date:'2026-01-31', category:'M100', division:'women', region:'Sud', club_name:'I Padel by RM Port Chambly', rank:10, team_name:'EMMANUELLE/ELSA',   player1_name:'Emmanuelle Exiga',      player2_name:'Elsa Dasc',              points:5   },

  // HOMMES — M50 Club Med Albion 31 Jan 2026
  { id:'res-t017h-1', tournament_id:'t017h', tournament_name:'M50 Albion',        tournament_date:'2026-01-31', category:'M50', division:'men',   region:'Ouest', club_name:'Club Med Albion',  rank:1,  team_name:'DAMIEN/ALEXIS',      player1_name:'Damien Gouron',         player2_name:'Alexis Yon',             points:50  },
  { id:'res-t017h-2', tournament_id:'t017h', tournament_name:'M50 Albion',        tournament_date:'2026-01-31', category:'M50', division:'men',   region:'Ouest', club_name:'Club Med Albion',  rank:2,  team_name:'ALAIN/EMILE',        player1_name:'Alain Gustin',          player2_name:'Emile Gustin',           points:34  },
  { id:'res-t017h-3', tournament_id:'t017h', tournament_name:'M50 Albion',        tournament_date:'2026-01-31', category:'M50', division:'men',   region:'Ouest', club_name:'Club Med Albion',  rank:3,  team_name:'LAURENT/SAMUEL',     player1_name:'Laurent Daruty',        player2_name:'Samuel Gallet',          points:30  },
  { id:'res-t017h-4', tournament_id:'t017h', tournament_name:'M50 Albion',        tournament_date:'2026-01-31', category:'M50', division:'men',   region:'Ouest', club_name:'Club Med Albion',  rank:4,  team_name:'BRYAN/SAJAD',        player1_name:'Bryan Foo-Kune',        player2_name:'Sajad Nurani',           points:26  },
  { id:'res-t017h-5', tournament_id:'t017h', tournament_name:'M50 Albion',        tournament_date:'2026-01-31', category:'M50', division:'men',   region:'Ouest', club_name:'Club Med Albion',  rank:5,  team_name:'IBRAHIM/LAURENT',    player1_name:'Ibrahim Dala',          player2_name:'Laurent Hannelas',       points:22  },
  { id:'res-t017h-6', tournament_id:'t017h', tournament_name:'M50 Albion',        tournament_date:'2026-01-31', category:'M50', division:'men',   region:'Ouest', club_name:'Club Med Albion',  rank:6,  team_name:'THIERRY/MAXIME',     player1_name:'Thierry Bindini',       player2_name:'Maxime Huyse',           points:18  },
  { id:'res-t017h-7', tournament_id:'t017h', tournament_name:'M50 Albion',        tournament_date:'2026-01-31', category:'M50', division:'men',   region:'Ouest', club_name:'Club Med Albion',  rank:7,  team_name:'BERTRAND/STEPHANE',  player1_name:'Bertrand De Coriolis',  player2_name:'Stephane Maurel',        points:14  },
  { id:'res-t017h-8', tournament_id:'t017h', tournament_name:'M50 Albion',        tournament_date:'2026-01-31', category:'M50', division:'men',   region:'Ouest', club_name:'Club Med Albion',  rank:8,  team_name:'JEFFREY/ANDRY',      player1_name:'Jeffrey Driver',        player2_name:'Andry Ah Choon',         points:10  },

  // HOMMES — M500 Labourdonnais Mapou 14 Fév 2026
  { id:'res-t026h-1', tournament_id:'t026h', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'men',   region:'Nord', club_name:'Labourdonnais Mapou', rank:1,  team_name:'AMAURY/JAKE',       player1_name:'Amaury De Beer',        player2_name:'Jake Lam Hau Ching',     points:500 },
  { id:'res-t026h-2', tournament_id:'t026h', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'men',   region:'Nord', club_name:'Labourdonnais Mapou', rank:2,  team_name:'BRICE/MAXIME',      player1_name:'Brice Lescroart',       player2_name:'Maxime Joris',           points:400 },
  { id:'res-t026h-3', tournament_id:'t026h', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'men',   region:'Nord', club_name:'Labourdonnais Mapou', rank:3,  team_name:'PIERRE/DIMITRI',    player1_name:'Pierre Gadait',         player2_name:'Dimitri Raffray',        points:385 },
  { id:'res-t026h-4', tournament_id:'t026h', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'men',   region:'Nord', club_name:'Labourdonnais Mapou', rank:4,  team_name:'MATHIEU/FREDERICK', player1_name:'Mathieu Vallet',        player2_name:'Frederick Raffray',      points:350 },
  { id:'res-t026h-5', tournament_id:'t026h', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'men',   region:'Nord', club_name:'Labourdonnais Mapou', rank:5,  team_name:'ULRIC/ENZO',        player1_name:'Ulric Dupont',          player2_name:'Enzo Couacaud',          points:335 },
  { id:'res-t026h-6', tournament_id:'t026h', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'men',   region:'Nord', club_name:'Labourdonnais Mapou', rank:6,  team_name:'FLORIAN/REMI',      player1_name:'Florian Manson',        player2_name:'Remi Batard',            points:320 },
  { id:'res-t026h-7', tournament_id:'t026h', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'men',   region:'Nord', club_name:'Labourdonnais Mapou', rank:7,  team_name:'JOSSELIN/NICOLAS',  player1_name:'Josselin Cotin',        player2_name:'Nicolas Legros',         points:275 },
  { id:'res-t026h-8', tournament_id:'t026h', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'men',   region:'Nord', club_name:'Labourdonnais Mapou', rank:8,  team_name:'LOIC/RYAN',         player1_name:'Loic Mamet',            player2_name:'Ryan Wong',              points:275 },

  // DAMES — M500 Labourdonnais Mapou 14 Fév 2026
  { id:'res-t026f-1', tournament_id:'t026f', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'women', region:'Nord', club_name:'Labourdonnais Mapou', rank:1,  team_name:'MARINNE/MAGALY',    player1_name:'Marinne Giraud',        player2_name:'Magaly Schaffo',         points:500 },
  { id:'res-t026f-2', tournament_id:'t026f', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'women', region:'Nord', club_name:'Labourdonnais Mapou', rank:2,  team_name:'ALICE/LAURA',       player1_name:'Alice Danjoux',         player2_name:'Laura Koenig',           points:325 },
  { id:'res-t026f-3', tournament_id:'t026f', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'women', region:'Nord', club_name:'Labourdonnais Mapou', rank:3,  team_name:'CECILE/CELINE',     player1_name:'Cecile Park',           player2_name:'Celine Desvaux De Marigny', points:275 },
  { id:'res-t026f-4', tournament_id:'t026f', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'women', region:'Nord', club_name:'Labourdonnais Mapou', rank:4,  team_name:'ELSA/SANDRINE',     player1_name:'Elsa Toulet',           player2_name:'Sandrine De Speville',   points:260 },
  { id:'res-t026f-5', tournament_id:'t026f', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'women', region:'Nord', club_name:'Labourdonnais Mapou', rank:5,  team_name:'LAETITIA/COLINE',   player1_name:'Laetitia Gossart',      player2_name:'Coline Aumard',          points:175 },
  { id:'res-t026f-6', tournament_id:'t026f', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'women', region:'Nord', club_name:'Labourdonnais Mapou', rank:6,  team_name:'CAYLA/MARTINA',     player1_name:'Cayla Bezuidenhout',    player2_name:'Martina Hola',           points:135 },
  { id:'res-t026f-7', tournament_id:'t026f', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'women', region:'Nord', club_name:'Labourdonnais Mapou', rank:7,  team_name:'VALENTINA/ESTELLE', player1_name:'Valentina Cruciani',    player2_name:'Estelle Nolot',          points:110 },
  { id:'res-t026f-8', tournament_id:'t026f', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'women', region:'Nord', club_name:'Labourdonnais Mapou', rank:8,  team_name:'MELANIE/MEGANE',    player1_name:'Melanie Courcoux',      player2_name:'Megane Rasamimanana',    points:75  },
  { id:'res-t026f-9', tournament_id:'t026f', tournament_name:'M500 Mapou',        tournament_date:'2026-02-14', category:'M500', division:'women', region:'Nord', club_name:'Labourdonnais Mapou', rank:9,  team_name:'NADIA/SARA',        player1_name:'Nadia Vallet',          player2_name:'Sara Fortunato',         points:50  },

  // HOMMES — M100 Studio by RM Azuri 15 Fév 2026
  { id:'res-t029h-1', tournament_id:'t029h', tournament_name:'M100 Azuri',        tournament_date:'2026-02-15', category:'M100', division:'men',   region:'Est', club_name:'Studio by RM Azuri', rank:1,  team_name:'PIERRE/ALEXANDRE',  player1_name:'Pierre Lebreton',       player2_name:'Alexandre Cazin Rodrigues', points:100 },
  { id:'res-t029h-2', tournament_id:'t029h', tournament_name:'M100 Azuri',        tournament_date:'2026-02-15', category:'M100', division:'men',   region:'Est', club_name:'Studio by RM Azuri', rank:2,  team_name:'ANTOINE/ROMAIN',    player1_name:'Antoine Fraisse',       player2_name:'Romain Bernard',         points:70  },
  { id:'res-t029h-3', tournament_id:'t029h', tournament_name:'M100 Azuri',        tournament_date:'2026-02-15', category:'M100', division:'men',   region:'Est', club_name:'Studio by RM Azuri', rank:3,  team_name:'PHILIPP/MAXENCE',   player1_name:'Philipp Demidoff',      player2_name:'Maxence Herve',          points:60  },
  { id:'res-t029h-4', tournament_id:'t029h', tournament_name:'M100 Azuri',        tournament_date:'2026-02-15', category:'M100', division:'men',   region:'Est', club_name:'Studio by RM Azuri', rank:4,  team_name:'LUCA/LEONARDO',     player1_name:'Luca Navarrini',        player2_name:'Leonardo Navarrini',     points:55  },
  { id:'res-t029h-5', tournament_id:'t029h', tournament_name:'M100 Azuri',        tournament_date:'2026-02-15', category:'M100', division:'men',   region:'Est', club_name:'Studio by RM Azuri', rank:5,  team_name:'THOMAS/HICHAM',     player1_name:'Thomas D\'Unienville',  player2_name:'Hicham Rharbaoui',       points:45  },
  { id:'res-t029h-6', tournament_id:'t029h', tournament_name:'M100 Azuri',        tournament_date:'2026-02-15', category:'M100', division:'men',   region:'Est', club_name:'Studio by RM Azuri', rank:6,  team_name:'THOMAS/LUDOVIC',    player1_name:'Thomas Maujean',        player2_name:'Ludovic Rousseau',       points:40  },
  { id:'res-t029h-7', tournament_id:'t029h', tournament_name:'M100 Azuri',        tournament_date:'2026-02-15', category:'M100', division:'men',   region:'Est', club_name:'Studio by RM Azuri', rank:7,  team_name:'ERIC/FREDERIC',     player1_name:'Eric Laporte',          player2_name:'Frederic Geoffroy',      points:35  },
  { id:'res-t029h-8', tournament_id:'t029h', tournament_name:'M100 Azuri',        tournament_date:'2026-02-15', category:'M100', division:'men',   region:'Est', club_name:'Studio by RM Azuri', rank:8,  team_name:'EMANUEL/DAMIEN',    player1_name:'Emanuel Labour',        player2_name:'Damien Steyn',           points:30  },

  // DAMES — M100 Studio by RM Azuri 15 Fév 2026
  { id:'res-t029f-1', tournament_id:'t029f', tournament_name:'M100 Azuri',        tournament_date:'2026-02-15', category:'M100', division:'women', region:'Est', club_name:'Studio by RM Azuri', rank:1,  team_name:'CLEA/EMMA',         player1_name:'Clea Mamet',            player2_name:'Emma Armand',            points:100 },
  { id:'res-t029f-2', tournament_id:'t029f', tournament_name:'M100 Azuri',        tournament_date:'2026-02-15', category:'M100', division:'women', region:'Est', club_name:'Studio by RM Azuri', rank:2,  team_name:'MARGOT/AGNES',      player1_name:'Margot Martineau',      player2_name:'Agnes Koenig',           points:65  },
  { id:'res-t029f-3', tournament_id:'t029f', tournament_name:'M100 Azuri',        tournament_date:'2026-02-15', category:'M100', division:'women', region:'Est', club_name:'Studio by RM Azuri', rank:3,  team_name:'AKI/JOELLE',        player1_name:'Aki Gomand',            player2_name:'Joelle Hirigoyen',       points:55  },
  { id:'res-t029f-4', tournament_id:'t029f', tournament_name:'M100 Azuri',        tournament_date:'2026-02-15', category:'M100', division:'women', region:'Est', club_name:'Studio by RM Azuri', rank:4,  team_name:'SVETLANA/LAURENCE', player1_name:'Svetlana Sidorova',     player2_name:'Laurence Mayol',         points:50  },
  { id:'res-t029f-5', tournament_id:'t029f', tournament_name:'M100 Azuri',        tournament_date:'2026-02-15', category:'M100', division:'women', region:'Est', club_name:'Studio by RM Azuri', rank:5,  team_name:'MELISSA/MONIQUE',   player1_name:'Melissa Viljoen',       player2_name:'Monique Coombes',        points:35  },
  { id:'res-t029f-6', tournament_id:'t029f', tournament_name:'M100 Azuri',        tournament_date:'2026-02-15', category:'M100', division:'women', region:'Est', club_name:'Studio by RM Azuri', rank:6,  team_name:'ELOISE/AMELIE',     player1_name:'Eloise Boyer',          player2_name:'Amelie Fafournoux',      points:25  },
  { id:'res-t029f-7', tournament_id:'t029f', tournament_name:'M100 Azuri',        tournament_date:'2026-02-15', category:'M100', division:'women', region:'Est', club_name:'Studio by RM Azuri', rank:7,  team_name:'CATHERINE/ANNE',    player1_name:'Catherine Vallet',      player2_name:'Anne Lucas',             points:20  },
  { id:'res-t029f-8', tournament_id:'t029f', tournament_name:'M100 Azuri',        tournament_date:'2026-02-15', category:'M100', division:'women', region:'Est', club_name:'Studio by RM Azuri', rank:8,  team_name:'MELANIE/AUDREY',    player1_name:'Melanie Noel',          player2_name:'Audrey Delabre',         points:15  },

  // DAMES — M50 Energia Pointe aux Canonniers 7 Fév 2026
  { id:'res-t022f-1', tournament_id:'t022f', tournament_name:'M50 Energia',       tournament_date:'2026-02-07', category:'M50', division:'women', region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:1, team_name:'CATHERINE/WENDY',  player1_name:'Catherine Chong',       player2_name:'Wendy Ng Foong Po',      points:50 },
  { id:'res-t022f-2', tournament_id:'t022f', tournament_name:'M50 Energia',       tournament_date:'2026-02-07', category:'M50', division:'women', region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:2, team_name:'KIRSTY/SHAMIRA',   player1_name:'Kirsty Durrheim',       player2_name:'Shamira Kaumaya',        points:30 },
  { id:'res-t022f-3', tournament_id:'t022f', tournament_name:'M50 Energia',       tournament_date:'2026-02-07', category:'M50', division:'women', region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:3, team_name:'ANNE/LAISA',       player1_name:'Anne-Sophie De La Gourner', player2_name:'Laisa Ah Choon',     points:24 },
  { id:'res-t022f-4', tournament_id:'t022f', tournament_name:'M50 Energia',       tournament_date:'2026-02-07', category:'M50', division:'women', region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:4, team_name:'MANUELA/AKI',      player1_name:'Manuela Ava',           player2_name:'Aki Gomand',             points:18 },
  { id:'res-t022f-5', tournament_id:'t022f', tournament_name:'M50 Energia',       tournament_date:'2026-02-07', category:'M50', division:'women', region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:5, team_name:'AUDREY/MELANIE',   player1_name:'Audrey Delabre',        player2_name:'Melanie Noel',           points:12 },
  { id:'res-t022f-6', tournament_id:'t022f', tournament_name:'M50 Energia',       tournament_date:'2026-02-07', category:'M50', division:'women', region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:6, team_name:'CHANTAL/JOANNE',   player1_name:'Chantal Oosthuizen',    player2_name:'Joanne Duddle',          points:8  },
  { id:'res-t022f-7', tournament_id:'t022f', tournament_name:'M50 Energia',       tournament_date:'2026-02-07', category:'M50', division:'women', region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:7, team_name:'HAVISHA/SANDRINE', player1_name:'Havisha Simi Bunjun',   player2_name:'Sandrine Marot',         points:4  },
  { id:'res-t022f-8', tournament_id:'t022f', tournament_name:'M50 Energia',       tournament_date:'2026-02-07', category:'M50', division:'women', region:'Nord', club_name:'Energia Pointe aux Canonniers', rank:8, team_name:'CELINE/ELODIE',    player1_name:'Celine Girodet',        player2_name:'Elodie Jacobee',         points:2  },

  // HOMMES — M100 Urban Sport Grand Baie 7 Fév 2026
  { id:'res-t025-1',  tournament_id:'t025', tournament_name:'M100 Urban Grand Baie', tournament_date:'2026-02-07', category:'M100', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:1,  team_name:'FABRICE/ANDY',      player1_name:'Fabrice Nayna',       player2_name:'Andy Tse',              points:100 },
  { id:'res-t025-2',  tournament_id:'t025', tournament_name:'M100 Urban Grand Baie', tournament_date:'2026-02-07', category:'M100', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:2,  team_name:'CEDRIC/HUGO',       player1_name:'Cedric Vachet',       player2_name:'Hugo Curt',             points:70  },
  { id:'res-t025-3',  tournament_id:'t025', tournament_name:'M100 Urban Grand Baie', tournament_date:'2026-02-07', category:'M100', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:3,  team_name:'NOA/JULIEN',        player1_name:'Noa Bee',             player2_name:'Julien Bee',            points:60  },
  { id:'res-t025-4',  tournament_id:'t025', tournament_name:'M100 Urban Grand Baie', tournament_date:'2026-02-07', category:'M100', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:4,  team_name:'MARTIN/FRAN',       player1_name:'Martin David',        player2_name:'Fran Gomez',            points:55  },
  { id:'res-t025-5',  tournament_id:'t025', tournament_name:'M100 Urban Grand Baie', tournament_date:'2026-02-07', category:'M100', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:5,  team_name:'QUENTIN/AXEL',      player1_name:'Quentin Thelohan',    player2_name:'Axel Demontoux',        points:45  },
  { id:'res-t025-6',  tournament_id:'t025', tournament_name:'M100 Urban Grand Baie', tournament_date:'2026-02-07', category:'M100', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:6,  team_name:'CEDRIC/DAVID',      player1_name:'Cedric Rahmouni',     player2_name:'David Soulage',         points:40  },
  { id:'res-t025-7',  tournament_id:'t025', tournament_name:'M100 Urban Grand Baie', tournament_date:'2026-02-07', category:'M100', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:7,  team_name:'ROMAIN/LUDOVIC',    player1_name:'Romain Bernard',      player2_name:'Ludovic Rousseau',      points:35  },
  { id:'res-t025-8',  tournament_id:'t025', tournament_name:'M100 Urban Grand Baie', tournament_date:'2026-02-07', category:'M100', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:8,  team_name:'ASHLEY/LUCA',       player1_name:'Ashley Jugdarree',    player2_name:'Luca Navarrini',        points:30  },
  { id:'res-t025-9',  tournament_id:'t025', tournament_name:'M100 Urban Grand Baie', tournament_date:'2026-02-07', category:'M100', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:9,  team_name:'FABIEN/PAUL',       player1_name:'Fabien Fournier',     player2_name:'Paul Senaffe',          points:25  },
  { id:'res-t025-10', tournament_id:'t025', tournament_name:'M100 Urban Grand Baie', tournament_date:'2026-02-07', category:'M100', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:10, team_name:'KEVIN/ANDRY',       player1_name:'Kevin Boyer',         player2_name:'Andry Ah Choon',        points:21  },
  { id:'res-t025-11', tournament_id:'t025', tournament_name:'M100 Urban Grand Baie', tournament_date:'2026-02-07', category:'M100', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:11, team_name:'LAURENT/PASCAL',    player1_name:'Laurent Hannelas',    player2_name:'Pascal Quirin',         points:18  },
  { id:'res-t025-12', tournament_id:'t025', tournament_name:'M100 Urban Grand Baie', tournament_date:'2026-02-07', category:'M100', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:12, team_name:'THOMAS/AARON',      player1_name:'Thomas Amargos',      player2_name:'Aaron Fournier',        points:15  },
  { id:'res-t025-13', tournament_id:'t025', tournament_name:'M100 Urban Grand Baie', tournament_date:'2026-02-07', category:'M100', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:13, team_name:'JEREMY/OLIVIER',    player1_name:'Jeremy Nobels',       player2_name:'Olivier De Preville',   points:10  },
  { id:'res-t025-14', tournament_id:'t025', tournament_name:'M100 Urban Grand Baie', tournament_date:'2026-02-07', category:'M100', division:'men', region:'Nord', club_name:'Urban Sport Grand Baie', rank:14, team_name:'SARVISH/KUNAL',     player1_name:'Sarvish Keenoo',      player2_name:'Kunal Sewnauth',        points:5   },
];

const RESULT_COLUMNS = [
  'id',
  'tournament_id',
  'tournament_name',
  'tournament_date',
  'category',
  'division',
  'region',
  'club_name',
  'rank',
  'team_name',
  'player1_name',
  'player2_name',
  'points',
].join(',');

function supabaseErrorMessage(error: unknown): string {
  if (!error) return 'Erreur inconnue';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  const record = error as Record<string, unknown>;
  return String(record.message ?? record.details ?? record.hint ?? JSON.stringify(record));
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const DIVISION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  men:    { label: 'Hommes',  color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  women:  { label: 'Femmes',  color: '#f472b6', bg: 'rgba(244,114,182,0.12)' },
  mixed:  { label: 'Mixte',   color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  junior: { label: 'Junior',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
};

const CATEGORY_COLORS: Record<string, string> = {
  M25: '#6b7280', M50: '#10b981', M100: '#3b82f6',
  M250: '#8b5cf6', M500: '#f59e0b', M1000: '#ef4444',
};

function rankMedal(rank: number) {
  if (rank === 1) return { emoji: '🥇', color: '#f59e0b' };
  if (rank === 2) return { emoji: '🥈', color: '#94a3b8' };
  if (rank === 3) return { emoji: '🥉', color: '#cd7c2f' };
  return { emoji: `#${rank}`, color: '#6b7280' };
}

function formatDate(d: string): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return d; }
}

/** Convertit un nom en format Prénom Nom (première lettre de chaque mot en majuscule)
 *  Gère les cas: "NICOLAS DE CARITAT" → "Nicolas De Caritat"
 *  et laisse intact si déjà bien formaté */
/** Formate un nom de joueur depuis Supabase (CamelCase ou tout-majuscules ou normal)
 *  "MaxSchaffo"        → "Max Schaffo"
 *  "JeanMarieSylvain"  → "Jean Marie Sylvain"
 *  "NICOLAS DURAND"    → "Nicolas Durand"
 *  "Nicolas Durand"    → "Nicolas Durand" (inchangé)
 */
function formatName(raw: string): string {
  if (!raw) return '';
  // 1. CamelCase : insérer espace avant chaque majuscule précédée d'une minuscule
  const step1 = raw.replace(/([a-z])([A-Z])/g, '$1 $2');
  // 2. Title case sur chaque mot séparé
  return step1
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Rendu premium d'un nom : prénom en gris clair + NOM en blanc gras */
function PremiumName({ name, podium }: { name: string; podium: boolean }) {
  const formatted = formatName(name);
  const parts = formatted.trim().split(' ');
  // Dernier mot = NOM DE FAMILLE (majuscules), reste = prénom(s)
  const lastName  = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : formatted.toUpperCase();
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '5px' }}>
      {firstName && (
        <span style={{ fontSize: '11px', fontWeight: 500, color: podium ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.4)', letterSpacing: '0.2px' }}>
          {firstName}
        </span>
      )}
      <span style={{ fontSize: '13px', fontWeight: 800, color: podium ? 'white' : 'rgba(255,255,255,0.9)', letterSpacing: '0.3px' }}>
        {lastName}
      </span>
    </span>
  );
}
/** Normalise un nom de tournoi pour le groupement : retire les parenthèses,
 *  met en minuscules, retire les espaces — ex: "Azuri M100 (Dames)" → "azurim100" */
function normalizeTournName(name: string): string {
  return name.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').replace(/[^a-z0-9]/g, '');
}

function groupByTournament(results: TournamentResult[]): TournamentGroup[] {
  const map = new Map<string, TournamentGroup>();
  // Table de résolution : normKey → key retenu (premier vu)
  const normToKey = new Map<string, string>();

  for (const r of results) {
    // Clé normalisée : category + club_name + date (robuste aux variations de nom)
    const normKey = `${r.category}__${(r.club_name ?? '').toLowerCase().replace(/\s/g,'')}__${r.tournament_date}`;
    // Clé d'affichage (stable = premier nom rencontré pour ce normKey)
    let key = normToKey.get(normKey);
    if (!key) {
      // Préférer le nom le plus court / sans parenthèses
      key = `${normalizeTournName(r.tournament_name)}__${r.tournament_date}`;
      normToKey.set(normKey, key);
    }

    if (!map.has(key)) {
      map.set(key, {
        key,
        tournament_id: r.tournament_id,
        tournament_name: normalizeTournamentDisplayName(r.tournament_name, r.club_name),
        tournament_date: r.tournament_date,
        category: r.category,
        region: r.region,
        club_name: r.club_name,
        divisions: [],
      });
    }
    const grp = map.get(key)!;
    // Garder le nom le plus court (sans "(Dames)" etc.)
    if (r.tournament_name.length < grp.tournament_name.length) {
      grp.tournament_name = normalizeTournamentDisplayName(r.tournament_name, r.club_name);
    }
    let div = grp.divisions.find(d => d.division === r.division);
    if (!div) { div = { division: r.division, results: [] }; grp.divisions.push(div); }
    div.results.push(r);
  }
  // Trier les divisions (men → women → mixed → junior)
  const divOrder = ['men', 'women', 'mixed', 'junior'];
  for (const grp of map.values()) {
    grp.divisions.sort((a, b) => divOrder.indexOf(a.division) - divOrder.indexOf(b.division));
    for (const d of grp.divisions) d.results.sort((a, b) => a.rank - b.rank);
  }
  return Array.from(map.values()).sort((a, b) =>
    new Date(b.tournament_date).getTime() - new Date(a.tournament_date).getTime()
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMPOSANT CARTE D'UN TOURNOI
// ─────────────────────────────────────────────────────────────────────────────
function TournamentCard({ group, filterDiv = 'all' }: { group: TournamentGroup; filterDiv?: string }) {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  const catColor = CATEGORY_COLORS[group.category] ?? '#4ad569';

  // Filtrer les divisions à afficher selon le filtre actif
  const visibleDivisions = filterDiv === 'all'
    ? group.divisions
    : group.divisions.filter(d => d.division === filterDiv);

  return (
    <GlassCard style={{ padding: 0, overflow: 'hidden', marginBottom: '20px' }}>
      {/* En-tête du tournoi */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '20px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, flexWrap: 'wrap' }}>
          {/* Badge catégorie */}
          <span style={{
            background: `${catColor}20`, color: catColor,
            border: `1px solid ${catColor}40`, borderRadius: '8px',
            padding: '4px 12px', fontWeight: 800, fontSize: '13px', whiteSpace: 'nowrap',
          }}>
            {group.category}
          </span>
          {/* Nom — supprimer les suffixes (Dames)/(Hommes)/(Women)/(Men) du titre principal */}
          <span style={{ color: 'white', fontWeight: 700, fontSize: '18px', textAlign: 'left' }}>
            {group.tournament_name.replace(/\s*\((Dames|Hommes|Women|Men|Femmes)\)\s*/gi, '').trim()}
          </span>
          {/* Infos */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ color: '#888', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={13} /> {formatDate(group.tournament_date)}
            </span>
            <span style={{ color: '#888', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={13} /> {group.region}
            </span>
            {group.club_name && (
              <span style={{ color: '#888', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Users size={13} /> {group.club_name}
              </span>
            )}
          </div>
          {/* Pills divisions */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {group.divisions.map(d => {
              const cfg = DIVISION_CONFIG[d.division] ?? { label: d.division, color: '#aaa', bg: 'rgba(170,170,170,0.1)' };
              return (
                <span key={d.division} style={{
                  background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40`,
                  borderRadius: '20px', padding: '2px 10px', fontSize: '12px', fontWeight: 600,
                }}>
                  {cfg.label}
                </span>
              );
            })}
          </div>
        </div>
        <div style={{ color: '#666', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Lien vers le Calendrier */}
          <span
            onClick={e => { e.stopPropagation(); navigate(ROUTE_PATHS.CALENDAR); }}
            title="Voir dans le Calendrier"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'rgba(74,213,105,0.08)', color: '#4ad569',
              border: '1px solid rgba(74,213,105,0.2)',
              borderRadius: '8px', padding: '5px 10px',
              fontSize: '11px', fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.15s', whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,213,105,0.18)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(74,213,105,0.08)')}
          >
            <Calendar size={12} /> Calendrier <ExternalLink size={10} />
          </span>
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {/* Résultats dépliables */}
      {open && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '0 24px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(320px, 1fr))`, gap: '20px', paddingTop: '20px' }}>
            {visibleDivisions.map(div => {
              const cfg = DIVISION_CONFIG[div.division] ?? { label: div.division, color: '#aaa', bg: 'rgba(170,170,170,0.1)' };
              return (
                <div key={div.division}>
                  {/* Titre division */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    marginBottom: '12px', paddingBottom: '8px',
                    borderBottom: `1px solid ${cfg.color}30`,
                  }}>
                    <Medal size={16} color={cfg.color} />
                    <span style={{ color: cfg.color, fontWeight: 700, fontSize: '15px' }}>{cfg.label}</span>
                    <span style={{ color: '#555', fontSize: '12px', marginLeft: 'auto' }}>
                      {div.results.length} paires
                    </span>
                  </div>

                  {/* Tableau résultats */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {div.results.map(r => {
                      const medal = rankMedal(r.rank);
                      const isPodium = r.rank <= 3;
                      return (
                        <div key={r.id} style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '10px 14px',
                          background: isPodium ? `${cfg.color}08` : 'rgba(255,255,255,0.02)',
                          borderRadius: '10px',
                          border: isPodium ? `1px solid ${cfg.color}20` : '1px solid transparent',
                          transition: 'background 0.15s',
                        }}>
                          {/* Rang */}
                          <div style={{
                            minWidth: '36px', textAlign: 'center',
                            fontSize: r.rank <= 3 ? '18px' : '13px',
                            fontWeight: 800,
                            color: medal.color,
                          }}>
                            {r.rank <= 3 ? medal.emoji : `#${r.rank}`}
                          </div>

                          {/* Joueurs — rendu premium */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', lineHeight: 1.5 }}>
                              <PremiumName name={r.player1_name} podium={isPodium} />
                              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', fontWeight: 300 }}>·</span>
                              <PremiumName name={r.player2_name} podium={isPodium} />
                            </div>
                          </div>

                          {/* Points */}
                          <div style={{
                            textAlign: 'right', flexShrink: 0,
                          }}>
                            <span style={{
                              background: `${catColor}18`, color: catColor,
                              border: `1px solid ${catColor}30`,
                              borderRadius: '8px', padding: '3px 10px',
                              fontWeight: 700, fontSize: '13px',
                            }}>
                              +{r.points} pts
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE PRINCIPALE
// ─────────────────────────────────────────────────────────────────────────────
export default function Resultats() {
  useSeo({
    title: "Résultats Tournois Padel Maurice 2026 — MPL",
    description: "Résultats complets des tournois de padel à Maurice 2026. Classements par tournoi, équipes, scores. Mauritius Padel League.",
    keywords: "resultats padel mauritius, padel results mauritius, scores padel MPL 2026",
    canonical: "https://padelleague.mu/#/resultats",
  });
  const [allResults, setAllResults]   = useState<TournamentResult[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [fromSupabase, setFromSupabase] = useState(false);

  // Filtres
  const [search, setSearch]           = useState('');
  const [filterDiv, setFilterDiv]     = useState('all');
  const [filterCat, setFilterCat]     = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');

  const load = async () => {
    setLoading(true); setError('');
    const sb = getSupabaseClient();
    if (isSupabaseConnected() && sb) {
      const { data, error: err, timedOut } = await safeSupabaseQuery<TournamentResult[]>(() =>
        sb.from('tournament_results')
          .select(RESULT_COLUMNS)
          .order('tournament_date', { ascending: false })
          .order('rank', { ascending: true })
          .limit(5000),
        15000
      );
      if (timedOut) {
        setError('⏱ Supabase trop lent — données locales affichées');
        setAllResults(SEED_RESULTS);
        setFromSupabase(false);
      } else if (err) {
        console.warn('[Resultats] Supabase error:', err);
        setError(`Erreur Supabase: ${supabaseErrorMessage(err)} — données locales affichées`);
        setAllResults(SEED_RESULTS);
        setFromSupabase(false);
      } else if (data && data.length > 0) {
        // ── Normalisation division depuis Supabase ──────────────────────────
        // Certains résultats ont tournament_type/category au lieu de division='junior'
        // → on normalise pour que tous les filtres fonctionnent correctement
        const normalized = (data as TournamentResult[]).map(r => {
          let div = (r.division ?? '').toLowerCase().trim();
          // Si division manquante ou invalide, déduire depuis category ou tournament_type
          if (!div || !['men','women','mixed','junior'].includes(div)) {
            const cat  = (r.category ?? '').toUpperCase();
            const type = ((r as unknown as Record<string,unknown>).tournament_type as string ?? '').toUpperCase();
            if (type === 'JUNIOR' || cat === 'U11' || cat === 'U13' || cat === 'U15' || cat === 'U10' || cat === 'U12' || cat === 'U14') {
              div = 'junior';
            } else if (type === 'MIXED' || cat === 'MIXED') {
              div = 'mixed';
            } else if (type === 'WOMEN' || type === 'DAMES') {
              div = 'women';
            } else if (type === 'MEN' || type === 'HOMMES') {
              div = 'men';
            } else if (type === 'MEN&WOMEN' || type === 'MEN&WOMEN') {
              // MEN&WOMEN → garder la valeur existante ou mettre 'men' par défaut
              div = div || 'men';
            }
          }
          return {
            ...r,
            category: normalizeJuniorCategory(r.category),
            tournament_name: normalizeTournamentDisplayName(r.tournament_name, r.club_name),
            division: div || r.division,
            // Normaliser les noms collés depuis Supabase
            player1_name: formatName(r.player1_name ?? ''),
            player2_name: formatName(r.player2_name ?? ''),
          };
        });
        setAllResults(normalized);
        setFromSupabase(true);
      } else {
        setAllResults(SEED_RESULTS);
        setFromSupabase(false);
      }
    } else {
      setAllResults(SEED_RESULTS);
      setFromSupabase(false);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Grouper par tournoi
  const groups = useMemo(() => {
    let filtered = allResults;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(r =>
        r.tournament_name.toLowerCase().includes(q) ||
        r.player1_name.toLowerCase().includes(q) ||
        r.player2_name.toLowerCase().includes(q) ||
        r.club_name?.toLowerCase().includes(q) ||
        r.team_name?.toLowerCase().includes(q)
      );
    }
    if (filterDiv !== 'all')    filtered = filtered.filter(r => r.division === filterDiv);
    if (filterCat !== 'all')    filtered = filtered.filter(r => r.category === filterCat);
    if (filterRegion !== 'all') filtered = filtered.filter(r => r.region === filterRegion);
    return groupByTournament(filtered);
  }, [allResults, search, filterDiv, filterCat, filterRegion]);

  // Statistiques globales
  const stats = useMemo(() => {
    // Compter les tournois uniques par type (on prend uniquement rank=1 pour éviter les doublons)
    const byDiv = (div: string) => allResults.filter(r => r.division === div && r.rank === 1).length;
    // Pour MEN&WOMEN, on peut avoir division='men' ET division='women' pour le même tournoi
    const totalTourns = new Set(allResults.map(r => `${r.tournament_name}__${r.tournament_date}`)).size;
    return {
      tournaments: totalTourns,
      men:    byDiv('men'),
      women:  byDiv('women'),
      mixed:  byDiv('mixed'),
      junior: byDiv('junior'),
      // total résultats (lignes)
      entries: allResults.length,
    };
  }, [allResults]);

  const cats    = useMemo(() => [...new Set(allResults.map(r => r.category))].sort(), [allResults]);
  const regions = useMemo(() => [...new Set(allResults.map(r => r.region).filter(Boolean))].sort(), [allResults]);

  const selStyle: React.CSSProperties = {
    background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '10px', padding: '9px 14px', color: 'white', fontSize: '13px',
    outline: 'none', cursor: 'pointer',
    colorScheme: 'dark',
  };

  return (
    <Layout>
      <section style={{ padding: '72px 24px 80px', minHeight: '80vh', position: 'relative', overflowY: 'hidden', overflowX: 'auto', background: 'linear-gradient(180deg, #0a0a0a 0%, #0c0c0c 100%)' }}>
        <DotWaveBackground variant="corner-tl" opacity={0.08} animate={false} />
        <div style={{ position: 'absolute', top: 64, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(74,213,105,0.15) 50%, transparent 100%)' }} />
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>

          {/* ── En-tête ── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Trophy size={28} color="#4ad569" />
                <h1 style={{ fontSize: 'clamp(24px,4vw,42px)', fontWeight: 900, color: 'white', margin: 0 }}>
                  Résultats
                </h1>
                <span style={{
                  background: fromSupabase ? 'rgba(74,213,105,0.15)' : 'rgba(245,158,11,0.15)',
                  color: fromSupabase ? '#4ad569' : '#f59e0b',
                  border: `1px solid ${fromSupabase ? 'rgba(74,213,105,0.3)' : 'rgba(245,158,11,0.3)'}`,
                  borderRadius: '20px', padding: '3px 12px', fontSize: '12px', fontWeight: 600,
                }}>
                  {fromSupabase ? '● Supabase' : '● Données locales'}
                </span>
              </div>
              <p style={{ color: '#888', fontSize: '15px', margin: 0 }}>
                Saison 2026 · Tous les tournois disputés
              </p>
            </div>
            <button
              onClick={load}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px', padding: '10px 16px', color: '#a0a0a0',
                cursor: 'pointer', fontSize: '13px',
              }}
            >
              <RefreshCw size={14} /> Actualiser
            </button>
          </div>

          {/* ── Stats chips ── */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '28px' }}>
            {[
              { label: 'Tournois',  value: stats.tournaments, color: '#4ad569',  sub: 'saison 2026' },
              { label: 'Hommes',    value: stats.men,          color: '#60a5fa',  sub: 'divisions H' },
              { label: 'Femmes',    value: stats.women,        color: '#f472b6',  sub: 'divisions D' },
              { label: 'Mixte',     value: stats.mixed,        color: '#a78bfa',  sub: 'mixed' },
              { label: 'Junior',    value: stats.junior,       color: '#4ade80',  sub: 'U11/U13/U15' },
            ].map(s => (
              <div key={s.label} style={{
                background: `${s.color}12`, border: `1px solid ${s.color}30`,
                borderRadius: '12px', padding: '10px 18px', textAlign: 'center', minWidth: '80px',
              }}>
                <div style={{ color: s.color, fontWeight: 800, fontSize: '22px', lineHeight: 1 }}>{s.value}</div>
                <div style={{ color: '#888', fontSize: '12px', marginTop: '2px', fontWeight: 600 }}>{s.label}</div>
                <div style={{ color: '#444', fontSize: '10px', marginTop: '2px' }}>{s.sub}</div>
              </div>
            ))}
            {/* Entrées totales */}
            <div style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px', padding: '10px 18px', textAlign: 'center', minWidth: '80px',
            }}>
              <div style={{ color: '#f59e0b', fontWeight: 800, fontSize: '22px', lineHeight: 1 }}>{stats.entries.toLocaleString('fr-FR')}</div>
              <div style={{ color: '#888', fontSize: '12px', marginTop: '2px', fontWeight: 600 }}>Entrées</div>
              <div style={{ color: '#444', fontSize: '10px', marginTop: '2px' }}>résultats total</div>
            </div>
          </div>

          {/* ── Erreur ── */}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {/* ── Filtres ── */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'center' }}>
            {/* Recherche */}
            <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '200px' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Nom, joueur, club..."
                style={{ ...selStyle, paddingLeft: '36px', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            {/* Division */}
            <select value={filterDiv} onChange={e => setFilterDiv(e.target.value)} style={selStyle}>
              <option value="all">Toutes divisions</option>
              <option value="men">Hommes</option>
              <option value="women">Femmes</option>
              <option value="mixed">Mixte</option>
              <option value="junior">Junior</option>
            </select>
            {/* Catégorie */}
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={selStyle}>
              <option value="all">Toutes catégories</option>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {/* Région */}
            <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={selStyle}>
              <option value="all">Toutes régions</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* ── Contenu ── */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#666' }}>
              <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
              <p style={{ margin: 0 }}>Chargement des résultats...</p>
            </div>
          ) : groups.length === 0 ? (
            <GlassCard style={{ padding: '60px', textAlign: 'center' }}>
              <Trophy size={40} color="#333" style={{ marginBottom: '12px' }} />
              <p style={{ color: '#666', margin: 0 }}>Aucun résultat trouvé</p>
            </GlassCard>
          ) : (
            <>
              <div style={{ color: '#666', fontSize: '13px', marginBottom: '16px' }}>
                {groups.length} tournoi{groups.length > 1 ? 's' : ''} · résultats du plus récent au plus ancien
              </div>
              {groups.map(g => <TournamentCard key={g.key} group={g} filterDiv={filterDiv} />)}
            </>
          )}

        </div>
      </section>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </Layout>
  );
}
