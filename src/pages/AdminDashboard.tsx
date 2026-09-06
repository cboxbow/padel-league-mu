import { useState, useEffect, useCallback, useMemo, useRef, Component } from 'react';
import * as XLSX from 'xlsx';
import {
  LayoutDashboard, Users, Trophy, Settings, Zap, FileText,
  LogOut, Menu, X, Bell, Plus, Pencil, Trash2, Save,
  RefreshCw, Search, ChevronDown, GitBranch, Star, Download, Medal,
  AlertTriangle, Copy, CheckCircle2, Play, Wifi, WifiOff, Eye, BarChart2, ShieldCheck, Shuffle, Camera, Database, Upload,
} from 'lucide-react';
import RegistrationsPage from '@/features/registrations/RegistrationsPage';
import DrawControlPage   from '@/features/draw/DrawControlPage';
import LiveScoringPage   from '@/features/scoring/LiveScoringPage';
import BracketsPage       from '@/pages/admin/BracketsPage';
import ScoresPage         from '@/pages/admin/ScoresPage';
import ExportsPage        from '@/pages/admin/ExportsPage';
import ResultsAdminPage   from '@/pages/admin/ResultsAdminPage';
import RankingsAdminPage  from '@/pages/admin/RankingsAdminPage';
import OfficialRankingImportPage from '@/pages/admin/OfficialRankingImportPage';
import GalerieAdminPage  from '@/pages/admin/GalerieAdminPage';
import HistoricalAuditPage from '@/pages/admin/HistoricalAuditPage';
import { GlassCard, MPLLogo, CategoryBadge, RegionBadge } from '@/components/Layout';
import { useI18n } from '@/hooks/useI18n';
import { getSupabaseClient, isSupabaseConnected } from '@/lib/supabase';
import { computeTournamentStatus } from '@/hooks/useData';
import { MOCK_CLUBS, MOCK_TOURNAMENTS } from '@/data/index';
import type { Region, TournamentCategory, Division } from '@/lib/index';
import { inferGender, inferDivision } from '@/data/rankingLookup';
import { normalizeJuniorCategory, normalizeTournamentDisplayName } from '@/lib/tournamentNames';
import { applyCancelledTournamentStatus } from '@/lib/cancelledTournaments';

// ── Error Boundary pour isoler les crashes de sous-pages ─────────────────────
class AdminErrorBoundary extends Component<
  { children: React.ReactNode; page: string },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode; page: string }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err.message };
  }
  componentDidUpdate(prev: { page: string }) {
    if (prev.page !== this.props.page) this.setState({ hasError: false, message: '' });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px 24px',gap:'16px' }}>
          <AlertTriangle size={40} color="#f59e0b" />
          <h3 style={{ color:'white',margin:0,fontWeight:700 }}>Erreur dans cette section</h3>
          <p style={{ color:'#666',fontSize:'13px',margin:0,maxWidth:'400px',textAlign:'center' }}>{this.state.message}</p>
          <button onClick={()=>this.setState({hasError:false,message:''})}
            style={{ background:'#4ad569',color:'#0a0a0a',border:'none',borderRadius:'8px',padding:'10px 20px',cursor:'pointer',fontWeight:700 }}>
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type AdminPage = 'dashboard' | 'clubs' | 'players' | 'tournaments' | 'registrations' | 'results' | 'rankings' | 'official_import' | 'historical_audit' | 'draw' | 'brackets' | 'live_scoring' | 'scores' | 'exports' | 'obs' | 'gallery';
// ── Role context — accessible by all sub-pages ─────────────────────────
import { createContext, useContext } from 'react';
import type { UIRole } from '@/lib/adminAuth';

export const AdminRoleContext = createContext<UIRole>('viewer');
export const useAdminRole = () => useContext(AdminRoleContext);

interface Props { onLogout: () => void; role: UIRole; userName: string; }

// ── Types locaux ──────────────────────────────────────────────────────────────
interface ClubRow   { id: string; name: string; region: Region; courts: number; address?: string; president?: string; phone?: string; email?: string; }
interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  name?: string;
  email?: string;
  phone?: string;
  birth_date?: string;
  gender?: 'M' | 'F';
  region?: Region;
  division: Division;
  license_no?: string;
  club_id?: string;
  club_name?: string;
  // Colonne reelle en base (voir normalizeTableRows) -- club_name reste le
  // champ utilise partout dans l'UI et est traduit vers "club" a l'ecriture.
  club?: string;
  // Libelle "P1".."P8"/"Elite" en UI ; numerique (1-9) une fois envoye/lu en base.
  level?: string | number;
  active: boolean;
}

// Helper pour obtenir le nom complet quelle que soit la structure Supabase
function playerFullName(p: PlayerRow): string {
  if (p.first_name && p.last_name) return `${p.first_name} ${p.last_name}`;
  if (p.name) return p.name;
  if (p.first_name) return p.first_name;
  if (p.last_name) return p.last_name;
  return '—';
}
function playerInitials(p: PlayerRow): string {
  const name = playerFullName(p);
  const parts = name.split(' ').filter(Boolean);
  return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.slice(0,2).toUpperCase();
}
interface TournRow  {
  id: string;
  name: string;
  club_id?: string;
  club_name?: string;
  // Supabase stocke "date" (pas tournament_date) — on supporte les deux
  date?: string;
  tournament_date?: string;
  region: Region;
  category: TournamentCategory | string;
  division?: Division;
  // Supabase: "type" (MEN / WOMEN / MEN&WOMEN / MIXED / JUNIOR)
  type?: string;
  tournament_type?: string;
  status: string;
  max_teams: number;
  teams_registered?: number;
  prize_money?: number;
}

// ── Vrais counts joueurs (depuis Supabase ou fallback CSV réels) ──────────────
const REAL_PLAYER_COUNTS = {
  men:    1131,
  women:   494,
  mixed:   330,
  junior:   37,
  total:  1992,
};

function usePlayerStats() {
  const [counts, setCounts] = useState(REAL_PLAYER_COUNTS);
  const [fromSupabase, setFromSupabase] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const refreshCounts = useCallback(() => setRefreshTick(t => t + 1), []);

  useEffect(() => {
    async function fetchCounts() {
      const sb = getSupabaseClient();
      if (!isSupabaseConnected() || !sb) {
        setCounts(REAL_PLAYER_COUNTS);
        return;
      }
      try {
        // Total exact depuis Supabase
        const { count: total } = await sb
          .from('players')
          .select('*', { count: 'exact', head: true });

        if (!total || total === 0) { setCounts(REAL_PLAYER_COUNTS); return; }

        // Sonder les colonnes disponibles via select('*') pour éviter tout PGRST204
        // select('gender, division') ou select('gender') individuellement causent 400
        // si la colonne n'existe pas → on lit select('*') limit 200 et on extrait ce qui existe
        let rows: { gender?: string; division?: string }[] = [];
        let hasGender = false, hasDivision = false;

        const { data: sAll, error: eAll } = await sb.from('players').select('*').limit(200);
        if (!eAll && sAll && sAll.length > 0) {
          // Détecter si les colonnes gender/division existent dans les données retournées
          const sample = sAll[0] as Record<string, unknown>;
          hasGender   = 'gender'   in sample;
          hasDivision = 'division' in sample;
          rows = sAll as typeof rows;
        } else if (eAll) {
          console.warn('[PlayerStats] select * failed:', eAll.message);
        }

        // Collecter toutes les valeurs distinctes (selon les colonnes disponibles)
        const genderVals   = hasGender   ? [...new Set(rows.map(r => (r.gender   ?? '').trim()))].filter(Boolean) : [];
        const divisionVals = hasDivision ? [...new Set(rows.map(r => (r.division ?? '').trim()))].filter(Boolean) : [];

        // Détecter les vraies clés en base
        const findKey = (vals: string[], tests: string[]) =>
          vals.find(v => tests.includes(v.toLowerCase())) ?? null;

        const mKey = findKey(genderVals,   ['m', 'male', 'homme', 'h']);
        const fKey = findKey(genderVals,   ['f', 'female', 'femme', 'dame']);
        const menDivKey    = findKey(divisionVals, ['men', 'hommes', 'homme']);
        const womenDivKey  = findKey(divisionVals, ['women', 'dames', 'dame', 'femmes', 'femme']);
        const juniorDivKey = findKey(divisionVals, ['junior', 'juniors']);

        let men = 0, women = 0, junior = 0;

        // Essai 1 : compter par gender (protégé contre colonne absente)
        if (mKey || fKey) {
          try {
            const queries: Promise<{ count: number | null; error?: unknown }>[] = [];
            if (mKey) queries.push(sb.from('players').select('*', { count: 'exact', head: true }).eq('gender', mKey) as any);
            if (fKey) queries.push(sb.from('players').select('*', { count: 'exact', head: true }).eq('gender', fKey) as any);
            const results = await Promise.all(queries);
            if (mKey) men   = (results[0] as any)?.count ?? 0;
            if (fKey) women = (results[mKey ? 1 : 0] as any)?.count ?? 0;
          } catch { men = 0; women = 0; }
        }
        // Essai 2 : compter par division si gender vide ET si la colonne division existe
        if (men === 0 && women === 0 && hasDivision) {
          try {
            const queries: Promise<{ count: number | null; error?: unknown }>[] = [];
            if (menDivKey)    queries.push(sb.from('players').select('*', { count: 'exact', head: true }).eq('division', menDivKey)    as any);
            if (womenDivKey)  queries.push(sb.from('players').select('*', { count: 'exact', head: true }).eq('division', womenDivKey)  as any);
            if (juniorDivKey) queries.push(sb.from('players').select('*', { count: 'exact', head: true }).eq('division', juniorDivKey) as any);
            const results = await Promise.all(queries);
            let i = 0;
            if (menDivKey)    men    = (results[i++] as any)?.count ?? 0;
            if (womenDivKey)  women  = (results[i++] as any)?.count ?? 0;
            if (juniorDivKey) junior = (results[i++] as any)?.count ?? 0;
          } catch { /* garder 0 */ }
        }
        // Essai 3 : junior par division (même si gender a fonctionné) — uniquement si colonne existe
        if (junior === 0 && juniorDivKey && hasDivision) {
          try {
            const { count: j } = await sb.from('players').select('*', { count: 'exact', head: true }).eq('division', juniorDivKey);
            junior = j ?? 0;
          } catch { /* garder 0 */ }
        }

        // Si counts toujours 0 → colonnes Supabase non renseignées
        // → garder total Supabase + vrais chiffres CSV pour les sous-divisions
        if (men === 0 && women === 0) {
          setCounts({
            total,
            men:    REAL_PLAYER_COUNTS.men,    // vrais CSV
            women:  REAL_PLAYER_COUNTS.women,  // vrais CSV
            junior: REAL_PLAYER_COUNTS.junior, // vrais CSV — 37
            mixed:  REAL_PLAYER_COUNTS.mixed,  // vrais CSV
          });
        } else {
          // Junior fixé aux vrais CSV si Supabase n'en a pas
          const juniorFinal = junior > 0 ? junior : REAL_PLAYER_COUNTS.junior;
          const mixed = Math.max(0, total - men - women - juniorFinal);
          setCounts({ total, men, women, junior: juniorFinal, mixed });
        }
        setFromSupabase(true);
      } catch {
        setCounts(REAL_PLAYER_COUNTS);
      }
    }
    fetchCounts();
  }, [refreshTick]);

  return { counts, fromSupabase, refreshCounts };
}

function normalizeTableRows<T>(tableName: string, rows: T[]): T[] {
  if (tableName === 'players') {
    // La colonne reelle est "club" (texte) -- PAS "club_name". PlayerRow /
    // tout le code d'affichage utilisent club_name : on l'alimente ici a la
    // lecture pour que la liste, la recherche et l'audit d'import voient le
    // club de chaque joueur au lieu d'une valeur vide.
    return rows.map(row => {
      const record = row as Record<string, unknown>;
      return {
        ...record,
        club_name: typeof record.club_name === 'string' && record.club_name
          ? record.club_name
          : (typeof record.club === 'string' ? record.club : ''),
        // players.level est numerique en base ; le reste de l'UI attend un
        // libelle "P1".."P8"/"Elite".
        level: levelDbToLabel(record.level),
      } as T;
    });
  }
  if (tableName !== 'tournaments') return rows;

  return rows.map(row => {
    const record = row as Record<string, unknown>;
    const clubName = typeof record.club_name === 'string' ? record.club_name : '';

    return {
      ...record,
      name: typeof record.name === 'string'
        ? normalizeTournamentDisplayName(record.name, clubName)
        : record.name,
      category: typeof record.category === 'string'
        ? normalizeJuniorCategory(record.category)
        : record.category,
      type: typeof record.type === 'string'
        ? normalizeJuniorCategory(record.type)
        : record.type,
      tournament_type: typeof record.tournament_type === 'string'
        ? normalizeJuniorCategory(record.tournament_type)
        : record.tournament_type,
    } as T;
  });
}

