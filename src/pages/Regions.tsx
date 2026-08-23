import { useState } from 'react';
import { motion } from 'framer-motion';
import { Compass, ExternalLink, LocateFixed, MapPin, Sunrise, Waves } from 'lucide-react';
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

const ZONE_COLORS: Record<LocalRegion | 'Sud', string> = {
  Nord: '#4EA8FF',
  Ouest: '#3ED0A0',
  Centre: '#9B7EFF',
  Est: '#FFA940',
  Sud: '#FF6B6B',
};

type ClubLocation = {
  name: string;
  zone: LocalRegion | 'Sud';
  place: string;
  locationKey: string;
  lat: number;
  lng: number;
  courts: number;
  events: number;
};

type ClubCluster = {
  id: string;
  place: string;
  zone: LocalRegion | 'Sud';
  lat: number;
  lng: number;
  courts: number;
  events: number;
  clubs: ClubLocation[];
  x: number;
  y: number;
};

const CLUB_LOCATIONS: ClubLocation[] = [
  { name: 'Caña Beau Plan', zone: 'Nord', place: 'Beau Plan', locationKey: 'beau-plan', lat: -20.086, lng: 57.562, courts: 4, events: 18 },
  { name: 'Urban Sport Grand Baie', zone: 'Nord', place: 'Grand Baie', locationKey: 'grand-baie', lat: -20.014, lng: 57.584, courts: 6, events: 20 },
  { name: 'RM Club Grand Baie', zone: 'Nord', place: 'Grand Baie', locationKey: 'grand-baie', lat: -20.014, lng: 57.584, courts: 4, events: 18 },
  { name: 'Isla Padel Grand Baie', zone: 'Nord', place: 'Grand Baie', locationKey: 'grand-baie', lat: -20.014, lng: 57.584, courts: 4, events: 10 },
  { name: 'Labourdonnais Mapou', zone: 'Nord', place: 'Mapou', locationKey: 'mapou', lat: -20.079, lng: 57.604, courts: 4, events: 17 },
  { name: 'Mont Choisy Golf', zone: 'Nord', place: 'Mont Choisy', locationKey: 'mont-choisy', lat: -20.012, lng: 57.552, courts: 3, events: 8 },
  { name: 'Energia Pointe aux Canonniers', zone: 'Nord', place: 'Pointe aux Canonniers', locationKey: 'pointe-aux-canonniers', lat: -20.006, lng: 57.558, courts: 3, events: 8 },
  { name: 'Club Med Albion', zone: 'Ouest', place: 'Albion', locationKey: 'albion', lat: -20.207, lng: 57.407, courts: 3, events: 12 },
  { name: 'Urban Sport Black River', zone: 'Ouest', place: 'Black River', locationKey: 'black-river', lat: -20.360, lng: 57.365, courts: 4, events: 18 },
  { name: 'Club House Black River', zone: 'Ouest', place: 'Black River', locationKey: 'black-river', lat: -20.360, lng: 57.365, courts: 2, events: 10 },
  { name: 'SPARC Cascavelle', zone: 'Ouest', place: 'Cascavelle', locationKey: 'cascavelle', lat: -20.286, lng: 57.407, courts: 4, events: 17 },
  { name: 'RM Club Tamarin', zone: 'Ouest', place: 'Tamarin', locationKey: 'tamarin', lat: -20.328, lng: 57.374, courts: 4, events: 15 },
  { name: 'Terres Brunes Sports & Leisure', zone: 'Ouest', place: 'Tamarin / Terre Rouge', locationKey: 'terres-brunes', lat: -20.344, lng: 57.390, courts: 4, events: 13 },
  { name: 'I Padel by RM Hennessy', zone: 'Centre', place: 'Ebène / Hennessy', locationKey: 'hennessy', lat: -20.242, lng: 57.491, courts: 4, events: 18 },
  { name: 'I Padel by RM Port Chambly', zone: 'Centre', place: 'Port Chambly', locationKey: 'port-chambly', lat: -20.108, lng: 57.520, courts: 4, events: 17 },
  { name: 'Oxygen Moka', zone: 'Centre', place: 'Moka', locationKey: 'moka', lat: -20.219, lng: 57.502, courts: 3, events: 10 },
  { name: 'Moka Rangers', zone: 'Centre', place: 'Moka', locationKey: 'moka', lat: -20.219, lng: 57.502, courts: 2, events: 8 },
  { name: 'Studio by RM Azuri', zone: 'Est', place: 'Azuri', locationKey: 'azuri', lat: -20.084, lng: 57.708, courts: 3, events: 15 },
];

