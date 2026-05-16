import { useState } from 'react';
import { motion } from 'framer-motion';
import { DotWaveBackground, FloatingParticles } from '@/components/DotWaveBackground';
import { Layout, GlassCard, CategoryBadge } from '@/components/Layout';
import { useI18n } from '@/hooks/useI18n';
import { useSeo } from '@/hooks/useSeo';
import { CATEGORY_CONFIG, MPL_STATS } from '@/lib/index';
import type { TournamentCategory } from '@/lib/index';

// ══════════════════════════════════════════════════════════════════
// POINTS RÉELS — source : Points Allocation.xlsx (MPL 2026)
// Colonne choisie : 13-16 équipes (exemple 16 équipes)
// ══════════════════════════════════════════════════════════════════

// Points pour chaque position finale avec 13-16 équipes au tournoi
const POINTS_16: Record<TournamentCategory, number[]> = {
  M25:   [25, 18, 16, 15, 14, 13, 12, 11, 10, 9, 7, 5, 4, 3, 2, 1],
  M100:  [100, 70, 60, 55, 45, 40, 35, 30, 25, 21, 18, 15, 10, 5, 3, 1],
  M250:  [250, 175, 150, 138, 113, 100, 88, 75, 63, 53, 45, 38, 25, 13, 8, 3],
  M500:  [500, 350, 300, 275, 225, 200, 175, 150, 125, 105, 90, 75, 50, 25, 15, 5],
  M1000: [1000, 700, 600, 550, 450, 400, 350, 300, 250, 210, 180, 150, 100, 50, 30, 10],
  // M50 n'a pas sa propre feuille — on utilise moitié M100
  M50:   [50, 35, 30, 28, 23, 20, 18, 15, 13, 11, 9, 8, 5, 3, 2, 1],
};

// Colonnes de taille de tournoi disponibles
const SIZE_COLUMNS = [
  { key: '4-8',   label: '4-8',   col: 0 },
  { key: '9-12',  label: '9-12',  col: 1 },
  { key: '13-16', label: '13-16', col: 2 },
  { key: '17-20', label: '17-20', col: 3 },
  { key: '21-24', label: '21-24', col: 4 },
  { key: '25-28', label: '25-28', col: 5 },
  { key: '29+',   label: '29+',   col: 6 },
];

// Points complets par catégorie ET par taille de tournoi (16 lignes max)
const FULL_POINTS: Record<TournamentCategory, Record<string, (number | null)[]>> = {
  M25: {
    '4-8':   [25,15,12,9,6,4,2,1,null,null,null,null,null,null,null,null],
    '9-12':  [25,17,15,13,11,9,7,5,4,3,2,1,null,null,null,null],
    '13-16': [25,18,16,15,14,13,12,11,10,9,7,5,4,3,2,1],
    '17-20': [25,20,18,17,16,15,14,13,12,11,10,9,8,7,6,5],
    '21-24': [25,20,19,18,17,16,15,14,13,12,11,10,9,8,7,6],
    '25-28': [25,21,19,18,17,16,15,14,13,12,11,10,9,8,7,6],
    '29+':   [25,23,21,19,18,17,16,15,14,13,12,11,10,9,8,7],
  },
  M50: {
    '4-8':   [50,30,24,18,12,8,4,2,null,null,null,null,null,null,null,null],
    '9-12':  [50,34,30,26,22,18,14,10,8,6,4,2,null,null,null,null],
    '13-16': [50,35,30,28,23,20,18,15,13,11,9,8,5,3,2,1],
    '17-20': [50,40,36,34,32,30,28,26,24,22,20,18,16,14,12,10],
    '21-24': [50,40,38,36,34,32,30,28,26,24,22,20,18,16,14,12],
    '25-28': [50,42,38,36,34,32,30,28,26,24,22,20,18,16,14,12],
    '29+':   [50,46,42,38,36,34,32,30,28,26,24,22,20,18,16,14],
  },
  M100: {
    '4-8':   [100,60,50,40,25,10,5,1,null,null,null,null,null,null,null,null],
    '9-12':  [100,65,55,50,35,25,20,15,10,5,3,1,null,null,null,null],
    '13-16': [100,70,60,55,45,40,35,30,25,21,18,15,10,5,3,1],
    '17-20': [100,75,65,60,55,50,45,40,35,30,25,23,20,18,15,12],
    '21-24': [100,75,70,65,60,55,50,47,43,40,37,33,30,28,25,23],
    '25-28': [100,80,75,70,65,60,55,53,50,48,45,43,40,38,35,33],
    '29+':   [100,80,75,72,70,65,63,60,58,55,53,50,48,45,43,40],
  },
  M250: {
    '4-8':   [250,150,125,100,63,25,13,3,null,null,null,null,null,null,null,null],
    '9-12':  [250,163,138,125,88,63,50,38,25,13,8,3,null,null,null,null],
    '13-16': [250,175,150,138,113,100,88,75,63,53,45,38,25,13,8,3],
    '17-20': [250,188,163,150,138,125,113,100,88,75,63,58,50,45,38,30],
    '21-24': [250,188,175,163,150,138,125,118,108,100,93,83,75,70,63,58],
    '25-28': [250,200,188,175,163,150,138,133,125,120,113,108,100,95,88,83],
    '29+':   [250,200,188,180,175,163,158,150,145,138,133,125,120,113,108,100],
  },
  M500: {
    '4-8':   [500,300,250,200,125,50,25,5,null,null,null,null,null,null,null,null],
    '9-12':  [500,325,275,250,175,125,100,75,50,25,15,5,null,null,null,null],
    '13-16': [500,350,300,275,225,200,175,150,125,105,90,75,50,25,15,5],
    '17-20': [500,375,325,300,275,250,225,200,175,150,125,115,100,90,75,60],
    '21-24': [500,375,350,325,300,275,250,235,215,200,185,165,150,140,125,115],
    '25-28': [500,400,375,350,325,300,275,265,250,240,225,215,200,190,175,165],
    '29+':   [500,400,375,360,350,325,315,300,290,275,265,250,240,225,215,200],
  },
  M1000: {
    '4-8':   [1000,600,500,400,250,100,50,10,null,null,null,null,null,null,null,null],
    '9-12':  [1000,650,550,500,350,250,200,150,100,50,30,10,null,null,null,null],
    '13-16': [1000,700,600,550,450,400,350,300,250,210,180,150,100,50,30,10],
    '17-20': [1000,750,650,600,550,500,450,400,350,300,250,230,200,180,150,120],
    '21-24': [1000,750,700,650,600,550,500,470,430,400,370,330,300,280,250,230],
    '25-28': [1000,800,750,700,650,600,550,530,500,480,450,430,400,380,350,330],
    '29+':   [1000,800,750,720,700,650,630,600,580,550,530,500,480,450,430,400],
  },
};

// Formats de jeu officiels
const GAME_FORMATS = [
  { id: 'A', desc_fr: '3 sets à 6 jeux',                                        desc_en: '3 sets to 6 games' },
  { id: 'B', desc_fr: '2 sets de 6 jeux + super tie-break décisif à 10 points', desc_en: '2 sets of 6 games + super decisive tie-break at 10 points' },
  { id: 'C', desc_fr: '1 set à 9 jeux, jeu décisif à 7 points si 8/8',          desc_en: '1 set at 9 games, decisive game at 7 points if 8/8' },
  { id: 'D', desc_fr: '1 set de 6 jeux',                                         desc_en: '1 set of 6 games' },
  { id: 'E', desc_fr: '1 tie-break à 10 points',                                 desc_en: '1 tie-break at 10 points' },
];

