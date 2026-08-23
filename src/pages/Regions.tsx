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

  const coordinates = {
    Nord: 'NORD',
    Ouest: 'OUEST',
    Est: 'EST',
    Centre: 'CENT',
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
      <span
        style={{
          position: 'absolute',
          bottom: '8px',
          left: '10px',
          fontSize: '8px',
          fontFamily: 'JetBrains Mono, monospace',
          color: '#b9c2cf',
          letterSpacing: '1.1px',
          fontWeight: 800,
        }}
      >
        {coordinates}
      </span>
    </div>
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
                      <div>
                        <RegionEmblem region={region} color={cfg.color} bg={cfg.bg} />
                        <RegionBadge region={region as Region} />
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

      {/* ── CARTE SCHÉMATIQUE ── */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>
          <GlassCard style={{ padding: '48px', textAlign: 'center' }}>
            <h2 style={{ color: 'white', fontWeight: 800, fontSize: 'clamp(20px,2.5vw,28px)', marginBottom: '12px' }}>
              {lang === 'fr' ? "Carte de l'Île Maurice" : 'Map of Mauritius Island'}
            </h2>
            <p style={{ color: '#a0a0a0', marginBottom: '40px', fontSize: '14px' }}>
              {lang === 'fr' ? 'Distribution des clubs par région géographique' : 'Distribution of clubs by geographic region'}
            </p>

            {/* SVG schématique de Maurice */}
            <svg viewBox="0 0 400 360" style={{ width: '100%', maxWidth: '420px', margin: '0 auto', display: 'block' }}>
              {/* Contour simplifié de l'île */}
              <path d="M200,20 L290,60 L360,120 L380,200 L340,280 L260,330 L180,340 L110,310 L60,250 L40,180 L60,100 L120,50 Z"
                fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>

              {/* Nord */}
              <circle cx="200" cy="90" r="48"
                fill={active === 'Nord' ? `${REGION_CONFIG.Nord.color}25` : 'rgba(74,213,105,0.07)'}
                stroke={REGION_CONFIG.Nord.color} strokeWidth={active === 'Nord' ? 2 : 1}
                style={{ cursor: 'pointer', transition: 'all 0.3s' }}
                onClick={() => setActive(active === 'Nord' ? null : 'Nord')}
              />
              <text x="200" y="83" textAnchor="middle" fill={REGION_CONFIG.Nord.color} fontSize="13" fontWeight="700">Nord</text>
              <text x="200" y="98" textAnchor="middle" fill="#888" fontSize="10">{REGIONS_DATA.Nord.clubs}c / {REGIONS_DATA.Nord.courts}t</text>

              {/* Ouest */}
              <circle cx="115" cy="195" r="48"
                fill={active === 'Ouest' ? `${REGION_CONFIG.Ouest.color}25` : 'rgba(59,130,246,0.07)'}
                stroke={REGION_CONFIG.Ouest.color} strokeWidth={active === 'Ouest' ? 2 : 1}
                style={{ cursor: 'pointer', transition: 'all 0.3s' }}
                onClick={() => setActive(active === 'Ouest' ? null : 'Ouest')}
              />
              <text x="115" y="188" textAnchor="middle" fill={REGION_CONFIG.Ouest.color} fontSize="13" fontWeight="700">Ouest</text>
              <text x="115" y="203" textAnchor="middle" fill="#888" fontSize="10">{REGIONS_DATA.Ouest.clubs}c / {REGIONS_DATA.Ouest.courts}t</text>

              {/* Est */}
              <circle cx="290" cy="195" r="48"
                fill={active === 'Est' ? `${REGION_CONFIG.Est.color}25` : 'rgba(245,158,11,0.07)'}
                stroke={REGION_CONFIG.Est.color} strokeWidth={active === 'Est' ? 2 : 1}
                style={{ cursor: 'pointer', transition: 'all 0.3s' }}
                onClick={() => setActive(active === 'Est' ? null : 'Est')}
              />
              <text x="290" y="188" textAnchor="middle" fill={REGION_CONFIG.Est.color} fontSize="13" fontWeight="700">Est</text>
              <text x="290" y="203" textAnchor="middle" fill="#888" fontSize="10">{REGIONS_DATA.Est.clubs}c / {REGIONS_DATA.Est.courts}t</text>

              {/* Sud */}
              <circle cx="200" cy="285" r="48"
                fill={active === 'Centre' ? `${REGION_CONFIG.Centre.color}25` : 'rgba(139,92,246,0.07)'}
                stroke={REGION_CONFIG.Centre.color} strokeWidth={active === 'Centre' ? 2 : 1}
                style={{ cursor: 'pointer', transition: 'all 0.3s' }}
                onClick={() => setActive(active === 'Centre' ? null : 'Centre')}
              />
              <text x="200" y="278" textAnchor="middle" fill={REGION_CONFIG.Centre.color} fontSize="13" fontWeight="700">Centre</text>
              <text x="200" y="293" textAnchor="middle" fill="#888" fontSize="10">{REGIONS_DATA.Centre.clubs}c / {REGIONS_DATA.Centre.courts}t</text>

              {/* Lignes de connexion */}
              <line x1="200" y1="135" x2="200" y2="240" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4,4"/>
              <line x1="160" y1="165" x2="250" y2="165" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4,4"/>
            </svg>

            <p style={{ color: '#555', fontSize: '12px', marginTop: '16px' }}>
              {lang === 'fr' ? 'Cliquez sur une région pour la sélectionner' : 'Click on a region to select it'}
            </p>
          </GlassCard>
        </div>
      </section>
    </Layout>
  );
}
