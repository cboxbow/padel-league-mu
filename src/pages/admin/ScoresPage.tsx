import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Play, CheckCircle, Clock, Save, Zap } from 'lucide-react';
import { GlassCard, CategoryBadge, RegionBadge } from '@/components/Layout';
import { getSupabaseClient, isSupabaseConnected, safeSupabaseQuery } from '@/lib/supabase';

interface Tourn  { id: string; name: string; category: string; region: string; status: string; start_date?: string; date?: string; tournament_date?: string; }
interface Team   { id: string; name: string; }
interface Match  {
  id: string; round: string; court_label?: string;
  team1_id?: string; team2_id?: string;
  team1_name?: string; team2_name?: string;
  score_set1?: string; score_set2?: string; score_tb?: string;
  winner_id?: string; status: string; tournament_id: string;
}

const inputS: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px', padding: '8px 12px', color: 'white', fontSize: '14px',
  outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'center',
  fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
};

// ── Ligne score éditable ──────────────────────────────────────────────────────
function ScoreRow({ match, onSave }: { match: Match; onSave: (m: Match) => Promise<void>; }) {
  const [s1, setS1]     = useState(match.score_set1 ?? '');
  const [s2, setS2]     = useState(match.score_set2 ?? '');
  const [tb, setTb]     = useState(match.score_tb   ?? '');
  const [wid, setWid]   = useState(match.winner_id  ?? '');
  const [saving, setSav] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = s1 !== (match.score_set1 ?? '') || s2 !== (match.score_set2 ?? '') || tb !== (match.score_tb ?? '') || wid !== (match.winner_id ?? '');

  const STATUS_COLORS: Record<string, string> = { scheduled: '#666', live: '#f59e0b', completed: '#4ad569', cancelled: '#ef4444' };

  const handleSave = async () => {
    setSav(true);
    await onSave({ ...match, score_set1: s1, score_set2: s2, score_tb: tb, winner_id: wid, status: wid ? 'completed' : match.status });
    setSav(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,213,105,0.03)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Round */}
      <td style={{ padding: '10px 14px', color: '#666', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>{match.round}</td>
      {/* Court */}
      <td style={{ padding: '10px 14px', color: '#a0a0a0', fontSize: '12px' }}>{match.court_label ?? '—'}</td>
      {/* Équipes */}
      <td style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ color: wid === match.team1_id ? '#4ad569' : 'white', fontWeight: 600, fontSize: '13px' }}>{match.team1_name ?? '—'}</span>
          <span style={{ color: '#555', fontSize: '11px' }}>vs</span>
          <span style={{ color: wid === match.team2_id ? '#4ad569' : 'white', fontWeight: 600, fontSize: '13px' }}>{match.team2_name ?? '—'}</span>
        </div>
      </td>
      {/* Set 1 */}
      <td style={{ padding: '8px 10px', width: '80px' }}>
        <input style={inputS} value={s1} onChange={e => setS1(e.target.value)} placeholder="6-4" />
      </td>
      {/* Set 2 */}
      <td style={{ padding: '8px 10px', width: '80px' }}>
        <input style={inputS} value={s2} onChange={e => setS2(e.target.value)} placeholder="6-3" />
      </td>
      {/* TB */}
      <td style={{ padding: '8px 10px', width: '80px' }}>
        <input style={inputS} value={tb} onChange={e => setTb(e.target.value)} placeholder="10-7" />
      </td>
      {/* Vainqueur */}
      <td style={{ padding: '8px 10px' }}>
        <select value={wid} onChange={e => setWid(e.target.value)}
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(74,213,105,0.2)', borderRadius: '6px', color: 'white', padding: '6px 8px', fontSize: '12px', cursor: 'pointer', outline: 'none', maxWidth: '140px' }}>
          <option value="">— Vainqueur</option>
          {match.team1_id && <option value={match.team1_id}>{match.team1_name}</option>}
          {match.team2_id && <option value={match.team2_id}>{match.team2_name}</option>}
        </select>
      </td>
      {/* Statut */}
      <td style={{ padding: '8px 10px' }}>
        <span style={{ color: STATUS_COLORS[match.status] ?? '#666', fontSize: '12px', fontWeight: 600 }}>
          {match.status === 'live' && <span style={{ animation: 'pulse 1s infinite' }}>● </span>}
          {match.status}
        </span>
      </td>
      {/* Sauvegarder */}
      <td style={{ padding: '8px 10px' }}>
        {saved ? (
          <CheckCircle size={16} style={{ color: '#4ad569' }} />
        ) : (
          <button onClick={handleSave} disabled={!dirty || saving}
            style={{ background: dirty ? '#4ad569' : 'rgba(255,255,255,0.05)', color: dirty ? '#0a0a0a' : '#444', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: dirty ? 'pointer' : 'default', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
            <Save size={12} /> {saving ? '…' : 'OK'}
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function ScoresPage() {
  const [tournaments, setTournaments] = useState<Tourn[]>([]);
  const [selected, setSelected]       = useState<Tourn | null>(null);
  const [matches, setMatches]         = useState<Match[]>([]);
  const [filter, setFilter]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [newMatch, setNewMatch]       = useState(false);
  const [nm, setNm]                   = useState<Partial<Match>>({});
  const channelRef                    = useRef<any>(null);

  // Charger tournois
  useEffect(() => {
    async function load() {
      const sb = getSupabaseClient();
      if (isSupabaseConnected() && sb) {
        const { data, timedOut } = await safeSupabaseQuery(() => sb.from('tournaments').select('*').limit(500));
        if (data && !timedOut) {
          const rows = (data as Tourn[]).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
          setTournaments(rows); return;
        }
      }
      setTournaments([]);
    }
    load();
  }, []);

  const loadMatches = useCallback(async (t: Tourn) => {
    setLoading(true);
    const sb = getSupabaseClient();
    if (isSupabaseConnected() && sb) {
      // Tentative 1 : requête avec jointures FK pour les noms d'équipes
      const { data: d1, error: e1 } = await sb
        .from('matches')
        .select('*, team1:teams!matches_team1_id_fkey(id,name), team2:teams!matches_team2_id_fkey(id,name)')
        .eq('tournament_id', t.id)
        .order('round');

      if (!e1 && d1) {
        setMatches(d1.map((m: any) => ({
          ...m,
          team1_name: m.team1?.name ?? m.team1_name ?? m.team1_id,
          team2_name: m.team2?.name ?? m.team2_name ?? m.team2_id,
        })));
        setLoading(false);

        // Realtime
        if (channelRef.current) sb.removeChannel(channelRef.current);
        channelRef.current = sb
          .channel(`matches-${t.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${t.id}` }, () => loadMatches(t))
          .subscribe();
        return;
      }

      // Tentative 2 : select simple sans FK (si les relations n'existent pas)
      if (e1) {
        console.warn('[Scores] FK query failed:', e1.message, '→ fallback select *');
        const { data: d2 } = await sb
          .from('matches')
          .select('*')
          .eq('tournament_id', t.id)
          .order('round');

        if (d2 && d2.length > 0) {
          setMatches(d2.map((m: any) => ({
            ...m,
            team1_name: m.team1_name ?? m.team1_id ?? '—',
            team2_name: m.team2_name ?? m.team2_id ?? '—',
          })));
          setLoading(false);

          if (channelRef.current) sb.removeChannel(channelRef.current);
          channelRef.current = sb
            .channel(`matches-${t.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${t.id}` }, () => loadMatches(t))
            .subscribe();
          return;
        }
      }
    }
    // Mock
    const mockMatches: Match[] = [
      { id: 'm1', round: 'QF', court_label: 'Court 1', team1_id: 't1', team2_id: 't2', team1_name: 'Dupont / Martin', team2_name: 'Bernard / Leroy', status: 'scheduled', tournament_id: t.id },
      { id: 'm2', round: 'QF', court_label: 'Court 2', team1_id: 't3', team2_id: 't4', team1_name: 'Moreau / Wilson', team2_name: 'Johnson / Brown', status: 'live', tournament_id: t.id },
      { id: 'm3', round: 'QF', court_label: 'Court 1', team1_id: 't5', team2_id: 't6', team1_name: 'Davis / Miller', team2_name: 'Petit / Dubois', score_set1: '6-4', score_set2: '6-3', winner_id: 't5', status: 'completed', tournament_id: t.id },
      { id: 'm4', round: 'QF', court_label: 'Court 2', team1_id: 't7', team2_id: 't8', team1_name: 'Foulon / Ricard', team2_name: 'Laurent / Fabre', score_set1: '3-6', score_set2: '6-4', score_tb: '10-8', winner_id: 't7', status: 'completed', tournament_id: t.id },
    ];
    setMatches(mockMatches);
    setLoading(false);
  }, []);

  const handleSelect = (t: Tourn) => { setSelected(t); loadMatches(t); };

  const handleSaveMatch = async (m: Match) => {
    const sb = getSupabaseClient();
    if (isSupabaseConnected() && sb) {
      try {
        const { error: err } = await sb.from('matches').upsert({
          id: m.id, tournament_id: m.tournament_id, round: m.round,
          court_label: m.court_label, team1_id: m.team1_id, team2_id: m.team2_id,
          score_set1: m.score_set1, score_set2: m.score_set2, score_tb: m.score_tb,
          winner_id: m.winner_id, status: m.status,
        });
        if (err) {
          console.error('[Scores] upsert error:', err);
          // On continue quand même pour mettre à jour l'état local
        } else {
          console.log('[Scores] upsert ok, id=', m.id);
        }
      } catch (e) {
        console.error('[Scores] network error:', e);
      }
    }
    setMatches(prev => prev.map(x => x.id === m.id ? m : x));
  };

  const handleAddMatch = async () => {
    const sb = getSupabaseClient();
    const newId = `match-${Date.now()}`;
    const m: Match = { ...nm as Match, id: newId, tournament_id: selected!.id, status: 'scheduled' };
    if (isSupabaseConnected() && sb) {
      await sb.from('matches').insert({ tournament_id: m.tournament_id, round: m.round, court_label: m.court_label, team1_id: m.team1_id, team2_id: m.team2_id, status: 'scheduled' });
    }
    setMatches(prev => [...prev, m]);
    setNewMatch(false);
    setNm({});
  };

  const filtered = matches.filter(m =>
    !filter ||
    m.round?.toLowerCase().includes(filter.toLowerCase()) ||
    m.team1_name?.toLowerCase().includes(filter.toLowerCase()) ||
    m.team2_name?.toLowerCase().includes(filter.toLowerCase())
  );

  const stats = {
    total:     matches.length,
    completed: matches.filter(m => m.status === 'completed').length,
    live:      matches.filter(m => m.status === 'live').length,
    pending:   matches.filter(m => m.status === 'scheduled').length,
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ color: 'white', fontWeight: 700, margin: '0 0 4px' }}>Saisie des Scores</h2>
          <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>Mettez à jour les scores en temps réel · {isSupabaseConnected() ? '🟢 Realtime actif' : '🟡 Mode démo'}</p>
        </div>
      </div>

      {!selected ? (
        <div>
          <p style={{ color: '#a0a0a0', marginBottom: '16px', fontSize: '14px' }}>Sélectionnez un tournoi :</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '14px' }}>
            {tournaments.map(t => (
              <div key={t.id} onClick={() => handleSelect(t)} style={{ cursor: 'pointer', borderRadius: '16px' }}>
              <GlassCard hoverable style={{ padding: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <CategoryBadge category={t.category as any} />
                  <span style={{ color: t.status === 'ongoing' || t.status === 'open' ? '#4ad569' : '#666', fontSize: '12px', fontWeight: 600 }}>
                    {t.status === 'live' && '● '}{t.status}
                  </span>
                </div>
                <h3 style={{ color: 'white', fontWeight: 700, margin: '0 0 4px', fontSize: '15px' }}>{t.name}</h3>
                <span style={{ color: '#666', fontSize: '12px' }}>{t.start_date}</span>
              </GlassCard>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <button onClick={() => { setSelected(null); setMatches([]); }} style={{ background: 'none', border: 'none', color: '#4ad569', cursor: 'pointer', fontSize: '13px', padding: 0 }}>← Tournois</button>
            <span style={{ color: '#555' }}>›</span>
            <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>{selected.name}</span>
          </div>

          {/* Stats rapides */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Total matchs', val: stats.total,     color: '#a0a0a0' },
              { label: '✅ Terminés',  val: stats.completed, color: '#4ad569' },
              { label: '🔴 En cours',  val: stats.live,      color: '#f59e0b' },
              { label: '⏳ À jouer',   val: stats.pending,   color: '#3b82f6' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                <div style={{ color: s.color, fontWeight: 800, fontSize: '24px', fontFamily: 'JetBrains Mono,monospace' }}>{s.val}</div>
                <div style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filtres + actions */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
              <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtrer par round ou équipe…"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '9px 12px 9px 34px', color: 'white', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
            </div>
            <button onClick={() => setNewMatch(true)} style={{ background: '#4ad569', color: '#0a0a0a', border: 'none', borderRadius: '8px', padding: '9px 18px', fontWeight: 700, cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              + Ajouter un match
            </button>
          </div>

          {/* Formulaire nouveau match */}
          {newMatch && (
            <GlassCard style={{ padding: '18px', marginBottom: '16px' }}>
              <h4 style={{ color: 'white', margin: '0 0 14px', fontSize: '14px' }}>Nouveau match</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '10px', marginBottom: '14px' }}>
                {[
                  { label: 'Round', key: 'round', ph: 'QF' },
                  { label: 'Court', key: 'court_label', ph: 'Court 1' },
                  { label: 'Équipe 1', key: 'team1_name', ph: 'Dupont / Martin' },
                  { label: 'Équipe 2', key: 'team2_name', ph: 'Bernard / Leroy' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ color: '#666', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                    <input value={(nm as any)[f.key] ?? ''} onChange={e => setNm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.ph}
                      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px 10px', color: 'white', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleAddMatch} style={{ background: '#4ad569', color: '#0a0a0a', border: 'none', borderRadius: '6px', padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>Créer</button>
                <button onClick={() => setNewMatch(false)} style={{ background: 'rgba(255,255,255,0.05)', color: '#a0a0a0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px' }}>Annuler</button>
              </div>
            </GlassCard>
          )}

          {/* Table scores */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Chargement…</div>
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(74,213,105,0.1)', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(74,213,105,0.1)' }}>
                    {['Round','Court','Équipes','Set 1','Set 2','TB','Vainqueur','Statut',''].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', color: '#555', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Aucun match trouvé</td></tr>
                  ) : (
                    filtered.map(m => <ScoreRow key={m.id} match={m} onSave={handleSaveMatch} />)
                  )}
                </tbody>
              </table>
            </div>
          )}

          {isSupabaseConnected() && (
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: '#4ad569', fontSize: '12px' }}>
              <Zap size={12} /> Les scores se mettent à jour en temps réel via Supabase Realtime
            </div>
          )}
        </div>
      )}
    </div>
  );
}