// Structure tableau par catégorie
const TOURNAMENT_STRUCTURE: Record<TournamentCategory, {
  selection: 'registration' | 'ranking';
  min_courts: number;
  min_teams: number;
  format_fr: string;
  format_en: string;
}> = {
  M25:   { selection: 'registration', min_courts: 2, min_teams: 8,  format_fr: 'Qualifs D-E · R8 C-D · Semi C-D · Finale B-C · Ranking D-E',   format_en: 'Quals D-E · R8 C-D · Semi C-D · Final B-C · Ranking D-E' },
  M50:   { selection: 'registration', min_courts: 2, min_teams: 8,  format_fr: 'Qualifs D-E · R8 C-D · Semi C-D · Finale B-C · Ranking D-E',   format_en: 'Quals D-E · R8 C-D · Semi C-D · Final B-C · Ranking D-E' },
  M100:  { selection: 'registration', min_courts: 2, min_teams: 8,  format_fr: 'Qualifs D-E · R8 C-D · Semi C-D · Finale B-C · Ranking D-E',   format_en: 'Quals D-E · R8 C-D · Semi C-D · Final B-C · Ranking D-E' },
  M250:  { selection: 'registration', min_courts: 2, min_teams: 8,  format_fr: 'Qualifs C-D · R16 C-D · R8 B-C · Semi B-C · Finale A-C · Ranking D-E', format_en: 'Quals C-D · R16 C-D · R8 B-C · Semi B-C · Final A-C · Ranking D-E' },
  M500:  { selection: 'ranking',      min_courts: 3, min_teams: 8,  format_fr: 'Qualifs C-D · R32 C-D · R16 C-D · R8 C · Semi B · Finale A · Ranking C-D-E', format_en: 'Quals C-D · R32 C-D · R16 C-D · R8 C · Semi B · Final A · Ranking C-D-E' },
  M1000: { selection: 'ranking',      min_courts: 4, min_teams: 16, format_fr: 'Qualifs C-D · R32 C-D · R16 C-D · R8 C · Semi B · Finale A · Ranking C-D-E', format_en: 'Quals C-D · R32 C-D · R16 C-D · R8 C · Semi B · Final A · Ranking C-D-E' },
};

// Accès aux tournois (source: who can access.jpeg)
const ACCESS_TABLE = [
  { cat: 'M25',  men_pair: 600,  men_indiv: 250, women_pair: 350, women_indiv: 150 },
  { cat: 'M50',  men_pair: 300,  men_indiv: 125, women_pair: 175, women_indiv: 75  },
  { cat: 'M100', men_pair: 150,  men_indiv: 60,  women_pair: 100, women_indiv: 40  },
  { cat: 'M250', men_pair: 50,   men_indiv: null, women_pair: 40,  women_indiv: null },
];

// Niveaux de padel
const PADEL_LEVELS = [
  { num: 1, name: 'Beginner',     color: '#60a5fa', desc_fr: 'Je commence à jouer. J\'apprends les coups de base.',                                                                 desc_en: 'I start to play. I\'m learning the basic strokes.' },
  { num: 2, name: 'Improvement', color: '#34d399', desc_fr: 'Je joue les coups de base. Je joue lentement avec des échanges courts. Je commence à jouer au filet.',               desc_en: 'I play the basic shots. I play slowly with short rallies. I\'m starting to play at the net.' },
  { num: 3, name: 'Elementary',  color: '#4ade80', desc_fr: 'Je joue pour le loisir. Je sais servir et je joue des matchs en essayant de garder la balle en jeu.',                desc_en: 'I play for leisure. I know how to serve and I play matches with rallies trying to keep the ball in play.' },
  { num: 4, name: 'Intermediate',color: '#facc15', desc_fr: 'Longs échanges. Je vais au filet après un lob. Je joue la balle après rebond sur la vitre. Je maîtrise le placement.', desc_en: 'Long rallies. I go to the net after a lob. I play the ball after bouncing off the glass. I master placement.' },
  { num: 5, name: 'Confirmed',   color: '#fb923c', desc_fr: 'Maîtrise du serve-volley, bandeja, vibora, coups à l\'épaule. Je joue les vitres à 360°.',                          desc_en: 'Mastery of serve-volley, bandeja, vibora. I play windows at 360°.' },
  { num: 6, name: 'Advance',     color: '#f87171', desc_fr: 'Jeu rapide avec effets. Je varie les zones et vitesses au filet. Je maîtrise les doubles vitres et le 360°.',        desc_en: 'Fast play with spin. I vary areas and speeds at the net. I master double windows and 360°.' },
  { num: 7, name: 'Advance +',   color: '#e879f9', desc_fr: 'Maîtrise de tous les aspects tactiques. Bandeja et vibora avec effects forts et contrôlés.',                        desc_en: 'Mastery of all tactical aspects. Bandeja and vibora with strong controlled spin.' },
  { num: 8, name: 'Expert',      color: '#c084fc', desc_fr: 'Top 1 500 français (Hommes) / Top 225 français (Femmes).',                                                           desc_en: 'French top 1,500 (Men) / French top 225 (Women).' },
  { num: 9, name: 'Expert +',    color: '#818cf8', desc_fr: 'Top 500 français (Hommes) / Top 75 français (Femmes).',                                                              desc_en: 'French top 500 (Men) / French top 75 (Women).' },
  { num: 10,name: 'Elite',       color: '#f59e0b', desc_fr: 'Top 200 français (Hommes) / Top 30 français (Femmes).',                                                              desc_en: 'French top 200 (Men) / French top 30 (Women).' },
];

