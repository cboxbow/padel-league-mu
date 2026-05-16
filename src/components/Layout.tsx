import { useState, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, X, ChevronRight } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { ROUTE_PATHS, REGION_CONFIG, CATEGORY_CONFIG, MPL_STATS } from '@/lib/index';
import type { Region, TournamentCategory, Language } from '@/lib/index';
import { DotWaveBackground, DotDivider } from '@/components/DotWaveBackground';

// Mode public : lien Admin masqué dans la navigation (VITE_PUBLIC_MODE=true au build)
const IS_PUBLIC_MODE = __IS_PUBLIC_BUILD__ || import.meta.env.VITE_PUBLIC_MODE === 'true';

// ── MPL Logo (vraie image) ─────────────────────────────────────────────────────
export function MPLLogo({ size = 40 }: { size?: number }) {
  // Logo transparent 670×441 → ratio paysage ~1.52
  const width = Math.round(size * (670 / 441));
  return (
    <img
      src="/images/mpl-logo.png"
      alt="Mauritius Padel League"
      width={width}
      height={size}
      style={{ objectFit: 'contain', display: 'block' }}
    />
  );
}

// ── Category Badge ────────────────────────────────────────────────────────────
export function CategoryBadge({ category, size = 'sm' }: { category: TournamentCategory | string; size?: 'xs' | 'sm' | 'md' }) {
  // Normaliser : 'M 25' → 'M25', null/undefined → fallback
  const normalized = (category ?? '').toString().replace(/\s/g, '').toUpperCase() as TournamentCategory;
  const cfg = CATEGORY_CONFIG[normalized] ?? { label: category || '?', color: '#4ad569', bg: 'rgba(74,213,105,0.15)' };
  const pad = size === 'xs' ? '2px 6px' : size === 'md' ? '4px 12px' : '3px 8px';
  const fs  = size === 'xs' ? '10px' : size === 'md' ? '13px' : '11px';
  return (
    <span style={{
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40`,
      borderRadius: '6px', padding: pad, fontSize: fs, fontWeight: 700, letterSpacing: '0.5px',
    }}>
      {cfg.label}
    </span>
  );
}

// ── Region Badge ──────────────────────────────────────────────────────────────
export function RegionBadge({ region, lang = 'fr' }: { region: string; lang?: string }) {
  const cfg = REGION_CONFIG[region as Region] ?? { color: '#4ad569', bg: 'rgba(74,213,105,0.15)', name_en: region };
  const label = lang === 'en' ? cfg.name_en : region;
  return (
    <span style={{
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40`,
      borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 600,
    }}>
      {label}
    </span>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status, lang = 'fr' }: { status: string; lang?: string }) {
  const cfg: Record<string, { fr: string; en: string; color: string; bg: string }> = {
    open:      { fr: 'Ouvert',   en: 'Open',        color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
    closed:    { fr: 'Fermé',    en: 'Closed',      color: '#ef4444', bg: 'rgba(239,68,68,0.15)'  },
    soon:      { fr: 'Bientôt',  en: 'Coming Soon', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
    ongoing:   { fr: 'En cours', en: 'Ongoing',     color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
    completed: { fr: 'Terminé',  en: 'Completed',   color: '#a0a0a0', bg: 'rgba(160,160,160,0.15)'},
  };
  const c = cfg[status] ?? cfg.soon;
  return (
    <span style={{
      background: c.bg, color: c.color, border: `1px solid ${c.color}40`,
      borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 700,
    }}>
      {lang === 'en' ? c.en : c.fr}
    </span>
  );
}

// ── Trend Arrow ───────────────────────────────────────────────────────────────
export function TrendArrow({ trend }: { trend: 'up' | 'down' | 'same' }) {
  if (trend === 'up')   return <span style={{ color: '#4ad569', fontSize: '14px' }}>▲</span>;
  if (trend === 'down') return <span style={{ color: '#ef4444', fontSize: '14px' }}>▼</span>;
  return <span style={{ color: '#a0a0a0', fontSize: '14px' }}>—</span>;
}

// ── Rank Medal ────────────────────────────────────────────────────────────────
export function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ fontSize: '20px' }}>🏆</span>;
  if (rank === 2) return <span style={{ fontSize: '20px' }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: '20px' }}>🥉</span>;
  return (
    <span style={{
      width: '28px', height: '28px', borderRadius: '50%',
      background: 'rgba(74,213,105,0.1)', border: '1px solid rgba(74,213,105,0.3)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: '#4ad569', fontWeight: 700, fontSize: '12px',
    }}>
      {rank}
    </span>
  );
}