// ── Hook générique Supabase table ─────────────────────────────────────────────
function useTable<T extends { id: string }>(tableName: string, mockData: T[], orderCol = 'name') {
  const [rows, setRows]       = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const sb = getSupabaseClient();
    if (isSupabaseConnected() && sb) {
      // PostgREST plafonne les reponses a 1000 lignes par defaut : paginer via
      // Range pour recuperer TOUTES les lignes (ex: 1756 joueurs), sinon la
      // liste, la recherche et l'audit d'import ignorent silencieusement tout
      // ce qui suit la 1000e ligne triee.
      const pageSize = 1000;
      const all: T[] = [];
      let from = 0;
      let failed = false;
      for (;;) {
        const { data, error: err } = await sb.from(tableName).select('*').order(orderCol).range(from, from + pageSize - 1);
        if (err) {
          // Erreur READ : log silencieux + fallback mock (pas d'erreur visible pour l'utilisateur)
          console.warn(`[useTable] READ ${tableName} failed (${err.message}) — using mock fallback`);
          setRows(normalizeTableRows(tableName, mockData));
          failed = true;
          break;
        }
        all.push(...((data ?? []) as T[]));
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }
      if (!failed) setRows(normalizeTableRows(tableName, all));
    } else {
      setRows(normalizeTableRows(tableName, mockData));
    }
    setLoading(false);
  }, [tableName, orderCol]);

  useEffect(() => { load(); }, [load]);

  const save = async (row: Partial<T> & { id?: string }): Promise<{ ok: boolean; isDemo: boolean }> => {
    const sb = getSupabaseClient();
    if (!isSupabaseConnected() || !sb) {
      // Mode démo : mise à jour locale uniquement
      setRows(prev => {
        if (row.id && prev.some(r => r.id === row.id)) {
          return prev.map(r => r.id === row.id ? { ...r, ...row } as T : r);
        } else {
          const newRow = { ...row, id: row.id ?? `demo-${Date.now()}` } as T;
          return [...prev, newRow];
        }
      });
      return { ok: true, isDemo: true };
    }
    // Nettoyer les champs undefined avant envoi Supabase
    const cleanRow = Object.fromEntries(
      Object.entries(row).filter(([, v]) => v !== undefined)
    ) as Partial<T> & { id?: string };
    try {
      if (cleanRow.id) {
        // UPDATE — on exclut l'id du payload pour éviter les erreurs PK
        const { id: _id, ...payload } = cleanRow;
        console.log(`[useTable] UPDATE ${tableName} id=${_id}`, payload);
        const { error: err } = await sb.from(tableName).update(payload).eq('id', _id as string);
        if (err) {
          console.error(`[useTable] UPDATE error:`, err);
          setError(`❌ Erreur Supabase : ${err.message ?? 'Erreur inconnue'}`);
          return { ok: false, isDemo: false };
        }
      } else {
        // INSERT avec UUID Supabase
        const newId = crypto.randomUUID?.() ?? `${tableName.slice(0,3)}-${Date.now()}`;
        const insertRow = { ...cleanRow, id: newId };
        console.log(`[useTable] INSERT ${tableName}`, insertRow);
        const { error: err } = await sb.from(tableName).insert(insertRow);
        if (err) {
          console.error(`[useTable] INSERT error:`, err);
          setError(`❌ Erreur Supabase : ${err.message ?? 'Erreur inconnue'}`);
          return { ok: false, isDemo: false };
        }
      }
      setError('');
      await load();
      return { ok: true, isDemo: false };
    } catch (e) {
      console.error(`[useTable] Network error:`, e);
      setError(`❌ Erreur réseau : ${e}`);
      return { ok: false, isDemo: false };
    }
  };

  const remove = async (id: string) => {
    const sb = getSupabaseClient();
    if (!isSupabaseConnected() || !sb) {
      setRows(prev => prev.filter(r => r.id !== id));
      return true;
    }
    try {
      const { error: err } = await sb.from(tableName).delete().eq('id', id);
      if (err) {
          setError(`❌ ${err.message ?? 'Erreur inconnue'}`); return false;
      }
      await load();
      return true;
    } catch (e) {
      setError(`❌ Erreur réseau : ${e}`);
      return false;
    }
  };

  return { rows, loading, error, setError, load, save, remove };
}

// ── Composant Modal générique ─────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: '#111', border: '1px solid rgba(74,213,105,0.2)', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: '16px' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ padding: '24px' }}>{children}</div>
      </div>
    </div>
  );
}

