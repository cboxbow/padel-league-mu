import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Users, ChevronRight, LayoutGrid, Trophy, MapPin } from 'lucide-react';
import { Layout, GlassCard, CategoryBadge, RegionBadge } from '@/components/Layout';
import { DotWaveBackground } from '@/components/DotWaveBackground';
import { useI18n } from '@/hooks/useI18n';
import { ROUTE_PATHS, MPL_STATS, CATEGORY_CONFIG, REGION_CONFIG } from '@/lib/index';
import { useSeo } from '@/hooks/useSeo';
import { useClubs, useTournamentStats } from '@/hooks/useData';
import type { TournamentCategory, Region } from '@/lib/index';

// ── Logo animé ────────────────────────────────────────────────────────────────
function HeroLogo() {
  return (
    <motion.div
      initial={{ scale: 0.7, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 90, damping: 18, delay: 0.2 }}
      style={{ marginBottom: '36px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px' }}
    >
      {/* Logo MSRA (fédération de tutelle) + logo principal MPL — lockup officiel
          unique (même fichier source que MPL MSRA.png) pour garantir l'alignement
          et les proportions relatives exacts entre les deux marques. */}
      <img
        src="/images/mpl-msra-combo.png"
        alt="Mauritius Squash Rackets Association — Mauritius Padel League"
        style={{ width: 'min(440px, 90vw)', height: 'auto', filter: 'drop-shadow(0 0 22px rgba(74,213,105,0.25))' }}
      />
      {/* ── Bandeau titre sponsor ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '32px',
        padding: '7px 20px 7px 14px',
        backdropFilter: 'blur(8px)',
      }}>
        <img
          src="/logos/afrasia-padel-league.png"
          alt="AfrAsia Bank Padel League"
          style={{
            height: '30px', width: 'auto', objectFit: 'contain',
            filter: 'brightness(1.05)',
          }}
        />
        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)' }} />
        <span style={{
          color: 'rgba(255,255,255,0.7)',
          fontSize: '11px', fontWeight: 600,
          letterSpacing: '1.5px', textTransform: 'uppercase',
        }}>
          Saison 2026
        </span>
      </div>
    </motion.div>
  );
}

// ── Hero Section ──────────────────────────────────────────────────────────────
function HeroSection() {
  const { t, lang } = useI18n();
  const nav = useNavigate();

  return (
    <section className="hero-section" style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '80px 24px 40px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Fallback mobile : dot-wave simple si la photo officielle est masquée (écran étroit) */}
      <DotWaveBackground variant="hero-right" opacity={0.18} animate={true} />
      {/* Fond officiel : joueur + tunnel de points, image unique fournie par le client */}
      <img
        src="/images/hero-background.png"
        alt=""
        className="hero-bg-image"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'contain', objectPosition: 'right center',
          pointerEvents: 'none', zIndex: 0,
        }}
      />
      {/* Tagline verticale gauche — décorative, hors flux i18n (slogan de marque) */}
      <div className="hero-side-text" style={{
        position: 'absolute', left: '4%', top: '50%', transform: 'translateY(-50%)',
        zIndex: 1, pointerEvents: 'none',
      }}>
        {['PLAY', 'COMPETE', 'GROW', 'TOGETHER'].map((w) => (
          <div key={w} style={{ color: 'rgba(255,255,255,0.55)', fontSize: '15px', fontWeight: 600, letterSpacing: '3px', lineHeight: 1.7 }}>{w}</div>
        ))}
        <div style={{ width: '28px', height: '2px', background: '#4ad569', margin: '14px 0 12px' }} />
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', letterSpacing: '1.5px', lineHeight: 1.6 }}>
          MORE THAN A SPORT<br />A STRONGER MAURITIUS
        </div>
      </div>
      {/* Tagline verticale droite */}
      <div className="hero-side-text" style={{
        position: 'absolute', right: '5%', bottom: '20%',
        zIndex: 1, pointerEvents: 'none', textAlign: 'right',
      }}>
        {['MAURITIUS', 'PADEL', 'FOR A BRIGHTER', 'TOMORROW'].map((w) => (
          <div key={w} style={{ color: 'rgba(255,255,255,0.45)', fontSize: '13px', fontWeight: 600, letterSpacing: '2.5px', lineHeight: 1.6 }}>{w}</div>
        ))}
        <div style={{ width: '28px', height: '2px', background: '#4ad569', margin: '10px 0 0', marginLeft: 'auto' }} />
      </div>
      <style>{`
        @media (max-width: 1100px) {
          .hero-side-text, .hero-bg-image { display: none; }
        }
        @media (min-width: 1101px) {
          .hero-section { align-items: flex-start; padding-left: 9%; }
        }
      `}</style>

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '820px' }}>
      <HeroLogo />

      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        style={{ textAlign: 'center', margin: 0, lineHeight: 1.1 }}
      >
        <span style={{ display: 'block', fontSize: 'clamp(42px,8vw,80px)', fontWeight: 900, color: 'white', letterSpacing: '-2px', textShadow: '0 2px 40px rgba(0,0,0,0.8)' }}>
          MAURITIUS
        </span>
        <span className="mpl-text-green" style={{ display: 'block', fontSize: 'clamp(42px,8vw,80px)', fontWeight: 900, letterSpacing: '-2px', filter: 'drop-shadow(0 0 32px rgba(74,213,105,0.45))' }}>
          PADEL LEAGUE
        </span>
      </motion.h1>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        <span style={{ color: 'rgba(220,220,220,0.85)', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '2px', textAlign: 'center' }}>
          {t.hero.tagline}
        </span>
        <div style={{ width: '36px', height: '2px', background: '#4ad569', marginTop: '10px' }} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        style={{ display: 'flex', gap: '16px', marginTop: '32px', flexWrap: 'wrap', justifyContent: 'center' }}
      >
        <button
          onClick={() => nav(ROUTE_PATHS.CALENDAR)}
          className="mpl-btn-primary"
          style={{ padding: '14px 28px', fontSize: '15px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Calendar size={16} /> {t.hero.cta2} <ChevronRight size={16} />
        </button>
        <button
          onClick={() => nav(ROUTE_PATHS.LEAGUE)}
          className="mpl-btn-outline"
          style={{ padding: '14px 28px', fontSize: '15px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Users size={16} /> {t.hero.cta1} <ChevronRight size={16} />
        </button>
      </motion.div>

      {/* Stats strip */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1 }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginTop: '64px', width: '100%', maxWidth: '720px' }}
      >
        {[
          { val: MPL_STATS.clubs,       label: t.hero.stats.clubs,       Icon: Users },
          { val: MPL_STATS.courts,      label: t.hero.stats.courts,      Icon: LayoutGrid },
          { val: MPL_STATS.tournaments, label: t.hero.stats.tournaments, Icon: Trophy },
          { val: MPL_STATS.regions,     label: t.hero.stats.regions,     Icon: MapPin },
        ].map((s, i) => (
          <GlassCard key={i} style={{ padding: '22px 12px', textAlign: 'center', position: 'relative' }}>
            {/* Gold accent top dot */}
            <div style={{ position: 'absolute', top: '-1px', left: '50%', transform: 'translateX(-50%)', width: '4px', height: '4px', borderRadius: '50%', background: '#c9a84c', opacity: 0.8 }} />
            <s.Icon size={18} color="#4ad569" style={{ marginBottom: '8px' }} />
            <div className="mpl-stat-num" style={{ fontSize: 'clamp(22px,3.5vw,38px)' }}>{s.val}</div>
            <div style={{ color: '#888', fontSize: '12px', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600 }}>{s.label}</div>
          </GlassCard>
        ))}
      </motion.div>
      </div>
    </section>
  );
}

