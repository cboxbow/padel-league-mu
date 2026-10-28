import { lazy, Suspense, useState } from 'react';
import { motion } from 'framer-motion';
import { Compass, LocateFixed, Sunrise, Waves } from 'lucide-react';
import { DotWaveBackground } from '@/components/DotWaveBackground';
import { Layout } from '@/components/Layout';
import type { ClubsMapFilter } from '@/components/ClubsMap';
import { CLUBS_MAP, type ClubMapRegion } from '@/data/clubsMap';
import { useI18n } from '@/hooks/useI18n';
import { MPL_CLUBS } from '@/data/mpl2026';
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

// Carte Leaflet partagee avec la page Clubs (chargee a part).
const ClubsMap = lazy(() => import('@/components/ClubsMap'));

// Clubs et terrains : meme source que la carte (src/data/clubsMap.ts).
const MAP_REGION: Record<LocalRegion, ClubMapRegion> = { Nord: 'NORD', Ouest: 'OUEST', Centre: 'CENTRE', Est: 'EST' };
const LOCAL_REGION: Record<ClubMapRegion, LocalRegion> = { NORD: 'Nord', OUEST: 'Ouest', CENTRE: 'Centre', EST: 'Est' };
const regionClubs = (region: LocalRegion) =>
  CLUBS_MAP.filter((club) => club.region === MAP_REGION[region]).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
const TOTAL_CLUBS = CLUBS_MAP.length;
const TOTAL_COURTS = CLUBS_MAP.reduce((sum, club) => sum + club.courts, 0);

const normalizeClubName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const officialClubByName = new Map(MPL_CLUBS.map((club) => [normalizeClubName(club.name), club]));

// Clubs et terrains depuis la carte ; tournois inchanges (calendrier officiel MPL).
function getRegionStats(region: LocalRegion) {
  const clubs = regionClubs(region);
  const official = REGIONS_DATA[region].clubs_list
    .map((name) => officialClubByName.get(normalizeClubName(name)))
    .filter((club): club is (typeof MPL_CLUBS)[number] => Boolean(club));
  return {
    clubs: clubs.length,
    courts: clubs.reduce((sum, club) => sum + club.courts, 0),
    tournaments: official.length ? official.reduce((sum, club) => sum + club.total_events, 0) : REGIONS_DATA[region].tournaments,
  };
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
              { value: String(TOTAL_CLUBS), label: lang === 'fr' ? 'Clubs au total' : 'Total clubs',        color: '#4ad569' },
              { value: String(TOTAL_COURTS), label: lang === 'fr' ? 'Terrains au total' : 'Total courts',    color: '#3b82f6' },
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
              const stats = getRegionStats(region);
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
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    aria-label={`${region} : ${stats.clubs} club${stats.clubs > 1 ? 's' : ''}, ${stats.courts} terrains${isOpen ? '' : ' — afficher sur la carte'}`}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActive(isOpen ? null : region); }
                    }}
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
                        { v: stats.clubs,       l: t.regions.clubs_label },
                        { v: stats.courts,      l: t.regions.courts_label },
                        { v: stats.tournaments, l: t.regions.tournaments_label },
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
                          {regionClubs(region).map((club) => (
                            <li key={club.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', color: '#ccc' }}>
                              <span style={{ color: cfg.color, fontSize: '8px' }}>●</span>
                              <span style={{ flex: 1 }}>{club.name}</span>
                              <span style={{ color: cfg.color, fontFamily: 'JetBrains Mono,monospace', fontWeight: 700 }}>
                                {club.courts} {lang === 'fr' ? (club.courts > 1 ? 'terrains' : 'terrain') : 'courts'}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <button type="button" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); document.getElementById('regions-carte')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} style={{ display: 'inline-block', marginTop: '12px', padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: cfg.color, fontSize: '13px', fontWeight: 700 }}>
                          {lang === 'fr' ? 'Voir sur la carte ↓' : 'See on the map ↓'}
                        </button>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CARTE INTERACTIVE (meme composant et memes donnees que la page Clubs) ── */}
      <section id="regions-carte" style={{ padding: '0 24px 72px', scrollMarginTop: '80px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>
          <Suspense fallback={<div style={{ height: 'clamp(380px, 64vh, 640px)', borderRadius: '16px', border: '1px solid rgba(74,213,105,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '13px' }}>Chargement de la carte…</div>}>
            <ClubsMap
              region={active ? MAP_REGION[active] : 'ALL'}
              onRegionChange={(next: ClubsMapFilter) => setActive(next === 'ALL' ? null : LOCAL_REGION[next])}
            />
          </Suspense>
        </div>
      </section>
    </Layout>
  );
}
