import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Trophy, Plus, Pencil, Trash2, Save, X, RefreshCw,
  ChevronDown, ChevronUp, Zap, CheckCircle, AlertCircle,
  Award, Calendar, MapPin, Users, Upload, ClipboardList, Copy, Check,
} from 'lucide-react';
import { getSupabaseClient, isSupabaseConnected } from '@/lib/supabase';
import { normalizeJuniorCategory, normalizeTournamentDisplayName } from '@/lib/tournamentNames';
import { computeTournamentStatus } from '@/hooks/useData';
import { getPoints, getBracketIndex, POINTS_BRACKETS } from '@/lib/pointsAllocation';

// ─────────────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface TResult {
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
  _source?: 'legacy' | 'historical';
  _match_key?: string;
}

interface HistoricalResultRow {
  id: string;
  source_file?: string | null;
  sheet_name?: string | null;
  event_key: string;
  event_name: string;
  event_year: number;
  season: number;
  category: string;
  division: string;
  junior_category?: string | null;
  club_name: string;
  event_date?: string | null;
  region?: string | null;
  rank_label?: string | null;
  rank_min?: number | null;
  rank_max?: number | null;
  team_name?: string | null;
  player1_name: string;
  player2_name: string;
  points: number;
}

interface TournRow {
  id: string;
  name: string;
  date?: string;
  tournament_date?: string;
  category?: string;
  region?: string;
  status?: string;
  club_name?: string;
  type?: string;
  tournament_type?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────
const DIV_LABELS: Record<string, string>  = { men:'Hommes', women:'Dames', mixed:'Mixte', junior:'Junior' };
const DIV_COLORS: Record<string, string>  = { men:'#60a5fa', women:'#f472b6', mixed:'#a78bfa', junior:'#4ade80' };
const CAT_COLORS: Record<string, string>  = { M25:'#6b7280', M50:'#10b981', M100:'#3b82f6', M250:'#8b5cf6', M500:'#f59e0b', M1000:'#ef4444', MIXED:'#a78bfa', U11:'#4ade80', U13:'#4ade80', U15:'#4ade80' };
const DIVS = ['men','women','mixed','junior'];

const HISTORICAL_RESULT_COLUMNS = [
  'id',
  'source_file',
  'sheet_name',
  'event_key',
  'event_name',
  'event_year',
  'season',
  'category',
  'division',
  'junior_category',
  'club_name',
  'event_date',
  'region',
  'rank_label',
  'rank_min',
  'rank_max',
  'team_name',
  'player1_name',
  'player2_name',
  'points',
].join(',');

function pts(rank: number, category = 'M25', totalTeams = 8) {
  return getPoints(category, rank, totalTeams);
}
function medal(rank: number) {
  if (rank === 1) return { icon: '🥇', color: '#f59e0b' };
  if (rank === 2) return { icon: '🥈', color: '#94a3b8' };
  if (rank === 3) return { icon: '🥉', color: '#cd7c2f' };
  return { icon: `#${rank}`, color: '#555' };
}
function fmtDate(d: string) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }); }
  catch { return d; }
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function normKey(value: unknown): string {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizeClubName(value: unknown): string {
  const name = cleanText(value);
  if (!name) return '';
  return name
    .replace(/Ca\?a|Ca\u00f1a|CANA/gi, 'Ca\u00f1a')
    .replace(/Isla Padel de Beau Plan/gi, 'Isla Padel Beau Plan')
    .replace(/Labourdonnais Sports Club|LAB SPORTS CLUB/gi, 'Labourdonnais Mapou')
    .replace(/RM\s*Forbach|RM Club Grand Baie\s*\(Forbach\)|Grand Baie\s*\(Forbach\)/gi, 'RM Club Grand Baie')
    .replace(/I Padel RM/gi, 'I Padel by RM')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDivision(value: unknown, category?: unknown): string {
  const raw = cleanText(value).toLowerCase();
  if (['men', 'hommes', 'h', 'mens'].includes(raw)) return 'men';
  if (['women', 'dames', 'femmes', 'w'].includes(raw)) return 'women';
  if (['mixed', 'mixte'].includes(raw)) return 'mixed';
  if (['junior', 'juniors'].includes(raw)) return 'junior';
  const cat = cleanText(category).toUpperCase();
  if (['U11', 'U13', 'U15', 'U10', 'U12', 'U14'].includes(cat)) return 'junior';
  if (cat === 'MIXED') return 'mixed';
  return raw || 'men';
}

function rankNumber(row: HistoricalResultRow): number {
  const direct = Number(row.rank_min ?? row.rank_max);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = cleanText(row.rank_label).match(/\d+/);
  return match ? Number(match[0]) : 999;
}

function tournamentDate(tourn: TournRow): string {
  return (tourn.date ?? tourn.tournament_date ?? '').toString().slice(0, 10);
}

function resultMatchKey(parts: { date?: string; category?: string; club?: string; division?: string }): string {
  return [
    cleanText(parts.date).slice(0, 10),
    cleanText(parts.category).toUpperCase(),
    normKey(parts.club),
    normalizeDivision(parts.division, parts.category),
  ].join('|');
}

function tournMatchKeys(tourn: TournRow): string[] {
  const date = tournamentDate(tourn);
  const category = normalizeJuniorCategory(tourn.category ?? '');
  const division = normalizeDivision(tourn.division ?? tourn.tournament_type ?? tourn.type, category);
  const club = normalizeClubName(tourn.club_name);
  const keys = [resultMatchKey({ date, category, club, division })];
  if ((tourn.tournament_type ?? tourn.type ?? '').toString().toUpperCase() === 'MEN&WOMEN') {
    keys.push(resultMatchKey({ date, category, club, division: 'men' }));
    keys.push(resultMatchKey({ date, category, club, division: 'women' }));
  }
  return Array.from(new Set(keys));
}

function mapHistorical(row: HistoricalResultRow): TResult {
  const category = normalizeJuniorCategory(row.category || row.junior_category || '');
  const clubName = normalizeClubName(row.club_name);
  const division = normalizeDivision(row.division, category);
  const date = cleanText(row.event_date);
  return {
    id: row.id,
    tournament_id: row.event_key,
    tournament_name: normalizeTournamentDisplayName(row.event_name, clubName),
    tournament_date: date,
    category,
    division,
    region: cleanText(row.region),
    club_name: clubName,
    rank: rankNumber(row),
    team_name: row.team_name ?? '',
    player1_name: cleanText(row.player1_name),
    player2_name: cleanText(row.player2_name),
    points: Math.ceil(Number(row.points) || 0),
    _source: 'historical',
    _match_key: resultMatchKey({ date, category, club: clubName, division }),
  };
}

function historicalPayload(row: Partial<TResult>) {
  const date = cleanText(row.tournament_date);
  const year = Number(date.slice(0, 4)) || 2026;
  const category = normalizeJuniorCategory(row.category ?? '');
  const division = normalizeDivision(row.division, category);
  const clubName = normalizeClubName(row.club_name);
  const eventName = normalizeTournamentDisplayName(row.tournament_name ?? '', clubName);
  const rank = Number(row.rank ?? 1);
  const id = row.id && row._source === 'historical'
    ? row.id
    : `admin-${row.tournament_id}-${division}-${rank}-${normKey(row.player1_name)}-${normKey(row.player2_name)}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .slice(0, 160);

  return {
    id,
    source_file: 'admin_results',
    sheet_name: `${eventName} - ${DIV_LABELS[division] ?? division}`,
    event_key: row.tournament_id ?? `${date}-${eventName}-${division}`,
    event_name: eventName,
    event_year: year,
    season: year,
    category,
    division,
    junior_category: division === 'junior' ? category : null,
    club_name: clubName,
    event_date: date,
    region: row.region ?? '',
    rank_label: `#${rank}`,
    rank_min: rank,
    rank_max: rank,
    team_name: row.team_name ?? '',
    player1_name: row.player1_name ?? '',
    player2_name: row.player2_name ?? '',
    points: Math.ceil(Number(row.points) || 0),
  };
}

async function fetchHistoricalAdminResults(sb: ReturnType<typeof getSupabaseClient>): Promise<TResult[]> {
  if (!sb) return [];
  const pageSize = 1000;
  const rows: HistoricalResultRow[] = [];
  for (let from = 0; from < 8000; from += pageSize) {
    const { data, error } = await sb
      .from('historical_tournament_results')
      .select(HISTORICAL_RESULT_COLUMNS)
      .eq('event_year', 2026)
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('rank_min', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as HistoricalResultRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows.map(mapHistorical);
}

function mergeResults(legacyRows: TResult[], historicalRows: TResult[]): TResult[] {
  const map = new Map<string, TResult>();
  for (const row of legacyRows) {
    const category = normalizeJuniorCategory(row.category);
    const clubName = normalizeClubName(row.club_name);
    const division = normalizeDivision(row.division, category);
    const normalized: TResult = {
      ...row,
      category,
      division,
      club_name: clubName,
      tournament_name: normalizeTournamentDisplayName(row.tournament_name, clubName),
      points: Math.ceil(Number(row.points) || 0),
      _source: 'legacy',
      _match_key: resultMatchKey({ date: row.tournament_date, category, club: clubName, division }),
    };
    map.set(`legacy:${normalized.id}`, normalized);
  }
  for (const row of historicalRows) {
    const dedupeKey = [
      row._match_key,
      row.rank,
      normKey(row.player1_name),
      normKey(row.player2_name),
      row.points,
    ].join('|');
    if (![...map.values()].some(existing => [
      existing._match_key,
      existing.rank,
      normKey(existing.player1_name),
      normKey(existing.player2_name),
      existing.points,
    ].join('|') === dedupeKey)) {
      map.set(`historical:${row.id}`, row);
    }
  }
  return Array.from(map.values());
}

const inp: React.CSSProperties = {
  width:'100%', background:'#1a1a1a',
  border:'1px solid rgba(255,255,255,0.15)', borderRadius:'8px',
  padding:'9px 12px', color:'white', fontSize:'13px',
  outline:'none', boxSizing:'border-box', colorScheme:'dark',
};
const lbl: React.CSSProperties = {
  display:'block', color:'#888', fontSize:'11px',
  fontWeight:600, marginBottom:'5px', textTransform:'uppercase', letterSpacing:'0.04em',
};
const btn = (color = '#4ad569', text = '#0a0a0a'): React.CSSProperties => ({
  background: color, color: text, border: 'none', borderRadius: '9px',
  padding: '9px 16px', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
  display: 'flex', alignItems: 'center', gap: '6px',
});

// ─────────────────────────────────────────────────────────────────────────────
//  MODAL SAISIE D'UNE LIGNE
// ─────────────────────────────────────────────────────────────────────────────
function RowModal({
  row, tourn, onSave, onClose,
}: {
  row: Partial<TResult>;
  tourn: TournRow;
  onSave: (r: Partial<TResult>) => Promise<boolean>;
  onClose: () => void;
}) {
  const [f, setF] = useState<Partial<TResult>>({
    tournament_id:   row.tournament_id   ?? tourn.id,
    tournament_name: row.tournament_name ?? tourn.name,
    tournament_date: row.tournament_date ?? (tourn.date ?? tourn.tournament_date ?? ''),
    category:        row.category        ?? (tourn.category ?? 'M25'),
    region:          row.region          ?? (tourn.region ?? ''),
    club_name:       row.club_name       ?? (tourn.club_name ?? ''),
    division:        row.division        ?? 'men',
    rank:            row.rank            ?? 1,
    team_name:       row.team_name       ?? '',
    player1_name:    row.player1_name    ?? '',
    player2_name:    row.player2_name    ?? '',
    points:          row.points          ?? pts(row.rank ?? 1, row.category ?? tourn.category ?? 'M25', 8),
    id:              row.id,
  });
  const [totalTeams, setTotalTeams] = useState<number>(row.points && row.rank ? 8 : 8);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof TResult, v: string | number) => {
    setF(prev => {
      const next = { ...prev, [k]: v };
      if (k === 'rank') next.points = pts(Number(v), next.category ?? 'M25', totalTeams);
      return next;
    });
  };

  const recalcPoints = (teams: number) => {
    setTotalTeams(teams);
    setF(prev => ({ ...prev, points: pts(prev.rank ?? 1, prev.category ?? 'M25', teams) }));
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(f);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px' }}>
      <div style={{ background:'#111',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'16px',padding:'28px',width:'100%',maxWidth:'480px',display:'flex',flexDirection:'column',gap:'16px' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <h3 style={{ color:'white',margin:0,fontSize:'16px',fontWeight:700 }}>
            {f.id ? 'Modifier' : 'Ajouter'} un résultat
          </h3>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#666',cursor:'pointer' }}><X size={18}/></button>
        </div>

        {/* Tournoi (lecture seule) */}
        <div style={{ background:'rgba(74,213,105,0.06)',borderRadius:'10px',padding:'10px 14px',border:'1px solid rgba(74,213,105,0.15)' }}>
          <div style={{ color:'#4ad569',fontWeight:700,fontSize:'13px' }}>{tourn.name}</div>
          <div style={{ color:'#666',fontSize:'11px',marginTop:'2px' }}>{fmtDate((tourn.date ?? tourn.tournament_date ?? '').toString())} · {tourn.category} · {tourn.region}</div>
        </div>

        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px' }}>
          {/* Division */}
          <div>
            <label style={lbl}>Division</label>
            <select value={f.division ?? 'men'} onChange={e => set('division', e.target.value)}
              style={{ ...inp }}>
              {DIVS.map(d => <option key={d} value={d} style={{ background:'#1a1a1a' }}>{DIV_LABELS[d]}</option>)}
            </select>
          </div>
          {/* Nb équipes */}
          <div>
            <label style={lbl}>Nb équipes total</label>
            <select value={totalTeams} onChange={e => recalcPoints(parseInt(e.target.value))}
              style={{ ...inp }}>
              {[4,8,12,16,20,24,28,32].map(n => (
                <option key={n} value={n} style={{ background:'#1a1a1a' }}>{n} équipes ({POINTS_BRACKETS[getBracketIndex(n)]})</option>
              ))}
            </select>
          </div>
          {/* Rang */}
          <div>
            <label style={lbl}>Rang</label>
            <select value={f.rank ?? 1} onChange={e => set('rank', parseInt(e.target.value))}
              style={{ ...inp }}>
              {Array.from({length:32},(_,i)=>i+1).map(r => (
                <option key={r} value={r} style={{ background:'#1a1a1a' }}>#{r} — {pts(r, f.category ?? 'M25', totalTeams)} pts</option>
              ))}
            </select>
          </div>
        </div>

        {/* Joueurs */}
        <div>
          <label style={lbl}>Joueur 1</label>
          <input value={f.player1_name ?? ''} onChange={e => set('player1_name', e.target.value)}
            placeholder="Prénom Nom" style={inp} />
        </div>
        <div>
          <label style={lbl}>Joueur 2</label>
          <input value={f.player2_name ?? ''} onChange={e => set('player2_name', e.target.value)}
            placeholder="Prénom Nom (ou vide si solo)" style={inp} />
        </div>

        {/* Nom de l'équipe (auto) */}
        <div style={{ display:'grid',gridTemplateColumns:'1fr auto',gap:'8px',alignItems:'end' }}>
          <div>
            <label style={lbl}>Nom équipe</label>
            <input value={f.team_name ?? ''} onChange={e => set('team_name', e.target.value)}
              placeholder="Ex: NICOLAS/VALENTIN" style={inp} />
          </div>
          <button type="button" onClick={() => {
            const t = [f.player1_name, f.player2_name].filter(Boolean).map(n => (n ?? '').split(' ')[0].toUpperCase()).join('/');
            set('team_name', t);
          }} style={{ ...btn('rgba(255,255,255,0.06)', '#aaa'), border:'1px solid rgba(255,255,255,0.1)', padding:'9px 12px', fontSize:'11px', borderRadius:'8px', whiteSpace:'nowrap' }}>
            Auto
          </button>
        </div>

        {/* Points */}
        <div>
          <label style={lbl}>Points <span style={{color:'#4ad569',fontWeight:400,fontSize:'11px'}}>(auto-calculé selon {f.category ?? 'M25'} / {totalTeams} équipes)</span></label>
          <input type="number" value={f.points ?? 0} onChange={e => set('points', parseInt(e.target.value) || 0)}
            style={inp} min={0} max={2000} />
        </div>

        {/* Actions */}
        <div style={{ display:'flex',gap:'10px',marginTop:'4px' }}>
          <button onClick={onClose} style={{ ...btn('rgba(255,255,255,0.05)', '#888'), border:'1px solid rgba(255,255,255,0.1)', flex:1 }}>
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving} style={{ ...btn('#4ad569'), flex:2, justifyContent:'center', opacity:saving?0.7:1 }}>
            <Save size={14}/>{saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PANNEAU SAISIE RAPIDE (inline, par division)
// ─────────────────────────────────────────────────────────────────────────────
function QuickEntryPanel({
  tourn, onImport, onClose,
}: {
  tourn: TournRow;
  onImport: (rows: Partial<TResult>[]) => Promise<{ ok: number; fail: number }>;
  onClose: () => void;
}) {
  const [division, setDivision] = useState('men');
  const [totalTeams, setTotalTeams] = useState(16);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Partial<TResult>[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number } | null>(null);
  const [mode, setMode] = useState<'quick' | 'csv' | 'sql'>('quick');
  const [copied, setCopied] = useState(false);

  const d = (tourn.date ?? tourn.tournament_date ?? '').toString().slice(0, 10);
  const cat = tourn.category ?? 'M25';
  const ctxBase: Partial<TResult> = {
    tournament_id: tourn.id,
    tournament_name: tourn.name,
    tournament_date: d,
    category: tourn.category ?? 'M25',
    region: tourn.region ?? '',
    club_name: tourn.club_name ?? '',
    division,
  };

  // Parser le texte
  useEffect(() => {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (!lines.length) { setPreview([]); return; }

    const rows: Partial<TResult>[] = [];

    if (mode === 'quick') {
      // Formats acceptés (1 paire par ligne) :
      //  A) "1. Joueur1 / Joueur2"          → rang explicite
      //  B) "1. Joueur1 / Joueur2 (250)"    → rang + points explicites
      //  C) "1. Joueur1 / Joueur2 | 250"    → rang + points avec |
      //  D) "Joueur1 / Joueur2 | 250"        → rang auto + points explicites
      //  E) "Joueur1 / Joueur2"              → rang auto, points calculés
      //  Séparateurs joueurs : / | virgule
      let autoRank = 1;
      lines.forEach((line, i) => {
        let rank = 0;
        let p1 = '', p2 = '', customPts = 0;

        // 1) Extraire rang en début de ligne : "3." ou "3)" ou "3 "
        const rankPrefixMatch = line.match(/^(\d+)[.)\s]\s*/);
        if (rankPrefixMatch) {
          rank = parseInt(rankPrefixMatch[1]);
          line = line.slice(rankPrefixMatch[0].length).trim();
          autoRank = rank + 1;
        } else {
          rank = autoRank++;
        }

        // 2) Extraire points en fin de ligne : "(250)" ou "| 250" ou "- 250"
        const ptsSuffixMatch = line.match(/[\|(\-]\s*(\d+)\s*\)?\s*$/);
        if (ptsSuffixMatch) {
          customPts = parseInt(ptsSuffixMatch[1]);
          line = line.slice(0, line.lastIndexOf(ptsSuffixMatch[0])).trim();
        }

        // 3) Séparer joueur1 / joueur2
        const parts = line.split(/\//).map(s => s.trim()).filter(Boolean);
        p1 = parts[0] ?? '';
        p2 = parts[1] ?? '';

        const teamName = [p1, p2].filter(Boolean).map(n => n.split(' ')[0].toUpperCase()).join('/');
        const finalPts = customPts || pts(rank, cat, totalTeams);
        rows.push({ ...ctxBase, id: `res-${Date.now()}-${Math.random().toString(36).slice(2,8)}-${i}`, rank, player1_name: p1, player2_name: p2, team_name: teamName, points: finalPts });
      });
    } else {
      // CSV : colonnes auto-détectées
      const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
      const hasHeader = /rank|rang|joueur|player|equipe|team/i.test(lines[0]);
      const dataLines = hasHeader ? lines.slice(1) : lines;
      dataLines.forEach((line, i) => {
        const cols = line.split(sep).map(s => s.trim().replace(/^["']|["']$/g, ''));
        // Essayer de détecter: rang, joueur1, joueur2, division, points
        let rank = i + 1, p1 = '', p2 = '', div = division, p = 0, team = '';
        if (cols.length >= 4) {
          const maybeRank = parseInt(cols[0]);
          if (!isNaN(maybeRank)) {
            rank = maybeRank; p1 = cols[1]; p2 = cols[2];
            if (cols[3] && DIVS.includes(cols[3].toLowerCase())) div = cols[3].toLowerCase();
            if (cols[4]) p = parseInt(cols[4]) || pts(rank, cat, totalTeams);
            else p = pts(rank, cat, totalTeams);
          } else {
            p1 = cols[0]; p2 = cols[1];
          }
        } else if (cols.length === 3) {
          p1 = cols[0]; p2 = cols[1]; p = parseInt(cols[2]) || pts(rank, cat, totalTeams);
        } else if (cols.length === 2) {
          p1 = cols[0]; p2 = cols[1]; p = pts(rank, cat, totalTeams);
        } else {
          p1 = cols[0]; p = pts(rank, cat, totalTeams);
        }
        team = [p1, p2].filter(Boolean).map(n => n.split(' ')[0].toUpperCase()).join('/');
        rows.push({ ...ctxBase, division: div, id: `res-${Date.now()}-${Math.random().toString(36).slice(2,8)}-${i}`, rank, player1_name: p1, player2_name: p2, team_name: team, points: p || pts(rank, cat, totalTeams) });
      });
    }
    setPreview(rows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, division, mode, totalTeams]);

  // SQL preview
  const sqlRows = preview.map(r =>
    `  ('${r.id}','${r.tournament_id}','${r.tournament_name}','${r.tournament_date}','${r.category}','${r.division}','${r.region}','${r.club_name}',${r.rank},'${r.team_name}','${r.player1_name}','${r.player2_name}',${r.points})`
  ).join(',\n');
  const sql = preview.length
    ? `INSERT INTO tournament_results (id,tournament_id,tournament_name,tournament_date,category,division,region,club_name,rank,team_name,player1_name,player2_name,points)\nVALUES\n${sqlRows}\nON CONFLICT (id) DO UPDATE SET rank=EXCLUDED.rank,points=EXCLUDED.points;`
    : '';

  const doImport = async () => {
    if (!preview.length) return;
    setImporting(true);
    const r = await onImport(preview);
    setResult(r);
    setImporting(false);
  };

  const copySQL = () => {
    navigator.clipboard.writeText(sql).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div style={{ background:'#0d0d0d',border:'1px solid rgba(74,213,105,0.2)',borderRadius:'14px',padding:'22px',marginTop:'12px',display:'flex',flexDirection:'column',gap:'14px' }}>
      {/* Header */}
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
        <div style={{ display:'flex',alignItems:'center',gap:'8px' }}>
          <Zap size={15} color="#f59e0b"/>
          <span style={{ color:'white',fontWeight:700,fontSize:'14px' }}>Saisie rapide — {tourn.name}</span>
        </div>
        <button onClick={onClose} style={{ background:'none',border:'none',color:'#555',cursor:'pointer' }}><X size={16}/></button>
      </div>

      {/* Mode tabs */}
      <div style={{ display:'flex',gap:'6px',background:'rgba(255,255,255,0.04)',borderRadius:'10px',padding:'4px' }}>
        {(['quick','csv','sql'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            flex:1, padding:'7px', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'12px', fontWeight:600,
            background: mode === m ? '#1a1a1a' : 'transparent',
            color: mode === m ? 'white' : '#555',
          }}>
            {m === 'quick' ? '✏️ Saisie rapide' : m === 'csv' ? '📋 Coller CSV' : '🗄️ SQL'}
          </button>
        ))}
      </div>

      {/* Division + Nb équipes */}
      <div style={{ display:'flex',gap:'12px',flexWrap:'wrap',alignItems:'center' }}>
        <div style={{ display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center' }}>
          <label style={{ ...lbl, margin:0 }}>Division :</label>
          {DIVS.map(d => (
            <button key={d} onClick={() => setDivision(d)} style={{
              padding:'5px 12px', borderRadius:'20px', border:`1px solid ${division===d?DIV_COLORS[d]:'rgba(255,255,255,0.1)'}`,
              background: division===d ? `${DIV_COLORS[d]}18` : 'transparent',
              color: division===d ? DIV_COLORS[d] : '#666', cursor:'pointer', fontSize:'12px', fontWeight:600,
            }}>{DIV_LABELS[d]}</button>
          ))}
        </div>
        <div style={{ display:'flex',gap:'8px',alignItems:'center' }}>
          <label style={{ ...lbl, margin:0 }}>Nb équipes :</label>
          <select value={totalTeams} onChange={e => { setTotalTeams(parseInt(e.target.value)); setText(t => t); }}
            style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'8px', padding:'5px 10px', color:'white', fontSize:'12px' }}>
            {[4,8,12,16,20,24,28,32].map(n => (
              <option key={n} value={n} style={{ background:'#1a1a1a' }}>{n} ({POINTS_BRACKETS[getBracketIndex(n)]})</option>
            ))}
          </select>
          <span style={{ color:'#4ad569', fontSize:'11px' }}>→ {cat} #{1} = {pts(1, cat, totalTeams)}pts</span>
        </div>
      </div>

      {mode !== 'sql' && (
        <div>
          <label style={lbl}>
            {mode === 'quick'
              ? 'Saisie rapide — 1 paire par ligne :'
              : 'Collez un tableau CSV (colonnes: rang, joueur1, joueur2, division, points) :'}
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={mode === 'quick'
              ? '1. Nicolas De Caritat / Valentin Beriot (250)\n2. Ibrahim Dala / Mohammad Peersaib (163)\n3. Mahe Henri / Jean François Henri (138)\n...\n\n— OU sans rang ni points —\nNicolas De Caritat / Valentin Beriot\nIbrahim Dala / Mohammad Peersaib'
              : '1,Nicolas De Caritat,Valentin Beriot,men,25\n2,Ibrahim Dala,Mohammad Peersaib,men,15\n...'}
            rows={9}
            style={{ ...inp, resize:'vertical', fontFamily:'monospace', fontSize:'12px', lineHeight:'1.6' }}
          />
          <div style={{ color:'#555',fontSize:'11px',margin:'6px 0 0',lineHeight:'1.7' }}>
            {mode === 'quick' ? (
              <>
                <span style={{color:'#4ad569'}}>Formats acceptés :</span><br/>
                <code style={{color:'#aaa'}}>1. Joueur1 / Joueur2 (points)</code> — rang + points explicites<br/>
                <code style={{color:'#aaa'}}>1. Joueur1 / Joueur2</code> — rang explicite, points auto-calculés<br/>
                <code style={{color:'#aaa'}}>Joueur1 / Joueur2 (points)</code> — rang auto, points explicites<br/>
                <code style={{color:'#aaa'}}>Joueur1 / Joueur2</code> — rang auto, points auto-calculés
              </>
            ) : 'En-tête optionnel. Séparateurs: virgule, point-virgule, tabulation.'}
          </div>
        </div>
      )}

      {/* SQL output */}
      {mode === 'sql' && (
        <div style={{ display:'flex',flexDirection:'column',gap:'8px' }}>
          {sql ? (
            <>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                <label style={lbl}>SQL généré depuis la saisie rapide :</label>
                <button onClick={copySQL} style={{ ...btn('rgba(255,255,255,0.05)', '#aaa'), border:'1px solid rgba(255,255,255,0.1)', padding:'5px 10px', fontSize:'11px', borderRadius:'7px' }}>
                  {copied ? <><Check size={11}/>Copié !</> : <><Copy size={11}/>Copier</>}
                </button>
              </div>
              <pre style={{ background:'#0a0a0a',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'10px',padding:'14px',fontSize:'11px',color:'#4ad569',overflowX:'auto',margin:0,lineHeight:'1.6',whiteSpace:'pre-wrap',fontFamily:'monospace',maxHeight:'260px',overflowY:'auto' }}>
                {sql}
              </pre>
            </>
          ) : (
            <div style={{ color:'#444',textAlign:'center',padding:'30px',background:'rgba(255,255,255,0.02)',borderRadius:'10px',border:'1px solid rgba(255,255,255,0.05)' }}>
              ← Saisissez d'abord des données dans "Saisie rapide" ou "CSV"
            </div>
          )}
        </div>
      )}

      {/* Aperçu */}
      {preview.length > 0 && mode !== 'sql' && (
        <div>
          <label style={{ ...lbl, color:'#4ad569' }}>Aperçu — {preview.length} paires à importer</label>
          <div style={{ background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:'10px',overflow:'hidden',maxHeight:'220px',overflowY:'auto' }}>
            <table style={{ width:'100%',borderCollapse:'collapse',fontSize:'12px' }}>
              <thead style={{ position:'sticky',top:0,background:'#141414' }}>
                <tr>
                  {['#','Joueur 1','Joueur 2','Pts'].map(h=>(
                    <th key={h} style={{ padding:'7px 10px',color:'#555',textAlign:h==='#'||h==='Pts'?'center':'left',fontWeight:600,fontSize:'10px',textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r,i)=>{
                  const m = medal(r.rank??1);
                  return (
                    <tr key={i} style={{ borderTop:'1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding:'6px 10px',textAlign:'center',fontWeight:700,color:m.color }}>{m.icon}</td>
                      <td style={{ padding:'6px 10px',color:'rgba(255,255,255,0.85)' }}>{r.player1_name}</td>
                      <td style={{ padding:'6px 10px',color:'rgba(255,255,255,0.5)' }}>{r.player2_name||'—'}</td>
                      <td style={{ padding:'6px 10px',textAlign:'center',color:'#4ad569',fontWeight:700 }}>+{r.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Résultat */}
      {result && (
        <div style={{ background:result.fail===0?'rgba(74,213,105,0.08)':'rgba(239,68,68,0.08)',border:`1px solid ${result.fail===0?'rgba(74,213,105,0.2)':'rgba(239,68,68,0.2)'}`,borderRadius:'10px',padding:'12px 16px',display:'flex',alignItems:'center',gap:'10px' }}>
          {result.fail===0
            ? <><CheckCircle size={16} color="#4ad569"/><span style={{ color:'#4ad569',fontWeight:700 }}>{result.ok} paires importées avec succès !</span></>
            : <><AlertCircle size={16} color="#ef4444"/><span style={{ color:'#ef4444',fontWeight:700 }}>{result.ok} OK · {result.fail} erreurs</span></>
          }
        </div>
      )}

      {/* Actions */}
      {mode !== 'sql' && (
        <div style={{ display:'flex',gap:'8px' }}>
          <button onClick={onClose} style={{ ...btn('rgba(255,255,255,0.05)', '#888'), border:'1px solid rgba(255,255,255,0.1)', flex:1, justifyContent:'center' }}>
            {result ? 'Fermer' : 'Annuler'}
          </button>
          {!result && (
            <button onClick={doImport} disabled={importing || preview.length === 0} style={{
              ...btn(preview.length ? '#4ad569' : '#1a1a1a', preview.length ? '#0a0a0a' : '#444'),
              flex:2, justifyContent:'center', opacity:importing?0.7:1,
              cursor:preview.length?'pointer':'not-allowed',
            }}>
              <Upload size={14}/>{importing ? 'Import…' : `Importer ${preview.length} paire${preview.length>1?'s':''}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  CARTE TOURNOI TERMINÉ
// ─────────────────────────────────────────────────────────────────────────────
function TournamentCard({
  tourn, results, onAdd, onAddSingle, onEdit, onDelete,
}: {
  tourn: TournRow;
  results: TResult[];
  onAdd: (tourn: TournRow) => void;
  onAddSingle: (tourn: TournRow) => void;
  onEdit: (r: TResult, tourn: TournRow) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(true);

  const d = (tourn.date ?? tourn.tournament_date ?? '').toString().slice(0, 10);
  const catColor = CAT_COLORS[tourn.category ?? 'M25'] ?? '#4ad569';

  // Grouper par division
  const byDiv: Record<string, TResult[]> = {};
  for (const r of results) {
    if (!byDiv[r.division]) byDiv[r.division] = [];
    byDiv[r.division].push(r);
    byDiv[r.division].sort((a, b) => a.rank - b.rank);
  }
  const hasResults = results.length > 0;

  return (
    <div style={{ background:'#0d0d0d',border:`1px solid ${hasResults ? 'rgba(255,255,255,0.08)' : 'rgba(245,158,11,0.2)'}`,borderRadius:'14px',marginBottom:'14px',overflow:'hidden' }}>
      {/* Header de la carte */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display:'flex',alignItems:'center',gap:'12px',padding:'14px 18px',cursor:'pointer',
          background: hasResults ? 'rgba(255,255,255,0.02)' : 'rgba(245,158,11,0.04)' }}
      >
        {/* Badge catégorie */}
        <span style={{ background:`${catColor}20`,color:catColor,border:`1px solid ${catColor}40`,borderRadius:'6px',padding:'3px 9px',fontSize:'11px',fontWeight:800,letterSpacing:'0.05em',flexShrink:0 }}>
          {tourn.category ?? '—'}
        </span>
        {/* Nom */}
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ color:'white',fontWeight:700,fontSize:'14px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{tourn.name}</div>
          <div style={{ display:'flex',gap:'12px',marginTop:'2px',flexWrap:'wrap' }}>
            <span style={{ color:'#555',fontSize:'11px',display:'flex',alignItems:'center',gap:'3px' }}>
              <Calendar size={10}/>{fmtDate(d)}
            </span>
            {tourn.region && <span style={{ color:'#555',fontSize:'11px',display:'flex',alignItems:'center',gap:'3px' }}><MapPin size={10}/>{tourn.region}</span>}
            {tourn.club_name && <span style={{ color:'#555',fontSize:'11px',display:'flex',alignItems:'center',gap:'3px' }}><Users size={10}/>{tourn.club_name}</span>}
          </div>
        </div>
        {/* Stats */}
        <div style={{ display:'flex',gap:'8px',alignItems:'center',flexShrink:0 }}>
          {hasResults
            ? <span style={{ background:'rgba(74,213,105,0.1)',color:'#4ad569',borderRadius:'20px',padding:'3px 10px',fontSize:'11px',fontWeight:700 }}>
                ✓ {results.length} paires
              </span>
            : <span style={{ background:'rgba(245,158,11,0.1)',color:'#f59e0b',borderRadius:'20px',padding:'3px 10px',fontSize:'11px',fontWeight:700 }}>
                ⚠ Sans résultats
              </span>
          }
          {open ? <ChevronUp size={14} color="#555"/> : <ChevronDown size={14} color="#555"/>}
        </div>
      </div>

      {/* Corps */}
      {open && (
        <div style={{ padding:'0 18px 18px' }}>
          {/* Boutons actions */}
          <div style={{ display:'flex',gap:'8px',marginBottom:'14px',marginTop:'2px',flexWrap:'wrap' }}>
            <button onClick={() => onAdd(tourn)} style={{
              ...btn('rgba(245,158,11,0.1)','#f59e0b'),
              border:`1px solid rgba(245,158,11,0.25)`, padding:'7px 12px', fontSize:'12px',
            }}>
              <Zap size={12}/>Saisie rapide
            </button>
            <button onClick={() => onAddSingle(tourn)} style={{
              ...btn('rgba(74,213,105,0.08)','#4ad569'),
              border:'1px solid rgba(74,213,105,0.2)', padding:'7px 12px', fontSize:'12px',
            }}>
              <Plus size={12}/>Ajouter une paire
            </button>
          </div>



          {/* Tableau par division */}
          {Object.keys(byDiv).length > 0 ? (
            DIVS.filter(d => byDiv[d]?.length > 0).map(div => (
              <div key={div} style={{ marginBottom:'12px' }}>
                <div style={{ display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px' }}>
                  <span style={{ background:`${DIV_COLORS[div]}18`,color:DIV_COLORS[div],border:`1px solid ${DIV_COLORS[div]}30`,borderRadius:'20px',padding:'2px 10px',fontSize:'11px',fontWeight:700 }}>
                    {DIV_LABELS[div]}
                  </span>
                  <span style={{ color:'#444',fontSize:'11px' }}>{byDiv[div].length} paires</span>
                </div>
                <div style={{ background:'#0a0a0a',borderRadius:'10px',border:'1px solid rgba(255,255,255,0.05)',overflow:'hidden' }}>
                  <table style={{ width:'100%',borderCollapse:'collapse',fontSize:'12px' }}>
                    <thead>
                      <tr style={{ background:'rgba(255,255,255,0.03)' }}>
                        {['#','Équipe','Joueur 1','Joueur 2','Pts',''].map(h => (
                          <th key={h} style={{ padding:'7px 10px',color:'#444',textAlign:h==='#'||h==='Pts'?'center':'left',fontWeight:600,fontSize:'10px',textTransform:'uppercase',whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {byDiv[div].map(r => {
                        const m = medal(r.rank);
                        return (
                          <tr key={r.id} style={{ borderTop:'1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding:'8px 10px',textAlign:'center',fontWeight:700,color:m.color,fontSize:'14px' }}>{m.icon}</td>
                            <td style={{ padding:'8px 10px',color:'#aaa',fontSize:'11px',maxWidth:'120px',overflow:'hidden',textOverflow:'ellipsis' }}>{r.team_name}</td>
                            <td style={{ padding:'8px 10px',color:'rgba(255,255,255,0.85)',fontWeight:500 }}>{r.player1_name}</td>
                            <td style={{ padding:'8px 10px',color:'rgba(255,255,255,0.5)' }}>{r.player2_name || '—'}</td>
                            <td style={{ padding:'8px 10px',textAlign:'center',color:'#4ad569',fontWeight:700 }}>+{r.points}</td>
                            <td style={{ padding:'8px 10px',textAlign:'right' }}>
                              <div style={{ display:'flex',gap:'4px',justifyContent:'flex-end' }}>
                                <button onClick={() => onEdit(r, tourn)} style={{ background:'rgba(255,255,255,0.04)',border:'none',borderRadius:'5px',padding:'4px 7px',cursor:'pointer',color:'#888' }}>
                                  <Pencil size={11}/>
                                </button>
                                <button onClick={() => onDelete(r.id, r.team_name || r.player1_name)} style={{ background:'rgba(239,68,68,0.08)',border:'none',borderRadius:'5px',padding:'4px 7px',cursor:'pointer',color:'#ef4444' }}>
                                  <Trash2 size={11}/>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          ) : (
            <div style={{ textAlign:'center',padding:'24px',color:'#444',background:'rgba(255,255,255,0.02)',borderRadius:'10px',border:'1px solid rgba(255,255,255,0.04)',fontSize:'13px' }}>
              <Award size={24} color="#222" style={{ marginBottom:'8px',display:'block',margin:'0 auto 8px' }}/>
              Aucun résultat saisi — cliquez sur <strong style={{ color:'#f59e0b' }}>Saisie rapide</strong> pour commencer
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE PRINCIPALE
// ─────────────────────────────────────────────────────────────────────────────
export default function ResultsAdminPage() {
  const [results,      setResults]     = useState<TResult[]>([]);
  const [tournaments,  setTournaments] = useState<TournRow[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [error,        setError]       = useState('');
  const [editing,      setEditing]     = useState<{ row: Partial<TResult>; tourn: TournRow } | null>(null);
  const [quickTourn,   setQuickTourn]  = useState<TournRow | null>(null);
  const [search,       setSearch]      = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'done' | 'missing'>('all');

  // ── Chargement ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError('');
    const sb = getSupabaseClient();
    if (isSupabaseConnected() && sb) {
      // ── Timeout de sécurité : 8 secondes max ──────────────────────────────
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        setLoading(false);
        setError('⏱ Chargement trop long — vérifiez la connexion Supabase ou les permissions RLS.');
      }, 8000);

      try {
        const [rd, hd, td] = await Promise.all([
          sb.from('tournament_results').select('*').limit(2000),
          fetchHistoricalAdminResults(sb).then(data => ({ data, error: null })).catch(error => ({ data: [] as TResult[], error })),
          sb.from('tournaments').select('*').limit(1000),
        ]);
        if (timedOut) return; // le timeout a déjà affiché l'erreur
        clearTimeout(timeoutId);

        if (rd.error && hd.error) {
          setError(`❌ Résultats : ${rd.error.message ?? 'Erreur inconnue'}`);
        } else {
          if (hd.error) console.warn('[Admin Results] historique indisponible:', hd.error);
          setResults(mergeResults((rd.data ?? []) as TResult[], (hd.data ?? []) as TResult[]));
        }

        if (td.error) {
          if (!rd.error) setError(`❌ Tournois : ${td.error.message ?? 'Erreur inconnue'}`); // n'écrase pas l'erreur de results si déjà présente
        } else {
          setTournaments(((td.data ?? []) as TournRow[]).map(tournament => ({
            ...tournament,
            category: normalizeJuniorCategory(tournament.category ?? ''),
            name: normalizeTournamentDisplayName(tournament.name, tournament.club_name),
          })));
        }
      } catch (e: unknown) {
        if (!timedOut) {
          clearTimeout(timeoutId);
          const msg = e instanceof Error ? e.message : String(e);
          setError(`❌ Erreur inattendue : ${msg}`);
        }
      }
    } else {
      setError('⚠ Supabase non connecté — mode lecture seule (données de démonstration)');
      setResults([]);
      setTournaments([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Sauvegarder une ligne ────────────────────────────────────────────────────
  const saveSingle = async (row: Partial<TResult>): Promise<boolean> => {
    const sb = getSupabaseClient();
    if (!sb) return false;
    const payload = {
      tournament_id:   row.tournament_id   ?? '',
      tournament_name: row.tournament_name ?? '',
      tournament_date: row.tournament_date ?? '',
      category:        row.category        ?? '',
      division:        row.division        ?? 'men',
      region:          row.region          ?? '',
      club_name:       row.club_name       ?? '',
      rank:            row.rank            ?? 1,
      team_name:       row.team_name       ?? '',
      player1_name:    row.player1_name    ?? '',
      player2_name:    row.player2_name    ?? '',
      points:          row.points          ?? 0,
    };
    const isEdit = results.some(r => r.id === row.id);
    let err: { message: string } | null = null;
    let savedId = row.id && !row.id.startsWith('res-') ? row.id : crypto.randomUUID();
    if (isEdit && row._source !== 'historical') {
      ({ error: err } = await sb.from('tournament_results').update(payload).eq('id', row.id!));
    } else {
      ({ error: err } = await sb.from('tournament_results').upsert({ id: savedId, ...payload }, { onConflict: 'id' }));
    }
    if (err) { setError(err.message); return false; }
    const hist = historicalPayload({ id: row._source === 'historical' ? row.id : savedId, _source: row._source, ...payload });
    const { error: histErr } = await sb.from('historical_tournament_results').upsert(hist, { onConflict: 'id' });
    if (histErr) { setError(histErr.message); return false; }
    await load(); return true;
  };

  // ── Import en lot ────────────────────────────────────────────────────────────
  const bulkImport = async (rows: Partial<TResult>[]): Promise<{ ok: number; fail: number }> => {
    const sb = getSupabaseClient();
    if (!sb) return { ok: 0, fail: rows.length };
    let ok = 0, fail = 0;
    for (let i = 0; i < rows.length; i += 20) {
      const batch = rows.slice(i, i + 20).map((r, j) => ({
        id: (r.id && !r.id.startsWith('res-')) ? r.id : crypto.randomUUID(),
        tournament_id: r.tournament_id ?? '', tournament_name: r.tournament_name ?? '',
        tournament_date: r.tournament_date ?? '', category: r.category ?? '',
        division: r.division ?? 'men', region: r.region ?? '', club_name: r.club_name ?? '',
        rank: r.rank ?? 1, team_name: r.team_name ?? '',
        player1_name: r.player1_name ?? '', player2_name: r.player2_name ?? '',
        points: r.points ?? 0,
      }));
      const { error: e } = await sb.from('tournament_results').upsert(batch, { onConflict: 'id' });
      const historicalBatch = batch.map(row => historicalPayload(row));
      const { error: histError } = await sb.from('historical_tournament_results').upsert(historicalBatch, { onConflict: 'id' });
      if (e || histError) {
        fail += batch.length;
        setError(e?.message ?? histError?.message ?? 'Erreur import resultats');
      } else ok += batch.length;
    }
    await load(); return { ok, fail };
  };


  // ── Suppression ──────────────────────────────────────────────────────────────
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer "${name}" ?`)) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    const [legacyDelete, historicalDelete] = await Promise.all([
      sb.from('tournament_results').delete().eq('id', id),
      sb.from('historical_tournament_results').delete().eq('id', id),
    ]);
    const e = legacyDelete.error ?? historicalDelete.error;
    if (e) setError(e.message); else await load();
  };

  // ── Tournois terminés + résultats groupés ────────────────────────────────────
  // Un tournoi est "terminé" si :
  //   1. Son statut Supabase est explicitement 'completed'/'terminé', OU
  //   2. Sa date est passée (< aujourd'hui) selon computeTournamentStatus
  const completedTourns = useMemo(() => tournaments
    .filter(t => {
      const d = (t.date ?? t.tournament_date ?? '').toString();
      const autoStat = computeTournamentStatus(d, t.status);
      return autoStat === 'completed';
    })
    .sort((a, b) => {
      const da = (a.date ?? a.tournament_date ?? '').toString();
      const db = (b.date ?? b.tournament_date ?? '').toString();
      return db.localeCompare(da);
    }), [tournaments]);

  const resultsByTourn: Record<string, TResult[]> = useMemo(() => {
    const map: Record<string, TResult[]> = {};
    for (const r of results) {
      if (!map[r.tournament_id]) map[r.tournament_id] = [];
      map[r.tournament_id].push(r);
      if (r._match_key) {
        if (!map[r._match_key]) map[r._match_key] = [];
        map[r._match_key].push(r);
      }
    }
    return map;
  }, [results]);

  const resultsForTournament = useCallback((t: TournRow): TResult[] => {
    const seen = new Set<string>();
    const rows: TResult[] = [];
    for (const key of [t.id, ...tournMatchKeys(t)]) {
      for (const row of resultsByTourn[key] ?? []) {
        const dedupe = `${row.id}|${row.rank}|${row.player1_name}|${row.player2_name}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        rows.push(row);
      }
    }
    return rows.sort((a, b) => normalizeDivision(a.division, a.category).localeCompare(normalizeDivision(b.division, b.category)) || a.rank - b.rank);
  }, [resultsByTourn]);

  // Filtrage + recherche
  const filtered = completedTourns.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !q || t.name.toLowerCase().includes(q) || (t.club_name ?? '').toLowerCase().includes(q);
    const hasRes = resultsForTournament(t).length > 0;
    const matchStatus = filterStatus === 'all' || (filterStatus === 'done' && hasRes) || (filterStatus === 'missing' && !hasRes);
    return matchSearch && matchStatus;
  });

  const totalMissing  = completedTourns.filter(t => resultsForTournament(t).length === 0).length;
  const totalWithRes  = completedTourns.length - totalMissing;
  const pctComplete   = completedTourns.length > 0
    ? Math.round((totalWithRes / completedTourns.length) * 100) : 0;

  return (
    <div>
      {/* ── En-tête ── */}
      <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:'12px',marginBottom:'16px' }}>
        <div>
          <div style={{ display:'flex',alignItems:'center',gap:'10px',marginBottom:'6px' }}>
            <Trophy size={20} color="#4ad569"/>
            <h2 style={{ color:'white',fontWeight:700,margin:0,fontSize:'19px' }}>Résultats des Tournois</h2>
            {isSupabaseConnected()
              ? <span style={{ background:'rgba(74,213,105,0.1)',color:'#4ad569',border:'1px solid rgba(74,213,105,0.2)',borderRadius:'6px',padding:'2px 8px',fontSize:'10px',fontWeight:700 }}>🟢 Supabase</span>
              : <span style={{ background:'rgba(245,158,11,0.1)',color:'#f59e0b',border:'1px solid rgba(245,158,11,0.2)',borderRadius:'6px',padding:'2px 8px',fontSize:'10px',fontWeight:700 }}>🟡 Hors ligne</span>
            }
          </div>
          {/* Barre de progression résultats */}
          <div style={{ display:'flex',gap:'16px',alignItems:'center',flexWrap:'wrap' }}>
            {[
              { label:'Terminés',           value: completedTourns.length, color:'#6b7280' },
              { label:'Avec résultats ✓',   value: totalWithRes,           color:'#4ad569' },
              { label:'Sans résultats ⚠',   value: totalMissing,           color: totalMissing > 0 ? '#f59e0b' : '#555' },
            ].map(s => (
              <div key={s.label} style={{ display:'flex',alignItems:'center',gap:'5px' }}>
                <span style={{ color:s.color, fontWeight:800, fontSize:'16px' }}>{s.value}</span>
                <span style={{ color:'#555', fontSize:'11px' }}>{s.label}</span>
              </div>
            ))}
            {/* Barre progression */}
            <div style={{ display:'flex',alignItems:'center',gap:'6px' }}>
              <div style={{ width:'120px',height:'5px',background:'rgba(255,255,255,0.08)',borderRadius:'3px',overflow:'hidden' }}>
                <div style={{ width:`${pctComplete}%`,height:'100%',background: pctComplete === 100 ? '#4ad569' : '#f59e0b',borderRadius:'3px',transition:'width 0.5s' }}/>
              </div>
              <span style={{ color: pctComplete === 100 ? '#4ad569' : '#f59e0b', fontSize:'11px', fontWeight:700 }}>{pctComplete}%</span>
            </div>
          </div>
        </div>
        <button onClick={load} style={{ display:'flex',alignItems:'center',gap:'5px',background:'rgba(255,255,255,0.04)',color:'#888',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'8px',padding:'8px 12px',cursor:'pointer',fontSize:'12px' }}>
          <RefreshCw size={12}/> Actualiser
        </button>
      </div>

      {/* ── Erreur ── */}
      {error && (
        <div style={{ background:'rgba(245,158,11,0.06)',color:'#f59e0b',borderRadius:'10px',padding:'10px 14px',marginBottom:'16px',fontSize:'12px',display:'flex',alignItems:'center',gap:'8px',border:'1px solid rgba(245,158,11,0.2)' }}>
          <AlertCircle size={14}/>{error}
        </div>
      )}

      {/* ── Barre filtres ── */}
      <div style={{ display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap' }}>
        <div style={{ position:'relative',flex:1,minWidth:'200px' }}>
          <span style={{ position:'absolute',left:'10px',top:'50%',transform:'translateY(-50%)',color:'#444',fontSize:'12px' }}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher un tournoi…"
            style={{ ...inp,paddingLeft:'30px' }}/>
        </div>
        {(['all','done','missing'] as const).map(f => (
          <button key={f} onClick={() => setFilterStatus(f)} style={{
            padding:'8px 14px',borderRadius:'8px',border:`1px solid ${filterStatus===f?'rgba(74,213,105,0.3)':'rgba(255,255,255,0.08)'}`,
            background:filterStatus===f?'rgba(74,213,105,0.08)':'transparent',
            color:filterStatus===f?'#4ad569':'#555',cursor:'pointer',fontSize:'12px',fontWeight:600,
          }}>
            {f==='all' ? '📋 Tous' : f==='done' ? '✅ Avec résultats' : '⚠ Sans résultats'}
          </button>
        ))}
      </div>

      {/* ── Contenu ── */}
      {loading ? (
        <div style={{ textAlign:'center',padding:'60px',color:'#444',display:'flex',flexDirection:'column',alignItems:'center',gap:'12px' }}>
          <RefreshCw size={24} style={{ animation:'spin 1s linear infinite' }}/>
          <p style={{ margin:0,fontSize:'13px' }}>Chargement…</p>
        </div>
      ) : completedTourns.length === 0 ? (
        <div style={{ textAlign:'center',padding:'50px',color:'#444',background:'#0d0d0d',borderRadius:'14px',border:'1px solid rgba(255,255,255,0.06)' }}>
          <Trophy size={32} color="#222" style={{ marginBottom:'10px',display:'block',margin:'0 auto 12px' }}/>
          <p style={{ margin:'0 0 8px',fontSize:'14px',color:'#666',fontWeight:600 }}>Aucun tournoi terminé trouvé</p>
          <p style={{ margin:0,fontSize:'12px',color:'#444' }}>Les tournois avec le statut "completed" / "Terminé" apparaîtront ici.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center',padding:'40px',color:'#555',fontSize:'13px' }}>Aucun tournoi correspond à la recherche.</div>
      ) : (
        filtered.map(t => (
          <TournamentCard
            key={t.id}
            tourn={t}
            results={resultsForTournament(t)}
            onAdd={tourn => setQuickTourn(tourn)}
            onAddSingle={tourn => setEditing({ row: {}, tourn })}
            onEdit={(row, tourn) => setEditing({ row, tourn })}
            onDelete={handleDelete}
          />
        ))
      )}

      {/* ── Modal édition ligne ── */}
      {editing && (
        <RowModal
          row={editing.row}
          tourn={editing.tourn}
          onSave={saveSingle}
          onClose={() => setEditing(null)}
        />
      )}

      {/* ── Panneau saisie rapide ── */}
      {quickTourn && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'0' }}>
          <div style={{ background:'#111',borderRadius:'20px 20px 0 0',width:'100%',maxWidth:'700px',maxHeight:'90vh',overflow:'auto',padding:'28px' }}>
            <QuickEntryPanel
              tourn={quickTourn}
              onImport={bulkImport}
              onClose={() => setQuickTourn(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
