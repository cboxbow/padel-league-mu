import { useState, useEffect, useCallback } from 'react';
import { Trophy, Shuffle, ChevronRight, Check, X, Users, AlertCircle } from 'lucide-react';
import { GlassCard, CategoryBadge, RegionBadge } from '@/components/Layout';
import { getSupabaseClient, isSupabaseConnected, safeSupabaseQuery } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Team   { id: string; name: string; seed?: number; player1_name?: string; player2_name?: string; }
interface Match  { id: string; round: string; position: number; team1?: Team; team2?: Team; winner?: Team; score?: string; status: 'pending' | 'live' | 'done'; }
interface Tourn  { id: string; name: string; category: string; division: string; region: string; max_teams: number; registered_teams?: number; teams_registered?: number; status: string; }

// ── Génération bracket ────────────────────────────────────────────────────────
function generateBracket(teams: Team[]): Match[][] {
  const n  = Math.pow(2, Math.ceil(Math.log2(Math.max(teams.length, 2))));
  const t  = [...teams];
  // Rembourrage BYE
  while (t.length < n) t.push({ id: `bye-${t.length}`, name: 'BYE' });

  // Seeding: 1 vs n, 2 vs n-1 ...
  const seeded: Team[] = Array(n).fill(null);
  const positions = buildSeedPositions(n);
  t.forEach((team, i) => { seeded[positions[i]] = team; });

  const rounds: Match[][] = [];
  let current = seeded;
  let roundIdx = 0;
  while (current.length > 1) {
    const roundMatches: Match[] = [];
    const labels = ['R64','R32','R16','QF','SF','F'];
    const label = labels[roundIdx] ?? `R${current.length}`;
    for (let i = 0; i < current.length; i += 2) {
      roundMatches.push({
        id: `${label}-${i/2}`, round: label, position: i/2,
        team1: current[i], team2: current[i+1],
        status: 'pending',
      });
    }
    rounds.push(roundMatches);
    current = Array(current.length / 2).fill(null).map(() => ({ id: 'tbd', name: 'TBD' }));
    roundIdx++;
  }
  return rounds;
}

function buildSeedPositions(n: number): number[] {
  if (n === 1) return [0];
  const prev = buildSeedPositions(n / 2);
  const result: number[] = Array(n).fill(0);
  prev.forEach((p, i) => {
    result[i * 2]     = p * 2;
    result[i * 2 + 1] = n - 1 - p * 2;
  });
  return result;
}

