import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { GlassCard } from '@/components/Layout';
import { getSupabaseClient, isSupabaseConnected } from '@/lib/supabase';
import { useAdminRole } from '@/pages/AdminDashboard';

type Division = 'MEN' | 'WOMEN' | 'JUNIOR' | 'MIXTE';
type Trend = 'up' | 'down' | 'same';
type ImportStatus = 'idle' | 'ready' | 'saving' | 'error' | 'saved';

interface OfficialRankingRow {
  id: string;
  rank: number;
  rank_before: number;
  player_name: string;
  points: number;
  division: Division;
  tournaments_played: number;
  trend: Trend;
  season: number;
  details: RankingPointDetail[];
}

interface RankingPointDetail {
  event_name: string;
  points: number;
}

const DIVISIONS: Division[] = ['MEN', 'WOMEN', 'JUNIOR', 'MIXTE'];
const DIV_LABELS: Record<Division, { label: string; color: string }> = {
  MEN: { label: 'Hommes', color: '#3b82f6' },
  WOMEN: { label: 'Dames', color: '#ec4899' },
  JUNIOR: { label: 'Junior', color: '#f59e0b' },
  MIXTE: { label: 'Mixte', color: '#8b5cf6' },
};

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function divToDb(div: Division): string {
  if (div === 'MIXTE') return 'mixed';
  return div.toLowerCase();
}

function isSchemaCacheError(message: string): boolean {
  return (
    message.includes('schema cache') ||
    message.includes('Could not find') ||
    message.includes('column')
  );
}

function isDuplicateKeyError(message: string): boolean {
  return message.includes('duplicate key value') || message.includes('23505');
}

