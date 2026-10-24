import { useState, useMemo, useEffect, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Search, Lock, CalendarDays, ShieldCheck, ArrowUp, ArrowDown, Minus, ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import { Layout, GlassCard } from '@/components/Layout';
import { DotWaveBackground } from '@/components/DotWaveBackground';
import { useI18n } from '@/hooks/useI18n';
import { useSeo } from '@/hooks/useSeo';
import { getSupabaseClient } from '@/lib/supabase';
import { ROUTE_PATHS } from '@/lib/index';

// Classement de seeding : instantanes mensuels officiels, publies et verrouilles
// (ranking_snapshots). Contrairement au classement en direct, ils ne bougent
// plus une fois publies : c'est exactement ce qui a servi aux tetes de serie.

type DivKey = 'men' | 'women' | 'mixed' | 'junior';

interface Snapshot {
  id: string;
  division: DivKey;
  reference_month: string;
  applicable_month: string;
  window_start: string;
  window_end: string;
  version: number;
  published_at: string;
  entries_count: number;
  revision_reason: string | null;
}

interface Entry {
  entry_id: number;
  player_name: string;
  rank: number;
  previous_rank: number | null;
  points: number;
  results_counted: number;
}

interface Result {
  event_name: string;
  event_date: string;
  category: string;
  position: string | null;
  points: number;
  status: 'counted' | 'excluded';
}

const DIVS: { key: DivKey; fr: string; en: string; color: string; icon: string }[] = [
  { key: 'men',    fr: 'Hommes', en: 'Men',    color: '#3b82f6', icon: 'H' },
  { key: 'women',  fr: 'Dames',  en: 'Women',  color: '#ec4899', icon: 'D' },
  { key: 'mixed',  fr: 'Mixte',  en: 'Mixed',  color: '#8b5cf6', icon: 'M' },
  { key: 'junior', fr: 'Junior', en: 'Junior', color: '#f59e0b', icon: 'J' },
];

const MONTHS_FR = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthLabel(iso: string, lang: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${(lang === 'fr' ? MONTHS_FR : MONTHS_EN)[m - 1]} ${y}`;
}

function dateFr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// Points des ex aequo (ex. 23,5) arrondis a l'entier superieur, comme le moteur.
function formatPoints(value: number): string {
  return Math.ceil(Number(value) - 1e-9).toLocaleString('fr-FR');
}

function useNarrow(breakpoint = 560): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return narrow;
}

async function fetchEntries(snapshotId: string): Promise<Entry[]> {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const out: Entry[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('ranking_snapshot_entries')
      .select('entry_id,player_name,rank,previous_rank,points,results_counted')
      .eq('snapshot_id', snapshotId)
      .order('rank', { ascending: true })
      .order('entry_id', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data as Entry[]).map(e => ({ ...e, points: Number(e.points) })));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function Evolution({ entry }: { entry: Entry }) {
  if (entry.previous_rank == null) {
    return <span style={{ color: '#4ad569', fontSize: '10px', fontWeight: 900, letterSpacing: '0.6px' }}>NEW</span>;
  }
  const diff = entry.previous_rank - entry.rank;
  if (diff === 0) return <Minus size={13} color="#555" />;
  const up = diff > 0;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: up ? '#4ad569' : '#ef4444', fontSize: '12px', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>
      {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{Math.abs(diff)}
    </span>
  );
}

function PlayerResults({ entryId, color, lang, narrow }: { entryId: number; color: string; lang: string; narrow: boolean }) {
  const [rows, setRows] = useState<Result[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const sb = getSupabaseClient();
    if (!sb) return;
    sb.from('ranking_snapshot_results')
      .select('event_name,event_date,category,position,points,status')
      .eq('entry_id', entryId)
      .then(({ data }) => {
        if (cancelled) return;
        const list = ((data ?? []) as Result[]).map(r => ({ ...r, points: Number(r.points) }));
        list.sort((a, b) => (a.status === b.status ? b.points - a.points || b.event_date.localeCompare(a.event_date) : a.status === 'counted' ? -1 : 1));
        setRows(list);
      });
    return () => { cancelled = true; };
  }, [entryId]);

  if (!rows) return <div style={{ color: '#666', fontSize: '12px', padding: '10px 0' }}>{lang === 'fr' ? 'Chargement...' : 'Loading...'}</div>;
  if (!rows.length) return <div style={{ color: '#666', fontSize: '12px', padding: '10px 0' }}>{lang === 'fr' ? 'Detail non disponible.' : 'No detail available.'}</div>;
  return (
    <div style={{ display: 'grid', gap: '4px', padding: '6px 0 10px' }}>
      {rows.map((r, i) => {
        const counted = r.status === 'counted';
        return (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: narrow ? '70px minmax(0, 1fr) auto' : '78px minmax(0, 1fr) auto auto', gap: narrow ? '8px' : '10px', alignItems: 'center',
            padding: '6px 10px', borderRadius: '8px', fontSize: '12px',
            background: counted ? `${color}0f` : 'rgba(255,255,255,0.02)',
            color: counted ? 'rgba(255,255,255,0.85)' : '#555',
          }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{dateFr(r.event_date)}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.event_name}{r.position ? <span style={{ color: '#777' }}> · {lang === 'fr' ? 'place' : 'place'} {r.position}</span> : null}
            </span>
            {!narrow && <span style={{ fontSize: '10px', fontWeight: 800, color: counted ? color : '#555' }}>{counted ? (lang === 'fr' ? 'RETENU' : 'COUNTED') : (lang === 'fr' ? 'NON RETENU' : 'NOT COUNTED')}</span>}
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 800, textAlign: 'right', minWidth: '48px' }}>{formatPoints(r.points)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ClassementSeeding() {
  const { lang } = useI18n();
  useSeo({
    title: 'Classement de seeding MPL - Classement officiel mensuel',
    description: 'Classement officiel mensuel de la Mauritius Padel League utilise pour les tetes de serie des tournois : 8 meilleurs resultats sur 12 mois calendaires.',
    keywords: 'seeding padel mauritius, tetes de serie MPL, classement officiel mensuel padel',
    canonical: 'https://padelleague.mu/#/classements/seeding',
  });

  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [tournaments, setTournaments] = useState<Record<string, string[]>>({});
  const [error, setError] = useState('');
  const [month, setMonth] = useState('');
  const [division, setDivision] = useState<DivKey>('men');
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [search, setSearch] = useState('');
  const [openEntry, setOpenEntry] = useState<number | null>(null);
  const narrow = useNarrow();
  const edge = narrow ? '10px' : '16px';

  // Instantanes publies (la RLS ne montre au public que ceux-la).
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) { setError(lang === 'fr' ? 'Donnees indisponibles.' : 'Data unavailable.'); setSnapshots([]); return; }
    (async () => {
      const { data, error: err } = await sb
        .from('ranking_snapshots')
        .select('id,division,reference_month,applicable_month,window_start,window_end,version,published_at,entries_count,revision_reason')
        .eq('status', 'published')
        .order('applicable_month', { ascending: false });
      if (err) { setError(err.message); setSnapshots([]); return; }
      const list = (data ?? []) as Snapshot[];
      setSnapshots(list);
      if (list.length) setMonth(list[0].applicable_month);
      // Tournois rattaches a ces classements.
      const { data: refs } = await sb.from('tournament_seeding_references').select('tournament_id,snapshot_id');
      const ids = [...new Set((refs ?? []).map(r => String(r.tournament_id)))];
      if (!ids.length) return;
      const { data: tours } = await sb.from('tournaments').select('id,name').in('id', ids);
      const names = new Map((tours ?? []).map(t => [String(t.id), String(t.name)]));
      const bySnapshot: Record<string, string[]> = {};
      for (const r of refs ?? []) (bySnapshot[String(r.snapshot_id)] ||= []).push(names.get(String(r.tournament_id)) ?? String(r.tournament_id));
      setTournaments(bySnapshot);
    })();
  }, [lang]);

  const months = useMemo(() => [...new Set((snapshots ?? []).map(s => s.applicable_month))], [snapshots]);
  const monthSnapshots = useMemo(() => (snapshots ?? []).filter(s => s.applicable_month === month), [snapshots, month]);
  const availableDivs = DIVS.filter(d => monthSnapshots.some(s => s.division === d.key));
  const snapshot = monthSnapshots.find(s => s.division === division) ?? null;
  const divConfig = DIVS.find(d => d.key === division)!;

  useEffect(() => {
    if (availableDivs.length && !availableDivs.some(d => d.key === division)) setDivision(availableDivs[0].key);
  }, [availableDivs, division]);

  useEffect(() => {
    setEntries(null); setOpenEntry(null);
    if (!snapshot) return;
    let cancelled = false;
    fetchEntries(snapshot.id)
      .then(rows => { if (!cancelled) setEntries(rows); })
      .catch(err => { if (!cancelled) { setError(String(err.message ?? err)); setEntries([]); } });
    return () => { cancelled = true; };
  }, [snapshot?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (entries ?? []).filter(e => !q || e.player_name.toLowerCase().includes(q));
  }, [entries, search]);

  const pill = (active: boolean, color: string): React.CSSProperties => ({
    padding: '9px 14px', borderRadius: '999px', cursor: 'pointer', fontSize: '13px', fontWeight: 800,
    border: active ? `1px solid ${color}90` : '1px solid rgba(255,255,255,0.08)',
    background: active ? `${color}20` : 'rgba(255,255,255,0.035)',
    color: active ? 'white' : 'rgba(255,255,255,0.6)',
  });

  return (
    <Layout>
      <section style={{ padding: '88px 24px 60px', minHeight: '80vh', position: 'relative', overflowY: 'hidden', overflowX: 'auto', background: 'linear-gradient(180deg, #0a0a0a 0%, #0c0c0c 100%)' }}>
        <DotWaveBackground variant="hero-right" opacity={0.10} animate={false} />
        <div style={{ position: 'absolute', top: 64, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(74,213,105,0.2) 50%, transparent 100%)' }} />
        <div style={{ maxWidth: '1100px', margin: '0 auto', minWidth: '320px', position: 'relative' }}>

          {/* Bascule direct / seeding */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '22px' }}>
            <Link to={ROUTE_PATHS.RANKINGS} style={{ ...pill(false, '#4ad569'), textDecoration: 'none' }}>
              {lang === 'fr' ? 'Classement en direct' : 'Live ranking'}
            </Link>
            <span style={pill(true, '#4ad569')}>{lang === 'fr' ? 'Classement de seeding' : 'Seeding ranking'}</span>
          </div>

          {/* En-tete */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '7px 11px', borderRadius: '999px',
              border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.08)', color: '#f59e0b',
              fontSize: '11px', fontWeight: 900, letterSpacing: '0.9px', textTransform: 'uppercase', marginBottom: '14px',
            }}>
              <Lock size={13} />
              {lang === 'fr' ? 'Classement officiel mensuel - fige' : 'Official monthly ranking - frozen'}
            </div>
            <h1 style={{ fontSize: 'clamp(34px,5vw,64px)', fontWeight: 950, color: 'white', margin: '0 0 10px', letterSpacing: '-1px', lineHeight: 0.95 }}>
              {lang === 'fr' ? 'Classement de seeding' : 'Seeding ranking'}
            </h1>
            <p style={{ color: '#9ca3af', margin: 0, fontSize: '15px', lineHeight: 1.6, maxWidth: '760px' }}>
              {lang === 'fr'
                ? "Les tetes de serie d'un tournoi sont etablies sur le classement officiel du mois precedent : 8 meilleurs resultats des tournois dont la finale a eu lieu sur les 12 derniers mois calendaires. Une fois publie, ce classement ne change plus. Le classement en direct, lui, evolue chaque jour."
                : "Tournament seeds are based on the previous month's official ranking: best 8 results from tournaments whose final took place over the last 12 calendar months. Once published, it never changes. The live ranking, by contrast, moves every day."}
            </p>
          </div>

          {error && (
            <GlassCard style={{ padding: '16px', marginBottom: '20px', color: '#fca5a5', fontSize: '13px' }} hoverable={false}>{error}</GlassCard>
          )}

          {snapshots === null && <div style={{ color: '#777', fontSize: '14px' }}>{lang === 'fr' ? 'Chargement...' : 'Loading...'}</div>}
          {snapshots !== null && !snapshots.length && !error && (
            <div style={{ color: '#777', fontSize: '14px' }}>{lang === 'fr' ? 'Aucun classement officiel publie pour le moment.' : 'No official ranking published yet.'}</div>
          )}

          {!!months.length && (
            <>
              {/* Mois de tournois */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
                <span style={{ color: '#777', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <CalendarDays size={13} />{lang === 'fr' ? 'Tournois de :' : 'Tournaments of:'}
                </span>
                {months.map(m => (
                  <button key={m} onClick={() => setMonth(m)} style={pill(m === month, '#f59e0b')}>
                    {monthLabel(m, lang)}
                  </button>
                ))}
              </div>

              {/* Divisions */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(138px, 1fr))', gap: '10px', marginBottom: '18px' }}>
                {availableDivs.map(d => {
                  const s = monthSnapshots.find(x => x.division === d.key);
                  const active = d.key === division;
                  return (
                    <button key={d.key} onClick={() => { setDivision(d.key); setSearch(''); }} style={{
                      padding: '13px 14px', borderRadius: '12px', cursor: 'pointer', fontSize: '14px', fontWeight: 800,
                      background: active ? `linear-gradient(135deg, ${d.color}22 0%, rgba(255,255,255,0.06) 100%)` : 'rgba(255,255,255,0.035)',
                      color: active ? 'white' : 'rgba(255,255,255,0.62)',
                      border: active ? `1px solid ${d.color}80` : '1px solid rgba(255,255,255,0.07)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                    }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '24px', height: '24px', borderRadius: '8px', background: `${d.color}20`, color: d.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: 900 }}>{d.icon}</span>
                        {lang === 'fr' ? d.fr : d.en}
                      </span>
                      <span style={{ color: active ? d.color : '#777', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: 900 }}>{s?.entries_count ?? '-'}</span>
                    </button>
                  );
                })}
              </div>

              {snapshot && (
                <>
                  {/* Fiche du classement */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '18px',
                  }}>
                    {[
                      { label: lang === 'fr' ? 'Classement officiel' : 'Official ranking', val: monthLabel(snapshot.reference_month, lang), color: divConfig.color },
                      { label: lang === 'fr' ? 'Tetes de serie des tournois de' : 'Seeds for tournaments of', val: monthLabel(snapshot.applicable_month, lang), color: '#f59e0b' },
                      { label: lang === 'fr' ? 'Finales prises en compte' : 'Finals counted', val: `${dateFr(snapshot.window_start)} -> ${dateFr(snapshot.window_end)}`, color: '#93c5fd' },
                      { label: lang === 'fr' ? 'Publie le' : 'Published on', val: `${dateFr(snapshot.published_at)} · v${snapshot.version}`, color: '#4ad569' },
                    ].map(c => (
                      <div key={c.label} style={{ border: `1px solid ${c.color}30`, background: `${c.color}0d`, borderRadius: '12px', padding: '12px 14px' }}>
                        <div style={{ color: '#777', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '5px' }}>{c.label}</div>
                        <div style={{ color: c.color, fontWeight: 900, fontSize: '15px', textTransform: 'capitalize' }}>{c.val}</div>
                      </div>
                    ))}
                  </div>
                  {snapshot.revision_reason && (
                    <div style={{ color: '#fbbf24', fontSize: '12px', margin: '-6px 0 16px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <ShieldCheck size={13} />{lang === 'fr' ? `Revision v${snapshot.version} : ${snapshot.revision_reason}` : `Revision v${snapshot.version}: ${snapshot.revision_reason}`}
                    </div>
                  )}
                  {!!tournaments[snapshot.id]?.length && (
                    <div style={{ color: '#aaa', fontSize: '12px', margin: '-6px 0 16px', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Trophy size={13} color="#f59e0b" />
                      <span style={{ color: '#777' }}>{lang === 'fr' ? 'Utilise pour :' : 'Used for:'}</span>
                      {tournaments[snapshot.id].map(n => <span key={n} style={{ color: 'white', fontWeight: 700 }}>{n}</span>)}
                    </div>
                  )}

                  {/* Recherche */}
                  <div style={{ position: 'relative', maxWidth: '400px', marginBottom: '16px' }}>
                    <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#555' }} />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder={lang === 'fr' ? 'Rechercher un joueur...' : 'Search a player...'}
                      style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${divConfig.color}40`, borderRadius: '10px', padding: '9px 12px 9px 36px', color: 'white', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* Tableau */}
                  <GlassCard style={{ padding: '8px 0' }} hoverable={false}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <thead>
                          <tr style={{ color: '#666', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'left' }}>
                            <th style={{ padding: `10px ${edge}`, width: narrow ? '44px' : '70px' }}>{lang === 'fr' ? 'Rang' : 'Rank'}</th>
                            <th style={{ padding: '10px 8px' }}>{lang === 'fr' ? 'Joueur' : 'Player'}</th>
                            <th style={{ padding: '10px 8px', width: narrow ? '48px' : '90px' }} title={lang === 'fr' ? 'Par rapport au classement du mois precedent' : 'Versus previous month'}>{lang === 'fr' ? 'Evol.' : 'Move'}</th>
                            {!narrow && <th style={{ padding: '10px 8px', width: '80px', textAlign: 'center' }}>{lang === 'fr' ? 'Result.' : 'Results'}</th>}
                            <th style={{ padding: `10px ${edge}`, width: narrow ? '64px' : '100px', textAlign: 'right' }}>Points</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries === null && (
                            <tr><td colSpan={narrow ? 4 : 5} style={{ padding: '18px 16px', color: '#777', fontSize: '13px' }}>{lang === 'fr' ? 'Chargement...' : 'Loading...'}</td></tr>
                          )}
                          {entries !== null && !filtered.length && (
                            <tr><td colSpan={narrow ? 4 : 5} style={{ padding: '18px 16px', color: '#777', fontSize: '13px' }}>{lang === 'fr' ? 'Aucun joueur trouve.' : 'No player found.'}</td></tr>
                          )}
                          {filtered.map(e => {
                            const open = openEntry === e.entry_id;
                            return (
                              <Fragment key={e.entry_id}>
                                <tr
                                  onClick={() => setOpenEntry(open ? null : e.entry_id)}
                                  style={{ borderTop: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', background: open ? `${divConfig.color}0a` : 'transparent' }}
                                >
                                  <td style={{ padding: `10px ${edge}`, color: e.rank <= 3 ? '#f59e0b' : divConfig.color, fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', fontSize: '14px' }}>{e.rank}</td>
                                  <td style={{ padding: '10px 8px', color: 'white', fontWeight: 700, fontSize: narrow ? '13px' : '14px' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                      {e.player_name}
                                      {open ? <ChevronUp size={13} color="#666" /> : <ChevronDown size={13} color="#444" />}
                                    </span>
                                  </td>
                                  <td style={{ padding: '10px 8px' }}><Evolution entry={e} /></td>
                                  {!narrow && <td style={{ padding: '10px 8px', textAlign: 'center', color: '#888', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }}>{e.results_counted}</td>}
                                  <td style={{ padding: `10px ${edge}`, textAlign: 'right', color: 'white', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', fontSize: '14px' }}>{formatPoints(e.points)}</td>
                                </tr>
                                {open && (
                                  <tr>
                                    <td colSpan={narrow ? 4 : 5} style={{ padding: narrow ? '0 8px' : '0 16px' }}>
                                      <PlayerResults entryId={e.entry_id} color={divConfig.color} lang={lang} narrow={narrow} />
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </GlassCard>
                  <p style={{ color: '#666', fontSize: '12px', marginTop: '14px', lineHeight: 1.6 }}>
                    {lang === 'fr'
                      ? "Evolution par rapport au classement officiel du mois precedent. Cliquez sur un joueur pour voir les resultats retenus. Ex aequo : meme rang pour un meme total."
                      : 'Movement versus the previous official ranking. Click a player to see the counted results. Ties share the same rank.'}
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}
