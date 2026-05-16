/**
 * Galerie.tsx — MPL Photo Gallery — PRODUCTION v6.0
 * ─────────────────────────────────────────────────
 * RÈGLE ABSOLUE : ZÉRO donnée fictive. ZÉRO FALLBACK_PHOTOS.
 *
 * CAS 1 — Supabase non configuré (env vars absentes)
 *         → "Galerie momentanément indisponible."
 *
 * CAS 2 — Erreur Supabase (RLS / réseau / clé invalide)
 *         → "Impossible de charger les photos pour le moment."
 *
 * CAS 3 — Supabase OK, aucune photo publiée
 *         → "Aucune photo publiée disponible pour le moment."
 *
 * CAS 4 — Supabase OK, données réelles disponibles
 *         → Grille complète : M500 + M1000 + Mixte + Junior
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, Camera, Trophy, Calendar, MapPin,
  ChevronDown, RefreshCw, Search, WifiOff, ImageOff,
} from 'lucide-react';
import { Layout, GlassCard } from '@/components/Layout';
import { useI18n } from '@/hooks/useI18n';
import { useSeo } from '@/hooks/useSeo';
import { getSupabaseClient, isSupabaseConnected } from '@/lib/supabase';
import { normalizeJuniorCategory, normalizeTournamentDisplayName } from '@/lib/tournamentNames';

// ─────────────────────────────────────────────────────────────────────────────
// Type
// ─────────────────────────────────────────────────────────────────────────────
export interface TournamentPhoto {
  id: string;
  tournament_name: string;
  category: string;       // M500 | M1000 | Mixed | Junior
  division: string;       // men | women | mixed | junior
  winner_names: string[];
  photo_date: string;
  caption?: string;
  image_url: string;
  storage_path?: string;
  region?: string;
  club_name?: string;
  is_published: boolean;
  display_order: number;
  created_at?: string;
}

type RawTournamentPhoto = Partial<Record<keyof TournamentPhoto, unknown>>;

// ─────────────────────────────────────────────────────────────────────────────
// Union discriminante — un seul état à la fois
// ─────────────────────────────────────────────────────────────────────────────
type PageState =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }                    // CAS 1
  | { kind: 'error'; msg: string }              // CAS 2
  | { kind: 'empty' }                           // CAS 3
  | { kind: 'ok'; photos: TournamentPhoto[] };  // CAS 4

// ─────────────────────────────────────────────────────────────────────────────
// Constantes visuelles
// ─────────────────────────────────────────────────────────────────────────────
const DIV_META: Record<string, { fr: string; en: string; color: string }> = {
  men:    { fr: 'Hommes', en: 'Men',    color: '#60a5fa' },
  women:  { fr: 'Dames',  en: 'Women',  color: '#f472b6' },
  mixed:  { fr: 'Mixte',  en: 'Mixed',  color: '#a78bfa' },
  junior: { fr: 'Junior', en: 'Junior', color: '#4ade80' },
};

// Couleurs officielles MPL par catégorie (M500 violet · M1000 rouge élite)
const CAT_COLORS: Record<string, string> = {
  M500:   '#8b5cf6',
  M1000:  '#dc2626',
  Mixed:  '#a78bfa',
  Junior: '#4ade80',
};

// Badges M1000 : style élite avec étoile
const CAT_ELITE: Record<string, boolean> = {
  M1000: true,
};

const PHOTO_COLUMNS = `
  id,
  tournament_name,
  category,
  division,
  winner_names,
  photo_date,
  caption,
  image_url,
  storage_path,
  region,
  club_name,
  is_published,
  display_order,
  created_at
`;

function fmtDate(d: string, lang: string): string {
  try {
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return d;
    return date.toLocaleDateString(
      lang === 'fr' ? 'fr-FR' : 'en-GB',
      { day: 'numeric', month: 'long', year: 'numeric' }
    );
  } catch { return d; }
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return toStringArray(parsed);
    } catch {
      // Plain text fallback below.
    }

    return trimmed
      .split(/[;,]/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizePhoto(row: RawTournamentPhoto): TournamentPhoto | null {
  const id = optionalString(row.id);
  const tournamentName = optionalString(row.tournament_name);
  const category = optionalString(row.category);
  const division = optionalString(row.division);
  const photoDate = optionalString(row.photo_date);
  const imageUrl = optionalString(row.image_url);

  if (!id || !tournamentName || !category || !division || !photoDate || !imageUrl) {
    return null;
  }

  const displayOrder =
    typeof row.display_order === 'number' && Number.isFinite(row.display_order)
      ? row.display_order
      : 0;

  return {
    id,
    tournament_name: normalizeTournamentDisplayName(tournamentName, optionalString(row.club_name)),
    category: normalizeJuniorCategory(category),
    division,
    winner_names: toStringArray(row.winner_names),
    photo_date: photoDate,
    caption: optionalString(row.caption),
    image_url: imageUrl,
    storage_path: optionalString(row.storage_path),
    region: optionalString(row.region),
    club_name: optionalString(row.club_name),
    is_published: row.is_published === true,
    display_order: displayOrder,
    created_at: optionalString(row.created_at),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant : Messages d'état (CAS 1 / 2 / 3)
// ─────────────────────────────────────────────────────────────────────────────
function StatusMessage({
  state, lang, onRetry,
}: {
  state: Extract<PageState, { kind: 'unconfigured' | 'error' | 'empty' }>;
  lang: string;
  onRetry: () => void;
}) {
  const fr = lang === 'fr';

  const cfg = {
    unconfigured: {
      Icon:     WifiOff,
      heading:  fr ? 'Galerie momentanément indisponible.' : 'Gallery temporarily unavailable.',
      sub:      fr ? 'Le service photo sera disponible très prochainement.' : 'The photo service will be available soon.',
      badge:    { label: 'Non configuré', bg: 'rgba(85,85,85,0.12)', border: 'rgba(85,85,85,0.3)', text: '#555' },
      canRetry: false,
    },
    error: {
      Icon:     WifiOff,
      heading:  fr ? 'Impossible de charger les photos pour le moment.' : 'Unable to load photos at the moment.',
      sub:      fr ? 'Merci de réessayer dans quelques instants.' : 'Please try again in a few moments.',
      badge:    { label: 'Erreur', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', text: '#ef4444' },
      canRetry: true,
    },
    empty: {
      Icon:     ImageOff,
      heading:  fr ? 'Aucune photo publiée disponible pour le moment.' : 'No published photos available at the moment.',
      sub:      fr
        ? 'Les photos des tournois M500 et M1000 seront publiées ici dès leur homologation.'
        : 'Photos from M500 and M1000 tournaments will appear here once validated.',
      badge:    { label: 'Vide', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', text: '#f59e0b' },
      canRetry: false,
    },
  }[state.kind];

  const errMsg = state.kind === 'error' ? state.msg : '';

  return (
    <div style={{ maxWidth: '520px', margin: '64px auto 0', padding: '0 16px' }}>
      <GlassCard style={{ padding: '64px 32px', textAlign: 'center' }}>
        <div style={{ marginBottom: '20px' }}>
          <cfg.Icon size={40} color="#333" strokeWidth={1.5} />
        </div>
        <p style={{ color: '#d0d0d0', fontWeight: 700, fontSize: '15px', lineHeight: 1.65, margin: '0 0 10px' }}>
          {cfg.heading}
        </p>
        <p style={{ color: '#555', fontSize: '13px', lineHeight: 1.75, margin: '0 0 24px' }}>
          {cfg.sub}
        </p>
        <span style={{
          display: 'inline-block',
          background: cfg.badge.bg, border: `1px solid ${cfg.badge.border}`,
          color: cfg.badge.text, borderRadius: '20px', padding: '3px 16px',
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px',
        }}>
          {cfg.badge.label}
        </span>
        {errMsg && (
          <p style={{
            color: '#282828', fontSize: '10px', fontFamily: 'monospace',
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
            borderRadius: '6px', padding: '8px 12px',
            margin: '16px 0 0', textAlign: 'left', wordBreak: 'break-all', lineHeight: 1.65,
          }}>{errMsg}</p>
        )}
        {cfg.canRetry && (
          <button onClick={onRetry} style={{
            marginTop: '20px', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', color: '#888', borderRadius: '8px',
            padding: '9px 22px', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 500,
          }}>
            <RefreshCw size={13} />
            {fr ? 'Réessayer' : 'Retry'}
          </button>
        )}
      </GlassCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant : Lightbox
// ─────────────────────────────────────────────────────────────────────────────
function Lightbox({ photo, lang, onClose, onPrev, onNext }: {
  photo: TournamentPhoto; lang: string;
  onClose: () => void; onPrev: () => void; onNext: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowLeft')  onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, onPrev, onNext]);

  const div     = DIV_META[photo.division] ?? { fr: photo.division, en: photo.division, color: '#a0a0a0' };
  const cc      = CAT_COLORS[photo.category] ?? '#8b5cf6';
  const isElite = CAT_ELITE[photo.category] ?? false;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.94)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      {/* Prev */}
      <button onClick={e => { e.stopPropagation(); onPrev(); }} style={{
        position: 'fixed', left: '12px', top: '50%', transform: 'translateY(-50%)',
        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
        color: 'white', borderRadius: '50%', width: '46px', height: '46px',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '24px', zIndex: 10,
      }}>‹</button>
      {/* Next */}
      <button onClick={e => { e.stopPropagation(); onNext(); }} style={{
        position: 'fixed', right: '12px', top: '50%', transform: 'translateY(-50%)',
        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
        color: 'white', borderRadius: '50%', width: '46px', height: '46px',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '24px', zIndex: 10,
      }}>›</button>
      {/* Close */}
      <button onClick={onClose} style={{
        position: 'fixed', top: '16px', right: '16px',
        background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
        borderRadius: '50%', width: '40px', height: '40px',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
      }}><X size={18} /></button>

      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: '920px', width: '100%', background: '#141414',
        borderRadius: '16px', overflow: 'hidden',
        border: `1px solid ${isElite ? 'rgba(220,38,38,0.3)' : 'rgba(255,255,255,0.08)'}`,
      }}>
        <img src={photo.image_url} alt={photo.tournament_name}
          style={{ width: '100%', maxHeight: '520px', objectFit: 'cover', display: 'block' }} />
        <div style={{ padding: '22px 26px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{
              background: `${cc}22`, color: cc,
              borderRadius: '6px', padding: '3px 11px', fontSize: '12px', fontWeight: 800,
              border: isElite ? `1px solid ${cc}50` : 'none',
            }}>
              {photo.category}{isElite ? ' ★' : ''}
            </span>
            <span style={{
              background: `${div.color}22`, color: div.color,
              borderRadius: '6px', padding: '3px 11px', fontSize: '12px', fontWeight: 700,
            }}>
              {lang === 'fr' ? div.fr : div.en}
            </span>
            {photo.region && (
              <span style={{ color: '#555', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MapPin size={11} /> {photo.region}
              </span>
            )}
          </div>
          <h2 style={{ color: 'white', fontWeight: 900, fontSize: '19px', margin: '0 0 8px', lineHeight: 1.3 }}>
            {photo.tournament_name}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#C9A84C', fontWeight: 700, fontSize: '14px', marginBottom: '10px' }}>
            <Trophy size={14} /> {photo.winner_names.join(' · ')}
          </div>
          {photo.caption && (
            <p style={{ color: '#888', fontSize: '13px', margin: '0 0 10px', lineHeight: 1.6 }}>{photo.caption}</p>
          )}
          <div style={{ display: 'flex', gap: '14px', color: '#444', fontSize: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={11} /> {fmtDate(photo.photo_date, lang)}
            </span>
            {photo.club_name && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MapPin size={11} /> {photo.club_name}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant : Card photo
// ─────────────────────────────────────────────────────────────────────────────
function PhotoCard({ photo, lang, onClick }: {
  photo: TournamentPhoto; lang: string; onClick: () => void;
}) {
  const [hover,  setHover]  = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const div     = DIV_META[photo.division] ?? { fr: photo.division, en: photo.division, color: '#a0a0a0' };
  const cc      = CAT_COLORS[photo.category] ?? '#8b5cf6';
  const isElite = CAT_ELITE[photo.category] ?? false;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: 'pointer', borderRadius: '12px', overflow: 'hidden', background: '#141414',
        border: `1px solid ${hover
          ? (isElite ? 'rgba(220,38,38,0.5)' : 'rgba(201,168,76,0.35)')
          : (isElite ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.06)')}`,
        transition: 'transform .25s, box-shadow .25s, border-color .25s',
        transform: hover ? 'translateY(-5px)' : 'none',
        boxShadow: hover
          ? (isElite ? '0 14px 40px rgba(220,38,38,0.2)' : '0 14px 40px rgba(0,0,0,0.55)')
          : '0 2px 10px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden', background: '#1a1a1a' }}>
        {imgErr ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', color: '#333', gap: '8px' }}>
            <Camera size={30} />
            <span style={{ fontSize: '11px' }}>{lang === 'fr' ? 'Image indisponible' : 'Image unavailable'}</span>
          </div>
        ) : (
          <img src={photo.image_url} alt={photo.tournament_name}
            onError={() => setImgErr(true)}
            style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              transition: 'transform .35s', transform: hover ? 'scale(1.06)' : 'scale(1)',
            }} />
        )}
        <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '6px' }}>
          <span style={{
            background: `${cc}e8`, color: 'white',
            borderRadius: '6px', padding: '3px 9px', fontSize: '11px', fontWeight: 900,
            backdropFilter: 'blur(4px)',
            border: isElite ? '1px solid rgba(255,255,255,0.3)' : 'none',
          }}>
            {photo.category}{isElite ? ' ★' : ''}
          </span>
          <span style={{
            background: `${div.color}d0`, color: '#0a0a0a',
            borderRadius: '6px', padding: '3px 9px', fontSize: '11px', fontWeight: 700,
            backdropFilter: 'blur(4px)',
          }}>
            {lang === 'fr' ? div.fr : div.en}
          </span>
        </div>
        {hover && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.32)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Trophy size={38} color={isElite ? '#ef4444' : '#C9A84C'} />
          </div>
        )}
      </div>

      <div style={{ padding: '14px 16px' }}>
        <h3 style={{ color: 'white', fontWeight: 800, fontSize: '13px', margin: '0 0 7px',
          lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {photo.tournament_name}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px',
          color: '#C9A84C', fontWeight: 700, fontSize: '12px', marginBottom: '7px', overflow: 'hidden' }}>
          <Trophy size={11} style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {photo.winner_names.join(' · ')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: '#444', fontSize: '11px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Calendar size={10} /> {fmtDate(photo.photo_date, lang)}
          </span>
          {photo.region && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <MapPin size={10} /> {photo.region}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant : Select filtre
// ─────────────────────────────────────────────────────────────────────────────
function FilterSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: { val: string; label: string }[]; placeholder: string;
}) {
  const active = value !== 'all';
  return (
    <div style={{ position: 'relative' }}>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        appearance: 'none',
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${active ? 'rgba(201,168,76,0.5)' : 'rgba(255,255,255,0.1)'}`,
        color: active ? '#C9A84C' : '#a0a0a0',
        borderRadius: '8px', padding: '8px 30px 8px 12px',
        fontSize: '13px', cursor: 'pointer', minWidth: '128px', outline: 'none',
      }}>
        <option value="all">{placeholder}</option>
        {options.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
      </select>
      <ChevronDown size={13} style={{
        position: 'absolute', right: '10px', top: '50%',
        transform: 'translateY(-50%)', color: '#555', pointerEvents: 'none',
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page principale
// ─────────────────────────────────────────────────────────────────────────────
export default function Galerie() {
  const { lang } = useI18n();
  const fr = lang === 'fr';

  useSeo({
    title:       fr ? 'Galerie Photos — MPL 2026' : 'Photo Gallery — MPL 2026',
    description: fr
      ? 'Galerie officielle des vainqueurs des tournois M500 et M1000 de la Mauritius Padel League 2026. Hommes, Dames, Mixte, Junior.'
      : 'Official winners gallery of M500 and M1000 tournaments of the Mauritius Padel League 2026. Men, Women, Mixed, Junior.',
    keywords: 'padel mauritius galerie photos vainqueurs M500 M1000 MPL 2026',
  });

  // ── État principal ───────────────────────────────────────────────────────
  const [pageState,   setPageState]   = useState<PageState>({ kind: 'loading' });
  const [divFilter,   setDivFilter]   = useState('all');
  const [catFilter,   setCatFilter]   = useState('all');
  const [regFilter,   setRegFilter]   = useState('all');
  const [search,      setSearch]      = useState('');
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // ── Fetch Supabase — ZÉRO FALLBACK, ZÉRO DONNÉES FICTIVES ───────────────
  const loadPhotos = useCallback(async () => {
    setPageState({ kind: 'loading' });

    // CAS 1 — Variables d'env absentes
    if (!isSupabaseConnected()) {
      console.warn('[Galerie] CAS 1 — Supabase non configuré');
      setPageState({ kind: 'unconfigured' });
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) {
      console.warn('[Galerie] CAS 1 — getSupabaseClient() null');
      setPageState({ kind: 'unconfigured' });
      return;
    }

    console.info('[Galerie] Chargement M500 + M1000 depuis Supabase…');

    try {
      const { data, error, status } = await (sb
        .from('tournament_photos')
        .select(PHOTO_COLUMNS)
        .eq('is_published', true)
        .order('display_order', { ascending: true })
        .order('photo_date', { ascending: false }) as unknown as Promise<{
          data: RawTournamentPhoto[] | null;
          error: { message: string; hint?: string; code?: string } | null;
          status: number;
          statusText: string;
        }>);

      console.info('[Galerie]', { status, rows: data?.length ?? 0, error: !!error });

      // CAS 2 — Erreur Supabase
      if (error) {
        let msg = `[HTTP ${status}] ${error.message}`;
        if (status === 401 || error.message?.includes('permission denied'))
          msg = '[401] Permission refusée — vérifiez les policies RLS (anon SELECT)';
        else if (status === 403)
          msg = '[403] Clé ANON invalide ou GRANT SELECT manquant';
        else if (status === 0 || error.message?.includes('Failed to fetch'))
          msg = 'Réseau inaccessible — vérifiez VITE_SUPABASE_URL';
        else if (error.hint)
          msg += ` (hint: ${error.hint})`;
        console.error('[Galerie] CAS 2 —', msg);
        setPageState({ kind: 'error', msg });
        return;
      }

      // CAS 3 — Table vide
      if (!data || data.length === 0) {
        console.info('[Galerie] CAS 3 — 0 photos publiées');
        setPageState({ kind: 'empty' });
        return;
      }

      // CAS 4 — Données réelles ✅
      const photos = data.map(normalizePhoto).filter((photo): photo is TournamentPhoto => photo !== null);
      if (photos.length === 0) {
        console.info('[Galerie] CAS 3 — aucune photo publiable après normalisation');
        setPageState({ kind: 'empty' });
        return;
      }

      console.info(`[Galerie] CAS 4 ✅ — ${photos.length} photo(s)`);
      setPageState({ kind: 'ok', photos });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Galerie] Exception:', msg);
      setPageState({ kind: 'error', msg: `Exception: ${msg}` });
    }
  }, []);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  // ── Données dérivées ─────────────────────────────────────────────────────
  const allPhotos = useMemo(
    () => pageState.kind === 'ok' ? pageState.photos : [],
    [pageState]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPhotos.filter(p => {
      if (divFilter !== 'all' && p.division !== divFilter) return false;
      if (catFilter !== 'all' && p.category !== catFilter) return false;
      if (regFilter !== 'all' && p.region   !== regFilter) return false;
      if (q) {
        const hay = [p.tournament_name, ...(p.winner_names ?? []), p.caption ?? '', p.club_name ?? '']
          .join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allPhotos, divFilter, catFilter, regFilter, search]);

  const categories = useMemo(() => [...new Set(allPhotos.map(p => p.category))].sort(), [allPhotos]);
  const regions    = useMemo(
    () => [...new Set(allPhotos.map(p => p.region).filter(Boolean))].sort() as string[],
    [allPhotos]
  );

  const stats = useMemo(() => ({
    total:  allPhotos.length,
    m500:   allPhotos.filter(p => p.category === 'M500').length,
    m1000:  allPhotos.filter(p => p.category === 'M1000').length,
    men:    allPhotos.filter(p => p.division === 'men').length,
    women:  allPhotos.filter(p => p.division === 'women').length,
    mixed:  allPhotos.filter(p => p.division === 'mixed').length,
    junior: allPhotos.filter(p => p.division === 'junior').length,
  }), [allPhotos]);

  const isSuccess    = pageState.kind === 'ok';
  const hasFilters   = divFilter !== 'all' || catFilter !== 'all' || regFilter !== 'all' || !!search.trim();
  const clearFilters = () => { setDivFilter('all'); setCatFilter('all'); setRegFilter('all'); setSearch(''); };

  const sourceBadge = {
    ok:           { label: '🟢 Supabase',     color: '#4ade80' },
    error:        { label: '🔴 Erreur',        color: '#ef4444' },
    empty:        { label: '🟡 Vide',          color: '#f59e0b' },
    unconfigured: { label: '⚪ Non configuré', color: '#555'    },
    loading:      null,
  }[pageState.kind];

  // ── Rendu ────────────────────────────────────────────────────────────────
  return (
    <Layout>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section style={{
        padding: '80px 24px 52px',
        background: 'linear-gradient(180deg,#0d0d0d 0%,#0a0a0a 100%)',
        borderBottom: '1px solid rgba(201,168,76,0.1)',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '10px',
            background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)',
            borderRadius: '30px', padding: '6px 18px', marginBottom: '20px',
          }}>
            <Camera size={14} color="#C9A84C" />
            <span style={{ color: '#C9A84C', fontSize: '12px', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '1.5px' }}>
              {fr ? 'Galerie Officielle · MPL 2026' : 'Official Gallery · MPL 2026'}
            </span>
          </div>

          {/* Titre */}
          <h1 style={{
            fontSize: 'clamp(28px,4vw,52px)', fontWeight: 900, color: 'white',
            margin: '0 0 18px', lineHeight: 1.1,
          }}>
            {fr ? '🏆 Galerie des Vainqueurs' : '🏆 Winners Gallery'}
          </h1>

          {/* Texte premium — M500 + M1000 en couleurs distinctes */}
          <p style={{ color: '#a0a0a0', fontSize: '15px', maxWidth: '720px', lineHeight: 1.9, margin: '0 0 36px' }}>
            {fr ? (
              <>
                Plongez au cœur des moments forts de la{' '}
                <strong style={{ color: '#C9A84C', fontWeight: 700 }}>Mauritius Padel League</strong>{' '}
                à travers la galerie officielle des vainqueurs des tournois{' '}
                <strong style={{ color: '#8b5cf6' }}>M500</strong>{' '}
                et <strong style={{ color: '#dc2626' }}>M1000</strong>.{' '}
                Ces images capturent l'excellence, la passion et la performance des meilleurs joueurs
                dans les catégories <em>Hommes, Dames, Mixte</em> et <em>Junior</em>.
              </>
            ) : (
              <>
                Dive into the defining moments of the{' '}
                <strong style={{ color: '#C9A84C', fontWeight: 700 }}>Mauritius Padel League</strong>{' '}
                through the official winners gallery of{' '}
                <strong style={{ color: '#8b5cf6' }}>M500</strong>{' '}
                and <strong style={{ color: '#dc2626' }}>M1000</strong> tournaments.{' '}
                These images capture the excellence, passion and performance of the best players
                across the <em>Men, Women, Mixed</em> and <em>Junior</em> categories.
              </>
            )}
          </p>

          {/* Stats héro — uniquement si données réelles */}
          {isSuccess && (
            <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
              {[
                { val: stats.total,  label: fr ? 'Photos' : 'Photos',  color: '#C9A84C' },
                { val: stats.m500,   label: 'M500',                     color: '#8b5cf6' },
                { val: stats.m1000,  label: 'M1000',                    color: '#dc2626' },
                { val: stats.men,    label: fr ? 'Hommes' : 'Men',     color: '#60a5fa' },
                { val: stats.women,  label: fr ? 'Dames'  : 'Women',   color: '#f472b6' },
                { val: stats.mixed,  label: fr ? 'Mixte'  : 'Mixed',   color: '#a78bfa' },
                { val: stats.junior, label: 'Junior',                   color: '#4ade80' },
              ].filter(s => s.val > 0).map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ color: s.color, fontWeight: 900, fontSize: '28px', lineHeight: 1 }}>{s.val}</div>
                  <div style={{ color: '#444', fontSize: '11px', textTransform: 'uppercase',
                    letterSpacing: '1px', marginTop: '4px' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── BARRE FILTRES (CAS 4 seulement) ──────────────────────────────── */}
      {isSuccess && (
        <section style={{
          background: '#0d0d0d', padding: '14px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto',
            display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>

            {/* Recherche */}
            <div style={{ position: 'relative', flex: 1, minWidth: '180px', maxWidth: '280px' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%',
                transform: 'translateY(-50%)', color: '#555', pointerEvents: 'none' }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={fr ? 'Rechercher…' : 'Search…'}
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                  color: 'white', padding: '8px 12px 8px 34px',
                  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                }} />
            </div>

            {/* Filtre Division */}
            <FilterSelect
              value={divFilter} onChange={setDivFilter}
              placeholder={fr ? 'Division' : 'Division'}
              options={[
                { val: 'men',    label: fr ? 'Hommes' : 'Men'   },
                { val: 'women',  label: fr ? 'Dames'  : 'Women' },
                { val: 'mixed',  label: fr ? 'Mixte'  : 'Mixed' },
                { val: 'junior', label: 'Junior' },
              ]}
            />

            {/* Filtre Catégorie — dynamique depuis les données réelles */}
            <FilterSelect
              value={catFilter} onChange={setCatFilter}
              placeholder={fr ? 'Catégorie' : 'Category'}
              options={categories.map(c => ({
                val: c,
                label: c === 'M1000' ? 'M1000 ★ Élite' : c,
              }))}
            />

            {/* Filtre Région */}
            {regions.length > 0 && (
              <FilterSelect
                value={regFilter} onChange={setRegFilter}
                placeholder={fr ? 'Région' : 'Region'}
                options={regions.map(r => ({ val: r, label: r }))}
              />
            )}

            {hasFilters && (
              <button onClick={clearFilters} style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                color: '#ef4444', borderRadius: '8px', padding: '8px 14px',
                fontSize: '12px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
              }}>
                ✕ {fr ? 'Réinitialiser' : 'Reset'}
              </button>
            )}

            {/* Badge source Supabase */}
            {sourceBadge && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '11px', userSelect: 'none' }}>
                <span style={{ color: sourceBadge.color }}>{sourceBadge.label}</span>
                <button onClick={loadPhotos} title={fr ? 'Rafraîchir' : 'Refresh'} style={{
                  background: 'none', border: 'none', color: '#444',
                  cursor: 'pointer', padding: '2px', display: 'flex',
                }}>
                  <RefreshCw size={12} />
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── CONTENU ──────────────────────────────────────────────────────── */}
      <section style={{ padding: '40px 24px 80px', background: '#0a0a0a', minHeight: '60vh' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

          {/* Loading */}
          {pageState.kind === 'loading' && (
            <div style={{ textAlign: 'center', padding: '100px 0', color: '#555' }}>
              <div style={{
                width: '28px', height: '28px',
                border: '3px solid #1a1a1a', borderTopColor: '#444',
                borderRadius: '50%', animation: 'spin 1s linear infinite',
                margin: '0 auto 16px',
              }} />
              <div style={{ fontSize: '14px' }}>
                {fr ? 'Chargement de la galerie M500 & M1000…' : 'Loading M500 & M1000 gallery…'}
              </div>
            </div>
          )}

          {/* CAS 1 — Non configuré */}
          {pageState.kind === 'unconfigured' && (
            <StatusMessage state={pageState} lang={lang} onRetry={loadPhotos} />
          )}

          {/* CAS 2 — Erreur */}
          {pageState.kind === 'error' && (
            <StatusMessage state={pageState} lang={lang} onRetry={loadPhotos} />
          )}

          {/* CAS 3 — Vide */}
          {pageState.kind === 'empty' && (
            <StatusMessage state={pageState} lang={lang} onRetry={loadPhotos} />
          )}

          {/* CAS 4 — Données réelles uniquement ✅ */}
          {pageState.kind === 'ok' && (
            <>
              <div style={{ color: '#444', fontSize: '13px', marginBottom: '24px',
                display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{filtered.length} {fr ? 'photo(s)' : 'photo(s)'}</span>
                {filtered.length !== allPhotos.length && (
                  <span style={{ color: '#333' }}>
                    · {fr ? `sur ${allPhotos.length} au total` : `of ${allPhotos.length} total`}
                  </span>
                )}
              </div>

              {filtered.length === 0 ? (
                <GlassCard style={{ padding: '64px', textAlign: 'center' }}>
                  <Search size={36} color="#333" style={{ marginBottom: '14px' }} />
                  <div style={{ color: '#555', fontSize: '15px', marginBottom: '18px' }}>
                    {fr ? 'Aucune photo ne correspond à ces filtres.' : 'No photos match the current filters.'}
                  </div>
                  <button onClick={clearFilters} style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#a0a0a0', borderRadius: '8px', padding: '9px 22px', cursor: 'pointer', fontSize: '13px',
                  }}>
                    {fr ? 'Réinitialiser les filtres' : 'Clear filters'}
                  </button>
                </GlassCard>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '20px',
                }}>
                  {filtered.map((photo, idx) => (
                    <PhotoCard key={photo.id} photo={photo} lang={lang} onClick={() => setLightboxIdx(idx)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── LIGHTBOX ─────────────────────────────────────────────────────── */}
      {lightboxIdx !== null && filtered[lightboxIdx] && (
        <Lightbox
          photo={filtered[lightboxIdx]}
          lang={lang}
          onClose={() => setLightboxIdx(null)}
          onPrev={() => setLightboxIdx(i => i !== null ? (i - 1 + filtered.length) % filtered.length : null)}
          onNext={() => setLightboxIdx(i => i !== null ? (i + 1) % filtered.length : null)}
        />
      )}
    </Layout>
  );
}
