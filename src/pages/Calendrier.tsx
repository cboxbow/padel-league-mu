import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, MapPin, Trophy, Filter, Search, X, ChevronUp, ChevronDown, RefreshCw, Award } from 'lucide-react';
import { Layout, GlassCard } from '@/components/Layout';
import { DotWaveBackground } from '@/components/DotWaveBackground';
import { useI18n } from '@/hooks/useI18n';
import { useTournaments } from '@/hooks/useData';
import { REGION_CONFIG, ROUTE_PATHS } from '@/lib/index';
import type { Region } from '@/lib/index';
import { MPL_CLUBS } from '@/data/mpl2026';
import { useSeo } from '@/hooks/useSeo';

// ── Helper : trouver le téléphone WhatsApp du responsable d'un club ──────────
function getClubWhatsApp(clubId?: string, clubName?: string): string | null {
  let club = clubId ? MPL_CLUBS.find(c => c.id === clubId) : null;
  if (!club && clubName) {
    const q = clubName.toLowerCase();
    club = MPL_CLUBS.find(c =>
      c.name.toLowerCase().includes(q) ||
      q.includes(c.name.toLowerCase().split(' ').slice(0, 2).join(' ').toLowerCase())
    );
  }
  if (!club?.phone) return null;
  // Transformer le numéro en format WhatsApp (enlever espaces et +)
  const digits = club.phone.replace(/[\s\-+()]/g, '');
  return `https://wa.me/${digits}`;
}

// ── Constantes ────────────────────────────────────────────────────────────────
const CATEGORIES = ['all', 'M25', 'M50', 'M100', 'M250', 'M500', 'M1000', 'MIXED', 'JUNIOR'];
const CAT_LABELS: Record<string, string> = {
  all: 'Toutes', MIXED: 'Mixte', JUNIOR: 'Junior',
  U11: 'U11', U13: 'U13', U15: 'U15',
};
const REGIONS    = ['all', 'Nord', 'Ouest', 'Centre', 'Est'];
const STATUSES   = ['all', 'upcoming', 'open', 'draw', 'ongoing', 'completed', 'cancelled'];

const MONTHS_FR: Record<string, string> = {
  '01': 'Janvier', '02': 'Février', '03': 'Mars', '04': 'Avril',
  '05': 'Mai', '06': 'Juin', '07': 'Juillet', '08': 'Août',
  '09': 'Septembre', '10': 'Octobre', '11': 'Novembre', '12': 'Décembre',
};
// Abréviations sans ambiguïté (Juin/Juillet)
const MONTHS_FR_SHORT: Record<string, string> = {
  '01': 'Jan', '02': 'Fév', '03': 'Mar', '04': 'Avr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Août',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Déc',
};
const MONTHS_EN: Record<string, string> = {
  '01': 'January', '02': 'February', '03': 'March', '04': 'April',
  '05': 'May', '06': 'June', '07': 'July', '08': 'August',
  '09': 'September', '10': 'October', '11': 'November', '12': 'December',
};
const MONTHS_EN_SHORT: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

const CAT_COLORS: Record<string, string> = {
  M25: '#60a5fa', M50: '#34d399', M100: '#fbbf24', M250: '#f97316',
  M500: '#e879f9', M1000: '#ff4d4d', MIXED: '#a78bfa',
  U11: '#fb923c', U13: '#f97316', U15: '#ef4444',
  Junior: '#fb923c', JUNIOR: '#fb923c',
};

const STATUS_CONFIG: Record<string, { label_fr: string; label_en: string; color: string; bg: string }> = {
  upcoming:  { label_fr: 'À venir',       label_en: 'Upcoming',   color: '#60a5fa', bg: 'rgba(96,165,250,0.15)'  },
  open:      { label_fr: 'Inscriptions',  label_en: 'Open',       color: '#4ad569', bg: 'rgba(74,213,105,0.15)'  },
  draw:      { label_fr: 'Tirage',        label_en: 'Draw',       color: '#f59e0b', bg: 'rgba(245,158,11,0.15)'  },
  ongoing:   { label_fr: 'En cours',      label_en: 'Ongoing',    color: '#f59e0b', bg: 'rgba(245,158,11,0.15)'  },
  completed: { label_fr: 'Terminé',       label_en: 'Completed',  color: '#a0a0a0', bg: 'rgba(160,160,160,0.15)' },
  cancelled: { label_fr: 'Annulé',        label_en: 'Cancelled',  color: '#ff6b6b', bg: 'rgba(255,107,107,0.15)' },
};