// ── Composant : Stat bubble ────────────────────────────────────────────────────
function StatBubble({ value, label, color = '#4ad569' }: { value: string; label: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 'clamp(36px,5vw,56px)', fontWeight: 900, color, lineHeight: 1, fontFamily: 'JetBrains Mono,monospace' }}>
        {value}
      </div>
      <div style={{ color: '#a0a0a0', fontSize: '14px', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
        {label}
      </div>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────
export default function Ligue() {
  const { t, lang } = useI18n();
  useSeo({
    title: "La Ligue — Mauritius Padel League | Organisation et Règles",
    description: "La Mauritius Padel League (MPL) : organisation, règles des tournois, formats de jeu, conditions d'accès. Padel à Maurice sous l'égide de la MSRA.",
    keywords: "mauritius padel league, ligue padel mauritius, regles padel mauritius, MSRA padel",
    canonical: "https://padelleague.mu/#/ligue",
  });
  const categories = Object.entries(CATEGORY_CONFIG) as [TournamentCategory, typeof CATEGORY_CONFIG[TournamentCategory]][];
  const icons = ['🏆', '🤝', '🌱', '⚡'];

  const [selectedSize, setSelectedSize] = useState<string>('13-16');
  const [selectedCat, setSelectedCat] = useState<TournamentCategory>('M100');

  const pointsForDisplay = FULL_POINTS[selectedCat][selectedSize] ?? [];
  const maxPos = pointsForDisplay.filter(p => p !== null).length;

  return (
    <Layout>
      {/* ── HERO ── */}
      <section style={{
        padding: '100px 24px 80px',
        background: 'radial-gradient(ellipse at 30% 50%, rgba(74,213,105,0.09) 0%, #0a0a0a 65%)',
        borderBottom: '1px solid rgba(74,213,105,0.08)',
        position: 'relative', overflow: 'hidden',
      }}>
        <DotWaveBackground variant="hero-right" opacity={0.14} animate={true} />
        <FloatingParticles count={8} opacity={0.08} />
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span style={{
              background: 'rgba(74,213,105,0.12)', color: '#4ad569',
              border: '1px solid rgba(74,213,105,0.3)', borderRadius: '20px',
              padding: '5px 16px', fontSize: '13px', fontWeight: 600, letterSpacing: '0.5px',
            }}>
              {t.league.badge}
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }}
            style={{ fontSize: 'clamp(36px,5vw,64px)', fontWeight: 900, color: 'white', margin: '20px 0 0', lineHeight: 1.1 }}
          >
            {lang === 'fr' ? 'La Mauritius' : 'The Mauritius'}<br />
            <span style={{ color: '#4ad569' }}>Padel League</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            style={{ color: '#a0a0a0', fontSize: '17px', maxWidth: '660px', lineHeight: 1.8, margin: '24px 0 0' }}
          >
            {t.league.mission}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
            style={{ display: 'flex', gap: '48px', flexWrap: 'wrap', marginTop: '56px' }}
          >
            <StatBubble value="18"  label={lang === 'fr' ? 'Clubs membres' : 'Member clubs'} />
            <StatBubble value="65"  label={lang === 'fr' ? 'Terrains' : 'Courts'} color="#3b82f6" />
            <StatBubble value={MPL_STATS.tournaments.toString()} label={lang === 'fr' ? 'Tournois / saison' : 'Tournaments / season'} color="#8b5cf6" />
            <StatBubble value="4"   label={lang === 'fr' ? 'Régions' : 'Regions'} color="#f59e0b" />
          </motion.div>
        </div>
      </section>

      {/* ── RÈGLES GÉNÉRALES ── */}
      <section style={{ padding: '80px 24px', background: '#0f0f0f' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>
          <h2 style={{ fontSize: 'clamp(24px,3vw,36px)', fontWeight: 800, color: 'white', margin: '0 0 12px' }}>
            {lang === 'fr' ? '📋 Règles & Réglements' : '📋 Rules & Regulations'}
          </h2>
          <p style={{ color: '#a0a0a0', marginBottom: '36px', fontSize: '15px' }}>
            {lang === 'fr'
              ? 'Règles officielles de la Mauritius Padel League sous l\'égide de la MSRA'
              : 'Official rules of the Mauritius Padel League under the MSRA'}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '20px', marginBottom: '32px' }}>
            {/* Inscriptions */}
            <GlassCard style={{ padding: '28px', borderLeft: '3px solid #4ad569' }}>
              <h3 style={{ color: '#4ad569', fontWeight: 700, fontSize: '16px', margin: '0 0 16px' }}>
                📅 {lang === 'fr' ? 'Inscriptions' : 'Registration'}
              </h3>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { icon: '🟢', text: lang === 'fr' ? 'Ouverture 3 semaines avant le tournoi' : 'Opens 3 weeks before the tournament' },
                  { icon: '🔴', text: lang === 'fr' ? 'Clôture 1 semaine avant le tournoi' : 'Closes 1 week before the tournament' },
                  { icon: '🎲', text: lang === 'fr' ? 'Tirage au sort live 3 jours avant' : 'Live draw 3 days before the tournament' },
                  { icon: '❌', text: lang === 'fr' ? 'Remplacement impossible après le tirage' : 'No replacement after the draw' },
                  { icon: '💳', text: lang === 'fr' ? 'Frais à régler avant le tirage au sort' : 'Fees must be settled before the draw' },
                  { icon: '🚫', text: lang === 'fr' ? 'Aucun remboursement après le tirage' : 'No refund after the draw' },
                ].map((item, i) => (
                  <li key={i} style={{ display: 'flex', gap: '10px', color: '#a0a0a0', fontSize: '14px', lineHeight: 1.5 }}>
                    <span style={{ flexShrink: 0 }}>{item.icon}</span>{item.text}
                  </li>
                ))}
              </ul>
            </GlassCard>

            {/* Licences */}
            <GlassCard style={{ padding: '28px', borderLeft: '3px solid #3b82f6' }}>
              <h3 style={{ color: '#3b82f6', fontWeight: 700, fontSize: '16px', margin: '0 0 16px' }}>
                🪪 {lang === 'fr' ? 'Licences & Accès' : 'Licences & Access'}
              </h3>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { text: lang === 'fr' ? 'Seuls les joueurs licenciés à la Fédération peuvent participer' : 'Only players licensed with the Federation can participate' },
                  { text: lang === 'fr' ? 'Clubs affiliés à la Fédération pour M25/M50/M100/M250/Mixed/Junior' : 'Federation-affiliated clubs organize M25/M50/M100/M250/Mixed/Junior' },
                  { text: lang === 'fr' ? 'M500/M1000 organisés par la MPL sous l\'égide de la MSRA' : 'M500/M1000 organized by MPL under the MSRA' },
                  { text: lang === 'fr' ? 'Le classement MPL est le classement officiel national — seuls les tournois MPL homologués y contribuent' : 'The MPL ranking is the official national ranking — only MPL-sanctioned tournaments contribute to it' },
                ].map((item, i) => (
                  <li key={i} style={{ display: 'flex', gap: '10px', color: '#a0a0a0', fontSize: '14px', lineHeight: 1.5 }}>
                    <span style={{ color: '#3b82f6', marginTop: '2px', flexShrink: 0 }}>▸</span>{item.text}
                  </li>
                ))}
              </ul>
            </GlassCard>

            {/* Départage */}
            <GlassCard style={{ padding: '28px', borderLeft: '3px solid #f59e0b' }}>
              <h3 style={{ color: '#f59e0b', fontWeight: 700, fontSize: '16px', margin: '0 0 16px' }}>
                ⚖️ {lang === 'fr' ? 'Règles de Départage' : 'Tiebreaker Rules'}
              </h3>
              <p style={{ color: '#666', fontSize: '12px', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {lang === 'fr' ? 'En cas d\'égalité pour désigner un vainqueur :' : 'In case of a tie to determine a winner:'}
              </p>
              {[
                { num: '1', text: lang === 'fr' ? 'Différence de jeux' : 'Game difference' },
                { num: '2', text: lang === 'fr' ? 'Nombre de jeux gagnés' : 'Number of games won' },
                { num: '3', text: lang === 'fr' ? 'Confrontation directe' : 'Head-to-head' },
                { num: '4', text: lang === 'fr' ? 'Tirage au sort' : 'Coin toss' },
              ].map((item) => (
                <div key={item.num} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px', flexShrink: 0 }}>{item.num}</span>
                  <span style={{ color: '#a0a0a0', fontSize: '14px' }}>{item.text}</span>
                </div>
              ))}
            </GlassCard>
          </div>
        </div>
      </section>

      {/* ── FORMATS DE JEU ── */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>
          <h2 style={{ fontSize: 'clamp(24px,3vw,36px)', fontWeight: 800, color: 'white', margin: '0 0 12px' }}>
            🎾 {lang === 'fr' ? 'Formats de Jeu' : 'Game Formats'}
          </h2>
          <p style={{ color: '#a0a0a0', marginBottom: '36px', fontSize: '15px' }}>
            {lang === 'fr' ? '5 formats officiels utilisés selon le tour et la catégorie' : '5 official formats used depending on the round and category'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '16px', marginBottom: '48px' }}>
            {GAME_FORMATS.map((fmt) => (
              <GlassCard key={fmt.id} style={{ padding: '20px 24px', textAlign: 'center' }}>
                <div style={{ background: 'rgba(74,213,105,0.12)', color: '#4ad569', borderRadius: '10px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '18px', margin: '0 auto 12px', border: '1px solid rgba(74,213,105,0.25)' }}>
                  {fmt.id}
                </div>
                <div style={{ color: 'white', fontWeight: 600, fontSize: '13px', lineHeight: 1.5 }}>
                  {lang === 'fr' ? fmt.desc_fr : fmt.desc_en}
                </div>
              </GlassCard>
            ))}
          </div>

          {/* Structure par catégorie */}
          <h3 style={{ color: '#a0a0a0', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '20px' }}>
            {lang === 'fr' ? 'Structure des tableaux par catégorie' : 'Draw structure by category'}
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(74,213,105,0.15)' }}>
                  {['Catégorie', lang === 'fr' ? 'Sélection' : 'Selection', lang === 'fr' ? 'Min. Terrains' : 'Min. Courts', lang === 'fr' ? 'Min. Équipes' : 'Min. Teams', lang === 'fr' ? 'Structure des tours' : 'Round structure'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', textAlign: i === 0 ? 'center' : 'left', color: '#666', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(Object.entries(TOURNAMENT_STRUCTURE) as [TournamentCategory, typeof TOURNAMENT_STRUCTURE[TournamentCategory]][]).map(([cat, s], i) => {
                  const cfg = CATEGORY_CONFIG[cat];
                  return (
                    <tr key={cat} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <CategoryBadge category={cat} size="sm" />
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ color: s.selection === 'ranking' ? '#f59e0b' : '#4ad569', fontSize: '12px', fontWeight: 600 }}>
                          {s.selection === 'ranking' ? (lang === 'fr' ? '🏆 Classement' : '🏆 Ranking') : (lang === 'fr' ? '📝 Inscription' : '📝 Registration')}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#a0a0a0', fontFamily: 'JetBrains Mono,monospace', fontSize: '14px' }}>{s.min_courts}</td>
                      <td style={{ padding: '10px 14px', color: '#a0a0a0', fontFamily: 'JetBrains Mono,monospace', fontSize: '14px' }}>{s.min_teams}</td>
                      <td style={{ padding: '10px 14px', color: '#666', fontSize: '12px' }}>
                        {lang === 'fr' ? s.format_fr : s.format_en}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── ACCÈS AUX TOURNOIS ── */}
      <section style={{ padding: '80px 24px', background: '#0f0f0f' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>
          <h2 style={{ fontSize: 'clamp(24px,3vw,36px)', fontWeight: 800, color: 'white', margin: '0 0 12px' }}>
            🎫 {lang === 'fr' ? 'Conditions d\'Accès' : 'Access Requirements'}
          </h2>
          <p style={{ color: '#a0a0a0', marginBottom: '36px', fontSize: '15px' }}>
            {lang === 'fr'
              ? 'Classement minimum requis pour s\'inscrire à chaque niveau de tournoi'
              : 'Minimum ranking required to register for each tournament level'}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(74,213,105,0.15)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: '#666', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {lang === 'fr' ? 'Division' : 'Division'}
                  </th>
                  {ACCESS_TABLE.map(a => (
                    <th key={a.cat} style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <CategoryBadge category={a.cat as TournamentCategory} size="xs" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label_fr: '👨 Hommes — Classement cumulé paire', label_en: '👨 Men — Cumulative pair ranking', key: 'men_pair' },
                  { label_fr: '👨 Hommes — Classement individuel', label_en: '👨 Men — Individual ranking', key: 'men_indiv' },
                  { label_fr: '👩 Femmes — Classement cumulé paire', label_en: '👩 Women — Cumulative pair ranking', key: 'women_pair' },
                  { label_fr: '👩 Femmes — Classement individuel', label_en: '👩 Women — Individual ranking', key: 'women_indiv' },
                ].map((row, ri) => (
                  <tr key={row.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{ padding: '12px 16px', color: '#a0a0a0', fontSize: '13px' }}>
                      {lang === 'fr' ? row.label_fr : row.label_en}
                    </td>
                    {ACCESS_TABLE.map(a => {
                      const val = a[row.key as keyof typeof a];
                      return (
                        <td key={a.cat} style={{ padding: '12px 16px', textAlign: 'center', fontFamily: 'JetBrains Mono,monospace', fontSize: '14px', fontWeight: 600, color: val ? '#4ad569' : '#333' }}>
                          {val ?? '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: '#555', fontSize: '12px', marginTop: '12px' }}>
            * {lang === 'fr' ? 'M500/M1000 : sélection sur classement, sans minimum. Mixed & Junior : accès libre aux licenciés.' : 'M500/M1000: ranking-based selection, no minimum. Mixed & Junior: open to all licensed players.'}
          </p>
        </div>
      </section>

      {/* ── BARÈME DE POINTS ── */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>
          <h2 style={{ fontSize: 'clamp(24px,3vw,36px)', fontWeight: 800, color: 'white', margin: '0 0 12px' }}>
            🏅 {lang === 'fr' ? 'Barème de Points' : 'Points Allocation'}
          </h2>
          <p style={{ color: '#a0a0a0', marginBottom: '32px', fontSize: '15px' }}>
            {lang === 'fr'
              ? 'Points attribués selon la position finale et le nombre d\'équipes inscrits'
              : 'Points awarded according to final position and number of registered teams'}
          </p>

          {/* Sélecteurs */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '32px', alignItems: 'center' }}>
            <div>
              <span style={{ color: '#666', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginRight: '10px' }}>
                {lang === 'fr' ? 'Catégorie' : 'Category'}
              </span>
              <div style={{ display: 'inline-flex', gap: '8px', flexWrap: 'wrap' }}>
                {(['M25','M50','M100','M250','M500','M1000', 'MIXED', 'JUNIOR'] as (TournamentCategory | 'MIXED' | 'JUNIOR')[]).map(cat => {
                  const cfg = CATEGORY_CONFIG[cat as TournamentCategory] ?? { color: cat === 'MIXED' ? '#a78bfa' : '#fb923c' };
                  const catLabel = cat === 'MIXED' ? 'Mixte' : cat === 'JUNIOR' ? 'Junior' : cat;
                  return (
                    <button key={cat} onClick={() => setSelectedCat(cat as TournamentCategory)} style={{
                      background: selectedCat === cat ? cfg.color : 'transparent',
                      color: selectedCat === cat ? '#0a0a0a' : cfg.color,
                      border: `1px solid ${cfg.color}`,
                      borderRadius: '8px', padding: '5px 14px', fontSize: '12px',
                      fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                      {catLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span style={{ color: '#666', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginRight: '10px' }}>
                {lang === 'fr' ? 'Nb équipes' : 'Teams'}
              </span>
              <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap' }}>
                {SIZE_COLUMNS.map(sz => (
                  <button key={sz.key} onClick={() => setSelectedSize(sz.key)} style={{
                    background: selectedSize === sz.key ? 'rgba(74,213,105,0.15)' : 'transparent',
                    color: selectedSize === sz.key ? '#4ad569' : '#666',
                    border: `1px solid ${selectedSize === sz.key ? '#4ad569' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: '8px', padding: '5px 12px', fontSize: '12px',
                    fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    {sz.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Badge info */}
          <div style={{ background: 'rgba(74,213,105,0.05)', border: '1px solid rgba(74,213,105,0.15)', borderRadius: '10px', padding: '12px 20px', marginBottom: '24px', display: 'inline-flex', gap: '12px', alignItems: 'center' }}>
            <CategoryBadge category={selectedCat} size="sm" />
            <span style={{ color: '#a0a0a0', fontSize: '13px' }}>
              {lang === 'fr'
                ? `Tournoi avec ${selectedSize} équipes — ${maxPos} positions rémunérées`
                : `Tournament with ${selectedSize} teams — ${maxPos} paid positions`}
            </span>
            {(selectedCat === 'M500' || selectedCat === 'M1000') && (
              <span style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 600 }}>
                ★ +10 pts par tour passé jusqu'aux têtes de série
              </span>
            )}
          </div>

          {/* Tableau de points */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '400px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(74,213,105,0.2)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: '#666', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', width: '80px' }}>
                    {lang === 'fr' ? 'Position' : 'Position'}
                  </th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: '#666', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {lang === 'fr' ? 'Tour / Phase' : 'Round / Phase'}
                  </th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', color: '#4ad569', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {lang === 'fr' ? 'Points' : 'Points'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pointsForDisplay.map((pts, i) => {
                  if (pts === null) return null;
                  const pos = i + 1;
                  const isTop3 = pos <= 3;
                  const medals = ['🥇', '🥈', '🥉'];
                  const cfg = CATEGORY_CONFIG[selectedCat];
                  let phaseFr = '';
                  let phaseEn = '';
                  if (pos === 1)      { phaseFr = 'Vainqueur'; phaseEn = 'Winner'; }
                  else if (pos === 2) { phaseFr = 'Finaliste'; phaseEn = 'Finalist'; }
                  else if (pos <= 4)  { phaseFr = 'Demi-finale'; phaseEn = 'Semi-final'; }
                  else if (pos <= 8)  { phaseFr = 'Quart de finale'; phaseEn = 'Quarter-final'; }
                  else if (pos <= 16) { phaseFr = 'Tour principal'; phaseEn = 'Main draw'; }
                  else                { phaseFr = 'Qualification'; phaseEn = 'Qualifying'; }
                  return (
                    <tr key={i} style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: isTop3 ? `${cfg.color}08` : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    }}>
                      <td style={{ padding: '10px 16px', fontFamily: 'JetBrains Mono,monospace', fontSize: '14px', fontWeight: isTop3 ? 800 : 500, color: isTop3 ? cfg.color : '#666' }}>
                        {isTop3 ? medals[i] : `#${pos}`}
                      </td>
                      <td style={{ padding: '10px 16px', color: isTop3 ? 'white' : '#a0a0a0', fontSize: '13px', fontWeight: isTop3 ? 600 : 400 }}>
                        {lang === 'fr' ? phaseFr : phaseEn}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono,monospace', fontSize: isTop3 ? '18px' : '14px', fontWeight: isTop3 ? 800 : 500, color: isTop3 ? cfg.color : '#a0a0a0' }}>
                        {pts} <span style={{ fontSize: '11px', color: '#555' }}>pts</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── CRITÈRES DE CLASSEMENT ── */}
      <section style={{ padding: '80px 24px', background: '#0f0f0f' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>
          <h2 style={{ fontSize: 'clamp(24px,3vw,36px)', fontWeight: 800, color: 'white', margin: '0 0 40px' }}>
            📊 {lang === 'fr' ? 'Critères de Classement' : 'Ranking Criteria'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '20px' }}>
            {[
              {
                icon: '🏆', color: '#f59e0b',
                title_fr: 'Hommes / Femmes', title_en: 'Men / Women',
                items_fr: [
                  '10 meilleurs scores sur les 12 derniers mois',
                  'Classement mis à jour chaque mois',
                  'Tournois M25, M50, M100, M250, M500, M1000',
                ],
                items_en: [
                  'Top 10 scores over the last 12 months',
                  'Ranking updated every month',
                  'Tournaments M25, M50, M100, M250, M500, M1000',
                ],
              },
              {
                icon: '🔀', color: '#06b6d4',
                title_fr: 'Mixed Challenge', title_en: 'Mixed Challenge',
                items_fr: [
                  '10 meilleurs scores mixtes sur 12 mois',
                  'Mis à jour mensuellement',
                  'Uniquement tournois catégorie Mixte',
                ],
                items_en: [
                  'Top 10 mixed scores over 12 months',
                  'Updated monthly',
                  'Only Mixed category tournaments',
                ],
              },
              {
                icon: '👶', color: '#a78bfa',
                title_fr: 'Junior', title_en: 'Junior',
                items_fr: [
                  'Moins de 18 ans (U11 / U13 / U15)',
                  '10 meilleurs scores sur 12 mois',
                  'Classement séparé du circuit senior',
                ],
                items_en: [
                  'Under 18 years old (U11 / U13 / U15)',
                  'Top 10 scores over 12 months',
                  'Separate ranking from senior circuit',
                ],
              },
            ].map((block, i) => (
              <GlassCard key={i} style={{ padding: '28px', borderLeft: `3px solid ${block.color}` }}>
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>{block.icon}</div>
                <h3 style={{ color: block.color, fontWeight: 700, fontSize: '17px', margin: '0 0 16px' }}>
                  {lang === 'fr' ? block.title_fr : block.title_en}
                </h3>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(lang === 'fr' ? block.items_fr : block.items_en).map((item, j) => (
                    <li key={j} style={{ display: 'flex', gap: '10px', color: '#a0a0a0', fontSize: '14px', lineHeight: 1.5 }}>
                      <span style={{ color: block.color, flexShrink: 0, marginTop: '2px' }}>▸</span>{item}
                    </li>
                  ))}
                </ul>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── NIVEAUX DE PADEL ── */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>
          <h2 style={{ fontSize: 'clamp(24px,3vw,36px)', fontWeight: 800, color: 'white', margin: '0 0 12px' }}>
            🎓 {lang === 'fr' ? 'Niveaux de Padel' : 'Padel Levels'}
          </h2>
          <p style={{ color: '#a0a0a0', marginBottom: '36px', fontSize: '15px' }}>
            {lang === 'fr' ? '10 niveaux de progression du débutant à l\'élite' : '10 progression levels from beginner to elite'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '16px' }}>
            {PADEL_LEVELS.map((lv) => (
              <motion.div
                key={lv.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (lv.num - 1) * 0.04 }}
              >
                <GlassCard style={{ padding: '20px', height: '100%', borderLeft: `3px solid ${lv.color}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{ background: `${lv.color}20`, color: lv.color, borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '14px', flexShrink: 0 }}>
                      {lv.num}
                    </span>
                    <span style={{ color: lv.color, fontWeight: 700, fontSize: '14px' }}>{lv.name}</span>
                  </div>
                  <p style={{ color: '#777', fontSize: '12px', lineHeight: 1.6, margin: 0 }}>
                    {lang === 'fr' ? lv.desc_fr : lv.desc_en}
                  </p>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VALEURS ── */}
      <section style={{ padding: '80px 24px', background: '#0f0f0f' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>
          <h2 style={{ fontSize: 'clamp(24px,3vw,36px)', fontWeight: 800, color: 'white', margin: '0 0 40px' }}>
            {lang === 'fr' ? '💡 Nos Valeurs' : '💡 Our Values'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            {t.league.features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <GlassCard style={{ padding: '32px', height: '100%' }}>
                  <div style={{ fontSize: '36px', marginBottom: '16px' }}>{icons[i]}</div>
                  <h3 style={{ color: 'white', fontWeight: 700, fontSize: '18px', margin: '0 0 10px' }}>{f.title}</h3>
                  <p style={{ color: '#a0a0a0', fontSize: '14px', lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CIRCUIT JUNIOR ── */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>

          {/* Header */}
          <div style={{ marginBottom: '48px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: '30px', padding: '6px 18px', marginBottom: '16px' }}>
              <span style={{ fontSize: '16px' }}>⭐</span>
              <span style={{ color: '#fb923c', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                {lang === 'fr' ? 'Circuit League Juniors · Saison 2026–2027' : 'Junior League Circuit · Season 2026–2027'}
              </span>
            </div>
            <h2 style={{ fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900, color: 'white', margin: '0 0 12px' }}>
              🎾 {lang === 'fr' ? 'Tournois Juniors MPL' : 'MPL Junior Tournaments'}
            </h2>
            <p style={{ color: '#a0a0a0', fontSize: '15px', maxWidth: '680px', lineHeight: 1.7, margin: 0 }}>
              {lang === 'fr'
                ? 'Le circuit junior de la MPL est fondé sur une philosophie éducative et progressive. Trois catégories mixtes encadrées par la League : U11, U13 et U15. Seuls les tournois officiels MPL attribuent des points au classement junior.'
                : 'The MPL junior circuit is built on an educational and progressive philosophy. Three mixed categories supervised by the League: U11, U13 and U15. Only official MPL tournaments award junior ranking points.'}
            </p>
          </div>

          {/* Détermination de l'âge */}
          <GlassCard style={{ padding: '20px 24px', marginBottom: '32px', borderLeft: '4px solid #4ade80' }}>
            <h3 style={{ color: '#4ade80', fontWeight: 800, fontSize: '14px', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📅 {lang === 'fr' ? 'Détermination de l\'âge' : 'Age determination'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(lang === 'fr' ? [
                'Les catégories d\'âge sont définies selon le principe "Under" (U).',
                'Un joueur est éligible dans une catégorie d\'âge tant qu\'il n\'a pas atteint l\'âge limite de cette catégorie.',
                'Dès le jour où un joueur atteint l\'âge limite, il n\'est plus autorisé à participer dans cette catégorie.',
              ] : [
                'Age categories are defined according to the "Under" (U) principle.',
                'A player is eligible in an age category as long as they have not reached the age limit of that category.',
                'From the day a player reaches the age limit, they are no longer allowed to participate in that category.',
              ]).map((rule, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#4ade80', fontWeight: 900, fontSize: '13px', flexShrink: 0, marginTop: '1px' }}>•</span>
                  <span style={{ color: '#c0c0c0', fontSize: '13px', lineHeight: 1.6 }}>{rule}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* 3 catégories */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '20px', marginBottom: '48px' }}>
            {[
              {
                cat: 'U11', color: '#fb923c', birth: lang === 'fr' ? '2016 ou après' : '2016 or later', age: lang === 'fr' ? 'Éligible tant que 11 ans non atteints au jour du tournoi' : 'Eligible as long as 11 not yet reached on tournament day',
                format: lang === 'fr' ? '1 set de 4 jeux · Tie-break à 4-4 · No-Ad' : '1 set of 4 games · Tie-break at 4-4 · No-Ad',
                arbitrage: lang === 'fr' ? 'Auto-arbitrage éducatif assisté par le Référent Junior' : 'Educational self-refereeing assisted by Junior Supervisor',
                maxTeams: 16,
              },
              {
                cat: 'U13', color: '#f97316', birth: lang === 'fr' ? '2014 ou après' : '2014 or later', age: lang === 'fr' ? 'Éligible tant que 13 ans non atteints au jour du tournoi' : 'Eligible as long as 13 not yet reached on tournament day',
                format: lang === 'fr' ? '1 set de 6 jeux · Tie-break à 6-6 · No-Ad' : '1 set of 6 games · Tie-break at 6-6 · No-Ad',
                arbitrage: lang === 'fr' ? 'Standard League — Juge-Arbitre ou arbitre de chaise' : 'Standard League — Chair umpire or line judge',
                maxTeams: 16,
              },
              {
                cat: 'U15', color: '#ef4444', birth: lang === 'fr' ? '2012 ou après' : '2012 or later', age: lang === 'fr' ? 'Éligible tant que 15 ans non atteints au jour du tournoi' : 'Eligible as long as 15 not yet reached on tournament day',
                format: lang === 'fr' ? '2 sets gagnants · No-Ad' : 'Best of 2 sets · No-Ad',
                arbitrage: lang === 'fr' ? 'Standard League — Juge-Arbitre ou arbitre de chaise' : 'Standard League — Chair umpire or line judge',
                maxTeams: 16,
              },
            ].map(({ cat, color, birth, age, format, arbitrage, maxTeams }) => (
              <motion.div key={cat} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                <GlassCard style={{ padding: '0', overflow: 'hidden', borderLeft: `4px solid ${color}` }}>
                  {/* Header catégorie */}
                  <div style={{ background: `${color}12`, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ color, fontWeight: 900, fontSize: '28px', letterSpacing: '-1px' }}>{cat}</span>
                      <span style={{ color: `${color}99`, fontSize: '13px', fontWeight: 600, marginLeft: '10px' }}>
                        {lang === 'fr' ? 'Mixte' : 'Mixed'}
                      </span>
                    </div>
                    <div style={{ background: `${color}20`, borderRadius: '8px', padding: '4px 12px', textAlign: 'right' }}>
                      <div style={{ color, fontSize: '12px', fontWeight: 700 }}>max</div>
                      <div style={{ color: 'white', fontSize: '18px', fontWeight: 900, lineHeight: 1 }}>{maxTeams}</div>
                      <div style={{ color: '#606060', fontSize: '10px' }}>{lang === 'fr' ? 'paires' : 'pairs'}</div>
                    </div>
                  </div>
                  {/* Body */}
                  <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[
                      { icon: '🎂', label: lang === 'fr' ? 'Naissance' : 'Born', val: birth },
                      { icon: '📅', label: lang === 'fr' ? 'Éligibilité' : 'Eligibility', val: age },
                      { icon: '🎾', label: lang === 'fr' ? 'Format' : 'Format', val: format },
                      { icon: '👁️', label: lang === 'fr' ? 'Arbitrage' : 'Refereeing', val: arbitrage },
                    ].map(({ icon, label, val }) => (
                      <div key={label} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '14px', marginTop: '1px', flexShrink: 0 }}>{icon}</span>
                        <div>
                          <div style={{ color: '#555', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, marginBottom: '1px' }}>{label}</div>
                          <div style={{ color: '#c0c0c0', fontSize: '13px', lineHeight: 1.4 }}>{val}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>

          {/* Organisation + Règles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '20px', marginBottom: '40px' }}>

            {/* Organisation type */}
            <GlassCard style={{ padding: '24px' }}>
              <h3 style={{ color: '#fb923c', fontWeight: 800, fontSize: '16px', margin: '0 0 18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📋 {lang === 'fr' ? 'Organisation type' : 'Tournament structure'}
              </h3>
              {[
                { n: '1', title: lang === 'fr' ? 'Inscriptions' : 'Registrations', desc: lang === 'fr' ? 'Collecte des candidatures des paires · Vérification de l\'éligibilité des joueurs' : 'Pairs applications · Player eligibility check' },
                { n: '2', title: lang === 'fr' ? 'Phase de Poules' : 'Group Stage', desc: lang === 'fr' ? 'Répartition des paires en poules · Chaque paire joue contre toutes les autres · Minimum garanti de matchs pour tous' : 'Pairs in groups · Round-robin within groups · Minimum number of matches guaranteed' },
                { n: '3', title: lang === 'fr' ? 'Tableau Final' : 'Main Draw', desc: lang === 'fr' ? 'Les meilleures paires de chaque poule avancent · Élimination directe jusqu\'à la finale' : 'Top pairs from each group advance · Direct elimination to the final' },
                { n: '4', title: lang === 'fr' ? 'Consolante' : 'Consolation', desc: lang === 'fr' ? 'Matchs pour paires éliminées en poules/tableau final · Garantit un temps de jeu significatif à toutes les paires' : 'Matches for pairs eliminated in groups/main draw · Significant playing time for all pairs' },
              ].map(({ n, title, desc }) => (
                <div key={n} style={{ display: 'flex', gap: '12px', marginBottom: '14px', alignItems: 'flex-start' }}>
                  <div style={{ background: 'rgba(251,146,60,0.15)', color: '#fb923c', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '12px', flexShrink: 0 }}>{n}</div>
                  <div>
                    <div style={{ color: 'white', fontWeight: 700, fontSize: '13px' }}>{title}</div>
                    <div style={{ color: '#666', fontSize: '12px', lineHeight: 1.5, marginTop: '2px' }}>{desc}</div>
                  </div>
                </div>
              ))}
            </GlassCard>

            {/* Règles & Encadrement */}
            <GlassCard style={{ padding: '24px' }}>
              <h3 style={{ color: '#fb923c', fontWeight: 800, fontSize: '16px', margin: '0 0 18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⚠️ {lang === 'fr' ? 'Encadrement & Sécurité' : 'Supervision & Safety'}
              </h3>
              {[
                { icon: '👨‍⚖️', label: lang === 'fr' ? 'Référent Encadrement Juniors' : 'Junior Supervisor', desc: lang === 'fr' ? 'Présence obligatoire à chaque tournoi. Garant du bien-être, de la sécurité et du fair-play.' : 'Mandatory at every tournament. Ensures well-being, safety and fair-play.' },
                { icon: '💧', label: lang === 'fr' ? 'Accès à l\'eau gratuit' : 'Free water access', desc: lang === 'fr' ? 'Points d\'eau potable facilement accessibles' : 'Accessible drinking water points' },
                { icon: '⛱️', label: lang === 'fr' ? 'Zones ombragées' : 'Shaded areas', desc: lang === 'fr' ? 'Espaces de repos protégés du soleil' : 'Rest areas protected from the sun' },
                { icon: '🏥', label: lang === 'fr' ? 'Trousse premiers secours' : 'First aid kit', desc: lang === 'fr' ? 'Trousse complète + personne formée obligatoire' : 'Complete kit + trained person mandatory' },
                { icon: '📋', label: lang === 'fr' ? 'Surclassement' : 'Age-up', desc: lang === 'fr' ? 'Autorisé uniquement dans la catégorie immédiatement supérieure.' : 'Allowed only into the immediately higher category.' },
                { icon: '🚫', label: lang === 'fr' ? 'Participation multiple' : 'Multiple entries', desc: lang === 'fr' ? 'Un joueur ne peut participer qu\'à une seule catégorie par tournoi.' : 'A player may only enter one category per tournament.' },
              ].map(({ icon, label, desc }) => (
                <div key={label} style={{ display: 'flex', gap: '10px', marginBottom: '13px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>{icon}</span>
                  <div>
                    <div style={{ color: 'white', fontWeight: 700, fontSize: '13px' }}>{label}</div>
                    <div style={{ color: '#666', fontSize: '12px', lineHeight: 1.5, marginTop: '2px' }}>{desc}</div>
                  </div>
                </div>
              ))}
            </GlassCard>
          </div>

          {/* Arbitrage & Rôle du Coach */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '20px', marginBottom: '20px' }}>

            {/* Arbitrage */}
            <GlassCard style={{ padding: '24px' }}>
              <h3 style={{ color: '#fb923c', fontWeight: 800, fontSize: '16px', margin: '0 0 18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                👁️ {lang === 'fr' ? 'Arbitrage par catégorie' : 'Refereeing by category'}
              </h3>
              {[
                {
                  cat: 'U11', badge: lang === 'fr' ? 'Éducatif' : 'Educational', color: '#fb923c',
                  items: lang === 'fr'
                    ? ['Auto-arbitrage assisté par le Référent Encadrement Juniors', 'Accent mis sur la pédagogie et l\'explication des règles', 'Apprentissage de la gestion autonome des situations de jeu', 'Respect mutuel entre les joueurs']
                    : ['Self-refereeing assisted by the Junior Supervisor', 'Focus on pedagogy and rule explanation', 'Learning autonomous management of game situations', 'Mutual respect between players'],
                },
                {
                  cat: 'U13 / U15', badge: lang === 'fr' ? 'Standard League' : 'Standard League', color: '#ef4444',
                  items: lang === 'fr'
                    ? ['Application stricte du règlement officiel de la League', 'Arbitre désigné (Juge-Arbitre ou arbitre de chaise)', 'Gestion sportive et application des règles', 'Équité et fair-play maintenus']
                    : ['Strict application of the official League rules', 'Designated referee (chief umpire or chair umpire)', 'Sports management and rule enforcement', 'Fairness and fair-play maintained'],
                },
              ].map(({ cat, badge, color, items }) => (
                <div key={cat} style={{ marginBottom: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ color, fontWeight: 900, fontSize: '15px' }}>{cat}</span>
                    <span style={{ background: `${color}20`, color, borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>{badge}</span>
                  </div>
                  {items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '4px', alignItems: 'flex-start' }}>
                      <span style={{ color: color, fontSize: '10px', marginTop: '3px', flexShrink: 0 }}>▸</span>
                      <span style={{ color: '#999', fontSize: '12px', lineHeight: 1.4 }}>{item}</span>
                    </div>
                  ))}
                </div>
              ))}
            </GlassCard>

            {/* Rôle du coach + Minimum requis */}
            <GlassCard style={{ padding: '24px' }}>
              <h3 style={{ color: '#fb923c', fontWeight: 800, fontSize: '16px', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🧑‍💼 {lang === 'fr' ? 'Rôle du coach & Minimum requis' : 'Coach role & Minimum requirements'}
              </h3>
              <div style={{ marginBottom: '18px' }}>
                <div style={{ color: 'white', fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>
                  {lang === 'fr' ? 'Interventions autorisées du coach :' : 'Coach allowed interventions:'}
                </div>
                {[
                  { icon: '🔄', text: lang === 'fr' ? 'Changements de côté' : 'Side changes' },
                  { icon: '⏸️', text: lang === 'fr' ? 'Pauses entre les sets' : 'Breaks between sets' },
                ].map(({ icon, text }) => (
                  <div key={text} style={{ display: 'flex', gap: '8px', marginBottom: '5px' }}>
                    <span>{icon}</span>
                    <span style={{ color: '#999', fontSize: '12px' }}>{text}</span>
                  </div>
                ))}
                <div style={{ color: '#555', fontSize: '11px', marginTop: '6px', fontStyle: 'italic' }}>
                  {lang === 'fr' ? 'Toute intervention hors de ces périodes sera sanctionnée par le Juge-Arbitre.' : 'Any intervention outside these periods will be penalized by the chief umpire.'}
                </div>
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '14px' }}>
                <div style={{ color: 'white', fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>
                  {lang === 'fr' ? 'Minimum requis pour organiser :' : 'Minimum to organize:'}
                </div>
                {[
                  { icon: '👥', label: lang === 'fr' ? '4 paires par catégorie' : '4 pairs per category', desc: lang === 'fr' ? 'Requis pour valider et homologuer le tournoi' : 'Required to validate and certify the tournament' },
                  { icon: '⚖️', label: lang === 'fr' ? 'Juge-Arbitre' : 'Chief Umpire', desc: lang === 'fr' ? 'Présence obligatoire pour la gestion sportive du tournoi' : 'Mandatory for sports management of the tournament' },
                  { icon: '🧑‍🏫', label: lang === 'fr' ? 'Référent Encadrement Juniors' : 'Junior Supervisor', desc: lang === 'fr' ? 'Désignation impérative — sécurité et bien-être des joueurs' : 'Mandatory designation — player safety and well-being' },
                ].map(({ icon, label, desc }) => (
                  <div key={label} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '15px', flexShrink: 0 }}>{icon}</span>
                    <div>
                      <div style={{ color: 'white', fontWeight: 700, fontSize: '12px' }}>{label}</div>
                      <div style={{ color: '#555', fontSize: '11px', marginTop: '1px' }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* Barème points Junior M500 */}
          <GlassCard style={{ padding: '24px' }}>
            <h3 style={{ color: '#fb923c', fontWeight: 800, fontSize: '16px', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🏆 {lang === 'fr' ? 'Barème de Points — M500 Junior' : 'Points Scale — M500 Junior'}
            </h3>
            <p style={{ color: '#666', fontSize: '12px', margin: '0 0 16px' }}>
              {lang === 'fr'
                ? 'Points attribués individuellement à chaque joueur selon le rang final et le nombre d\'équipes engagées. Minimum 2 matchs joués requis pour valider les points. Classement éducatif en U11 · progressif en U13 · structurant en U15. Saison 2026–2027 : tous les compteurs à zéro.'
                : 'Points awarded individually to each player based on final rank and number of teams entered. Minimum 2 matches played required to validate points. Ranking: educational in U11 · progressive in U13 · structured in U15. Season 2026–2027: all counters reset to zero.'}
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '400px' }}>
                <thead>
                  <tr style={{ background: 'rgba(251,146,60,0.1)', borderBottom: '1px solid rgba(251,146,60,0.2)' }}>
                    {['Rang', '4–8 éq.', '9–12 éq.', '13–16 éq.', '17–20 éq.'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'center', color: '#fb923c', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    [1,500,500,500,500],[2,300,325,350,375],[3,250,275,300,325],
                    [4,200,250,275,300],[5,125,175,225,275],[6,50,125,200,250],
                    [7,25,100,175,225],[8,5,75,150,200],
                    [9,0,50,125,175],[10,0,25,105,150],
                    [11,0,15,90,125],[12,0,5,75,115],
                    [13,0,0,50,100],[14,0,0,25,90],
                    [15,0,0,15,75],[16,0,0,5,60],
                    [17,0,0,0,50],[18,0,0,0,25],
                    [19,0,0,0,15],[20,0,0,0,5],
                  ].map((row, i) => (
                    <tr key={row[0]} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      {row.map((val, j) => (
                        <td key={j} style={{ padding: '7px 12px', textAlign: 'center', color: j === 0 ? '#fb923c' : (j > 0 && Number(val) > 0 ? '#c0c0c0' : '#333'), fontWeight: j === 0 ? 800 : 400 }}>
                          {Number(val) > 0 ? val : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: '#444', fontSize: '11px', marginTop: '12px', fontStyle: 'italic' }}>
              {lang === 'fr'
                ? '* Transition 2027–2028 : 50 % des points acquis en 2026–2027 sont reportés. Le nombre de colonnes dépend du nombre total d\'équipes engagées dans le tournoi.'
                : '* Transition 2027–2028: 50% of points earned in 2026–2027 are carried over. The column used depends on the total number of teams entered in the tournament.'}
            </p>
          </GlassCard>

        </div>
      </section>

      {/* ── ASSIMILATION INTERNATIONALE ── */}
      <section style={{ padding: '80px 24px', background: '#0a0a0a' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', minWidth: '320px' }}>

          {/* Header */}
          <div style={{ marginBottom: '48px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '30px', padding: '6px 18px', marginBottom: '16px' }}>
              <span style={{ fontSize: '16px' }}>🌍</span>
              <span style={{ color: '#3b82f6', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                {lang === 'fr' ? 'Règles d\'Assimilation Internationale 2026' : 'International Assimilation Rules 2026'}
              </span>
            </div>
            <h2 style={{ fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900, color: 'white', margin: '0 0 12px' }}>
              🌐 {lang === 'fr' ? 'Joueurs Étrangers & Assimilation' : 'Foreign Players & Assimilation'}
            </h2>
            <p style={{ color: '#a0a0a0', fontSize: '15px', maxWidth: '720px', lineHeight: 1.7, margin: 0 }}>
              {lang === 'fr'
                ? 'Les joueurs étrangers souhaitant participer aux compétitions MPL peuvent être assimilés dans le système de classement MPL sur base de leur classement officiel étranger. L\'assimilation est valide jusqu\'à 8 participations à des événements MPL.'
                : 'Foreign players wishing to participate in MPL competitions may be assimilated into the MPL ranking system based on their official foreign ranking. Assimilation is valid until 8 MPL events have been played.'}
            </p>
          </div>

          {/* Art. 1 + 2 + 3 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '20px', marginBottom: '24px' }}>

            {/* Article 2 — Classement Français */}
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <GlassCard style={{ padding: '24px', height: '100%', borderTop: '3px solid #3b82f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <span style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', borderRadius: '8px', padding: '4px 10px', fontSize: '11px', fontWeight: 800 }}>ART. 2</span>
                  <h3 style={{ color: 'white', fontWeight: 800, fontSize: '15px', margin: 0 }}>
                    🇫🇷 {lang === 'fr' ? 'Classement Français (Référence Tier A)' : 'French Ranking (Tier A Reference)'}
                  </h3>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(59,130,246,0.2)' }}>
                        <th style={{ padding: '7px 10px', textAlign: 'left', color: '#3b82f6', fontWeight: 700, fontSize: '11px' }}>
                          {lang === 'fr' ? 'Classement FR' : 'FR Ranking'}
                        </th>
                        <th style={{ padding: '7px 10px', textAlign: 'center', color: '#3b82f6', fontWeight: 700, fontSize: '11px' }}>
                          {lang === 'fr' ? 'Rang MPL' : 'MPL Rank'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { fr: '1 – 100',     mpl: 'RANG 1'  },
                        { fr: '101 – 300',   mpl: 'RANG 5'  },
                        { fr: '301 – 1 000', mpl: 'RANG 10' },
                        { fr: '1 001 – 1 500', mpl: 'RANG 30' },
                        { fr: '1 501 – 3 000', mpl: 'RANG 50' },
                      ].map(({ fr, mpl }, i) => (
                        <tr key={fr} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '8px 10px', color: '#a0a0a0', fontFamily: 'monospace' }}>{fr}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <span style={{ color: '#3b82f6', fontWeight: 800, background: 'rgba(59,130,246,0.12)', padding: '2px 10px', borderRadius: '6px', fontSize: '12px' }}>{mpl}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ color: '#444', fontSize: '11px', marginTop: '10px', fontStyle: 'italic' }}>
                  {lang === 'fr' ? 'La France est la référence principale en raison de la taille et de la compétitivité de sa structure de classement.' : 'France is the primary reference due to the size and competitiveness of its ranking structure.'}
                </p>
              </GlassCard>
            </motion.div>

            {/* Article 3 — Femmes en catégorie Hommes */}
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.08 }}>
              <GlassCard style={{ padding: '24px', height: '100%', borderTop: '3px solid #ec4899' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <span style={{ background: 'rgba(236,72,153,0.15)', color: '#ec4899', borderRadius: '8px', padding: '4px 10px', fontSize: '11px', fontWeight: 800 }}>ART. 3</span>
                  <h3 style={{ color: 'white', fontWeight: 800, fontSize: '15px', margin: 0 }}>
                    ♀ {lang === 'fr' ? 'Femmes en Catégorie Hommes' : 'Women in Men\'s Category'}
                  </h3>
                </div>
                <p style={{ color: '#777', fontSize: '13px', lineHeight: 1.6, marginBottom: '14px' }}>
                  {lang === 'fr'
                    ? 'Formule de calcul du rang d\'assimilation pour une joueuse locale participant en catégorie masculine :'
                    : 'Assimilation rank formula for a female local player competing in the men\'s category:'}
                </p>
                <div style={{ background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.2)', borderRadius: '10px', padding: '14px 18px', marginBottom: '14px', textAlign: 'center' }}>
                  <div style={{ color: '#ec4899', fontFamily: 'monospace', fontSize: '15px', fontWeight: 800 }}>
                    Rang = 30 + (Classement femmes × 5)
                  </div>
                </div>
                {[
                  { rank: 10, assimil: 80 }, { rank: 20, assimil: 130 },
                  { rank: 50, assimil: 280 }, { rank: 100, assimil: 530 },
                ].map(({ rank, assimil }) => (
                  <div key={rank} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#a0a0a0', fontSize: '12px' }}>
                      {lang === 'fr' ? 'Clas. féminin' : 'Women rank'} #{rank}
                    </span>
                    <span style={{ color: '#ec4899', fontWeight: 700, fontSize: '12px' }}>
                      → {lang === 'fr' ? 'Rang' : 'Rank'} {assimil}
                    </span>
                  </div>
                ))}
                <p style={{ color: '#444', fontSize: '11px', marginTop: '10px', fontStyle: 'italic' }}>
                  {lang === 'fr' ? 'Le Comité de Compétition se réserve le droit d\'ajuster si un déséquilibre est constaté.' : 'The Competition Committee reserves the right to adjust if competitive imbalance is observed.'}
                </p>
              </GlassCard>
            </motion.div>

            {/* Articles 4 + 5 */}
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>

                {/* Art. 4 — Statuts spéciaux */}
                <GlassCard style={{ padding: '20px', borderTop: '3px solid #ffd700' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <span style={{ background: 'rgba(255,215,0,0.12)', color: '#ffd700', borderRadius: '8px', padding: '3px 9px', fontSize: '11px', fontWeight: 800 }}>ART. 4</span>
                    <h3 style={{ color: 'white', fontWeight: 800, fontSize: '14px', margin: 0 }}>⭐ {lang === 'fr' ? 'Statuts Spéciaux' : 'Special Player Status'}</h3>
                  </div>
                  {[
                    { icon: '🎾', who: lang === 'fr' ? 'Joueurs ATP classés' : 'ATP ranked players', rank: lang === 'fr' ? 'Assimilé RANG 10' : 'Assimilated RANK 10' },
                    { icon: '🏅', who: lang === 'fr' ? 'Joueurs de Tour Pro reconnu' : 'Pro Tour players', rank: lang === 'fr' ? 'Assimilé RANG 1 (validation comité)' : 'Assimilated RANK 1 (committee validation)' },
                  ].map(({ icon, who, rank }) => (
                    <div key={who} style={{ display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '14px' }}>{icon}</span>
                      <div>
                        <div style={{ color: '#c0c0c0', fontSize: '12px', fontWeight: 600 }}>{who}</div>
                        <div style={{ color: '#ffd700', fontSize: '11px', fontWeight: 700 }}>{rank}</div>
                      </div>
                    </div>
                  ))}
                </GlassCard>

                {/* Art. 5 — Classement Régional */}
                <GlassCard style={{ padding: '20px', borderTop: '3px solid #34d399' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <span style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', borderRadius: '8px', padding: '3px 9px', fontSize: '11px', fontWeight: 800 }}>ART. 5</span>
                    <h3 style={{ color: 'white', fontWeight: 800, fontSize: '14px', margin: 0 }}>🌊 {lang === 'fr' ? 'Circuit Indien Régional' : 'Regional Indian Ocean Circuit'}</h3>
                  </div>
                  <p style={{ color: '#777', fontSize: '12px', lineHeight: 1.5, margin: '0 0 8px' }}>
                    {lang === 'fr'
                      ? 'Joueurs classés dans le Top 10 du classement national malgache :'
                      : 'Players ranked in the Top 10 Madagascar national ranking:'}
                  </p>
                  <div style={{ background: 'rgba(52,211,153,0.08)', borderRadius: '8px', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#a0a0a0', fontSize: '12px' }}>🇲🇬 Top 10 Madagascar</span>
                    <span style={{ color: '#34d399', fontWeight: 800 }}>{lang === 'fr' ? 'Rang 10 MPL' : 'MPL Rank 10'}</span>
                  </div>
                </GlassCard>
              </div>
            </motion.div>
          </div>

          {/* Art. 6 + 7 + 8 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '16px' }}>

            {/* Art. 6 — Classement Protégé */}
            <GlassCard style={{ padding: '20px', borderLeft: '3px solid #a78bfa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <span style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 800 }}>ART. 6</span>
                <h3 style={{ color: 'white', fontWeight: 700, fontSize: '14px', margin: 0 }}>🛡️ {lang === 'fr' ? 'Classement Protégé' : 'Protected Ranking'}</h3>
              </div>
              <p style={{ color: '#777', fontSize: '12px', lineHeight: 1.6, margin: '0 0 10px' }}>
                {lang === 'fr'
                  ? 'Joueur absent pour blessure ou raison justifiée : classement protégé = rang avant l\'absence + 10 positions.'
                  : 'Player absent due to injury or justified reason: protected ranking = rank before absence + 10 positions.'}
              </p>
              <div style={{ background: 'rgba(167,139,250,0.08)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#a0a0a0' }}>
                {lang === 'fr' ? '⏱ Valide jusqu\'à 8 résultats de tournois enregistrés au retour.' : '⏱ Valid until 8 tournament results recorded upon return.'}
              </div>
            </GlassCard>

            {/* Art. 7 — Validité */}
            <GlassCard style={{ padding: '20px', borderLeft: '3px solid #60a5fa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <span style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 800 }}>ART. 7</span>
                <h3 style={{ color: 'white', fontWeight: 700, fontSize: '14px', margin: 0 }}>📆 {lang === 'fr' ? 'Validité de l\'Assimilation' : 'Validity of Assimilation'}</h3>
              </div>
              <p style={{ color: '#777', fontSize: '12px', lineHeight: 1.6, margin: '0 0 10px' }}>
                {lang === 'fr'
                  ? 'L\'assimilation étrangère reste valable jusqu\'à la participation à 8 événements MPL.'
                  : 'Foreign assimilation remains valid until the player has participated in 8 MPL events.'}
              </p>
              <div style={{ background: 'rgba(96,165,250,0.08)', borderRadius: '8px', padding: '8px 12px', textAlign: 'center' }}>
                <span style={{ color: '#60a5fa', fontWeight: 900, fontSize: '28px' }}>8</span>
                <span style={{ color: '#555', fontSize: '12px', marginLeft: '8px' }}>{lang === 'fr' ? 'événements MPL' : 'MPL events'}</span>
              </div>
            </GlassCard>

            {/* Art. 8 — Wild Cards */}
            <GlassCard style={{ padding: '20px', borderLeft: '3px solid #4ad569' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <span style={{ background: 'rgba(74,213,105,0.12)', color: '#4ad569', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 800 }}>ART. 8</span>
                <h3 style={{ color: 'white', fontWeight: 700, fontSize: '14px', margin: 0 }}>🃏 {lang === 'fr' ? 'Wild Cards & Autorité du Comité' : 'Wild Cards & Committee Authority'}</h3>
              </div>
              <p style={{ color: '#777', fontSize: '12px', lineHeight: 1.6, margin: '0 0 10px' }}>
                {lang === 'fr'
                  ? 'Le Comité de Compétition MPL se réserve le droit d\'accorder des Wild Cards de qualification ou de tableau principal à des joueurs étrangers jugés bénéfiques pour le développement du padel à Maurice.'
                  : 'The MPL Competition Committee reserves the right to grant qualification or main draw Wild Cards to foreign players deemed valuable to the development of padel in Mauritius.'}
              </p>
              <div style={{ background: 'rgba(74,213,105,0.08)', borderRadius: '8px', padding: '8px 12px', fontSize: '11px', color: '#555', fontStyle: 'italic' }}>
                {lang === 'fr' ? '⚖️ Les décisions du Comité sont définitives.' : '⚖️ Committee decisions are final.'}
              </div>
            </GlassCard>

          </div>

        </div>
      </section>
    </Layout>
  );
}
