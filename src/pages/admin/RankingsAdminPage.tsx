import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAdminRole } from '@/pages/AdminDashboard';
import {
  Search, Plus, Pencil, Trash2, Save, X, RefreshCw, Upload,
  ChevronUp, ChevronDown, CheckCircle2, AlertTriangle, Download,
  Filter, ArrowUpDown, TrendingUp, TrendingDown, Minus, BarChart2,
} from 'lucide-react';
import { GlassCard } from '@/components/Layout';
import { getSupabaseClient, isSupabaseConnected, safeSupabaseQuery } from '@/lib/supabase';
import { computeTournamentStatus } from '@/hooks/useData';
import { MPL_TOURNAMENTS } from '@/data/mpl2026';

// ── Types ─────────────────────────────────────────────────────────────────────
type Division = 'MEN' | 'WOMEN' | 'JUNIOR' | 'MIXTE';

// Normalise toutes les variantes Supabase vers nos clés internes
function normDiv(raw: string | null | undefined): Division {
  const v = (raw ?? 'MEN').toUpperCase();
  if (v === 'MIXED') return 'MIXTE';   // Supabase stocke MIXED → on utilise MIXTE
  if (v === 'WOMEN') return 'WOMEN';
  if (v === 'JUNIOR') return 'JUNIOR';
  if (v === 'MEN') return 'MEN';
  if (v === 'MIXTE') return 'MIXTE';
  return 'MEN'; // fallback
}

// Convertit la Division interne (MAJUSCULES) en valeur Supabase (minuscules)
// Supabase doit TOUJOURS recevoir : 'men' | 'women' | 'junior' | 'mixed'
function divToDb(div: Division): string {
  const map: Record<Division, string> = {
    MEN: 'men', WOMEN: 'women', JUNIOR: 'junior', MIXTE: 'mixed',
  };
  return map[div] ?? 'men';
}
type Trend     = 'up' | 'down' | 'same';

interface RankingRow {
  id:                  string;
  player_name:         string;
  rank:                number;
  points:              number;
  division:            Division;
  tournaments_played?: number;
  trend?:              Trend;
  season?:             number;
  updated_at?:         string;
}

// Labels uniquement pour nos 4 divisions internes normalisées
const DIV_LABELS: Record<Division, { label: string; color: string; icon: string }> = {
  MEN:    { label: 'Hommes', color: '#3b82f6', icon: '👨' },
  WOMEN:  { label: 'Dames',  color: '#ec4899', icon: '👩' },
  JUNIOR: { label: 'Junior', color: '#f59e0b', icon: '⭐' },
  MIXTE:  { label: 'Mixte',  color: '#8b5cf6', icon: '🎾' },
};
const FALLBACK_DIV = { label: '—', color: '#555', icon: '❓' };
function divLabel(div: string) {
  const norm = normDiv(div as Division);
  return DIV_LABELS[norm] ?? FALLBACK_DIV;
}

const DIVISIONS: Division[] = ['MEN', 'WOMEN', 'JUNIOR', 'MIXTE'];

// ── CSV Parser ────────────────────────────────────────────────────────────────
function parseCsvLine(line: string, delimiter: ',' | ';'): string[] {
  const cols: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      cols.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cols.push(current.trim());
  return cols.map(c => c.replace(/^"|"$/g, '').trim());
}

function detectDelimiter(line: string): ',' | ';' {
  const commaCount = (line.match(/,/g) ?? []).length;
  const semicolonCount = (line.match(/;/g) ?? []).length;
  return semicolonCount > commaCount ? ';' : ',';
}

function normalizeCsvDivision(raw: string | undefined, fallback: Division): Division {
  const value = (raw ?? '').trim().toUpperCase();
  if (!value) return fallback;
  if (['MEN', 'MAN', 'H', 'HOMME', 'HOMMES', 'MALE'].includes(value)) return 'MEN';
  if (['WOMEN', 'WOMAN', 'D', 'DAME', 'DAMES', 'FEMME', 'FEMMES', 'FEMALE'].includes(value)) return 'WOMEN';
  if (['MIXED', 'MIXTE', 'MIX'].includes(value)) return 'MIXTE';
  if (['JUNIOR', 'JUNIORS'].includes(value)) return 'JUNIOR';
  return normDiv(value);
}

function headerIndex(headers: string[], aliases: string[]): number {
  return headers.findIndex(h => aliases.some(alias => h === alias || h.includes(alias)));
}