// ── Glass Card ────────────────────────────────────────────────────────────────
export function GlassCard({
  children, className = '', style = {}, hoverable = true,
}: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties; hoverable?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`mpl-card ${className}`}
      style={{
        /* rim-light top border always visible, intensifies on hover */
        borderTop: hovered && hoverable
          ? '1px solid rgba(74,213,105,0.55)'
          : '1px solid rgba(74,213,105,0.22)',
        /* left accent line on hover — premium sport card feel */
        borderLeft: hovered && hoverable
          ? '1px solid rgba(74,213,105,0.45)'
          : '1px solid rgba(74,213,105,0.12)',
        ...style,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Shimmer highlight on hover */}
      {hovered && hoverable && (
        <div style={{
          position: 'absolute', top: 0, left: '-100%', right: 0,
          height: '1px',
          background: 'linear-gradient(90deg, transparent 0%, rgba(74,213,105,0.6) 50%, transparent 100%)',
          animation: 'shimmer 1.2s ease forwards',
          pointerEvents: 'none',
        }} />
      )}
      {children}
    </div>
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────
export function Navbar() {
  const { lang, setLang, t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { to: ROUTE_PATHS.HOME,      label: t.nav.home      },
    { to: ROUTE_PATHS.LEAGUE,    label: t.nav.league    },
    { to: ROUTE_PATHS.REGIONS,   label: t.nav.regions   },
    { to: ROUTE_PATHS.CLUBS,     label: t.nav.clubs     },
    { to: ROUTE_PATHS.CALENDAR,  label: t.nav.calendar  },
    { to: ROUTE_PATHS.RANKINGS,  label: t.nav.rankings  },
    { to: ROUTE_PATHS.RESULTS,   label: t.nav.results   },
    { to: ROUTE_PATHS.GALLERY,   label: t.nav.gallery   },
  ];

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: scrolled
        ? 'rgba(8,8,8,0.97)'
        : 'rgba(10,10,10,0.72)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderBottom: scrolled
        ? '1px solid rgba(74,213,105,0.18)'
        : '1px solid rgba(74,213,105,0.08)',
      boxShadow: scrolled
        ? '0 4px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(74,213,105,0.08)'
        : 'none',
      transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
      overflowX: 'auto' as const,
    }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '820px' }}>
        {/* Logo MPL + badge AfrAsia */}
        <Link to={ROUTE_PATHS.HOME} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <MPLLogo size={36} />
          {/* Séparateur + logo AfrAsia Bank Padel League */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '12px',
          }}>
            <img
              src="/logos/afrasia-padel-league.png"
              alt="AfrAsia Bank Padel League"
              style={{
                height: '22px', width: 'auto', objectFit: 'contain',
                filter: 'brightness(1.1)',
                opacity: 0.9,
              }}
            />
          </div>
        </Link>

        {/* Desktop links */}
        <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }} className="hidden md:flex">
          {links.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) => `mpl-nav-link${isActive ? ' active' : ''}`}
              style={({ isActive }) => ({
                padding: '7px 14px', borderRadius: '8px', textDecoration: 'none',
                fontSize: '14px', fontWeight: isActive ? 600 : 500,
                color: isActive ? '#4ad569' : 'rgba(255,255,255,0.72)',
                background: isActive ? 'rgba(74,213,105,0.08)' : 'transparent',
                transition: 'color 0.2s ease, background 0.2s ease',
                letterSpacing: '0.1px',
              })}
              onMouseEnter={e => { if (!(e.currentTarget as HTMLElement).classList.contains('active')) { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.95)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; } }}
              onMouseLeave={e => { if (!(e.currentTarget as HTMLElement).classList.contains('active')) { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.72)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; } }}
            >
              {link.label}
            </NavLink>
          ))}
          {!IS_PUBLIC_MODE && (
            <NavLink
              to={ROUTE_PATHS.ADMIN}
              className={({ isActive }) => `mpl-nav-link${isActive ? ' active' : ''}`}
              style={({ isActive }) => ({
                padding: '7px 14px', borderRadius: '8px', textDecoration: 'none',
                fontSize: '14px', fontWeight: isActive ? 600 : 500,
                color: isActive ? '#4ad569' : 'rgba(255,255,255,0.72)',
                background: isActive ? 'rgba(74,213,105,0.08)' : 'transparent',
                transition: 'color 0.2s ease, background 0.2s ease',
              })}
            >
              {t.nav.admin}
            </NavLink>
          )}
        </div>

        {/* Right side: lang toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            display: 'flex', background: 'rgba(255,255,255,0.05)',
            borderRadius: '20px', padding: '3px', border: '1px solid rgba(255,255,255,0.1)',
          }}>
            {(['fr','en'] as Language[]).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  padding: '4px 12px', borderRadius: '16px', border: 'none', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 700, transition: 'all 0.2s',
                  background: lang === l ? '#4ad569' : 'transparent',
                  color: lang === l ? '#0a0a0a' : 'rgba(255,255,255,0.5)',
                  textTransform: 'uppercase',
                }}
              >
                {l}
              </button>
            ))}
          </div>
          {/* Hamburger */}
          <button
            onClick={() => setOpen(!open)}
            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'none' }}
            className="flex md:hidden"
          >
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div style={{
          background: 'rgba(10,10,10,0.98)', padding: '16px 24px',
          borderTop: '1px solid rgba(74,213,105,0.1)',
        }}>
          {[...links, ...(!IS_PUBLIC_MODE ? [{ to: ROUTE_PATHS.ADMIN, label: t.nav.admin }] : [])].map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              style={({ isActive }) => ({
                display: 'block', padding: '12px 0', textDecoration: 'none',
                color: isActive ? '#4ad569' : 'rgba(255,255,255,0.8)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                fontWeight: isActive ? 600 : 400,
              })}
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
export function Footer() {
  const { t, lang } = useI18n();
  const links = [
    { to: ROUTE_PATHS.HOME,     label: t.nav.home     },
    { to: ROUTE_PATHS.LEAGUE,   label: t.nav.league   },
    { to: ROUTE_PATHS.REGIONS,  label: t.nav.regions  },
    { to: ROUTE_PATHS.CLUBS,    label: t.nav.clubs    },
    { to: ROUTE_PATHS.CALENDAR, label: t.nav.calendar },
    { to: ROUTE_PATHS.RANKINGS, label: t.nav.rankings },
    { to: ROUTE_PATHS.RESULTS,  label: t.nav.results  },
    { to: ROUTE_PATHS.GALLERY,  label: t.nav.gallery  },
  ];
  return (
    <footer style={{
      background: 'linear-gradient(180deg, #060606 0%, #030303 100%)',
      borderTop: '1px solid rgba(74,213,105,0.12)',
      padding: '60px 0 24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Dot-wave background — bottom-right corner */}
      <DotWaveBackground variant="corner-br" opacity={0.10} animate={false} />
      {/* Subtle top gradient line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
        background: 'linear-gradient(90deg, transparent 0%, rgba(74,213,105,0.35) 40%, rgba(201,168,76,0.2) 60%, transparent 100%)',
      }} />
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '40px', marginBottom: '48px' }}>
          {/* Col 1 */}
          <div>
            <MPLLogo size={36} />
            <p style={{ color: '#a0a0a0', fontSize: '14px', lineHeight: 1.7, marginTop: '16px', maxWidth: '240px' }}>
              {t.footer.description}
            </p>
          </div>
          {/* Col 2 */}
          <div>
            <h4 style={{ color: 'white', fontWeight: 700, marginBottom: '16px', fontSize: '15px' }}>{t.footer.navigation}</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {links.map(l => (
                <Link key={l.to} to={l.to} style={{ color: '#a0a0a0', textDecoration: 'none', fontSize: '14px', transition: 'color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#4ad569')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#a0a0a0')}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
          {/* Col 3 */}
          <div>
            <h4 style={{ color: 'white', fontWeight: 700, marginBottom: '16px', fontSize: '15px' }}>{t.footer.tournaments}</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(['M25','M50','M100','M250','M500','M1000'] as TournamentCategory[]).map(cat => (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CategoryBadge category={cat} size="xs" />
                </div>
              ))}
            </div>
          </div>
          {/* Col 4 — Contacts officiels */}
          <div>
            <h4 style={{ color: 'white', fontWeight: 700, marginBottom: '16px', fontSize: '15px' }}>{t.footer.contact}</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* ── Pascal Hoffmann / MPL ── */}
              <div>
                <p style={{ color: 'white', fontSize: '13px', fontWeight: 700, margin: '0 0 1px' }}>Pascal Hoffmann</p>
                <p style={{ color: '#4ad569', fontSize: '11px', fontWeight: 600, margin: '0 0 7px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Mauritius Padel League
                </p>
                {[
                  { icon: '📞', href: 'tel:+23059449474',           label: '+230 5944 9474' },
                  { icon: '✉️', href: 'mailto:pascal@padelleague.mu', label: 'pascal@padelleague.mu' },
                  { icon: '📍', href: null,                          label: 'C/o Urban Sport, Chemin 20 Pieds, Grand Baie, Mauritius' },
                ].map(({ icon, href, label }) => (
                  <div key={label} style={{ display: 'flex', gap: '7px', alignItems: 'flex-start', marginBottom: '5px' }}>
                    <span style={{ fontSize: '11px', marginTop: '1px', flexShrink: 0 }}>{icon}</span>
                    {href ? (
                      <a href={href} style={{ color: '#a0a0a0', fontSize: '12px', textDecoration: 'none', lineHeight: 1.4 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#4ad569')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#a0a0a0')}>{label}</a>
                    ) : (
                      <span style={{ color: '#a0a0a0', fontSize: '12px', lineHeight: 1.4 }}>{label}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* séparateur */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />

              {/* ── Mathieu Vallet / Responsable technique ── */}
              <div>
                <p style={{ color: 'white', fontSize: '13px', fontWeight: 700, margin: '0 0 1px' }}>Mathieu Vallet</p>
                <p style={{ color: '#f59e0b', fontSize: '11px', fontWeight: 600, margin: '0 0 7px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Responsable Technique
                </p>
                {[
                  { icon: '📞', href: 'tel:+23059792962',              label: '+230 5979 2962' },
                  { icon: '💬', href: 'https://wa.me/23059792962',     label: 'WhatsApp' },
                  { icon: '✉️', href: 'mailto:mathieu@padelleague.mu', label: 'mathieu@padelleague.mu' },
                ].map(({ icon, href, label }) => (
                  <div key={label} style={{ display: 'flex', gap: '7px', alignItems: 'flex-start', marginBottom: '5px' }}>
                    <span style={{ fontSize: '11px', marginTop: '1px', flexShrink: 0 }}>{icon}</span>
                    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
                      style={{ color: '#a0a0a0', fontSize: '12px', textDecoration: 'none', lineHeight: 1.4 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#f59e0b')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#a0a0a0')}>{label}</a>
                  </div>
                ))}
              </div>

              {/* séparateur */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />

              {/* ── Christian Bezandry / MSRA ── */}
              <div>
                <p style={{ color: 'white', fontSize: '13px', fontWeight: 700, margin: '0 0 1px' }}>Christian Bezandry</p>
                <p style={{ color: '#3b82f6', fontSize: '11px', fontWeight: 600, margin: '0 0 7px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {lang === 'fr' ? 'Mauritius Squash Rackets Assoc.' : 'Mauritius Squash Rackets Assoc.'}
                </p>
                {[
                  { icon: '📞', href: 'tel:+23052541007',                    label: '+230 5254 1007' },
                  { icon: '✉️', href: 'mailto:christian@padelleague.mu',      label: 'christian@padelleague.mu' },
                  { icon: '📍', href: null,                                   label: 'DGT Associates, 24 Av. des Hirondelles, Sodnac, Quatre Bornes' },
                ].map(({ icon, href, label }) => (
                  <div key={label} style={{ display: 'flex', gap: '7px', alignItems: 'flex-start', marginBottom: '5px' }}>
                    <span style={{ fontSize: '11px', marginTop: '1px', flexShrink: 0 }}>{icon}</span>
                    {href ? (
                      <a href={href} style={{ color: '#a0a0a0', fontSize: '12px', textDecoration: 'none', lineHeight: 1.4 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#3b82f6')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#a0a0a0')}>{label}</a>
                    ) : (
                      <span style={{ color: '#a0a0a0', fontSize: '12px', lineHeight: 1.4 }}>{label}</span>
                    )}
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>

        {/* ── Sponsors strip ─────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '36px' }}>

          {/* ── Titre partenaire officiel ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
            <span style={{ color: '#444', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700, flexShrink: 0 }}>
              {t.footer.partner}
            </span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
          </div>

          {/* Logo MSRA + MPL + AfrAsia Bank Padel League */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', marginBottom: '28px' }}>
            {/* MSRA / MPL */}
            <div style={{ background: '#000', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '8px 16px' }}>
              <img src="/images/MPL MSRA.png" alt="MSRA – Mauritius Padel League"
                style={{ height: '114px', width: 'auto', objectFit: 'contain' }} />
            </div>
            {/* ── AfrAsia Bank Padel League — sponsor titre mis en évidence ── */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(74,213,105,0.08) 0%, rgba(0,0,0,0.6) 100%)',
              border: '1px solid rgba(74,213,105,0.25)',
              borderRadius: '14px', padding: '16px 24px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
              position: 'relative', overflow: 'hidden',
              boxShadow: '0 0 32px rgba(74,213,105,0.08)',
            }}>
              {/* Dot accent */}
              <div style={{ position: 'absolute', top: 8, right: 8, width: 4, height: 4, borderRadius: '50%', background: '#4ad569', opacity: 0.4 }} />
              <span style={{ color: '#4ad569', fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 700 }}>
                Sponsor Titre
              </span>
              <img
                src="/logos/afrasia-padel-league.png"
                alt="AfrAsia Bank Padel League"
                style={{ height: '40px', width: 'auto', objectFit: 'contain', filter: 'brightness(1.1)' }}
              />
              <img
                src="/logos/afrasia-bank.png"
                alt="AfrAsia Bank"
                style={{ height: '28px', width: 'auto', objectFit: 'contain', filter: 'brightness(1.05)', opacity: 0.8 }}
              />
            </div>
          </div>

          {/* ── Titre sponsors ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px' }}>
            <span style={{ color: '#444', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700, flexShrink: 0 }}>
              {t.footer.sponsor}
            </span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
          </div>

          {/* ── Sponsors : 2 lignes ── */}
          {(() => {
            // Ligne 1 : sponsors premium
            const line1 = [
              { src: '/images/AFRASIA.png',       alt: 'AfrAsia Bank',    h: 84  },
              { src: '/images/SANPELLEGRINO.png', alt: 'San Pellegrino',  h: 100 },
              { src: '/images/MONT CHOISY.png',   alt: 'Mont Choisy',     h: 80  },
              { src: '/images/HEINEKEN.png',       alt: 'Heineken 0.0',   h: 100 },
              { src: '/images/LEAL.png',           alt: 'Leal Group',      h: 72  },
            ];
            // Ligne 2 : sponsors secondaires
            const line2 = [
              { src: '/images/SIS.png',            alt: 'SiS Science in Sport',      h: 84  },
              { src: '/images/SECURE SERVICE.png', alt: 'Secure Services Mauritius', h: 80  },
              { src: '/images/CRYSTAL.png',        alt: 'Crystal',                   h: 76  },
              { src: '/images/DOVE.png',           alt: 'Dove Men+Care',             h: 104 },
              { src: '/images/PADEL HOUSE.png',    alt: 'Padel House',               h: 92  },
            ];
            // Ligne 3 : partenaires
            const line3 = [
              { src: '/images/BEACHCOMBER.png',    alt: 'Beachcomber Resorts',   h: 80  },
              { src: '/images/METAL CONCEPT.png',  alt: 'Metal Concept Ltee',    h: 92  },
              { src: '/images/PROTEZ MORIS.png',   alt: 'Protez Moris',          h: 104 },
            ];
            const logoCard = ({ src, alt, h }: { src: string; alt: string; h: number }) => (
              <div key={alt} style={{
                background: '#000',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '10px',
                padding: '10px 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border-color 0.2s, opacity 0.2s',
                opacity: 0.85,
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(74,213,105,0.3)'; (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLDivElement).style.opacity = '0.85'; }}
              >
                <img src={src} alt={alt} style={{ height: `${h}px`, width: 'auto', objectFit: 'contain', display: 'block' }} />
              </div>
            );
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px' }}>
                {/* Ligne 1 — sponsors principaux */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                  {line1.map(logoCard)}
                </div>
                {/* Ligne 2 — sponsors secondaires */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                  {line2.map(logoCard)}
                </div>
                {/* Ligne 3 — partenaires */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                  {line3.map(logoCard)}
                </div>
              </div>
            );
          })()}

          {/* Copyright + réseaux sociaux */}
          <DotDivider color="#4ad569" opacity={0.2} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', paddingTop: '16px' }}>
            <p style={{ color: '#444', fontSize: '12px', margin: 0 }}>
              © 2026 Mauritius Padel League · {lang === 'fr' ? 'Tous droits réservés' : 'All rights reserved'}
            </p>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {/* Facebook */}
              <a href="https://www.facebook.com/msra.mauritius" target="_blank" rel="noopener noreferrer"
                style={{ color: '#555', transition: 'color 0.2s', textDecoration: 'none', fontSize: '13px', fontWeight: 500 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#1877f2')}
                onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
                Facebook
              </a>
              <span style={{ color: '#333' }}>·</span>
              {/* Instagram */}
              <a href="https://www.instagram.com/squash_mauritius/" target="_blank" rel="noopener noreferrer"
                style={{ color: '#555', transition: 'color 0.2s', textDecoration: 'none', fontSize: '13px', fontWeight: 500 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#e1306c')}
                onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
                Instagram
              </a>
              <span style={{ color: '#333' }}>·</span>
              {/* YouTube */}
              <a href="https://www.youtube.com/channel/UCgOrn3BlAsqyqY2G0JTT--Q" target="_blank" rel="noopener noreferrer"
                style={{ color: '#555', transition: 'color 0.2s', textDecoration: 'none', fontSize: '13px', fontWeight: 500 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ff0000')}
                onMouseLeave={e => (e.currentTarget.style.color = '#555')}>
                YouTube
              </a>
              <span style={{ color: '#333' }}>·</span>
              <span style={{ color: '#2a2a2a', fontSize: '11px' }}>
                {lang === 'fr' ? 'Propulsé par Supabase · Saison 2026' : 'Powered by Supabase · Season 2026'}
              </span>
            </div>
          </div>

        </div>
      </div>
    </footer>
  );
}

// ── Page Layout ────────────────────────────────────────────────────────────────
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'white', fontFamily: 'Inter,sans-serif', minWidth: '360px' }}>
      <Navbar />
      <main style={{ paddingTop: '64px' }}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
