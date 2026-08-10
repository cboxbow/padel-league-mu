import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Users, Plus, Upload, Search, Check, X, RefreshCw,
  ChevronDown, AlertTriangle, CheckCircle2, Download, Trash2, Eye,
} from 'lucide-react';
import { GlassCard } from '@/components/Layout';
import { getSupabaseClient, isSupabaseConnected } from '@/lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
//  DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  bg:       '#0a0a0a',
  card:     'rgba(255,255,255,0.03)',
  border:   'rgba(255,255,255,0.08)',
  text:     'white',
  muted:    '#a0a0a0',
  accent:   '#4ad569',
  accentBg: 'rgba(74,213,105,0.12)',
  error:    '#ef4444',
  errorBg:  'rgba(239,68,68,0.12)',
  warn:     '#f59e0b',
  warnBg:   'rgba(245,158,11,0.12)',
  input:    '#1a1a1a',
  inputBorder: 'rgba(255,255,255,0.12)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface Tournament {
  id: string;
  name: string;
  date?: string;
  tournament_date?: string;
  category?: string;
  tournament_type?: string;
  division?: string;
  region?: string;
  club_name?: string;
  status?: string;
}

interface Registration {
  id: string;
  tournament_id: string;
  player1_name: string;
  player2_name: string;
  seed?: number | null;
  division?: string;
  confirmed: boolean;
  checked_in?: boolean;
  created_at?: string;
}

interface PlayerRegistrationRequest {
  id: string;
  tournament_id?: string | null;
  tournament_key?: string | null;
  tournament_name: string;
  tournament_date?: string | null;
  category?: string | null;
  division?: string | null;
  region?: string | null;
  club_name?: string | null;
  player1_name: string;
  player2_name: string;
  player1_email?: string | null;
  player1_rank?: number | null;
  player2_rank?: number | null;
  pair_rank_sum?: number | null;
  eligibility_label?: string | null;
  eligibility_detail?: string | null;
  status?: string | null;
  created_at?: string | null;
}

interface CsvRow {
  player1_name: string;
  player2_name: string;
  seed?: number;
  duplicate?: boolean;
  duplicateReason?: string;
}

type FilterKey = 'all' | 'confirmed' | 'pending' | 'checked_in';
type MsgType = 'success' | 'error' | 'warn' | 'info';

// ─────────────────────────────────────────────────────────────────────────────
//  MOCK DATA (mode démo)
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_TOURNAMENTS: Tournament[] = [
  { id: 't1', name: 'Albion M250', tournament_date: '2026-03-28', category: 'M250', tournament_type: 'MEN', status: 'upcoming' },
  { id: 't2', name: 'MPL Ladies Cup — Moka', tournament_date: '2026-05-03', category: 'W250', tournament_type: 'WOMEN', status: 'upcoming' },
  { id: 't3', name: 'MPL Masters — Curepipe', tournament_date: '2026-06-14', category: 'M350', tournament_type: 'MIXED', status: 'upcoming' },
];

const MOCK_REGISTRATIONS: Registration[] = [
  { id: 'r1', tournament_id: 't1', player1_name: 'Jean Martin',    player2_name: 'Luc Dupont',     seed: 1,         division: 'MEN',   confirmed: true,  checked_in: true  },
  { id: 'r2', tournament_id: 't1', player1_name: 'Yann Perrin',    player2_name: 'Marc Lefevre',   seed: 2,         division: 'MEN',   confirmed: true,  checked_in: false },
  { id: 'r3', tournament_id: 't1', player1_name: 'Sasha Moreau',   player2_name: 'Tom Bernard',    seed: 3,         division: 'MEN',   confirmed: true,  checked_in: true  },
  { id: 'r4', tournament_id: 't1', player1_name: 'Kévin Remy',     player2_name: 'Antoine Simon',  seed: undefined, division: 'MEN',   confirmed: false, checked_in: false },
  { id: 'r5', tournament_id: 't1', player1_name: 'Louis Petit',    player2_name: 'Pierre Garcia',  seed: undefined, division: 'MEN',   confirmed: true,  checked_in: false },
];

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Convertit un type de division technique en label lisible */

function divLabel(type: string): string {
  const t = (type ?? '').toUpperCase();
  if (t === 'MEN') return 'Hommes';
  if (t === 'WOMEN' || t === 'DAMES') return 'Dames';
  if (t === 'JUNIOR') return 'Junior';
  if (t === 'MIXED' || t === 'MIXTE') return 'Mixte';
  if (t === 'MEN&WOMEN') return 'H+D';
  return type || '—';
}

function normalizeDivision(type?: string): string {
  const t = (type ?? '').toUpperCase().replace(/\s+/g, '');
  if (t === 'MEN' || t === 'HOMMES') return 'MEN';
  if (t === 'WOMEN' || t === 'DAMES' || t === 'FEMMES') return 'WOMEN';
  if (t === 'JUNIOR' || t.startsWith('JUNIOR')) return 'JUNIOR';
  if (t === 'MIXED' || t === 'MIXTE') return 'MIXED';
  if (t === 'MEN&WOMEN' || t === 'MEN+WOMEN') return 'MEN&WOMEN';
  return t || 'MEN';
}

function tournamentDivision(t?: Tournament): string {
  return normalizeDivision(t?.tournament_type ?? t?.division);
}

function compactKey(value?: string | null): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function tournamentRequestKey(t?: Tournament | null): string {
  if (!t) return '';
  return [
    t.tournament_date ?? t.date,
    t.category,
    divLabel(tournamentDivision(t)),
    t.club_name,
    t.name,
  ]
    .map(compactKey)
    .filter(Boolean)
    .join('|');
}

function sameTournamentRequest(request: PlayerRegistrationRequest, tournament?: Tournament | null): boolean {
  if (!tournament) return false;
  const requestKey = tournamentRequestKey(tournament);
  if (request.tournament_key && requestKey && request.tournament_key === requestKey) return true;

  const dateOk = compactKey(request.tournament_date) === compactKey(tournament.tournament_date ?? tournament.date);
  const categoryOk = compactKey(request.category) === compactKey(tournament.category);
  const divisionOk = compactKey(normalizeDivision(request.division ?? '')) === compactKey(tournamentDivision(tournament));
  const clubOk = compactKey(request.club_name) === compactKey(tournament.club_name);

  return Boolean(dateOk && categoryOk && divisionOk && clubOk);
}

function cleanNameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function pairKey(p1: string, p2: string): string {
  return [cleanNameKey(p1), cleanNameKey(p2)].sort().join('|');
}

function seedKey(seed?: number | null): string {
  return seed == null ? '' : String(seed);
}

function pickDefaultTournament(tournaments: Tournament[]): string {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const valid = tournaments.filter(t => uuidRe.test(t.id));
  if (!valid.length) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const withTime = valid
    .map(t => ({ ...t, time: new Date(t.tournament_date ?? t.date ?? '').getTime() }))
    .filter(t => Number.isFinite(t.time));
  const future = withTime.filter(t => t.time >= today.getTime()).sort((a, b) => a.time - b.time);
  if (future[0]) return future[0].id;
  return withTime.sort((a, b) => b.time - a.time)[0]?.id ?? valid[0].id;
}

/** Couleur de badge pour la division */
function divColor(type: string): { color: string; bg: string } {
  const t = (type ?? '').toUpperCase();
  if (t === 'MEN')                 return { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' };
  if (t === 'WOMEN' || t === 'DAMES') return { color: '#f472b6', bg: 'rgba(244,114,182,0.12)' };
  if (t === 'JUNIOR')              return { color: '#34d399', bg: 'rgba(52,211,153,0.12)' };
  if (t === 'MIXED' || t === 'MIXTE') return { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' };
  return { color: T.muted, bg: 'rgba(255,255,255,0.06)' };
}

/** Construit le label affiché dans les dropdowns de tournois */
function tournLabel(t: Tournament): string {
  const d = t.tournament_date ?? t.date ?? '';
  const dateStr = d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
  const cat = t.category ?? '';
  const div = divLabel(t.tournament_type ?? t.division ?? '');
  const parts = [cat, div !== '—' ? div : ''].filter(Boolean).join(' • ');
  return `${t.name}${dateStr ? ' — ' + dateStr : ''}${parts ? ' (' + parts + ')' : ''}`;
}

function parseCsv(raw: string): CsvRow[] {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows: CsvRow[] = [];
  for (const line of lines) {
    if (/^player1_name/i.test(line)) continue;
    const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < 2) continue;
    const [p1, p2, seedRaw] = cols;
    if (!p1 || !p2) continue;
    const seedNum = seedRaw ? parseInt(seedRaw, 10) : undefined;
    rows.push({
      player1_name: p1,
      player2_name: p2,
      seed: Number.isNaN(seedNum ?? NaN) ? undefined : seedNum,
    });
  }
  return rows;
}

function exportToCsv(rows: Registration[], tournamentName: string): void {
  const header = 'player1_name,player2_name,seed,division,confirmed,checked_in\n';
  const body = rows.map(r =>
    [r.player1_name, r.player2_name, r.seed ?? '', r.division ?? '', r.confirmed ? 'oui' : 'non', r.checked_in ? 'oui' : 'non'].join(',')
  ).join('\n');
  const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `inscriptions_${tournamentName.replace(/\s+/g, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHARED UI ATOMS
// ─────────────────────────────────────────────────────────────────────────────
function Btn({
  children, onClick, disabled = false, variant = 'ghost', size = 'md', style: extra,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'accent' | 'danger' | 'ghost' | 'warn';
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}) {
  const colors: Record<string, { bg: string; hover: string; text: string }> = {
    accent: { bg: T.accentBg,  hover: 'rgba(74,213,105,0.22)', text: T.accent },
    danger: { bg: T.errorBg,   hover: 'rgba(239,68,68,0.22)',  text: T.error  },
    warn:   { bg: T.warnBg,    hover: 'rgba(245,158,11,0.22)', text: T.warn   },
    ghost:  { bg: 'rgba(255,255,255,0.04)', hover: 'rgba(255,255,255,0.09)', text: T.muted },
  };
  const c  = colors[variant];
  const px = size === 'sm' ? '8px 12px' : '9px 16px';
  const fs = size === 'sm' ? '12px' : '13px';
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: hov && !disabled ? c.hover : c.bg,
        color: disabled ? '#555' : c.text,
        border: `1px solid ${disabled ? 'rgba(255,255,255,0.06)' : c.text + '33'}`,
        borderRadius: 8, padding: px, fontSize: fs, fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s', whiteSpace: 'nowrap',
        ...extra,
      }}
    >
      {children}
    </button>
  );
}

function Input({
  value, onChange, placeholder, type = 'text', style: extra,
}: {
  value: string | number | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  style?: React.CSSProperties;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange((e.target as HTMLInputElement).value)}
      placeholder={placeholder}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        background: T.input,
        border: `1px solid ${focus ? T.accent + '80' : T.inputBorder}`,
        borderRadius: 8, padding: '8px 12px',
        color: T.text, fontSize: 13,
        outline: 'none', width: '100%',
        transition: 'border-color 0.15s',
        ...extra,
      }}
    />
  );
}

function Badge({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: bg, color, borderRadius: 6,
      padding: '2px 8px', fontSize: 11, fontWeight: 600,
    }}>
      {children}
    </span>
  );
}

function Notice({ type, children }: { type: 'success' | 'error' | 'warn' | 'info'; children: React.ReactNode }) {
  const cfg = {
    success: { icon: <CheckCircle2 size={14} />, color: T.accent,  bg: T.accentBg },
    error:   { icon: <X size={14} />,            color: T.error,   bg: T.errorBg  },
    warn:    { icon: <AlertTriangle size={14} />, color: T.warn,    bg: T.warnBg   },
    info:    { icon: <Eye size={14} />,           color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  }[type];
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}33`, borderRadius: 8,
      padding: '10px 14px', fontSize: 13,
    }}>
      <span style={{ marginTop: 1, flexShrink: 0 }}>{cfg.icon}</span>
      <span>{children}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function RegistrationsPage() {
  const demo = !isSupabaseConnected();
  const supabase = getSupabaseClient();

  // ── State ──────────────────────────────────────────────────────────────────
  const [tournaments, setTournaments]         = useState<Tournament[]>([]);
  const [selectedTournId, setSelectedTournId] = useState<string>('');
  const [registrations, setRegistrations]     = useState<Registration[]>([]);
  const [loadingTourns, setLoadingTourns]     = useState(false);
  const [loadingRegs,   setLoadingRegs]       = useState(false);
  const [playerRequests, setPlayerRequests]   = useState<PlayerRegistrationRequest[]>([]);
  const [allPlayerRequests, setAllPlayerRequests] = useState<PlayerRegistrationRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadingAllRequests, setLoadingAllRequests] = useState(false);
  const [requestMsg, setRequestMsg]           = useState<{ type: MsgType; text: string } | null>(null);

  // Manual form
  const [formP1,       setFormP1]       = useState('');
  const [formP2,       setFormP2]       = useState('');
  const [formSeed,     setFormSeed]     = useState('');
  const [formDivision, setFormDivision] = useState('MEN');
  const [formBusy,     setFormBusy]     = useState(false);
  const [formMsg,      setFormMsg]      = useState<{ type: 'success'|'error'; text: string } | null>(null);

  // CSV import
  const [csvRows,    setCsvRows]    = useState<CsvRow[]>([]);
  const [csvPreview, setCsvPreview] = useState(false);
  const [csvBusy,    setCsvBusy]    = useState(false);
  const [csvMsg,     setCsvMsg]     = useState<{ type: MsgType; text: string } | null>(null);
  const [dragOver,   setDragOver]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // List
  const [search,    setSearch]    = useState('');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');

  // UUID regex validator — accepts standard 8-4-4-4-12 format
  const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  // ── Load tournaments ───────────────────────────────────────────────────────
  const loadTournaments = useCallback(async () => {
    setLoadingTourns(true);
    if (demo || !supabase) {
      // Mode démo : charger les mocks MAIS ne jamais présélectionner un ID non-UUID
      setTournaments(MOCK_TOURNAMENTS);
      setSelectedTournId(''); // Laisser vide — l'utilisateur choisit
      setLoadingTourns(false);
      return;
    }
    const { data, error } = await supabase
      .from('tournaments')
      .select('id, name, tournament_date, category, tournament_type, division, region, club_name')
      .order('tournament_date', { ascending: false });
    if (error || !data || data.length === 0) {
      // Supabase connecté mais erreur réseau/RLS : liste vide
      setTournaments([]);
      setSelectedTournId('');
    } else {
      // Dédupliquer par id
      const unique = Array.from(new Map((data as Tournament[]).map(t => [t.id, t])).values());
      setTournaments(unique);
      const defaultId = pickDefaultTournament(unique);
      if (defaultId) {
        console.log('[MPL] loadTournaments → présélection tournoi:', defaultId);
        setSelectedTournId(defaultId);
      } else {
        console.warn('[MPL] loadTournaments → aucun UUID valide trouvé dans', unique.map(t => t.id));
        setSelectedTournId('');
      }
    }
    setLoadingTourns(false);
  }, [demo, supabase]);

  // ── Load registrations for selected tournament ─────────────────────────────
  const loadRegistrations = useCallback(async (tournId: string) => {
    if (!tournId) return;
    setLoadingRegs(true);
    if (demo || !supabase) {
      setRegistrations(MOCK_REGISTRATIONS.filter(r => r.tournament_id === tournId));
      setLoadingRegs(false);
      return;
    }
    const { data, error } = await supabase
      .from('registrations')
      .select('*')
      .eq('tournament_id', tournId)
      .order('seed', { ascending: true, nullsFirst: false });
    if (error || !data) {
      setRegistrations([]);
    } else {
      setRegistrations(data as Registration[]);
    }
    setLoadingRegs(false);
  }, [demo, supabase]);

  const loadPlayerRequests = useCallback(async (tournId: string) => {
    if (!tournId) {
      setPlayerRequests([]);
      return;
    }
    const selectedTournament = tournaments.find(t => t.id === tournId);
    setLoadingRequests(true);
    setRequestMsg(null);
    if (demo || !supabase) {
      setPlayerRequests([]);
      setLoadingRequests(false);
      return;
    }
    const { data, error } = await supabase
      .from('player_registration_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error || !data) {
      setPlayerRequests([]);
      setRequestMsg({
        type: 'warn',
        text: error?.message?.includes('player_registration_requests')
          ? 'Table demandes joueurs non installee. Lancez le fichier player_registration_requests_schema.sql dans Supabase.'
          : error?.message ?? 'Demandes joueurs indisponibles.',
      });
    } else {
      const rows = (data as PlayerRegistrationRequest[]).filter(request =>
        (request.tournament_id && request.tournament_id === tournId) ||
        sameTournamentRequest(request, selectedTournament)
      );
      setPlayerRequests(rows);
    }
    setLoadingRequests(false);
  }, [demo, supabase, tournaments]);

  const loadAllPlayerRequests = useCallback(async () => {
    setLoadingAllRequests(true);
    if (demo || !supabase) {
      setAllPlayerRequests([]);
      setLoadingAllRequests(false);
      return;
    }
    const { data, error } = await supabase
      .from('player_registration_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error || !data) {
      setAllPlayerRequests([]);
    } else {
      setAllPlayerRequests(data as PlayerRegistrationRequest[]);
    }
    setLoadingAllRequests(false);
  }, [demo, supabase]);

  useEffect(() => { loadTournaments(); }, [loadTournaments]);
  useEffect(() => { loadAllPlayerRequests(); }, [loadAllPlayerRequests]);
  useEffect(() => {
    if (selectedTournId) {
      loadRegistrations(selectedTournId);
      loadPlayerRequests(selectedTournId);
    } else {
      setRegistrations([]);
      setPlayerRequests([]);
    }
  }, [selectedTournId, loadRegistrations, loadPlayerRequests]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const selectedTourn = useMemo(
    () => tournaments.find(t => t.id === selectedTournId),
    [tournaments, selectedTournId]
  );
  const selectedDivision = useMemo(() => tournamentDivision(selectedTourn), [selectedTourn]);
  const divisionLocked = selectedDivision !== 'MEN&WOMEN';
  const registrationDivision = divisionLocked ? selectedDivision : formDivision;

  useEffect(() => {
    if (selectedTourn && divisionLocked) setFormDivision(selectedDivision);
  }, [selectedTourn, selectedDivision, divisionLocked]);

  const filtered = useMemo(() => {
    let list = registrations;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.player1_name.toLowerCase().includes(q) ||
        r.player2_name.toLowerCase().includes(q)
      );
    }
    if (filterKey === 'confirmed')  list = list.filter(r =>  r.confirmed && !r.checked_in);
    if (filterKey === 'pending')    list = list.filter(r => !r.confirmed);
    if (filterKey === 'checked_in') list = list.filter(r =>  r.checked_in);
    return list;
  }, [registrations, search, filterKey]);

  const stats = useMemo(() => ({
    total:     registrations.length,
    checkedIn: registrations.filter(r => r.checked_in).length,
    missing:   registrations.filter(r => !r.checked_in).length,
  }), [registrations]);

  const pendingRequests = useMemo(
    () => playerRequests.filter(r => (r.status ?? 'pending') === 'pending'),
    [playerRequests]
  );

  const globalPendingRequests = useMemo(
    () => allPlayerRequests.filter(r => (r.status ?? 'pending') === 'pending'),
    [allPlayerRequests]
  );

  const recentGlobalRequests = useMemo(
    () => [
      ...globalPendingRequests,
      ...allPlayerRequests.filter(r => (r.status ?? 'pending') !== 'pending'),
    ].slice(0, 12),
    [allPlayerRequests, globalPendingRequests]
  );

  const findRequestTournament = useCallback((request: PlayerRegistrationRequest) => {
    return tournaments.find(t =>
      Boolean(request.tournament_id && t.id === request.tournament_id) ||
      sameTournamentRequest(request, t)
    );
  }, [tournaments]);

  const openRequestTournament = useCallback((request: PlayerRegistrationRequest) => {
    const target = findRequestTournament(request);
    if (!target) {
      setRequestMsg({
        type: 'warn',
        text: `Tournoi introuvable pour ${request.tournament_name || 'cette demande'}. Controlez la date, le club et la categorie.`,
      });
      return;
    }
    setSelectedTournId(target.id);
    setRequestMsg({
      type: 'info',
      text: `Tournoi ouvert: ${tournLabel(target)}.`,
    });
  }, [findRequestTournament]);

  // ── Manual add ────────────────────────────────────────────────────────────
  const handleAdd = useCallback(async () => {
    if (!formP1.trim() || !formP2.trim()) {
      setFormMsg({ type: 'error', text: 'Les deux noms de joueurs sont obligatoires.' });
      return;
    }
    if (!selectedTournId) {
      setFormMsg({ type: 'error', text: 'Aucun tournoi sélectionné.' });
      return;
    }
    if (cleanNameKey(formP1) === cleanNameKey(formP2)) {
      setFormMsg({ type: 'error', text: 'Les deux joueurs ne peuvent pas etre identiques.' });
      return;
    }
    const newPairKey = pairKey(formP1, formP2);
    if (registrations.some(r => pairKey(r.player1_name, r.player2_name) === newPairKey)) {
      setFormMsg({ type: 'error', text: 'Cette paire existe deja pour ce tournoi.' });
      return;
    }
    const parsedSeed = formSeed ? parseInt(formSeed, 10) : null;
    if (parsedSeed != null && (!Number.isFinite(parsedSeed) || parsedSeed < 1)) {
      setFormMsg({ type: 'error', text: 'Le seed doit etre un nombre positif.' });
      return;
    }
    if (parsedSeed != null && registrations.some(r => r.seed === parsedSeed)) {
      setFormMsg({ type: 'error', text: `Le seed #${parsedSeed} existe deja pour ce tournoi.` });
      return;
    }
    // Bloquer les IDs mock non-UUID avant tout envoi Supabase
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedTournId)) {
      setFormMsg({ type: 'error', text: `❌ ID de tournoi invalide («${selectedTournId}»). Sélectionnez un tournoi réel.` });
      return;
    }
    setFormBusy(true);
    setFormMsg(null);

    const newReg: Omit<Registration, 'id'> = {
      tournament_id: selectedTournId,
      player1_name:  formP1.trim(),
      player2_name:  formP2.trim(),
      seed:          parsedSeed,
      division:      registrationDivision,
      confirmed:     true,
      checked_in:    false,
    };

    console.log('[DEBUG INSERT] tournament_id:', selectedTournId, 'type:', typeof selectedTournId, 'payload:', newReg);

    if (demo || !supabase) {
      const mock: Registration = { ...newReg, id: `mock-${Date.now()}` };
      setRegistrations(prev => [...prev, mock]);
      setFormP1(''); setFormP2(''); setFormSeed('');
      setFormMsg({ type: 'success', text: `Paire "${mock.player1_name} / ${mock.player2_name}" ajoutée (mode démo).` });
      setFormBusy(false);
      return;
    }

    const { data, error } = await supabase
      .from('registrations')
      .insert([newReg])
      .select()
      .single();

    if (error || !data) {
      setFormMsg({ type: 'error', text: `❌ ${error?.message ?? 'Insertion échouée'}` });
    } else {
      setRegistrations(prev => [...prev, data as Registration]);
      setFormP1(''); setFormP2(''); setFormSeed('');
      setFormMsg({ type: 'success', text: `Paire "${(data as Registration).player1_name} / ${(data as Registration).player2_name}" ajoutée.` });
    }
    setFormBusy(false);
  }, [formP1, formP2, formSeed, selectedTournId, registrationDivision, registrations, demo, supabase]);

  const handleApproveRequest = useCallback(async (request: PlayerRegistrationRequest) => {
    const targetTournamentId = request.tournament_id ?? selectedTournId;
    if (!targetTournamentId) {
      setRequestMsg({ type: 'error', text: 'Selectionnez le tournoi concerne avant de valider cette demande.' });
      return;
    }
    const requestPairKey = pairKey(request.player1_name, request.player2_name);
    const alreadyRegistered = registrations.some(
      r => pairKey(r.player1_name, r.player2_name) === requestPairKey
    );

    if (demo || !supabase) {
      if (!alreadyRegistered) {
        setRegistrations(prev => [...prev, {
          id: `request-${Date.now()}`,
          tournament_id: targetTournamentId,
          player1_name: request.player1_name,
          player2_name: request.player2_name,
          division: normalizeDivision(request.division ?? registrationDivision),
          confirmed: true,
          checked_in: false,
        }]);
      }
      setPlayerRequests(prev => prev.map(r => r.id === request.id ? { ...r, status: 'approved' } : r));
      setRequestMsg({ type: 'success', text: 'Demande approuvee en mode demo.' });
      return;
    }

    if (!alreadyRegistered) {
      const { error: insertError } = await supabase.from('registrations').insert([{
        tournament_id: targetTournamentId,
        player1_name: request.player1_name,
        player2_name: request.player2_name,
        seed: null,
        division: normalizeDivision(request.division ?? registrationDivision),
        confirmed: true,
        checked_in: false,
      }]);
      if (insertError) {
        setRequestMsg({ type: 'error', text: `Insertion inscription impossible: ${insertError.message}` });
        return;
      }
    }

    const { error: updateError } = await supabase
      .from('player_registration_requests')
      .update({ status: 'approved' })
      .eq('id', request.id);
    if (updateError) {
      setRequestMsg({ type: 'warn', text: `Inscription creee, mais statut demande non mis a jour: ${updateError.message}` });
    } else {
      setRequestMsg({ type: 'success', text: alreadyRegistered ? 'Paire deja inscrite. Demande marquee comme approuvee.' : 'Demande approuvee et inscription ajoutee.' });
    }
    await loadRegistrations(targetTournamentId);
    await loadPlayerRequests(targetTournamentId);
    await loadAllPlayerRequests();
  }, [demo, supabase, registrations, registrationDivision, selectedTournId, loadRegistrations, loadPlayerRequests, loadAllPlayerRequests]);

  const handleRejectRequest = useCallback(async (request: PlayerRegistrationRequest) => {
    if (demo || !supabase) {
      setPlayerRequests(prev => prev.map(r => r.id === request.id ? { ...r, status: 'rejected' } : r));
      setRequestMsg({ type: 'success', text: 'Demande refusee en mode demo.' });
      return;
    }
    const { error } = await supabase
      .from('player_registration_requests')
      .update({ status: 'rejected' })
      .eq('id', request.id);
    if (error) {
      setRequestMsg({ type: 'error', text: `Refus impossible: ${error.message}` });
      return;
    }
    setRequestMsg({ type: 'success', text: 'Demande refusee.' });
    await loadPlayerRequests(request.tournament_id ?? selectedTournId);
    await loadAllPlayerRequests();
  }, [demo, supabase, selectedTournId, loadPlayerRequests, loadAllPlayerRequests]);

  // ── CSV parsing ───────────────────────────────────────────────────────────
  const handleFileRead = useCallback((file: File) => {
    setCsvMsg(null);
    const reader = new FileReader();
    reader.onload = e => {
      const raw = (e.target as FileReader).result as string;
      const rows = parseCsv(raw);
      if (!rows.length) {
        setCsvMsg({ type: 'error', text: 'Aucune ligne valide trouvée dans ce fichier CSV.' });
        return;
      }
      const existingPairs = new Set(registrations.map(r => pairKey(r.player1_name, r.player2_name)));
      const existingSeeds = new Set(registrations.map(r => seedKey(r.seed)).filter(Boolean));
      const seenPairs = new Set<string>();
      const seenSeeds = new Set<string>();
      const marked = rows.map(r => {
        const pk = pairKey(r.player1_name, r.player2_name);
        const sk = seedKey(r.seed);
        const samePlayer = cleanNameKey(r.player1_name) === cleanNameKey(r.player2_name);
        const duplicatePair = existingPairs.has(pk) || seenPairs.has(pk);
        const duplicateSeed = Boolean(sk && (existingSeeds.has(sk) || seenSeeds.has(sk)));
        seenPairs.add(pk);
        if (sk) seenSeeds.add(sk);
        return {
          ...r,
          duplicate: samePlayer || duplicatePair || duplicateSeed,
          duplicateReason: samePlayer
            ? 'meme joueur'
            : duplicatePair
              ? 'paire deja presente'
              : duplicateSeed
                ? `seed #${r.seed} deja utilise`
                : undefined,
        };
      });
      setCsvRows(marked);
      setCsvPreview(true);
    };
    reader.readAsText(file);
  }, [registrations]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileRead(file);
  }, [handleFileRead]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) handleFileRead(file);
  }, [handleFileRead]);

  // ── Bulk CSV import ───────────────────────────────────────────────────────
  const handleCsvImport = useCallback(async () => {
    const toInsert = csvRows.filter(r => !r.duplicate);
    if (!toInsert.length) {
      setCsvMsg({ type: 'warn', text: 'Toutes les lignes sont des doublons ou invalides.' });
      return;
    }
    if (!selectedTournId) {
      setCsvMsg({ type: 'error', text: 'Aucun tournoi sélectionné.' });
      return;
    }
    setCsvBusy(true);
    setCsvMsg(null);

    const payload = toInsert.map(r => ({
      tournament_id: selectedTournId,
      player1_name:  r.player1_name,
      player2_name:  r.player2_name,
      seed:          r.seed ?? null,
      division:      registrationDivision,
      confirmed:     true,
      checked_in:    false,
    }));

    if (demo || !supabase) {
      const mocks: Registration[] = payload.map((p, i) => ({ ...p, id: `mock-csv-${Date.now()}-${i}` }));
      setRegistrations(prev => [...prev, ...mocks]);
      setCsvMsg({ type: 'success', text: `${mocks.length} paire(s) importée(s) (mode démo).` });
      setCsvRows([]); setCsvPreview(false);
      setCsvBusy(false);
      return;
    }

    const { data, error } = await supabase
      .from('registrations')
      .insert(payload)
      .select();

    if (error || !data) {
      setCsvMsg({ type: 'error', text: `❌ ${error?.message ?? 'Import échoué'}` });
    } else {
      setRegistrations(prev => [...prev, ...(data as Registration[])]);
      setCsvMsg({ type: 'success', text: `${(data as Registration[]).length} paire(s) importée(s) avec succès.` });
      setCsvRows([]); setCsvPreview(false);
    }
    setCsvBusy(false);
  }, [csvRows, selectedTournId, registrationDivision, demo, supabase]);

  // ── Check-in ──────────────────────────────────────────────────────────────
  const handleCheckin = useCallback(async (id: string) => {
    if (demo || !supabase) {
      setRegistrations(prev => prev.map(r => r.id === id ? { ...r, checked_in: true } : r));
      return;
    }
    const { error } = await supabase
      .from('registrations')
      .update({ checked_in: true })
      .eq('id', id);
    if (!error) {
      setRegistrations(prev => prev.map(r => r.id === id ? { ...r, checked_in: true } : r));
    }
  }, [demo, supabase]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Supprimer cette inscription ?')) return;
    if (demo || !supabase) {
      setRegistrations(prev => prev.filter(r => r.id !== id));
      return;
    }
    const { error } = await supabase
      .from('registrations')
      .delete()
      .eq('id', id);
    if (!error) {
      setRegistrations(prev => prev.filter(r => r.id !== id));
    }
  }, [demo, supabase]);

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    exportToCsv(registrations, selectedTourn?.name ?? 'tournoi');
  }, [registrations, selectedTourn]);

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: T.accentBg, border: `1px solid ${T.accent}33`, borderRadius: 10, padding: 10 }}>
            <Users size={22} color={T.accent} />
          </div>
          <div>
            <h1 style={{ color: T.text, fontSize: 20, fontWeight: 700, margin: 0 }}>Inscriptions</h1>
            <p style={{ color: T.muted, fontSize: 13, margin: 0 }}>Gérer les inscriptions par tournoi</p>
          </div>
        </div>
        {demo && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: T.warnBg, color: T.warn,
            border: `1px solid ${T.warn}33`, borderRadius: 8,
            padding: '6px 12px', fontSize: 12, fontWeight: 600,
          }}>
            <AlertTriangle size={13} /> Mode démo — données locales
          </div>
        )}
      </div>

      {/* ── Tournament selector ── */}
      <GlassCard style={{ marginBottom: 12, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <label style={{ color: T.muted, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>Tournoi :</label>
          <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
            <select
              value={selectedTournId}
              onChange={e => setSelectedTournId((e.target as HTMLSelectElement).value)}
              style={{
                background: T.input, border: `1px solid ${T.inputBorder}`,
                borderRadius: 8, padding: '8px 36px 8px 12px',
                color: T.text, fontSize: 13, width: '100%',
                appearance: 'none', cursor: 'pointer', outline: 'none',
              }}
            >
              {loadingTourns
                ? <option>Chargement…</option>
                : tournaments.map(t => (
                    <option key={t.id} value={t.id}>
                      {tournLabel(t)}
                    </option>
                  ))
              }
            </select>
            <ChevronDown size={14} color={T.muted} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>
          <Btn onClick={() => { loadRegistrations(selectedTournId); loadPlayerRequests(selectedTournId); loadAllPlayerRequests(); }} variant="ghost" size="sm">
            <RefreshCw size={13} /> Actualiser
          </Btn>
        </div>
      </GlassCard>

      <GlassCard style={{ marginBottom: 12, padding: '12px 16px', borderColor: globalPendingRequests.length ? `${T.warn}55` : `${T.accent}33` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <h2 style={{ color: T.text, fontSize: 14, fontWeight: 800, margin: '0 0 3px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={16} color={globalPendingRequests.length ? T.warn : T.accent} /> Demandes recues
            </h2>
            <p style={{ color: T.muted, fontSize: 12, margin: 0 }}>
              <span style={{ color: globalPendingRequests.length ? T.warn : T.accent, fontWeight: 900 }}>{globalPendingRequests.length}</span> a traiter maintenant -{' '}
              {allPlayerRequests.length} demande(s) au total
            </p>
          </div>
          <Btn onClick={loadAllPlayerRequests} variant="ghost" size="sm" disabled={loadingAllRequests}>
            <RefreshCw size={13} /> Recharger tout
          </Btn>
        </div>

        {loadingAllRequests ? (
          <div style={{ color: T.muted, fontSize: 13, padding: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Lecture des demandes entrantes...
          </div>
        ) : recentGlobalRequests.length === 0 ? (
          <div style={{
            color: T.muted,
            fontSize: 13,
            padding: '12px 0',
            borderTop: `1px solid ${T.border}`,
          }}>
            Aucune demande entrante pour le moment. Des qu un joueur envoie une demande depuis son espace, elle apparaitra ici.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8, maxHeight: 230, overflowY: 'auto', paddingRight: 2 }}>
            {recentGlobalRequests.map(request => {
              const target = findRequestTournament(request);
              const isCurrent = Boolean(target && target.id === selectedTournId);
              const isPending = (request.status ?? 'pending') === 'pending';
              const statusColor = isPending ? T.warn : request.status === 'approved' ? T.accent : T.error;
              const requestDate = request.tournament_date
                ? new Date(request.tournament_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
                : '';
              return (
                <div
                  key={request.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(210px, 1fr) minmax(260px, 1.35fr) auto',
                    gap: 10,
                    alignItems: 'center',
                    background: isPending ? 'rgba(245,158,11,0.055)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isPending ? T.warn + '44' : T.border}`,
                    borderRadius: 10,
                    padding: '9px 10px',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: T.text, fontWeight: 850, fontSize: 12.5, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {request.player1_name} / {request.player2_name}
                    </div>
                    <div style={{ color: T.muted, fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {request.player1_email || 'Email non fourni'} - rang paire {request.pair_rank_sum ?? '-'}
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: T.text, fontWeight: 750, fontSize: 12.5, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {target ? tournLabel(target) : request.tournament_name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Badge color={statusColor} bg={`${statusColor}18`}>{request.status ?? 'pending'}</Badge>
                      <span style={{ color: T.muted, fontSize: 12 }}>
                        {[request.category, divLabel(request.division ?? ''), requestDate].filter(Boolean).join(' - ')}
                      </span>
                    </div>
                  </div>
                  <Btn onClick={() => openRequestTournament(request)} variant={isCurrent ? 'accent' : 'warn'} size="sm" disabled={!target}>
                    {isCurrent ? <Check size={12} /> : <Eye size={12} />}
                    {isCurrent ? 'Ouvert' : 'Ouvrir'}
                  </Btn>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      <GlassCard style={{ marginBottom: 16, padding: '12px 16px', borderColor: pendingRequests.length ? `${T.accent}44` : T.border }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <h2 style={{ color: T.text, fontSize: 14, fontWeight: 800, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={15} color={T.accent} /> Demandes joueurs
            </h2>
            <p style={{ color: T.muted, fontSize: 12, margin: 0 }}>
              <span style={{ color: pendingRequests.length ? T.accent : T.text, fontWeight: 800 }}>{pendingRequests.length}</span> en attente ·{' '}
              {playerRequests.length} demande(s) pour ce tournoi
            </p>
          </div>
          <Btn onClick={() => loadPlayerRequests(selectedTournId)} variant="ghost" size="sm" disabled={!selectedTournId || loadingRequests}>
            <RefreshCw size={13} /> Recharger
          </Btn>
        </div>
        {requestMsg && <div style={{ marginBottom: 12 }}><Notice type={requestMsg.type}>{requestMsg.text}</Notice></div>}
        {loadingRequests ? (
          <div style={{ color: T.muted, fontSize: 13, padding: '14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Chargement des demandes...
          </div>
        ) : playerRequests.length === 0 ? (
          <div style={{ color: T.muted, fontSize: 13, padding: '10px 0' }}>
            Aucune demande joueur pour ce tournoi. Les demandes envoyees depuis l Espace Joueur apparaitront ici.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8, maxHeight: 190, overflowY: 'auto', paddingRight: 2 }}>
            {playerRequests.map(request => {
              const isPending = (request.status ?? 'pending') === 'pending';
              const statusColor = isPending ? T.warn : request.status === 'approved' ? T.accent : T.error;
              const alreadyRegistered = registrations.some(r => pairKey(r.player1_name, r.player2_name) === pairKey(request.player1_name, request.player2_name));
              return (
                <div
                  key={request.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,0.9fr) auto',
                    gap: 10,
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.035)',
                    border: `1px solid ${isPending ? T.warn + '33' : T.border}`,
                    borderRadius: 10,
                    padding: '9px 10px',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: T.text, fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
                      {request.player1_name} / {request.player2_name}
                    </div>
                    <div style={{ color: T.muted, fontSize: 12 }}>
                      {request.player1_email || 'Email non fourni'} · {request.eligibility_detail || 'Controle a faire'}
                    </div>
                  </div>
                  <div style={{ color: T.muted, fontSize: 12 }}>
                    <Badge color={statusColor} bg={`${statusColor}18`}>{request.status ?? 'pending'}</Badge>
                    <span style={{ marginLeft: 8 }}>
                      Rang paire: {request.pair_rank_sum ?? '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Btn onClick={() => handleRejectRequest(request)} variant="danger" size="sm" disabled={!isPending}>
                      <X size={12} /> Refuser
                    </Btn>
                    <Btn onClick={() => handleApproveRequest(request)} variant="accent" size="sm" disabled={!isPending}>
                      <Check size={12} /> {alreadyRegistered ? 'Marquer OK' : 'Approuver'}
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* ── Manual form ── */}
        <GlassCard style={{ padding: '20px' }}>
          <h2 style={{ color: T.text, fontSize: 14, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={15} color={T.accent} /> Inscription manuelle
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ color: T.muted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
                Joueur 1 *
              </label>
              <Input value={formP1} onChange={setFormP1} placeholder="Prénom Nom" />
            </div>
            <div>
              <label style={{ color: T.muted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
                Joueur 2 *
              </label>
              <Input value={formP2} onChange={setFormP2} placeholder="Prénom Nom" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 10 }}>
              <div>
                <label style={{ color: T.muted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
                  Seed
                </label>
                <Input value={formSeed} onChange={setFormSeed} placeholder="1" type="number" />
              </div>
              <div>
                <label style={{ color: T.muted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
                  Division *
                </label>
                <select
                  value={formDivision}
                  onChange={e => setFormDivision((e.target as HTMLSelectElement).value)}
                  disabled={divisionLocked}
                  style={{
                    background: T.input, border: `1px solid ${T.inputBorder}`,
                    borderRadius: 8, padding: '8px 12px',
                    color: divisionLocked ? T.muted : T.text, fontSize: 13, width: '100%',
                    appearance: 'none', cursor: divisionLocked ? 'not-allowed' : 'pointer', outline: 'none',
                  }}
                >
                  <option value="MEN">Hommes</option>
                  <option value="WOMEN">Dames</option>
                  <option value="JUNIOR">Junior</option>
                  <option value="MIXED">Mixte</option>
                </select>
                {divisionLocked && (
                  <div style={{ color: T.muted, fontSize: 11, marginTop: 5 }}>
                    Auto depuis le tournoi selectionne.
                  </div>
                )}
              </div>
            </div>
            {formMsg && <Notice type={formMsg.type}>{formMsg.text}</Notice>}
            <Btn onClick={handleAdd} disabled={formBusy || !selectedTournId} variant="accent">
              {formBusy ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />}
              Ajouter la paire
            </Btn>
          </div>
        </GlassCard>

        {/* ── CSV Import ── */}
        <GlassCard style={{ padding: '20px' }}>
          <h2 style={{ color: T.text, fontSize: 14, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Upload size={15} color={T.accent} /> Import CSV
          </h2>

          {/* Drop zone */}
          {!csvPreview && (
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? T.accent : T.inputBorder}`,
                borderRadius: 10, padding: '28px 16px',
                textAlign: 'center', cursor: 'pointer',
                background: dragOver ? T.accentBg : 'transparent',
                transition: 'all 0.2s', marginBottom: 12,
              }}
            >
              <Upload size={24} color={dragOver ? T.accent : T.muted} style={{ margin: '0 auto 8px' }} />
              <p style={{ color: dragOver ? T.accent : T.muted, fontSize: 13, margin: 0 }}>
                Glissez un fichier CSV ou <span style={{ color: T.accent, fontWeight: 600 }}>cliquez pour parcourir</span>
              </p>
              <p style={{ color: '#555', fontSize: 11, margin: '6px 0 0' }}>
                Format : player1_name,player2_name,seed
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />
            </div>
          )}

          {/* Preview table */}
          {csvPreview && csvRows.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ color: T.muted, fontSize: 12 }}>
                  {csvRows.length} ligne(s) · <span style={{ color: T.error }}>{csvRows.filter(r => r.duplicate).length} doublon(s)</span>
                </span>
                <Btn onClick={() => { setCsvRows([]); setCsvPreview(false); setCsvMsg(null); }} variant="ghost" size="sm">
                  <X size={12} /> Annuler
                </Btn>
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto', borderRadius: 8, border: `1px solid ${T.border}` }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                      {['Joueur 1', 'Joueur 2', 'Seed', ''].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: T.muted, fontWeight: 600, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.map((r, i) => (
                      <tr key={i} style={{ opacity: r.duplicate ? 0.45 : 1 }}>
                        <td style={{ padding: '5px 10px', color: T.text, borderBottom: `1px solid ${T.border}` }}>{r.player1_name}</td>
                        <td style={{ padding: '5px 10px', color: T.text, borderBottom: `1px solid ${T.border}` }}>{r.player2_name}</td>
                        <td style={{ padding: '5px 10px', color: T.muted, borderBottom: `1px solid ${T.border}` }}>{r.seed ?? '—'}</td>
                        <td style={{ padding: '5px 10px', borderBottom: `1px solid ${T.border}` }}>
                          {r.duplicate
                            ? <Badge color={T.warn} bg={T.warnBg}>{r.duplicateReason ?? 'doublon'}</Badge>
                            : <Badge color={T.accent} bg={T.accentBg}>nouveau</Badge>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {csvMsg && <div style={{ marginBottom: 10 }}><Notice type={csvMsg.type as 'success'|'error'|'warn'|'info'}>{csvMsg.text}</Notice></div>}

          {csvPreview && (
            <Btn
              onClick={handleCsvImport}
              disabled={csvBusy || csvRows.filter(r => !r.duplicate).length === 0}
              variant="accent"
            >
              {csvBusy
                ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                : <Upload size={13} />
              }
              Importer {csvRows.filter(r => !r.duplicate).length} paire(s)
            </Btn>
          )}
        </GlassCard>
      </div>

      {/* ── Registrations list ── */}
      <GlassCard style={{ padding: '20px' }}>

        {/* List header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h2 style={{ color: T.text, fontSize: 14, fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={15} color={T.accent} /> Liste des inscrits
            </h2>
            <p style={{ color: T.muted, fontSize: 12, margin: 0 }}>
              <span style={{ color: T.text, fontWeight: 600 }}>{stats.total}</span> inscrit(s) ·{' '}
              <span style={{ color: T.accent, fontWeight: 600 }}>{stats.checkedIn}</span> check-in(s) ·{' '}
              <span style={{ color: T.warn, fontWeight: 600 }}>{stats.missing}</span> manquant(s)
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Btn onClick={handleExport} disabled={!registrations.length} variant="ghost" size="sm">
              <Download size={13} /> Exporter CSV
            </Btn>
          </div>
        </div>

        {/* Filters + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <Search size={13} color={T.muted} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch((e.target as HTMLInputElement).value)}
              placeholder="Rechercher un joueur…"
              style={{
                background: T.input, border: `1px solid ${T.inputBorder}`,
                borderRadius: 8, padding: '7px 10px 7px 30px',
                color: T.text, fontSize: 13, outline: 'none', width: '100%',
              }}
            />
          </div>
          {/* Filter tabs */}
          {(['all', 'confirmed', 'pending', 'checked_in'] as FilterKey[]).map(k => {
            const labels: Record<FilterKey, string> = { all: 'Tous', confirmed: 'Confirmés', pending: 'Non confirmés', checked_in: 'Check-in' };
            const active = filterKey === k;
            return (
              <button
                key={k}
                onClick={() => setFilterKey(k)}
                style={{
                  background: active ? T.accentBg : 'transparent',
                  color: active ? T.accent : T.muted,
                  border: `1px solid ${active ? T.accent + '55' : T.border}`,
                  borderRadius: 7, padding: '6px 12px',
                  fontSize: 12, fontWeight: active ? 600 : 400,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {labels[k]}
              </button>
            );
          })}
        </div>

        {/* Table */}
        {loadingRegs
          ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: T.muted, fontSize: 13 }}>
              <RefreshCw size={18} style={{ margin: '0 auto 8px', display: 'block', animation: 'spin 1s linear infinite' }} />
              Chargement…
            </div>
          )
          : filtered.length === 0
          ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: T.muted, fontSize: 13 }}>
              <Users size={28} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.3 }} />
              Aucune inscription{search ? ' correspondant à la recherche' : ' pour ce tournoi'}.
            </div>
          )
          : (
            <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${T.border}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {['#', 'Paire', 'Division', 'Seed', 'Statut', 'Check-in', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: h === '#' ? 'center' : 'left', color: T.muted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((reg, idx) => {
                    const dc = divColor(reg.division ?? '');
                    return (
                      <tr
                        key={reg.id}
                        style={{ borderBottom: `1px solid ${T.border}`, transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        {/* # */}
                        <td style={{ padding: '10px 14px', color: T.muted, textAlign: 'center', width: 40 }}>
                          {idx + 1}
                        </td>

                        {/* Pair */}
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ color: T.text, fontWeight: 600 }}>{reg.player1_name}</div>
                          <div style={{ color: T.muted, fontSize: 12 }}>{reg.player2_name}</div>
                        </td>

                        {/* Division badge */}
                        <td style={{ padding: '10px 14px' }}>
                          {reg.division
                            ? <Badge color={dc.color} bg={dc.bg}>{divLabel(reg.division)}</Badge>
                            : <span style={{ color: '#555', fontSize: 12 }}>—</span>
                          }
                        </td>

                        {/* Seed badge */}
                        <td style={{ padding: '10px 14px' }}>
                          {reg.seed != null
                            ? <Badge color="#60a5fa" bg="rgba(96,165,250,0.1)">#{reg.seed}</Badge>
                            : <span style={{ color: '#555', fontSize: 12 }}>—</span>
                          }
                        </td>

                        {/* Status */}
                        <td style={{ padding: '10px 14px' }}>
                          {reg.confirmed
                            ? <Badge color={T.accent} bg={T.accentBg}><Check size={10} /> Confirmé</Badge>
                            : <Badge color={T.warn} bg={T.warnBg}><AlertTriangle size={10} /> En attente</Badge>
                          }
                        </td>

                        {/* Check-in */}
                        <td style={{ padding: '10px 14px' }}>
                          {reg.checked_in
                            ? <Badge color={T.accent} bg={T.accentBg}><CheckCircle2 size={10} /> Présent</Badge>
                            : <Badge color={T.muted} bg="rgba(255,255,255,0.06)"><X size={10} /> Absent</Badge>
                          }
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {!reg.checked_in && (
                              <Btn onClick={() => handleCheckin(reg.id)} variant="accent" size="sm">
                                <Check size={12} /> Check-in
                              </Btn>
                            )}
                            <Btn onClick={() => handleDelete(reg.id)} variant="danger" size="sm">
                              <Trash2 size={12} />
                            </Btn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </GlassCard>

      {/* Spin keyframe */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
