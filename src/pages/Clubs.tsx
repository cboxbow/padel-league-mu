import { useState } from 'react';
import { MapPin, Phone, Users, Calendar, ChevronRight, Grid3x3, ExternalLink } from 'lucide-react';
import { DotWaveBackground } from '@/components/DotWaveBackground';
import { Layout, GlassCard, RegionBadge } from '@/components/Layout';
import { useI18n } from '@/hooks/useI18n';
import { useSeo } from '@/hooks/useSeo';
import { useClubs } from '@/hooks/useData';
import { REGION_CONFIG, MPL_STATS } from '@/lib/index';
import type { Region } from '@/lib/index';

// Emojis drapeaux régions
const REGION_EMOJI: Record<string, string> = {
  Nord: '🌊', Ouest: '🏔️', Centre: '🌿', Est: '☀️',
};

// ─── Mapping logos clubs ────────────────────────────────────────────────────
// Noms de clubs tels qu'ils existent dans mpl2026.ts (insensible à la casse)
// bg: 'dark' = zone fond noir profond | 'color' = logo coloré natif affiché tel quel
// strategy: 'transparent' = logo PNG transparent sur fond sombre (défaut)
//           'white-on-dark' = logo blanc sur fond blanc → affiché sur fond sombre CSS
const CLUB_LOGOS: {
  match: string[];
  src: string;
  bg: 'dark' | 'color';
  filter?: string;
}[] = [
  // ── Caña Beau Plan ────────────────────────────────────────────────────────
  {
    match: ['caña', 'cana padel', 'cana beau plan', 'caña beau plan'],
    src: '/logos/cana-padel.png',
    bg: 'dark',
    filter: 'brightness(1.1)',
  },
  // ── Urban Sport (Grand Baie & Black River) ────────────────────────────────
  {
    match: ['urban sport', 'urban padel'],
    src: '/logos/urban-padel.png',  // URBAN SPORT blanc+jaune sur fond noir natif
    bg: 'dark',
    filter: 'brightness(1.05) saturate(1.1)',
  },
  // ── Club Med Albion ───────────────────────────────────────────────────────
  {
    match: ['club med'],
    src: '/logos/club-med.png',
    bg: 'dark',
    filter: 'brightness(1.2)',
  },
  // ── RM Club Tamarin ───────────────────────────────────────────────────────
  {
    match: ['rm club tamarin'],
    src: '/logos/rm-tamarin.png',   // logo noir natif RN1 TAMARIN, fond supprimé
    bg: 'dark',
    filter: 'brightness(1.15)',
  },
  // ── I Padel by RM Hennessy & Port Chambly ────────────────────────────────
  {
    match: ['i padel by rm', 'ipadel by rm', 'i padel by rn', 'ipadel by rn'],
    src: '/logos/ipadel-rm.png',   // logo noir natif, fond supprimé
    bg: 'dark',
    filter: 'brightness(1.05)',
  },
  // ── RM Club Grand Baie (Forbach) ────────────────────────────────────────────
  {
    match: ['rm club grand baie', 'rm grand baie', 'rm1 grand baie', 'forbach'],
    src: '/logos/rm-club-mauritius.png',  // RN1 CLUB MAURITIUS gris+doré, fond transparent
    bg: 'dark',
    filter: 'brightness(1.1) saturate(1.05)',
  },
  // ── Studio by RM Azuri ────────────────────────────────────────────────────
  {
    match: ['studio by rm', 'studio rm'],
    src: '/logos/studio-rm.png',   // STUDIO doré + "by" script blanc + RM1, fond sombre supprimé
    bg: 'dark',
    filter: 'brightness(1.05)',
  },
  // ── Labourdonnais Mapou ───────────────────────────────────────────────────
  {
    match: ['labourdonnais', 'laboudonnais'],
    src: '/logos/labourdonnais-v2.png',
    bg: 'dark',
    filter: 'brightness(1.1) saturate(1.1)',
  },
  // ── SPARC Cascavelle ──────────────────────────────────────────────────────
  {
    match: ['sparc'],
    src: '/logos/sparc.png',
    bg: 'dark',
    filter: 'brightness(1.05)',
  },
  // ── Isla Padel Grand Baie ─────────────────────────────────────────────────
  {
    match: ['isla padel', 'isla'],
    src: '/logos/isla-padel-v2.png',
    bg: 'dark',
    filter: 'brightness(1.05)',
  },
  // ── Terres Brunes Sports & Leisure ───────────────────────────────────────
  {
    match: ['terres brunes'],
    src: '/logos/terres-brunes.png',
    bg: 'color',
    filter: 'brightness(1.05) saturate(1.1)',
  },
  // ── Mont Choisy Golf ──────────────────────────────────────────────────────
  {
    match: ['mont choisy'],
    src: '/logos/mont-choisy.png',
    bg: 'dark',
    filter: 'brightness(1.05)',
  },
  // ── Oxygen Moka ───────────────────────────────────────────────────────────
  {
    match: ['oxygen'],
    src: '/logos/oxygen.png',
    bg: 'dark',
    filter: 'brightness(1.1)',
  },
  // ── Club House Black River ────────────────────────────────────────────────
  {
    match: ['club house'],
    src: '/logos/club-house-tamarin.png',
    bg: 'dark',
    filter: 'brightness(1.1)',
  },
  // ── Energia Pointe aux Canonniers ─────────────────────────────────────────
  {
    match: ['energia'],
    src: '/logos/energia.png',
    bg: 'dark',
    filter: 'brightness(1.1) saturate(1.1)',
  },
  // ── Moka Rangers (Synergy) ────────────────────────────────────────────────
  {
    match: ['moka rangers', 'synergy'],
    src: '/logos/synergy-v2.png',
    bg: 'dark',
    filter: 'brightness(1.1)',
  },
  // ── Leal Group ────────────────────────────────────────────────────────────
  {
    match: ['leal', 'icn'],
    src: '/logos/leal-group.png',
    bg: 'dark',
    filter: 'brightness(1.1)',
  },
];

