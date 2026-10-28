import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { ExternalLink, MapPin, Maximize2 } from 'lucide-react';
import {
  CLUBS_MAP, CLUB_MAP_REGIONS, CLUB_MAP_REGION_ORDER, clubMapsUrl,
  type ClubMapEntry, type ClubMapRegion,
} from '@/data/clubsMap';

// Carte interactive des clubs (Leaflet + tuiles OpenStreetMap, sans cle API ;
// assombries en CSS pour suivre le theme du site. Le fond sombre CARTO exige
// desormais une cle et n'est donc pas utilise).
// - Molette / glisser au doigt actifs seulement apres un clic sur la carte,
//   pour ne pas capturer le defilement de la page.
// - Regroupement des reperes proches a faible zoom ; libelles nom + terrains
//   a partir du zoom 13, ou chaque club est separe.

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contributeurs OpenStreetMap</a>';
const LABEL_ZOOM = 13;
// Emprise de l'ile principale (repli si un filtre ne laisse aucun club).
const MAURITIUS_BOUNDS = L.latLngBounds([-20.53, 57.30], [-19.98, 57.81]);

type Filter = ClubMapRegion | 'ALL';

// Vue d'ensemble : toute l'ile principale et tous les clubs.
const allClubsBounds = () => L.latLngBounds(CLUBS_MAP.map(c => [c.lat, c.lng] as [number, number])).extend(MAURITIUS_BOUNDS);

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const courtsLabel = (n: number) => `${n} terrain${n > 1 ? 's' : ''}`;