type SortField = 'date' | 'name' | 'region' | 'category' | 'max_teams' | 'teams_registered' | 'status';
type SortDir   = 'asc' | 'desc';

// ── Composants utilitaires ────────────────────────────────────────────────────
function FilterPill({ label, active, color, bg, onClick }: {
  label: string; active: boolean; color: string; bg: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: '18px', cursor: 'pointer',
      fontSize: '12px', fontWeight: 600, transition: 'all 0.15s', whiteSpace: 'nowrap',
      background: active ? bg : 'rgba(255,255,255,0.04)',
      color: active ? color : 'rgba(255,255,255,0.45)',
      border: active ? `1px solid ${color}50` : '1px solid rgba(255,255,255,0.07)',
    }}>
      {label}
    </button>
  );
}

// Liens vers les apps mobiles MPL (M500 / M1000 organisés par la ligue)
const APP_STORE_URL   = 'https://apps.apple.com/us/app/padel-league-mauritius/id6453941908';
const PLAY_STORE_URL  = 'https://play.google.com/store/apps/details?id=com.smartappmu.padelleague';

/** Détecte si l'appareil est iOS ou Android et retourne le bon lien store */
function getAppStoreUrl(): string {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return APP_STORE_URL;
  if (/Android/.test(ua)) return PLAY_STORE_URL;
  // Desktop : ouvre le Play Store (ou une page intermédiaire selon préférence)
  return PLAY_STORE_URL;
}

function StatusBadge({ status, lang, whatsappUrl, contactName, isAppOnly }: {
  status: string; lang: string; whatsappUrl?: string | null; contactName?: string; isAppOnly?: boolean;
}) {
  const sc = STATUS_CONFIG[status] ?? STATUS_CONFIG.upcoming;
  const isOpen = status === 'open' || status === 'draw';
  const baseStyle: React.CSSProperties = {
    background: sc.bg, color: sc.color, borderRadius: '6px',
    padding: '3px 9px', fontSize: '11px', fontWeight: 700,
    whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px',
  };
  const label = lang === 'fr' ? sc.label_fr : sc.label_en;

  // ── M500 / M1000 : inscrire via l'application MPL ─────────────────────────
  if (isOpen && isAppOnly) {
    return (
      <a
        href={getAppStoreUrl()}
        target="_blank"
        rel="noreferrer"
        title={lang === 'fr' ? 'Inscription via l\'application Padel League' : 'Register via Padel League App'}
        style={{
          ...baseStyle,
          cursor: 'pointer', textDecoration: 'none',
          border: `1px solid ${sc.color}50`,
          transition: 'all 0.15s',
          background: 'rgba(232,121,249,0.12)',
          color: '#e879f9',
          boxShadow: '0 0 0 0 #e879f900',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(232,121,249,0.25)';
          (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 0 8px rgba(232,121,249,0.4)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(232,121,249,0.12)';
          (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 0 0 0 #e879f900';
        }}
      >
        📱 {lang === 'fr' ? 'Via l\'App' : 'Via App'}
      </a>
    );
  }

  // ── Autres catégories : inscrire via WhatsApp du club ──────────────────────
  if (isOpen && whatsappUrl) {
    return (
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noreferrer"
        title={`S'inscrire via WhatsApp${contactName ? ` — ${contactName}` : ''}`}
        style={{
          ...baseStyle,
          cursor: 'pointer', textDecoration: 'none',
          border: `1px solid ${sc.color}50`,
          transition: 'all 0.15s',
          boxShadow: `0 0 0 0 ${sc.color}00`,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLAnchorElement).style.background = sc.color + '30';
          (e.currentTarget as HTMLAnchorElement).style.boxShadow = `0 0 8px ${sc.color}40`;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLAnchorElement).style.background = sc.bg;
          (e.currentTarget as HTMLAnchorElement).style.boxShadow = `0 0 0 0 ${sc.color}00`;
        }}
      >
        💬 {label}
      </a>
    );
  }
  return (
    <span style={baseStyle}>
      {label}
    </span>
  );
}

function CatBadge({ cat }: { cat: string }) {
  const c = CAT_COLORS[cat] ?? '#4ad569';
  return (
    <span style={{
      background: `${c}18`, color: c, borderRadius: '6px',
      padding: '3px 9px', fontSize: '12px', fontWeight: 800,
      display: 'inline-block', minWidth: '50px', textAlign: 'center',
    }}>
      {cat}
    </span>
  );
}

