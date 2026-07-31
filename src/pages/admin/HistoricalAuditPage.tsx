import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, RefreshCw, ShieldCheck } from 'lucide-react';
import { GlassCard } from '@/components/Layout';
import { getSupabaseClient, isSupabaseConnected } from '@/lib/supabase';
import { MPL_CLUBS, MPL_TOURNAMENTS } from '@/data/mpl2026';
import { normalizeJuniorCategory } from '@/lib/tournamentNames';

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

type CalendarTournamentRow = {
  id?: string | null;
  name?: string | null;
  date?: string | null;
  category?: string | null;
  division?: string | null;
  type?: string | null;
  tournament_type?: string | null;
  club_name?: string | null;
  status?: string | null;
  teams_registered?: number | null;
  max_teams?: number | null;
};

type AuditIssue = {
  type: 'missing_date' | 'duplicate_event_source' | 'duplicate_result_row' | 'calendar_missing_supabase' | 'calendar_extra_supabase' | 'calendar_date_mismatch';
  label: string;
  count: number;
  detail: string;
};

const PAGE_SIZE = 1000;

function norm(value: unknown) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function normClub(value: unknown) {
  return norm(value)
    .replace(/\bRM FORBACH\b/g, 'RM CLUB GRAND BAIE')
    .replace(/\bRM CLUB GRAND BAIE FORBACH\b/g, 'RM CLUB GRAND BAIE')
    .replace(/\bOXYGEN CUREPIPE\b/g, 'OXYGEN MOKA')
    .replace(/\bISLA PADEL DE BEAU PLAN\b/g, 'ISLA PADEL BEAU PLAN')
    .replace(/\bCANA BEAU PLAN\b/g, 'CANA BEAU PLAN')
    .trim();
}

function normCategory(value: unknown) {
  const raw = String(value ?? '').trim().toUpperCase();
  return normalizeJuniorCategory(raw);
}

function normDivision(value: unknown, category?: unknown) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (['men', 'hommes', 'mens', 'h'].includes(raw)) return 'men';
  if (['women', 'dames', 'femmes', 'w'].includes(raw)) return 'women';
  if (['mixed', 'mixte'].includes(raw)) return 'mixed';
  if (['junior', 'juniors'].includes(raw)) return 'junior';
  const cat = normCategory(category);
  if (['U11', 'U13', 'U15', 'JUNIOR'].includes(cat)) return 'junior';
  if (cat === 'MIXED') return 'mixed';
  return raw || 'men';
}

function dateOnly(value: unknown) {
  return String(value ?? '').slice(0, 10);
}

function calendarKey(row: CalendarTournamentRow) {
  const category = normCategory(row.category);
  return [
    dateOnly(row.date),
    category,
    normDivision(row.division || row.tournament_type || row.type, category),
    normClub(row.club_name),
  ].join('|');
}

