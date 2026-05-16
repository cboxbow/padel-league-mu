import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient, isSupabaseConnected } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LiveMatch {
  id: string;
  team1_name?: string;
  team2_name?: string;
  score_set1?: string;
  score_set2?: string;
  score_tb?: string;
  status: string;
  round?: string;
  court?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getQueryParam(name: string): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return params.get(name) ?? '';
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function ObsScoreboard() {
  const tournamentId = getQueryParam('tournament_id');
  const bgParam      = getQueryParam('bg');
  const darkBg       = bgParam === 'dark';

  const [match, setMatch]   = useState<LiveMatch | null>(null);
  const [pulse, setPulse]   = useState(false);
  const [connected, setConnected] = useState(false);
  const isDemo = !isSupabaseConnected();

  // Fetch live match
  const fetchLiveMatch = useCallback(async () => {
    if (isDemo) {
      // Mode démo : simuler un match live
      setMatch({
        id:          'demo',
        team1_name:  'Dupont / Martin',
        team2_name:  'Leclerc / Renard',
        score_set1:  '6-3',
        score_set2:  '5-4',
        score_tb:    '',
        status:      'live',
        round:       'SF',
        court:       'Court Central',
      });
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) return;

    let query = sb
      .from('matches')
      .select('*')
      .eq('status', 'live')
      .limit(1);

    if (tournamentId) {
      query = query.eq('tournament_id', tournamentId);
    }

    const { data } = await query.maybeSingle();
    setMatch(data as LiveMatch | null);
  }, [isDemo, tournamentId]);

  // Initial fetch
  useEffect(() => {
    fetchLiveMatch();
  }, [fetchLiveMatch]);

  // Realtime subscription
  useEffect(() => {
    if (isDemo) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    const filter = tournamentId
      ? `tournament_id=eq.${tournamentId}`
      : undefined;

    const channelOpts = filter
      ? { event: '*' as const, schema: 'public', table: 'matches', filter }
      : { event: '*' as const, schema: 'public', table: 'matches' };

    const channel = sb
      .channel('obs_scoreboard')
      .on('postgres_changes', channelOpts, () => {
        fetchLiveMatch();
        setPulse(true);
        setTimeout(() => setPulse(false), 600);
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => { sb.removeChannel(channel); };
  }, [isDemo, tournamentId, fetchLiveMatch]);

  // Auto-refresh toutes les 10s en fallback
  useEffect(() => {
    const timer = setInterval(fetchLiveMatch, 10000);
    return () => clearInterval(timer);
  }, [fetchLiveMatch]);

  // ── Rendu ─────────────────────────────────────────────────────────────────

  const containerStyle: React.CSSProperties = {
    width:      '100vw',
    height:     '100vh',
    background: darkBg ? 'rgba(0,0,0,0.85)' : 'transparent',
    display:    'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    padding:    '0 0 60px',
    boxSizing:  'border-box',
    fontFamily: 'Inter, system-ui, sans-serif',
    overflow:   'hidden',
  };

  // Pas de match live
  if (!match) {
    return (
      <div style={containerStyle}>
        <div style={{
          background: darkBg ? 'rgba(0,0,0,0.7)' : 'rgba(10,10,10,0.6)',
          border:     '1px solid rgba(74,213,105,0.2)',
          borderRadius: '16px',
          padding:    '20px 48px',
          textAlign:  'center',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}>
          <p style={{
            color:      'rgba(255,255,255,0.5)',
            fontSize:   '28px',
            fontWeight: 600,
            margin:     0,
            letterSpacing: '0.5px',
          }}>
            En attente d'un match live…
          </p>
        </div>
      </div>
    );
  }

  // Match live
  return (
    <div style={containerStyle}>
      <div style={{
        background:  darkBg ? 'rgba(0,0,0,0.82)' : 'rgba(10,10,10,0.72)',
        border:      `2px solid rgba(74,213,105,${pulse ? '0.9' : '0.35'})`,
        borderRadius: '20px',
        padding:     '28px 56px',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow:   `0 0 ${pulse ? '40px' : '20px'} rgba(74,213,105,${pulse ? '0.25' : '0.1'})`,
        transition:  'border-color 0.3s, box-shadow 0.3s',
        minWidth:    '760px',
        maxWidth:    '1100px',
      }}>

        {/* Top bar : round + court + LIVE dot */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {match.round && (
              <span style={{
                background: 'rgba(74,213,105,0.15)',
                color:      '#4ad569',
                border:     '1px solid rgba(74,213,105,0.3)',
                borderRadius: '6px',
                padding:    '3px 12px',
                fontSize:   '18px',
                fontWeight: 800,
                letterSpacing: '1px',
              }}>
                {match.round}
              </span>
            )}
            {match.court && (
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '16px' }}>
                {match.court}
              </span>
            )}
          </div>

          {/* LIVE indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width:      '10px',
              height:     '10px',
              borderRadius: '50%',
              background: '#4ad569',
              boxShadow:  '0 0 12px #4ad569',
              display:    'inline-block',
              animation:  'livePulse 1.5s ease-in-out infinite',
            }} />
            <span style={{
              color:      '#4ad569',
              fontSize:   '20px',
              fontWeight: 900,
              letterSpacing: '2px',
            }}>
              LIVE
            </span>
            {!isDemo && connected && (
              <span style={{ fontSize: '13px', color: 'rgba(74,213,105,0.5)', marginLeft: '4px' }}>⬤</span>
            )}
          </div>
        </div>

        {/* Teams + Scores */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '0' }}>
          {/* Colonne noms */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Team 1 */}
            <div style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '10px',
              padding:    '14px 20px',
              border:     '1px solid rgba(255,255,255,0.08)',
            }}>
              <span style={{
                color:      'white',
                fontSize:   '48px',
                fontWeight: 800,
                lineHeight: 1.1,
                display:    'block',
                letterSpacing: '-0.5px',
              }}>
                {match.team1_name ?? 'Équipe 1'}
              </span>
            </div>

            {/* Séparateur VS */}
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.15)', fontSize: '18px', fontWeight: 700, letterSpacing: '2px', padding: '2px 0' }}>
              VS
            </div>

            {/* Team 2 */}
            <div style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '10px',
              padding:    '14px 20px',
              border:     '1px solid rgba(255,255,255,0.08)',
            }}>
              <span style={{
                color:      'rgba(255,255,255,0.85)',
                fontSize:   '48px',
                fontWeight: 800,
                lineHeight: 1.1,
                display:    'block',
                letterSpacing: '-0.5px',
              }}>
                {match.team2_name ?? 'Équipe 2'}
              </span>
            </div>
          </div>

          {/* Séparateur vertical */}
          <div style={{ width: '1px', background: 'rgba(74,213,105,0.2)', margin: '0 28px', flexShrink: 0 }} />

          {/* Colonne scores */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '280px' }}>
            {/* Headers sets */}
            <div style={{ display: 'flex', gap: '10px', paddingBottom: '4px' }}>
              {['Set 1', 'Set 2', match.score_tb ? 'TB' : null].filter(Boolean).map(label => (
                <div key={label} style={{
                  flex:       1,
                  textAlign:  'center',
                  fontSize:   '13px',
                  color:      'rgba(74,213,105,0.6)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  {label}
                </div>
              ))}
            </div>

            {/* Score pairs (chaque ligne = team) */}
            {[
              // Team 1 scores
              [match.score_set1?.split('-')[0], match.score_set2?.split('-')[0], match.score_tb?.split('-')[0]],
              // Team 2 scores
              [match.score_set1?.split('-')[1], match.score_set2?.split('-')[1], match.score_tb?.split('-')[1]],
            ].map((teamScores, tIdx) => {
              const isTeam1 = tIdx === 0;
              return (
                <div key={tIdx} style={{ display: 'flex', gap: '10px' }}>
                  {teamScores.filter((_, i) => i === 0 || i === 1 || !!match.score_tb).map((score, sIdx) => {
                    if (sIdx === 2 && !match.score_tb) return null;
                    const otherScore = sIdx === 0
                      ? (isTeam1 ? match.score_set1?.split('-')[1] : match.score_set1?.split('-')[0])
                      : sIdx === 1
                      ? (isTeam1 ? match.score_set2?.split('-')[1] : match.score_set2?.split('-')[0])
                      : (isTeam1 ? match.score_tb?.split('-')[1] : match.score_tb?.split('-')[0]);
                    const isWinning = score !== undefined && otherScore !== undefined &&
                      Number(score || 0) > Number(otherScore || 0);
                    return (
                      <div key={sIdx} style={{
                        flex:       1,
                        background: isWinning
                          ? 'rgba(74,213,105,0.15)'
                          : 'rgba(255,255,255,0.04)',
                        border:     `1px solid ${isWinning ? 'rgba(74,213,105,0.3)' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: '10px',
                        padding:    '10px 8px',
                        textAlign:  'center',
                        minWidth:   '72px',
                      }}>
                        <span style={{
                          fontSize:   '36px',
                          fontWeight: 800,
                          color:      isWinning ? '#4ad569' : 'rgba(255,255,255,0.7)',
                          fontFamily: 'JetBrains Mono, monospace',
                          display:    'block',
                          lineHeight: 1,
                          animation:  (pulse && isWinning) ? 'scorePulse 0.5s ease' : 'none',
                        }}>
                          {score ?? (match[sIdx === 0 ? 'score_set1' : sIdx === 1 ? 'score_set2' : 'score_tb'] ? '–' : '')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer : logo MPL */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
          <span style={{ color: 'rgba(74,213,105,0.4)', fontSize: '13px', fontWeight: 800, letterSpacing: '3px' }}>
            ◈ MAURITIUS PADEL LEAGUE
          </span>
        </div>
      </div>

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 12px #4ad569; }
          50%       { opacity: 0.5; box-shadow: 0 0 4px #4ad569; }
        }
        @keyframes scorePulse {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: transparent !important; }
      `}</style>
    </div>
  );
}