// ── League Preview Section ────────────────────────────────────────────────────
function LeaguePreview() {
  const { t } = useI18n();
  const categories = Object.entries(CATEGORY_CONFIG) as [TournamentCategory, typeof CATEGORY_CONFIG[TournamentCategory]][];

  return (
    <section style={{ padding: '96px 24px', background: 'linear-gradient(180deg, #0c0c0c 0%, #0f0f0f 100%)', position: 'relative', overflow: 'hidden' }}>
      {/* Dot-wave coin sup-gauche */}
      <DotWaveBackground variant="corner-tl" opacity={0.09} animate={false} />
      {/* Dot-wave coin inf-droit */}
      <DotWaveBackground variant="corner-br" opacity={0.07} animate={false} />
      {/* Ligne de séparation haut — gradient vert→or */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(74,213,105,0.25) 40%, rgba(201,168,76,0.15) 70%, transparent 100%)' }} />
      <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <span className="mpl-badge">{t.league.badge}</span>
        </div>
        <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, color: 'white', margin: '0 0 16px', letterSpacing: '-0.5px' }}>
          {t.league.title}
        </h2>
        <p style={{ color: '#a0a0a0', fontSize: '16px', maxWidth: '680px', lineHeight: 1.7, marginBottom: '48px' }}>
          {t.league.mission}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '20px', marginBottom: '48px' }}>
          {t.league.features.map((f, i) => {
            const icons = ['🏆', '🤝', '🌱', '⚡'];
            return (
              <GlassCard key={i} style={{ padding: '28px', position: 'relative', overflow: 'hidden' }}>
                {/* Dot accent — coin inf-droit de la card */}
                <div style={{ position: 'absolute', bottom: 12, right: 12, width: 6, height: 6, borderRadius: '50%', background: '#4ad569', opacity: 0.25 }} />
                <div style={{ fontSize: '32px', marginBottom: '14px', lineHeight: 1 }}>{icons[i]}</div>
                <h3 style={{ color: 'white', fontWeight: 700, marginBottom: '10px', fontSize: '16px', letterSpacing: '-0.2px' }}>{f.title}</h3>
                <p style={{ color: '#888', fontSize: '14px', lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
              </GlassCard>
            );
          })}
        </div>

        <h3 style={{ color: '#a0a0a0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '16px' }}>
          {t.league.categories}
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {categories.map(([cat, cfg]) => (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: cfg.bg, border: `1px solid ${cfg.color}40`, borderRadius: '10px', padding: '8px 16px' }}>
              <CategoryBadge category={cat} size="md" />
              <span style={{ color: '#a0a0a0', fontSize: '13px' }}>{cfg.description_fr}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Regions Preview ───────────────────────────────────────────────────────────
function RegionsPreview() {
  const { t, lang } = useI18n();
  const { clubs: allClubs } = useClubs();
  const tournStats = useTournamentStats();

  const regions: { region: Region; clubs: number; courts: number; tournaments: number }[] = [
    { region: 'Nord',   clubs: allClubs.filter(c => c.region === 'Nord').length   || 7, courts: 28, tournaments: tournStats.byRegion.Nord   || MPL_STATS.by_region.Nord   },
    { region: 'Ouest',  clubs: allClubs.filter(c => c.region === 'Ouest').length  || 6, courts: 21, tournaments: tournStats.byRegion.Ouest  || MPL_STATS.by_region.Ouest  },
    { region: 'Centre', clubs: allClubs.filter(c => c.region === 'Centre').length || 4, courts: 13, tournaments: tournStats.byRegion.Centre || MPL_STATS.by_region.Centre },
    { region: 'Est',    clubs: allClubs.filter(c => c.region === 'Est').length    || 1, courts: 3,  tournaments: tournStats.byRegion.Est    || MPL_STATS.by_region.Est    },
  ];

  return (
    <section style={{ padding: '96px 24px', background: 'linear-gradient(180deg, #0a0a0a 0%, #0d0d0d 100%)', position: 'relative', overflow: 'hidden' }}>
      {/* Dot texture section-top */}
      <DotWaveBackground variant="section-top" opacity={0.05} animate={false} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(74,213,105,0.2) 50%, transparent 100%)' }} />
      <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>
        <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, color: 'white', margin: '0 0 8px', letterSpacing: '-0.5px' }}>
          {t.regions.title}
        </h2>
        <p style={{ color: '#a0a0a0', marginBottom: '40px' }}>{t.regions.subtitle}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '20px' }}>
          {regions.map(({ region, clubs, courts, tournaments }) => {
            const cfg = REGION_CONFIG[region];
            return (
              <GlassCard key={region} style={{ padding: '28px', borderLeft: `3px solid ${cfg.color}`, position: 'relative', overflow: 'hidden' }}>
                {/* Micro-dot en fond de la region card */}
                <div style={{ position: 'absolute', top: 10, right: 10, width: 5, height: 5, borderRadius: '50%', background: cfg.color, opacity: 0.2 }} />
                <RegionBadge region={region} lang={lang} />
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#a0a0a0', fontSize: '13px' }}>{t.regions.clubs_label}</span>
                    <span style={{ color: 'white', fontWeight: 700 }}>{clubs}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#a0a0a0', fontSize: '13px' }}>{t.regions.courts_label}</span>
                    <span style={{ color: 'white', fontWeight: 700 }}>{courts}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#a0a0a0', fontSize: '13px' }}>{t.regions.tournaments_label}</span>
                    <span style={{ color: '#4ad569', fontWeight: 700 }}>{tournaments}</span>
                  </div>
                </div>
                {/* List of clubs from Supabase */}
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {allClubs.filter(c => c.region === region).slice(0, 4).map(c => (
                    <div key={c.id} style={{ color: '#777', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: cfg.color }}>•</span> {c.name}
                    </div>
                  ))}
                  {allClubs.filter(c => c.region === region).length > 4 && (
                    <div style={{ color: '#555', fontSize: '11px', paddingLeft: '12px' }}>
                      +{allClubs.filter(c => c.region === region).length - 4} {lang === 'fr' ? 'autres clubs' : 'more clubs'}
                    </div>
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Home Page ─────────────────────────────────────────────────────────────────
export default function Home() {
  useSeo({
    title: "Mauritius Padel League 2026 — Padel Maurice",
    description: "Site officiel de la Mauritius Padel League. Tournois M25 à M1000, classements 2026, 18 clubs affiliés à Maurice. Padel à l'île Maurice.",
    keywords: "padel mauritius, padel league mauritius, tournoi padel Maurice, classement padel 2026, MPL 2026",
    canonical: "https://padelleague.mu/",
  });
  return (
    <Layout>
      <HeroSection />
      <LeaguePreview />
      <RegionsPreview />
    </Layout>
  );
}