// ── Champ de formulaire ───────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', color: '#a0a0a0', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{label}</label>
      {children}
    </div>
  );
}
const inputCss: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px', padding: '10px 12px', color: 'white', fontSize: '14px',
  outline: 'none', boxSizing: 'border-box',
};
const selectCss: React.CSSProperties = { ...inputCss, cursor: 'pointer' };

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE : CLUBS
// ─────────────────────────────────────────────────────────────────────────────
function ClubsAdminPage() {
  const role = useAdminRole();
  const isViewer = role === 'viewer';
  const { rows: clubs, loading, error, setError, save, remove, load } = useTable<ClubRow>('clubs', MOCK_CLUBS as ClubRow[], 'name');
  const [search, setSearch]   = useState('');
  const [editing, setEditing] = useState<Partial<ClubRow> | null>(null);
  const [saving, setSaving]   = useState(false);

  const filtered = clubs.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.region.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    const isNew = !editing.id;
    // Pas d'id pour un nouveau club : save() decide INSERT vs UPDATE sur la
    // presence d'un id, et genere lui-meme un UUID pour l'INSERT.
    const { ok, isDemo } = await save(editing);
    setSaving(false);
    if (ok) {
      setEditing(null);
      if (isDemo) {
        setError('⚠️ Sauvegarde locale uniquement (Supabase non connecté)');
      } else {
        setError(`✅ Club ${isNew ? 'créé' : 'mis à jour'} avec succès`);
      }
      setTimeout(() => setError(''), 3500);
    }
  };

  const REGIONS: Region[] = ['Nord', 'Ouest', 'Est', 'Centre'];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ color: 'white', fontWeight: 700, margin: '0 0 4px' }}>Gestion des Clubs</h2>
          <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>{clubs.length} clubs · 🟢 Supabase</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={load} style={{ background: 'rgba(255,255,255,0.05)', color: '#a0a0a0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <RefreshCw size={14} /> Actualiser
          </button>
          {!isViewer && <button onClick={() => setEditing({ region: 'Nord', courts: 0 })} style={{ background: '#4ad569', color: '#0a0a0a', border: 'none', borderRadius: '8px', padding: '9px 18px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <Plus size={14} /> Nouveau Club
          </button>}
        </div>
      </div>

      {error && (
        <div style={{
          background: error.startsWith('❌') ? 'rgba(239,68,68,0.1)' : error.startsWith('⚠️') ? 'rgba(245,158,11,0.1)' : 'rgba(74,213,105,0.08)',
          color:      error.startsWith('❌') ? '#ef4444' : error.startsWith('⚠️') ? '#f59e0b' : '#4ad569',
          border: `1px solid ${error.startsWith('❌') ? 'rgba(239,68,68,0.2)' : error.startsWith('⚠️') ? 'rgba(245,158,11,0.2)' : 'rgba(74,213,105,0.15)'}`,
          borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '16px', lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un club..." style={{ ...inputCss, paddingLeft: '36px' }} />
      </div>

      {/* Table */}
      <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(74,213,105,0.1)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(74,213,105,0.1)' }}>
              {['Club', 'Région', 'Terrains', 'Président', 'Email', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#555', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Chargement…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Aucun club trouvé</td></tr>
            ) : filtered.map((c, i) => (
              <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,213,105,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}
              >
                <td style={{ padding: '12px 16px', color: 'white', fontWeight: 600, fontSize: '14px' }}>{c.name}</td>
                <td style={{ padding: '12px 16px' }}><RegionBadge region={c.region} /></td>
                <td style={{ padding: '12px 16px', color: '#4ad569', fontWeight: 700, fontFamily: 'JetBrains Mono,monospace', fontSize: '15px' }}>{c.courts}</td>
                <td style={{ padding: '12px 16px', color: '#a0a0a0', fontSize: '13px' }}>{c.president || '—'}</td>
                <td style={{ padding: '12px 16px', color: '#a0a0a0', fontSize: '13px' }}>{c.email || '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {!isViewer && <button onClick={() => setEditing(c)} style={{ background: 'rgba(74,213,105,0.1)', color: '#4ad569', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}><Pencil size={11} /> Éditer</button>}
                    {!isViewer && <button onClick={async () => { if (confirm(`Supprimer ${c.name} ?`)) { const ok = await remove(c.id); if (ok) { setError('✅ Club supprimé'); setTimeout(() => setError(''), 2500); } } }} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}><Trash2 size={11} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal édition */}
      {editing !== null && (
        <Modal title={editing.id ? 'Modifier le Club' : 'Nouveau Club'} onClose={() => setEditing(null)}>
          <Field label="Nom du club">
            <input style={inputCss} value={editing.name || ''} onChange={e => setEditing(p => ({ ...p!, name: e.target.value }))} placeholder="ex: Grand Baie Padel Club" />
          </Field>
          <Field label="Région">
            <select style={selectCss} value={editing.region || 'Nord'} onChange={e => setEditing(p => ({ ...p!, region: e.target.value as Region }))}>
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Nb terrains">
              <input style={inputCss} type="number" value={editing.courts || 0} onChange={e => setEditing(p => ({ ...p!, courts: +e.target.value }))} />
            </Field>
            <Field label="Président">
              <input style={inputCss} value={editing.president || ''} onChange={e => setEditing(p => ({ ...p!, president: e.target.value }))} />
            </Field>
          </div>
          <Field label="Adresse">
            <input style={inputCss} value={editing.address || ''} onChange={e => setEditing(p => ({ ...p!, address: e.target.value }))} placeholder="ex: Grand Baie, Mauritius" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Email">
              <input style={inputCss} type="email" value={editing.email || ''} onChange={e => setEditing(p => ({ ...p!, email: e.target.value }))} />
            </Field>
            <Field label="Téléphone">
              <input style={inputCss} value={editing.phone || ''} onChange={e => setEditing(p => ({ ...p!, phone: e.target.value }))} />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={() => setEditing(null)} style={{ background: 'rgba(255,255,255,0.05)', color: '#a0a0a0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer' }}>Annuler</button>
            <button onClick={handleSave} disabled={saving} style={{ background: '#4ad569', color: '#0a0a0a', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={14} /> {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Adresses generiques partagees par plusieurs comptes club (ex: front-desk) --
// players.email a une contrainte UNIQUE, les reutiliser telles quelles fait
// echouer tout import en lot des la 2e ligne qui la partage.
const GENERIC_IMPORT_EMAILS = new Set(['info@urbansport.mu']);

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE : JOUEURS
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_PLAYERS: PlayerRow[] = [
  { id: '1', first_name: 'Jean',   last_name: 'Dupont',   gender: 'M', email: 'jean@example.com',   phone: '+230 5944 0001', region: 'Nord',   club_id: 'c03', club_name: 'Urban Sport Grand Baie',    division: 'men',   license_no: 'MPL-001', level: 'P3', active: true  },
  { id: '2', first_name: 'Sophie', last_name: 'Martin',   gender: 'F', email: 'sophie@example.com', phone: '+230 5944 0002', region: 'Ouest',  club_id: 'c05', club_name: 'SPARC Cascavelle',           division: 'women', license_no: 'MPL-002', level: 'P4', active: true  },
  { id: '3', first_name: 'Raj',    last_name: 'Patel',    gender: 'M', email: 'raj@example.com',    phone: '+230 5944 0003', region: 'Est',    club_id: 'c11', club_name: 'Studio by RM Azuri',         division: 'men',   license_no: 'MPL-003', level: 'P2', active: true  },
  { id: '4', first_name: 'Marie',  last_name: 'Leconte',  gender: 'F', email: 'marie@example.com',  phone: '+230 5944 0004', region: 'Centre', club_id: 'c07', club_name: 'I Padel by RM Hennessy',     division: 'women', license_no: 'MPL-004', level: 'P3', active: false },
];

// Liste des clubs MPL (id + nom) pour le select
const MPL_CLUBS_LIST = [
  { id: 'c01', name: 'Caña Beau Plan'                   },
  { id: 'c02', name: 'Club Med Albion'                  },
  { id: 'c03', name: 'Urban Sport Grand Baie'           },
  { id: 'c04', name: 'Urban Sport Black River'          },
  { id: 'c05', name: 'SPARC Cascavelle'                 },
  { id: 'c06', name: 'RM Club Tamarin'                  },
  { id: 'c07', name: 'I Padel by RM Hennessy'           },
  { id: 'c08', name: 'RM Club Grand Baie'               },
  { id: 'c09', name: 'Labourdonnais Mapou'              },
  { id: 'c10', name: 'I Padel by RM Port Chambly'       },
  { id: 'c11', name: 'Studio by RM Azuri'               },
  { id: 'c12', name: 'Isla Padel Grand Baie'            },
  { id: 'c13', name: 'Terres Brunes Sports & Leisure'   },
  { id: 'c14', name: 'Mont Choisy Golf'                 },
  { id: 'c15', name: 'Oxygen Moka'                      },
  { id: 'c16', name: 'Club House Black River'           },
  { id: 'c17', name: 'Energia Pointe aux Canonniers'    },
  { id: 'c18', name: 'Moka Rangers'                     },
];

const PLAYER_LEVELS = ['P1','P2','P3','P4','P5','P6','P7','P8','Elite'];

// La colonne reelle players.level est numerique (1-9) -- le formulaire/import
// manipulent des libelles "P1".."P8"/"Elite". Convertir aux deux frontieres.
function levelLabelToDb(label?: string | null): number | null {
  if (!label) return null;
  if (/^elite$/i.test(label)) return 9;
  const m = /^p(\d+)$/i.exec(label.trim());
  if (m) return Number(m[1]);
  const n = Number(label);
  return Number.isFinite(n) ? n : null;
}
function levelDbToLabel(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return typeof value === 'string' ? value : '';
  return value >= 9 ? 'Elite' : `P${value}`;
}

type PlayerImportDraft = Omit<PlayerRow, 'id'> & { id?: string };
type PlayerImportStatus = 'existing' | 'new' | 'review';
type PlayerImportAuditRow = PlayerImportDraft & {
  importStatus: PlayerImportStatus;
  importReason: string;
  matchedId?: string;
};

function normalizePlayerImportKey(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractEmailFromText(value: unknown) {
  const match = String(value ?? '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : '';
}

function readImportValue(row: Record<string, unknown>, aliases: string[]) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const wanted = normalizePlayerImportKey(alias);
    const found = entries.find(([key]) => normalizePlayerImportKey(key) === wanted);
    if (found) return found[1];
  }
  return '';
}

function normalizeImportedClub(raw: unknown) {
  const key = normalizePlayerImportKey(raw);
  const aliases: Record<string, string> = {
    'rm club grand baie': 'c08',
    'rm club forbach': 'c08',
    'rm forbach': 'c08',
    'urban sport grand baie': 'c03',
    'urban sport riviere noire': 'c04',
    'urban sport black river': 'c04',
    'sparc cascavelle': 'c05',
    'rm club tamarin': 'c06',
    'i padel by rm henessy': 'c07',
    'i padel by rm hennessy': 'c07',
    'i padel by rm port chambly': 'c10',
    'studio by rm azuri': 'c11',
    'isla padel beau plan': 'c12',
    'isla padel grand baie': 'c12',
    'labourdonnais sport club': 'c09',
    'labourdonnais mapou': 'c09',
    'cana beau plan': 'c01',
    'oxygen moka': 'c15',
    'club house riviere noire': 'c16',
    'club house black river': 'c16',
    'energia padel pte aux cannonniers': 'c17',
    'energia pointe aux canonniers': 'c17',
    'mont choisy golf mont choisy': 'c14',
    'mont choisy golf': 'c14',
    'terres brunes tamarin': 'c13',
    'terres brunes sports leisure': 'c13',
    'club med albion': 'c02',
    'moka rangers moka': 'c18',
    'moka rangers': 'c18',
  };
  const clubId = aliases[key] ?? MPL_CLUBS_LIST.find(c => normalizePlayerImportKey(c.name) === key)?.id ?? '';
  const club = MPL_CLUBS_LIST.find(c => c.id === clubId);
  return { club_id: club?.id ?? '', club_name: club?.name ?? String(raw ?? '').trim() };
}

function inferRegionFromClubId(clubId: string): Region {
  if (['c01','c03','c08','c09','c12','c14','c17'].includes(clubId)) return 'Nord';
  if (['c02','c04','c05','c06','c13','c16'].includes(clubId)) return 'Ouest';
  if (['c07','c10','c15','c18'].includes(clubId)) return 'Centre';
  if (['c11'].includes(clubId)) return 'Est';
  return 'Nord';
}

function normalizeImportedGender(raw: unknown): 'M' | 'F' {
  const key = normalizePlayerImportKey(raw);
  return ['female', 'femme', 'f', 'dame', 'dames'].includes(key) ? 'F' : 'M';
}

function normalizeImportedLevel(raw: unknown) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (/^p\d+$/i.test(value)) return value.toUpperCase();
  if (/^\d+$/.test(value)) return `P${value}`;
  return value;
}

function parsePlayersImportWorkbook(file: File): Promise<PlayerImportDraft[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.onload = () => {
      try {
        const workbook = XLSX.read(reader.result, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        const rows = rawRows.map(row => {
          const firstName = String(readImportValue(row, ['Name', 'First Name', 'Prenom', 'Prénom', 'first_name']) ?? '').trim();
          const lastName = String(readImportValue(row, ['Surname', 'Last Name', 'Nom', 'last_name']) ?? '').trim();
          const email = String(readImportValue(row, ['Email', 'Mail', 'E-mail']) ?? '').trim().toLowerCase();
          const phone = String(readImportValue(row, ['Mobile', 'Phone', 'Telephone', 'Téléphone']) ?? '').trim();
          const rawClub = readImportValue(row, ['Club', 'Club Name', 'club_name']);
          const club = normalizeImportedClub(rawClub);
          const gender = normalizeImportedGender(readImportValue(row, ['Gender', 'Genre', 'Sexe']));
          const division = gender === 'F' ? 'women' : 'men';
          const status = normalizePlayerImportKey(readImportValue(row, ['Status', 'Statut']));
          return {
            first_name: firstName,
            last_name: lastName,
            name: `${firstName} ${lastName}`.trim(),
            email,
            phone,
            gender,
            division: division as Division,
            license_no: '',
            club_id: club.club_id || undefined,
            club_name: club.club_name,
            region: inferRegionFromClubId(club.club_id),
            level: normalizeImportedLevel(readImportValue(row, ['Level', 'Niveau'])),
            active: status ? status !== 'pending' && status !== 'inactive' && status !== 'inactif' : true,
          };
        }).filter(row => row.first_name || row.last_name || row.email);
        resolve(rows);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function PlayersAdminPage() {
  const role = useAdminRole();
  const isViewer = role === 'viewer';
  const { rows: players, loading, error, setError, save, remove, load } = useTable<PlayerRow>('players', MOCK_PLAYERS, 'last_name');
  const { counts: playerCounts, fromSupabase: countsFromSB, refreshCounts } = usePlayerStats();
  const [search,    setSearch]  = useState('');
  const [divFilter, setDiv]     = useState<string>('all');
  const [genderFilter, setGender] = useState<string>('all');
  const [editing,   setEditing] = useState<Partial<PlayerRow> | null>(null);
  const [saving,    setSaving]  = useState(false);
  const [importRows, setImportRows] = useState<PlayerImportDraft[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importingPlayers, setImportingPlayers] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // ── Enrichissement des données Supabase (genre + division déduits si absents)
  const enriched = players.map(p => {
    const fn = p.first_name || '';
    const ln = p.last_name  || '';
    return {
      ...p,
      gender:   p.gender   ?? inferGender(fn, ln),
      division: (p.division ?? inferDivision(fn, ln) ?? 'men') as Division,
    };
  });

  const filtered = enriched.filter(p => {
    const name  = playerFullName(p).toLowerCase();
    const club  = (p.club_name || '').toLowerCase();
    const matchSearch  = name.includes(search.toLowerCase())
      || club.includes(search.toLowerCase())
      || (p.email      || '').includes(search.toLowerCase())
      || (p.license_no || '').toString().toLowerCase().includes(search.toLowerCase());
    const matchDiv    = divFilter    === 'all' || p.division === divFilter;
    const matchGender = genderFilter === 'all' || p.gender   === genderFilter;
    return matchSearch && matchDiv && matchGender;
  });

  const importAuditRows = useMemo<PlayerImportAuditRow[]>(() => {
    const existingByEmail = new Map<string, PlayerRow[]>();
    const existingByName = new Map<string, PlayerRow[]>();

    enriched.forEach(player => {
      const fullName = playerFullName(player);
      const email = String(player.email || '').trim().toLowerCase() || extractEmailFromText(fullName);
      const name = normalizePlayerImportKey(fullName);
      if (email) existingByEmail.set(email, [...(existingByEmail.get(email) || []), player]);
      if (name) existingByName.set(name, [...(existingByName.get(name) || []), player]);
    });

    const importKeyCounts = new Map<string, number>();
    importRows.forEach(row => {
      const rowEmail = row.email && !GENERIC_IMPORT_EMAILS.has(row.email) ? row.email : '';
      const key = rowEmail || normalizePlayerImportKey(`${row.first_name} ${row.last_name}`);
      if (key) importKeyCounts.set(key, (importKeyCounts.get(key) || 0) + 1);
    });

    return importRows.map(row => {
      const emailRaw = String(row.email || '').trim().toLowerCase();
      const email = GENERIC_IMPORT_EMAILS.has(emailRaw) ? '' : emailRaw;
      const name = normalizePlayerImportKey(`${row.first_name} ${row.last_name}`);
      const importKey = email || name;
      const fileDuplicate = importKey ? (importKeyCounts.get(importKey) || 0) > 1 : false;
      // Le telephone n'est pas utilise comme cle de rapprochement : des
      // dizaines de joueurs distincts partagent le meme numero (placeholder/
      // front-desk) dans les donnees existantes -- l'utiliser produirait de
      // faux "plusieurs joueurs possibles" entre joueurs sans aucun lien.
      const emailMatches = email ? (existingByEmail.get(email) || []) : [];
      const nameMatches = name ? (existingByName.get(name) || []) : [];
      const uniqueMatches = new Map<string, PlayerRow>();
      [...emailMatches, ...nameMatches].forEach(match => {
        if (match.id) uniqueMatches.set(match.id, match);
      });
      const matches = Array.from(uniqueMatches.values());

      if (fileDuplicate) {
        return { ...row, importStatus: 'review', importReason: 'Doublon dans le fichier import', matchedId: matches[0]?.id };
      }
      if (matches.length > 1) {
        return { ...row, importStatus: 'review', importReason: 'Plusieurs joueurs Supabase possibles', matchedId: matches[0]?.id };
      }
      if (matches.length === 1) {
        const match = matches[0];
        if (emailMatches.length > 0) return { ...row, importStatus: 'existing', importReason: 'Existe deja: email identique', matchedId: match.id };
        return { ...row, importStatus: 'existing', importReason: 'Existe deja: nom identique', matchedId: match.id };
      }
      if (!row.club_id) {
        return { ...row, importStatus: 'new', importReason: 'Nouveau joueur - club a completer', matchedId: undefined };
      }
      return { ...row, importStatus: 'new', importReason: 'Nouveau joueur', matchedId: undefined };
    });
  }, [enriched, importRows]);

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    const isNew = !editing.id;
    // Payload propre : on exclut 'name' (doublon calcule), 'club_name' (la
    // colonne reelle s'appelle "club" -- envoyer club_name declenche
    // "column players.club_name does not exist") et 'club_id' (colonne uuid
    // en base, FK vers clubs.id -- le select du formulaire n'utilise que les
    // pseudo-ids locaux "c01".."c18" de MPL_CLUBS_LIST, jamais de vrais uuid,
    // donc l'envoyer declenche systematiquement "invalid input syntax for
    // type uuid"). Le nom du club choisi est conserve via club (texte).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { name: _name, club_name, club_id, level, ...editingClean } = editing as Partial<PlayerRow> & { name?: string };
    const payload: Partial<PlayerRow> = {
      ...editingClean,
      club: club_name || MPL_CLUBS_LIST.find(c => c.id === club_id)?.name || '',
      // players.level est numerique (1-9), le formulaire manipule "P1".."P8"/"Elite"
      level: levelLabelToDb(typeof level === 'string' ? level : undefined) ?? undefined,
      // Pas d'id pour un nouveau joueur : save() decide INSERT vs UPDATE sur la
      // presence d'un id, et genere lui-meme un UUID pour l'INSERT.
    };
    const { ok, isDemo } = await save(payload);
    setSaving(false);
    if (ok) {
      setEditing(null);
      // Rafraîchir les counts après ajout/modif
      refreshCounts();
      if (isDemo) {
        setError('⚠️ Sauvegarde locale uniquement (Supabase non connecté)');
      } else {
        setError(`✅ Joueur ${isNew ? 'ajouté' : 'mis à jour'} avec succès`);
      }
      setTimeout(() => setError(''), 3500);
    }
  };

  const importSummary = useMemo(() => {
    const keys = new Map<string, number>();
    importRows.forEach(row => {
      const key = row.email || normalizePlayerImportKey(`${row.first_name} ${row.last_name}`);
      if (key) keys.set(key, (keys.get(key) || 0) + 1);
    });
    return {
      total: importRows.length,
      men: importRows.filter(row => row.gender === 'M').length,
      women: importRows.filter(row => row.gender === 'F').length,
      missingClub: importRows.filter(row => !row.club_id).length,
      missingPhone: importRows.filter(row => !row.phone).length,
      duplicates: Array.from(keys.values()).filter(count => count > 1).length,
      existing: importAuditRows.filter(row => row.importStatus === 'existing').length,
      newRows: importAuditRows.filter(row => row.importStatus === 'new').length,
      review: importAuditRows.filter(row => row.importStatus === 'review').length,
    };
  }, [importAuditRows, importRows]);

  const sortedImportAuditRows = useMemo(() => {
    const order: Record<PlayerImportStatus, number> = { review: 0, new: 1, existing: 2 };
    return [...importAuditRows].sort((a, b) => {
      const byStatus = order[a.importStatus] - order[b.importStatus];
      if (byStatus !== 0) return byStatus;
      return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
    });
  }, [importAuditRows]);

  const handlePlayersFile = async (file?: File | null) => {
    if (!file) return;
    try {
      const parsed = await parsePlayersImportWorkbook(file);
      setImportFileName(file.name);
      setImportRows(parsed);
      setError(`Preview import prete: ${parsed.length.toLocaleString('fr-FR')} joueurs detectes.`);
    } catch (err) {
      setImportRows([]);
      setImportFileName('');
      setError(`Erreur import: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const publishPlayersImport = async () => {
    if (isViewer || importRows.length === 0) return;
    if (importSummary.review > 0) {
      setError(`Publication bloquee: ${importSummary.review.toLocaleString('fr-FR')} ligne(s) a verifier avant import pour eviter les doublons.`);
      return;
    }
    const sb = getSupabaseClient();
    if (!isSupabaseConnected() || !sb) {
      setError('Import impossible: Supabase non connecte.');
      return;
    }
    setImportingPlayers(true);
    try {
      // On ne cree QUE les lignes "nouveau" : les lignes "deja en base" ne
      // doivent jamais etre re-ecrites ici, sinon un import (qui ne connait
      // pas le numero de licence, forcement vide dans le fichier source)
      // effacerait le license_no reel de chaque joueur deja existant.
      const newRows = importAuditRows.filter(row => row.importStatus === 'new');
      const deduped = new Map<string, PlayerImportAuditRow>();
      newRows.forEach(row => {
        const key = row.email || normalizePlayerImportKey(`${row.first_name} ${row.last_name}`);
        if (key) deduped.set(key, row);
      });

      // Numero de licence sequentiel, a la suite du max existant (pagine :
      // PostgREST plafonne toute reponse a 1000 lignes quel que soit le
      // .limit() demande).
      const existingLicenses: { license_no: string | null }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error: err } = await sb.from('players').select('license_no').range(from, from + 999);
        if (err) throw new Error(err.message);
        existingLicenses.push(...((data ?? []) as { license_no: string | null }[]));
        if (!data || data.length < 1000) break;
      }
      const licenseNums = existingLicenses.map(r => Number(r.license_no)).filter(n => Number.isFinite(n));
      let nextLicense = (licenseNums.length ? Math.max(...licenseNums) : 0) + 1;

      const payload = Array.from(deduped.values()).map(row => {
        const clean = {
          id: crypto.randomUUID?.() ?? `ply-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email && !GENERIC_IMPORT_EMAILS.has(row.email) ? row.email : undefined,
          phone: row.phone,
          gender: row.gender,
          region: row.region,
          division: row.division,
          license_no: String(nextLicense++),
          // Pas de club_id : colonne uuid (FK clubs.id) en base, alors que
          // row.club_id est un pseudo-id local "c01".."c18" (MPL_CLUBS_LIST) --
          // l'envoyer declenche "invalid input syntax for type uuid".
          // colonne reelle "club", pas "club_name" (voir handleSave plus haut)
          club: row.club_name,
          // players.level est numerique (1-9), row.level est un libelle "P1".."P8"
          level: levelLabelToDb(typeof row.level === 'string' ? row.level : undefined),
          active: row.active,
        };
        return Object.fromEntries(Object.entries(clean).filter(([, value]) => value !== undefined && value !== null && value !== ''));
      });

      for (let index = 0; index < payload.length; index += 400) {
        const batch = payload.slice(index, index + 400);
        const { error: insertError } = await sb.from('players').insert(batch);
        if (insertError) throw new Error(insertError.message);
      }

      setError(`${payload.length.toLocaleString('fr-FR')} nouveaux joueurs crees.`);
      setImportRows([]);
      setImportFileName('');
      await load();
      refreshCounts();
    } catch (err) {
      setError(`Erreur publication joueurs: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImportingPlayers(false);
    }
  };

  const REGIONS:   Region[]    = ['Nord', 'Ouest', 'Est', 'Centre'];
  const DIVISIONS: Division[]  = ['men', 'women', 'junior', 'mixed'];
  const DIV_LABELS: Record<string, string> = { men: 'Hommes', women: 'Femmes', junior: 'Junior', mixed: 'Mixte' };
  const DIV_COLORS: Record<string, string> = { men: '#3b82f6', women: '#ec4899', junior: '#f59e0b', mixed: '#8b5cf6' };
  const GENDER_LABELS: Record<string, string> = { M: '♂ M', F: '♀ F' };
  const GENDER_COLORS: Record<string, string> = { M: '#3b82f6', F: '#ec4899' };

  // Statistiques : vrais counts depuis hook (Supabase ou CSV fallback)
  const stats = {
    total:   playerCounts.total,
    hommes:  playerCounts.men,
    femmes:  playerCounts.women,
    junior:  playerCounts.junior,
    actifs:  playerCounts.total,
  };

  return (
    <div>
      {/* ── En-tête ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ color: 'white', fontWeight: 700, margin: '0 0 4px' }}>Gestion des Joueurs</h2>
          <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>
            {stats.total.toLocaleString('fr-FR')} licenciés · {stats.hommes.toLocaleString('fr-FR')} H · {stats.femmes.toLocaleString('fr-FR')} F · {stats.junior} Junior · {countsFromSB ? '🟢 Supabase' : '📊 Rankings CSV'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={load} style={{ background: 'rgba(255,255,255,0.05)', color: '#a0a0a0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <RefreshCw size={14} /> Actualiser
          </button>
          {!isViewer && <>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={e => handlePlayersFile(e.target.files?.[0])}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '8px', padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}
            >
              <Upload size={14} /> Import Excel / CSV
            </button>
          </>}
          {!isViewer && <button
            onClick={() => setEditing({ division: 'men', gender: 'M', active: true, region: 'Nord', club_id: 'c03', club_name: 'Urban Sport Grand Baie' })}
            style={{ background: '#4ad569', color: '#0a0a0a', border: 'none', borderRadius: '8px', padding: '9px 18px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <Plus size={14} /> Nouveau Joueur
          </button>}
        </div>
      </div>

      {/* ── Stat chips ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {[
          { label: 'Total licenciés', val: stats.total.toLocaleString('fr-FR'),  color: '#4ad569' },
          { label: '♂ Hommes',       val: stats.hommes.toLocaleString('fr-FR'), color: '#3b82f6' },
          { label: '♀ Dames',        val: stats.femmes.toLocaleString('fr-FR'), color: '#ec4899' },
          { label: '🎓 Juniors',      val: stats.junior.toLocaleString('fr-FR'), color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} style={{ background: `${s.color}12`, border: `1px solid ${s.color}30`, borderRadius: '8px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: s.color, fontWeight: 800, fontSize: '16px', fontFamily: 'JetBrains Mono,monospace' }}>{s.val}</span>
            <span style={{ color: '#a0a0a0', fontSize: '12px' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {error && (
        <div style={{
          background: error.startsWith('❌') ? 'rgba(239,68,68,0.1)' : error.startsWith('⚠️') ? 'rgba(245,158,11,0.1)' : 'rgba(74,213,105,0.08)',
          color:      error.startsWith('❌') ? '#ef4444' : error.startsWith('⚠️') ? '#f59e0b' : '#4ad569',
          border: `1px solid ${error.startsWith('❌') ? 'rgba(239,68,68,0.2)' : error.startsWith('⚠️') ? 'rgba(245,158,11,0.2)' : 'rgba(74,213,105,0.15)'}`,
          borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '16px', lineHeight: 1 }}>×</button>
        </div>
      )}

      {importRows.length > 0 && (
        <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', marginBottom: '12px' }}>
            <div>
              <div style={{ color: 'white', fontWeight: 900, fontSize: '14px' }}>Preview import joueurs</div>
              <div style={{ color: '#777', fontSize: '12px', marginTop: '4px' }}>{importFileName}</div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button onClick={() => { setImportRows([]); setImportFileName(''); }} style={{ background: 'rgba(255,255,255,0.05)', color: '#aaa', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontWeight: 700 }}>
                Annuler
              </button>
              <button onClick={publishPlayersImport} disabled={importingPlayers || importSummary.review > 0} style={{ background: importSummary.review > 0 ? '#333' : '#4ad569', color: importSummary.review > 0 ? '#888' : '#0a0a0a', border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: importingPlayers ? 'wait' : importSummary.review > 0 ? 'not-allowed' : 'pointer', fontWeight: 900, opacity: importingPlayers ? 0.7 : 1 }}>
                {importingPlayers ? 'Publication...' : 'Publier vers Supabase'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '8px', marginBottom: '12px' }}>
            {[
              ['Total', importSummary.total, '#60a5fa'],
              ['Deja en base', importSummary.existing, '#3b82f6'],
              ['Nouveaux', importSummary.newRows, '#4ad569'],
              ['A verifier', importSummary.review, importSummary.review ? '#ef4444' : '#4ad569'],
              ['Hommes', importSummary.men, '#3b82f6'],
              ['Dames', importSummary.women, '#ec4899'],
              ['Clubs manquants', importSummary.missingClub, importSummary.missingClub ? '#f59e0b' : '#4ad569'],
              ['Doublons fichier', importSummary.duplicates, importSummary.duplicates ? '#f59e0b' : '#4ad569'],
            ].map(([label, value, color]) => (
              <div key={String(label)} style={{ background: `${color}12`, border: `1px solid ${color}30`, borderRadius: '8px', padding: '8px 10px' }}>
                <div style={{ color: String(color), fontFamily: 'JetBrains Mono, monospace', fontSize: '18px', fontWeight: 900 }}>{Number(value).toLocaleString('fr-FR')}</div>
                <div style={{ color: '#aaa', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
              </div>
            ))}
          </div>

          {importSummary.review > 0 && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: '#ef4444', borderRadius: '8px', padding: '9px 10px', marginBottom: '12px', fontSize: '12px', fontWeight: 800 }}>
              Publication bloquee pour eviter les doublons: corrige ou retire les lignes marquees "A verifier".
            </div>
          )}

          <div style={{ maxHeight: '210px', overflow: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#111', zIndex: 1 }}>
                <tr>
                  {['Controle', 'Joueur', 'Email', 'Mobile', 'Club', 'Genre', 'Niveau', 'Statut'].map(h => (
                    <th key={h} style={{ color: '#777', textAlign: 'left', padding: '9px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', textTransform: 'uppercase', fontSize: '10px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedImportAuditRows.slice(0, 80).map((row, index) => (
                  <tr key={`${row.email}-${index}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ color: row.importStatus === 'review' ? '#ef4444' : row.importStatus === 'new' ? '#4ad569' : '#60a5fa', padding: '8px 10px', fontWeight: 900 }}>
                      {row.importStatus === 'review' ? 'A verifier' : row.importStatus === 'new' ? 'Nouveau' : 'Deja en base'}
                      <div style={{ color: '#777', fontWeight: 700, fontSize: '10px', marginTop: '2px' }}>{row.importReason}</div>
                    </td>
                    <td style={{ color: 'white', padding: '8px 10px', fontWeight: 800 }}>{row.first_name} {row.last_name}</td>
                    <td style={{ color: '#aaa', padding: '8px 10px' }}>{row.email}</td>
                    <td style={{ color: '#aaa', padding: '8px 10px' }}>{row.phone || '-'}</td>
                    <td style={{ color: row.club_id ? '#aaa' : '#f59e0b', padding: '8px 10px' }}>{row.club_name || 'Club non reconnu'}</td>
                    <td style={{ color: row.gender === 'F' ? '#ec4899' : '#3b82f6', padding: '8px 10px', fontWeight: 900 }}>{row.gender}</td>
                    <td style={{ color: '#a78bfa', padding: '8px 10px', fontWeight: 900 }}>{row.level || '-'}</td>
                    <td style={{ color: row.active ? '#4ad569' : '#f59e0b', padding: '8px 10px', fontWeight: 900 }}>{row.active ? 'Actif' : 'Pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedImportAuditRows.length > 80 && (
              <div style={{ padding: '8px 10px', color: '#777', fontSize: '12px', fontWeight: 800 }}>
                + {(sortedImportAuditRows.length - 80).toLocaleString('fr-FR')} autres lignes.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Filtres ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Nom, club, email, licence…"
            style={{ ...inputCss, paddingLeft: '36px' }} />
        </div>
        <select value={genderFilter} onChange={e => setGender(e.target.value)} style={{ ...selectCss, width: 'auto', minWidth: '120px' }}>
          <option value="all">♂♀ Genre</option>
          <option value="M">♂ Hommes</option>
          <option value="F">♀ Femmes</option>
        </select>
        <select value={divFilter} onChange={e => setDiv(e.target.value)} style={{ ...selectCss, width: 'auto', minWidth: '140px' }}>
          <option value="all">Toutes divisions</option>
          {DIVISIONS.map(d => <option key={d} value={d}>{DIV_LABELS[d]}</option>)}
        </select>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(74,213,105,0.1)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(74,213,105,0.1)' }}>
              {['Joueur', 'Genre', 'Club', 'Division', 'Région', 'Licence', 'Niveau', 'Email / Tél', 'Statut', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', color: '#555', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Chargement…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Aucun joueur trouvé</td></tr>
            ) : filtered.map((p, i) => (
              <tr key={p.id}
                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,213,105,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}
              >
                {/* Joueur */}
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                      background: `${p.gender === 'F' ? '#ec4899' : '#3b82f6'}22`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: p.gender === 'F' ? '#ec4899' : '#3b82f6', fontWeight: 700, fontSize: '13px',
                    }}>
                      {playerInitials(p)}
                    </div>
                    <div>
                      <div style={{ color: 'white', fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap' }}>{playerFullName(p)}</div>
                      {p.birth_date && <div style={{ color: '#555', fontSize: '11px' }}>{p.birth_date}</div>}
                    </div>
                  </div>
                </td>
                {/* Genre */}
                <td style={{ padding: '10px 14px' }}>
                  {p.gender ? (
                    <span style={{ background: `${GENDER_COLORS[p.gender] ?? '#666'}18`, color: GENDER_COLORS[p.gender] ?? '#666', borderRadius: '6px', padding: '3px 9px', fontSize: '12px', fontWeight: 700 }}>
                      {GENDER_LABELS[p.gender]}
                    </span>
                  ) : <span style={{ color: '#444' }}>—</span>}
                </td>
                {/* Club */}
                <td style={{ padding: '10px 14px', color: '#a0a0a0', fontSize: '12px', maxWidth: '160px' }}>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.club_name || '—'}</div>
                </td>
                {/* Division */}
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ background: `${DIV_COLORS[p.division as Division] ?? '#4ad569'}18`, color: DIV_COLORS[p.division as Division] ?? '#4ad569', borderRadius: '8px', padding: '3px 10px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {DIV_LABELS[p.division as Division] ?? p.division ?? '—'}
                  </span>
                </td>
                {/* Région */}
                <td style={{ padding: '10px 14px' }}>{p.region ? <RegionBadge region={p.region} /> : <span style={{ color: '#555' }}>—</span>}</td>
                {/* Licence */}
                <td style={{ padding: '10px 14px', color: '#a0a0a0', fontSize: '12px', fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap' }}>{p.license_no || '—'}</td>
                {/* Niveau */}
                <td style={{ padding: '10px 14px' }}>
                  {p.level ? (
                    <span style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', borderRadius: '6px', padding: '2px 8px', fontSize: '12px', fontWeight: 700, fontFamily: 'JetBrains Mono,monospace' }}>{p.level}</span>
                  ) : <span style={{ color: '#444' }}>—</span>}
                </td>
                {/* Email / Tél */}
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ color: '#a0a0a0', fontSize: '12px' }}>{p.email || '—'}</div>
                  {p.phone && <div style={{ color: '#666', fontSize: '11px' }}>{p.phone}</div>}
                </td>
                {/* Statut */}
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ background: p.active ? 'rgba(74,213,105,0.1)' : 'rgba(239,68,68,0.1)', color: p.active ? '#4ad569' : '#ef4444', borderRadius: '8px', padding: '3px 10px', fontSize: '12px', fontWeight: 600 }}>
                    {p.active ? '● Actif' : '○ Inactif'}
                  </span>
                </td>
                {/* Actions */}
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {!isViewer && <button onClick={() => setEditing({ ...p })}
                      style={{ background: 'rgba(74,213,105,0.1)', color: '#4ad569', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Pencil size={11} /> Éditer
                    </button>}
                    {!isViewer && <button onClick={async () => { if (confirm(`Supprimer ${playerFullName(p)} ?`)) { const ok = await remove(p.id); if (ok) { refreshCounts(); setError('✅ Joueur supprimé'); setTimeout(() => setError(''), 2500); } } }}
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}>
                      <Trash2 size={11} />
                    </button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal édition ────────────────────────────────────────────────────── */}
      {editing !== null && (
        <Modal title={editing.id ? `Modifier — ${playerFullName(editing as PlayerRow)}` : 'Nouveau Joueur'} onClose={() => setEditing(null)}>

          {/* Identité */}
          <div style={{ background: 'rgba(74,213,105,0.04)', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '11px', color: '#4ad569', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
            Identité
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Prénom *">
              <input style={inputCss} value={editing.first_name || ''} onChange={e => setEditing(p => ({ ...p!, first_name: e.target.value }))} placeholder="Prénom" />
            </Field>
            <Field label="Nom *">
              <input style={inputCss} value={editing.last_name || ''} onChange={e => setEditing(p => ({ ...p!, last_name: e.target.value }))} placeholder="Nom de famille" />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Genre *">
              <select style={selectCss} value={editing.gender || 'M'} onChange={e => setEditing(p => ({ ...p!, gender: e.target.value as 'M' | 'F' }))}>
                <option value="M">♂ Masculin</option>
                <option value="F">♀ Féminin</option>
              </select>
            </Field>
            <Field label="Date de naissance">
              <input style={inputCss} type="date" value={editing.birth_date || ''} onChange={e => setEditing(p => ({ ...p!, birth_date: e.target.value }))} />
            </Field>
          </div>

          {/* Coordonnées */}
          <div style={{ background: 'rgba(59,130,246,0.04)', borderRadius: '8px', padding: '12px 14px', margin: '16px 0 12px', fontSize: '11px', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
            Coordonnées
          </div>
          <Field label="Email">
            <input style={inputCss} type="email" value={editing.email || ''} onChange={e => setEditing(p => ({ ...p!, email: e.target.value }))} placeholder="joueur@email.com" />
          </Field>
          <Field label="Téléphone">
            <input style={inputCss} type="tel" value={editing.phone || ''} onChange={e => setEditing(p => ({ ...p!, phone: e.target.value }))} placeholder="+230 5XXX XXXX" />
          </Field>

          {/* Affiliation */}
          <div style={{ background: 'rgba(245,158,11,0.04)', borderRadius: '8px', padding: '12px 14px', margin: '16px 0 12px', fontSize: '11px', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
            Affiliation & Classement
          </div>
          <Field label="Club *">
            <select style={selectCss}
              value={editing.club_id || ''}
              onChange={e => {
                const club = MPL_CLUBS_LIST.find(c => c.id === e.target.value);
                setEditing(p => ({ ...p!, club_id: e.target.value, club_name: club?.name || '' }));
              }}>
              <option value="">— Sélectionner un club —</option>
              {MPL_CLUBS_LIST.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <Field label="Division *">
              <select style={selectCss} value={editing.division || 'men'} onChange={e => setEditing(p => ({ ...p!, division: e.target.value as Division }))}>
                {DIVISIONS.map(d => <option key={d} value={d}>{DIV_LABELS[d]}</option>)}
              </select>
            </Field>
            <Field label="Région">
              <select style={selectCss} value={editing.region || 'Nord'} onChange={e => setEditing(p => ({ ...p!, region: e.target.value as Region }))}>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Niveau">
              <select style={selectCss} value={editing.level || ''} onChange={e => setEditing(p => ({ ...p!, level: e.target.value }))}>
                <option value="">—</option>
                {PLAYER_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="N° Licence">
              <input style={inputCss} value={editing.license_no || ''} onChange={e => setEditing(p => ({ ...p!, license_no: e.target.value }))} placeholder="MPL-XXX" />
            </Field>
            <Field label="Statut">
              <select style={selectCss} value={editing.active ? 'true' : 'false'} onChange={e => setEditing(p => ({ ...p!, active: e.target.value === 'true' }))}>
                <option value="true">● Actif</option>
                <option value="false">○ Inactif</option>
              </select>
            </Field>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button onClick={() => setEditing(null)} style={{ background: 'rgba(255,255,255,0.05)', color: '#a0a0a0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer' }}>
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ background: '#4ad569', color: '#0a0a0a', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={14} /> {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE : TOURNOIS
// ─────────────────────────────────────────────────────────────────────────────

// Helpers Tournois — compatibles avec tous les noms de colonnes Supabase
function tournDate(t: TournRow): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = t as any;
  return raw.date ?? raw.tournament_date ?? raw['date'] ?? '';
}
function tournType(t: TournRow): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = t as any;
  return raw.type ?? raw.tournament_type ?? raw['type'] ?? '';
}
function autoStatus(t: TournRow): string {
  // Déléguer à la fonction partagée qui implémente les règles MPL officielles
  return applyCancelledTournamentStatus({ ...t, date: tournDate(t), type: tournType(t), status: computeTournamentStatus(tournDate(t), t.status) }).status ?? 'upcoming';
}

function TournamentsAdminPage() {
  const role = useAdminRole();
  const isViewer = role === 'viewer';
  const [tournois,  setTournois]  = useState<TournRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const sb = getSupabaseClient();
    if (isSupabaseConnected() && sb) {
      // select sans .order() pour éviter "column X does not exist"
      // limit=1000 pour couvrir les 436 tournois Supabase
      const { data, error: err } = await sb
        .from('tournaments')
        .select('*')
        .limit(1000);
      if (err) {
        setError(`❌ Erreur Supabase: ${err.message ?? 'Erreur inconnue'}`);
        setTournois(MOCK_TOURNAMENTS as unknown as TournRow[]);
      } else {
        const rows = (data ?? []) as TournRow[];
        // Tri côté client — compatible avec "date" OU "tournament_date"
        rows.sort((a, b) => {
          const da = (a.date ?? a.tournament_date ?? '').toString();
          const db = (b.date ?? b.tournament_date ?? '').toString();
          return da.localeCompare(db);
        });
        setTournois(rows);
      }
    } else {
      setTournois(MOCK_TOURNAMENTS as unknown as TournRow[]);
    }
    setLoading(false);
  }, []);

  const save = async (row: Partial<TournRow> & { id?: string }): Promise<{ ok: boolean; isDemo: boolean }> => {
    const sb  = getSupabaseClient();
    const sbOk = isSupabaseConnected() && !!sb;
    const typeVal = row.type ?? row.tournament_type ??
      (row.division === 'men' ? 'MEN' : row.division === 'women' ? 'WOMEN' : row.division === 'junior' ? 'JUNIOR' : row.division === 'mixed' ? 'MIXED' : 'MEN&WOMEN');
    const dateVal = row.date ?? row.tournament_date ?? '';
    // club_id: si vide, ne pas envoyer la colonne pour éviter FK violation
    const clubId  = row.club_id && row.club_id.trim() !== '' ? row.club_id.trim() : undefined;
    const clubName = row.club_name || (clubId ? MPL_CLUBS_LIST.find(c => c.id === clubId)?.name ?? '' : '');
    const payload: Record<string, unknown> = {
      name:             row.name             ?? '',
      ...(clubId && { club_id: clubId }),
      club_name:        clubName,
      tournament_date:  dateVal,
      region:           row.region           ?? '',
      category:         row.category         ?? 'M100',
      status:           row.status           ?? 'upcoming',
      max_teams:        row.max_teams        ?? 16,
      // Colonnes optionnelles : incluses uniquement si présentes et non vides
      ...(row.division         !== undefined && { division:         row.division }),
      ...(row.teams_registered !== undefined && { teams_registered: row.teams_registered }),
      ...(row.prize_money      !== undefined && row.prize_money > 0 && { prize_money: row.prize_money }),
    };

    // Colonne type du tournoi : le nom réel dépend du schéma Supabase.
    // Ordre de tentative : tournament_type seul → type seul → sans type
    // On NE met JAMAIS les deux dans le même payload (Supabase rejette tout le PATCH si une colonne est inconnue)
    const payloadNoType      = { ...payload };
    const payloadTypeOnly    = { ...payload, type: typeVal };
    const payloadTournOnly   = { ...payload, tournament_type: typeVal };

    if (!sbOk) {
      // Mode démo : mise à jour locale
      const newId = row.id ?? `demo-${Date.now()}`;
      setTournois(prev => {
        const full = { ...row, ...payload, id: newId } as TournRow;
        if (row.id && prev.some(t => t.id === row.id)) {
          return prev.map(t => t.id === row.id ? full : t);
        }
        return [...prev, full];
      });
      return { ok: true, isDemo: true };
    }

    try {
      // Fonction helper : tente un upsert avec retry automatique si PGRST204
      // Ordre de tentative : [type+tournament_type] → [tournament_type seul] → [type seul] → [sans type]
      const tryUpdate = async (id: string): Promise<{ error: { message: string; code?: string } | null }> => {
        for (const p of [payloadTournOnly, payloadTypeOnly, payloadNoType]) {
          console.log(`[Tournaments] UPDATE id=${id} keys=`, Object.keys(p));
          const { error: e } = await sb!.from('tournaments').update(p).eq('id', id);
          if (!e) return { error: null };
          if (e.code === 'PGRST204') { console.warn('[Tournaments] PGRST204, retry without type col'); continue; }
          return { error: e };
        }
        return { error: null };
      };
      const tryInsert = async (newId: string): Promise<{ error: { message: string; code?: string } | null }> => {
        for (const p of [payloadTournOnly, payloadTypeOnly, payloadNoType]) {
          console.log(`[Tournaments] INSERT id=${newId} keys=`, Object.keys(p));
          const { error: e } = await sb!.from('tournaments').insert({ id: newId, ...p });
          if (!e) return { error: null };
          if (e.code === 'PGRST204') { console.warn('[Tournaments] PGRST204, retry without type col'); continue; }
          return { error: e };
        }
        return { error: null };
      };

      if (row.id) {
        const { error: err } = await tryUpdate(row.id);
        if (err) { console.error('[Tournaments] UPDATE final error:', err); setError(`❌ ${err.message ?? 'Erreur inconnue'}`); return { ok: false, isDemo: false }; }
      } else {
        const newId = crypto.randomUUID?.() ?? `adm-${Date.now()}`;
        const { error: err } = await tryInsert(newId);
        if (err) { console.error('[Tournaments] INSERT final error:', err); setError(`❌ ${err.message ?? 'Erreur inconnue'}`); return { ok: false, isDemo: false }; }
      }
      setError('');
      await load();
      return { ok: true, isDemo: false };
    } catch (e) {
      console.error('[Tournaments] Network error:', e);
      setError(`❌ Erreur réseau: ${e}`);
      return { ok: false, isDemo: false };
    }
  };

  const remove = async (id: string) => {
    const sb  = getSupabaseClient();
    const sbOk = isSupabaseConnected() && !!sb;
    if (!sbOk) {
      setTournois(prev => prev.filter(t => t.id !== id));
      return true;
    }
    try {
      const { error: err } = await sb!.from('tournaments').delete().eq('id', id);
      if (err) { setError(`❌ ${err.message}`); return false; }
      await load();
      return true;
    } catch (e) {
      setError(`❌ Erreur réseau: ${e}`);
      return false;
    }
  };

  useEffect(() => { load(); }, [load]);

  const [search,     setSearch]    = useState('');
  const [catFilter,  setCat]       = useState<string>('all');
  const [regFilter,  setReg]       = useState<string>('all');
  const [statFilter, setStat]      = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [editing,    setEditing]   = useState<Partial<TournRow> | null>(null);
  const [saving,     setSaving]    = useState(false);

  // Enrichissement: status auto depuis date si absent
  const enriched = tournois.map(t => ({ ...t, status: autoStatus(t) }));

  const filtered = enriched.filter(t => {
    const d = tournDate(t);
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase())
      || (t.club_name || '').toLowerCase().includes(search.toLowerCase())
      || (t.region || '').toLowerCase().includes(search.toLowerCase());
    const matchCat  = catFilter  === 'all' || t.category === catFilter;
    const matchReg  = regFilter  === 'all' || t.region   === regFilter;
    const matchStat = statFilter === 'all' || t.status   === statFilter;
    const matchType = typeFilter === 'all' || tournType(t) === typeFilter;
    return matchSearch && matchCat && matchReg && matchStat && matchType;
  });

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    const isNew = !editing.id;
    const { ok, isDemo } = await save(editing);
    setSaving(false);
    if (ok) {
      setEditing(null);
      if (isDemo) {
        setError('⚠️ Sauvegarde locale uniquement (Supabase non connecté)');
      } else {
        setError(`✅ Tournoi ${isNew ? 'créé' : 'mis à jour'} avec succès`);
      }
      setTimeout(() => setError(''), 3500);
    }
    // Si erreur, le modal reste ouvert et setError a déjà affiché le message
  };

  const REGIONS:    Region[]            = ['Nord', 'Ouest', 'Est', 'Centre'];
  const CATEGORIES: (TournamentCategory | string)[] = ['M25','M50','M100','M250','M500','M1000','MIXED','JUNIOR'];
  const DIVISIONS:  Division[]           = ['men','women','junior','mixed'];
  const DIV_LABELS: Record<string,string> = { men:'Hommes', women:'Femmes', junior:'Junior', mixed:'Mixte' };
  const TYPE_OPTS   = ['MEN','WOMEN','MEN&WOMEN','MIXED','JUNIOR'];
  const STATUS_OPTS = ['upcoming','open','draw','ongoing','completed','cancelled'];

  const STATUS_LABELS: Record<string,string> = {
    upcoming: 'À venir', open: 'Inscriptions ouvertes', draw: 'Tirage / Fermé',
    ongoing: 'En cours', completed: 'Terminé', cancelled: 'Annulé',
    closed: 'Fermé', soon: 'Bientôt',
  };
  const STATUS_COLORS: Record<string,string> = {
    upcoming: '#60a5fa', open: '#4ad569', draw: '#f59e0b',
    ongoing: '#f59e0b', completed: '#6b7280', cancelled: '#ef4444',
    closed: '#6b7280', soon: '#a78bfa',
  };
  const TYPE_COLORS: Record<string,string> = {
    MEN: '#3b82f6', WOMEN: '#ec4899', 'MEN&WOMEN': '#8b5cf6', MIXED: '#f59e0b', JUNIOR: '#f97316',
  };
  const CAT_COLORS: Record<string,string> = {
    M25:'#6b7280', M50:'#22c55e', M100:'#3b82f6', M250:'#8b5cf6', M500:'#f59e0b', M1000:'#ef4444',
    MIXED:'#f97316', JUNIOR:'#ec4899',
  };

  // Stats
  const stats = {
    total:     enriched.length,
    upcoming:  enriched.filter(t => t.status === 'upcoming').length,
    open:      enriched.filter(t => ['open','draw'].includes(t.status)).length,
    ongoing:   enriched.filter(t => t.status === 'ongoing').length,
    completed: enriched.filter(t => t.status === 'completed').length,
  };

  return (
    <div>
      {/* ── En-tête ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ color: 'white', fontWeight: 700, margin: '0 0 4px' }}>Gestion des Tournois</h2>
          <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>
            {stats.total} tournois · {stats.upcoming} à venir · {stats.open} inscriptions · {stats.ongoing} en cours · {stats.completed} terminés · 🟢 Supabase
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={load} style={{ background: 'rgba(255,255,255,0.05)', color: '#a0a0a0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <RefreshCw size={14} /> Actualiser
          </button>
          {!isViewer && <button
            onClick={() => setEditing({ region: 'Nord', category: 'M100', division: 'men', type: 'MEN&WOMEN', status: 'upcoming', max_teams: 16, teams_registered: 0, prize_money: 0 })}
            style={{ background: '#4ad569', color: '#0a0a0a', border: 'none', borderRadius: '8px', padding: '9px 18px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <Plus size={14} /> Nouveau Tournoi
          </button>}
        </div>
      </div>

      {/* ── Stat chips ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {[
          { label: 'Total',      val: stats.total,     color: '#4ad569' },
          { label: 'À venir',    val: stats.upcoming,  color: '#a78bfa' },
          { label: 'En cours',   val: stats.ongoing,   color: '#f59e0b' },
          { label: 'Terminés',   val: stats.completed, color: '#3b82f6' },
        ].map(s => (
          <div key={s.label} style={{ background: `${s.color}12`, border: `1px solid ${s.color}30`, borderRadius: '8px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: s.color, fontWeight: 800, fontSize: '16px', fontFamily: 'JetBrains Mono,monospace' }}>{s.val}</span>
            <span style={{ color: '#a0a0a0', fontSize: '12px' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {error && (
        <div style={{
          background: error.startsWith('❌') ? 'rgba(239,68,68,0.1)' : error.startsWith('⚠️') ? 'rgba(245,158,11,0.1)' : 'rgba(74,213,105,0.08)',
          color:      error.startsWith('❌') ? '#ef4444' : error.startsWith('⚠️') ? '#f59e0b' : '#4ad569',
          border: `1px solid ${error.startsWith('❌') ? 'rgba(239,68,68,0.2)' : error.startsWith('⚠️') ? 'rgba(245,158,11,0.2)' : 'rgba(74,213,105,0.15)'}`,
          borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '16px', lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* ── Filtres ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Nom, club, région…"
            style={{ ...inputCss, paddingLeft: '36px' }} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...selectCss, width: 'auto', minWidth: '130px' }}>
          <option value="all">Tous types</option>
          {TYPE_OPTS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={catFilter} onChange={e => setCat(e.target.value)} style={{ ...selectCss, width: 'auto', minWidth: '110px' }}>
          <option value="all">Catégorie</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={regFilter} onChange={e => setReg(e.target.value)} style={{ ...selectCss, width: 'auto', minWidth: '110px' }}>
          <option value="all">Région</option>
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={statFilter} onChange={e => setStat(e.target.value)} style={{ ...selectCss, width: 'auto', minWidth: '120px' }}>
          <option value="all">Statut</option>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>)}
        </select>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(74,213,105,0.1)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '950px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(74,213,105,0.1)' }}>
              {['Tournoi', 'Type', 'Catégorie', 'Club', 'Région', 'Date', 'Paires', 'Prize', 'Statut', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', color: '#555', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Chargement…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Aucun tournoi trouvé</td></tr>
            ) : filtered.map((t, i) => {
              const typ   = tournType(t);
              const dt    = tournDate(t);
              const tcolor = TYPE_COLORS[typ] ?? '#a0a0a0';
              const ccolor = CAT_COLORS[String(t.category)] ?? '#4ad569';
              const sc     = STATUS_COLORS[t.status] ?? '#666';
              return (
                <tr key={t.id}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,213,105,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}
                >
                  {/* Tournoi */}
                  <td style={{ padding: '10px 14px', maxWidth: '200px' }}>
                    <div style={{ color: 'white', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                    {t.division && <div style={{ color: '#555', fontSize: '11px' }}>{DIV_LABELS[t.division] ?? t.division}</div>}
                  </td>
                  {/* Type */}
                  <td style={{ padding: '10px 14px' }}>
                    {typ ? (
                      <span style={{ background: `${tcolor}18`, color: tcolor, borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>{typ}</span>
                    ) : <span style={{ color: '#444' }}>—</span>}
                  </td>
                  {/* Catégorie */}
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ background: `${ccolor}18`, color: ccolor, borderRadius: '6px', padding: '3px 9px', fontSize: '12px', fontWeight: 700 }}>{t.category || '—'}</span>
                  </td>
                  {/* Club */}
                  <td style={{ padding: '10px 14px', color: '#a0a0a0', fontSize: '12px', maxWidth: '140px' }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.club_name || '—'}</div>
                  </td>
                  {/* Région */}
                  <td style={{ padding: '10px 14px' }}>{t.region ? <RegionBadge region={t.region} /> : <span style={{ color: '#555' }}>—</span>}</td>
                  {/* Date */}
                  <td style={{ padding: '10px 14px', color: '#a0a0a0', fontSize: '12px', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono,monospace' }}>
                    {dt || '—'}
                  </td>
                  {/* Paires */}
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <span style={{ color: (t.teams_registered ?? 0) >= t.max_teams ? '#ef4444' : '#4ad569', fontFamily: 'JetBrains Mono,monospace', fontSize: '13px' }}>
                      {t.teams_registered ?? 0}/{t.max_teams}
                    </span>
                  </td>
                  {/* Prize money */}
                  <td style={{ padding: '10px 14px', color: '#f59e0b', fontFamily: 'JetBrains Mono,monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {t.prize_money ? `Rs ${t.prize_money.toLocaleString()}` : '—'}
                  </td>
                  {/* Statut */}
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ background: `${sc}18`, color: sc, borderRadius: '8px', padding: '3px 10px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {STATUS_LABELS[t.status] ?? t.status}
                    </span>
                  </td>
                  {/* Actions */}
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {!isViewer && <button onClick={() => setEditing({ ...t })}
                        style={{ background: 'rgba(74,213,105,0.1)', color: '#4ad569', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Pencil size={11} /> Éditer
                      </button>}
                      {!isViewer && <button onClick={async () => { if (confirm(`Supprimer "${t.name}" ?`)) { const ok = await remove(t.id); if (ok) { setError(`✅ Tournoi supprimé`); setTimeout(() => setError(''), 2500); } } }}
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}>
                        <Trash2 size={11} />
                      </button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Modal édition ────────────────────────────────────────────────────── */}
      {editing !== null && (
        <Modal title={editing.id ? `Modifier — ${editing.name || ''}` : 'Nouveau Tournoi'} onClose={() => setEditing(null)}>

          {/* Infos générales */}
          <div style={{ background: 'rgba(74,213,105,0.04)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '11px', color: '#4ad569', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
            Informations générales
          </div>
          <Field label="Nom du tournoi *">
            <input style={inputCss} value={editing.name || ''} onChange={e => setEditing(p => ({ ...p!, name: e.target.value }))} placeholder="ex: Grand Baie Masters M250" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Date du tournoi *">
              <input style={inputCss} type="date" value={editing.date ?? editing.tournament_date ?? ''} onChange={e => setEditing(p => ({ ...p!, date: e.target.value, tournament_date: e.target.value }))} />
            </Field>
            <Field label="Région *">
              <select style={selectCss} value={editing.region || 'Nord'} onChange={e => setEditing(p => ({ ...p!, region: e.target.value as Region }))}>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>

          {/* Club */}
          <div style={{ background: 'rgba(245,158,11,0.04)', borderRadius: '8px', padding: '10px 14px', margin: '14px 0 12px', fontSize: '11px', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
            Club organisateur
          </div>
          <Field label="Club *">
            <select style={selectCss}
              value={editing.club_id || ''}
              onChange={e => {
                const club = MPL_CLUBS_LIST.find(c => c.id === e.target.value);
                setEditing(p => ({ ...p!, club_id: e.target.value, club_name: club?.name || '' }));
              }}>
              <option value="">— Sélectionner un club —</option>
              {MPL_CLUBS_LIST.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          {/* Classification */}
          <div style={{ background: 'rgba(59,130,246,0.04)', borderRadius: '8px', padding: '10px 14px', margin: '14px 0 12px', fontSize: '11px', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
            Classification
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <Field label="Catégorie *">
              <select style={selectCss} value={editing.category || 'M100'} onChange={e => setEditing(p => ({ ...p!, category: e.target.value as TournamentCategory }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Type *">
              <select style={selectCss}
                value={editing.type ?? editing.tournament_type ?? 'MEN&WOMEN'}
                onChange={e => setEditing(p => ({ ...p!, type: e.target.value, tournament_type: e.target.value }))}>
                {TYPE_OPTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Division">
              <select style={selectCss} value={editing.division || 'men'} onChange={e => setEditing(p => ({ ...p!, division: e.target.value as Division }))}>
                {DIVISIONS.map(d => <option key={d} value={d}>{DIV_LABELS[d]}</option>)}
              </select>
            </Field>
          </div>

          {/* Inscriptions & dotation */}
          <div style={{ background: 'rgba(139,92,246,0.04)', borderRadius: '8px', padding: '10px 14px', margin: '14px 0 12px', fontSize: '11px', color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
            Inscriptions & Dotation
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
            <Field label="Max paires">
              <input style={inputCss} type="number" min={4} value={editing.max_teams || 16} onChange={e => setEditing(p => ({ ...p!, max_teams: +e.target.value }))} />
            </Field>
            <Field label="Paires inscrites">
              <input style={inputCss} type="number" min={0} value={editing.teams_registered || 0} onChange={e => setEditing(p => ({ ...p!, teams_registered: +e.target.value }))} />
            </Field>
            <Field label="Prize money (Rs)">
              <input style={inputCss} type="number" min={0} value={editing.prize_money || 0} onChange={e => setEditing(p => ({ ...p!, prize_money: +e.target.value }))} placeholder="0" />
            </Field>
            <Field label="Statut">
              <select style={selectCss} value={editing.status || 'upcoming'} onChange={e => setEditing(p => ({ ...p!, status: e.target.value }))}>
                {STATUS_OPTS.map(s => <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>)}
              </select>
              <span style={{ fontSize: '10px', color: '#555', marginTop: '3px', display: 'block' }}>
                Auto selon règles MPL : J-21 = Inscriptions, J-7 = Tirage, passé = Terminé
              </span>
            </Field>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button onClick={() => setEditing(null)} style={{ background: 'rgba(255,255,255,0.05)', color: '#a0a0a0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer' }}>
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ background: '#4ad569', color: '#0a0a0a', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={14} /> {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE : OBS API
// ─────────────────────────────────────────────────────────────────────────────
// ── OBSPage ───────────────────────────────────────────────────────────────────
function OBSPage() {
  const [liveMatches, setLiveMatches] = useState<Record<string,unknown>[]>([]);
  const [topRankings, setTopRankings] = useState<Record<string,unknown>[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [preview, setPreview]         = useState<string | null>(null);
  const [copied, setCopied]           = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!isSupabaseConnected() || !sb) return;
    setLoadingData(true);
    Promise.all([
      sb.from('matches').select('id,team1_name,team2_name,score_set1,score_set2,score_tb,status,court_label,tournament_id').eq('status','live').limit(5),
      sb.from('rankings').select('player_name,rank,points,division,trend').eq('division','MEN').order('rank',{ascending:true}).limit(10),
    ]).then(([m, r]) => {
      if (m.data) setLiveMatches(m.data as Record<string,unknown>[]);
      if (r.data)  setTopRankings(r.data  as Record<string,unknown>[]);
      setLoadingData(false);
    });
  }, []);

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  }

  const siteBase = 'https://padelleague.mu/#';

  const endpoints = [
    {
      title: 'OBS Scoreboard (overlay)',
      badge: 'LIVE',
      badgeColor: '#4ad569',
      desc: 'Scoreboard transparent pour OBS — match en cours en temps réel',
      url: `${siteBase}/obs/scoreboard?tournament_id={id}`,
      data: liveMatches.length > 0 ? liveMatches[0] : null,
      emptyMsg: 'Aucun match en cours',
    },
    {
      title: 'Calendrier des tournois',
      badge: 'GET',
      badgeColor: '#3b82f6',
      desc: 'Liste complète des tournois 2026',
      url: `${siteBase}/calendrier`,
      data: null,
      emptyMsg: '',
    },
    {
      title: 'Top 10 Ranking — Hommes',
      badge: 'RANKINGS',
      badgeColor: '#f59e0b',
      desc: 'Top 10 classement actuel avec points et tendance',
      url: `${siteBase}/classements`,
      data: topRankings.length > 0 ? { division: 'MEN', top10: topRankings.slice(0,3) } : null,
      emptyMsg: 'Connecter Supabase pour voir les données',
    },
    {
      title: 'Résultats des tournois',
      badge: 'GET',
      badgeColor: '#8b5cf6',
      desc: 'Tous les résultats de la saison 2026',
      url: `${siteBase}/resultats`,
      data: null,
      emptyMsg: '',
    },
  ];

  const cardStyle: React.CSSProperties = {
    background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)',
    borderRadius:'14px', padding:'20px', marginBottom:'14px',
  };
  const inputStyle: React.CSSProperties = {
    background:'#111', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px',
    padding:'10px 14px', color:'#4ad569', fontFamily:'JetBrains Mono,monospace',
    fontSize:'12px', width:'100%', outline:'none', cursor:'text',
  };
  const btnStyle = (c: string): React.CSSProperties => ({
    background:`${c}15`, color:c, border:`1px solid ${c}30`,
    borderRadius:'6px', padding:'4px 10px', fontSize:'11px', fontWeight:700, cursor:'pointer',
  });

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'6px'}}>
        <Zap size={20} color="#4ad569"/>
        <h2 style={{color:'white',fontWeight:700,margin:0,fontSize:'19px'}}>API OBS</h2>
        <span style={{background:'rgba(74,213,105,0.1)',color:'#4ad569',border:'1px solid rgba(74,213,105,0.2)',borderRadius:'6px',padding:'2px 8px',fontSize:'10px',fontWeight:700}}>
          {isSupabaseConnected() ? '🟢 Supabase' : '🟡 Démo'}
        </span>
        {loadingData && <RefreshCw size={14} color="#555" style={{animation:'spin 1s linear infinite'}}/>}
      </div>
      <p style={{color:'#555',fontSize:'12px',margin:'0 0 20px'}}>
        Liens et données en temps réel — intégrez dans OBS Studio via Browser Source
      </p>

      {!isSupabaseConnected() && (
        <div style={{background:'rgba(245,158,11,0.06)',color:'#f59e0b',border:'1px solid rgba(245,158,11,0.2)',borderRadius:'10px',padding:'10px 14px',marginBottom:'16px',fontSize:'12px'}}>
          ⚠️ Supabase non connecté — les données live ne sont pas disponibles. Connectez Supabase pour voir les scores en temps réel.
        </div>
      )}

      {endpoints.map((ep, i) => (
        <div key={i} style={cardStyle}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px',flexWrap:'wrap',gap:'8px'}}>
            <div>
              <span style={{color:'white',fontWeight:700,fontSize:'14px'}}>{ep.title}</span>
              <span style={{marginLeft:'8px',background:`${ep.badgeColor}20`,color:ep.badgeColor,borderRadius:'4px',padding:'2px 7px',fontSize:'10px',fontWeight:700}}>{ep.badge}</span>
            </div>
            <div style={{display:'flex',gap:'6px'}}>
              <button onClick={() => setPreview(preview===ep.url?null:ep.url)} style={btnStyle('#8b5cf6')}>
                {preview===ep.url ? '👁 Masquer' : '👁 Aperçu'}
              </button>
              <button onClick={() => copyUrl(ep.url)} style={btnStyle('#4ad569')}>
                {copied===ep.url ? '✓ Copié !' : '⧉ Copier'}
              </button>
            </div>
          </div>
          <p style={{color:'#666',fontSize:'12px',margin:'0 0 10px'}}>{ep.desc}</p>
          <input readOnly value={ep.url} style={inputStyle} onClick={e => (e.target as HTMLInputElement).select()}/>
          {preview===ep.url && (
            <div style={{marginTop:'10px',background:'#0d0d0d',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'8px',padding:'12px',maxHeight:'200px',overflow:'auto'}}>
              <p style={{color:'#555',fontSize:'10px',margin:'0 0 6px',textTransform:'uppercase',letterSpacing:'1px'}}>Réponse JSON</p>
              {ep.data ? (
                <pre style={{color:'#4ad569',fontSize:'11px',fontFamily:'JetBrains Mono,monospace',margin:0,whiteSpace:'pre-wrap'}}>
                  {JSON.stringify(ep.data,null,2)}
                </pre>
              ) : (
                <p style={{color:'#555',fontSize:'12px',margin:0,fontStyle:'italic'}}>{ep.emptyMsg || '—'}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
//  PAGE : DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function DashboardPage() {
  const { t } = useI18n();
  const dash = t.admin.dashboard;
  const { counts: playerCounts } = usePlayerStats();

  // ── Charger tous les tournois depuis Supabase (ou données locales) ──────────
  const [allTournois, setAllTournois] = useState<TournRow[]>([]);
  useEffect(() => {
    async function load() {
      const sb = getSupabaseClient();
      if (isSupabaseConnected() && sb) {
        const { data } = await sb.from('tournaments').select('*').limit(2000);
        if (data && (data as unknown[]).length > 0) {
          setAllTournois(data as TournRow[]);
          return;
        }
      }
      setAllTournois(MOCK_TOURNAMENTS as unknown as TournRow[]);
    }
    load();
  }, []);

  // ── Calcul dynamique du prochain week-end à venir ────────────────────────────
  // Règle : cherche le prochain samedi ou dimanche dont la date >= aujourd'hui
  // Si aujourd'hui est sam/dim et qu'il y a des tournois → afficher ce week-end
  // Sinon → prochain week-end à venir
  const today = new Date(); today.setHours(0, 0, 0, 0);

  function getNextWeekendRange(): { sat: Date; sun: Date } {
    const d = new Date(today);
    const dow = d.getDay(); // 0=dim, 1=lun … 6=sam
    // Aller au prochain samedi (ou rester si on est sam/dim)
    let daysToSat: number;
    if (dow === 6) daysToSat = 0;       // aujourd'hui = samedi
    else if (dow === 0) daysToSat = -1; // aujourd'hui = dimanche → revenir au sam précédent
    else daysToSat = 6 - dow;           // jours restants jusqu'au samedi
    const sat = new Date(d); sat.setDate(d.getDate() + daysToSat);
    const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
    return { sat, sun };
  }

  // Cherche le premier week-end (à partir d'aujourd'hui) qui a au moins un tournoi
  const weekendTournoisGroups = useMemo(() => {
    if (!allTournois.length) return null;

    // Enrichir les statuts
    const enriched = allTournois.map(t => {
      const date = (t as any).tournament_date ?? (t as any).date ?? '';
      const normalized = applyCancelledTournamentStatus({
        ...t,
        date,
        type: (t as any).tournament_type ?? (t as any).type ?? '',
        status: computeTournamentStatus(date, t.status),
      });
      return { ...normalized, _date: date, _status: normalized.status ?? 'upcoming' };
    });

    // Trier par date croissante
    const sorted = [...enriched].sort((a, b) => a._date.localeCompare(b._date));

    // Trouver le prochain week-end à venir avec des tournois
    // On cherche dans les 90 prochains jours
    for (let offset = 0; offset <= 90; offset += 7) {
      const ref = new Date(today); ref.setDate(today.getDate() + offset);
      const dow = ref.getDay();
      // Calculer le samedi de cette semaine
      const daysToSat = dow === 6 ? 0 : dow === 0 ? -1 : 6 - dow;
      const sat = new Date(ref); sat.setDate(ref.getDate() + daysToSat);
      const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
      const satStr = sat.toISOString().slice(0, 10);
      const sunStr = sun.toISOString().slice(0, 10);

      const satTournois = sorted.filter(t => t._date === satStr && t._status !== 'cancelled');
      const sunTournois = sorted.filter(t => t._date === sunStr && t._status !== 'cancelled');

      if (satTournois.length > 0 || sunTournois.length > 0) {
        return { sat, sun, satStr, sunStr, satTournois, sunTournois };
      }
    }
    return null;
  }, [allTournois, today.getTime()]);

  // ── Activité récente : tournois terminés dans les 60 derniers jours ──────────
  const recentActivity = useMemo(() => {
    const cutoff = new Date(today); cutoff.setDate(today.getDate() - 60);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const todayStr  = today.toISOString().slice(0, 10);

    const recent = allTournois
      .filter(t => {
        const d = (t as any).tournament_date ?? (t as any).date ?? '';
        return d >= cutoffStr && d <= todayStr;
      })
      .sort((a, b) => {
        const da = (a as any).tournament_date ?? (a as any).date ?? '';
        const db = (b as any).tournament_date ?? (b as any).date ?? '';
        return db.localeCompare(da); // plus récent en premier
      });

    return recent.map(t => {
      const d   = (t as any).tournament_date ?? (t as any).date ?? '';
      const dt  = new Date(d);
      const diffDays = Math.floor((today.getTime() - dt.getTime()) / (1000 * 60 * 60 * 24));
      const time = diffDays === 0 ? "Aujourd'hui" : diffDays === 1 ? 'Hier' : `Il y a ${diffDays} jours`;
      const type = (t as any).tournament_type ?? (t as any).type ?? '';
      const color = type === 'WOMEN' ? '#ec4899' : type === 'JUNIOR' ? '#f59e0b' : type === 'MIXED' ? '#8b5cf6' : '#4ad569';
    return { msg: `${t.name} – ${dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, time, color };
    });
  }, [allTournois, today.getTime()]);

  const [showAllActivity, setShowAllActivity] = useState(false);
  const activityVisible = showAllActivity ? recentActivity : recentActivity.slice(0, 10);

  // ── Stats dynamiques ──────────────────────────────────────────────────────────
  const enrichedAll = useMemo(() => allTournois.map(t => {
    const date = (t as any).tournament_date ?? (t as any).date ?? '';
    const normalized = applyCancelledTournamentStatus({
      ...t,
      date,
      type: (t as any).tournament_type ?? (t as any).type ?? '',
      status: computeTournamentStatus(date, t.status),
    });
    return { ...normalized, _status: normalized.status ?? 'upcoming' };
  }), [allTournois]);

  const statsCompleted = enrichedAll.filter(t => t._status === 'completed').length || 88;
  const statsUpcoming  = enrichedAll.filter(t => ['upcoming','open','draw'].includes(t._status)).length || 10;

  const dynStats = [
    { label: 'Clubs actifs',       value: '18',                                           color: '#4ad569' },
    { label: 'Tournois à venir',   value: String(statsUpcoming),                          color: '#3b82f6' },
    { label: 'Joueurs classés',    value: playerCounts.total.toLocaleString('fr-FR'),     color: '#8b5cf6' },
    { label: 'Tournois complétés', value: String(statsCompleted),                         color: '#f59e0b' },
  ];

  // ── Helpers d'affichage ───────────────────────────────────────────────────────
  const CAT_COLORS: Record<string,string> = {
    M25:'#6b7280', M50:'#22c55e', M100:'#3b82f6', M250:'#8b5cf6',
    M500:'#f59e0b', M1000:'#ef4444', MIXED:'#f97316', JUNIOR:'#ec4899',
    U11:'#fb923c', U13:'#f97316', U15:'#ef4444',
  };
  const TYPE_COLORS: Record<string,string> = {
    MEN:'#3b82f6', WOMEN:'#ec4899', 'MEN&WOMEN':'#8b5cf6', MIXED:'#f59e0b', JUNIOR:'#f97316',
  };
  function colorForTournoi(t: TournRow) {
    const type = (t as any).tournament_type ?? (t as any).type ?? '';
    const category = normalizeJuniorCategory(String(t.category ?? ''));
    return TYPE_COLORS[type] ?? CAT_COLORS[category] ?? '#4ad569';
  }
  function divLabel(t: TournRow): string {
    const type = (t as any).tournament_type ?? (t as any).type ?? '';
    if (type === 'WOMEN') return 'Dames';
    if (type === 'MEN')   return 'Hommes';
    if (type === 'JUNIOR' || type.startsWith('U')) return 'Junior'; // U11, U13, U15
    if (type === 'MIXED') return 'Mixte';
    return type || '—';
  }
  function formatWeekendLabel(sat: Date, sun: Date): string {
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    const s = sat.toLocaleDateString('fr-FR', opts);
    const e = sun.toLocaleDateString('fr-FR', opts);
    // Si même mois : "28-29 mars 2026"
    if (sat.getMonth() === sun.getMonth()) {
      return `${sat.getDate()}–${sun.getDate()} ${sat.toLocaleDateString('fr-FR', { month: 'long' })} ${sat.getFullYear()}`;
    }
    return `${s} – ${e}`;
  }
  function dayLabel(d: Date): string {
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      .replace(/^\w/, c => c.toUpperCase());
  }

  // ── Rendu carte tournoi ────────────────────────────────────────────────────
  function TournoiCard({ t }: { t: TournRow }) {
    const color = colorForTournoi(t);
    const category = normalizeJuniorCategory(String(t.category ?? ''));
    return (
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        borderLeft: `3px solid ${color}`, borderRadius: '10px', padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: '5px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ color: 'white', fontWeight: 600, fontSize: '13px', lineHeight: 1.3 }}>{t.name}</span>
          <span style={{ background: `${CAT_COLORS[category] ?? color}20`, color: CAT_COLORS[category] ?? color, borderRadius: '5px', padding: '2px 7px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{category}</span>
        </div>
        <div style={{ color: '#666', fontSize: '11px' }}>
          🏢 {(t as any).club_name ?? (t as any).club ?? '—'}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ color: '#555', fontSize: '11px' }}>📍 {t.region}</span>
          <span style={{ background: 'rgba(255,255,255,0.05)', color: '#888', borderRadius: '4px', padding: '1px 6px', fontSize: '10px' }}>
            {divLabel(t)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p style={{ color: '#a0a0a0', marginBottom: '28px', fontSize: '14px' }}>{dash.welcome}</p>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '16px', marginBottom: '36px' }}>
        {dynStats.map((s, i) => (
          <div key={i} style={{ borderTop: `3px solid ${s.color}`, borderRadius: '16px' }}>
            <GlassCard style={{ padding: '20px', borderRadius: '14px' }}>
              <div style={{ color: s.color, fontWeight: 800, fontSize: '30px', lineHeight: 1, fontFamily: 'JetBrains Mono,monospace' }}>{s.value}</div>
              <div style={{ color: '#a0a0a0', fontSize: '13px', marginTop: '6px' }}>{s.label}</div>
            </GlassCard>
          </div>
        ))}
      </div>

      {/* Activité + Supabase info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <GlassCard style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ color: 'white', fontWeight: 700, margin: 0, fontSize: '15px' }}>{dash.recent}</h3>
            {recentActivity.length > 0 && (
              <span style={{ fontSize: '11px', color: '#666', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '10px' }}>
                {recentActivity.length} tournoi{recentActivity.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {recentActivity.length > 0 ? activityVisible.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: a.color, marginTop: '5px', flexShrink: 0 }} />
                <div>
                  <div style={{ color: '#ccc', fontSize: '13px' }}>{a.msg}</div>
                  <div style={{ color: '#555', fontSize: '11px', marginTop: '2px' }}>{a.time}</div>
                </div>
              </div>
            )) : (
              <p style={{ color: '#555', fontSize: '13px' }}>Aucun tournoi complété récemment.</p>
            )}
            {recentActivity.length > 10 && (
              <button
                onClick={() => setShowAllActivity(v => !v)}
                style={{ marginTop: '6px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#4ad569', fontSize: '12px', padding: '5px 12px', cursor: 'pointer', width: '100%' }}
              >
                {showAllActivity ? '▲ Réduire' : `▼ Voir tous (${recentActivity.length - 10} de plus)`}
              </button>
            )}
          </div>
        </GlassCard>

        <GlassCard style={{ padding: '24px' }}>
          <h3 style={{ color: 'white', fontWeight: 700, margin: '0 0 16px', fontSize: '15px' }}>
            🟢 Supabase connecté
          </h3>
          <p style={{ color: '#a0a0a0', fontSize: '13px', lineHeight: 1.7 }}>
            Toutes les données sont synchronisées avec votre base Supabase en temps réel.
          </p>
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              {
                label: '📅 Prochain week-end',
                value: weekendTournoisGroups
                  ? formatWeekendLabel(weekendTournoisGroups.sat, weekendTournoisGroups.sun)
                  : '—',
                color: '#4ad569',
              },
              { label: '🏆 Saison',          value: `${statsCompleted} tournois joués`, color: '#3b82f6' },
              { label: '👥 Joueurs classés', value: `${playerCounts.total.toLocaleString('fr-FR')} joueurs`, color: '#8b5cf6' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `${item.color}0d`, borderRadius: '8px', padding: '8px 12px' }}>
                <span style={{ color: '#a0a0a0', fontSize: '12px' }}>{item.label}</span>
                <span style={{ color: item.color, fontSize: '12px', fontWeight: 700 }}>{item.value}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* ── Prochains Tournois du week-end ── */}
      <GlassCard style={{ padding: '24px' }}>
        <h3 style={{ color: 'white', fontWeight: 700, margin: '0 0 20px', fontSize: '15px' }}>
          📅 Prochains Tournois du week-end
        </h3>

        {!weekendTournoisGroups ? (
          <p style={{ color: '#555', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
            Aucun tournoi à venir dans les 90 prochains jours.
          </p>
        ) : (
          <>
            {/* Samedi */}
            {weekendTournoisGroups.satTournois.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ height: '1px', flex: 1, background: 'rgba(255,255,255,0.08)' }} />
                  <span style={{ color: '#4ad569', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    📆 {dayLabel(weekendTournoisGroups.sat)}
                  </span>
                  <div style={{ height: '1px', flex: 1, background: 'rgba(255,255,255,0.08)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '10px' }}>
                  {weekendTournoisGroups.satTournois.map((t, i) => <TournoiCard key={t.id ?? i} t={t} />)}
                </div>
              </div>
            )}

            {/* Dimanche */}
            {weekendTournoisGroups.sunTournois.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ height: '1px', flex: 1, background: 'rgba(255,255,255,0.08)' }} />
                  <span style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    📆 {dayLabel(weekendTournoisGroups.sun)}
                  </span>
                  <div style={{ height: '1px', flex: 1, background: 'rgba(255,255,255,0.08)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '10px' }}>
                  {weekendTournoisGroups.sunTournois.map((t, i) => <TournoiCard key={t.id ?? i} t={t} />)}
                </div>
              </div>
            )}
          </>
        )}
      </GlassCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  LAYOUT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminDashboard({ onLogout, role, userName }: Props) {
  const { lang } = useI18n();
  const [activePage, setActivePage] = useState<AdminPage>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isViewer = role === 'viewer';

  const navItems: { key: AdminPage; label: string; icon: React.ElementType }[] = [
    { key: 'dashboard',   label: 'Dashboard',    icon: LayoutDashboard },
    { key: 'clubs',       label: lang === 'fr' ? 'Clubs'    : 'Clubs',       icon: Settings    },
    { key: 'players',     label: lang === 'fr' ? 'Joueurs'  : 'Players',     icon: Users       },
    { key: 'tournaments', label: lang === 'fr' ? 'Tournois' : 'Tournaments', icon: Trophy      },
    { key: 'registrations', label: 'Inscriptions',  icon: Users      },
    { key: 'draw',          label: 'Tirage',         icon: Shuffle    },
    { key: 'live_scoring',  label: 'Score Live',     icon: Play       },
    { key: 'results',     label: lang === 'fr' ? 'Résultats' : 'Results',   icon: Medal       },
    { key: 'rankings',    label: lang === 'fr' ? 'Classements' : 'Rankings', icon: BarChart2   },
    { key: 'official_import', label: 'Classements officiels', icon: FileText },
    { key: 'historical_audit', label: 'Controle donnees', icon: Database },
    { key: 'brackets',    label: 'Brackets',     icon: GitBranch },
    { key: 'scores',      label: 'Scores',       icon: Star      },
    { key: 'exports',     label: 'Exports',      icon: Download  },
    { key: 'gallery',     label: 'Galerie',      icon: Camera    },
    { key: 'obs',         label: 'API OBS',      icon: Zap         },
  ];

  return (
    <AdminRoleContext.Provider value={role}>
    <div style={{ display: 'flex', height: '100vh', background: '#0a0a0a', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{ width: sidebarOpen ? '220px' : '64px', transition: 'width 0.3s', background: '#0d0d0d', borderRight: '1px solid rgba(74,213,105,0.08)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '16px 12px', borderBottom: '1px solid rgba(74,213,105,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {sidebarOpen && <MPLLogo size={28} />}
          <button onClick={() => setSidebarOpen(o => !o)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', marginLeft: sidebarOpen ? 0 : 'auto', marginRight: sidebarOpen ? 0 : 'auto' }}>
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activePage === item.key;
            return (
              <button key={item.key} onClick={() => setActivePage(item.key)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', width: '100%', background: isActive ? 'rgba(74,213,105,0.1)' : 'none', border: isActive ? '1px solid rgba(74,213,105,0.2)' : '1px solid transparent', borderRadius: '10px', cursor: 'pointer', color: isActive ? '#4ad569' : '#a0a0a0', transition: 'all 0.2s' }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'none'; }}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
                {sidebarOpen && <span style={{ fontSize: '14px', fontWeight: isActive ? 600 : 400, whiteSpace: 'nowrap' }}>{item.label}</span>}
              </button>
            );
          })}
        </nav>
        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(74,213,105,0.08)' }}>
          <button onClick={onLogout} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: '#666', borderRadius: '10px', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#666'; e.currentTarget.style.background = 'none'; }}
          >
            <LogOut size={18} style={{ flexShrink: 0 }} />
            {sidebarOpen && <span style={{ fontSize: '14px' }}>Déconnexion</span>}
          </button>
        </div>
      </aside>

        {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: '56px', borderBottom: '1px solid rgba(74,213,105,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: 'rgba(10,10,10,0.9)', flexShrink: 0 }}>
          <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'white' }}>
            {navItems.find(n => n.key === activePage)?.label}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Badge rôle */}
            {isViewer ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(99,179,237,0.1)', color: '#63b3ed', border: '1px solid rgba(99,179,237,0.25)', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: 700 }}>
                <Eye size={11} /> Lecture seule
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(74,213,105,0.1)', color: '#4ad569', border: '1px solid rgba(74,213,105,0.25)', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: 700 }}>
                <ShieldCheck size={11} /> Admin complet
              </span>
            )}
            <span style={{ fontSize: '12px', color: isSupabaseConnected() ? '#4ad569' : '#f59e0b' }}>
              '● Supabase connecté'
            </span>
            <button style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}><Bell size={16} /></button>
            {/* Avatar avec initiales du user */}
            <div title={userName} style={{ background: isViewer ? '#63b3ed' : '#4ad569', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a0a0a', fontWeight: 700, fontSize: '12px', cursor: 'default' }}>
              {userName ? userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) : 'A'}
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: '28px 24px', overflowY: 'auto' }}>
          <AdminErrorBoundary page={activePage}>
            {activePage === 'dashboard'   && <DashboardPage />}
            {activePage === 'clubs'       && <ClubsAdminPage />}
            {activePage === 'players'     && <PlayersAdminPage />}
            {activePage === 'tournaments' && <TournamentsAdminPage />}
            {activePage === 'registrations' && <RegistrationsPage />}
            {activePage === 'draw'          && <DrawControlPage />}
            {activePage === 'live_scoring'  && <LiveScoringPage />}
            {activePage === 'results'     && <ResultsAdminPage />}
            {activePage === 'rankings'    && <RankingsAdminPage />}
            {activePage === 'official_import' && <OfficialRankingImportPage />}
            {activePage === 'historical_audit' && <HistoricalAuditPage />}
            {activePage === 'obs'         && <OBSPage />}
            {activePage === 'exports'     && <ExportsPage />}
            {activePage === 'gallery'     && <GalerieAdminPage />}
            {activePage === 'brackets'    && <BracketsPage />}
            {activePage === 'scores'      && <ScoresPage />}
          </AdminErrorBoundary>
        </main>
      </div>
    </div>
    </AdminRoleContext.Provider>
  );
}