function calendarLooseKey(row: CalendarTournamentRow) {
  const category = normCategory(row.category);
  return [
    norm(row.name),
    category,
    normDivision(row.division || row.tournament_type || row.type, category),
    normClub(row.club_name),
  ].join('|');
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

async function fetchAllSupabaseTournaments(): Promise<CalendarTournamentRow[]> {
  const sb = getSupabaseClient();
  if (!sb || !isSupabaseConnected()) return [];
  const rows: CalendarTournamentRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from('tournaments')
      .select('id,name,date,category,division,type,tournament_type,club_name,status,teams_registered,max_teams')
      .order('date', { ascending: true })
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
  const [supabaseTournaments, setSupabaseTournaments] = useState<CalendarTournamentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [historicalRows, snapshotRows, calendarRows] = await Promise.all([
        fetchAllHistoricalRows(),
        fetchAllSnapshotRows(),
        fetchAllSupabaseTournaments(),
      ]);
      setRows(historicalRows);
      setSnapshots(snapshotRows);
      setSupabaseTournaments(calendarRows);
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
    const officialCalendar = (MPL_TOURNAMENTS as CalendarTournamentRow[]);
    const officialByKey = new Map<string, CalendarTournamentRow>();
    const supabaseByKey = new Map<string, CalendarTournamentRow>();
    const officialByLoose = new Map<string, CalendarTournamentRow>();
    const supabaseByLoose = new Map<string, CalendarTournamentRow>();
    const eventSources = new Map<string, Set<string>>();
    const resultRows = new Map<string, number>();
    const missingDateEvents = new Map<string, { rows: number; season: string; sheet: string; club: string; source: string }>();

    officialCalendar.forEach(row => {
      officialByKey.set(calendarKey(row), row);
      officialByLoose.set(calendarLooseKey(row), row);
    });
    supabaseTournaments.forEach(row => {
      supabaseByKey.set(calendarKey(row), row);
      supabaseByLoose.set(calendarLooseKey(row), row);
    });

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
    officialByKey.forEach((row, key) => {
      if (!supabaseByKey.has(key)) {
        const loose = supabaseByLoose.get(calendarLooseKey(row));
        if (loose && dateOnly(loose.date) !== dateOnly(row.date)) {
          issues.push({
            type: 'calendar_date_mismatch',
            label: 'Date Supabase differente',
            count: 1,
            detail: `${row.name} - officiel ${dateOnly(row.date)} / Supabase ${dateOnly(loose.date)}`,
          });
        } else {
          issues.push({
            type: 'calendar_missing_supabase',
            label: 'Manquant Supabase',
            count: 1,
            detail: `${dateOnly(row.date)} - ${row.name} - ${row.club_name}`,
          });
        }
      }
    });
    supabaseByKey.forEach((row, key) => {
      if (!officialByKey.has(key)) {
        const loose = officialByLoose.get(calendarLooseKey(row));
        if (!loose) {
          issues.push({
            type: 'calendar_extra_supabase',
            label: 'En trop Supabase',
            count: 1,
            detail: `${dateOnly(row.date)} - ${row.name} - ${row.club_name}`,
          });
        }
      }
    });

    return {
      players: players.size,
      rows: rows.length,
      snapshots: snapshots.length,
      officialCalendarRows: officialCalendar.length,
      supabaseCalendarRows: supabaseTournaments.length,
      officialClubs: MPL_CLUBS.length,
      bySeason,
      bySource,
      snapshotByYear,
      missingDateEvents: Array.from(missingDateEvents.values()).sort((a, b) => a.season.localeCompare(b.season) || a.sheet.localeCompare(b.sheet)),
      duplicateEventGroups: issues.filter(issue => issue.type === 'duplicate_event_source').length,
      duplicateResultRows: issues.filter(issue => issue.type === 'duplicate_result_row').length,
      calendarMissingSupabase: issues.filter(issue => issue.type === 'calendar_missing_supabase').length,
      calendarExtraSupabase: issues.filter(issue => issue.type === 'calendar_extra_supabase').length,
      calendarDateMismatches: issues.filter(issue => issue.type === 'calendar_date_mismatch').length,
      calendarIssues: issues.filter(issue => issue.type === 'calendar_missing_supabase' || issue.type === 'calendar_extra_supabase' || issue.type === 'calendar_date_mismatch'),
      issues,
    };
  }, [rows, snapshots, supabaseTournaments]);

  const calendarClean = audit.officialCalendarRows > 0
    && audit.supabaseCalendarRows > 0
    && audit.calendarMissingSupabase === 0
    && audit.calendarExtraSupabase === 0
    && audit.calendarDateMismatches === 0;
  const historicalClean = rows.length > 0 && audit.duplicateEventGroups === 0 && audit.duplicateResultRows === 0;
  const isClean = historicalClean && calendarClean;

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{ color: 'white', fontWeight: 900, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Database size={22} color="#4ad569" /> Controle donnees
          </h2>
          <p style={{ color: '#777', margin: 0, fontSize: '13px' }}>
            Audit calendrier officiel, Supabase, resultats historiques, doublons, sources et dates avant publication.
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
        {isClean ? 'Controle global OK - calendrier et historique alignes' : 'Controle incomplet ou anomalies a verifier'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', gap: '12px' }}>
        <StatCard label="Calendrier local" value={fmt(audit.officialCalendarRows)} sub={`${audit.officialClubs} clubs officiels`} color="#3b82f6" />
        <StatCard label="Calendrier Supabase" value={fmt(audit.supabaseCalendarRows)} sub="lignes table tournaments" color={calendarClean ? '#4ad569' : '#f59e0b'} />
        <StatCard label="Ecarts calendrier" value={audit.calendarIssues.length} sub="manquants / dates / extras" color={audit.calendarIssues.length ? '#ef4444' : '#4ad569'} />
        <StatCard label="Resultats" value={fmt(audit.rows)} sub="lignes historiques" color="#4ad569" />
        <StatCard label="Joueurs" value={fmt(audit.players)} sub="joueurs detectes" color="#f59e0b" />
      </div>

      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div>
            <h3 style={{ color: 'white', margin: 0, fontSize: '15px', fontWeight: 900 }}>Calendrier officiel vs Supabase</h3>
            <p style={{ color: '#777', margin: '4px 0 0', fontSize: '12px' }}>
              Objectif: Supabase doit contenir les memes evenements que le calendrier officiel local.
            </p>
          </div>
          <span style={{ color: calendarClean ? '#4ad569' : '#f59e0b', fontWeight: 900, fontSize: '13px' }}>
            {calendarClean ? 'OK' : `${audit.calendarIssues.length} ecarts`}
          </span>
        </div>
        {audit.calendarIssues.length ? (
          <div style={{ maxHeight: '330px', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#111', zIndex: 1 }}>
                <tr>
                  {['Type', 'Detail'].map(label => (
                    <th key={label} style={{ textAlign: 'left', color: '#777', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', textTransform: 'uppercase', fontSize: '11px' }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.calendarIssues.slice(0, 120).map((issue, index) => (
                  <tr key={`${issue.type}-${index}-${issue.detail}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ color: issue.type === 'calendar_extra_supabase' ? '#f59e0b' : '#ef4444', padding: '10px 14px', fontWeight: 900, whiteSpace: 'nowrap' }}>{issue.label}</td>
                    <td style={{ color: '#ddd', padding: '10px 14px' }}>{issue.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {audit.calendarIssues.length > 120 && (
              <div style={{ padding: '10px 14px', color: '#777', fontSize: '12px', fontWeight: 800 }}>
                + {audit.calendarIssues.length - 120} autres ecarts non affiches.
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '34px 16px', color: '#4ad569', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 900 }}>
            <CheckCircle2 size={18} /> Calendrier Supabase aligne avec le calendrier officiel local.
          </div>
        )}
      </GlassCard>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', gap: '12px' }}>
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
