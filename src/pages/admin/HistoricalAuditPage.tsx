import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, RefreshCw, ShieldCheck } from 'lucide-react';
import { GlassCard } from '@/components/Layout';
import { getSupabaseClient, isSupabaseConnected } from '@/lib/supabase';

type HistoricalRow = {
  source_file?: string | null;
  sheet_name?: string | null;
  event_date?: string | null;
  season?: number | null;
  category?: string | null;
  division?: string | null;
  club_name?: string | null;
  rank_label?: string | null;
  player1_name?: string | null;
  player2_name?: string | null;
  points?: number | null;
};

type SnapshotRow = {
  source_file?: string | null;
  snapshot_year?: number | null;
  division?: string | null;
  player_name?: string | null;
};

type AuditIssue = {
  type: 'missing_date' | 'duplicate_event_source' | 'duplicate_result_row';
  label: string;
  count: number;
  detail: string;
};

const PAGE_SIZE = 1000;

function norm(value: unknown) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function fmt(value: number) {
  return value.toLocaleString('fr-FR');
}

function countBy<T>(rows: T[], getter: (row: T) => string | number | null | undefined) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const key = String(getter(row) || 'Non renseigne');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function uniquePlayers(rows: HistoricalRow[]) {
  const players = new Set<string>();
  rows.forEach(row => {
    if (row.player1_name) players.add(norm(row.player1_name));
    if (row.player2_name) players.add(norm(row.player2_name));
  });
  return players;
}

function resultDedupeKey(row: HistoricalRow) {
  const players = [row.player1_name, row.player2_name].filter(Boolean).map(norm).sort().join('|');
  return [
    row.season,
    norm(row.sheet_name),
    norm(row.division),
    norm(row.category),
    norm(row.rank_label),
    Math.ceil(Number(row.points || 0)),
    players,
  ].join('::');
}

