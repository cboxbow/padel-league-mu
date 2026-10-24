import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Lock, RefreshCw, ShieldAlert, Trophy } from 'lucide-react';
import { GlassCard } from '@/components/Layout';
import { getSupabaseClient } from '@/lib/supabase';

// Admin : references de seeding des tournois (lot L4).
// Chaque tournoi releve du classement officiel dont la periode de validite
// (21 -> 20) contient sa DATE DE DEBUT. Rien n'est automatique : l'admin
// propose, approuve (version figee), puis horodate la generation du seeding.
// Toutes les ecritures passent par les fonctions SQL journalisees.

type Status = 'approved' | 'proposed' | 'pending_snapshot' | 'rejected' | 'not_assigned' | 'no_period';

type Row = {
  tournament_id: string;
  tournament_name: string;
  start_date: string;
  end_date: string | null;
  registration_opens_at: string | null;
  division: string;
  category: string | null;
  tournament_status: string | null;
  expected_reference_month: string | null;
  validity_start: string | null;
  validity_end: string | null;
  period_status: string | null;
  expected_snapshot_id: string | null;
  expected_snapshot_version: number | null;
  snapshot_id: string | null;
  snapshot_version: number | null;
  approval_status: string | null;
  approved_at: string | null;
  seeding_generated_at: string | null;
  override_reason: string | null;
  seeding_status: Status;
};

type Snapshot = { id: string; division: string; reference_month: string; version: number; status: string; source: string; entries_count: number | null;
  published_at: string | null; validity_start: string | null; validity_end: string | null; revision_reason: string | null; engine_version: string | null };
type AuditRow = { id: number; at: string; action: string; details: Record<string, unknown> | null; snapshot_id: string | null };

// Statuts des classements (enum ranking_snapshot_status) et libelles affiches.
const SNAPSHOT_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: 'BROUILLON', color: '#9ca3af' },
  validated: { label: 'VALIDE (non publie)', color: '#93c5fd' },
  published: { label: 'PUBLIE', color: '#4ad569' },
  superseded: { label: 'ARCHIVE (remplace)', color: '#a78bfa' },
  withdrawn: { label: 'RETIRE', color: '#ef4444' },
};

// "A revoir" : tout ce qui demande une decision humaine.
const needsReview = (r: Row, today: string) =>
  r.seeding_status === 'no_period' || r.seeding_status === 'pending_snapshot' || r.seeding_status === 'rejected'
  || (r.seeding_status !== 'approved' && r.start_date <= today)
  || !!r.override_reason;

type Period = { reference_month: string; validity_start: string; validity_end: string; registration_opening_month: string; status: string; source: string };

const STATUS: Record<Status, { label: string; color: string }> = {
  approved: { label: 'Approuve', color: '#4ad569' },
  proposed: { label: 'Propose', color: '#93c5fd' },
  pending_snapshot: { label: 'En attente du classement', color: '#f59e0b' },
  rejected: { label: 'Refuse', color: '#ef4444' },
  not_assigned: { label: 'A proposer', color: '#9ca3af' },
  no_period: { label: 'Aucune periode confirmee', color: '#ef4444' },
};

const fmt = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const month = (iso?: string | null) => (iso ? iso.slice(0, 7) : '');