function parseCsv(text: string, division: Division): RankingRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0]);
  const firstCols = parseCsvLine(lines[0], delimiter);
  const headers = firstCols.map(c => c.trim().toLowerCase().replace(/\s+/g, '_'));
  const hasHeader = headers.some(h =>
    ['rank', 'rang', 'name', 'nom', 'player', 'player_name', 'joueur', 'points', 'division'].includes(h)
  );
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rankIdx = hasHeader ? headerIndex(headers, ['rank', 'rang', 'position', 'classement']) : 0;
  const nameIdx = hasHeader ? headerIndex(headers, ['player_name', 'player', 'joueur', 'name', 'nom']) : 1;
  const pointsIdx = hasHeader ? headerIndex(headers, ['points', 'pts']) : 2;
  const divisionIdx = hasHeader ? headerIndex(headers, ['division', 'category', 'categorie', 'catégorie']) : 3;

  const result: RankingRow[] = [];
  for (const line of dataLines) {
    const cols = parseCsvLine(line, delimiter);
    if (cols.length < 2) continue;
    const rank   = parseInt(cols[rankIdx >= 0 ? rankIdx : 0], 10);
    const name   = cols[nameIdx >= 0 ? nameIdx : 1] ?? '';
    const points = parseInt(cols[pointsIdx >= 0 ? pointsIdx : 2] ?? '0', 10);
    const div    = normalizeCsvDivision(cols[divisionIdx >= 0 ? divisionIdx : 3], division);
    if (isNaN(rank) || !name) continue;
    result.push({
      id: newId(), rank, player_name: name,
      points: isNaN(points) ? 0 : points,
      division: div, season: 2026,
    });
  }
  return result;
}

// ── Utilitaires ───────────────────────────────────────────────────────────────
function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function TrendIcon({ trend }: { trend?: Trend }) {
  if (trend === 'up')   return <TrendingUp   size={12} color="#4ad569" />;
  if (trend === 'down') return <TrendingDown size={12} color="#ef4444" />;
  return <Minus size={12} color="#666" />;
}

