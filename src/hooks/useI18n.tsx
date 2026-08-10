import { useState, useContext, createContext } from 'react';
import type { Language } from '@/lib/index';
import { MPL_STATS } from '@/lib/index';

// ── Translations ──────────────────────────────────────────────────────────────
const translations = {
  fr: {
    nav: {
      home: 'Accueil', league: 'La Ligue', regions: 'Régions',
      clubs: 'Clubs', calendar: 'Calendrier', rankings: 'Classements', players: 'Joueurs', results: 'Résultats', history: 'Historique', gallery: 'Galerie', admin: 'Admin',
    },
    hero: {
      subtitle: 'AfrAsia Bank Padel League — Saison 2026',
      cta1: 'Découvrir la Ligue', cta2: 'Voir les Tournois',
      stats: { clubs: 'Clubs', courts: 'Terrains', tournaments: 'Tournois', regions: 'Régions' },
    },
    league: {
      title: 'La Ligue', badge: 'Notre Vision',
      mission: `La Mauritius Padel League (MPL) est la ligue officielle du padel à l'île Maurice, sous l'égide de la Mauritius Squash Rackets Association (MSRA). Avec ${MPL_STATS.clubs} clubs affiliés, ${MPL_STATS.courts} terrains et ${MPL_STATS.tournaments} tournois programmés en 2026, elle organise des compétitions dans 4 régions — Nord, Ouest, Centre et Est — à travers 10 catégories : M25, M50, M100, M250, M500, M1000, Mixte, Junior U11, U13 et U15.`,
      features: [
        { title: 'Excellence Sportive', desc: "Des tournois de classe mondiale avec les meilleures paires de l'île." },
        { title: 'Unité Nationale',     desc: 'Rassembler les 4 régions de Maurice autour de la passion du padel.' },
        { title: 'Développement',       desc: 'Former la prochaine génération de champions mauriciens.' },
        { title: 'Innovation',          desc: 'API Live pour OBS, classements en temps réel, gestion digitale.' },
      ],
      categories: 'Catégories de Tournois',
    },
    regions: {
      title: 'Les 4 Régions', subtitle: "Le padel couvre toute l'île de Maurice",
      clubs_label: 'clubs', courts_label: 'terrains', tournaments_label: 'tournois',
    },
    clubs: {
      title: 'Nos Clubs', subtitle: "18 clubs répartis sur l'ensemble de l'île",
      filter_all: 'Tous', see_all: 'Voir tous les 18 clubs', courts: 'terrains',
      view_details: 'Voir détails →',
    },
    calendar: {
      title: 'Calendrier', subtitle: `${MPL_STATS.tournaments} tournois programmés pour la saison 2026`,
      filter_region: 'Région', filter_category: 'Catégorie', filter_division: 'Division',
      all: 'Tous', teams: 'paires', registered: 'inscrites',
    },
    rankings: {
      title: 'Classements', subtitle: 'Classements officiels MPL Saison 2026',
      men: 'Hommes', women: 'Femmes', junior: 'Junior',
      rank: '#', team: 'Paire', club: 'Club', region: 'Région', points: 'Pts', played: 'Tournois',
    },
    admin: {
      title: 'Espace Admin', badge: 'Accès Restreint',
      email: 'Email', password: 'Mot de passe', login: 'Se connecter',
      features: [
        { title: 'Dashboard',   desc: "Vue d'ensemble des activités de la ligue." },
        { title: 'Clubs',       desc: 'Gérer les 18 clubs membres.' },
        { title: 'Joueurs',     desc: 'Registre complet des joueurs licenciés.' },
        { title: 'Tournois',    desc: 'Créer et gérer les tournois.' },
        { title: 'Brackets',    desc: 'Génération automatique des tableaux.' },
        { title: 'API OBS',     desc: 'Données live pour diffusion en direct.' },
      ],
      dashboard: {
        title: 'Tableau de Bord', welcome: "Bienvenue dans l'espace admin MPL",
        stats: [
          { label: 'Clubs actifs',       value: '18'    },
          { label: 'Tournois à venir',  value: '10'    },
          { label: 'Joueurs classés',   value: '1 992' },
          { label: 'Tournois complétés',value: '88'    },
        ],
        recent: 'Activité Récente', upcoming: 'Prochains Tournois',
      },
    },
    footer: {
      description: "La ligue officielle du padel à l'île Maurice, sous l'égide de la Mauritius Squash Rackets Association (MSRA). Organisateur de la Première Ligue Nationale depuis 2023.",
      navigation: 'Navigation', tournaments: 'Tournois', contact: 'Contact',
      partner: 'Partenaire Officiel', sponsor: 'Sponsor Titre',
      rights: '© 2026 AfrAsia Bank Padel League · Mauritius Padel League. Tous droits réservés.',
      contact_items: [
        'DGT Associates, 24 Avenue des Hirondelles, Sodnac, Quatre Bornes',
        '+230 5944 9474',
        'pascal@padelleague.mu',
        'mauritius.squash@gmail.com',
      ],
    },
  },
  en: {
    nav: {
      home: 'Home', league: 'The League', regions: 'Regions',
      clubs: 'Clubs', calendar: 'Calendar', rankings: 'Rankings', players: 'Players', results: 'Results', history: 'History', gallery: 'Gallery', admin: 'Admin',
    },
    hero: {
      subtitle: 'AfrAsia Bank Padel League — Season 2026',
      cta1: 'Discover the League', cta2: 'View Tournaments',
      stats: { clubs: 'Clubs', courts: 'Courts', tournaments: 'Tournaments', regions: 'Regions' },
    },
    league: {
      title: 'The League', badge: 'Our Vision',
      mission: `The Mauritius Padel League (MPL) is the official padel league of Mauritius, under the aegis of the Mauritius Squash Rackets Association (MSRA). With ${MPL_STATS.clubs} affiliated clubs, ${MPL_STATS.courts} courts and ${MPL_STATS.tournaments} tournaments scheduled in 2026, it organizes competitions across 4 regions — North, West, Centre and East — through 10 categories: M25, M50, M100, M250, M500, M1000, Mixed, Junior U11, U13 and U15.`,
      features: [
        { title: 'Sporting Excellence', desc: 'World-class tournaments with the best pairs on the island.' },
        { title: 'National Unity',      desc: 'Bringing the 4 regions of Mauritius together through padel.' },
        { title: 'Development',         desc: 'Training the next generation of Mauritian champions.' },
        { title: 'Innovation',          desc: 'Live API for OBS, real-time rankings, digital management.' },
      ],
      categories: 'Tournament Categories',
    },
    regions: {
      title: 'The 4 Regions', subtitle: 'Padel covers the entire island of Mauritius',
      clubs_label: 'clubs', courts_label: 'courts', tournaments_label: 'tournaments',
    },
    clubs: {
      title: 'Our Clubs', subtitle: '18 clubs across the entire island',
      filter_all: 'All', see_all: 'View all 18 clubs', courts: 'courts',
      view_details: 'View details →',
    },
    calendar: {
      title: 'Calendar', subtitle: `${MPL_STATS.tournaments} tournaments scheduled for the 2026 season`,
      filter_region: 'Region', filter_category: 'Category', filter_division: 'Division',
      all: 'All', teams: 'pairs', registered: 'registered',
    },
    rankings: {
      title: 'Rankings', subtitle: 'Official MPL Rankings Season 2026',
      men: 'Men', women: 'Women', junior: 'Junior',
      rank: '#', team: 'Pair', club: 'Club', region: 'Region', points: 'Pts', played: 'Tournaments',
    },
    admin: {
      title: 'Admin Area', badge: 'Restricted Access',
      email: 'Email', password: 'Password', login: 'Sign In',
      features: [
        { title: 'Dashboard',   desc: 'Overview of league activities.' },
        { title: 'Clubs',       desc: 'Manage the 18 member clubs.' },
        { title: 'Players',     desc: 'Complete register of licensed players.' },
        { title: 'Tournaments', desc: 'Create and manage tournaments.' },
        { title: 'Brackets',    desc: 'Automatic bracket generation.' },
        { title: 'OBS API',     desc: 'Live data for live broadcasting.' },
      ],
      dashboard: {
        title: 'Dashboard', welcome: 'Welcome to the MPL admin area',
        stats: [
          { label: 'Active clubs',          value: '18'    },
          { label: 'Upcoming tournaments', value: '10'    },
          { label: 'Ranked players',       value: '1,864' },
          { label: 'Completed tournaments',value: '88'    },
        ],
        recent: 'Recent Activity', upcoming: 'Upcoming Tournaments',
      },
    },
    footer: {
      description: 'The official padel league of Mauritius, under the aegis of the Mauritius Squash Rackets Association (MSRA). Organizer of the National Premier League since 2023.',
      navigation: 'Navigation', tournaments: 'Tournaments', contact: 'Contact',
      partner: 'Official Partner', sponsor: 'Title Sponsor',
      rights: '© 2026 AfrAsia Bank Padel League · Mauritius Padel League. All rights reserved.',
      contact_items: [
        'DGT Associates, 24 Avenue des Hirondelles, Sodnac, Quatre Bornes',
        '+230 5944 9474',
        'pascal@padelleague.mu',
        'mauritius.squash@gmail.com',
      ],
    },
  },
} as const;

export type Translations = typeof translations.fr;

// ── Context ───────────────────────────────────────────────────────────────────
interface I18nContextType {
  lang: Language;
  setLang: (l: Language) => void;
  t: Translations;
}

export const I18nContext = createContext<I18nContextType>({
  lang: 'fr',
  setLang: () => undefined,
  t: translations.fr,
});

// ── Provider ──────────────────────────────────────────────────────────────────
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>('fr');
  const t = translations[lang] as unknown as Translations;
  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useI18n() {
  return useContext(I18nContext);
}