async function fetchAllHistoricalRows(): Promise<HistoricalRow[]> {
  const sb = getSupabaseClient();
  if (!sb || !isSupabaseConnected()) return [];
  const rows: HistoricalRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from('historical_tournament_results')
      .select('source_file,sheet_name,event_date,season,category,division,club_name,rank_label,player1_name,player2_name,points')
      .order('season', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchAllSnapshotRows(): Promise<SnapshotRow[]> {
  const sb = getSupabaseClient();
  if (!sb || !isSupabaseConnected()) return [];
  const rows: SnapshotRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from('historical_ranking_snapshots')
      .select('source_file,snapshot_year,division,player_name')
      .order('snapshot_year', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  return (
    <GlassCard style={{ padding: '18px 20px', borderColor: `${color}45`, background: `linear-gradient(135deg, ${color}12, rgba(255,255,255,0.02))` }}>
      <div style={{ color, fontSize: '28px', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
      <div style={{ color: 'white', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', marginTop: '4px' }}>{label}</div>
      <div style={{ color: '#777', fontSize: '12px', marginTop: '6px' }}>{sub}</div>
    </GlassCard>
  );
}

export default function HistoricalAuditPage() {
  const [rows, setRows] = useState<HistoricalRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [historicalRows, snapshotRows] = await Promise.all([
        fetchAllHistoricalRows(),
        fetchAllSnapshotRows(),
      ]);
      setRows(historicalRows);
      setSnapshots(snapshotRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const audit = useMemo(() => {
    const players = uniquePlayers(rows);
    const bySeason = countBy(rows, row => row.season);
    const bySource = countBy(rows, row => row.source_file);
    const snapshotByYear = countBy(snapshots, row => row.snapshot_year);
    const eventSources = new Map<string, Set<string>>();
    const resultRows = new Map<string, number>();
    const missingDateEvents = new Map<string, { rows: number; season: string; sheet: string; club: string; source: string }>();

    rows.forEach(row => {
      const eventKey = [row.season, norm(row.sheet_name), norm(row.division), norm(row.category)].join('|');
      const sourceSet = eventSources.get(eventKey) ?? new Set<string>();
      if (row.source_file) sourceSet.add(row.source_file);
      eventSources.set(eventKey, sourceSet);

      const dedupeKey = resultDedupeKey(row);
      resultRows.set(dedupeKey, (resultRows.get(dedupeKey) || 0) + 1);

      if (!row.event_date) {
        const missingKey = [row.season, row.sheet_name, row.club_name].join('|');
        const current = missingDateEvents.get(missingKey) ?? {
          rows: 0,
          season: String(row.season || ''),
          sheet: row.sheet_name || '',
          club: row.club_name || '',
          source: row.source_file || '',
        };
        current.rows += 1;
        missingDateEvents.set(missingKey, current);
      }
    });

    const issues: AuditIssue[] = [];
    eventSources.forEach((sourceSet, key) => {
      if (sourceSet.size > 1) {
        issues.push({ type: 'duplicate_event_source', label: 'Tournoi multi-source', count: sourceSet.size, detail: `${key} - ${Array.from(sourceSet).join(', ')}` });
      }
    });
    resultRows.forEach((count, key) => {
      if (count > 1) issues.push({ type: 'duplicate_result_row', label: 'Ligne résultat dupliquée', count, detail: key });
    });
    missingDateEvents.forEach(item => {
      issues.push({ type: 'missing_date', label: 'Date manquante', count: item.rows, detail: `${item.season} - ${item.sheet} - ${item.club}` });
    });

    return {
      players: players.size,
      rows: rows.length,
      snapshots: snapshots.length,
      bySeason,
      bySource,
      snapshotByYear,
      missingDateEvents: Array.from(missingDateEvents.values()).sort((a, b) => a.season.localeCompare(b.season) || a.sheet.localeCompare(b.sheet)),
      duplicateEventGroups: issues.filter(issue => issue.type === 'duplicate_event_source').length,
      duplicateResultRows: issues.filter(issue => issue.type === 'duplicate_result_row').length,
      issues,
    };
  }, [rows, snapshots]);

  const isClean = rows.length > 0 && audit.duplicateEventGroups === 0 && audit.duplicateResultRows === 0;

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{ color: 'white', fontWeight: 900, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Database size={22} color="#4ad569" /> Audit historique
          </h2>
          <p style={{ color: '#777', margin: 0, fontSize: '13px' }}>
            Controle qualite des resultats historiques, doublons, sources et dates avant publication.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '8px', padding: '10px 14px', fontWeight: 800, cursor: loading ? 'wait' : 'pointer' }}
        >
          <RefreshCw size={16} /> {loading ? 'Controle...' : 'Actualiser'}
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#ff6b6b', padding: '12px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 800 }}>
          Erreur Supabase: {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isClean ? '#4ad569' : '#f59e0b', fontSize: '13px', fontWeight: 900 }}>
        {isClean ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
        {isClean ? 'Audit structurel OK - aucun doublon detecte' : 'Audit incomplet ou anomalies a verifier'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', gap: '12px' }}>
        <StatCard label="Resultats" value={fmt(audit.rows)} sub="lignes historiques" color="#4ad569" />
        <StatCard label="Joueurs" value={fmt(audit.players)} sub="joueurs detectes" color="#f59e0b" />
        <StatCard label="Snapshots" value={fmt(audit.snapshots)} sub="classements archives" color="#3b82f6" />
        <StatCard label="Doublons" value={audit.duplicateEventGroups + audit.duplicateResultRows} sub="tournois/lignes" color={audit.duplicateEventGroups + audit.duplicateResultRows ? '#ef4444' : '#4ad569'} />
        <StatCard label="Dates a completer" value={audit.missingDateEvents.length} sub="groupes evenement" color={audit.missingDateEvents.length ? '#f59e0b' : '#4ad569'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <GlassCard style={{ padding: '16px' }}>
          <h3 style={{ color: 'white', margin: '0 0 12px', fontSize: '15px', fontWeight: 900 }}>Resultats par saison</h3>
          {Object.entries(audit.bySeason).sort().map(([season, count]) => (
            <div key={season} style={{ display: 'grid', gridTemplateColumns: '1fr auto', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#ccc', fontSize: '13px' }}>
              <strong>{season}</strong><span style={{ color: '#4ad569', fontWeight: 900 }}>{fmt(count)}</span>
            </div>
          ))}
        </GlassCard>
        <GlassCard style={{ padding: '16px' }}>
          <h3 style={{ color: 'white', margin: '0 0 12px', fontSize: '15px', fontWeight: 900 }}>Sources utilisees</h3>
          {Object.entries(audit.bySource).sort().map(([source, count]) => (
            <div key={source} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#ccc', fontSize: '13px' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source}</span>
              <span style={{ color: '#3b82f6', fontWeight: 900 }}>{fmt(count)}</span>
            </div>
          ))}
        </GlassCard>
      </div>

      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div>
            <h3 style={{ color: 'white', margin: 0, fontSize: '15px', fontWeight: 900 }}>Dates a completer</h3>
            <p style={{ color: '#777', margin: '4px 0 0', fontSize: '12px' }}>Ces resultats sont inclus, mais la date exacte doit etre confirmee.</p>
          </div>
          <span style={{ color: audit.missingDateEvents.length ? '#f59e0b' : '#4ad569', fontWeight: 900, fontSize: '13px' }}>
            {audit.missingDateEvents.length ? `${audit.missingDateEvents.length} groupes` : 'OK'}
          </span>
        </div>
        {audit.missingDateEvents.length ? (
          <div style={{ maxHeight: '330px', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#111', zIndex: 1 }}>
                <tr>
                  {['Saison', 'Tournoi', 'Club', 'Source', 'Lignes'].map(label => (
                    <th key={label} style={{ textAlign: 'left', color: '#777', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', textTransform: 'uppercase', fontSize: '11px' }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.missingDateEvents.map(item => (
                  <tr key={`${item.season}-${item.sheet}-${item.club}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ color: '#f59e0b', padding: '10px 14px', fontWeight: 900 }}>{item.season}</td>
                    <td style={{ color: 'white', padding: '10px 14px', fontWeight: 800 }}>{item.sheet}</td>
                    <td style={{ color: '#bbb', padding: '10px 14px' }}>{item.club}</td>
                    <td style={{ color: '#777', padding: '10px 14px' }}>{item.source}</td>
                    <td style={{ color: '#3b82f6', padding: '10px 14px', fontWeight: 900 }}>{item.rows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '34px 16px', color: '#4ad569', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 900 }}>
            <CheckCircle2 size={18} /> Toutes les dates historiques sont renseignees.
          </div>
        )}
      </GlassCard>
    </div>
  );
}