const MAP_BOUNDS = {
  minLat: -20.56,
  maxLat: -19.98,
  minLng: 57.31,
  maxLng: 57.74,
};

function projectClub(lat: number, lng: number) {
  const x = 64 + ((lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * 392;
  const y = 62 + ((MAP_BOUNDS.maxLat - lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * 510;
  return { x, y };
}

function buildClubClusters(): ClubCluster[] {
  const grouped = new Map<string, ClubLocation[]>();
  CLUB_LOCATIONS.forEach((club) => {
    grouped.set(club.locationKey, [...(grouped.get(club.locationKey) ?? []), club]);
  });

  return Array.from(grouped.entries()).map(([id, clubs]) => {
    const lat = clubs.reduce((sum, club) => sum + club.lat, 0) / clubs.length;
    const lng = clubs.reduce((sum, club) => sum + club.lng, 0) / clubs.length;
    const { x, y } = projectClub(lat, lng);
    return {
      id,
      place: clubs[0].place,
      zone: clubs[0].zone,
      lat,
      lng,
      courts: clubs.reduce((sum, club) => sum + club.courts, 0),
      events: clubs.reduce((sum, club) => sum + club.events, 0),
      clubs,
      x,
      y,
    };
  });
}

function ClubsMap({ lang }: { lang: string }) {
  const clusters = buildClubClusters();
  const [selectedId, setSelectedId] = useState(clusters.find((cluster) => cluster.clubs.length > 1)?.id ?? clusters[0]?.id);
  const selected = clusters.find((cluster) => cluster.id === selectedId) ?? clusters[0];
  const totalClubs = CLUB_LOCATIONS.length;
  const totalCourts = CLUB_LOCATIONS.reduce((sum, club) => sum + club.courts, 0);
  const totalEvents = CLUB_LOCATIONS.reduce((sum, club) => sum + club.events, 0);

  return (
    <>
    <style>{`
      .clubs-map-shell {
        display: grid;
        grid-template-columns: minmax(420px, 1fr) minmax(300px, 0.78fr);
        gap: 24px;
        align-items: start;
      }
      .clubs-map-stage {
        min-width: 0;
      }
      .clubs-map-viewport {
        width: min(100%, 620px);
        aspect-ratio: 520 / 650;
        min-height: 640px;
        margin: 0 auto;
        position: relative;
      }
      .clubs-map-viewport svg {
        width: 100%;
        height: 100%;
        display: block;
        overflow: visible;
      }
      .clubs-map-panel {
        padding: 22px;
      }
      .clubs-map-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin-bottom: 18px;
      }
      .clubs-map-club-link {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
      }
      @media (max-width: 980px) {
        .clubs-map-shell {
          grid-template-columns: 1fr;
        }
        .clubs-map-viewport {
          width: min(100%, 560px);
          min-height: 0;
        }
      }
      @media (max-width: 760px) {
        .clubs-map-shell {
          grid-template-columns: 1fr;
          gap: 18px;
        }
        .clubs-map-viewport {
          width: 100%;
          aspect-ratio: 520 / 650;
        }
        .clubs-map-panel {
          padding: 16px !important;
          border-radius: 16px !important;
        }
        .clubs-map-stats {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px !important;
        }
        .clubs-map-club-link {
          grid-template-columns: 1fr auto;
          padding: 12px !important;
        }
      }
      @media (max-width: 420px) {
        .clubs-map-panel {
          padding: 14px !important;
        }
        .clubs-map-stats {
          grid-template-columns: 1fr 1fr 1fr;
        }
      }
    `}</style>
    <div className="clubs-map-shell">
      <div className="clubs-map-stage">
        <div style={{ textAlign: 'center', marginBottom: '22px' }}>
          <h2 style={{ color: 'white', fontWeight: 950, fontSize: 'clamp(26px,5vw,46px)', margin: '0 0 8px', lineHeight: 1.02 }}>
            {lang === 'fr' ? 'Carte des clubs MPL' : 'MPL clubs map'}
          </h2>
          <p style={{ color: '#9ca3af', margin: 0, fontSize: 'clamp(14px,2vw,18px)' }}>
            {lang === 'fr' ? 'Distribution géographique réelle — saison en cours' : 'Real geographic distribution — current season'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'clamp(22px,7vw,58px)', marginTop: '22px', flexWrap: 'wrap' }}>
            {[
              { value: totalClubs, label: lang === 'fr' ? 'Clubs' : 'Clubs' },
              { value: totalCourts, label: lang === 'fr' ? 'Terrains' : 'Courts' },
              { value: totalEvents, label: lang === 'fr' ? 'Événements' : 'Events' },
            ].map((stat) => (
              <div key={stat.label}>
                <div style={{ color: '#34d6ff', fontSize: 'clamp(28px,6vw,38px)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 950, lineHeight: 1 }}>{stat.value}</div>
                <div style={{ color: '#7b8492', fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', marginTop: '7px' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="clubs-map-viewport">
          <svg viewBox="0 0 520 650" preserveAspectRatio="xMidYMid meet" aria-label={lang === 'fr' ? 'Carte géographique des clubs MPL' : 'Geographic map of MPL clubs'}>
            <defs>
              <linearGradient id="real-map-fill" x1="160" y1="40" x2="398" y2="590" gradientUnits="userSpaceOnUse">
                <stop stopColor="rgba(34,211,238,0.16)" />
                <stop offset="0.54" stopColor="rgba(6,95,70,0.20)" />
                <stop offset="1" stopColor="rgba(2,6,23,0.30)" />
              </linearGradient>
              <filter id="real-map-glow" x="-35%" y="-35%" width="170%" height="170%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <path
              d="M323 55L363 70L390 88L397 117L382 146L397 193L421 232L447 238L463 250L468 275L463 308L484 326L496 361L493 403L478 464L487 502L473 547L451 579L409 594L358 607L306 618L257 616L212 607L184 592L151 600L123 579L86 536L112 529L139 533L165 526L176 479L171 449L159 439L164 395L164 354L177 313L199 274L236 247L275 236L300 218L305 176L326 134L350 103L336 93L316 96L292 116L263 116L245 104L260 85L296 72Z"
              fill="url(#real-map-fill)"
              stroke="#34d6ff"
              strokeWidth="3"
              strokeLinejoin="round"
              filter="url(#real-map-glow)"
            />

            {clusters.map((cluster) => {
              const color = ZONE_COLORS[cluster.zone];
              const radius = Math.max(13, Math.min(29, 11 + cluster.courts * 1.3));
              const active = cluster.id === selected?.id;
              return (
                <g
                  key={cluster.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(cluster.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setSelectedId(cluster.id);
                  }}
                  style={{ cursor: 'pointer', outline: 'none' }}
                >
                  <circle cx={cluster.x} cy={cluster.y} r={radius + 9} fill={color} opacity={active ? 0.18 : 0.09} />
                  <circle cx={cluster.x} cy={cluster.y} r={radius} fill={color} fillOpacity={active ? 0.92 : 0.76} stroke={active ? '#ffffff' : color} strokeWidth={active ? 2.2 : 1.5} />
                  {cluster.clubs.length > 1 && (
                    <>
                      <circle cx={cluster.x} cy={cluster.y} r={Math.max(10, radius - 7)} fill="rgba(5,10,18,0.44)" />
                      <text x={cluster.x} y={cluster.y + 5} textAnchor="middle" fill="white" fontSize="17" fontWeight="950">{cluster.clubs.length}</text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '8px' }}>
          {(['Nord', 'Ouest', 'Centre', 'Est'] as LocalRegion[]).map((region) => (
            <span key={region} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', color: '#a9b1bd', fontSize: '14px', fontWeight: 700 }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: ZONE_COLORS[region], boxShadow: `0 0 18px ${ZONE_COLORS[region]}55` }} />
              {region}
            </span>
          ))}
        </div>
      </div>

      {selected && (
        <aside className="clubs-map-panel" style={{
          border: `1px solid ${ZONE_COLORS[selected.zone]}45`,
          borderRadius: '18px',
          background: `linear-gradient(180deg, ${ZONE_COLORS[selected.zone]}14, rgba(255,255,255,0.025))`,
          minWidth: 0,
          boxShadow: `0 24px 60px ${ZONE_COLORS[selected.zone]}10`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', marginBottom: '18px' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', color: ZONE_COLORS[selected.zone], fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>
                <MapPin size={14} /> {selected.zone}
              </div>
              <h3 style={{ color: 'white', margin: '7px 0 0', fontSize: '24px', lineHeight: 1.05 }}>{selected.place}</h3>
            </div>
            {selected.clubs.length > 1 && (
              <span style={{ color: 'white', background: `${ZONE_COLORS[selected.zone]}24`, border: `1px solid ${ZONE_COLORS[selected.zone]}55`, padding: '8px 11px', borderRadius: '999px', fontWeight: 900 }}>
                {selected.clubs.length} clubs
              </span>
            )}
          </div>

          <div className="clubs-map-stats">
            {[
              { value: selected.clubs.length, label: 'Clubs' },
              { value: selected.courts, label: lang === 'fr' ? 'Terrains' : 'Courts' },
              { value: selected.events, label: lang === 'fr' ? 'Événements' : 'Events' },
            ].map((stat) => (
              <div key={stat.label} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '12px', background: 'rgba(255,255,255,0.025)' }}>
                <div style={{ color: ZONE_COLORS[selected.zone], fontSize: '22px', fontWeight: 950, fontFamily: 'JetBrains Mono, monospace' }}>{stat.value}</div>
                <div style={{ color: '#858b96', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {selected.clubs.map((club) => (
              <a
                key={club.name}
                href={`#/clubs?club=${encodeURIComponent(club.name)}`}
                className="clubs-map-club-link"
                style={{
                  color: 'inherit',
                  textDecoration: 'none',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  padding: '14px',
                  background: 'rgba(0,0,0,0.20)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong style={{ color: 'white', display: 'block', fontSize: '14px', lineHeight: 1.2 }}>{club.name}</strong>
                  <span style={{ color: '#8d96a3', fontSize: '12px' }}>
                    {club.courts} {lang === 'fr' ? 'terrains' : 'courts'} · {club.events} {lang === 'fr' ? 'événements' : 'events'}
                  </span>
                </div>
                <ExternalLink size={16} color={ZONE_COLORS[selected.zone]} />
              </a>
            ))}
          </div>

          <p style={{ margin: '16px 0 0', color: '#7e8794', fontSize: '12px', lineHeight: 1.5 }}>
            {lang === 'fr' ? 'Touchez un point sur la carte pour changer de lieu.' : 'Tap a map point to switch location.'}
          </p>
        </aside>
      )}
    </div>
    </>
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
          <GlassCard style={{ padding: 'clamp(20px,4vw,40px)', overflow: 'visible' }}>
            <ClubsMap lang={lang} />
          </GlassCard>
        </div>
      </section>
    </Layout>
  );
}
