import { useState, useEffect, useCallback } from 'react';
import { Play, RefreshCw, CheckCircle2, AlertTriangle, Wifi, WifiOff, Clock, Trophy, Zap, ChevronRight } from 'lucide-react';
import { GlassCard } from '@/components/Layout';
import { getSupabaseClient, isSupabaseConnected } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tournament {
  id: string;
  name: string;
}

interface MatchRow {
  id: string;
  tournament_id: string;
  team1_name?: string;
  team2_name?: string;
  team1_id?: string;
  team2_id?: string;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  score_set1?: string;
  score_set2?: string;
  score_tb?: string;
  golden_point?: boolean;
  super_tiebreak?: boolean;
  winner_id?: string | null;
  round?: string;
  court?: string;
  scheduled_at?: string;
}

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_TOURNAMENTS: Tournament[] = [
  { id: 'T1', name: 'MPL Open Nord 2026' },
  { id: 'T2', name: 'MPL Challenge Ouest 2026' },
];

const MOCK_MATCHES: MatchRow[] = [
  { id: 'M1', tournament_id: 'T1', team1_name: 'Dupont / Martin', team2_name: 'Leclerc / Renard', status: 'scheduled', round: 'QF', court: 'Court 1' },
  { id: 'M2', tournament_id: 'T1', team1_name: 'Moreau / Simon', team2_name: 'Bernard / Petit', status: 'live', score_set1: '6-3', score_set2: '4-5', round: 'QF', court: 'Court 2' },
  { id: 'M3', tournament_id: 'T1', team1_name: 'Thomas / Girard', team2_name: 'Robert / Michel', status: 'completed', score_set1: '6-4', score_set2: '6-2', round: 'QF', court: 'Court 3' },
  { id: 'M4', tournament_id: 'T1', team1_name: 'Richard / Lambert', team2_name: 'Fontaine / Vincent', status: 'scheduled', round: 'QF', court: 'Court 4' },
  { id: 'M5', tournament_id: 'T2', team1_name: 'Leroy / Blanc', team2_name: 'Garnier / Faure', status: 'scheduled', round: 'SF', court: 'Court 1' },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  scheduled: { label: 'Programmé', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  live:      { label: 'En cours', color: '#4ad569', bg: 'rgba(74,213,105,0.12)' },
  completed: { label: 'Terminé',  color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  cancelled: { label: 'Annulé',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

// ── Composant score ───────────────────────────────────────────────────────────

function ScoreInput({
  label, value, onChange
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '11px', color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="6-4"
        style={{
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(74,213,105,0.25)',
          borderRadius: '8px',
          padding: '12px 14px',
          color: 'white',
          fontSize: '18px',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 700,
          textAlign: 'center',
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        background: checked ? 'rgba(74,213,105,0.15)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${checked ? 'rgba(74,213,105,0.35)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: '8px',
        padding: '8px 14px',
        color: checked ? '#4ad569' : '#666',
        fontSize: '12px',
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'all 0.2s',
      }}
    >
      <span style={{
        width: '12px', height: '12px', borderRadius: '50%',
        background: checked ? '#4ad569' : 'rgba(255,255,255,0.15)',
        transition: 'background 0.2s',
        flexShrink: 0,
      }} />
      {label}
    </button>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function LiveScoringPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournId, setSelectedTournId] = useState('');
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [editMatch, setEditMatch] = useState<Partial<MatchRow> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' | 'warn' } | null>(null);
  const isDemo = !isSupabaseConnected();

  const showMsg = (text: string, type: 'ok' | 'err' | 'warn' = 'ok') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  };

  // Charger tournois
  const loadTournaments = useCallback(async () => {
    if (isDemo) { setTournaments(MOCK_TOURNAMENTS); return; }
    const sb = getSupabaseClient()!;
    const { data } = await sb.from('tournaments').select('id, name').order('name');
    setTournaments((data ?? []) as Tournament[]);
  }, [isDemo]);

  useEffect(() => { loadTournaments(); }, [loadTournaments]);

  // Charger matches
  const loadMatches = useCallback(async (tournId: string) => {
    if (!tournId) return;
    setLoading(true);
    if (isDemo) {
      setMatches(MOCK_MATCHES.filter(m => m.tournament_id === tournId));
      setLoading(false);
      return;
    }
    const sb = getSupabaseClient()!;
    const { data, error } = await sb
      .from('matches')
      .select('*')
      .eq('tournament_id', tournId)
      .in('status', ['scheduled', 'live', 'completed'])
      .order('scheduled_at', { ascending: true });
    if (error) showMsg(`Erreur: ${error.message}`, 'err');
    else setMatches((data ?? []) as MatchRow[]);
    setLoading(false);
  }, [isDemo]);

  // Realtime subscription
  useEffect(() => {
    if (!selectedTournId || isDemo) return;
    const sb = getSupabaseClient()!;
    const channel = sb
      .channel(`matches_live_${selectedTournId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'matches',
        filter: `tournament_id=eq.${selectedTournId}`,
      }, () => {
        loadMatches(selectedTournId);
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [selectedTournId, isDemo, loadMatches]);

  useEffect(() => {
    if (selectedTournId) {
      setSelectedMatchId('');
      setEditMatch(null);
      loadMatches(selectedTournId);
    }
  }, [selectedTournId, loadMatches]);

  // Sélectionner un match
  const selectMatch = (match: MatchRow) => {
    setSelectedMatchId(match.id);
    setEditMatch({ ...match });
  };

  // Changer statut
  const handleStatus = (status: MatchRow['status']) => {
    setEditMatch(m => m ? { ...m, status } : m);
  };

  // Sauvegarder
  const handleSave = async () => {
    if (!editMatch || !selectedMatchId) return;
    setSaving(true);

    // Calcul winner_id simple: team avec plus de sets gagnés
    let winner_id: string | null = null;
    const s1 = editMatch.score_set1 || '';
    const s2 = editMatch.score_set2 || '';
    if (editMatch.status === 'completed' && s1 && s2) {
      const [s1a, s1b] = s1.split('-').map(Number);
      const [s2a, s2b] = s2.split('-').map(Number);
      const winsA = (s1a > s1b ? 1 : 0) + (s2a > s2b ? 1 : 0);
      const winsB = (s1a < s1b ? 1 : 0) + (s2a < s2b ? 1 : 0);
      if (winsA > winsB && editMatch.team1_id) winner_id = editMatch.team1_id;
      else if (winsB > winsA && editMatch.team2_id) winner_id = editMatch.team2_id;
    }

    const payload = {
      score_set1:   editMatch.score_set1   ?? null,
      score_set2:   editMatch.score_set2   ?? null,
      score_tb:     editMatch.score_tb     ?? null,
      status:       editMatch.status       ?? 'scheduled',
      golden_point: editMatch.golden_point ?? false,
      super_tiebreak: editMatch.super_tiebreak ?? false,
      winner_id,
    };

    if (isDemo) {
      setMatches(prev => prev.map(m => m.id === selectedMatchId ? { ...m, ...payload } : m));
      setSaving(false);
      showMsg('Sauvegardé (mode démo)', 'warn');
      return;
    }

    const sb = getSupabaseClient()!;
    const { error } = await sb.from('matches').update(payload).eq('id', selectedMatchId);
    if (error) { showMsg(`Erreur: ${error.message}`, 'err'); setSaving(false); return; }
    await loadMatches(selectedTournId);
    setSaving(false);
    showMsg('Match mis à jour ✓', 'ok');
  };

  const selectedMatch = matches.find(m => m.id === selectedMatchId);

  return (
    <div style={{ color: 'white', fontFamily: 'Inter, sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <Zap size={24} color="#4ad569" />
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800 }}>Score Live</h2>
          {isDemo && (
            <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: 700 }}>
              MODE DÉMO
            </span>
          )}
          {!isDemo && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(74,213,105,0.1)', color: '#4ad569', border: '1px solid rgba(74,213,105,0.25)', borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: 700 }}>
              <Wifi size={11} /> Realtime actif
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>Saisie des scores en temps réel · Tactile optimisé</p>
      </div>

      {/* Message */}
      {msg && (
        <div style={{
          background: msg.type === 'ok' ? 'rgba(74,213,105,0.1)' : msg.type === 'err' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
          color: msg.type === 'ok' ? '#4ad569' : msg.type === 'err' ? '#ef4444' : '#f59e0b',
          border: `1px solid ${msg.type === 'ok' ? 'rgba(74,213,105,0.25)' : msg.type === 'err' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
          borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          {msg.type === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {msg.text}
        </div>
      )}

      {/* Sélecteur tournoi */}
      <GlassCard style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: '#4ad569', fontWeight: 600, minWidth: '80px' }}>Tournoi</span>
          <select
            value={selectedTournId}
            onChange={e => setSelectedTournId(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(74,213,105,0.2)',
              borderRadius: '8px', padding: '10px 14px',
              color: 'white', fontSize: '14px', cursor: 'pointer', flex: 1, minWidth: '200px',
            }}
          >
            <option value="">— Sélectionner un tournoi —</option>
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button
            onClick={() => selectedTournId && loadMatches(selectedTournId)}
            style={{ background: 'rgba(255,255,255,0.05)', color: '#a0a0a0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <RefreshCw size={14} /> Actualiser
          </button>
        </div>
      </GlassCard>

      {/* Layout 2 colonnes */}
      {selectedTournId && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px' }}>

          {/* Liste des matches */}
          <div>
            <div style={{ fontSize: '12px', color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
              {loading ? 'Chargement…' : `${matches.length} match${matches.length !== 1 ? 's' : ''}`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {matches.map(match => {
                const cfg = STATUS_CONFIG[match.status] ?? STATUS_CONFIG.scheduled;
                const isSelected = match.id === selectedMatchId;
                return (
                  <button
                    key={match.id}
                    onClick={() => selectMatch(match)}
                    style={{
                      background: isSelected ? 'rgba(74,213,105,0.08)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isSelected ? 'rgba(74,213,105,0.3)' : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: '10px',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s',
                      width: '100%',
                    }}
                  >
                    {/* Status badge + round */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          background: cfg.bg, color: cfg.color,
                          fontSize: '10px', fontWeight: 800,
                          padding: '2px 7px', borderRadius: '4px',
                          textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>
                          {cfg.label}
                        </span>
                        {match.status === 'live' && (
                          <span style={{
                            width: '7px', height: '7px', borderRadius: '50%',
                            background: '#4ad569',
                            boxShadow: '0 0 8px #4ad569',
                            animation: 'pulse 1.5s infinite',
                            display: 'inline-block',
                          }} />
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {match.round && <span style={{ fontSize: '10px', color: '#555', fontWeight: 700 }}>{match.round}</span>}
                        {match.court && <span style={{ fontSize: '10px', color: '#444' }}>{match.court}</span>}
                      </div>
                    </div>

                    {/* Équipes */}
                    <div style={{ fontSize: '13px', color: 'white', fontWeight: 600, marginBottom: '4px' }}>
                      {match.team1_name || 'Équipe 1'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#555', fontSize: '11px', marginBottom: '6px' }}>
                      <ChevronRight size={10} /> vs
                    </div>
                    <div style={{ fontSize: '13px', color: '#d0d0d0', fontWeight: 500 }}>
                      {match.team2_name || 'Équipe 2'}
                    </div>

                    {/* Scores */}
                    {(match.score_set1 || match.score_set2) && (
                      <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
                        {match.score_set1 && (
                          <span style={{ background: 'rgba(74,213,105,0.1)', color: '#4ad569', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                            {match.score_set1}
                          </span>
                        )}
                        {match.score_set2 && (
                          <span style={{ background: 'rgba(74,213,105,0.1)', color: '#4ad569', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                            {match.score_set2}
                          </span>
                        )}
                        {match.score_tb && (
                          <span style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                            TB: {match.score_tb}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}

              {matches.length === 0 && !loading && (
                <div style={{ color: '#555', fontSize: '13px', textAlign: 'center', padding: '30px 0' }}>
                  Aucun match pour ce tournoi
                </div>
              )}
            </div>
          </div>

          {/* Panneau de score */}
          <div>
            {!selectedMatch ? (
              <GlassCard style={{ padding: '40px', textAlign: 'center' as const }}>
                <Trophy size={40} color="#333" style={{ marginBottom: '12px' }} />
                <p style={{ color: '#555', fontSize: '14px', margin: 0 }}>
                  Sélectionnez un match dans la liste pour saisir le score
                </p>
              </GlassCard>
            ) : editMatch && (
              <GlassCard style={{ padding: '24px' }}>
                {/* Header match */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                        {editMatch.round} · {editMatch.court}
                      </span>
                    </div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'white' }}>
                      {editMatch.team1_name} <span style={{ color: '#333' }}>vs</span> {editMatch.team2_name}
                    </h3>
                  </div>
                  {/* Indicateur LIVE */}
                  {editMatch.status === 'live' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(74,213,105,0.15)', border: '1px solid rgba(74,213,105,0.3)', borderRadius: '20px', padding: '4px 12px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ad569', boxShadow: '0 0 10px #4ad569', animation: 'pulse 1.5s infinite', display: 'inline-block' }} />
                      <span style={{ fontSize: '11px', color: '#4ad569', fontWeight: 800 }}>LIVE</span>
                    </div>
                  )}
                </div>

                {/* Scores */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '20px' }}>
                  <ScoreInput
                    label="Set 1"
                    value={editMatch.score_set1 ?? ''}
                    onChange={v => setEditMatch(m => m ? { ...m, score_set1: v } : m)}
                  />
                  <ScoreInput
                    label="Set 2"
                    value={editMatch.score_set2 ?? ''}
                    onChange={v => setEditMatch(m => m ? { ...m, score_set2: v } : m)}
                  />
                  <ScoreInput
                    label={editMatch.super_tiebreak ? 'Super Tie-break' : 'Tie-break'}
                    value={editMatch.score_tb ?? ''}
                    onChange={v => setEditMatch(m => m ? { ...m, score_tb: v } : m)}
                  />
                </div>

                {/* Options */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  <Toggle
                    label="Golden Point"
                    checked={editMatch.golden_point ?? false}
                    onChange={v => setEditMatch(m => m ? { ...m, golden_point: v } : m)}
                  />
                  <Toggle
                    label="Super Tie-break (3ème set)"
                    checked={editMatch.super_tiebreak ?? false}
                    onChange={v => setEditMatch(m => m ? { ...m, super_tiebreak: v } : m)}
                  />
                </div>

                {/* Statuts */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '12px', color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                    Statut du match
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {(['scheduled', 'live', 'completed', 'cancelled'] as const).map(s => {
                      const cfg = STATUS_CONFIG[s];
                      const isActive = editMatch.status === s;
                      return (
                        <button
                          key={s}
                          onClick={() => handleStatus(s)}
                          style={{
                            background: isActive ? cfg.bg : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${isActive ? cfg.color + '60' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: '8px',
                            padding: '10px 16px',
                            color: isActive ? cfg.color : '#666',
                            fontSize: '13px',
                            fontWeight: isActive ? 700 : 400,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.15s',
                          }}
                        >
                          {s === 'scheduled' && <Clock size={13} />}
                          {s === 'live' && <Play size={13} />}
                          {s === 'completed' && <CheckCircle2 size={13} />}
                          {s === 'cancelled' && <WifiOff size={13} />}
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sauvegarder */}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    background: '#4ad569',
                    color: '#0a0a0a',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '14px 24px',
                    fontWeight: 800,
                    fontSize: '15px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    justifyContent: 'center',
                    transition: 'opacity 0.2s',
                  }}
                >
                  <CheckCircle2 size={16} />
                  {saving ? 'Sauvegarde…' : 'Sauvegarder le score'}
                </button>
              </GlassCard>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