function getClubLogo(clubName: string) {
  const lower = clubName.toLowerCase();
  return CLUB_LOGOS.find(l => l.match.some(m => lower.includes(m))) ?? null;
}

// ─── ClubLogoZone ────────────────────────────────────────────────────────────
function ClubLogoZone({ name, color }: { name: string; color: string }) {
  const logo = getClubLogo(name);
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const bgMap: Record<string, string> = {
    dark:  'rgba(4,4,4,0.9)',
    color: 'rgba(0,0,0,0.55)',
  };

  if (!logo) {
    // Fallback monogramme premium
    return (
      <div style={{
        width: '100%', height: '92px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `radial-gradient(ellipse at 50% 60%, ${color}1a 0%, rgba(0,0,0,0.6) 70%)`,
        borderBottom: `1px solid ${color}15`,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 7, right: 9, width: 4, height: 4, borderRadius: '50%', background: color, opacity: 0.3 }} />
        <div style={{ position: 'absolute', bottom: 7, left: 9, width: 3, height: 3, borderRadius: '50%', background: color, opacity: 0.2 }} />
        <span style={{
          fontSize: '30px', fontWeight: 900, letterSpacing: '-1px',
          color: color,
          textShadow: `0 0 28px ${color}55`,
          fontFamily: 'system-ui, sans-serif',
          userSelect: 'none',
        }}>
          {initials}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%', height: '92px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: bgMap[logo.bg] ?? bgMap.dark,
      borderBottom: `1px solid ${color}12`,
      padding: '12px 24px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Gradient couleur accent en overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(135deg, ${color}05 0%, transparent 55%)`,
        pointerEvents: 'none',
      }} />
      {/* Dot accent coin supérieur droit */}
      <div style={{
        position: 'absolute', top: 7, right: 8,
        width: 4, height: 4, borderRadius: '50%',
        background: color, opacity: 0.22,
      }} />
      <img
        src={logo.src}
        alt={`Logo ${name}`}
        style={{
          maxHeight: '60px',
          maxWidth: '150px',
          objectFit: 'contain',
          filter: logo.filter,
          transition: 'transform 0.35s ease, opacity 0.2s',
          position: 'relative', zIndex: 1,
          objectPosition: 'center',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.06)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)'; }}
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
    </div>
  );
}

