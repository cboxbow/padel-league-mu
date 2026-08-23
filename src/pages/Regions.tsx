import { useState } from 'react';
import { motion } from 'framer-motion';
import { Compass, LocateFixed, Sunrise, Waves } from 'lucide-react';
import { DotWaveBackground } from '@/components/DotWaveBackground';
import { Layout, GlassCard, RegionBadge } from '@/components/Layout';
import { useI18n } from '@/hooks/useI18n';
import { REGION_CONFIG, MPL_STATS } from '@/lib/index';
import type { Region } from '@/lib/index';

// ── Données enrichies par région (chiffres réels MPL 2026 Excel) ──────────────
const REGIONS_DATA: Record<'Nord' | 'Ouest' | 'Est' | 'Centre', {
  clubs: number;
  courts: number;
  tournaments: number;
  description_fr: string;
  description_en: string;
  clubs_list: string[];
}> = {
  Nord: {
    clubs: 7, courts: 28, tournaments: 99,
    description_fr: `La région Nord est la plus active de la MPL 2026 avec 7 clubs. Elle regroupe Grand Baie, Beau Plan, Mont Choisy et Pointe aux Canonniers. Avec 28 terrains et ${MPL_STATS.by_region.Nord} tournois programmés, c'est le cœur battant du padel mauricien.`,
    description_en: `The North region is the most active in MPL 2026 with 7 clubs. It includes Grand Baie, Beau Plan, Mont Choisy and Pointe aux Canonniers. With 28 courts and ${MPL_STATS.by_region.Nord} tournaments scheduled, it is the beating heart of Mauritian padel.`,
    clubs_list: [
      'Caña Beau Plan',
      'Urban Sport Grand Baie',
      'RM Club Grand Baie',
      'Labourdonnais Mapou',
      'Isla Padel Grand Baie',
      'Mont Choisy Golf',
      'Energia Pointe aux Canonniers',
    ],
  },
  Ouest: {
    clubs: 6, courts: 21, tournaments: 85,
    description_fr: "La région Ouest regroupe Albion, Black River, Cascavelle et Tamarin. Avec 6 clubs et 21 terrains, elle accueille notamment le MPL Masters M1000 et se distingue par la densité de ses infrastructures padel.",
    description_en: "The West region includes Albion, Black River, Cascavelle and Tamarin. With 6 clubs and 21 courts, it hosts the MPL Masters M1000 and stands out for the density of its padel infrastructure.",
    clubs_list: [
      'Club Med Albion',
      'Urban Sport Black River',
      'SPARC Cascavelle',
      'RM Club Tamarin',
      'Terres Brunes Sports & Leisure',
      'Club House Black River',
    ],
  },
  Centre: {
    clubs: 4, courts: 13, tournaments: 53,
    description_fr: `La région Centre regroupe Hennessy, Port Chambly et Moka. Ses 4 clubs et 13 terrains proposent ${MPL_STATS.by_region.Centre} tournois sur la saison. Véritable hub central de l'île, elle connecte les régions nord et sud.`,
    description_en: `The Centre region covers Hennessy, Port Chambly and Moka. Its 4 clubs and 13 courts host ${MPL_STATS.by_region.Centre} tournaments per season. A true central hub of the island, it connects the north and south regions.`,
    clubs_list: [
      'I Padel by RM Hennessy',
      'I Padel by RM Port Chambly',
      'Oxygen Moka',
      'Moka Rangers',
    ],
  },
  Est: {
    clubs: 1, courts: 3, tournaments: 15,
    description_fr: `La région Est est représentée par le Studio by RM Azuri, situé dans la magnifique baie d'Azuri. 3 terrains et ${MPL_STATS.by_region.Est} tournois au programme 2026 pour cette région en plein développement côté Est de l'île.`,
    description_en: `The East region is represented by Studio by RM Azuri, located in the beautiful Azuri bay. 3 courts and ${MPL_STATS.by_region.Est} tournaments on the 2026 schedule for this rapidly developing region on the east side of the island.`,
    clubs_list: [
      'Studio by RM Azuri',
    ],
  },
};

type LocalRegion = 'Nord' | 'Ouest' | 'Est' | 'Centre';
const REGION_ORDER: LocalRegion[] = ['Nord', 'Ouest', 'Est', 'Centre'];