// ── Badge division ────────────────────────────────────────────────────────────
function DivBadge({ div }: { div: string }) {
  const d = divLabel(div);
  return (
    <span style={{
      background: `${d.color}18`, color: d.color,
      border: `1px solid ${d.color}40`,
      borderRadius: '12px', padding: '2px 10px',
      fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {d.icon} {d.label}
    </span>
  );
}

// ── Modal d'édition / création ────────────────────────────────────────────────
function EditModal({
  row, onSave, onClose,
}: {
  row: Partial<RankingRow> | null;
  onSave: (r: RankingRow) => void;
  onClose: () => void;
}) {
  const isNew = !row?.id;
  const [form, setForm] = useState<Partial<RankingRow>>(
    row ?? { division: 'MEN', rank: 1, points: 0, tournaments_played: 0, trend: 'same', season: 2026 }
  );

  function set<K extends keyof RankingRow>(k: K, v: RankingRow[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.player_name?.trim()) return;
    onSave({
      id:                  form.id ?? newId(),
      player_name:         form.player_name.trim(),
      rank:                Number(form.rank ?? 1),
      points:              Number(form.points ?? 0),
      division:            form.division ?? 'MEN',
      tournaments_played:  Number(form.tournaments_played ?? 0),
      trend:               form.trend ?? 'same',
      season:              form.season ?? 2026,
    });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', padding: '9px 12px', color: 'white', fontSize: '14px',
    outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    color: '#888', fontSize: '12px', fontWeight: 500, marginBottom: '5px', display: 'block',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)',
    }}>
      <GlassCard style={{ width: '100%', maxWidth: '500px', padding: '28px', margin: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ color: 'white', margin: 0, fontWeight: 700, fontSize: '17px' }}>
            {isNew ? '➕ Nouveau joueur' : '✏️ Modifier joueur'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Nom */}
          <div>
            <label style={labelStyle}>Nom du joueur *</label>
            <input
              style={inputStyle}
              value={form.player_name ?? ''}
              onChange={e => set('player_name', e.target.value)}
              placeholder="Nom Prénom"
              required
            />
          </div>

          {/* Rang + Points */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Rang</label>
              <input
                style={inputStyle} type="number" min={1}
                value={form.rank ?? ''}
                onChange={e => set('rank', Number(e.target.value))}
              />
            </div>
            <div>
              <label style={labelStyle}>Points</label>
              <input
                style={inputStyle} type="number" min={0}
                value={form.points ?? ''}
                onChange={e => set('points', Number(e.target.value))}
              />
            </div>
          </div>

          {/* Division */}
          <div>
            <label style={labelStyle}>Division</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {DIVISIONS.map(d => (
                <button
                  key={d} type="button"
                  onClick={() => set('division', d)}
                  style={{
                    padding: '6px 14px', borderRadius: '20px', cursor: 'pointer',
                    border: `1px solid ${form.division === d ? DIV_LABELS[d].color : 'rgba(255,255,255,0.1)'}`,
                    background: form.division === d ? `${DIV_LABELS[d].color}20` : 'transparent',
                    color: form.division === d ? DIV_LABELS[d].color : '#666',
                    fontSize: '13px', fontWeight: 600, transition: 'all 0.15s',
                  }}
                >
                  {DIV_LABELS[d].icon} {DIV_LABELS[d].label}
                </button>
              ))}
            </div>
          </div>

          {/* Tendance + tournois joués */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Tendance</label>
              <select
                style={{ ...inputStyle, appearance: 'none' }}
                value={form.trend ?? 'same'}
                onChange={e => set('trend', e.target.value as Trend)}
              >
                <option value="up">↑ En hausse</option>
                <option value="same">→ Stable</option>
                <option value="down">↓ En baisse</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Tournois joués</label>
              <input
                style={inputStyle} type="number" min={0}
                value={form.tournaments_played ?? ''}
                onChange={e => set('tournaments_played', Number(e.target.value))}
              />
            </div>
          </div>

          {/* Saison */}
          <div>
            <label style={labelStyle}>Saison</label>
            <input
              style={inputStyle} type="number"
              value={form.season ?? 2026}
              onChange={e => set('season', Number(e.target.value))}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              type="button" onClick={onClose}
              style={{ padding: '10px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#888', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}
            >
              Annuler
            </button>
            <button
              type="submit"
              style={{ padding: '10px 20px', background: '#4ad569', border: 'none', color: '#0a0a0a', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Save size={14} /> {isNew ? 'Créer' : 'Sauvegarder'}
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}

// ── Import CSV Modal ──────────────────────────────────────────────────────────
function ImportModal({
  onImport, onClose,
}: {
  onImport: (rows: Omit<RankingRow, 'id'>[], replace: boolean) => void;
  onClose: () => void;
}) {
  const [div, setDiv]       = useState<Division>('MEN');
  const [text, setText]     = useState('');
  const [replace, setReplace] = useState(true);
  const [preview, setPreview] = useState<Omit<RankingRow, 'id'>[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const t = ev.target?.result as string;
      setText(t);
      setPreview(parseCsv(t, div).slice(0, 5));
    };
    reader.readAsText(file);
  }

  function handleText(t: string) {
    setText(t);
    setPreview(parseCsv(t, div).slice(0, 5));
  }

  const parsed = useMemo(() => parseCsv(text, div), [text, div]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <GlassCard style={{ width: '100%', maxWidth: '600px', padding: '28px', margin: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ color: 'white', margin: 0, fontWeight: 700 }}>📥 Import CSV</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {/* Division */}
        <div style={{ marginBottom: '16px' }}>
          <p style={{ color: '#888', fontSize: '12px', margin: '0 0 8px' }}>Division cible</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {DIVISIONS.map(d => (
              <button key={d} type="button" onClick={() => setDiv(d)}
                style={{
                  padding: '5px 12px', borderRadius: '16px', cursor: 'pointer',
                  border: `1px solid ${div === d ? DIV_LABELS[d].color : 'rgba(255,255,255,0.1)'}`,
                  background: div === d ? `${DIV_LABELS[d].color}20` : 'transparent',
                  color: div === d ? DIV_LABELS[d].color : '#666', fontSize: '12px', fontWeight: 600,
                }}>
                {DIV_LABELS[d].icon} {DIV_LABELS[d].label}
              </button>
            ))}
          </div>
        </div>

        {/* Upload fichier */}
        <div style={{ marginBottom: '12px' }}>
          <button
            onClick={() => fileRef.current?.click()}
            style={{ padding: '8px 16px', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ccc', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Upload size={14} /> Choisir un fichier CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
        </div>

        {/* Textarea */}
        <textarea
          value={text}
          onChange={e => handleText(e.target.value)}
          placeholder={'rank,name,points,division\n1,Vallet Mathieu,5200,MEN\n2,Cotin Josselin,4775,MEN\n...'}
          style={{
            width: '100%', height: '140px', background: '#111', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px', color: '#ccc', padding: '10px', fontSize: '12px', fontFamily: 'monospace',
            resize: 'vertical', outline: 'none', boxSizing: 'border-box',
          }}
        />

        {/* Preview */}
        {preview.length > 0 && (
          <div style={{ marginTop: '12px', background: '#111', borderRadius: '8px', padding: '10px' }}>
            <p style={{ color: '#4ad569', fontSize: '12px', margin: '0 0 8px', fontWeight: 600 }}>
              ✅ {parsed.length} lignes détectées — aperçu des 5 premières :
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ color: '#555' }}>
                  {['Rang','Joueur','Points','Division'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '3px 8px', borderBottom: '1px solid #222' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '3px 8px', color: '#ccc' }}>{r.rank}</td>
                    <td style={{ padding: '3px 8px', color: 'white' }}>{r.player_name}</td>
                    <td style={{ padding: '3px 8px', color: '#f59e0b' }}>{r.points}</td>
                    <td style={{ padding: '3px 8px' }}><DivBadge div={r.division} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Mode remplacement */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px' }}>
          <input type="checkbox" id="replace-chk" checked={replace} onChange={e => setReplace(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
          <label htmlFor="replace-chk" style={{ color: '#aaa', fontSize: '13px', cursor: 'pointer' }}>
            Remplacer les entrées existantes pour cette division
          </label>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
          <button onClick={onClose}
            style={{ padding: '10px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#888', borderRadius: '8px', cursor: 'pointer' }}>
            Annuler
          </button>
          <button
            disabled={parsed.length === 0}
            onClick={() => onImport(parsed, replace)}
            style={{
              padding: '10px 20px', background: parsed.length ? '#4ad569' : '#333',
              border: 'none', color: parsed.length ? '#0a0a0a' : '#555',
              borderRadius: '8px', cursor: parsed.length ? 'pointer' : 'not-allowed',
              fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px',
            }}>
            <Upload size={14} /> Importer {parsed.length > 0 ? `(${parsed.length})` : ''}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

// ── Émet un event global pour forcer le re-fetch dans useRankings ─────────────
function emitRankingsUpdated(division?: Division) {
  const divDb = division ? divToDb(division) : undefined;
  const payload = { division: divDb };

  // 1. Même onglet
  window.dispatchEvent(new CustomEvent('mpl:rankings:updated', { detail: payload }));

  // 2. Cross-tab via BroadcastChannel
  try {
    const bc = new BroadcastChannel('mpl_rankings_update');
    bc.postMessage(payload);
    bc.close();
  } catch { /* navigateur sans support */ }

  // 3. Cross-tab via storage event (fallback universel)
  try {
    localStorage.setItem('mpl_rankings_updated', JSON.stringify({ ...payload, ts: Date.now() }));
    // Supprimer aussitôt pour permettre de re-déclencher l'event plus tard
    setTimeout(() => localStorage.removeItem('mpl_rankings_updated'), 500);
  } catch { /* ignore */ }
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function RankingsAdminPage() {
  const role = useAdminRole();
  const isViewer = role === 'viewer';
  const [rows,       setRows]       = useState<RankingRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [msg,        setMsg]        = useState<{ text: string; type: 'ok' | 'warn' | 'err' } | null>(null);
  const [search,     setSearch]     = useState('');
  const [filterDiv,  setFilterDiv]  = useState<Division | 'ALL'>('ALL');
  const [editRow,    setEditRow]    = useState<Partial<RankingRow> | null | false>(false);
  const [showImport, setShowImport] = useState(false);
  const [sortCol,    setSortCol]    = useState<'rank' | 'points' | 'player_name'>('rank');
  const [sortAsc,    setSortAsc]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [saving,     setSaving]     = useState(false);
  const PER_PAGE = 50;

  // ── Tournois : chargés depuis Supabase ou fallback local ─────────────────
  const [allTournois, setAllTournois] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    async function loadTourns() {
      const sb = getSupabaseClient();
      if (isSupabaseConnected() && sb) {
        const { data } = await sb.from('tournaments').select('id,status,tournament_date,date,division,type,tournament_type').limit(2000);
        if (data && (data as unknown[]).length > 0) { setAllTournois(data as Record<string,unknown>[]); return; }
      }
      setAllTournois(MPL_TOURNAMENTS as unknown as Record<string,unknown>[]);
    }
    loadTourns();
  }, []);

  // ── Stats tournois calculées dynamiquement ────────────────────────────────
  const tournStats = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const enriched = allTournois.map(t => {
      const d   = ((t.tournament_date ?? t.date) as string) ?? '';
      const typ = ((t.tournament_type ?? t.type) as string ?? '').toUpperCase();
      return {
        status: computeTournamentStatus(d, t.status as string),
        type:   typ,
        date:   d,
      };
    });
    const total     = enriched.length;
    const completed = enriched.filter(t => t.status === 'completed').length;
    const upcoming  = enriched.filter(t => ['upcoming','open','draw'].includes(t.status)).length;
    const mixteAll  = enriched.filter(t => t.type === 'MIXED');
    const juniorAll = enriched.filter(t => t.type === 'JUNIOR' || ['U11','U13','U15','U10','U12','U14'].includes(t.type));
    const mixteComp  = mixteAll.filter(t => t.status === 'completed').length;
    const mixteAvenir= mixteAll.filter(t => ['upcoming','open','draw'].includes(t.status)).length;
    const juniorComp = juniorAll.filter(t => t.status === 'completed').length;
    const juniorAvenir=juniorAll.filter(t => ['upcoming','open','draw'].includes(t.status)).length;

    // Date du dernier tournoi complété
    const lastCompleted = enriched
      .filter(t => t.status === 'completed' && t.date)
      .map(t => t.date)
      .sort()
      .reverse()[0] ?? '';
    const lastDate = lastCompleted
      ? new Date(lastCompleted).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
      : '—';

    return { total, completed, upcoming, mixteComp, mixteAvenir, juniorComp, juniorAvenir, lastDate };
  }, [allTournois]);

  // ── Flash message helper ──────────────────────────────────────────────────
  function flash(text: string, type: 'ok' | 'warn' | 'err' = 'ok') {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  }

  // ── Charger depuis Supabase (pagination pour dépasser la limite 1000) ───────
  const load = useCallback(async () => {
    setLoading(true);
    const sb = getSupabaseClient();
    if (!isSupabaseConnected() || !sb) {
      setLoading(false);
      flash('⚠️ Supabase non connecté — aucune donnée chargée', 'warn');
      return;
    }

    // Supabase limite à 1000 par requête — on pagine par tranches de 1000
    const PAGE_SIZE = 1000;
    const allRaw: Record<string, unknown>[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error, timedOut } = await safeSupabaseQuery(() =>
        sb.from('rankings')
          .select('id, player_name, rank, points, division, tournaments_played, trend, season, updated_at')
          .order('division')
          .order('rank')
          .range(from, from + PAGE_SIZE - 1)
      , 10000); // timeout 10s pour les gros volumes

      if (timedOut) { flash('⏱ Timeout Supabase', 'err'); setLoading(false); return; }
      if (error)    { flash(`❌ ${error}`, 'err');         setLoading(false); return; }

      const page = data as Record<string, unknown>[];
      if (!page || page.length === 0) break;
      allRaw.push(...page);
      hasMore = page.length === PAGE_SIZE;
      from += PAGE_SIZE;
    }

    const rawRows = allRaw;
    const mapped: RankingRow[] = rawRows.map(r => ({
      id:                 r.id as string,
      player_name:        (r.player_name ?? r.name ?? '') as string,
      rank:               Number(r.rank ?? 0),
      points:             Number(r.points ?? 0),
      division:           normDiv(r.division as string | null),
      tournaments_played: Number(r.tournaments_played ?? 0),
      trend:              (r.trend as Trend) ?? 'same',
      season:             Number(r.season ?? 2026),
      updated_at:         r.updated_at as string | undefined,
    }));

    setRows(mapped);
    flash(`✅ ${mapped.length} entrées chargées depuis Supabase`, 'ok');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Données filtrées + triées ─────────────────────────────────────────────
  const displayed = useMemo(() => {
    let r = rows;
    if (filterDiv !== 'ALL') r = r.filter(x => x.division === filterDiv);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x => x.player_name.toLowerCase().includes(q) || String(x.rank).includes(q));
    }
    r = [...r].sort((a, b) => {
      let diff = 0;
      if (sortCol === 'rank')        diff = a.rank   - b.rank;
      else if (sortCol === 'points') diff = a.points - b.points;
      else diff = a.player_name.localeCompare(b.player_name);
      return sortAsc ? diff : -diff;
    });
    return r;
  }, [rows, filterDiv, search, sortCol, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / PER_PAGE));
  const pageRows   = displayed.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // ── Stats par division ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const s: Record<string, number> = { ALL: rows.length };
    DIVISIONS.forEach(d => { s[d] = rows.filter(r => r.division === d).length; });
    return s;
  }, [rows]);

  // ── Sort helper ───────────────────────────────────────────────────────────
  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(true); }
    setPage(1);
  }

  function SortIcon({ col }: { col: typeof sortCol }) {
    if (sortCol !== col) return <ArrowUpDown size={12} color="#444" />;
    return sortAsc ? <ChevronUp size={12} color="#4ad569" /> : <ChevronDown size={12} color="#4ad569" />;
  }

  // ── Sauvegarder une ligne (create ou update) ──────────────────────────────
  async function handleSave(r: RankingRow) {
    setSaving(true);
    const sb = getSupabaseClient();
    const isNew = !rows.find(x => x.id === r.id);

    if (isSupabaseConnected() && sb) {
      const payload = {
        player_name:        r.player_name,
        rank:               r.rank,
        points:             r.points,
        division:           divToDb(r.division),   // ← toujours minuscules vers Supabase
        tournaments_played: r.tournaments_played ?? 0,
        trend:              r.trend ?? 'same',
        season:             r.season ?? 2026,
        updated_at:         new Date().toISOString(),
      };
      const { error } = isNew
        ? await sb.from('rankings').insert({ id: r.id, ...payload })
        : await sb.from('rankings').update(payload).eq('id', r.id);

      if (error) {
        flash(`❌ Supabase : ${error.message}`, 'err');
        setSaving(false); return;
      }
      flash(isNew ? `✅ "${r.player_name}" créé dans Supabase` : `✅ "${r.player_name}" mis à jour`, 'ok');
    } else {
      flash(`⚠️ Sauvegarde locale uniquement (Supabase non connecté)`, 'warn');
    }

    setRows(prev =>
      isNew ? [...prev, r] : prev.map(x => x.id === r.id ? r : x)
    );
    emitRankingsUpdated(r.division);  // ← notifie Classements.tsx de se re-fetcher
    setEditRow(false);
    setSaving(false);
  }

  // ── Supprimer une ligne ───────────────────────────────────────────────────
  async function handleDelete(r: RankingRow) {
    if (!confirm(`Supprimer "${r.player_name}" du classement ${divLabel(r.division).label} ?`)) return;
    const sb = getSupabaseClient();
    if (isSupabaseConnected() && sb) {
      const { error } = await sb.from('rankings').delete().eq('id', r.id);
      if (error) { flash(`❌ ${error.message}`, 'err'); return; }
    }
    setRows(prev => prev.filter(x => x.id !== r.id));
    flash(`🗑 "${r.player_name}" supprimé`, 'warn');
    emitRankingsUpdated(r.division);  // ← notifie Classements.tsx
  }

  // ── Import CSV ────────────────────────────────────────────────────────────
  async function handleImport(newRows: RankingRow[], replace: boolean) {
    setShowImport(false);
    setSaving(true);
    const sb = getSupabaseClient();
    const targetDivisions = [...new Set(newRows.map(r => normDiv(r.division)))];

    // Les UUID sont déjà générés par parseCsv
    const withIds = newRows.map(r => ({ ...r, division: normDiv(r.division) }));

    if (isSupabaseConnected() && sb) {
      // Supprimer les anciens si replace — toutes les divisions présentes dans le CSV.
      if (replace && targetDivisions.length > 0) {
        for (const targetDiv of targetDivisions) {
          const variants = [
            divToDb(targetDiv),
            targetDiv,
            targetDiv.toLowerCase(),
            targetDiv === 'MIXTE' ? 'mixed' : '',
            targetDiv === 'MIXTE' ? 'MIXED' : '',
          ].filter(Boolean);

          const { error: deleteError } = await sb.from('rankings').delete().in('division', variants);
          if (deleteError) {
            flash(`❌ Remplacement impossible (${divLabel(targetDiv).label}) : ${deleteError.message}`, 'err');
            setSaving(false);
            return;
          }
        }
      }
      // Insérer en batch de 500 — division TOUJOURS en minuscules
      const BATCH = 500;
      for (let i = 0; i < withIds.length; i += BATCH) {
        const batch = withIds.slice(i, i + BATCH).map(r => ({
          id:                 r.id,
          player_name:        r.player_name,
          rank:               r.rank,
          points:             r.points,
          division:           divToDb(r.division),  // ← minuscules
          tournaments_played: r.tournaments_played ?? 0,
          trend:              r.trend ?? 'same',
          season:             r.season ?? 2026,
          updated_at:         new Date().toISOString(),
        }));
        const { error } = await sb.from('rankings').insert(batch);
        if (error) { flash(`❌ Insert batch ${i / BATCH + 1} : ${error.message}`, 'err'); setSaving(false); return; }
      }
      flash(`✅ ${withIds.length} joueurs importés dans Supabase`, 'ok');
      emitRankingsUpdated();  // ← notifie toutes les pages Classements.tsx
    } else {
      flash(`⚠️ Import local uniquement — ${withIds.length} joueurs`, 'warn');
    }

    setRows(prev => {
      const kept = replace && targetDivisions.length > 0
        ? prev.filter(r => !targetDivisions.includes(normDiv(r.division)))
        : prev;
      return [...kept, ...withIds];
    });
    setSaving(false);
  }

  // ── Export CSV ────────────────────────────────────────────────────────────
  function handleExport() {
    const data = filterDiv === 'ALL' ? rows : rows.filter(r => r.division === filterDiv);
    const header = 'rank,player_name,points,division,tournaments_played,trend,season\n';
    const body = data
      .sort((a, b) => a.rank - b.rank)
      .map(r => `${r.rank},"${r.player_name}",${r.points},${r.division},${r.tournaments_played ?? 0},${r.trend ?? 'same'},${r.season ?? 2026}`)
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `rankings_${filterDiv.toLowerCase()}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Recalculer les rangs ──────────────────────────────────────────────────
  async function recalcRanks() {
    if (!confirm('Recalculer les rangs de toutes les divisions par ordre de points décroissant ?')) return;
    setSaving(true);
    const sb = getSupabaseClient();

    const updated: RankingRow[] = [];
    for (const div of DIVISIONS) {
      const divRows = rows
        .filter(r => r.division === div)
        .sort((a, b) => b.points - a.points);

      let currentRank = 1;
      divRows.forEach((r, i) => {
        const rank = i > 0 && divRows[i - 1].points === r.points ? currentRank : (currentRank = i + 1, i + 1);
        updated.push({ ...r, rank });
      });
    }

    if (isSupabaseConnected() && sb) {
      try {
        for (const r of updated) {
          const { error: err } = await sb.from('rankings').update({ rank: r.rank }).eq('id', r.id);
          if (err) console.error('[Rankings] recalcRanks update error:', err);
        }
        flash(`✅ Rangs recalculés pour ${updated.length} joueurs (Supabase)`, 'ok');
      } catch (e) {
        console.error('[Rankings] recalcRanks network error:', e);
        flash(`❌ Erreur réseau lors du recalcul`, 'err');
      }
    } else {
      flash(`⚠️ Rangs recalculés localement (${updated.length} joueurs)`, 'warn');
    }
    setRows(updated);
    emitRankingsUpdated(); // toutes les divisions
    setSaving(false);
  }

  // ── Styles helpers ────────────────────────────────────────────────────────
  const thStyle: React.CSSProperties = {
    padding: '10px 12px', color: '#555', fontSize: '11px',
    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
    textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)',
    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)',
    fontSize: '13px', color: '#ccc', verticalAlign: 'middle',
  };

  const msgColors = { ok: '#4ad569', warn: '#f59e0b', err: '#ef4444' };

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ color: 'white', margin: '0 0 4px', fontWeight: 800, fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart2 size={22} color="#4ad569" /> Gestion des Classements
          </h2>
          <p style={{ color: '#555', fontSize: '13px', margin: 0 }}>
            {rows.length.toLocaleString('fr-FR')} joueurs · {isSupabaseConnected() ? '🟢 Supabase connecté' : '🟡 Mode démo'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={load} disabled={loading || saving}
            style={{ padding: '8px 14px', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Actualiser
          </button>
          <button onClick={recalcRanks} disabled={saving || rows.length === 0}
            style={{ padding: '8px 14px', background: '#1a1a1a', border: '1px solid rgba(74,213,105,0.2)', color: '#4ad569', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
            <ArrowUpDown size={13} /> Recalc. Rangs
          </button>
          <button onClick={() => setShowImport(true)}
            style={{ padding: '8px 14px', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
            <Upload size={13} /> Import CSV
          </button>
          <button onClick={handleExport} disabled={rows.length === 0}
            style={{ padding: '8px 14px', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
            <Download size={13} /> Exporter
          </button>
          {!isViewer && <button onClick={() => setEditRow({})}
            style={{ padding: '8px 16px', background: '#4ad569', border: 'none', color: '#0a0a0a', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 700 }}>
            <Plus size={14} /> Ajouter
          </button>}
        </div>
      </div>

      {/* ── Flash message ── */}
      {msg && (
        <div style={{ padding: '10px 16px', background: `${msgColors[msg.type]}15`, border: `1px solid ${msgColors[msg.type]}40`, borderRadius: '8px', color: msgColors[msg.type], fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}

      {/* ── Cards tournois 2026 — dynamiques ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
        {([
          { label: 'Total tournois 2026', value: String(tournStats.total),     sub: '18 clubs',                                    color: '#4ad569', icon: '🏆' },
          { label: 'Tournois complétés',  value: String(tournStats.completed),  sub: `au ${tournStats.lastDate}`,                  color: '#3b82f6', icon: '✅' },
          { label: 'Tournois à venir',    value: String(tournStats.upcoming),   sub: 'reste de saison',                            color: '#f59e0b', icon: '📅' },
          { label: 'Tournois Mixte',      value: String(tournStats.mixteComp),  sub: `${tournStats.mixteAvenir} à venir`,          color: '#8b5cf6', icon: '🎾' },
          { label: 'Tournois Junior',     value: String(tournStats.juniorComp), sub: `${tournStats.juniorAvenir} à venir`,         color: '#f59e0b', icon: '⭐' },
        ] as const).map(c => (
          <GlassCard key={c.label} style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '18px', marginBottom: '4px' }}>{c.icon}</div>
            <div style={{ color: c.color, fontWeight: 800, fontSize: '22px', lineHeight: 1 }}>{c.value}</div>
            <div style={{ color: 'white',  fontSize: '12px', fontWeight: 600, margin: '3px 0 2px' }}>{c.label}</div>
            <div style={{ color: '#555',   fontSize: '11px' }}>{c.sub}</div>
          </GlassCard>
        ))}
      </div>

      {/* ── Stats chips ── */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {([['ALL', 'Tous', '#4ad569'] as const, ...DIVISIONS.map(d => [d, DIV_LABELS[d].label, DIV_LABELS[d].color] as const)]).map(([key, label, color]) => (
          <button key={key} onClick={() => { setFilterDiv(key as Division | 'ALL'); setPage(1); }}
            style={{
              padding: '6px 14px', borderRadius: '20px', cursor: 'pointer',
              border: `1px solid ${filterDiv === key ? color : 'rgba(255,255,255,0.08)'}`,
              background: filterDiv === key ? `${color}18` : 'transparent',
              color: filterDiv === key ? color : '#555', fontSize: '12px', fontWeight: 600, transition: 'all 0.15s',
            }}>
            {key === 'ALL' ? '📊' : divLabel(key).icon} {label}
            <span style={{ marginLeft: '6px', opacity: 0.7 }}>({stats[key] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* ── Recherche ── */}
      <div style={{ position: 'relative', maxWidth: '380px' }}>
        <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#555' }} />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Rechercher un joueur ou un rang..."
          style={{
            width: '100%', background: '#111', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px', padding: '9px 12px 9px 34px', color: 'white', fontSize: '13px',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        {search && (
          <button onClick={() => setSearch('')}
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#555', cursor: 'pointer' }}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* ── Tableau ── */}
      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px', gap: '12px', color: '#555' }}>
            <div style={{ width: 28, height: 28, border: '3px solid #4ad569', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span>Chargement depuis Supabase...</span>
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px', color: '#555' }}>
            <BarChart2 size={40} style={{ opacity: 0.2, marginBottom: '12px' }} />
            <p style={{ margin: 0 }}>
              {rows.length === 0
                ? 'Aucune donnée — connectez Supabase ou importez un CSV'
                : 'Aucun résultat pour cette recherche'}
            </p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                    <th style={{ ...thStyle, width: '60px' }} onClick={() => toggleSort('rank')}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Rang <SortIcon col="rank" /></span>
                    </th>
                    <th style={thStyle} onClick={() => toggleSort('player_name')}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Joueur <SortIcon col="player_name" /></span>
                    </th>
                    <th style={{ ...thStyle, width: '100px' }}>Division</th>
                    <th style={{ ...thStyle, width: '100px' }} onClick={() => toggleSort('points')}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Points <SortIcon col="points" /></span>
                    </th>
                    <th style={{ ...thStyle, width: '80px' }} title="Nombre de tournois joués par ce joueur en 2026">
                      Tournois <span style={{ fontSize: '10px', color: '#444' }}>joués</span>
                    </th>
                    <th style={{ ...thStyle, width: '60px' }}>Trend</th>
                    <th style={{ ...thStyle, width: '100px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => (
                    <tr key={r.id}
                      style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,213,105,0.04)')}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}
                    >
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: '32px', height: '32px', borderRadius: '8px', fontWeight: 700,
                          background: r.rank <= 3 ? ['#ffd70020','#c0c0c020','#cd7f3220'][r.rank - 1] : 'rgba(255,255,255,0.04)',
                          color: r.rank <= 3 ? ['#ffd700','#c0c0c0','#cd7f32'][r.rank - 1] : '#888',
                          fontSize: '13px',
                        }}>
                          {r.rank}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: 'white', fontWeight: 500 }}>
                        {r.player_name}
                      </td>
                      <td style={tdStyle}><DivBadge div={r.division} /></td>
                      <td style={{ ...tdStyle, color: '#f59e0b', fontWeight: 600, textAlign: 'right' }}>
                        {r.points.toLocaleString('fr-FR')}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', color: '#666' }}>
                        {(r.tournaments_played && r.tournaments_played > 0)
                          ? <span style={{ background: 'rgba(74,213,105,0.1)', color: '#4ad569', borderRadius: '10px', padding: '1px 8px', fontSize: '11px', fontWeight: 600 }}>{r.tournaments_played}</span>
                          : <span style={{ color: '#333', fontSize: '12px' }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <TrendIcon trend={r.trend} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          {!isViewer && <button
                            onClick={() => setEditRow(r)}
                            style={{ padding: '5px 8px', background: 'rgba(74,213,105,0.1)', border: '1px solid rgba(74,213,105,0.2)', color: '#4ad569', borderRadius: '6px', cursor: 'pointer' }}
                            title="Modifier">
                            <Pencil size={12} />
                          </button>}
                          {!isViewer && <button
                            onClick={() => handleDelete(r)}
                            style={{ padding: '5px 8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', borderRadius: '6px', cursor: 'pointer' }}
                            title="Supprimer">
                            <Trash2 size={12} />
                          </button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ color: '#555', fontSize: '12px' }}>
                {displayed.length.toLocaleString('fr-FR')} résultats · page {page}/{totalPages}
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => setPage(1)} disabled={page === 1}
                  style={{ padding: '5px 10px', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', color: page === 1 ? '#333' : '#888', borderRadius: '6px', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: '12px' }}>
                  ««
                </button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: '5px 10px', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', color: page === 1 ? '#333' : '#888', borderRadius: '6px', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: '12px' }}>
                  ‹
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const p = start + i;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      style={{ padding: '5px 10px', background: p === page ? '#4ad569' : '#1a1a1a', border: `1px solid ${p === page ? '#4ad569' : 'rgba(255,255,255,0.08)'}`, color: p === page ? '#0a0a0a' : '#888', borderRadius: '6px', cursor: 'pointer', fontWeight: p === page ? 700 : 400, fontSize: '12px' }}>
                      {p}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ padding: '5px 10px', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', color: page === totalPages ? '#333' : '#888', borderRadius: '6px', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: '12px' }}>
                  ›
                </button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                  style={{ padding: '5px 10px', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', color: page === totalPages ? '#333' : '#888', borderRadius: '6px', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: '12px' }}>
                  »»
                </button>
              </div>
            </div>
          </>
        )}
      </GlassCard>

      {/* ── SQL helper card ── */}
      {/* ── Modales ── */}
      {editRow !== false && (
        <EditModal
          row={editRow}
          onSave={handleSave}
          onClose={() => setEditRow(false)}
        />
      )}
      {showImport && (
        <ImportModal
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