export default function SeedingReferencesPage() {
  const sb = getSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 60); return d.toISOString().slice(0, 10); });
  const [rows, setRows] = useState<Row[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [filter, setFilter] = useState<'all' | 'review' | Status>('all');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);

  const load = useCallback(async () => {
    if (!sb) return;
    setLoading(true);
    const [st, per, snaps, log] = await Promise.all([
      sb.from('tournament_seeding_status').select('*').gte('start_date', from).lte('start_date', to)
        .neq('tournament_status', 'cancelled').order('start_date').order('tournament_id'),
      sb.from('ranking_validity_periods').select('*').order('reference_month', { ascending: false }),
      sb.from('ranking_snapshots').select('id,division,reference_month,version,status,source,entries_count,published_at,validity_start,validity_end,revision_reason,engine_version')
        .order('reference_month', { ascending: false }).order('division').order('version', { ascending: false }),
      sb.from('ranking_audit_log').select('id,at,action,details,snapshot_id').order('id', { ascending: false }).limit(50),
    ]);
    setSnapshots((snaps.data ?? []) as Snapshot[]);
    setAudit((log.data ?? []) as AuditRow[]);
    setLoading(false);
    if (st.error) { setMessage({ ok: false, text: `Lecture impossible (migration L4 appliquee ?) : ${st.error.message}` }); return; }
    setRows((st.data ?? []) as Row[]);
    setPeriods((per.data ?? []) as Period[]);
  }, [sb, from, to]);

  useEffect(() => { void load(); }, [load]);

  const call = async (key: string, fn: string, args: Record<string, unknown>) => {
    if (!sb) return;
    setBusy(key); setMessage(null);
    const { data, error } = await sb.rpc(fn, args);
    setBusy('');
    if (error) setMessage({ ok: false, text: error.message });
    else setMessage({ ok: true, text: `${fn} : ${JSON.stringify(data ?? 'ok')}` });
    await load();
  };

  const propose = (r: Row) => call(`p-${r.tournament_id}`, 'propose_tournament_seeding', { p_tournament_id: r.tournament_id, p_division: r.division });
  const approve = (r: Row) => {
    const expected = `APPROUVER ${r.tournament_id} ${r.division.toUpperCase()}`;
    const typed = window.prompt(`Approuver le classement ${month(r.expected_reference_month)} v${r.snapshot_version} pour ${r.tournament_name} ?\nLa version sera figee.\n\nSaisir exactement : ${expected}`);
    if (typed) void call(`a-${r.tournament_id}`, 'approve_tournament_seeding', { p_tournament_id: r.tournament_id, p_division: r.division, p_confirmation: typed });
  };
  const exception = (r: Row) => {
    const snap = window.prompt('Cas exceptionnel : identifiant (uuid) de l\'instantane publie a utiliser');
    if (!snap) return;
    const reason = window.prompt('Motif detaille (obligatoire, journalise)');
    if (reason) void call(`e-${r.tournament_id}`, 'approve_tournament_seeding_exception', { p_tournament_id: r.tournament_id, p_division: r.division, p_snapshot_id: snap.trim(), p_reason: reason });
  };
  const generated = (r: Row) => {
    if (window.confirm(`Confirmer que le seeding de ${r.tournament_name} a ete genere avec le classement ${month(r.expected_reference_month)} v${r.snapshot_version} ?\nHorodatage definitif.`)) {
      void call(`g-${r.tournament_id}`, 'mark_tournament_seeding_generated', { p_tournament_id: r.tournament_id, p_division: r.division });
    }
  };

  const shown = useMemo(() => rows.filter(r => (filter === 'all' ? true : filter === 'review' ? needsReview(r, today) : r.seeding_status === filter)), [rows, filter, today]);
  const reviewCount = useMemo(() => rows.filter(r => needsReview(r, today)).length, [rows, today]);

  const counts = useMemo(() => {
    const c: Partial<Record<Status, number>> = {};
    for (const r of rows) c[r.seeding_status] = (c[r.seeding_status] ?? 0) + 1;
    return c;
  }, [rows]);

  const btn = (color: string): React.CSSProperties => ({ padding: '5px 10px', borderRadius: '8px', border: `1px solid ${color}60`, background: `${color}18`, color: 'white', fontSize: '11px', fontWeight: 800, cursor: 'pointer' });
  const input: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '6px 8px', color: 'white', fontSize: '12px' };

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <GlassCard style={{ padding: '16px' }} hoverable={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'white', fontWeight: 900, fontSize: '18px', marginBottom: '6px' }}>
          <Trophy size={18} color="#f59e0b" /> References de seeding
        </div>
        <div style={{ color: '#9ca3af', fontSize: '12px', lineHeight: 1.6 }}>
          Un tournoi releve du classement officiel dont la periode de validite (du 21 au 20) contient sa <b>date de debut</b>.
          Le classement en direct n'est jamais utilise. Si le classement attendu n'est pas publie, la reference reste <b>en attente</b> et le seeding final est bloque.
          Une fois approuvee, la version du classement est figee pour tout le tournoi.
        </div>
      </GlassCard>

      <GlassCard style={{ padding: '16px' }} hoverable={false}>
        <div style={{ color: 'white', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>Periodes de validite</div>
        <div style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
          {periods.map(p => (
            <div key={p.reference_month} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', color: '#cbd5e1' }}>
              <span style={{ fontWeight: 800, minWidth: '70px' }}>{month(p.reference_month)}</span>
              <span>tournois commencant du {fmt(p.validity_start)} au {fmt(p.validity_end)}</span>
              <span style={{ color: '#777' }}>inscriptions {month(p.registration_opening_month)}</span>
              <span style={{ color: p.status === 'confirmed' ? '#4ad569' : '#f59e0b', fontWeight: 800 }}>{p.status === 'confirmed' ? 'confirmee' : 'provisoire'}</span>
              <span style={{ color: '#666' }}>{p.source}</span>
            </div>
          ))}
          {!periods.length && <div style={{ color: '#777' }}>Aucune periode (migration L4 non appliquee ?)</div>}
        </div>
        <div style={{ color: '#777', fontSize: '11px', marginTop: '8px' }}>
          Nouvelle periode : fonction SQL <code>set_ranking_validity_period</code> (statut « confirmed » uniquement apres decision MPL). Une periode figee sur un classement publie n'est plus modifiable.
        </div>
      </GlassCard>

      <GlassCard style={{ padding: '16px' }} hoverable={false}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
          <span style={{ color: '#9ca3af', fontSize: '12px' }}>Tournois commencant du</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={input} />
          <span style={{ color: '#9ca3af', fontSize: '12px' }}>au</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={input} />
          <button onClick={() => void load()} style={btn('#4ad569')} disabled={loading}><RefreshCw size={11} /> Actualiser</button>
          <span style={{ color: '#777', fontSize: '12px' }}>
            {Object.entries(counts).map(([k, v]) => `${STATUS[k as Status].label} : ${v}`).join(' · ')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {([['all', `Tous (${rows.length})`], ['review', `A REVOIR (${reviewCount})`], ['not_assigned', 'A PROPOSER'], ['proposed', 'PROPOSE'], ['pending_snapshot', 'EN ATTENTE'], ['approved', 'APPROUVE']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k as typeof filter)} style={{ ...btn(k === 'review' ? '#f59e0b' : '#93c5fd'), opacity: filter === k ? 1 : 0.55 }}>{label}</button>
          ))}
        </div>
        {message && (
          <div style={{ color: message.ok ? '#4ad569' : '#fca5a5', fontSize: '12px', marginBottom: '10px', wordBreak: 'break-word' }}>{message.text}</div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '860px' }}>
            <thead>
              <tr style={{ color: '#777', textAlign: 'left', fontSize: '10px', textTransform: 'uppercase' }}>
                <th style={{ padding: '6px' }}>Debut</th><th>Tournoi</th><th>Div.</th><th>Classement attendu</th><th>Periode</th><th>Reference</th><th>Statut</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => {
                const st = STATUS[r.seeding_status] ?? STATUS.not_assigned;
                const late = r.registration_opens_at && r.validity_start && !r.expected_snapshot_id;
                return (
                  <tr key={`${r.tournament_id}-${r.division}`} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', color: '#e5e7eb' }}>
                    <td style={{ padding: '6px', fontFamily: 'JetBrains Mono, monospace' }}>{fmt(r.start_date)}</td>
                    <td>{r.tournament_name} <span style={{ color: '#666' }}>({r.tournament_id})</span></td>
                    <td>{r.division}</td>
                    <td>{r.expected_reference_month ? `${month(r.expected_reference_month)}${r.expected_snapshot_version ? ` v${r.expected_snapshot_version}` : ' (non publie)'}` : '-'}</td>
                    <td style={{ color: '#9ca3af' }}>{r.validity_start ? `${fmt(r.validity_start)} -> ${fmt(r.validity_end)}` : '-'}</td>
                    <td>{r.snapshot_version ? `v${r.snapshot_version}${r.approved_at ? ` · ${fmt(r.approved_at)}` : ''}` : '-'}{r.override_reason ? <span title={r.override_reason} style={{ color: '#f59e0b' }}> (exception)</span> : null}</td>
                    <td style={{ color: st.color, fontWeight: 800 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {r.seeding_status === 'approved' ? <CheckCircle2 size={12} /> : r.seeding_status === 'pending_snapshot' ? <Clock size={12} /> : r.seeding_status === 'no_period' ? <ShieldAlert size={12} /> : null}
                        {st.label}{r.seeding_generated_at ? <><Lock size={11} style={{ marginLeft: 4 }} /> genere {fmt(r.seeding_generated_at)}</> : null}
                      </span>
                      {late ? <div style={{ color: '#f59e0b', fontWeight: 600 }}>inscriptions ouvertes avant publication</div> : null}
                    </td>
                    <td style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', padding: '6px 0' }}>
                      {['not_assigned', 'pending_snapshot', 'proposed'].includes(r.seeding_status) && (
                        <button style={btn('#93c5fd')} disabled={!!busy} onClick={() => void propose(r)}>{r.seeding_status === 'not_assigned' ? 'Proposer' : 'Reproposer'}</button>
                      )}
                      {r.seeding_status === 'proposed' && <button style={btn('#4ad569')} disabled={!!busy} onClick={approve.bind(null, r)}>Approuver</button>}
                      {['pending_snapshot', 'no_period'].includes(r.seeding_status) && <button style={btn('#f59e0b')} disabled={!!busy} onClick={exception.bind(null, r)}>Exception</button>}
                      {r.seeding_status === 'approved' && !r.seeding_generated_at && <button style={btn('#a78bfa')} disabled={!!busy} onClick={generated.bind(null, r)}>Seeding genere</button>}
                    </td>
                  </tr>
                );
              })}
              {!shown.length && !loading && <tr><td colSpan={8} style={{ padding: '12px', color: '#777' }}>Aucun tournoi pour ce filtre.</td></tr>}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard style={{ padding: '16px' }} hoverable={false}>
        <div style={{ color: 'white', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>Classements officiels (publies, archives, en cours)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '760px' }}>
            <thead>
              <tr style={{ color: '#777', textAlign: 'left', fontSize: '10px', textTransform: 'uppercase' }}>
                <th style={{ padding: '6px' }}>Classement</th><th>Div.</th><th>Version</th><th>Statut</th><th>Periode de validite</th><th>Lignes</th><th>Publie le</th><th>Source</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map(sn => {
                const st = SNAPSHOT_STATUS[sn.status] ?? { label: sn.status, color: '#9ca3af' };
                return (
                  <tr key={sn.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', color: '#e5e7eb' }}>
                    <td style={{ padding: '6px', fontWeight: 800 }}>{month(sn.reference_month)}</td>
                    <td>{sn.division}</td>
                    <td>v{sn.version}{sn.revision_reason ? <span title={sn.revision_reason} style={{ color: '#f59e0b' }}> (revision)</span> : null}</td>
                    <td style={{ color: st.color, fontWeight: 800 }}>{st.label}</td>
                    <td style={{ color: '#9ca3af' }}>{sn.validity_start ? `${fmt(sn.validity_start)} -> ${fmt(sn.validity_end)}` : '-'}</td>
                    <td>{sn.entries_count ?? '-'}</td>
                    <td>{fmt(sn.published_at)}</td>
                    <td style={{ color: '#777' }}>{sn.source === 'workbook_import' ? 'classeur' : 'moteur'}</td>
                  </tr>
                );
              })}
              {!snapshots.length && <tr><td colSpan={8} style={{ padding: '12px', color: '#777' }}>Aucun classement.</td></tr>}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard style={{ padding: '16px' }} hoverable={false}>
        <div style={{ color: 'white', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>Journal (50 dernieres actions)</div>
        <div style={{ display: 'grid', gap: '3px', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}>
          {audit.map(a => (
            <div key={a.id} style={{ display: 'flex', gap: '10px', color: '#cbd5e1', flexWrap: 'wrap' }}>
              <span style={{ color: '#777' }}>{a.at.slice(0, 16).replace('T', ' ')}</span>
              <span style={{ color: '#f59e0b', fontWeight: 800 }}>{a.action}</span>
              <span style={{ color: '#9ca3af', wordBreak: 'break-word' }}>{JSON.stringify(a.details ?? {}).slice(0, 180)}</span>
            </div>
          ))}
          {!audit.length && <div style={{ color: '#777' }}>Journal vide ou non lisible.</div>}
        </div>
      </GlassCard>
    </div>
  );
}