function SortBtn({ field, current, dir, onSort }: {
  field: SortField; current: SortField; dir: SortDir; onSort: (f: SortField) => void;
}) {
  const active = current === field;
  return (
    <button
      onClick={() => onSort(field)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: active ? '#4ad569' : '#555', display: 'inline-flex',
        alignItems: 'center', gap: '3px', padding: 0, fontSize: 'inherit', fontWeight: 'inherit',
      }}
    >
      <span>{field === 'date' ? (active ? '' : '') : ''}</span>
      {active
        ? (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
        : <ChevronDown size={12} style={{ opacity: 0.3 }} />}
    </button>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────
export default function Calendrier() {
  const { lang } = useI18n();
  const useNav = useNavigate();
  useSeo({
    title: "Calendrier des Tournois Padel Maurice 2026",
    description: "Calendrier complet des tournois de padel à Maurice 2026. Tous les niveaux : M25, M50, M100, M250, M500, M1000, Mixed, Junior. Inscriptions en ligne.",
    keywords: "calendrier padel mauritius, tournoi padel 2026, padel tournament mauritius schedule",
    canonical: "https://padelleague.mu/#/calendrier",
  });

  // ── États filtres ──
  const [region,   setRegion]   = useState('all');
  const [category, setCategory] = useState('all');
  const [status,   setStatus]   = useState('all');
  const [month,    setMonth]    = useState('all');
  const [search,   setSearch]   = useState('');
  const [page,     setPage]     = useState(1);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir,   setSortDir]   = useState<SortDir>('asc');
  const PER_PAGE = 30;

  const { tournaments, loading } = useTournaments({ region, category, status, month });

  // ── Recherche ──
  const filtered = useMemo(() => {
    let res = tournaments;
    if (search.trim()) {
      const q = search.toLowerCase();
      res = res.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.club_name.toLowerCase().includes(q) ||
        t.region.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    }
    // Tri
    return [...res].sort((a, b) => {
      const aAny = a as unknown as Record<string, unknown>;
      const bAny = b as unknown as Record<string, unknown>;
      let va: string | number = (aAny[sortField] ?? '') as string | number;
      let vb: string | number = (bAny[sortField] ?? '') as string | number;
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [tournaments, search, sortField, sortDir]);

  const total = filtered.length;
  const pages = Math.ceil(total / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const resetPage = () => setPage(1);

  const handleSort = (f: SortField) => {
    if (f === sortField) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('asc'); }
  };

  const stats = useMemo(() => ({
    upcoming:  filtered.filter(t => t.status === 'upcoming').length,
    open:      filtered.filter(t => ['open','draw'].includes(t.status)).length,
    completed: filtered.filter(t => t.status === 'completed').length,

  }), [filtered]);

  const activeCount = [region, category, status, month].filter(f => f !== 'all').length + (search ? 1 : 0);

  const clearAll = () => {
    setRegion('all'); setCategory('all'); setStatus('all'); setMonth('all');
    setSearch(''); resetPage();
  };

  const resultsPathForTournament = (t: { club_name: string; date: string; division?: string; type?: string }) => {
    const rawDivision = (t.division || t.type || '').toLowerCase();
    const division = rawDivision.includes('mixed') ? 'mixed'
      : rawDivision.includes('junior') ? 'junior'
      : rawDivision.includes('women') || rawDivision.includes('dames') ? 'women'
      : rawDivision.includes('men') || rawDivision.includes('hommes') ? 'men'
      : 'all';
    const params = new URLSearchParams({ q: t.club_name, date: t.date });
    if (division !== 'all') params.set('division', division);
    return `${ROUTE_PATHS.RESULTS}?${params.toString()}`;
  };

  // En-têtes de colonne du tableau
  const COLUMNS: { key: SortField; label_fr: string; label_en: string; align?: 'right' | 'center'; width?: string }[] = [
    { key: 'date',             label_fr: 'Date',        label_en: 'Date',       width: '96px'  },
    { key: 'name',             label_fr: 'Tournoi',     label_en: 'Tournament'                 },
    { key: 'region',           label_fr: 'Région',      label_en: 'Region',     width: '90px'  },
    { key: 'category',         label_fr: 'Catégorie',   label_en: 'Category',   width: '90px', align: 'center' },
    { key: 'status',           label_fr: 'Statut',      label_en: 'Status',     width: '100px', align: 'center' },
    { key: 'teams_registered', label_fr: '● Inscrits',  label_en: '● Entries',  width: '100px', align: 'right'  },
  ];

  return (
    <Layout>
      <section style={{ padding: '80px 24px 80px', minHeight: '80vh', position: 'relative', overflowY: 'hidden', overflowX: 'auto', background: 'linear-gradient(180deg, #0a0a0a 0%, #0d0d0d 100%)' }}>
        <DotWaveBackground variant="corner-br" opacity={0.09} animate={false} />
        <div style={{ position: 'absolute', top: 64, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(74,213,105,0.18) 50%, transparent 100%)' }} />
        <div style={{ maxWidth: '1400px', margin: '0 auto', minWidth: '320px' }}>

          {/* ── Header ── */}
          <div style={{ marginBottom: '28px' }}>
            <h1 style={{ fontSize: 'clamp(24px,4vw,42px)', fontWeight: 900, color: 'white', margin: '0 0 6px', letterSpacing: '-0.5px' }}>
              {lang === 'fr' ? '📅 Calendrier des Tournois' : '📅 Tournament Calendar'}
            </h1>
            <p style={{ color: '#606060', fontSize: '14px', margin: '0 0 20px' }}>
              {lang === 'fr' ? 'Saison 2026 · source Supabase en temps réel' : 'Season 2026 · live Supabase data'}
            </p>

            {/* Stats rapides */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { label: lang === 'fr' ? 'Total'    : 'Total',     val: total,             color: '#a0a0a0' },
                { label: lang === 'fr' ? 'À venir'      : 'Upcoming',   val: stats.upcoming,  color: '#60a5fa' },
                { label: lang === 'fr' ? 'Inscriptions' : 'Open',       val: stats.open,      color: '#4ad569' },
                { label: lang === 'fr' ? 'Terminés'     : 'Completed',  val: stats.completed, color: '#808080' },

              ].map(({ label, val, color }) => (
                <div key={label} style={{
                  background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}22`,
                  borderRadius: '10px', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <span style={{ color, fontWeight: 800, fontSize: '16px', fontFamily: 'JetBrains Mono,monospace' }}>{val}</span>
                  <span style={{ color: '#606060', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#4ad569', fontSize: '12px' }}>
                  <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
                  {lang === 'fr' ? 'Chargement…' : 'Loading…'}
                </div>
              )}
            </div>
          </div>

          {/* ── Filtres ── */}
          <GlassCard style={{ padding: '16px 20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

              {/* Ligne 1 : Recherche + Clear */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1', minWidth: '200px', maxWidth: '360px' }}>
                  <Search size={13} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#505050' }} />
                  <input
                    type="text"
                    placeholder={lang === 'fr' ? 'Rechercher tournoi, club…' : 'Search tournament, club…'}
                    value={search}
                    onChange={e => { setSearch(e.target.value); resetPage(); }}
                    style={{
                      width: '100%', padding: '8px 32px 8px 34px', boxSizing: 'border-box',
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px', color: 'white', fontSize: '13px', outline: 'none',
                    }}
                  />
                  {search && (
                    <button onClick={() => { setSearch(''); resetPage(); }} style={{
                      position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', color: '#505050', cursor: 'pointer', padding: '2px',
                    }}>
                      <X size={12} />
                    </button>
                  )}
                </div>
                {activeCount > 0 && (
                  <button onClick={clearAll} style={{
                    background: 'rgba(255,107,107,0.1)', color: '#ff6b6b',
                    border: '1px solid rgba(255,107,107,0.25)', borderRadius: '8px',
                    padding: '7px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '5px',
                  }}>
                    <X size={12} />
                    {lang === 'fr' ? `Effacer filtres (${activeCount})` : `Clear filters (${activeCount})`}
                  </button>
                )}
              </div>

              {/* Ligne 2 : Région */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: '#505050', fontSize: '11px', fontWeight: 700, minWidth: '68px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={11} />RÉGION
                </span>
                {REGIONS.map(r => {
                  const cfg = r !== 'all' ? REGION_CONFIG[r as Region] : null;
                  return (
                    <FilterPill key={r}
                      label={r === 'all' ? (lang === 'fr' ? 'Toutes' : 'All') : r}
                      active={region === r}
                      color={cfg ? cfg.color : '#4ad569'}
                      bg={cfg ? cfg.bg : 'rgba(74,213,105,0.15)'}
                      onClick={() => { setRegion(r); resetPage(); }}
                    />
                  );
                })}
              </div>

              {/* Ligne 3 : Catégorie */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: '#505050', fontSize: '11px', fontWeight: 700, minWidth: '68px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Trophy size={11} />CATÉG.
                </span>
                {CATEGORIES.map(c => (
                  <FilterPill key={c}
                    label={CAT_LABELS[c] ?? (c === 'all' ? (lang === 'fr' ? 'Toutes' : 'All') : c)}
                    active={category === c}
                    color={CAT_COLORS[c] ?? '#4ad569'}
                    bg={`${CAT_COLORS[c] ?? '#4ad569'}20`}
                    onClick={() => { setCategory(c); resetPage(); }}
                  />
                ))}
              </div>

              {/* Ligne 4 : Mois */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: '#505050', fontSize: '11px', fontWeight: 700, minWidth: '68px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={11} />MOIS
                </span>
                <FilterPill label={lang === 'fr' ? 'Tous' : 'All'} active={month === 'all'}
                  color="#4ad569" bg="rgba(74,213,105,0.15)"
                  onClick={() => { setMonth('all'); resetPage(); }} />
                {Object.entries(MONTHS_FR).map(([k]) => (
                  <FilterPill key={k}
                    label={lang === 'fr' ? MONTHS_FR_SHORT[k] : MONTHS_EN_SHORT[k]}
                    active={month === k}
                    color="#c084fc" bg="rgba(192,132,252,0.15)"
                    onClick={() => { setMonth(k); resetPage(); }}
                  />
                ))}
              </div>

              {/* Ligne 5 : Statut */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: '#505050', fontSize: '11px', fontWeight: 700, minWidth: '68px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Filter size={11} />STATUT
                </span>
                {STATUSES.map(s => {
                  const sc = STATUS_CONFIG[s];
                  return (
                    <FilterPill key={s}
                      label={s === 'all' ? (lang === 'fr' ? 'Tous' : 'All') : (lang === 'fr' ? sc?.label_fr : sc?.label_en) ?? s}
                      active={status === s}
                      color={sc ? sc.color : '#4ad569'}
                      bg={sc ? sc.bg : 'rgba(74,213,105,0.15)'}
                      onClick={() => { setStatus(s); resetPage(); }}
                    />
                  );
                })}
              </div>

            </div>
          </GlassCard>

          {/* ── Compteur résultats ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ color: '#606060', fontSize: '13px' }}>
                {total} {lang === 'fr' ? 'tournoi(s)' : 'tournament(s)'}
                {activeCount > 0 && <span style={{ color: '#4ad569' }}> — filtrés</span>}
              </span>
              <span style={{ color: '#444', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: '#4ad569', fontSize: '9px' }}>●</span>
                {lang === 'fr' ? 'Inscrits mis à jour auto depuis les résultats' : 'Entries auto-updated from results'}
              </span>
            </div>
            <span style={{ color: '#404040', fontSize: '12px' }}>
              {lang === 'fr' ? `Page ${page}/${pages} · ${PER_PAGE} par page` : `Page ${page}/${pages} · ${PER_PAGE} per page`}
            </span>
          </div>

          {/* ── TABLE PRINCIPALE ── */}
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[...Array(15)].map((_, i) => (
                <div key={i} style={{ height: '46px', background: 'rgba(255,255,255,0.025)', borderRadius: '6px', animation: 'pulse 1.6s infinite' }} />
              ))}
            </div>
          ) : total === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '14px' }}>🔍</div>
              <p style={{ color: '#606060', fontSize: '15px', marginBottom: '16px' }}>
                {lang === 'fr' ? 'Aucun tournoi trouvé' : 'No tournaments found'}
              </p>
              <button onClick={clearAll} style={{
                background: 'rgba(74,213,105,0.1)', color: '#4ad569',
                border: '1px solid rgba(74,213,105,0.3)', borderRadius: '8px',
                padding: '8px 20px', fontSize: '13px', cursor: 'pointer',
              }}>
                {lang === 'fr' ? 'Réinitialiser les filtres' : 'Reset filters'}
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid rgba(74,213,105,0.1)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px', fontSize: '13px' }}>

                {/* ── THEAD ── */}
                <thead>
                  <tr style={{ background: 'rgba(74,213,105,0.05)', borderBottom: '1px solid rgba(74,213,105,0.15)' }}>
                    {COLUMNS.map(col => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        style={{
                          padding: '11px 14px',
                          textAlign: col.align ?? 'left',
                          color: sortField === col.key ? '#4ad569' : '#505050',
                          fontSize: '11px', fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.8px',
                          width: col.width,
                          cursor: 'pointer', userSelect: 'none',
                          whiteSpace: 'nowrap',
                          borderRight: '1px solid rgba(255,255,255,0.03)',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {lang === 'fr' ? col.label_fr : col.label_en}
                          {sortField === col.key
                            ? (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
                            : <ChevronDown size={11} style={{ opacity: 0.2 }} />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* ── TBODY ── */}
                <tbody>
                  {paged.map((t, i) => {
                    const catC    = CAT_COLORS[t.category] ?? '#4ad569';
                    const regC    = REGION_CONFIG[t.region as Region]?.color ?? '#a0a0a0';
                    const dateObj = new Date(t.date + 'T00:00:00');
                    const dayFmt  = dateObj.toLocaleDateString(lang === 'fr' ? 'fr-MU' : 'en-MU', {
                      day: '2-digit', month: 'short', year: '2-digit',
                    });
                    // Priorité : participants_count (depuis results) > teams_registered (Supabase)
                    const registered = t.participants_count ?? t.teams_registered ?? 0;
                    const maxTeams   = t.max_teams ?? 0;
                    const fillPct    = maxTeams > 0 ? Math.round((registered / maxTeams) * 100) : 0;
                    const fillColor  = fillPct >= 90 ? '#ff6b6b' : fillPct >= 60 ? '#fbbf24' : '#4ad569';
                    const today      = new Date().toISOString().slice(0, 10);
                    const isToday    = t.date === today;
                    const hasResults = t.has_results ?? false;

                    return (
                      <tr
                        key={t.id}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                          transition: 'background 0.12s',
                          cursor: 'default',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = `${catC}08`)}
                        onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)')}
                      >
                        {/* Date */}
                        <td style={{ padding: '10px 14px', color: '#808080', fontFamily: 'JetBrains Mono,monospace', fontSize: '12px', whiteSpace: 'nowrap', borderRight: '1px solid rgba(255,255,255,0.03)' }}>
                          {dayFmt}
                        </td>

                        {/* Nom + Club */}
                        <td style={{ padding: '10px 14px', borderRight: '1px solid rgba(255,255,255,0.03)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '2px' }}>
                            <span style={{ fontSize: '13px', color: 'white', fontWeight: 600 }}>{t.name}</span>
                            {t.type === 'WOMEN' && (
                              <span style={{ background: 'rgba(236,72,153,0.15)', color: '#ec4899', borderRadius: '4px', padding: '1px 6px', fontSize: '10px', fontWeight: 800 }}>♀</span>
                            )}
                            {t.type === 'MEN' && (
                              <span style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '4px', padding: '1px 6px', fontSize: '10px', fontWeight: 800 }}>♂</span>
                            )}
                            {t.type === 'MIXED' && (
                              <span style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa', borderRadius: '4px', padding: '1px 6px', fontSize: '10px', fontWeight: 800 }}>⚥</span>
                            )}
                            {t.type === 'JUNIOR' && (
                              <span style={{ background: 'rgba(251,146,60,0.12)', color: '#fb923c', borderRadius: '4px', padding: '1px 6px', fontSize: '10px', fontWeight: 800 }}>⭐</span>
                            )}
                          </div>
                          <div style={{ color: '#555', fontSize: '11px' }}>
                            🏟 {t.club_name}
                          </div>
                        </td>

                        {/* Région */}
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', borderRight: '1px solid rgba(255,255,255,0.03)' }}>
                          <span style={{ color: regC, fontWeight: 600, fontSize: '12px' }}>
                            {t.region}
                          </span>
                        </td>

                        {/* Catégorie */}
                        <td style={{ padding: '10px 14px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.03)' }}>
                          <CatBadge cat={t.category} />
                        </td>

                        {/* Statut + badge En cours + lien résultats */}
                        <td style={{ padding: '10px 14px', textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.03)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                            {/* Badge En cours si date = aujourd'hui */}
                            {isToday ? (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                background: 'rgba(74,213,105,0.15)', color: '#4ad569',
                                border: '1px solid rgba(74,213,105,0.4)',
                                borderRadius: '6px', padding: '3px 8px',
                                fontSize: '10px', fontWeight: 800, animation: 'pulse 1.5s infinite',
                              }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ad569', display: 'inline-block' }} />
                                En cours
                              </span>
                            ) : (
                              <StatusBadge
                                status={t.status}
                                lang={lang}
                                isAppOnly={t.category === 'M500' || t.category === 'M1000'}
                                whatsappUrl={getClubWhatsApp(t.club_id, t.club_name)}
                                contactName={MPL_CLUBS.find(c => c.id === t.club_id)?.contact}
                              />
                            )}
                            {/* Badge Résultats si résultats disponibles */}
                            {hasResults && (
                              <button
                                onClick={() => useNav(resultsPathForTournament(t))}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '3px',
                                  background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                                  border: '1px solid rgba(245,158,11,0.25)',
                                  borderRadius: '6px', padding: '3px 8px',
                                  fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <Award size={10} /> Résultats ✓
                              </button>
                            )}
                            {/* Lien résultats si terminé sans résultats Supabase */}
                            {!hasResults && (t.status === 'completed' || t.status === 'Terminé' || t.status === 'terminé') && (
                              <button
                                onClick={() => useNav(resultsPathForTournament(t))}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '3px',
                                  background: 'rgba(100,100,100,0.1)', color: '#666',
                                  border: '1px solid rgba(255,255,255,0.08)',
                                  borderRadius: '6px', padding: '3px 8px',
                                  fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <Award size={10} /> Résultats
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Inscrits — nombre réel depuis les résultats uniquement */}
                        <td style={{ padding: '10px 14px', textAlign: 'right', borderRight: '1px solid rgba(255,255,255,0.03)' }}>
                          {registered > 0 ? (
                            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: '12px', color: hasResults ? '#4ad569' : '#a0a0a0', fontWeight: 600 }}>
                              {registered}
                            </span>
                          ) : (
                            <span style={{ color: '#333', fontSize: '12px' }}>—</span>
                          )}
                        </td>


                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Pagination ── */}
          {pages > 1 && (
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              gap: '6px', marginTop: '24px', flexWrap: 'wrap',
            }}>
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                style={{
                  background: 'rgba(255,255,255,0.05)', color: page === 1 ? '#333' : '#a0a0a0',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                  padding: '5px 11px', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: '12px',
                }}
              >«</button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  background: 'rgba(255,255,255,0.05)', color: page === 1 ? '#333' : '#a0a0a0',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                  padding: '5px 11px', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: '12px',
                }}
              >‹</button>

              {Array.from({ length: Math.min(7, pages) }, (_, i) => {
                let p = i + 1;
                if (pages > 7) {
                  if (page <= 4)          p = i + 1;
                  else if (page >= pages - 3) p = pages - 6 + i;
                  else                    p = page - 3 + i;
                }
                return (
                  <button key={p} onClick={() => setPage(p)} style={{
                    minWidth: '32px', padding: '5px 8px', borderRadius: '6px',
                    cursor: 'pointer', fontSize: '12px', fontWeight: page === p ? 700 : 400,
                    background: page === p ? 'rgba(74,213,105,0.15)' : 'rgba(255,255,255,0.04)',
                    color: page === p ? '#4ad569' : '#808080',
                    border: page === p ? '1px solid rgba(74,213,105,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {p}
                  </button>
                );
              })}

              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page === pages}
                style={{
                  background: 'rgba(255,255,255,0.05)', color: page === pages ? '#333' : '#a0a0a0',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                  padding: '5px 11px', cursor: page === pages ? 'not-allowed' : 'pointer', fontSize: '12px',
                }}
              >›</button>
              <button
                onClick={() => setPage(pages)}
                disabled={page === pages}
                style={{
                  background: 'rgba(255,255,255,0.05)', color: page === pages ? '#333' : '#a0a0a0',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                  padding: '5px 11px', cursor: page === pages ? 'not-allowed' : 'pointer', fontSize: '12px',
                }}
              >»</button>

              <span style={{ color: '#404040', fontSize: '11px', marginLeft: '6px' }}>
                {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} / {total}
              </span>
            </div>
          )}

        </div>
      </section>
    </Layout>
  );
}
