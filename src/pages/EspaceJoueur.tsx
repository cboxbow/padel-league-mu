import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  LockKeyhole,
  LogOut,
  Mail,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
} from 'lucide-react';
import { CategoryBadge, Layout, StatusBadge } from '@/components/Layout';
import { useRankings, useTournaments, type SimpleRanking, type TournamentData } from '@/hooks/useData';
import { ROUTE_PATHS } from '@/lib/index';
import { useSeo } from '@/hooks/useSeo';
import { getSupabaseClient, isSupabaseConnected, safeSupabaseQuery } from '@/lib/supabase';

type DivisionKey = 'men' | 'women' | 'junior' | 'mixed';

type RankingWithDivision = SimpleRanking & {
  division: DivisionKey;
};

type PlayerProfile = {
  key: string;
  name: string;
  rankings: RankingWithDivision[];
  bestRank: number;
  bestPoints: number;
  divisions: string[];
  played: number;
};

type PlayerAccountRow = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  license_no?: string | null;
  active?: boolean | null;
};

function errorMessage(error: unknown): string {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message ?? '');
  return String(error);
}

function isTemporaryVerificationIssue(message: string): boolean {
  return /abort|signal|timeout|failed to fetch|network/i.test(message);
}

type RegistrationDraft = {
  player: string;
  tournament: TournamentData;
  status: string;
  eligibilityDetail: string;
  nextStep: string;
  submitted?: boolean;
};

type PairEligibility = {
  label: string;
  tone: string;
  detail: string;
  allowed: boolean;
  playerRank?: number;
  partnerRank?: number;
  pairRankSum?: number;
};

const divisionLabels: Record<DivisionKey, string> = {
  men: 'Hommes',
  women: 'Dames',
  junior: 'Junior',
  mixed: 'Mixte',
};

const divisionTone: Record<DivisionKey, string> = {
  men: '#3b82f6',
  women: '#ec4899',
  junior: '#f59e0b',
  mixed: '#8b5cf6',
};

type AccessDivision = 'men' | 'women';

const individualAccessRules: Record<AccessDivision, Partial<Record<string, number>>> = {
  men: { M25: 250, M50: 125, M100: 60 },
  women: { M25: 150, M50: 75, M100: 40 },
};

const pairAccessRules: Record<AccessDivision, Partial<Record<string, number>>> = {
  men: { M25: 600, M50: 300, M100: 150, M250: 50 },
  women: { M25: 350, M50: 175, M100: 100, M250: 40 },
};

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/gi, ' ')
    .trim()
    .toUpperCase();
}

function formatNumber(value: number | undefined) {
  return Math.ceil(Number(value ?? 0)).toLocaleString('fr-FR').replace(/\u202f/g, ' ');
}

function tournamentDateValue(tournament: TournamentData) {
  const date = Date.parse(tournament.date);
  return Number.isFinite(date) ? date : 0;
}

function humanDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || 'Date a confirmer';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function tournamentDivision(tournament: TournamentData): DivisionKey | 'all' {
  const value = `${tournament.division} ${tournament.type} ${tournament.name}`.toUpperCase();
  if (value.includes('MIX')) return 'mixed';
  if (value.includes('JUNIOR') || value.includes('U11') || value.includes('U13') || value.includes('U15')) return 'junior';
  if (value.includes('WOMEN') || value.includes('DAMES') || value.includes('FEMME')) return 'women';
  if (value.includes('MEN') || value.includes('HOMMES')) return 'men';
  return 'all';
}

function isUuid(value?: string | null) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value ?? '');
}