export default function Clubs() {
  const { t, lang } = useI18n();
  useSeo({
    title: "Clubs de Padel à Maurice — 18 Clubs MPL",
    description: "Les 18 clubs de padel affiliés à la Mauritius Padel League. Caña Beau Plan, Club Med, Urban Sport, SPARC, RM Club, I Padel, Labourdonnais et plus. 65 courts sur l'île.",
    keywords: "padel club mauritius, clubs padel ile Maurice, MPL clubs, padel court mauritius",
    canonical: "https://padelleague.mu/#/clubs",
  });
  const regions: (Region | 'all')[] = ['all', 'Nord', 'Ouest', 'Centre', 'Est'];
  const [activeRegion, setActiveRegion] = useState<string>('all');
  const [showAll, setShowAll] = useState(false);
  const { clubs, loading } = useClubs(activeRegion === 'all' ? undefined : activeRegion);

  const displayed = showAll ? clubs : clubs.slice(0, 9);

  // Stats
  const totalCourts = clubs.reduce((sum, c) => sum + (c.courts || 0), 0);
  const totalEvents = clubs.reduce((sum, c) => sum + (c.total_events || 0), 0);

  return (
    <Layout>
      <section style={{
        padding: '88px 24px 80px', minHeight: '80vh',
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(180deg, #0a0a0a 0%, #0c0c0c 100%)',
      }}>
        <DotWaveBackground variant="corner-br" opacity={0.09} animate={false} />
        {/* Ligne déco top */}
        <div style={{ position: 'absolute', top: 64, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent 0%, rgba(74,213,105,0.2) 50%, transparent 100%)' }} />

        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>

          {/* ── Header ── */}
          <div style={{ marginBottom: '44px' }}>
            <span className="mpl-badge" style={{ marginBottom: '12px', display: 'inline-block' }}>
              {lang === 'fr' ? 'AfrAsia Bank Padel League' : 'AfrAsia Bank Padel League'}
            </span>
            <h1 style={{
              fontSize: 'clamp(28px,4vw,52px)', fontWeight: 900, color: 'white',
              margin: '0 0 8px', letterSpacing: '-1px',
            }}>
              {t.clubs.title}
            </h1>
            <p style={{ color: '#777', marginBottom: '28px', fontSize: '14px', maxWidth: '560px', lineHeight: 1.6 }}>
              {t.clubs.subtitle}
            </p>

            {/* Stats rapides */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {[
                { icon: '🏟️', val: 18,  label: lang === 'fr' ? 'Clubs affiliés' : 'Affiliated Clubs' },
                { icon: '🎾', val: totalCourts > 0 ? totalCourts : 65, label: lang === 'fr' ? 'Terrains' : 'Courts' },
                { icon: '🏆', val: totalEvents > 0 ? totalEvents : MPL_STATS.tournaments, label: lang === 'fr' ? 'Tournois' : 'Tournaments' },
                { icon: '📍', val: 4,   label: lang === 'fr' ? 'Zones' : 'Zones' },
              ].map(({ icon, val, label }) => (
                <div key={label} style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(74,213,105,0.15)',
                  borderRadius: '12px', padding: '10px 18px',
                  display: 'flex', alignItems: 'center', gap: '10px',
                  transition: 'border-color 0.2s',
                }}>
                  <span style={{ fontSize: '18px' }}>{icon}</span>
                  <div>
                    <div style={{ color: '#4ad569', fontWeight: 800, fontSize: '20px', lineHeight: 1, fontFamily: 'JetBrains Mono, monospace' }}>{val}</div>
                    <div style={{ color: '#666', fontSize: '11px', marginTop: '1px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Filtres région ── */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '36px' }}>
            {regions.map(r => {
              const isActive = activeRegion === r;
              const cfg = r !== 'all' ? REGION_CONFIG[r] : null;
              return (
                <button
                  key={r}
                  onClick={() => { setActiveRegion(r); setShowAll(false); }}
                  style={{
                    padding: '8px 18px', borderRadius: '24px', cursor: 'pointer',
                    fontSize: '13px', fontWeight: 600, transition: 'all 0.2s',
                    background: isActive ? (cfg ? cfg.bg : 'rgba(74,213,105,0.15)') : 'rgba(255,255,255,0.04)',
                    color:      isActive ? (cfg ? cfg.color : '#4ad569') : 'rgba(255,255,255,0.5)',
                    border:     isActive ? `1px solid ${cfg ? cfg.color : '#4ad569'}50` : '1px solid rgba(255,255,255,0.07)',
                    boxShadow:  isActive ? `0 4px 16px ${cfg ? cfg.color : '#4ad569'}25` : 'none',
                  }}
                >
                  {r === 'all'
                    ? `${t.clubs.filter_all} (18)`
                    : `${REGION_EMOJI[r] ?? ''} ${r}`}
                </button>
              );
            })}
          </div>

          {/* ── Grille clubs ── */}
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '20px' }}>
              {[...Array(9)].map((_, i) => (
                <div key={i} style={{
                  height: '260px', background: 'rgba(255,255,255,0.03)',
                  borderRadius: '18px', border: '1px solid rgba(74,213,105,0.08)',
                  animation: 'pulse 1.5s infinite',
                }} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '20px' }}>
              {displayed.map(club => {
                const cfg = REGION_CONFIG[club.region as Region] ?? { color: '#4ad569', bg: 'rgba(74,213,105,0.15)', name_en: club.region };
                return (
                  <div
                    key={club.id}
                    style={{
                      borderRadius: '18px',
                      border: `1px solid ${cfg.color}18`,
                      overflow: 'hidden',
                      background: 'rgba(255,255,255,0.025)',
                      backdropFilter: 'blur(12px)',
                      transition: 'transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease',
                      position: 'relative',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.transform = 'translateY(-5px)';
                      el.style.borderColor = `${cfg.color}45`;
                      el.style.boxShadow = `0 16px 40px rgba(0,0,0,0.4), 0 0 0 1px ${cfg.color}20`;
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.transform = 'translateY(0)';
                      el.style.borderColor = `${cfg.color}18`;
                      el.style.boxShadow = 'none';
                    }}
                  >
                    {/* Accent left border */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0,
                      width: '3px', height: '100%',
                      background: `linear-gradient(180deg, ${cfg.color} 0%, ${cfg.color}40 100%)`,
                      borderRadius: '3px 0 0 3px',
                    }} />

                    {/* ── Zone Logo ── */}
                    <ClubLogoZone name={club.name} color={cfg.color} />

                    {/* ── Infos club ── */}
                    <div style={{ padding: '16px 18px 14px 20px' }}>

                      {/* Nom + région */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div style={{ flex: 1, paddingRight: '8px' }}>
                          <h3 style={{
                            color: 'white', fontWeight: 700, margin: '0 0 6px',
                            fontSize: '15px', lineHeight: 1.25, letterSpacing: '-0.2px',
                          }}>{club.name}</h3>
                          <RegionBadge region={club.region} lang={lang} />
                        </div>
                        {/* Courts badge */}
                        <div style={{
                          background: `${cfg.color}15`,
                          borderRadius: '10px', padding: '7px 11px',
                          textAlign: 'center', minWidth: '48px', flexShrink: 0,
                        }}>
                          <div style={{ color: cfg.color, fontWeight: 800, fontSize: '20px', lineHeight: 1, fontFamily: 'JetBrains Mono, monospace' }}>
                            {club.courts}
                          </div>
                          <div style={{ color: '#666', fontSize: '10px', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            {t.clubs.courts}
                          </div>
                        </div>
                      </div>

                      {/* Localisation */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#bbb', fontSize: '13px' }}>
                          <MapPin size={12} style={{ color: cfg.color, flexShrink: 0 }} />
                          <span>{club.city}</span>
                        </div>
                        {club.phone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#888', fontSize: '13px' }}>
                            <Phone size={12} style={{ color: cfg.color, flexShrink: 0 }} />
                            <a href={`tel:${club.phone.replace(/\s/g,'')}`} style={{ color: '#888', textDecoration: 'none' }}>
                              {club.phone}
                            </a>
                          </div>
                        )}
                        {club.contact && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#888', fontSize: '13px' }}>
                            <Users size={12} style={{ color: cfg.color, flexShrink: 0 }} />
                            <span>{club.contact}</span>
                          </div>
                        )}
                        {club.total_events != null && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#888', fontSize: '13px' }}>
                            <Calendar size={12} style={{ color: cfg.color, flexShrink: 0 }} />
                            <span>{club.total_events} {lang === 'fr' ? 'tournois 2026' : 'tournaments 2026'}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Footer barre activité ── */}
                    <div style={{
                      padding: '10px 18px 14px 20px',
                      borderTop: `1px solid ${cfg.color}0d`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span style={{ color: '#555', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Activité</span>
                        <span style={{ color: cfg.color, fontSize: '11px', fontWeight: 700 }}>
                          {club.total_events ?? 0}/16
                        </span>
                      </div>
                      <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: '4px',
                          background: `linear-gradient(90deg, ${cfg.color}70, ${cfg.color})`,
                          width: `${Math.min(100, ((club.total_events || 0) / 16) * 100)}%`,
                          transition: 'width 0.6s ease',
                        }} />
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}

          {/* ── Count + Show all ── */}
          {!loading && (
            <div style={{ textAlign: 'center', marginTop: '28px' }}>
              <p style={{ color: '#555', fontSize: '13px', marginBottom: '16px' }}>
                {displayed.length} / {clubs.length} {lang === 'fr' ? 'clubs affichés' : 'clubs shown'}
              </p>
              {!showAll && clubs.length > 9 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="mpl-btn-outline"
                  style={{ padding: '11px 28px', fontSize: '14px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  {t.clubs.see_all} ({clubs.length - 9} {lang === 'fr' ? 'de plus' : 'more'})
                  <ChevronRight size={15} />
                </button>
              )}
            </div>
          )}

        </div>
      </section>
    </Layout>
  );
}