// ── Composant match ───────────────────────────────────────────────────────────
function MatchCard({ match, onPickWinner }: {
  match: Match;
  onPickWinner?: (match: Match, winner: 'team1' | 'team2', score: string) => void;
}) {
  const [showScore, setShowScore] = useState(false);
  const [score, setScore] = useState('');
  const isBye = (t?: Team) => !t || t.name === 'BYE';

  const teamStyle = (t?: Team, isWinner?: boolean): React.CSSProperties => ({
    padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px',
    background: isWinner ? 'rgba(74,213,105,0.15)' : 'transparent',
    borderRadius: '6px', cursor: isBye(t) ? 'default' : 'pointer',
    opacity: isBye(t) ? 0.3 : 1, transition: 'background 0.15s',
  });

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(74,213,105,0.1)', borderRadius: '10px', overflow: 'hidden', minWidth: '200px', maxWidth: '240px' }}>
      {/* Team 1 */}
      <div style={teamStyle(match.team1, match.winner?.id === match.team1?.id)}
        onClick={() => { if (!isBye(match.team1) && !isBye(match.team2) && onPickWinner && !match.winner) setShowScore(true); }}>
        {match.team1?.seed && <span style={{ color: '#f59e0b', fontSize: '10px', fontWeight: 700, minWidth: '14px' }}>{match.team1.seed}</span>}
        <span style={{ color: match.winner?.id === match.team1?.id ? '#4ad569' : 'white', fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {match.team1?.name ?? 'TBD'}
        </span>
        {match.winner?.id === match.team1?.id && <Check size={12} style={{ color: '#4ad569', flexShrink: 0 }} />}
      </div>
      {/* Séparateur */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />
      {/* Team 2 */}
      <div style={teamStyle(match.team2, match.winner?.id === match.team2?.id)}
        onClick={() => { if (!isBye(match.team1) && !isBye(match.team2) && onPickWinner && !match.winner) setShowScore(true); }}>
        {match.team2?.seed && <span style={{ color: '#f59e0b', fontSize: '10px', fontWeight: 700, minWidth: '14px' }}>{match.team2.seed}</span>}
        <span style={{ color: match.winner?.id === match.team2?.id ? '#4ad569' : 'white', fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {match.team2?.name ?? 'TBD'}
        </span>
        {match.winner?.id === match.team2?.id && <Check size={12} style={{ color: '#4ad569', flexShrink: 0 }} />}
      </div>
      {/* Score */}
      {match.score && (
        <div style={{ padding: '4px 12px', background: 'rgba(0,0,0,0.3)', textAlign: 'center', color: '#a0a0a0', fontSize: '11px', fontFamily: 'JetBrains Mono,monospace' }}>{match.score}</div>
      )}
      {/* Modal score rapide */}
      {showScore && (
        <div style={{ padding: '10px 12px', background: 'rgba(74,213,105,0.08)', borderTop: '1px solid rgba(74,213,105,0.15)' }}>
          <input value={score} onChange={e => setScore(e.target.value)} placeholder="ex: 6-3 / 6-4"
            style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(74,213,105,0.3)', borderRadius: '6px', padding: '4px 8px', color: 'white', fontSize: '12px', boxSizing: 'border-box', marginBottom: '6px', outline: 'none' }} />
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => { onPickWinner?.(match, 'team1', score); setShowScore(false); }}
              style={{ flex: 1, background: 'rgba(74,213,105,0.2)', color: '#4ad569', border: 'none', borderRadius: '4px', padding: '4px', fontSize: '11px', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ✓ {match.team1?.name.split(' ')[0]}
            </button>
            <button onClick={() => { onPickWinner?.(match, 'team2', score); setShowScore(false); }}
              style={{ flex: 1, background: 'rgba(74,213,105,0.2)', color: '#4ad569', border: 'none', borderRadius: '4px', padding: '4px', fontSize: '11px', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ✓ {match.team2?.name.split(' ')[0]}
            </button>
            <button onClick={() => setShowScore(false)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', borderRadius: '4px', padding: '4px 6px', fontSize: '11px', cursor: 'pointer' }}><X size={10} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Round labels ──────────────────────────────────────────────────────────────
const ROUND_LABELS: Record<string, string> = {
  R64: '1/32', R32: '1/16', R16: '1/8', QF: 'Quarts', SF: 'Demies', F: 'Finale',
};

// ── Page principale ───────────────────────────────────────────────────────────
export default function BracketsPage() {
  const [tournaments, setTournaments]     = useState<Tourn[]>([]);
  const [selected, setSelected]           = useState<Tourn | null>(null);
  const [teams, setTeams]                 = useState<Team[]>([]);
  const [rounds, setRounds]               = useState<Match[][]>([]);
  const [generated, setGenerated]         = useState(false);
  const [loadingTeams, setLoadingTeams]   = useState(false);
  const [savingMsg, setSavingMsg]         = useState('');

  // Charger tournois
  useEffect(() => {
    async function load() {
      const sb = getSupabaseClient();
      if (isSupabaseConnected() && sb) {
        const { data, timedOut } = await safeSupabaseQuery(() => sb.from('tournaments').select('*').limit(500));
        if (data && !timedOut) {
          const rows = data as Tourn[];
          rows.sort((a: Tourn, b: Tourn) => {
            const da = (a as unknown as Record<string,string>).date ?? (a as unknown as Record<string,string>).tournament_date ?? (a as unknown as Record<string,string>).start_date ?? '';
            const db = (b as unknown as Record<string,string>).date ?? (b as unknown as Record<string,string>).tournament_date ?? (b as unknown as Record<string,string>).start_date ?? '';
            return da.localeCompare(db);
          });
          setTournaments(rows); return;
        }
      }
      setTournaments([]);
    }
    load();
  }, []);

  // Charger paires inscrites
  const loadTeams = useCallback(async (t: Tourn) => {
    setLoadingTeams(true);
    setRounds([]);
    setGenerated(false);
    const sb = getSupabaseClient();
    if (isSupabaseConnected() && sb) {
      // Tentative 1 : requête avec jointures FK complètes
      const { data: regs, error: regsErr } = await sb
        .from('registrations')
        .select('seed, teams(id, name, player1:players!teams_player1_id_fkey(first_name,last_name), player2:players!teams_player2_id_fkey(first_name,last_name))')
        .eq('tournament_id', t.id)
        .eq('confirmed', true)
        .order('seed', { ascending: true });

      if (!regsErr && regs && regs.length > 0) {
        const parsed: Team[] = regs.map((r: any) => ({
          id: r.teams?.id ?? r.id,
          name: r.teams?.name ?? `${r.teams?.player1?.first_name ?? ''} / ${r.teams?.player2?.first_name ?? ''}`,
          seed: r.seed,
        }));
        setTeams(parsed);
        setLoadingTeams(false);
        return;
      }

      // Tentative 2 : requête simplifiée sans FK (si les relations n'existent pas)
      if (regsErr) {
        console.warn('[Brackets] FK query failed:', regsErr.message, '→ fallback simple select');
        const { data: regsSimple } = await sb
          .from('registrations')
          .select('id, seed, team_id, team_name, player1_name, player2_name, confirmed')
          .eq('tournament_id', t.id)
          .order('seed', { ascending: true });

        if (regsSimple && regsSimple.length > 0) {
          const filtered = (regsSimple as any[]).filter(r => r.confirmed !== false);
          if (filtered.length > 0) {
            const parsed: Team[] = filtered.map((r: any) => ({
              id: r.team_id ?? r.id,
              name: r.team_name ?? (`${r.player1_name ?? ''} / ${r.player2_name ?? ''}`.trim() || `Paire #${r.seed ?? '?'}`),
              seed: r.seed,
            }));
            setTeams(parsed);
            setLoadingTeams(false);
            return;
          }
        }
      }
    }
    // Mock teams
    const mockTeams: Team[] = Array.from({ length: Math.min(t.registered_teams ?? t.teams_registered ?? 8, 16) }, (_, i) => ({
      id: `t${i+1}`, name: `Paire ${i+1}`, seed: i < 4 ? i + 1 : undefined,
    }));
    setTeams(mockTeams);
    setLoadingTeams(false);
  }, []);

  const handleSelect = (t: Tourn) => { setSelected(t); loadTeams(t); };

  const handleGenerate = () => {
    if (!teams.length) return;
    const seeded   = teams.filter(t => t.seed).sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));
    const unseeded = teams.filter(t => !t.seed).sort(() => Math.random() - 0.5);
    setRounds(generateBracket([...seeded, ...unseeded]));
    setGenerated(true);
  };

  const handlePickWinner = async (match: Match, side: 'team1' | 'team2', score: string) => {
    setRounds(prev => {
      const next = prev.map(round =>
        round.map(m => {
          if (m.id !== match.id) return m;
          const winner = side === 'team1' ? m.team1! : m.team2!;
          return { ...m, winner, score, status: 'done' as const };
        })
      );
      // Propager le gagnant au round suivant
      next.forEach((round, ri) => {
        if (ri + 1 < next.length) {
          round.forEach((m, mi) => {
            if (m.id === match.id && m.winner) {
              const nextMatch = Math.floor(mi / 2);
              const slot      = mi % 2 === 0 ? 'team1' : 'team2';
              next[ri + 1] = next[ri + 1].map((nm, nmi) =>
                nmi === nextMatch ? { ...nm, [slot]: m.winner } : nm
              );
            }
          });
        }
      });
      return next;
    });

    // Sauvegarder dans Supabase
    const sb = getSupabaseClient();
    if (isSupabaseConnected() && sb && selected) {
      setSavingMsg('Sauvegarde…');
      const winner = side === 'team1' ? match.team1! : match.team2!;
      await sb.from('matches').upsert({
        tournament_id: selected.id,
        round: match.round,
        team1_id: match.team1?.id,
        team2_id: match.team2?.id,
        winner_id: winner.id,
        score_set1: score.split('/')[0]?.trim(),
        score_set2: score.split('/')[1]?.trim(),
        status: 'completed',
      });
      setSavingMsg('✓ Sauvegardé');
      setTimeout(() => setSavingMsg(''), 2000);
    }
  };

  const winner = rounds.length > 0 ? rounds[rounds.length - 1]?.[0]?.winner : null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ color: 'white', fontWeight: 700, margin: '0 0 4px' }}>Gestion des Brackets</h2>
          <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>
            Générez et gérez les tableaux de tournois · {isSupabaseConnected() ? '🟢 Supabase' : '🟡 Mode démo'}
          </p>
        </div>
        {savingMsg && <span style={{ color: '#4ad569', fontSize: '13px', alignSelf: 'center' }}>{savingMsg}</span>}
      </div>

      {/* Sélection tournoi */}
      {!selected ? (
        <div>
          <p style={{ color: '#a0a0a0', marginBottom: '16px', fontSize: '14px' }}>Sélectionnez un tournoi pour générer son bracket :</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '14px' }}>
            {tournaments.map(t => (
              <div key={t.id} onClick={() => handleSelect(t)} style={{ cursor: 'pointer', borderRadius: '16px' }}>
              <GlassCard hoverable style={{ padding: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <CategoryBadge category={t.category as any} />
                  <RegionBadge region={t.region as any} />
                </div>
                <h3 style={{ color: 'white', fontWeight: 700, margin: '0 0 6px', fontSize: '15px' }}>{t.name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#666', fontSize: '13px' }}>
                  <Users size={13} />
                  <span>{t.registered_teams ?? t.teams_registered ?? 0}/{t.max_teams ?? '?'} paires inscrites</span>
                </div>
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ background: t.status === 'ongoing' ? 'rgba(74,213,105,0.1)' : 'rgba(59,130,246,0.1)', color: t.status === 'ongoing' ? '#4ad569' : '#3b82f6', borderRadius: '6px', padding: '2px 8px', fontSize: '12px' }}>{t.status}</span>
                  <ChevronRight size={14} style={{ color: '#4ad569', marginLeft: 'auto' }} />
                </div>
              </GlassCard>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <button onClick={() => { setSelected(null); setRounds([]); setGenerated(false); }}
              style={{ background: 'none', border: 'none', color: '#4ad569', cursor: 'pointer', fontSize: '13px', padding: 0 }}>← Tournois</button>
            <ChevronRight size={12} style={{ color: '#555' }} />
            <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>{selected.name}</span>
          </div>

          {/* Info + génération */}
          <GlassCard style={{ padding: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <CategoryBadge category={selected.category as any} />
                <RegionBadge region={selected.region as any} />
                <span style={{ color: '#a0a0a0', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Users size={13} /> {loadingTeams ? '…' : teams.length} paires
                </span>
              </div>
              {!generated ? (
                <button onClick={handleGenerate} disabled={loadingTeams || teams.length < 2}
                  style={{ background: '#4ad569', color: '#0a0a0a', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: loadingTeams || teams.length < 2 ? 0.5 : 1 }}>
                  <Shuffle size={16} /> Générer le bracket
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {winner && (
                    <div style={{ background: 'rgba(74,213,105,0.1)', border: '1px solid rgba(74,213,105,0.3)', borderRadius: '8px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Trophy size={16} style={{ color: '#f59e0b' }} />
                      <span style={{ color: '#4ad569', fontWeight: 700, fontSize: '14px' }}>🏆 {winner.name}</span>
                    </div>
                  )}
                  <button onClick={() => { setGenerated(false); setRounds([]); }}
                    style={{ background: 'rgba(255,255,255,0.05)', color: '#a0a0a0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px 16px', cursor: 'pointer', fontSize: '13px' }}>
                    Réinitialiser
                  </button>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Liste paires si pas généré */}
          {!generated && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ color: 'white', fontWeight: 700, margin: '0 0 14px', fontSize: '15px' }}>
                Paires inscrites ({teams.length})
              </h3>
              {teams.length === 0 && !loadingTeams && (
                <div style={{ color: '#666', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={16} /> Aucune paire confirmée pour ce tournoi.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '10px' }}>
                {teams.map((t, i) => (
                  <div key={t.id} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${t.seed ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: t.seed ? '#f59e0b' : '#555', fontWeight: 700, fontSize: '13px', minWidth: '20px' }}>
                      {t.seed ? `#${t.seed}` : `${i+1}`}
                    </span>
                    <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>{t.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bracket visuel */}
          {generated && rounds.length > 0 && (
            <div style={{ overflowX: 'auto', paddingBottom: '16px' }}>
              <p style={{ color: '#666', fontSize: '12px', marginBottom: '12px' }}>
                💡 Cliquez sur un match pour saisir le score et désigner le vainqueur
              </p>
              <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start', minWidth: 'max-content' }}>
                {rounds.map((round, ri) => (
                  <div key={ri} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ color: '#4ad569', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', marginBottom: '8px', padding: '4px 12px', background: 'rgba(74,213,105,0.08)', borderRadius: '6px' }}>
                      {ROUND_LABELS[round[0]?.round] ?? round[0]?.round}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: `${Math.pow(2, ri) * 8}px` }}>
                      {round.map(match => (
                        <MatchCard key={match.id} match={match} onPickWinner={handlePickWinner} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