function RegionEmblem({ region, color, bg }: { region: LocalRegion; color: string; bg: string }) {
  const Icon = {
    Nord: Compass,
    Ouest: Waves,
    Est: Sunrise,
    Centre: LocateFixed,
  }[region];

  return (
    <div
      aria-hidden="true"
      style={{
        width: '72px',
        height: '72px',
        borderRadius: '18px',
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        marginBottom: '10px',
        background: `linear-gradient(145deg, ${bg}, rgba(255,255,255,0.025))`,
        border: `1px solid ${color}45`,
        boxShadow: `0 18px 42px ${color}12, inset 0 1px 0 rgba(255,255,255,0.08)`,
      }}
    >
      <span
        style={{
          position: 'absolute',
          width: '46px',
          height: '46px',
          borderRadius: '999px',
          border: `1px solid ${color}28`,
          opacity: 0.95,
        }}
      />
      <span
        style={{
          position: 'absolute',
          inset: '8px',
          borderTop: `2px solid ${color}`,
          borderRight: `2px solid ${color}55`,
          borderRadius: '16px',
          opacity: 0.7,
        }}
      />
      <Icon size={24} strokeWidth={1.8} color={color} />
    </div>
  );
}

function RegionCardLabel({ region, color, bg }: { region: LocalRegion; color: string; bg: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '96px',
        padding: '7px 16px',
        borderRadius: '999px',
        background: `linear-gradient(135deg, ${bg}, rgba(255,255,255,0.035))`,
        border: `1px solid ${color}45`,
        boxShadow: `0 10px 26px ${color}14`,
        color,
        fontSize: '15px',
        fontWeight: 850,
        lineHeight: 1,
        textAlign: 'center',
      }}
    >
      {region}
    </div>
  );
}

function RegionMapNode({
  region,
  x,
  y,
  labelX,
  labelY,
  active,
  onClick,
}: {
  region: LocalRegion;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  active: boolean;
  onClick: () => void;
}) {
  const data = REGIONS_DATA[region];
  const cfg = REGION_CONFIG[region as Region];
  const anchor = labelX < x - 10 ? 'end' : labelX > x + 10 ? 'start' : 'middle';

  return (
    <g
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onClick();
      }}
      style={{ cursor: 'pointer', outline: 'none' }}
    >
      <circle
        cx={x}
        cy={y}
        r={active ? 31 : 25}
        fill={active ? `${cfg.color}22` : 'rgba(5, 15, 22, 0.42)'}
        stroke={cfg.color}
        strokeWidth={active ? 3 : 2.1}
        filter={active ? `drop-shadow(0 0 18px ${cfg.color}66)` : `drop-shadow(0 0 9px ${cfg.color}30)`}
        style={{ transition: 'all 0.25s ease' }}
      />
      <circle cx={x} cy={y} r="4.5" fill={cfg.color} />
      <line
        x1={x}
        y1={y}
        x2={labelX}
        y2={labelY - 11}
        stroke={cfg.color}
        strokeWidth="1.2"
        strokeOpacity={active ? 0.55 : 0.28}
      />
      <text x={labelX} y={labelY} textAnchor={anchor} fill={cfg.color} fontSize="18" fontWeight="950" letterSpacing="1.5">
        {region}
      </text>
      <text x={labelX} y={labelY + 22} textAnchor={anchor} fill="#d8dde6" fontSize="15" fontWeight="760">
        {data.clubs}c / {data.courts}t
      </text>
    </g>
  );
}