function markerIcon(club: ClubMapEntry, active: boolean) {
  const r = CLUB_MAP_REGIONS[club.region];
  return L.divIcon({
    className: 'cm-marker-wrap',
    html: `<span class="cm-marker${active ? ' is-active' : ''}" style="--c:${r.color}" aria-hidden="true">${r.letter}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
    tooltipAnchor: [14, 0],
  });
}

function popupHtml(club: ClubMapEntry) {
  const r = CLUB_MAP_REGIONS[club.region];
  return `<div class="cm-popup">
    <strong class="cm-popup-name">${escapeHtml(club.name)}</strong>
    <div class="cm-popup-meta">
      <span class="cm-popup-region" style="--c:${r.color}"><b>${r.letter}</b> Région ${r.label}</span>
      <span>${courtsLabel(club.courts)}</span>
    </div>
    ${club.note ? `<p class="cm-popup-note">${escapeHtml(club.note)}</p>` : ''}
    <a class="cm-popup-link" href="${escapeHtml(clubMapsUrl(club))}" target="_blank" rel="noopener noreferrer">Voir sur Google Maps ↗</a>
  </div>`;
}

export default function ClubsMap() {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef(new Map<number, L.Marker>());
  const viewTouchedRef = useRef(false);
  const fitCurrentRef = useRef<() => void>(() => {});
  const [filter, setFilter] = useState<Filter>('ALL');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [interactive, setInteractive] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);

  const visibleClubs = useMemo(
    () => CLUBS_MAP.filter(c => filter === 'ALL' || c.region === filter),
    [filter],
  );
  const totals = useMemo(() => ({
    clubs: visibleClubs.length,
    courts: visibleClubs.reduce((s, c) => s + c.courts, 0),
  }), [visibleClubs]);
  const regionTotals = useMemo(() => Object.fromEntries(CLUB_MAP_REGION_ORDER.map(region => {
    const list = CLUBS_MAP.filter(c => c.region === region);
    return [region, { clubs: list.length, courts: list.reduce((s, c) => s + c.courts, 0) }];
  })) as Record<ClubMapRegion, { clubs: number; courts: number }>, []);

  // Creation de la carte (une seule fois)
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, {
      scrollWheelZoom: false,
      dragging: !L.Browser.mobile,
      zoomSnap: 0.5,
      minZoom: 9,
      maxZoom: 18,
      maxBounds: MAURITIUS_BOUNDS.pad(0.6),
      attributionControl: true,
    });
    map.attributionControl.setPrefix(false);
    let loadedTiles = 0;
    let failedTiles = 0;
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 })
      .on('tileload', () => { loadedTiles++; setTilesFailed(false); })
      .on('tileerror', () => { failedTiles++; if (loadedTiles === 0 && failedTiles >= 4) setTilesFailed(true); })
      .addTo(map);

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 38,
      disableClusteringAtZoom: LABEL_ZOOM,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: false,
      iconCreateFunction: (c) => {
        const children = c.getAllChildMarkers();
        const courts = children.reduce((s, m) => s + (((m.options as { courts?: number }).courts) ?? 0), 0);
        return L.divIcon({
          className: 'cm-cluster-wrap',
          html: `<span class="cm-cluster" title="${children.length} clubs · ${courts} terrains — zoomer pour les détailler">${children.length}</span>`,
          iconSize: [36, 36],
        });
      },
    });
    map.addLayer(cluster);

    for (const club of CLUBS_MAP) {
      const marker = L.marker([club.lat, club.lng], {
        icon: markerIcon(club, false),
        keyboard: true,
        title: `${club.name} — ${courtsLabel(club.courts)}`,
        riseOnHover: true,
        courts: club.courts,
      } as L.MarkerOptions & { courts: number });
      // Repere focusable au clavier (Entree ouvre la fiche) : libelle explicite.
      marker.on('add', () => {
        const el = marker.getElement();
        el?.setAttribute('role', 'button');
        el?.setAttribute('aria-label', `${club.name}, région ${CLUB_MAP_REGIONS[club.region].label}, ${courtsLabel(club.courts)}`);
      });
      marker.bindPopup(popupHtml(club), { maxWidth: 260, autoPanPadding: [24, 24] });
      marker.bindTooltip(`${escapeHtml(club.name)} <span>· ${club.courts}</span>`, {
        permanent: true, direction: 'right', className: 'cm-label', opacity: 1,
      });
      marker.on('popupopen', () => setActiveId(club.id));
      marker.on('popupclose', () => setActiveId(prev => (prev === club.id ? null : prev)));
      markersRef.current.set(club.id, marker);
    }

    const syncLabels = () => {
      mapEl.current?.classList.toggle('cm-labels-off', map.getZoom() < LABEL_ZOOM);
    };
    map.on('zoomend', syncLabels);
    // Activation des gestes apres un clic (souris) ou un toucher sur la carte.
    map.on('click', () => setInteractive(true));
    map.on('focus', () => setInteractive(true));

    // Tant que le visiteur n'a pas deplace la carte, un changement de taille
    // (chargement, rotation, section d'abord masquee) recadre la vue.
    map.on('dragstart popupopen', () => { viewTouchedRef.current = true; });
    map.zoomControl.getContainer()?.addEventListener('click', () => { viewTouchedRef.current = true; });
    mapEl.current.addEventListener('wheel', () => { if (map.scrollWheelZoom.enabled()) viewTouchedRef.current = true; }, { passive: true });

    mapRef.current = map;
    clusterRef.current = cluster;
    map.fitBounds(allClubsBounds(), { padding: [24, 24] });
    syncLabels();

    // Redimensionnement (y compris section d'abord masquee)
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      if (!viewTouchedRef.current) fitCurrentRef.current();
    });
    ro.observe(mapEl.current);
    const markerMap = markersRef.current;
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; clusterRef.current = null; markerMap.clear(); };
  }, []);

  // Gestes actives / desactives
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (interactive) { map.scrollWheelZoom.enable(); map.dragging.enable(); }
    else { map.scrollWheelZoom.disable(); if (L.Browser.mobile) map.dragging.disable(); }
  }, [interactive]);

  // Filtre : reperes affiches + cadrage
  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !cluster) return;
    cluster.clearLayers();
    const markers = visibleClubs.map(c => markersRef.current.get(c.id)).filter(Boolean) as L.Marker[];
    cluster.addLayers(markers);
    map.closePopup();
    fitCurrentRef.current = () => {
      if (markers.length === CLUBS_MAP.length || !markers.length) map.fitBounds(allClubsBounds(), { padding: [24, 24], animate: false });
      else map.fitBounds(L.latLngBounds(markers.map(m => m.getLatLng())), { padding: [48, 48], maxZoom: 13, animate: false });
    };
    viewTouchedRef.current = false;
    fitCurrentRef.current();
  }, [visibleClubs]);

  // Repere actif mis en evidence
  useEffect(() => {
    for (const club of CLUBS_MAP) markersRef.current.get(club.id)?.setIcon(markerIcon(club, club.id === activeId));
  }, [activeId]);

  const focusClub = (club: ClubMapEntry) => {
    const marker = markersRef.current.get(club.id);
    const cluster = clusterRef.current;
    const map = mapRef.current;
    if (!marker || !cluster || !map) return;
    // La liste n'affiche que les clubs du filtre actif : le repere est sur la carte.
    // Au-dela de LABEL_ZOOM, plus aucun regroupement : le repere est individuel.
    // Recentrage sans animation : immediat et fiable (les animations de zoom
    // attendent requestAnimationFrame, suspendu quand l'onglet est en arriere-plan).
    const target = Math.max(map.getZoom(), LABEL_ZOOM + 1);
    map.closePopup();
    map.setView(marker.getLatLng(), target, { animate: false });
    window.setTimeout(() => { if (cluster.hasLayer(marker)) marker.openPopup(); }, 0);
    mapEl.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const showAll = () => {
    setFilter('ALL');
    const map = mapRef.current;
    map?.closePopup();
    map?.fitBounds(allClubsBounds(), { padding: [24, 24], animate: false });
    viewTouchedRef.current = false;
  };

  return (
    <section className="cm-root" aria-labelledby="cm-title">
      <div className="cm-head">
        <div>
          <h2 id="cm-title"><MapPin size={18} aria-hidden="true" /> Carte des clubs</h2>
          <p className="cm-total" aria-live="polite">
            <b>{totals.clubs}</b> club{totals.clubs > 1 ? 's' : ''} · <b>{totals.courts}</b> terrains
            {filter !== 'ALL' && <span> — région {CLUB_MAP_REGIONS[filter].label}</span>}
          </p>
        </div>
        <div className="cm-filters" role="group" aria-label="Filtrer par région">
          <button type="button" aria-pressed={filter === 'ALL'} className={filter === 'ALL' ? 'is-on' : ''} onClick={() => setFilter('ALL')}>
            Toutes ({CLUBS_MAP.length})
          </button>
          {CLUB_MAP_REGION_ORDER.map(region => {
            const r = CLUB_MAP_REGIONS[region];
            return (
              <button key={region} type="button" aria-pressed={filter === region} className={filter === region ? 'is-on' : ''}
                style={{ '--c': r.color } as React.CSSProperties} onClick={() => setFilter(region)}>
                <span className="cm-dot" aria-hidden="true">{r.letter}</span>{r.label} ({regionTotals[region].clubs})
              </button>
            );
          })}
          <button type="button" className="cm-reset" onClick={showAll}><Maximize2 size={13} aria-hidden="true" /> Voir tous les clubs</button>
        </div>
      </div>

      <div className="cm-body">
        <div className="cm-map-wrap">
          <div ref={mapEl} className="cm-map" role="region" aria-label="Carte interactive des clubs de padel de l'île Maurice" />
          {!interactive && (
            <button type="button" className="cm-activate" onClick={() => setInteractive(true)}>
              {L.Browser.mobile ? 'Touchez pour activer la carte' : 'Cliquez pour zoomer à la molette'}
            </button>
          )}
          {tilesFailed && (
            <div className="cm-tiles-error" role="status">
              Fond de carte indisponible pour le moment. Les repères et la liste des clubs restent utilisables.
            </div>
          )}
          <ul className="cm-legend" aria-label="Légende des régions">
            {CLUB_MAP_REGION_ORDER.map(region => {
              const r = CLUB_MAP_REGIONS[region];
              return (
                <li key={region} style={{ '--c': r.color } as React.CSSProperties}>
                  <span className="cm-dot" aria-hidden="true">{r.letter}</span>
                  {r.label} · {regionTotals[region].clubs} club{regionTotals[region].clubs > 1 ? 's' : ''} · {regionTotals[region].courts} terrains
                </li>
              );
            })}
          </ul>
        </div>

        <div className="cm-list" aria-label="Liste des clubs">
          <ol>
            {visibleClubs
              .slice()
              .sort((a, b) => CLUB_MAP_REGION_ORDER.indexOf(a.region) - CLUB_MAP_REGION_ORDER.indexOf(b.region) || a.name.localeCompare(b.name, 'fr'))
              .map(club => {
                const r = CLUB_MAP_REGIONS[club.region];
                return (
                  <li key={club.id}>
                    <button type="button" className={activeId === club.id ? 'is-active' : ''} style={{ '--c': r.color } as React.CSSProperties}
                      onClick={() => focusClub(club)} aria-label={`Afficher ${club.name} sur la carte, région ${r.label}, ${courtsLabel(club.courts)}`}>
                      <span className="cm-dot" aria-hidden="true">{r.letter}</span>
                      <span className="cm-list-name">{club.name}</span>
                      <span className="cm-list-courts">{club.courts}</span>
                    </button>
                    {activeId === club.id && (
                      <a className="cm-list-link" href={clubMapsUrl(club)} target="_blank" rel="noopener noreferrer">
                        Voir sur Google Maps <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    )}
                  </li>
                );
              })}
          </ol>
          <p className="cm-list-foot">Nombre = terrains. Positions indicatives (repères publiés).</p>
        </div>
      </div>

      <style>{`
        .cm-root { margin: 0 0 40px; border: 1px solid rgba(74,213,105,0.15); border-radius: 16px; background: rgba(255,255,255,0.025); padding: 16px; }
        .cm-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
        .cm-head h2 { display: flex; align-items: center; gap: 8px; margin: 0; color: white; font-size: 18px; font-weight: 800; }
        .cm-head h2 svg { color: #4ad569; }
        .cm-total { margin: 4px 0 0; color: #9ca3af; font-size: 13px; }
        .cm-total b { color: #4ad569; font-family: 'JetBrains Mono', monospace; }
        .cm-filters { display: flex; gap: 6px; flex-wrap: wrap; }
        .cm-filters button { --c: #4ad569; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; cursor: pointer; font-size: 12px; font-weight: 700; font-family: inherit;
          background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.65); border: 1px solid rgba(255,255,255,0.08); }
        .cm-filters button.is-on { background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); border-color: color-mix(in srgb, var(--c) 55%, transparent); }
        .cm-filters button:focus-visible, .cm-list button:focus-visible, .cm-activate:focus-visible { outline: 2px solid #4ad569; outline-offset: 2px; }
        .cm-filters .cm-reset { color: #4ad569; border-color: rgba(74,213,105,0.3); }
        .cm-dot { --c: #4ad569; display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; flex: 0 0 18px; border-radius: 50%; background: var(--c); color: #0a0a0a; font-size: 10px; font-weight: 900; }
        .cm-filters button > .cm-dot, .cm-legend .cm-dot, .cm-list .cm-dot { background: var(--c); }
        .cm-body { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; }
        .cm-map-wrap { position: relative; min-width: 0; }
        .cm-map { height: clamp(380px, 64vh, 640px); border-radius: 12px; overflow: hidden; background: #0d1117; border: 1px solid rgba(255,255,255,0.08); }
        .cm-activate { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 500; border: 1px solid rgba(74,213,105,0.35); background: rgba(10,10,10,0.85); color: #d1d5db; font-size: 12px; padding: 6px 12px; border-radius: 999px; cursor: pointer; font-family: inherit; white-space: nowrap; max-width: calc(100% - 100px); overflow: hidden; text-overflow: ellipsis; }
        .cm-tiles-error { position: absolute; left: 12px; right: 12px; top: 50px; z-index: 500; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.35); color: #fecaca; font-size: 13px; padding: 10px 12px; border-radius: 10px; }
        .cm-legend { position: absolute; left: 10px; bottom: 26px; z-index: 500; list-style: none; margin: 0; padding: 8px 10px; display: grid; gap: 4px; background: rgba(10,10,10,0.82); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: #d1d5db; font-size: 11px; }
        .cm-legend li { --c: #4ad569; display: flex; align-items: center; gap: 6px; }
        .cm-list { min-width: 0; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; background: rgba(0,0,0,0.25); display: flex; flex-direction: column; max-height: clamp(380px, 64vh, 640px); }
        .cm-list ol { list-style: none; margin: 0; padding: 6px; overflow-y: auto; flex: 1; }
        .cm-list li + li { margin-top: 2px; }
        .cm-list button { --c: #4ad569; width: 100%; display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: #e5e7eb; cursor: pointer; text-align: left; font-family: inherit; font-size: 13px; }
        .cm-list button:hover { background: rgba(255,255,255,0.05); }
        .cm-list button.is-active { background: color-mix(in srgb, var(--c) 14%, transparent); border-color: color-mix(in srgb, var(--c) 45%, transparent); }
        .cm-list-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cm-list-courts { color: #4ad569; font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 12px; }
        .cm-list-link { display: inline-flex; align-items: center; gap: 4px; margin: 2px 0 6px 34px; color: #4ad569; font-size: 12px; font-weight: 700; text-decoration: none; }
        .cm-list-link:hover { text-decoration: underline; }
        .cm-list-foot { margin: 0; padding: 8px 12px; border-top: 1px solid rgba(255,255,255,0.06); color: #6b7280; font-size: 11px; }
        /* Leaflet */
        .cm-map .leaflet-container, .cm-map.leaflet-container { font-family: inherit; background: #0d1117; }
        .cm-map .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.82) contrast(0.92) saturate(0.55); }
        .cm-marker-wrap { background: none; border: none; }
        .cm-marker { --c: #4ad569; display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: var(--c); color: #0a0a0a; font-weight: 900; font-size: 12px; border: 2px solid rgba(255,255,255,0.9); box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 30%, transparent), 0 4px 10px rgba(0,0,0,0.5); box-sizing: border-box; }
        .cm-marker.is-active { transform: scale(1.25); box-shadow: 0 0 0 6px color-mix(in srgb, var(--c) 45%, transparent), 0 4px 14px rgba(0,0,0,0.6); }
        .leaflet-marker-icon:focus-visible .cm-marker, .leaflet-marker-icon:focus .cm-marker { outline: 3px solid #fff; outline-offset: 2px; }
        .cm-cluster-wrap { background: none; border: none; }
        .cm-cluster { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; background: rgba(74,213,105,0.9); color: #0a0a0a; font-weight: 900; font-size: 14px; border: 2px solid #fff; box-shadow: 0 0 0 6px rgba(74,213,105,0.25); }
        .leaflet-tooltip.cm-label { background: rgba(10,10,10,0.86); color: #f3f4f6; border: 1px solid rgba(255,255,255,0.14); border-radius: 6px; padding: 2px 7px; font-size: 11px; font-weight: 700; box-shadow: none; white-space: nowrap; }
        .leaflet-tooltip.cm-label span { color: #4ad569; font-family: 'JetBrains Mono', monospace; }
        .leaflet-tooltip.cm-label::before { display: none; }
        .cm-labels-off .leaflet-tooltip.cm-label { display: none; }
        .cm-map .leaflet-popup-content-wrapper { background: #111; color: #e5e7eb; border: 1px solid rgba(74,213,105,0.3); border-radius: 12px; }
        .cm-map .leaflet-popup-tip { background: #111; }
        .cm-map .leaflet-popup-content { margin: 12px 14px; }
        .cm-map a.leaflet-popup-close-button { color: #9ca3af; }
        .cm-popup-name { display: block; color: white; font-size: 14px; margin-bottom: 6px; }
        .cm-popup-meta { display: flex; flex-wrap: wrap; gap: 6px 10px; font-size: 12px; color: #d1d5db; }
        .cm-popup-region { --c: #4ad569; color: var(--c); font-weight: 700; }
        .cm-popup-region b { display: inline-flex; width: 16px; height: 16px; border-radius: 50%; background: var(--c); color: #0a0a0a; font-size: 9px; align-items: center; justify-content: center; margin-right: 3px; }
        .cm-popup-note { margin: 8px 0 0; font-size: 12px; color: #fbbf24; }
        .cm-popup-link { display: inline-block; margin-top: 10px; color: #4ad569 !important; font-weight: 700; font-size: 12px; text-decoration: none; }
        .cm-popup-link:hover { text-decoration: underline; }
        .cm-map .leaflet-control-attribution { background: rgba(10,10,10,0.7); color: #9ca3af; font-size: 10px; }
        .cm-map .leaflet-control-attribution a { color: #d1d5db; }
        .cm-map .leaflet-bar a { background: #161616; color: #e5e7eb; border-bottom-color: #2a2a2a; }
        .cm-map .leaflet-bar a:hover { background: #222; }
        @media (max-width: 900px) {
          .cm-body { grid-template-columns: minmax(0, 1fr); }
          .cm-map { height: clamp(340px, 58vh, 520px); }
          .cm-list { max-height: 360px; }
          .cm-head { align-items: flex-start; }
        }
        @media (max-width: 520px) {
          .cm-root { padding: 12px; }
          .cm-legend { font-size: 10px; bottom: 22px; padding: 6px 8px; }
        }
      `}</style>
    </section>
  );
}
