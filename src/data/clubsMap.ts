// Clubs affiches sur la carte interactive (page Clubs).
// Pour modifier un club : changer son nom, sa region, son nombre de terrains
// ou ses coordonnees ci-dessous ; les totaux et la legende se recalculent seuls.
// Coordonnees en degres decimaux : latitude (negative, hemisphere sud) puis
// longitude. Ce sont des reperes publies, pas des releves topographiques.

export type ClubMapRegion = 'NORD' | 'OUEST' | 'CENTRE' | 'EST';

export interface ClubMapEntry {
  id: number;
  name: string;
  region: ClubMapRegion;
  courts: number;
  lat: number;
  lng: number;
  /** Lien Google Maps fourni ; a defaut, un lien est construit depuis les coordonnees. */
  mapsUrl?: string;
  /** Precision affichee dans la fiche du club. */
  note?: string;
}

export const CLUB_MAP_REGIONS: Record<ClubMapRegion, { label: string; color: string; letter: string }> = {
  NORD:   { label: 'Nord',   color: '#3b82f6', letter: 'N' },
  OUEST:  { label: 'Ouest',  color: '#10b981', letter: 'O' },
  CENTRE: { label: 'Centre', color: '#8b5cf6', letter: 'C' },
  EST:    { label: 'Est',    color: '#f59e0b', letter: 'E' },
};

export const CLUB_MAP_REGION_ORDER: ClubMapRegion[] = ['NORD', 'OUEST', 'CENTRE', 'EST'];

export const CLUBS_MAP: ClubMapEntry[] = [
  { id: 1,  name: 'Caña Beau Plan',                 region: 'NORD',   courts: 5, lat: -20.094933813, lng: 57.586667170 },
  { id: 2,  name: 'Club Med Albion',                region: 'OUEST',  courts: 3, lat: -20.217436625, lng: 57.397347641 },
  { id: 3,  name: 'Urban Sport Grand Baie',         region: 'NORD',   courts: 3, lat: -20.0114278,   lng: 57.5984873 },
  { id: 4,  name: 'Urban Sport Black River',        region: 'OUEST',  courts: 4, lat: -20.3644304,   lng: 57.382951,
    mapsUrl: 'https://maps.app.goo.gl/aZcirRnnTLJaACgS9' },
  { id: 5,  name: 'SPARC Cascavelle',               region: 'OUEST',  courts: 4, lat: -20.277105349, lng: 57.396219004 },
  { id: 6,  name: 'RM Club Tamarin',                region: 'OUEST',  courts: 5, lat: -20.331221151, lng: 57.382628011 },
  { id: 7,  name: 'I PADEL BY RM Henessy',          region: 'CENTRE', courts: 4, lat: -20.242655243, lng: 57.489691475 },
  { id: 8,  name: 'RM Club Forbach',                region: 'NORD',   courts: 7, lat: -20.0568375,   lng: 57.614078125 },
  { id: 9,  name: 'Labourdonnais Mapou',            region: 'NORD',   courts: 3, lat: -20.069947515, lng: 57.614905719 },
  { id: 10, name: 'I PADEL BY RM Port Chambly',     region: 'CENTRE', courts: 3, lat: -20.111056098, lng: 57.523839523 },
  { id: 11, name: 'Studio By RM Azuri',             region: 'EST',    courts: 3, lat: -20.099010843, lng: 57.708325025 },
  { id: 12, name: 'Isla Padel Grand Baie',          region: 'NORD',   courts: 6, lat: -20.021944964, lng: 57.577814573 },
  { id: 13, name: 'terres Brunes Sports & Leisure', region: 'OUEST',  courts: 3, lat: -20.344728,    lng: 57.388136 },
  { id: 14, name: 'Mont Choisy Golf',               region: 'NORD',   courts: 2, lat: -20.027244078, lng: 57.560090823 },
  { id: 15, name: 'Oxygen Moka',                    region: 'CENTRE', courts: 2, lat: -20.32839,     lng: 57.5101135,
    mapsUrl: 'https://maps.app.goo.gl/CE3VmzfT5uuoUN4d6', note: 'Emplacement fourni : Dodo Club, Curepipe' },
  { id: 16, name: 'Club House',                     region: 'OUEST',  courts: 2, lat: -20.3691879,   lng: 57.3791872 },
  { id: 17, name: 'Energia Pointe aux Cannonniers', region: 'NORD',   courts: 2, lat: -20.002631350, lng: 57.554626855 },
  { id: 18, name: 'Moka Rangers',                   region: 'CENTRE', courts: 4, lat: -20.228209421, lng: 57.520214030 },
];

export function clubMapsUrl(club: ClubMapEntry): string {
  return club.mapsUrl ?? `https://www.google.com/maps/search/?api=1&query=${club.lat},${club.lng}`;
}