function compactKey(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function tournamentRequestKey(tournament: TournamentData) {
  const targetDivision = tournamentDivision(tournament);
  const division = targetDivision === 'all' ? tournament.division : divisionLabels[targetDivision];
  return [
    tournament.date,
    tournament.category,
    division,
    tournament.club_name,
    tournament.name,
  ]
    .map(compactKey)
    .filter(Boolean)
    .join('|');
}

function eligibilityFor(profile: PlayerProfile | undefined, tournament: TournamentData) {
  if (!profile) return { label: 'Profil requis', tone: '#a0a0a0', detail: 'Selectionne ton profil pour evaluer les conditions d acces.' };

  const targetDivision = tournamentDivision(tournament);
  const hasTargetDivision = targetDivision === 'all' || profile.rankings.some(r => r.division === targetDivision);
  const hasMenRanking = profile.rankings.some(r => r.division === 'men');
  const hasWomenRanking = profile.rankings.some(r => r.division === 'women');
  const bestRankForDivision = profile.rankings
    .filter(r => targetDivision === 'all' || r.division === targetDivision)
    .map(r => r.rank)
    .sort((a, b) => a - b)[0];

  if (tournament.status === 'completed') {
    return { label: 'Termine', tone: '#a0a0a0', detail: 'Resultats disponibles si publies.' };
  }

  if (targetDivision === 'mixed') {
    return { label: 'Paire mixte', tone: '#8b5cf6', detail: 'Ouvert avec partenaire compatible et validation de la paire.' };
  }

  if (targetDivision === 'women' && hasMenRanking && !hasWomenRanking) {
    return { label: 'Non eligible', tone: '#ef4444', detail: 'Un joueur Hommes ne peut pas participer en division Dames.' };
  }

  if (!hasTargetDivision) {
    return { label: 'A valider', tone: '#f59e0b', detail: 'Profil classe dans une autre division, validation admin requise.' };
  }

  if ((targetDivision === 'men' || targetDivision === 'women') && ['M25', 'M50', 'M100', 'M250'].includes(tournament.category)) {
    const individualLimit = individualAccessRules[targetDivision][tournament.category];
    const pairLimit = pairAccessRules[targetDivision][tournament.category];

    if (individualLimit && bestRankForDivision && bestRankForDivision < individualLimit) {
      return {
        label: 'Hors seuil',
        tone: '#ef4444',
        detail: `Cette categorie est reservee aux joueurs classes #${individualLimit} ou au-dela. Rang actuel: #${bestRankForDivision}.`,
      };
    }

    if (individualLimit && bestRankForDivision && bestRankForDivision >= individualLimit) {
      return {
        label: 'Indiv. OK',
        tone: '#4ad569',
        detail: `Rang individuel #${bestRankForDivision} valide. La paire devra respecter le cumul minimum #${pairLimit}.`,
      };
    }

    if (pairLimit && !individualLimit) {
      const partnerNeeded = bestRankForDivision ? Math.max(1, pairLimit - bestRankForDivision) : pairLimit;
      return {
        label: 'Paire requise',
        tone: '#f59e0b',
        detail: bestRankForDivision
          ? `Cumul paire minimum #${pairLimit}. Avec ton rang #${bestRankForDivision}, partenaire requis #${partnerNeeded} ou au-dela.`
          : `Cumul paire minimum #${pairLimit}. Choisis un joueur pour calculer le partenaire requis.`,
      };
    }

    return {
      label: 'A verifier',
      tone: '#ef4444',
      detail: individualLimit
        ? `Rang requis: Top ${individualLimit} individuel. Rang actuel #${bestRankForDivision ?? '-'}.`
        : `Controle paire requis: cumul minimum Top ${pairLimit}.`,
    };
  }

  if (['M500', 'M1000'].includes(tournament.category)) {
    return {
      label: 'Open',
      tone: '#4ad569',
      detail: 'Tournoi ouvert aux licencies. Acceptation selon places disponibles et ordre de classement.',
    };
  }

  return { label: 'Eligible', tone: '#4ad569', detail: 'Inscription possible selon places disponibles.' };
}

function canPrepareRegistration(label: string) {
  return !['Non eligible', 'Hors seuil', 'Termine', 'Profil requis'].includes(label);
}

function rankingForDivision(profile: PlayerProfile | undefined, division: DivisionKey | 'all') {
  if (!profile) return undefined;
  const rows = profile.rankings.filter(ranking => division === 'all' || ranking.division === division);
  return rows.slice().sort((a, b) => a.rank - b.rank || b.points - a.points)[0];
}

function pairKeyForPlayers(playerA: string, playerB: string) {
  return [normalizeName(playerA), normalizeName(playerB)].sort().join('|');
}

function pairEligibilityFor(
  profile: PlayerProfile | undefined,
  partner: PlayerProfile | undefined,
  tournament: TournamentData | undefined,
): PairEligibility {
  if (!profile || !tournament) {
    return { label: 'Profil requis', tone: '#a0a0a0', detail: 'Selectionne ton profil avant de verifier la paire.', allowed: false };
  }
  if (!partner) {
    return { label: 'Partenaire requis', tone: '#f59e0b', detail: 'Choisis ton partenaire pour confirmer l eligibilite de la paire.', allowed: false };
  }

  const targetDivision = tournamentDivision(tournament);
  const category = tournament.category;

  if (targetDivision === 'women' && profile.rankings.some(r => r.division === 'men') && !profile.rankings.some(r => r.division === 'women')) {
    return { label: 'Non eligible', tone: '#ef4444', detail: 'Un joueur Hommes ne peut pas entrer en division Dames.', allowed: false };
  }

  if (targetDivision === 'mixed') {
    return {
      label: 'Paire mixte a valider',
      tone: '#8b5cf6',
      detail: 'Demande possible. L admin validera la compatibilite finale de la paire mixte.',
      allowed: true,
    };
  }

  if (targetDivision === 'junior') {
    return {
      label: 'Junior a valider',
      tone: '#f59e0b',
      detail: 'Demande possible. L admin confirmera la categorie junior et les licences.',
      allowed: true,
    };
  }

  if (targetDivision !== 'men' && targetDivision !== 'women') {
    return {
      label: 'Demande possible',
      tone: '#4ad569',
      detail: 'Tournoi ouvert. L admin confirmera les informations de la paire.',
      allowed: true,
    };
  }

  if (category === 'M500' || category === 'M1000') {
    return {
      label: 'Open',
      tone: '#4ad569',
      detail: 'Tournoi open: demande possible pour les licencies, sous reserve des places disponibles.',
      allowed: true,
    };
  }

  const pairLimit = pairAccessRules[targetDivision][category];
  const playerRanking = rankingForDivision(profile, targetDivision);
  const partnerRanking = rankingForDivision(partner, targetDivision);
  const playerRank = playerRanking?.rank;
  const partnerRank = partnerRanking?.rank;

  if (!pairLimit) {
    return {
      label: 'A valider',
      tone: '#f59e0b',
      detail: 'Categorie non standard: l admin verifiera la demande.',
      allowed: true,
      playerRank,
      partnerRank,
    };
  }

  if (!playerRank || !partnerRank) {
    return {
      label: 'A valider',
      tone: '#f59e0b',
      detail: `Cumul minimum requis: ${pairLimit}. Rang manquant sur un des deux joueurs, validation admin necessaire.`,
      allowed: true,
      playerRank,
      partnerRank,
    };
  }

  const pairRankSum = playerRank + partnerRank;
  const allowed = pairRankSum >= pairLimit;
  return {
    label: allowed ? 'Paire eligible' : 'Paire hors seuil',
    tone: allowed ? '#4ad569' : '#ef4444',
    detail: allowed
      ? `Cumul paire ${pairRankSum} valide pour le minimum ${pairLimit}.`
      : `Cumul paire ${pairRankSum}. Minimum requis: ${pairLimit}.`,
    allowed,
    playerRank,
    partnerRank,
    pairRankSum,
  };
}

export default function EspaceJoueur() {
  useSeo({
    title: 'Espace Joueur MPL - Profil, Classements et Inscriptions',
    description: 'Espace joueur Mauritius Padel League: datasheet personnelle, classement Top 8, tournois eligibles et preparation des inscriptions.',
    path: ROUTE_PATHS.PLAYER_SPACE,
  });

  const men = useRankings('men');
  const women = useRankings('women');
  const junior = useRankings('junior');
  const mixed = useRankings('mixed');
  const { tournaments, loading: tournamentsLoading, source: tournamentSource } = useTournaments();

  const [query, setQuery] = useState('');
  const [divisionFilter, setDivisionFilter] = useState<DivisionKey | 'all'>('all');
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [accountEmail, setAccountEmail] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authLicense, setAuthLicense] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [linkedPlayer, setLinkedPlayer] = useState<PlayerAccountRow | null>(null);
  const [linkMessage, setLinkMessage] = useState('');
  const [registrationDraft, setRegistrationDraft] = useState<RegistrationDraft | null>(null);
  const [partnerQuery, setPartnerQuery] = useState('');
  const [selectedPartnerKey, setSelectedPartnerKey] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const loadingRankings = men.loading || women.loading || junior.loading || mixed.loading;
  const liveSource = [men.source, women.source, junior.source, mixed.source, tournamentSource].includes('supabase')
    ? 'supabase'
    : [men.source, women.source, junior.source, mixed.source, tournamentSource].includes('csv')
      ? 'csv'
      : 'local';

  const allRankings = useMemo<RankingWithDivision[]>(() => {
    const pack = (rows: SimpleRanking[], division: DivisionKey) => rows.map(row => ({ ...row, division }));
    return [
      ...pack(men.rankings, 'men'),
      ...pack(women.rankings, 'women'),
      ...pack(junior.rankings, 'junior'),
      ...pack(mixed.rankings, 'mixed'),
    ].filter(row => row.name);
  }, [men.rankings, women.rankings, junior.rankings, mixed.rankings]);

  const profiles = useMemo<PlayerProfile[]>(() => {
    const grouped = new Map<string, PlayerProfile>();
    for (const ranking of allRankings) {
      const key = normalizeName(ranking.name);
      if (!key) continue;
      const current = grouped.get(key) ?? {
        key,
        name: ranking.name,
        rankings: [],
        bestRank: Number.MAX_SAFE_INTEGER,
        bestPoints: 0,
        divisions: [],
        played: 0,
      };
      current.rankings.push(ranking);
      current.bestRank = Math.min(current.bestRank, ranking.rank || Number.MAX_SAFE_INTEGER);
      current.bestPoints = Math.max(current.bestPoints, Number(ranking.points ?? 0));
      current.played = Math.max(current.played, Number(ranking.tournaments_played ?? 0));
      current.divisions = Array.from(new Set(current.rankings.map(r => divisionLabels[r.division])));
      grouped.set(key, current);
    }

    return Array.from(grouped.values())
      .sort((a, b) => a.bestRank - b.bestRank || b.bestPoints - a.bestPoints || a.name.localeCompare(b.name));
  }, [allRankings]);

  const filteredProfiles = useMemo(() => {
    const q = normalizeName(query);
    return profiles
      .filter(profile => divisionFilter === 'all' || profile.rankings.some(r => r.division === divisionFilter))
      .filter(profile => !q || profile.key.includes(q))
      .slice(0, 8);
  }, [profiles, query, divisionFilter]);

  const selectedProfile = useMemo(() => {
    if (selectedKey) return profiles.find(profile => profile.key === selectedKey);
    return filteredProfiles[0] ?? profiles[0];
  }, [profiles, filteredProfiles, selectedKey]);

  const upcomingTournaments = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return tournaments
      .filter(t => tournamentDateValue(t) >= today.getTime())
      .sort((a, b) => tournamentDateValue(a) - tournamentDateValue(b))
      .slice(0, 6);
  }, [tournaments]);

  const selectedBestRankings = selectedProfile?.rankings
    .slice()
    .sort((a, b) => a.rank - b.rank || b.points - a.points) ?? [];

  const partnerCandidates = useMemo(() => {
    const q = normalizeName(partnerQuery);
    if (!selectedProfile) return [];
    return profiles
      .filter(profile => profile.key !== selectedProfile.key)
      .filter(profile => !q || profile.key.includes(q))
      .slice(0, 7);
  }, [profiles, selectedProfile, partnerQuery]);

  const selectedPartner = useMemo(
    () => profiles.find(profile => profile.key === selectedPartnerKey),
    [profiles, selectedPartnerKey],
  );

  const draftPairCheck = useMemo(
    () => pairEligibilityFor(selectedProfile, selectedPartner, registrationDraft?.tournament),
    [selectedProfile, selectedPartner, registrationDraft],
  );

  const supabaseReady = isSupabaseConnected();

  useEffect(() => {
    const storedMessage = window.localStorage.getItem('mpl_player_auth_message');
    const storedEmail = window.localStorage.getItem('mpl_player_login_email');
    if (storedMessage) {
      setAuthMessage(storedMessage);
      window.localStorage.removeItem('mpl_player_auth_message');
    }
    if (storedEmail) {
      setAuthEmail(storedEmail);
      window.localStorage.removeItem('mpl_player_login_email');
    }
  }, []);

  async function verifyPlayerAccess() {
    const email = authEmail.trim();
    const license = authLicense.trim();
    if (!email) {
      setAuthMessage('Ajoute ton email joueur.');
      return;
    }
    if (!license) {
      setAuthMessage('Ajoute ton numero de licence MPL.');
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setAuthMessage('Verification joueur indisponible pour le moment.');
      return;
    }

    setAuthLoading(true);
    setAuthMessage('');

    const verifyOnce = () => safeSupabaseQuery<unknown>(
      () => client.rpc('verify_player_profile', {
        p_email: email,
        p_license: license,
      }),
      7000,
    );

    let result = await verifyOnce();
    let verificationError = errorMessage(result.error);

    if (!result.data && (result.timedOut || isTemporaryVerificationIssue(verificationError))) {
      result = await verifyOnce();
      verificationError = errorMessage(result.error);
    }

    setAuthLoading(false);
    if (verificationError) {
      setAuthMessage(
        isTemporaryVerificationIssue(verificationError)
          ? 'Verification temporairement indisponible. Reessaie dans quelques secondes.'
          : `Verification impossible: ${verificationError}`,
      );
      return;
    }

    const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
    if (!rows.length) {
      setAuthMessage('Email ou numero de licence incorrect.');
      return;
    }

    const player = rows[0] as PlayerAccountRow;
    if (player.active === false) {
      setAuthMessage('Profil trouve, mais la licence est inactive. Contacte l admin MPL.');
      return;
    }

    const verifiedEmail = String(player.email ?? email).trim().toLowerCase();
    const fullName = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
    const playerKey = normalizeName(fullName);
    const matchingProfile = profiles.find(profile => profile.key === playerKey);

    setAccountEmail(verifiedEmail);
    setLinkedPlayer(player);
    setLinkMessage(matchingProfile ? 'Profil joueur verifie par email et licence.' : 'Compte trouve, classement a associer manuellement.');
    if (matchingProfile) setSelectedKey(matchingProfile.key);
    setAuthMessage('Profil MPL connecte.');
  }

  async function signOutPlayer() {
    const client = getSupabaseClient();
    if (client) await client.auth.signOut();
    window.localStorage.removeItem('mpl_player_login_pending');
    window.localStorage.removeItem('mpl_player_login_email');
    setAccountEmail('');
    setLinkedPlayer(null);
    setLinkMessage('');
    setAuthMessage('Session joueur fermee.');
  }

  function prepareRegistration(tournament: TournamentData, label: string) {
    if (!accountEmail) {
      setAuthMessage('Connecte ton email joueur avant de preparer une inscription.');
      return;
    }
    if (!selectedProfile) {
      setAuthMessage('Selectionne ton profil joueur avant de preparer une inscription.');
      return;
    }
    if (!canPrepareRegistration(label)) {
      setAuthMessage('Ce tournoi n est pas disponible pour ce profil.');
      return;
    }

    const eligibility = eligibilityFor(selectedProfile, tournament);
    const partnerNote = 'Prochaine etape: choisis ton partenaire pour valider la paire.';
    setSelectedPartnerKey('');
    setPartnerQuery('');
    setRegistrationDraft({
      player: selectedProfile.name,
      tournament,
      status: label,
      eligibilityDetail: eligibility.detail,
      nextStep: partnerNote,
    });
    setAuthMessage(`Pre-inscription preparee pour ${selectedProfile.name} - ${tournament.name}.${partnerNote}`);
  }

  async function submitRegistrationRequest() {
    if (!registrationDraft || !selectedProfile || !selectedPartner) {
      setAuthMessage('Choisis un tournoi et un partenaire avant d envoyer la demande.');
      return;
    }
    if (!draftPairCheck.allowed) {
      setAuthMessage(draftPairCheck.detail);
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setAuthMessage('Envoi impossible: Supabase indisponible.');
      return;
    }

    const targetDivision = tournamentDivision(registrationDraft.tournament);
    const requestDivision = targetDivision === 'all'
      ? registrationDraft.tournament.division
      : divisionLabels[targetDivision];
    const playerRanking = rankingForDivision(selectedProfile, targetDivision);
    const partnerRanking = rankingForDivision(selectedPartner, targetDivision);

    setSubmittingRequest(true);
    const { error } = await client.from('player_registration_requests').insert({
      tournament_id: isUuid(registrationDraft.tournament.id) ? registrationDraft.tournament.id : null,
      tournament_key: tournamentRequestKey(registrationDraft.tournament),
      tournament_name: registrationDraft.tournament.name,
      tournament_date: registrationDraft.tournament.date || null,
      category: registrationDraft.tournament.category,
      division: requestDivision,
      region: registrationDraft.tournament.region,
      club_name: registrationDraft.tournament.club_name,
      player1_name: selectedProfile.name,
      player1_key: selectedProfile.key,
      player1_email: accountEmail,
      player1_license: linkedPlayer?.license_no ?? null,
      player1_rank: playerRanking?.rank ?? null,
      player1_points: playerRanking?.points ?? null,
      player2_name: selectedPartner.name,
      player2_key: selectedPartner.key,
      player2_rank: partnerRanking?.rank ?? null,
      player2_points: partnerRanking?.points ?? null,
      pair_rank_sum: draftPairCheck.pairRankSum ?? null,
      eligibility_label: draftPairCheck.label,
      eligibility_detail: draftPairCheck.detail,
      pair_key: pairKeyForPlayers(selectedProfile.name, selectedPartner.name),
      status: 'pending',
    });
    setSubmittingRequest(false);

    if (error) {
      const message = error.code === '23505'
        ? 'Cette paire a deja une demande pour ce tournoi.'
        : `Envoi impossible: ${error.message}`;
      setAuthMessage(message);
      return;
    }

    setRegistrationDraft(prev => prev ? { ...prev, submitted: true, status: 'Envoyee a l admin', nextStep: 'Demande recue. L admin peut maintenant la valider dans Inscriptions.' } : prev);
    setAuthMessage('Demande envoyee a l admin MPL.');
  }

  return (
    <Layout>
      <section className="player-space">
        <div className="player-hero">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={14} /> Espace Joueur MPL</div>
            <h1>Ton espace MPL</h1>
            <p>Profil joueur, Ranking Top 8, historique et eligibilite tournoi dans un seul espace.</p>
            <div className="hero-flow">
              <span><i /> Profil</span>
              <span><i /> Top 8</span>
              <span><i /> Eligibilite</span>
              <span><i /> Inscription</span>
            </div>
          </div>
          <div className="hero-metrics">
            <div>
              <span className={`source-pill source-${liveSource}`}>
                {liveSource === 'supabase' ? 'Donnees live' : liveSource === 'csv' ? 'Donnees CSV' : 'Mode local'}
              </span>
              <strong>{formatNumber(profiles.length)}</strong>
              <small>profils detectes</small>
            </div>
            <div>
              <span className="source-pill source-supabase">Top 8</span>
              <strong>12M</strong>
              <small>regle active</small>
            </div>
          </div>
        </div>

        <div className="player-panel search-panel">
          <div className="search-box">
            <Search size={18} />
            <input
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setSelectedKey('');
              }}
              placeholder="Rechercher ton nom..."
            />
          </div>
          <div className="division-tabs">
            {(['all', 'men', 'women', 'junior', 'mixed'] as const).map(key => (
              <button
                key={key}
                type="button"
                className={divisionFilter === key ? 'active' : ''}
                onClick={() => {
                  setDivisionFilter(key);
                  setSelectedKey('');
                }}
              >
                {key === 'all' ? 'Tous' : divisionLabels[key]}
              </button>
            ))}
          </div>
        </div>

        <div className="player-panel account-panel">
          <div className="account-copy">
            <div className="section-title">
              <LockKeyhole size={18} />
              <span>Acces joueur</span>
            </div>
            <h2>{accountEmail ? 'Profil MPL connecte' : 'Connecte ton profil MPL'}</h2>
            <p>
              Verifie ton email et ta licence pour preparer une demande d inscription avec les regles MPL.
            </p>
            <div className="account-steps">
              <span className={accountEmail ? 'done' : ''}>Email controle</span>
              <span className={linkedPlayer?.license_no ? 'done' : ''}>Licence verifiee</span>
              <span className={linkedPlayer ? 'done' : ''}>Profil associe</span>
              <span className={accountEmail ? 'current' : ''}>Inscription guidee</span>
            </div>
          </div>

          <div className="account-box">
            {accountEmail ? (
              <>
                <span className="account-status">Connecte</span>
                <strong>{accountEmail}</strong>
                <small>
                  Profil actif: {selectedProfile?.name ?? 'selection a faire'}
                  {linkedPlayer?.license_no ? ` - licence ${linkedPlayer.license_no}` : ''}
                </small>
                {linkMessage && <small>{linkMessage}</small>}
                <button type="button" className="account-button secondary" onClick={signOutPlayer}>
                  <LogOut size={16} /> Se deconnecter
                </button>
              </>
            ) : (
              <>
                <span className={`account-status ${supabaseReady ? '' : 'offline'}`}>
                  {supabaseReady ? 'Acces securise' : 'Connexion indisponible'}
                </span>
                <label htmlFor="player-email">Email joueur</label>
                <div className="email-input">
                  <Mail size={17} />
                  <input
                    id="player-email"
                    value={authEmail}
                    onChange={event => setAuthEmail(event.target.value)}
                    placeholder="ton.email@exemple.com"
                    type="email"
                  />
                </div>
                <label htmlFor="player-license">Numero de licence</label>
                <div className="email-input">
                  <ShieldCheck size={17} />
                  <input
                    id="player-license"
                    value={authLicense}
                    onChange={event => setAuthLicense(event.target.value)}
                    placeholder="Ex: 1234"
                    inputMode="numeric"
                  />
                </div>
                <button
                  type="button"
                  className="account-button"
                  onClick={verifyPlayerAccess}
                  disabled={authLoading || !supabaseReady}
                >
                  {authLoading ? 'Verification...' : 'Acceder a mon profil'}
                </button>
              </>
            )}
            {authMessage && <p className="auth-message">{authMessage}</p>}
          </div>
        </div>

        {registrationDraft && (
          <div className="player-panel draft-panel">
            <div className="draft-head">
              <div>
                <span className={`source-pill ${registrationDraft.submitted ? 'source-supabase' : 'source-csv'}`}>
                  {registrationDraft.submitted ? 'Demande envoyee' : 'Demande en preparation'}
                </span>
                <h3>{registrationDraft.tournament.name}</h3>
                <p>{registrationDraft.player} - {registrationDraft.status}</p>
                <small>{registrationDraft.eligibilityDetail}</small>
              </div>
              <button type="button" className="registration-button secondary" onClick={() => setRegistrationDraft(null)}>
                Modifier le choix
              </button>
            </div>
            {registrationDraft.submitted ? (
              <div className="pair-check success">
                <CheckCircle2 size={16} />
                <span>{registrationDraft.nextStep}</span>
              </div>
            ) : (
              <div className="draft-workflow">
                <div className="partner-picker">
                  <label>Partenaire</label>
                  <div className="search-box compact">
                    <Search size={16} />
                    <input
                      value={partnerQuery}
                      onChange={event => {
                        setPartnerQuery(event.target.value);
                        setSelectedPartnerKey('');
                      }}
                      placeholder="Rechercher le partenaire..."
                    />
                  </div>
                  <div className="partner-results">
                    {partnerCandidates.map(partner => (
                      <button
                        key={partner.key}
                        type="button"
                        className={selectedPartnerKey === partner.key ? 'active' : ''}
                        onClick={() => {
                          setSelectedPartnerKey(partner.key);
                          setPartnerQuery(partner.name);
                        }}
                      >
                        <strong>{partner.name}</strong>
                        <span>#{partner.bestRank} - {formatNumber(partner.bestPoints)} pts</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pair-submit">
                  <div className="pair-check" style={{ borderColor: `${draftPairCheck.tone}55`, color: draftPairCheck.tone }}>
                    <CheckCircle2 size={16} />
                    <div>
                      <strong>{draftPairCheck.label}</strong>
                      <span>{draftPairCheck.detail}</span>
                    </div>
                  </div>
                  {selectedPartner && (
                    <div className="pair-summary">
                      <span>{selectedProfile?.name}</span>
                      <b>+</b>
                      <span>{selectedPartner.name}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    className="registration-button send"
                    disabled={!draftPairCheck.allowed || submittingRequest}
                    onClick={submitRegistrationRequest}
                  >
                    <Send size={15} />
                    {submittingRequest ? 'Envoi...' : 'Envoyer a l admin'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="player-grid player-grid-summary">
          <div className="player-panel player-summary-card">
            <div className="section-title">
              <UserRound size={18} />
              <span>Parcours MPL</span>
            </div>
            {loadingRankings ? (
              <p className="muted">Chargement du profil...</p>
            ) : selectedProfile ? (
              <>
                <div className="summary-player">
                  <span className="summary-rank">#{selectedProfile.bestRank}</span>
                  <div>
                    <strong>{selectedProfile.name}</strong>
                    <small>{selectedProfile.divisions.join(' / ')}</small>
                  </div>
                </div>
                <div className="summary-status">
                  <span><i /> {accountEmail ? 'Compte connecte' : 'Compte a connecter'}</span>
                  <span><i /> {linkedPlayer ? 'Licence verifiee' : 'Licence a verifier'}</span>
                  <span><i /> {selectedProfile.played || 0} tournois joues</span>
                </div>
                <div className="summary-divisions">
                  {selectedProfile.rankings.map(ranking => (
                    <span key={`${ranking.division}-${ranking.rank}`} style={{ borderColor: `${divisionTone[ranking.division]}55`, color: divisionTone[ranking.division] }}>
                      {divisionLabels[ranking.division]} #{ranking.rank}
                    </span>
                  ))}
                </div>
                <a className="summary-action" href="#tournois-eligibles">
                  Voir mes tournois compatibles <ArrowRight size={15} />
                </a>
                <p className="summary-help">
                  Pour changer de profil, utilise la recherche en haut de page.
                </p>
              </>
            ) : (
              <p className="muted">Recherche ton nom pour charger ton parcours MPL.</p>
            )}
          </div>

          <div className="player-panel profile-card">
            {selectedProfile ? (
              <>
                <div className="profile-head">
                  <div>
                    <span className="eyebrow compact">Datasheet joueur</span>
                    <h2>{selectedProfile.name}</h2>
                    <p>{selectedProfile.divisions.join(' / ')}</p>
                  </div>
                  <Link className="outline-link" to={ROUTE_PATHS.RANKINGS}>
                    Voir classement <ArrowRight size={15} />
                  </Link>
                </div>

                <div className="stat-grid">
                  <div><b>#{selectedProfile.bestRank}</b><span>Meilleur rang</span></div>
                  <div><b>{formatNumber(selectedProfile.bestPoints)}</b><span>Points Top 8</span></div>
                  <div><b>{selectedProfile.rankings.length}</b><span>Divisions actives</span></div>
                  <div><b>{selectedProfile.played || '-'}</b><span>Tournois joues</span></div>
                </div>

                <div className="ranking-strip">
                  {selectedBestRankings.map(ranking => (
                    <div key={`${ranking.division}-${ranking.rank}-${ranking.name}`} style={{ borderColor: `${divisionTone[ranking.division]}55` }}>
                      <span style={{ color: divisionTone[ranking.division] }}>{divisionLabels[ranking.division]}</span>
                      <strong>#{ranking.rank}</strong>
                      <b>{formatNumber(ranking.points)} pts</b>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted">Selectionne un joueur pour afficher son profil.</p>
            )}
          </div>
        </div>

        <div id="tournois-eligibles" className="player-panel registration-panel">
          <div className="section-title split">
            <span><CalendarCheck size={18} /> Tournois a venir et eligibilite</span>
            <small>{tournamentsLoading ? 'Chargement...' : `${upcomingTournaments.length} suggestions`}</small>
          </div>
          <div className="registration-intro">
            <span><i /> Les opens restent ouverts aux licencies</span>
            <span><i /> Les categories M25/M50/M100/M250 appliquent les seuils MPL</span>
            <span><i /> La paire sera controlee a l etape suivante</span>
          </div>
          <div className="tournament-grid">
            {upcomingTournaments.map(tournament => {
              const eligibility = eligibilityFor(selectedProfile, tournament);
              return (
                <article key={tournament.id} className="tournament-card">
                  <div className="tournament-top">
                    <CategoryBadge category={tournament.category} />
                    <StatusBadge status={tournament.status} />
                  </div>
                  <h3>{tournament.name}</h3>
                  <p>{humanDate(tournament.date)} - {tournament.region} - {tournament.club_name}</p>
                  <div className="eligibility" style={{ borderColor: `${eligibility.tone}55`, color: eligibility.tone }}>
                    <CheckCircle2 size={15} />
                    <strong>{eligibility.label}</strong>
                  </div>
                  <small>{eligibility.detail}</small>
                  <button
                    type="button"
                    className="registration-button"
                    disabled={!accountEmail || !canPrepareRegistration(eligibility.label)}
                    onClick={() => prepareRegistration(tournament, eligibility.label)}
                  >
                    {!accountEmail
                      ? 'Connexion requise'
                      : canPrepareRegistration(eligibility.label)
                        ? 'Preparer inscription'
                        : 'Non disponible'}
                  </button>
                </article>
              );
            })}
          </div>
        </div>

        <div className="roadmap-grid">
          <div className="roadmap-card ready">
            <ShieldCheck size={20} />
            <strong>Phase 1 active</strong>
            <span>Profil joueur public, recherche et lecture des donnees live.</span>
          </div>
          <div className="roadmap-card">
            <LockKeyhole size={20} />
            <strong>Phase 2</strong>
            <span>Compte joueur securise avec email, licence et verification du profil.</span>
          </div>
          <div className="roadmap-card">
            <Trophy size={20} />
            <strong>Phase 3</strong>
            <span>Inscription tournoi avec regles automatiques selon classement, division et places.</span>
          </div>
        </div>
      </section>

      <style>{`
        .player-space {
          max-width: 1280px;
          margin: 0 auto;
          padding: 54px 24px 76px;
          position: relative;
        }
        .player-space::before {
          content: '';
          position: absolute;
          top: 26px;
          right: 6px;
          width: 300px;
          height: 220px;
          pointer-events: none;
          opacity: 0.34;
          background-image: radial-gradient(circle, rgba(74,213,105,0.35) 0 4px, transparent 5px);
          background-size: 28px 28px;
          mask-image: linear-gradient(90deg, transparent, black 30%, black 70%, transparent);
        }
        .player-hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(300px, 420px);
          gap: 24px;
          align-items: center;
          margin-bottom: 22px;
          position: relative;
          z-index: 1;
        }
        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #4ad569;
          border: 1px solid rgba(74,213,105,0.28);
          background: rgba(74,213,105,0.1);
          border-radius: 999px;
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .eyebrow.compact {
          padding: 0;
          border: 0;
          background: transparent;
        }
        .player-hero h1 {
          margin: 14px 0 8px;
          font-size: clamp(46px, 6vw, 72px);
          line-height: 0.96;
          letter-spacing: 0;
        }
        .player-hero p {
          max-width: 620px;
          color: #a0a0a0;
          font-size: 17px;
          line-height: 1.48;
          margin: 0;
        }
        .hero-flow {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 18px;
        }
        .hero-flow span,
        .registration-intro span {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: rgba(255,255,255,0.72);
          font-size: 13px;
          font-weight: 800;
        }
        .hero-flow i,
        .registration-intro i {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #4ad569;
          box-shadow: 0 0 18px rgba(74,213,105,0.8);
        }
        .hero-metrics,
        .player-panel,
        .roadmap-card {
          background: linear-gradient(180deg, rgba(20,20,20,0.92), rgba(13,13,13,0.92));
          border: 1px solid rgba(74,213,105,0.18);
          border-radius: 16px;
          box-shadow: 0 22px 60px rgba(0,0,0,0.24);
        }
        .hero-metrics {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          padding: 12px;
        }
        .hero-metrics div {
          min-height: 118px;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          background:
            radial-gradient(circle at 100% 0%, rgba(74,213,105,0.12), transparent 38%),
            rgba(255,255,255,0.025);
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 8px;
        }
        .hero-metrics strong {
          color: #3b82f6;
          font-size: 38px;
          line-height: 1;
        }
        .hero-metrics small,
        .muted,
        .tournament-card p,
        .tournament-card small,
        .profile-head p,
        .roadmap-card span {
          color: #8b8b8b;
        }
        .source-pill {
          width: fit-content;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 12px;
          font-weight: 800;
        }
        .source-supabase { color: #4ad569; background: rgba(74,213,105,0.12); }
        .source-csv { color: #f59e0b; background: rgba(245,158,11,0.12); }
        .source-local { color: #ef4444; background: rgba(239,68,68,0.12); }
        .player-panel { padding: 18px; }
        .account-panel {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: 20px;
          align-items: stretch;
          margin-bottom: 20px;
          border-color: rgba(59,130,246,0.28);
        }
        .account-copy h2 {
          margin: 8px 0 8px;
          font-size: 28px;
          line-height: 1.05;
        }
        .account-copy p {
          margin: 0;
          color: #a0a0a0;
          line-height: 1.55;
          max-width: 720px;
        }
        .account-steps {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 16px;
        }
        .account-steps span {
          border: 1px solid rgba(255,255,255,0.1);
          color: #8b8b8b;
          background: rgba(255,255,255,0.04);
          border-radius: 999px;
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 800;
        }
        .account-steps span.done {
          color: #4ad569;
          border-color: rgba(74,213,105,0.36);
          background: rgba(74,213,105,0.12);
        }
        .account-steps span.current {
          color: #f59e0b;
          border-color: rgba(245,158,11,0.34);
          background: rgba(245,158,11,0.1);
        }
        .account-box {
          display: flex;
          flex-direction: column;
          gap: 10px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.035);
          border-radius: 14px;
          padding: 16px;
        }
        .account-box label {
          color: #a0a0a0;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .account-box strong {
          color: white;
          overflow-wrap: anywhere;
        }
        .account-box small {
          color: #8b8b8b;
          line-height: 1.45;
        }
        .account-status {
          width: fit-content;
          color: #4ad569;
          background: rgba(74,213,105,0.12);
          border: 1px solid rgba(74,213,105,0.3);
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 900;
        }
        .account-status.offline {
          color: #ef4444;
          border-color: rgba(239,68,68,0.36);
          background: rgba(239,68,68,0.12);
        }
        .email-input {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 46px;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 0 12px;
          background: rgba(0,0,0,0.22);
        }
        .email-input input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          color: white;
          font: inherit;
        }
        .account-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 44px;
          border: 0;
          border-radius: 12px;
          background: #4ad569;
          color: #061008;
          font-weight: 900;
          cursor: pointer;
        }
        .account-button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .account-button.secondary {
          background: rgba(255,255,255,0.06);
          color: white;
          border: 1px solid rgba(255,255,255,0.12);
        }
        .draft-panel {
          display: flex;
          flex-direction: column;
          gap: 18px;
          margin-bottom: 20px;
          border-color: rgba(245,158,11,0.34);
          background:
            radial-gradient(circle at 100% 0%, rgba(245,158,11,0.14), transparent 38%),
            linear-gradient(180deg, rgba(20,20,20,0.94), rgba(13,13,13,0.94));
        }
        .draft-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }
        .draft-panel h3 {
          margin: 10px 0 6px;
          font-size: 22px;
          line-height: 1.15;
        }
        .draft-panel p {
          margin: 0;
          color: #a0a0a0;
        }
        .draft-panel small {
          display: block;
          margin-bottom: 12px;
          color: #c8c8c8;
          line-height: 1.5;
        }
        .draft-workflow {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(280px, 420px);
          gap: 16px;
        }
        .partner-picker label {
          display: block;
          margin-bottom: 8px;
          color: #a0a0a0;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .search-box.compact {
          min-height: 44px;
          padding: 0 12px;
        }
        .partner-results {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 10px;
        }
        .partner-results button {
          min-height: 58px;
          text-align: left;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.035);
          color: white;
          padding: 10px 12px;
          cursor: pointer;
        }
        .partner-results button.active {
          border-color: rgba(74,213,105,0.65);
          background: rgba(74,213,105,0.12);
        }
        .partner-results strong,
        .partner-results span {
          display: block;
        }
        .partner-results span {
          margin-top: 4px;
          color: #8b8b8b;
          font-size: 12px;
        }
        .pair-submit {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .pair-check {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          border: 1px solid;
          border-radius: 14px;
          padding: 12px;
          background: rgba(255,255,255,0.035);
        }
        .pair-check.success {
          color: #4ad569;
          border-color: rgba(74,213,105,0.35);
          background: rgba(74,213,105,0.1);
        }
        .pair-check strong,
        .pair-check span {
          display: block;
        }
        .pair-check span {
          margin-top: 3px;
          color: #a0a0a0;
          line-height: 1.45;
        }
        .pair-summary {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          gap: 8px;
          align-items: center;
          color: white;
          font-weight: 900;
        }
        .pair-summary span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.1);
          padding: 8px 10px;
          background: rgba(255,255,255,0.04);
        }
        .registration-button.send {
          gap: 8px;
        }
        .registration-button.secondary {
          background: rgba(255,255,255,0.06);
          color: white;
          border-color: rgba(255,255,255,0.12);
        }
        .auth-message {
          margin: 0;
          color: #f59e0b;
          font-size: 13px;
          line-height: 1.45;
        }
        .search-panel {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          margin-bottom: 18px;
          padding: 14px;
        }
        .search-box {
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 52px;
          padding: 0 16px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
        }
        .search-box input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          color: white;
          font: inherit;
        }
        .division-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding: 4px;
          border-radius: 14px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .division-tabs button,
        .outline-link {
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.76);
          border-radius: 10px;
          padding: 11px 14px;
          font-weight: 800;
          cursor: pointer;
          text-decoration: none;
        }
        .division-tabs button.active,
        .outline-link {
          border-color: rgba(74,213,105,0.45);
          background: rgba(74,213,105,0.12);
          color: #4ad569;
        }
        .player-grid {
          display: grid;
          grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
          gap: 20px;
          margin-bottom: 20px;
        }
        .player-grid-summary {
          align-items: stretch;
        }
        .section-title {
          display: flex;
          align-items: center;
          gap: 9px;
          color: white;
          font-weight: 900;
          margin-bottom: 16px;
        }
        .section-title.split {
          justify-content: space-between;
        }
        .section-title.split span {
          display: inline-flex;
          align-items: center;
          gap: 9px;
        }
        .player-summary-card {
          display: flex;
          flex-direction: column;
          gap: 16px;
          border-color: rgba(245,158,11,0.26);
          background:
            radial-gradient(circle at 0% 0%, rgba(245,158,11,0.12), transparent 34%),
            linear-gradient(180deg, rgba(20,20,20,0.92), rgba(13,13,13,0.92));
        }
        .summary-player {
          display: grid;
          grid-template-columns: 58px minmax(0, 1fr);
          gap: 14px;
          align-items: center;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          background: rgba(255,255,255,0.035);
          padding: 14px;
        }
        .summary-rank {
          display: grid;
          place-items: center;
          width: 48px;
          height: 48px;
          border-radius: 16px;
          color: #f59e0b;
          background: rgba(245,158,11,0.12);
          border: 1px solid rgba(245,158,11,0.24);
          font-weight: 900;
        }
        .summary-player strong {
          display: block;
          color: white;
          font-size: 18px;
          line-height: 1.15;
          overflow-wrap: anywhere;
        }
        .summary-player small,
        .summary-help {
          color: #8b8b8b;
          line-height: 1.45;
        }
        .summary-status {
          display: grid;
          gap: 10px;
        }
        .summary-status span {
          display: flex;
          align-items: center;
          gap: 10px;
          color: rgba(255,255,255,0.76);
          font-size: 13px;
          font-weight: 800;
        }
        .summary-status i {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #4ad569;
          box-shadow: 0 0 16px rgba(74,213,105,0.75);
        }
        .summary-divisions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .summary-divisions span {
          border: 1px solid;
          border-radius: 999px;
          background: rgba(255,255,255,0.035);
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 900;
        }
        .summary-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 44px;
          margin-top: auto;
          border-radius: 12px;
          border: 1px solid rgba(74,213,105,0.38);
          background: rgba(74,213,105,0.12);
          color: #4ad569;
          text-decoration: none;
          font-weight: 900;
        }
        .summary-help {
          margin: -6px 0 0;
          font-size: 12px;
        }
        .profile-head {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-start;
          margin-bottom: 18px;
        }
        .profile-head h2 {
          font-size: clamp(26px, 4vw, 44px);
          line-height: 1;
          margin: 10px 0 8px;
        }
        .outline-link {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          white-space: nowrap;
        }
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }
        .stat-grid div,
        .ranking-strip div {
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 14px;
          background: rgba(255,255,255,0.035);
        }
        .stat-grid b {
          display: block;
          color: #3b82f6;
          font-size: 28px;
          line-height: 1.1;
        }
        .stat-grid span,
        .ranking-strip span {
          display: block;
          color: #8b8b8b;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-top: 6px;
        }
        .ranking-strip {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
        }
        .ranking-strip strong {
          display: block;
          font-size: 24px;
          margin: 8px 0 2px;
        }
        .ranking-strip b {
          color: #f59e0b;
        }
        .tournament-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }
        .registration-panel {
          position: relative;
          overflow: hidden;
        }
        .registration-panel::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(circle at 85% 0%, rgba(74,213,105,0.08), transparent 35%);
        }
        .registration-panel > * {
          position: relative;
          z-index: 1;
        }
        .registration-intro {
          display: flex;
          flex-wrap: wrap;
          gap: 12px 18px;
          margin: -4px 0 16px;
          padding: 12px 14px;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          background: rgba(255,255,255,0.025);
        }
        .tournament-card {
          border: 1px solid rgba(255,255,255,0.1);
          background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02));
          border-radius: 12px;
          padding: 16px;
          min-height: 205px;
          display: flex;
          flex-direction: column;
        }
        .tournament-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 14px;
        }
        .tournament-card h3 {
          margin: 0 0 8px;
          line-height: 1.18;
          font-size: 18px;
        }
        .eligibility {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: 1px solid;
          border-radius: 999px;
          padding: 7px 10px;
          margin: auto 0 10px;
          background: rgba(255,255,255,0.03);
        }
        .eligibility + small {
          display: block;
          line-height: 1.55;
        }
        .registration-button {
          width: 100%;
          min-height: 42px;
          margin-top: 14px;
          border: 1px solid rgba(74,213,105,0.3);
          border-radius: 12px;
          background: rgba(74,213,105,0.12);
          color: #4ad569;
          font-weight: 900;
          cursor: pointer;
        }
        .registration-button:disabled {
          cursor: not-allowed;
          opacity: 0.46;
          border-color: rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          color: #a0a0a0;
        }
        .roadmap-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          margin-top: 20px;
        }
        .roadmap-card {
          padding: 18px;
          display: grid;
          gap: 10px;
        }
        .roadmap-card svg,
        .roadmap-card.ready strong {
          color: #4ad569;
        }
        @media (max-width: 900px) {
          .player-space {
            padding: 34px 14px 60px;
          }
          .player-hero,
          .search-panel,
          .account-panel,
          .draft-panel,
          .player-grid,
          .tournament-grid,
          .roadmap-grid {
            grid-template-columns: 1fr;
          }
          .player-hero h1 {
            font-size: 44px;
          }
          .hero-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .division-tabs {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .profile-head,
          .section-title.split {
            flex-direction: column;
            align-items: flex-start;
          }
          .stat-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 520px) {
          .player-space::before {
            width: 190px;
            height: 180px;
            opacity: 0.24;
          }
          .player-hero h1 {
            font-size: 36px;
          }
          .player-hero p {
            font-size: 15px;
          }
          .hero-metrics,
          .stat-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .hero-metrics div {
            min-height: 96px;
            padding: 13px;
          }
          .hero-metrics strong {
            font-size: 30px;
          }
          .player-panel {
            padding: 14px;
            border-radius: 14px;
          }
          .search-panel {
            padding: 12px;
          }
          .division-tabs {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .division-tabs button {
            padding: 10px 8px;
          }
          .account-panel {
            gap: 14px;
          }
          .tournament-card {
            min-height: 0;
          }
        }
      `}</style>
    </Layout>
  );
}
