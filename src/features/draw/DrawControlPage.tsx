import { useState, useEffect, useCallback, useMemo } from 'react';
import { Shuffle, Users, GitBranch, ChevronRight, RefreshCw, CheckCircle2, AlertTriangle, Settings } from 'lucide-react';
import { GlassCard } from '@/components/Layout';
import { getSupabaseClient, isSupabaseConnected } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tournament {
  id: string;
  name: string;
  tournament_date?: string;
  date?: string;
  category?: string;
  tournament_type?: string;
  division?: string;
  club_name?: string;
  status?: string;
}

interface Registration {
  id: string;
  tournament_id: string;
  team_name?: string;
  player1_name?: string;
  player2_name?: string;
  club_name?: string;
  seeded?: boolean;
  confirmed?: boolean;
}

interface BracketMatch {
  id?: string;
  draw_id: string;
  round: string;
  slot: number;
  slot1_id: string;
  slot2_id: string;
  team1_name: string;
  team2_name: string;
}

interface DrawRow {
  id: string;
  tournament_id: string;
  draw_type: string;
  status: string;
  created_at?: string;
}

// ── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_TOURNAMENTS: Tournament[] = [
  { id: 'T1', name: 'MPL Open Nord 2026', tournament_date: '2026-04-12', category: 'M250', tournament_type: 'MEN', status: 'draw' },
  { id: 'T2', name: 'MPL Challenge Ouest 2026', tournament_date: '2026-05-03', category: 'W250', tournament_type: 'WOMEN', status: 'draw' },
];