export default function Regions() {
  const { t, lang } = useI18n();
  const [active, setActive] = useState<LocalRegion | null>(null);

  return (
    <Layout>
      {/* ── HERO ── */}
      <section style={{
        padding: '100px 24px 80px',
        background: 'radial-gradient(ellipse at 70% 50%, rgba(74,213,105,0.08) 0%, #0a0a0a 65%)',
        borderBottom: '1px solid rgba(74,213,105,0.08)',
        position: 'relative', overflow: 'hidden',
      }}>
        <DotWaveBackground variant="hero-right" opacity={0.13} animate={false} />
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>
          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            style={{ fontSize: 'clamp(36px,5vw,64px)', fontWeight: 900, color: 'white', margin: '0 0 16px', lineHeight: 1.1 }}
          >
            {t.regions.title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            style={{ color: '#a0a0a0', fontSize: '17px', maxWidth: '600px', lineHeight: 1.7 }}
          >
            {t.regions.subtitle}
          </motion.p>

          {/* Global stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            style={{ display: 'flex', gap: '40px', flexWrap: 'wrap', marginTop: '48px' }}
          >
            {[
              { value: '18', label: lang === 'fr' ? 'Clubs au total' : 'Total clubs',        color: '#4ad569' },
              { value: '65', label: lang === 'fr' ? 'Terrains au total' : 'Total courts',    color: '#3b82f6' },
              { value: String(MPL_STATS.tournaments), label: lang === 'fr' ? 'Tournois / saison' : 'Tournaments',    color: '#8b5cf6' },
              { value: '4',  label: lang === 'fr' ? 'Régions' : 'Regions',                   color: '#f59e0b' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 'clamp(32px,4vw,48px)', fontWeight: 900, color: s.color, lineHeight: 1, fontFamily: 'JetBrains Mono,monospace' }}>{s.value}</div>
                <div style={{ color: '#666', fontSize: '13px', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>{s.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── GRILLE DES 4 RÉGIONS ── */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {REGION_ORDER.map((region, i) => {
              const data = REGIONS_DATA[region];
              const cfg  = REGION_CONFIG[region as Region] ?? { color: '#4ad569', bg: 'rgba(74,213,105,0.12)' };
              const isOpen = active === region;
              return (
                <motion.div
                  key={region}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div
                    style={{
                      padding: '28px', cursor: 'pointer',
                      border: isOpen ? `1px solid ${cfg.color}` : '1px solid rgba(255,255,255,0.06)',
                      transition: 'all 0.3s', borderRadius: '16px',
                      background: isOpen ? `${cfg.bg}` : 'rgba(255,255,255,0.02)',
                    }}
                    onClick={() => setActive(isOpen ? null : region)}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <RegionEmblem region={region} color={cfg.color} bg={cfg.bg} />
                        <RegionCardLabel region={region} color={cfg.color} bg={cfg.bg} />
                      </div>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        border: `1px solid ${cfg.color}30`, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        color: cfg.color, fontSize: '16px', transition: 'transform 0.3s',
                        transform: isOpen ? 'rotate(180deg)' : 'none',
                        flexShrink: 0,
                      }}>
                        ▾
                      </div>
                    </div>

                    {/* Stats mini */}
                    <div style={{ display: 'flex', gap: '20px', marginBottom: '16px' }}>
                      {[
                        { v: data.clubs,       l: t.regions.clubs_label },
                        { v: data.courts,      l: t.regions.courts_label },
                        { v: data.tournaments, l: t.regions.tournaments_label },
                      ].map(s => (
                        <div key={s.l} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '22px', fontWeight: 800, color: cfg.color, lineHeight: 1, fontFamily: 'JetBrains Mono,monospace' }}>{s.v}</div>
                          <div style={{ fontSize: '11px', color: '#666', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.l}</div>
                        </div>
                      ))}
                    </div>

                    {/* Description */}
                    <p style={{ color: '#a0a0a0', fontSize: '14px', lineHeight: 1.7, margin: 0 }}>
                      {lang === 'fr' ? data.description_fr.slice(0, 100) + '…' : data.description_en.slice(0, 100) + '…'}
                    </p>

                    {/* Expanded clubs list */}
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        style={{ marginTop: '20px', borderTop: `1px solid ${cfg.color}20`, paddingTop: '16px' }}
                      >
                        <p style={{ color: '#a0a0a0', fontSize: '14px', lineHeight: 1.7, marginBottom: '16px' }}>
                          {lang === 'fr' ? data.description_fr : data.description_en}
                        </p>
                        <p style={{ color: cfg.color, fontSize: '12px', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                          {lang === 'fr' ? 'Clubs de la région' : 'Region clubs'}
                        </p>
                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {data.clubs_list.map((club, ci) => (
                            <li key={ci} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', color: '#ccc' }}>
                              <span style={{ color: cfg.color, fontSize: '8px' }}>●</span>
                              {club}
                            </li>
                          ))}
                        </ul>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CARTE INTERACTIVE ── */}
      <section style={{ padding: '0 24px 72px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>
          <GlassCard style={{ padding: 'clamp(24px,5vw,44px)', textAlign: 'center', overflow: 'hidden' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: '999px',
              background: 'rgba(74,213,105,0.08)',
              border: '1px solid rgba(74,213,105,0.22)',
              color: '#4ad569',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              marginBottom: '14px',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: '#4ad569', boxShadow: '0 0 14px #4ad569' }} />
              {lang === 'fr' ? 'Carte interactive' : 'Interactive map'}
            </div>
            <h2 style={{ color: 'white', fontWeight: 900, fontSize: 'clamp(22px,4vw,34px)', margin: '0 0 10px', lineHeight: 1.05 }}>
              {lang === 'fr' ? "Carte de l'Île Maurice" : 'Map of Mauritius Island'}
            </h2>
            <p style={{ color: '#9ca3af', margin: '0 auto 22px', fontSize: '14px', maxWidth: '460px', lineHeight: 1.55 }}>
              {lang === 'fr' ? 'Explorez les clubs, terrains et tournois par zone.' : 'Explore clubs, courts and tournaments by zone.'}
            </p>

            <div style={{
              width: '100%',
              maxWidth: '560px',
              margin: '0 auto',
              borderRadius: '28px',
              padding: 'clamp(2px,1vw,10px)',
              background: 'radial-gradient(circle at 50% 42%, rgba(34,211,238,0.10), rgba(74,213,105,0.045) 42%, rgba(255,255,255,0.012) 68%, transparent 78%)',
            }}>
              <svg viewBox="0 0 520 620" style={{ width: '100%', display: 'block' }}>
                <defs>
                  <linearGradient id="mauritius-map-fill" x1="145" y1="54" x2="396" y2="554" gradientUnits="userSpaceOnUse">
                    <stop stopColor="rgba(14,165,233,0.14)" />
                    <stop offset="0.48" stopColor="rgba(6,95,70,0.18)" />
                    <stop offset="1" stopColor="rgba(255,255,255,0.025)" />
                  </linearGradient>
                  <filter id="map-cyan-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <path
                  d="M323 55L363 70L390 88L397 117L382 146L397 193L421 232L447 238L463 250L468 275L463 308L484 326L496 361L493 403L478 464L487 502L473 547L451 579L409 594L358 607L306 618L257 616L212 607L184 592L151 600L123 579L86 536L112 529L139 533L165 526L176 479L171 449L159 439L164 395L164 354L177 313L199 274L236 247L275 236L300 218L305 176L326 134L350 103L336 93L316 96L292 116L263 116L245 104L260 85L296 72Z"
                  fill="url(#mauritius-map-fill)"
                  stroke="#34d6ff"
                  strokeWidth="3.2"
                  strokeLinejoin="round"
                  filter="url(#map-cyan-glow)"
                />
                <path
                  d="M321 77L355 90L374 105L363 133L378 185L407 224L431 229L441 240L445 262L441 295L462 315L473 356L469 397L456 455L466 499L452 536L428 562L394 576L350 588L303 598L262 596L224 587L192 572L160 581L135 560L107 529L130 524L155 527L177 515L186 473L183 443L174 430L181 389L181 356L192 320L213 288L247 265L285 254L315 231L322 182L341 143L360 115L342 112L318 125L286 124L261 111L274 95Z"
                  fill="none"
                  stroke="rgba(52,214,255,0.16)"
                  strokeWidth="1.1"
                />
                <RegionMapNode region="Nord" x={318} y={117} labelX={318} labelY={66} active={active === 'Nord'} onClick={() => setActive(active === 'Nord' ? null : 'Nord')} />
                <RegionMapNode region="Ouest" x={181} y={327} labelX={104} labelY={316} active={active === 'Ouest'} onClick={() => setActive(active === 'Ouest' ? null : 'Ouest')} />
                <RegionMapNode region="Est" x={424} y={268} labelX={474} labelY={258} active={active === 'Est'} onClick={() => setActive(active === 'Est' ? null : 'Est')} />
                <RegionMapNode region="Centre" x={253} y={276} labelX={253} labelY={216} active={active === 'Centre'} onClick={() => setActive(active === 'Centre' ? null : 'Centre')} />
              </svg>
            </div>

            <p style={{ color: '#707987', fontSize: '12px', margin: '10px 0 0', fontWeight: 650 }}>
              {lang === 'fr' ? 'Touchez une zone pour ouvrir le détail de la région.' : 'Tap a zone to open region details.'}
            </p>
          </GlassCard>
        </div>
      </section>
    </Layout>
  );
}