async function withTimeout<T>(promise: PromiseLike<T>, label: string, ms = 25000): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label}: delai depasse (${Math.round(ms / 1000)}s)`)), ms);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function inferRankingMonth(fileName: string): string {
  const upper = fileName.toUpperCase();
  const months: Record<string, string> = {
    JAN: '01',
    FEB: '02',
    MAR: '03',
    APR: '04',
    MAY: '05',
    JUN: '06',
    JUL: '07',
    AUG: '08',
    SEP: '09',
    OCT: '10',
    NOV: '11',
    DEC: '12',
  };
  const match = upper.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s*[-_ ]?\s*(\d{2,4})\b/);
  if (!match) return '2026-01-01';
  const year = match[2].length === 2 ? `20${match[2]}` : match[2];
  return `${year}-${months[match[1]]}-01`;
}

function normDiv(raw: unknown, fallback: Division): Division {
  const value = String(raw ?? '').trim().toUpperCase();
  if (!value) return fallback;
  if (['MEN', 'MAN', 'H', 'HOMME', 'HOMMES', 'MALE'].includes(value)) return 'MEN';
  if (['WOMEN', 'WOMAN', 'D', 'DAME', 'DAMES', 'FEMME', 'FEMMES', 'FEMALE'].includes(value)) return 'WOMEN';
  if (['MIXED', 'MIXTE', 'MIX'].includes(value)) return 'MIXTE';
  if (['JUNIOR', 'JUNIORS'].includes(value)) return 'JUNIOR';
  return fallback;
}

function normTrend(raw: unknown): Trend {
  const value = String(raw ?? '').trim().toLowerCase();
  if (['up', 'hausse', '+', 'monte'].includes(value)) return 'up';
  if (['down', 'baisse', '-', 'descend'].includes(value)) return 'down';
  return 'same';
}

function inferDivisionFromSheet(sheetName: string, fallback: Division): Division {
  const name = sheetName.toUpperCase();
  if (name.includes('WOMEN') || name.includes('DAMES')) return 'WOMEN';
  if (name.includes('MIXED') || name.includes('MIXTE')) return 'MIXTE';
  if (name.includes('JUNIOR') || /\bU(?:11|13|15)\b/.test(name)) return 'JUNIOR';
  if (name.includes('MEN') || name.includes('HOMMES')) return 'MEN';
  return fallback;
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function pick(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])
  );

  for (const alias of aliases) {
    const value = normalized.get(alias);
    if (value !== undefined && String(value).trim() !== '') return value;
  }

  return undefined;
}

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value ?? '')
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function findHeaderRow(rows: unknown[][]): number {
  return rows.findIndex(row => {
    const headers = row.map(cell => normalizeHeader(String(cell ?? '')));
    const hasRank = headers.some(header => ['rank', 'rank_now', 'rang', 'classement'].includes(header));
    const hasPlayer = headers.some(header => ['players', 'player', 'player_name', 'joueur', 'nom'].includes(header));
    const hasPoints = headers.some(header => ['total_points', 'points', 'pts'].includes(header));
    return hasRank && hasPlayer && hasPoints;
  });
}

function findIndex(headers: string[], aliases: string[]): number {
  return headers.findIndex(header => aliases.some(alias => header === alias || header.includes(alias)));
}

function parseRankingSheet(sheetName: string, sheet: XLSX.WorkSheet, fallbackDivision: Division): OfficialRankingRow[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false, raw: true });
  const headerRow = findHeaderRow(matrix);
  if (headerRow < 0) return [];

  const headers = matrix[headerRow].map(cell => normalizeHeader(String(cell ?? '')));
  const rankIdx = findIndex(headers, ['rank_now', 'rank', 'rang', 'classement']);
  const rankBeforeIdx = findIndex(headers, ['rank_before', 'previous_rank', 'rang_before']);
  const nameIdx = findIndex(headers, ['players', 'player_name', 'player', 'joueur', 'name', 'nom']);
  const pointsIdx = findIndex(headers, ['total_points', 'points', 'pts']);
  const divisionIdx = findIndex(headers, ['division', 'category', 'categorie']);
  const division = inferDivisionFromSheet(sheetName, fallbackDivision);

  if (rankIdx < 0 || nameIdx < 0 || pointsIdx < 0) return [];

  return matrix.slice(headerRow + 1)
    .map((row) => {
      const rank = parseNumber(row[rankIdx], NaN);
      const playerName = String(row[nameIdx] ?? '').trim();
      const points = parseNumber(row[pointsIdx], 0);
      const rowDivision = divisionIdx >= 0 ? normDiv(row[divisionIdx], division) : division;

      if (!Number.isFinite(rank) || !playerName) return null;

      const rankBefore = rankBeforeIdx >= 0 ? parseNumber(row[rankBeforeIdx], rank) : rank;
      const eventHeaders = matrix[headerRow].slice(pointsIdx + 1);
      const eventCells = row.slice(pointsIdx + 1);
      const details = eventCells
        .map((value, index) => ({
          event_name: String(eventHeaders[index] ?? '').trim(),
          points: parseNumber(value, 0),
        }))
        .filter(detail => detail.event_name && detail.points > 0);

      return {
        id: newId(),
        rank,
        rank_before: rankBefore,
        player_name: playerName,
        points,
        division: rowDivision,
        tournaments_played: details.length,
        trend: rank < rankBefore ? 'up' : rank > rankBefore ? 'down' : 'same',
        season: 2026,
        details,
      };
    })
    .filter((row): row is OfficialRankingRow => row !== null);
}

async function parseRankingFile(file: File, fallbackDivision: Division): Promise<OfficialRankingRow[]> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const workbook = extension === 'csv' || extension === 'txt'
    ? XLSX.read(await file.text(), { type: 'string', raw: true })
    : XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true });

  const rankingSheetNames = workbook.SheetNames.filter(name => /^RANKING\b/i.test(name));
  if (rankingSheetNames.length > 0) {
    return rankingSheetNames.flatMap(name =>
      parseRankingSheet(name, workbook.Sheets[name], fallbackDivision)
    );
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const detectedRows = parseRankingSheet(workbook.SheetNames[0], sheet, fallbackDivision);
  if (detectedRows.length > 0) return detectedRows;

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return rows
    .map((row) => {
      const rank = parseNumber(pick(row, ['rank_now', 'rank', 'rang', 'position', 'classement']), NaN);
      const playerName = String(pick(row, ['players', 'player_name', 'player', 'joueur', 'name', 'nom']) ?? '').trim();
      const points = parseNumber(pick(row, ['total_points', 'points', 'pts']), 0);
      const division = normDiv(pick(row, ['division', 'category', 'categorie']), fallbackDivision);

      if (!Number.isFinite(rank) || !playerName) return null;

      return {
        id: newId(),
        rank,
        rank_before: rank,
        player_name: playerName,
        points,
        division,
        tournaments_played: parseNumber(pick(row, ['tournaments_played', 'tournois', 'tournois_joues']), 0),
        trend: normTrend(pick(row, ['trend', 'tendance'])),
        season: parseNumber(pick(row, ['season', 'saison']), 2026),
        details: [],
      };
    })
    .filter((row): row is OfficialRankingRow => row !== null);
}

function validateRows(rows: OfficialRankingRow[]) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byDivision = new Map<Division, OfficialRankingRow[]>();

  rows.forEach(row => {
    if (!row.player_name) errors.push('Une ligne sans nom joueur a ete detectee.');
    if (row.rank <= 0) errors.push(`Rang invalide pour ${row.player_name}.`);
    byDivision.set(row.division, [...(byDivision.get(row.division) ?? []), row]);
  });

  for (const [division, divRows] of byDivision) {
    const seenRanks = new Set<number>();
    const seenNames = new Set<string>();

    for (const row of divRows) {
      if (seenRanks.has(row.rank)) warnings.push(`${DIV_LABELS[division].label}: rang ${row.rank} en doublon.`);
      seenRanks.add(row.rank);

      const key = row.player_name.trim().toLowerCase();
      if (seenNames.has(key)) warnings.push(`${DIV_LABELS[division].label}: joueur en doublon (${row.player_name}).`);
      seenNames.add(key);
    }
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

async function deleteRankingsForDivision(division: Division, onProgress?: (message: string) => void) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase non configure.');

  const variants = [divToDb(division), division, division.toLowerCase(), division === 'MIXTE' ? 'MIXED' : ''].filter(Boolean);
  let deleted = 0;

  for (;;) {
    const { data, error: selectError } = await withTimeout(
      sb.from('rankings').select('id').in('division', variants).limit(250),
      `Lecture rankings ${DIV_LABELS[division].label}`,
      12000
    );

    if (selectError) throw new Error(`Lecture rankings ${DIV_LABELS[division].label}: ${selectError.message}`);

    const ids = ((data ?? []) as { id: string }[]).map(row => row.id).filter(Boolean);
    if (ids.length === 0) break;

    const { error: deleteError } = await withTimeout(
      sb.from('rankings').delete().in('id', ids),
      `Suppression rankings ${DIV_LABELS[division].label} ${deleted + 1}-${deleted + ids.length}`,
      12000
    );

    if (deleteError) throw new Error(`Suppression rankings ${DIV_LABELS[division].label}: ${deleteError.message}`);
    deleted += ids.length;
    onProgress?.(`Suppression rankings ${DIV_LABELS[division].label}: ${deleted} lignes...`);
  }
}

async function replaceRankingsTable(rows: OfficialRankingRow[], onProgress?: (message: string) => void) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase non configure.');

  const divisions = [...new Set(rows.map(row => row.division))];
  for (const division of divisions) {
    await deleteRankingsForDivision(division, onProgress);
  }

  const payload = rows.map(row => ({
    id: row.id,
    player_name: row.player_name,
    rank: row.rank,
    rank_before: row.rank_before,
    points: row.points,
    division: divToDb(row.division),
    tournaments_played: row.tournaments_played,
    trend: row.trend,
    season: row.season,
    updated_at: new Date().toISOString(),
  }));

  const BATCH = 250;
  for (let i = 0; i < payload.length; i += BATCH) {
    onProgress?.(`Insertion rankings ${i + 1}-${Math.min(i + BATCH, payload.length)} / ${payload.length}...`);
    const { error } = await withTimeout(
      sb.from('rankings').insert(payload.slice(i, i + BATCH)),
      `Insertion rankings ${i + 1}-${Math.min(i + BATCH, payload.length)}`
    );
    if (error) throw new Error(`Insertion rankings: ${error.message}`);
  }
}

async function insertOfficialImportMetadata(fileName: string, rowCount: number, publish: boolean): Promise<string | null> {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase non configure.');

  const importId = newId();
  const rankingMonth = inferRankingMonth(fileName);
  const attempts = [
    {
      id: importId,
      file_name: fileName,
      source_file: fileName,
      ranking_month: rankingMonth,
      row_count: rowCount,
      status: publish ? 'published' : 'validated',
    },
    {
      id: importId,
      file_name: fileName,
      source_file: fileName,
      ranking_month: rankingMonth,
      row_count: rowCount,
    },
    {
      id: importId,
      source_file: fileName,
      ranking_month: rankingMonth,
      row_count: rowCount,
    },
    {
      id: importId,
      file_name: fileName,
      ranking_month: rankingMonth,
    },
    {
      id: importId,
      source_file: fileName,
      ranking_month: rankingMonth,
    },
  ];

  let lastError = '';
  for (const payload of attempts) {
    let error: { message: string } | null = null;
    try {
      const result = await withTimeout(
        sb.from('official_ranking_imports').insert(payload),
        'Insertion official_ranking_imports',
        12000
      );
      error = result.error;
    } catch (timeoutError) {
      console.warn('[Import officiel] official_ranking_imports ignore:', timeoutError);
      return null;
    }

    if (!error) return importId;
    lastError = error.message;

    if (isDuplicateKeyError(error.message)) {
      console.warn('[Import officiel] official_ranking_imports doublon ignore:', error.message);
      return null;
    }

    if (!isSchemaCacheError(error.message)) break;
  }

  throw new Error(`official_ranking_imports: ${lastError}`);
}

async function insertOfficialRankingRows(importId: string | null, rows: OfficialRankingRow[], batchId: string) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase non configure.');

  const fullPayload = importId ? rows.map(row => ({
    id: newId(),
    import_id: importId,
    player_name: row.player_name,
    rank: row.rank,
    rank_before: row.rank_before,
    points: row.points,
    division: divToDb(row.division),
    tournaments_played: row.tournaments_played,
    trend: row.trend,
    season: row.season,
    is_current: true,
    batch_id: batchId,
  })) : [];

  const leanPayload = importId ? rows.map(row => ({
    id: newId(),
    import_id: importId,
    player_name: row.player_name,
    rank: row.rank,
    rank_before: row.rank_before,
    points: row.points,
    division: divToDb(row.division),
    batch_id: batchId,
  })) : [];

  const minimalPayload = rows.map(row => ({
    id: newId(),
    player_name: row.player_name,
    rank: row.rank,
    points: row.points,
    division: divToDb(row.division),
    batch_id: batchId,
  }));

  let lastError = '';
  const BATCH = 250;
  for (const payload of [fullPayload, leanPayload, minimalPayload].filter(p => p.length > 0)) {
    let inserted = 0;
    let shouldTryNextPayload = false;

    for (let i = 0; i < payload.length; i += BATCH) {
      const { error } = await withTimeout(
        sb.from('official_rankings').insert(payload.slice(i, i + BATCH)),
        `Insertion official_rankings ${i + 1}-${Math.min(i + BATCH, payload.length)}`
      );

      if (error) {
        lastError = error.message;
        if (inserted === 0 && isSchemaCacheError(error.message)) {
          shouldTryNextPayload = true;
          break;
        }
        throw new Error(`official_rankings: ${error.message}`);
      }

      inserted += Math.min(BATCH, payload.length - i);
    }

    if (!shouldTryNextPayload) return;
  }

  throw new Error(`official_rankings: ${lastError}`);
}

async function tryInsertOfficialRankingRows(importId: string | null, rows: OfficialRankingRow[], batchId: string) {
  try {
    await insertOfficialRankingRows(importId, rows, batchId);
  } catch (error) {
    console.warn('[Import officiel] official_rankings ignore:', error);
    throw error;
  }
}

async function insertOfficialRankingDetails(importId: string | null, rows: OfficialRankingRow[], batchId: string) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase non configure.');

  const payload = rows.flatMap(row =>
    row.details.map(detail => ({
      id: newId(),
      ...(importId ? { import_id: importId } : {}),
      player_name: row.player_name,
      division: divToDb(row.division),
      event_name: detail.event_name,
      points: detail.points,
      season: row.season,
      batch_id: batchId,
    }))
  );

  if (payload.length === 0) return;

  const BATCH = 500;
  for (let i = 0; i < payload.length; i += BATCH) {
    const { error } = await withTimeout(
      sb.from('official_ranking_details').insert(payload.slice(i, i + BATCH)),
      `Insertion official_ranking_details ${i + 1}-${Math.min(i + BATCH, payload.length)}`
    );
    if (error) throw new Error(`official_ranking_details: ${error.message}`);
  }
}

async function clearOfficialRankingDetails(divisions: Division[]) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase non configure.');

  for (const division of divisions) {
    const { error } = await withTimeout(
      sb
        .from('official_ranking_details')
        .delete()
        .eq('division', divToDb(division)),
      `Nettoyage official_ranking_details ${DIV_LABELS[division].label}`
    );

    if (error) {
      throw new Error(`Nettoyage official_ranking_details ${DIV_LABELS[division].label}: ${error.message}`);
    }
  }
}

async function saveOfficialImport(
  fileName: string,
  rows: OfficialRankingRow[],
  publish: boolean,
  onProgress?: (message: string) => void
) {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('Supabase non configure.');

  const divisions = [...new Set(rows.map(row => row.division))];
  const totalDetails = rows.reduce((sum, row) => sum + row.details.length, 0);
  const batchId = newId();

  onProgress?.(`Preparation import: ${rows.length} joueurs, ${totalDetails} details tournoi...`);
  const importId = await insertOfficialImportMetadata(fileName, rows.length, publish);

  onProgress?.('Insertion classement officiel courant...');
  await tryInsertOfficialRankingRows(importId, rows, batchId);

  onProgress?.('Nettoyage details tournoi...');
  await clearOfficialRankingDetails(divisions);

  onProgress?.(`Insertion details tournoi (${totalDetails} lignes)...`);
  await insertOfficialRankingDetails(importId, rows, batchId);
}

export default function OfficialRankingImportPage() {
  const role = useAdminRole();
  const isViewer = role === 'viewer';
  const fileRef = useRef<HTMLInputElement>(null);
  const [division, setDivision] = useState<Division>('MEN');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<OfficialRankingRow[]>([]);
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [message, setMessage] = useState('');

  const validation = useMemo(() => validateRows(rows), [rows]);
  const counts = useMemo(() => {
    const result: Record<Division, number> = { MEN: 0, WOMEN: 0, JUNIOR: 0, MIXTE: 0 };
    rows.forEach(row => { result[row.division] += 1; });
    return result;
  }, [rows]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setStatus('idle');
    setMessage('');
    setFileName(file.name);

    try {
      const parsed = await parseRankingFile(file, division);
      setRows(parsed);
      setStatus(parsed.length ? 'ready' : 'error');
      setMessage(parsed.length ? `${parsed.length} lignes detectees.` : 'Aucune ligne valide detectee dans le fichier.');
    } catch (error) {
      setRows([]);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function commit(publish: boolean) {
    if (isViewer) {
      setStatus('error');
      setMessage('Role lecture seule: import impossible.');
      return;
    }
    if (!isSupabaseConnected()) {
      setStatus('error');
      setMessage('Supabase non connecte.');
      return;
    }
    if (validation.errors.length > 0 || rows.length === 0) return;

    setStatus('saving');
    setMessage(publish ? 'Publication en cours...' : 'Validation official_* en cours...');

    try {
      await saveOfficialImport(fileName || 'classements_officiels', rows, publish, setMessage);
      setStatus('saved');
      setMessage(publish
        ? 'Classements officiels publies.'
        : 'Classements officiels enregistres.');
      window.dispatchEvent(new CustomEvent('mpl:rankings:updated', { detail: {} }));
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  const canCommit = rows.length > 0 && validation.errors.length === 0 && status !== 'saving' && !isViewer;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ color: 'white', margin: '0 0 4px', fontWeight: 800, fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={22} color="#4ad569" /> Classements officiels
          </h2>
          <p style={{ color: '#555', fontSize: '13px', margin: 0 }}>
            Excel, CSV, preview, validation, publication officielle et details joueurs.
          </p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={status === 'saving'}
          style={{ padding: '9px 16px', background: '#4ad569', border: 'none', color: '#0a0a0a', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 800 }}
        >
          <Upload size={15} /> Choisir Excel / CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,.txt"
          style={{ display: 'none' }}
          onChange={event => handleFile(event.target.files?.[0])}
        />
      </div>

      <GlassCard style={{ padding: '18px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: '#888', fontSize: '12px', marginRight: '4px' }}>Division par defaut</span>
          {DIVISIONS.map(div => (
            <button
              key={div}
              type="button"
              onClick={() => setDivision(div)}
              style={{
                padding: '6px 12px',
                borderRadius: '18px',
                border: `1px solid ${division === div ? DIV_LABELS[div].color : 'rgba(255,255,255,0.1)'}`,
                background: division === div ? `${DIV_LABELS[div].color}20` : 'transparent',
                color: division === div ? DIV_LABELS[div].color : '#666',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              {DIV_LABELS[div].label}
            </button>
          ))}
        </div>
      </GlassCard>

      {message && (
        <div style={{
          padding: '10px 14px',
          background: status === 'error' ? 'rgba(239,68,68,0.12)' : status === 'saved' ? 'rgba(74,213,105,0.12)' : 'rgba(245,158,11,0.1)',
          border: `1px solid ${status === 'error' ? 'rgba(239,68,68,0.35)' : status === 'saved' ? 'rgba(74,213,105,0.35)' : 'rgba(245,158,11,0.25)'}`,
          borderRadius: '8px',
          color: status === 'error' ? '#ef4444' : status === 'saved' ? '#4ad569' : '#f59e0b',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
        }}>
          <span>{message}</span>
          <button onClick={() => setMessage('')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
        {DIVISIONS.map(div => (
          <GlassCard key={div} style={{ padding: '14px 16px', borderTop: `3px solid ${DIV_LABELS[div].color}` }}>
            <div style={{ color: DIV_LABELS[div].color, fontWeight: 900, fontSize: '24px', lineHeight: 1 }}>
              {counts[div]}
            </div>
            <div style={{ color: 'white', fontSize: '12px', fontWeight: 700, marginTop: '5px' }}>
              {DIV_LABELS[div].label}
            </div>
          </GlassCard>
        ))}
      </div>

      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <GlassCard style={{ padding: '16px' }}>
          {validation.errors.map(error => (
            <p key={error} style={{ color: '#ef4444', margin: '0 0 8px', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <AlertTriangle size={14} /> {error}
            </p>
          ))}
          {validation.warnings.slice(0, 8).map(warning => (
            <p key={warning} style={{ color: '#f59e0b', margin: '0 0 8px', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <AlertTriangle size={14} /> {warning}
            </p>
          ))}
          {validation.warnings.length > 8 && (
            <p style={{ color: '#666', margin: 0, fontSize: '12px' }}>
              + {validation.warnings.length - 8} autres avertissements.
            </p>
          )}
        </GlassCard>
      )}

      <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: 'white', fontWeight: 800, fontSize: '14px' }}>Preview</div>
            <div style={{ color: '#555', fontSize: '12px', marginTop: '2px' }}>
              {fileName || 'Aucun fichier selectionne'} {rows.length > 0 ? `- ${rows.length} lignes` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => commit(false)}
              disabled={!canCommit}
              style={{ padding: '8px 13px', background: canCommit ? '#1a1a1a' : '#222', border: '1px solid rgba(74,213,105,0.25)', color: canCommit ? '#4ad569' : '#555', borderRadius: '8px', cursor: canCommit ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700 }}
            >
              {status === 'saving' ? <RefreshCw size={13} className="spin" /> : <Database size={13} />} Valider official_*
            </button>
            <button
              onClick={() => commit(true)}
              disabled={!canCommit}
              style={{ padding: '8px 13px', background: canCommit ? '#4ad569' : '#333', border: 'none', color: canCommit ? '#0a0a0a' : '#555', borderRadius: '8px', cursor: canCommit ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800 }}
            >
              <CheckCircle2 size={13} /> Publier vers Classements
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '70px 24px', textAlign: 'center', color: '#555' }}>
            <FileSpreadsheet size={42} style={{ opacity: 0.25, marginBottom: '12px' }} />
            <p style={{ margin: 0 }}>Selectionne un fichier .xlsx, .xls ou .csv pour voir la preview.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.35)' }}>
                  {['Rang', 'Joueur', 'Division', 'Points', 'Tournois', 'Trend', 'Saison'].map(label => (
                    <th key={label} style={{ padding: '10px 12px', color: '#555', fontSize: '11px', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 150).map((row, index) => (
                  <tr key={row.id} style={{ background: index % 2 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                    <td style={{ padding: '9px 12px', color: '#ccc', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{row.rank}</td>
                    <td style={{ padding: '9px 12px', color: 'white', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{row.player_name}</td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <span style={{ color: DIV_LABELS[row.division].color, background: `${DIV_LABELS[row.division].color}18`, borderRadius: '12px', padding: '2px 9px', fontSize: '11px', fontWeight: 700 }}>
                        {DIV_LABELS[row.division].label}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px', color: '#f59e0b', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{row.points}</td>
                    <td style={{ padding: '9px 12px', color: '#888', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{row.tournaments_played}</td>
                    <td style={{ padding: '9px 12px', color: '#888', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{row.trend}</td>
                    <td style={{ padding: '9px 12px', color: '#888', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{row.season}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 150 && (
              <div style={{ padding: '10px 16px', color: '#555', fontSize: '12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                Preview limitee aux 150 premieres lignes. Toutes les {rows.length} lignes seront importees.
              </div>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