const MOCK_REGISTRATIONS: Registration[] = [
  { id: 'R1', tournament_id: 'T1', team_name: 'Dupont / Martin', club_name: 'Nord Padel Club', seeded: true, confirmed: true },
  { id: 'R2', tournament_id: 'T1', team_name: 'Leclerc / Renard', club_name: 'Padel Express', seeded: true, confirmed: true },
  { id: 'R3', tournament_id: 'T1', team_name: 'Moreau / Simon', club_name: 'Smash Club', seeded: false, confirmed: true },
  { id: 'R4', tournament_id: 'T1', team_name: 'Bernard / Petit', club_name: 'Nord Padel Club', seeded: false, confirmed: true },
  { id: 'R5', tournament_id: 'T1', team_name: 'Thomas / Girard', club_name: 'Padel Express', seeded: false, confirmed: true },
  { id: 'R6', tournament_id: 'T1', team_name: 'Robert / Michel', club_name: 'Ocean Padel', seeded: false, confirmed: true },
  { id: 'R7', tournament_id: 'T1', team_name: 'Richard / Lambert', club_name: 'Smash Club', seeded: false, confirmed: true },
  { id: 'R8', tournament_id: 'T1', team_name: 'Fontaine / Vincent', club_name: 'Ocean Padel', seeded: false, confirmed: true },
  { id: 'R9', tournament_id: 'T2', team_name: 'Leroy / Blanc', club_name: 'Ouest Padel', seeded: true, confirmed: true },
  { id: 'R10', tournament_id: 'T2', team_name: 'Garnier / Faure', club_name: 'Pacific Club', seeded: false, confirmed: true },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Construit le label affiché dans les dropdowns de tournois */
function tournLabel(t: Tournament): string {
  const d = t.tournament_date ?? t.date ?? '';
  const dateStr = d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
  const cat = t.category ?? '';
  const div = divLabel(t.tournament_type ?? t.division ?? '');
  const parts = [cat, div !== '—' ? div : ''].filter(Boolean).join(' • ');
  return `${t.name}${dateStr ? ' — ' + dateStr : ''}${parts ? ' (' + parts + ')' : ''}`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getRoundName(total: number, roundIndex: number): string {
  const rounds = Math.log2(total);
  const remaining = rounds - roundIndex;
  if (remaining === 1) return 'F';
  if (remaining === 2) return 'SF';
  if (remaining === 3) return 'QF';
  return `R${roundIndex + 1}`;
}

function generateBracket(registrations: Registration[]): { rounds: { name: string; matches: BracketMatch[] }[] } {
  if (registrations.length < 2) return { rounds: [] };

  // Séparer seedés / non-seedés
  const seeded = registrations.filter(r => r.seeded);
  const unseeded = shuffle(registrations.filter(r => !r.seeded));

  // Compléter avec les BYE si besoin (puissance de 2)
  const total = Math.pow(2, Math.ceil(Math.log2(registrations.length)));
  const ordered = [...seeded, ...unseeded];

  // Remplir avec BYE
  while (ordered.length < total) {
    ordered.push({ id: `bye-${ordered.length}`, tournament_id: '', team_name: 'BYE', club_name: '', confirmed: true });
  }

  // Éviter clubs identiques dans les paires (swap si possible)
  for (let i = 0; i < ordered.length - 1; i += 2) {
    const a = ordered[i];
    const b = ordered[i + 1];
    if (a.club_name && b.club_name && a.club_name === b.club_name) {
      // Chercher un swap dans les paires suivantes
      for (let j = i + 2; j < ordered.length - 1; j += 2) {
        const c = ordered[j];
        if (!c.club_name || c.club_name !== a.club_name) {
          [ordered[i + 1], ordered[j]] = [ordered[j], ordered[i + 1]];
          break;
        }
      }
    }
  }

  const drawId = `draw-${Date.now()}`;
  const roundCount = Math.log2(total);
  const rounds: { name: string; matches: BracketMatch[] }[] = [];

  // Premier round
  const firstRoundMatches: BracketMatch[] = [];
  for (let i = 0; i < ordered.length; i += 2) {
    const a = ordered[i];
    const b = ordered[i + 1];
    firstRoundMatches.push({
      draw_id: drawId,
      round: getRoundName(total, 0),
      slot: i / 2,
      slot1_id: a.id,
      slot2_id: b.id,
      team1_name: a.team_name || `${a.player1_name ?? ''} / ${a.player2_name ?? ''}`.trim() || 'BYE',
      team2_name: b.team_name || `${b.player1_name ?? ''} / ${b.player2_name ?? ''}`.trim() || 'BYE',
    });
  }
  rounds.push({ name: getRoundName(total, 0), matches: firstRoundMatches });

  // Rounds suivants (placeholder)
  let prevCount = firstRoundMatches.length;
  for (let r = 1; r < roundCount; r++) {
    const rMatches: BracketMatch[] = [];
    for (let i = 0; i < prevCount / 2; i++) {
      rMatches.push({
        draw_id: drawId,
        round: getRoundName(total, r),
        slot: i,
        slot1_id: 'tbd',
        slot2_id: 'tbd',
        team1_name: 'À déterminer',
        team2_name: 'À déterminer',
      });
    }
    rounds.push({ name: getRoundName(total, r), matches: rMatches });
    prevCount = prevCount / 2;
  }

  return { rounds };
}

// ── Composants visuels ────────────────────────────────────────────────────────

const css = {
  container: { color: 'white', fontFamily: 'Inter, sans-serif', maxWidth: '1200px', margin: '0 auto' } as React.CSSProperties,
  header: { marginBottom: '24px' } as React.CSSProperties,
  title: { fontSize: '22px', fontWeight: 800, color: 'white', margin: '0 0 4px' } as React.CSSProperties,
  subtitle: { fontSize: '13px', color: '#666', margin: 0 } as React.CSSProperties,
  row: { display: 'flex', gap: '12px', flexWrap: 'wrap' as const, marginBottom: '20px' },
  select: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(74,213,105,0.2)',
    borderRadius: '8px',
    padding: '10px 14px',
    color: 'white',
    fontSize: '14px',
    cursor: 'pointer',
    flex: 1,
    minWidth: '200px',
  } as React.CSSProperties,
  btnPrimary: {
    background: '#4ad569',
    color: '#0a0a0a',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  btnSecondary: {
    background: 'rgba(255,255,255,0.05)',
    color: '#a0a0a0',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    padding: '10px 16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  btnDanger: {
    background: 'rgba(239,68,68,0.1)',
    color: '#ef4444',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: '8px',
    padding: '10px 16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
};

// ── Composant principal ───────────────────────────────────────────────────────

export default function DrawControlPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [bracket, setBracket] = useState<{ rounds: { name: string; matches: BracketMatch[] }[] } | null>(null);
  const [draw, setDraw] = useState<DrawRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingRegs, setLoadingRegs] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' | 'warn' } | null>(null);
  const isDemo = !isSupabaseConnected();

  const showMsg = (text: string, type: 'ok' | 'err' | 'warn' = 'ok') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  };

  // Chargement des tournois
  const loadTournaments = useCallback(async () => {
    if (isDemo) {
      setTournaments(MOCK_TOURNAMENTS);
      return;
    }
    const sb = getSupabaseClient()!;
    const { data } = await sb
      .from('tournaments')
      .select('id, name, tournament_date, category, tournament_type, division, club_name, status')
      .order('tournament_date', { ascending: false });
    // Dédupliquer par id
    const unique = Array.from(new Map(((data ?? []) as Tournament[]).map(t => [t.id, t])).values());
    setTournaments(unique);
  }, [isDemo]);

  useEffect(() => { loadTournaments(); }, [loadTournaments]);

  // Chargement inscrits confirmés
  const loadRegistrations = useCallback(async (tournId: string) => {
    if (!tournId) return;
    setLoadingRegs(true);
    if (isDemo) {
      setRegistrations(MOCK_REGISTRATIONS.filter(r => r.tournament_id === tournId && r.confirmed));
      setLoadingRegs(false);
      return;
    }
    const sb = getSupabaseClient()!;
    const { data, error } = await sb
      .from('registrations')
      .select('*')
      .eq('tournament_id', tournId)
      .eq('confirmed', true);
    if (error) showMsg(`Erreur: ${error.message}`, 'err');
    else setRegistrations((data ?? []) as Registration[]);
    setLoadingRegs(false);
  }, [isDemo]);

  useEffect(() => {
    if (selectedTournamentId) {
      setBracket(null);
      setDraw(null);
      loadRegistrations(selectedTournamentId);
    }
  }, [selectedTournamentId, loadRegistrations]);

  // Charger tirage existant
  const loadExistingDraw = useCallback(async (tournId: string) => {
    if (isDemo || !tournId) return;
    const sb = getSupabaseClient()!;
    const { data } = await sb
      .from('draws')
      .select('*')
      .eq('tournament_id', tournId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      setDraw(data[0] as DrawRow);
      // Charger les matches du bracket
      const { data: matches } = await sb
        .from('bracket_matches')
        .select('*')
        .eq('draw_id', data[0].id)
        .order('round')
        .order('slot');
      if (matches && matches.length > 0) {
        // Reconstruire les rounds depuis les matches DB
        const roundMap = new Map<string, BracketMatch[]>();
        const roundOrder = ['QF', 'SF', 'F', 'R1', 'R2', 'R3', 'R4'];
        (matches as BracketMatch[]).forEach(m => {
          if (!roundMap.has(m.round)) roundMap.set(m.round, []);
          roundMap.get(m.round)!.push(m);
        });
        const rounds = roundOrder
          .filter(r => roundMap.has(r))
          .map(r => ({ name: r, matches: roundMap.get(r)! }));
        setBracket({ rounds });
      }
    }
  }, [isDemo]);

  useEffect(() => {
    if (selectedTournamentId) loadExistingDraw(selectedTournamentId);
  }, [selectedTournamentId, loadExistingDraw]);

  // Générer le tirage
  const handleGenerate = async () => {
    if (!selectedTournamentId) { showMsg('Sélectionnez un tournoi', 'warn'); return; }
    if (registrations.length < 2) { showMsg('Pas assez d\'inscrits confirmés (min 2)', 'warn'); return; }

    setLoading(true);
    const generated = generateBracket(registrations);
    const drawId = generated.rounds[0]?.matches[0]?.draw_id ?? `draw-${Date.now()}`;

    if (isDemo) {
      setBracket(generated);
      setDraw({ id: drawId, tournament_id: selectedTournamentId, draw_type: 'single_elimination', status: 'draft' });
      setLoading(false);
      showMsg('Tirage généré (mode démo)', 'warn');
      return;
    }

    const sb = getSupabaseClient()!;

    // Créer le draw
    const { data: drawData, error: drawErr } = await sb
      .from('draws')
      .insert({ id: drawId, tournament_id: selectedTournamentId, draw_type: 'single_elimination', status: 'draft' })
      .select()
      .single();

    if (drawErr) { showMsg(`Erreur création draw: ${drawErr.message}`, 'err'); setLoading(false); return; }

    setDraw(drawData as DrawRow);

    // Insérer les matches du premier round
    const firstRoundMatches = generated.rounds[0]?.matches ?? [];
    const { error: matchErr } = await sb.from('bracket_matches').insert(
      firstRoundMatches.map(m => ({
        draw_id: m.draw_id,
        round: m.round,
        slot: m.slot,
        slot1_id: m.slot1_id,
        slot2_id: m.slot2_id,
        team1_name: m.team1_name,
        team2_name: m.team2_name,
      }))
    );

    if (matchErr) { showMsg(`Erreur création matches: ${matchErr.message}`, 'err'); setLoading(false); return; }

    setBracket(generated);
    setLoading(false);
    showMsg('Tirage généré et sauvegardé ✓', 'ok');
  };

  // Publier le tirage
  const handlePublish = async () => {
    if (!draw) { showMsg('Générez d\'abord un tirage', 'warn'); return; }
    if (isDemo) { setDraw(d => d ? { ...d, status: 'published' } : d); showMsg('Publié (mode démo)', 'warn'); return; }

    const sb = getSupabaseClient()!;
    const { error } = await sb.from('draws').update({ status: 'published' }).eq('id', draw.id);
    if (error) { showMsg(`Erreur: ${error.message}`, 'err'); return; }
    setDraw(d => d ? { ...d, status: 'published' } : d);
    showMsg('Tirage publié ✓', 'ok');
  };

  // Réinitialiser
  const handleReset = async () => {
    if (!draw) return;
    if (!window.confirm('Supprimer le tirage et tous les matches ?')) return;

    if (isDemo) { setBracket(null); setDraw(null); showMsg('Réinitialisé (mode démo)', 'warn'); return; }

    const sb = getSupabaseClient()!;
    await sb.from('bracket_matches').delete().eq('draw_id', draw.id);
    await sb.from('draws').delete().eq('id', draw.id);
    setBracket(null);
    setDraw(null);
    showMsg('Tirage supprimé', 'ok');
  };

  const confirmedCount = useMemo(() => registrations.filter(r => r.confirmed).length, [registrations]);

  return (
    <div style={css.container}>
      {/* Header */}
      <div style={css.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <Shuffle size={24} color="#4ad569" />
          <h2 style={css.title}>Contrôle du Tirage</h2>
          {isDemo && (
            <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: 700 }}>
              MODE DÉMO
            </span>
          )}
          {draw && (
            <span style={{
              background: draw.status === 'published' ? 'rgba(74,213,105,0.15)' : 'rgba(74,213,105,0.08)',
              color: draw.status === 'published' ? '#4ad569' : '#a0a0a0',
              border: `1px solid ${draw.status === 'published' ? 'rgba(74,213,105,0.35)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' as const,
            }}>
              {draw.status === 'published' ? '✓ Publié' : '⏳ Brouillon'}
            </span>
          )}
        </div>
        <p style={css.subtitle}>Génération et gestion du bracket élimination simple</p>
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

      {/* Sélection tournoi */}
      <GlassCard style={{ marginBottom: '20px', padding: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4ad569', minWidth: '120px' }}>
            <Settings size={16} />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Tournoi</span>
          </div>
          <select
            value={selectedTournamentId}
            onChange={e => setSelectedTournamentId(e.target.value)}
            style={css.select}
          >
            <option value="">— Sélectionner un tournoi —</option>
            {tournaments.map(t => (
              <option key={t.id} value={t.id}>{tournLabel(t)}</option>
            ))}
          </select>
          <button onClick={loadTournaments} style={css.btnSecondary}>
            <RefreshCw size={14} /> Actualiser
          </button>
        </div>
      </GlassCard>

      {/* Panel inscrits + actions */}
      {selectedTournamentId && (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '20px', marginBottom: '20px' }}>
          {/* Liste inscrits */}
          <GlassCard style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Users size={16} color="#4ad569" />
              <span style={{ fontWeight: 700, fontSize: '14px' }}>
                Inscrits confirmés ({confirmedCount})
              </span>
            </div>
            {loadingRegs ? (
              <div style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Chargement…
              </div>
            ) : registrations.length === 0 ? (
              <div style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                Aucun inscrit confirmé pour ce tournoi
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
                {registrations.map((reg, idx) => (
                  <div key={reg.id} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 10px',
                    background: reg.seeded ? 'rgba(74,213,105,0.07)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${reg.seeded ? 'rgba(74,213,105,0.2)' : 'rgba(255,255,255,0.07)'}`,
                    borderRadius: '6px', fontSize: '13px',
                  }}>
                    <span style={{ color: '#555', fontFamily: 'monospace', minWidth: '22px', fontSize: '12px' }}>
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span style={{ flex: 1, color: 'white' }}>
                      {reg.team_name || `${reg.player1_name ?? ''} / ${reg.player2_name ?? ''}`.trim() || 'Équipe'}
                    </span>
                    {reg.seeded && (
                      <span style={{ background: 'rgba(74,213,105,0.2)', color: '#4ad569', borderRadius: '4px', padding: '1px 6px', fontSize: '10px', fontWeight: 700 }}>
                        SEEDÉ
                      </span>
                    )}
                    {reg.club_name && (
                      <span style={{ color: '#555', fontSize: '11px', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {reg.club_name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {/* Actions */}
          <GlassCard style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <GitBranch size={16} color="#4ad569" />
              <span style={{ fontWeight: 700, fontSize: '14px' }}>Actions</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Générer */}
              <button
                onClick={handleGenerate}
                disabled={loading || registrations.length < 2}
                style={{
                  ...css.btnPrimary,
                  opacity: loading || registrations.length < 2 ? 0.5 : 1,
                  cursor: loading || registrations.length < 2 ? 'not-allowed' : 'pointer',
                  justifyContent: 'center', padding: '14px 20px',
                }}
              >
                <Shuffle size={16} />
                {loading ? 'Génération…' : bracket ? 'Re-générer le tirage' : 'Générer le tirage'}
              </button>

              {/* Publier */}
              {bracket && (
                <button
                  onClick={handlePublish}
                  disabled={draw?.status === 'published'}
                  style={{
                    ...css.btnSecondary,
                    justifyContent: 'center', padding: '12px 20px',
                    opacity: draw?.status === 'published' ? 0.5 : 1,
                    cursor: draw?.status === 'published' ? 'not-allowed' : 'pointer',
                    color: draw?.status === 'published' ? '#4ad569' : '#a0a0a0',
                    border: draw?.status === 'published' ? '1px solid rgba(74,213,105,0.3)' : undefined,
                  }}
                >
                  <CheckCircle2 size={15} />
                  {draw?.status === 'published' ? 'Tirage publié ✓' : 'Publier le tirage'}
                </button>
              )}

              {/* Réinitialiser */}
              {draw && (
                <button onClick={handleReset} style={{ ...css.btnDanger, justifyContent: 'center', padding: '10px 20px' }}>
                  <RefreshCw size={14} /> Réinitialiser
                </button>
              )}
            </div>

            {/* Info */}
            <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Algorithme</div>
              <div style={{ fontSize: '12px', color: '#a0a0a0', lineHeight: 1.7 }}>
                • Seedés placés en tête<br />
                • Non-seedés mélangés aléatoirement<br />
                • Clubs identiques évités dans la même paire<br />
                • Format : élimination simple
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Bracket visuel */}
      {bracket && bracket.rounds.length > 0 && (
        <GlassCard style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <GitBranch size={18} color="#4ad569" />
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '16px' }}>Bracket Élimination Simple</h3>
          </div>

          {/* Rounds en colonnes */}
          <div style={{ display: 'flex', gap: '0', overflowX: 'auto', paddingBottom: '8px' }}>
            {bracket.rounds.map((round, rIdx) => (
              <div key={round.name} style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: '220px' }}>
                {/* Header round */}
                <div style={{
                  textAlign: 'center', padding: '8px 12px', marginBottom: '12px',
                  background: 'rgba(74,213,105,0.08)', border: '1px solid rgba(74,213,105,0.2)',
                  borderRadius: '8px', margin: '0 8px 16px',
                }}>
                  <span style={{ fontWeight: 800, color: '#4ad569', fontSize: '13px', letterSpacing: '1px' }}>
                    {round.name === 'F' ? 'FINALE' : round.name === 'SF' ? 'DEMI-FINALES' : round.name === 'QF' ? 'QUARTS DE FINALE' : round.name}
                  </span>
                  <span style={{ color: '#555', fontSize: '11px', marginLeft: '8px' }}>
                    ({round.matches.length} match{round.matches.length > 1 ? 's' : ''})
                  </span>
                </div>

                {/* Matches */}
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: '8px',
                  paddingTop: rIdx > 0 ? `${(Math.pow(2, rIdx) - 1) * 28}px` : '0',
                }}>
                  {round.matches.map((match, mIdx) => (
                    <div key={mIdx} style={{ margin: '0 8px', position: 'relative' }}>
                      {/* Ligne de connexion */}
                      {rIdx < bracket.rounds.length - 1 && (
                        <div style={{
                          position: 'absolute', right: '-8px', top: '50%',
                          width: '8px', height: '1px',
                          background: 'rgba(74,213,105,0.3)',
                        }} />
                      )}
                      <div style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(74,213,105,0.15)',
                        borderRadius: '8px',
                        overflow: 'hidden',
                      }}>
                        {/* Team 1 */}
                        <div style={{
                          padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '8px',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          background: match.slot1_id === 'tbd' ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.02)',
                        }}>
                          <span style={{
                            fontSize: '11px', color: '#4ad569', fontFamily: 'monospace', fontWeight: 700,
                            background: 'rgba(74,213,105,0.1)', borderRadius: '4px', padding: '1px 5px',
                          }}>1</span>
                          <span style={{
                            fontSize: '13px', color: match.slot1_id === 'tbd' ? '#555' : 'white',
                            fontStyle: match.slot1_id === 'tbd' ? 'italic' : 'normal',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                          }}>
                            {match.team1_name}
                          </span>
                          {match.team1_name === 'BYE' && (
                            <span style={{ fontSize: '10px', color: '#555', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: '4px' }}>BYE</span>
                          )}
                        </div>
                        {/* Séparateur */}
                        <div style={{ height: '1px', background: 'rgba(74,213,105,0.08)' }} />
                        {/* Team 2 */}
                        <div style={{
                          padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '8px',
                          background: match.slot2_id === 'tbd' ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.02)',
                        }}>
                          <span style={{
                            fontSize: '11px', color: '#60a5fa', fontFamily: 'monospace', fontWeight: 700,
                            background: 'rgba(96,165,250,0.1)', borderRadius: '4px', padding: '1px 5px',
                          }}>2</span>
                          <span style={{
                            fontSize: '13px', color: match.slot2_id === 'tbd' ? '#555' : 'white',
                            fontStyle: match.slot2_id === 'tbd' ? 'italic' : 'normal',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                          }}>
                            {match.team2_name}
                          </span>
                          {match.team2_name === 'BYE' && (
                            <span style={{ fontSize: '10px', color: '#555', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: '4px' }}>BYE</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Flèche vers prochain round */}
                {rIdx < bracket.rounds.length - 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '8px', marginTop: '8px' }}>
                    <ChevronRight size={14} color="rgba(74,213,105,0.4)" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
