/**
 * Page SEO dédiée : /padel-mauritius
 * Optimisée pour les requêtes Google :
 *   - padel mauritius
 *   - padel league mauritius
 *   - padel tournament mauritius
 *   - padel ranking mauritius
 *
 * Design cohérent MPL (dark/vert). Aucun composant existant modifié.
 */
import { useNavigate } from 'react-router-dom';
import { Layout, GlassCard } from '@/components/Layout';
import { useSeo } from '@/hooks/useSeo';
import { ROUTE_PATHS } from '@/lib/index';

export default function PadelMauritius() {
  const navigate = useNavigate();
  useSeo({
    title: 'Padel Mauritius — Mauritius Padel League Officielle',
    description:
      'Tout sur le padel à Maurice : tournois M25 à M1000, classements officiels 2026, 18 clubs affiliés, inscriptions en ligne. Mauritius Padel League (MPL) — la première ligue nationale de padel à l\'île Maurice.',
    keywords:
      'padel mauritius, padel league mauritius, padel tournament mauritius, padel ranking mauritius, MPL 2026, tournoi padel Maurice, classement padel, padel club île Maurice, padel MSRA, padel Afrasia Bank',
    ogTitle: 'Padel Mauritius — Mauritius Padel League 2026',
    ogDescription:
      'La Mauritius Padel League (MPL) : tournois, classements et clubs de padel à l\'île Maurice.',
    canonical: 'https://padelleague.mu/#/padel-mauritius',
  });

  const sections = [
    {
      id: 'about',
      title: 'Padel Mauritius — La MPL en bref',
      color: '#4ad569',
      content: `La Mauritius Padel League (MPL) est la première ligue nationale de padel officiellement reconnue à l'île Maurice. Placée sous l'égide de la Mauritius Squash Rackets Association (MSRA), elle organise des compétitions ouvertes aux joueurs licenciés de toute l'île, répartis en 4 régions : Nord, Ouest, Centre et Est.`,
    },
    {
      id: 'tournaments',
      title: 'Padel Tournaments Mauritius — Niveaux M25 à M1000',
      color: '#3b82f6',
      content: `Les tournois de padel à Maurice sont classés par niveau de dotation : M25, M50, M100, M250, M500 et M1000. Les tournois M500 et M1000 sont organisés directement par la MPL sous l'égide de la MSRA. Les 18 clubs affiliés peuvent organiser les tournois M25 à M250 ainsi que les épreuves Mixed et Junior (U11, U13, U15). Plus de 250 événements sont prévus pour la saison 2026.`,
    },
    {
      id: 'ranking',
      title: 'Padel Ranking Mauritius — Classement Officiel 2026',
      color: '#8b5cf6',
      content: `Le classement padel mauritius est calculé sur la base des 10 meilleurs résultats des 12 derniers mois. Il est mis à jour mensuellement et distingue quatre catégories : Hommes, Dames, Mixte et Junior. Pour accéder aux tournois M250 (Hommes), le classement cumulé de la paire doit être d'au moins 50 points. Le classement est disponible en temps réel sur ce site.`,
    },
    {
      id: 'clubs',
      title: 'Padel Clubs Mauritius — 18 Clubs Affiliés',
      color: '#f59e0b',
      content: `La MPL compte 18 clubs affiliés répartis sur toute l'île Maurice : Caña Beau Plan, Club Med Albion, Urban Sport Grand Baie, Urban Sport Black River, SPARC Cascavelle, RM Club Tamarin, I Padel by RM Hennessy, RM Club Grand Baie, Labourdonnais Mapou, I Padel by RM Port Chambly, Studio by RM Azuri, Isla Padel Grand Baie, Terres Brunes Sports, Mont Choisy Golf, Oxygen Moka, Club House Black River, Energia Pointe aux Canonniers, et Moka Rangers.`,
    },
    {
      id: 'access',
      title: 'Padel League Mauritius — Accès aux tournois',
      color: '#ec4899',
      content: `Pour participer aux tournois de la Mauritius Padel League, les joueurs doivent être licenciés à la MSRA. Les inscriptions ouvrent 3 semaines avant la date du tournoi et ferment 1 semaine avant. Le tirage au sort (live draw) est effectué 3 jours avant l'événement. Aucun remboursement n'est possible après le tirage.`,
    },
    {
      id: 'contact',
      title: 'Contact — Mauritius Padel League',
      color: '#4ad569',
      content: `Pour toute information sur les tournois de padel à Maurice, contactez Pascal Hoffmann (pascal@padelleague.mu, +230 5944 9474) ou Mathieu Vallet, Responsable Technique (mathieu@padelleague.mu, +230 5979 2962).`,
    },
  ];

  return (
    <Layout>
      <section style={{ maxWidth: '900px', margin: '0 auto', padding: 'clamp(32px,5vw,64px) clamp(16px,4vw,24px)' }}>

        {/* ── H1 principal SEO ── */}
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          <h1 style={{
            fontSize: 'clamp(28px,4vw,52px)', fontWeight: 900, color: 'white',
            margin: '0 0 16px', letterSpacing: '-1px', lineHeight: 1.1,
          }}>
            Padel Mauritius
          </h1>
          <p style={{
            color: '#4ad569', fontSize: 'clamp(14px,2vw,18px)', fontWeight: 600,
            margin: '0 0 8px', letterSpacing: '0.5px',
          }}>
            Mauritius Padel League — Site Officiel 2026
          </p>
          <p style={{
            color: '#888', fontSize: 'clamp(13px,1.5vw,15px)', maxWidth: '620px',
            margin: '0 auto', lineHeight: 1.7,
          }}>
            Tournois, classements et clubs de padel à l'île Maurice.
            La première ligue nationale de padel sous l'égide de la MSRA.
          </p>

          {/* Boutons de navigation vers les pages clés */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '24px' }}>
            {[
              { label: '📅 Voir les tournois',   path: ROUTE_PATHS.CALENDAR,  color: '#3b82f6' },
              { label: '🏆 Classements 2026',    path: ROUTE_PATHS.RANKINGS,  color: '#8b5cf6' },
              { label: '🏟 Les 18 clubs',        path: ROUTE_PATHS.CLUBS,     color: '#f59e0b' },
              { label: '📊 Résultats',           path: ROUTE_PATHS.RESULTS,   color: '#4ad569' },
            ].map(btn => (
              <button
                key={btn.path}
                onClick={() => navigate(btn.path)}
                style={{
                  background: `${btn.color}15`, color: btn.color,
                  border: `1px solid ${btn.color}40`,
                  borderRadius: '10px', padding: '10px 18px',
                  fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${btn.color}28`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${btn.color}15`; }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Sections SEO ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {sections.map(s => (
            <GlassCard key={s.id} style={{ padding: '28px 32px' }}>
              <h2 style={{
                color: s.color, fontSize: 'clamp(15px,2vw,18px)', fontWeight: 800,
                margin: '0 0 12px', letterSpacing: '-0.3px',
              }}>
                {s.title}
              </h2>
              <p style={{
                color: '#a0a0a0', fontSize: '14px', lineHeight: 1.8, margin: 0,
              }}>
                {s.content}
              </p>
            </GlassCard>
          ))}
        </div>

        {/* ── FAQ SEO ── */}
        <div style={{ marginTop: '40px' }}>
          <h2 style={{ color: 'white', fontWeight: 800, fontSize: '20px', marginBottom: '20px' }}>
            Questions fréquentes — Padel à Maurice
          </h2>
          {[
            {
              q: 'Comment s\'inscrire à un tournoi de padel à Maurice ?',
              a: 'Les inscriptions aux tournois MPL ouvrent 3 semaines avant la date du tournoi via WhatsApp auprès du club organisateur. Vous devez être licencié à la MSRA. Les inscriptions ferment 1 semaine avant l\'événement.',
            },
            {
              q: 'Quels sont les niveaux de tournois de padel en Maurice ?',
              a: 'La MPL organise 6 niveaux : M25 (accessibles à tous les licenciés), M50, M100, M250, M500 et M1000. Les niveaux M500 et M1000 sont organisés directement par la ligue. Plus le niveau est élevé, plus les critères de classement pour y accéder sont stricts.',
            },
            {
              q: 'Comment est calculé le classement padel mauritius ?',
              a: 'Le classement MPL retient les 10 meilleurs résultats des 12 derniers mois. Il est calculé pour chaque joueur individuellement et mis à jour chaque mois. Il est disponible en temps réel sur le site officiel padelleague.mu.',
            },
            {
              q: 'Combien y a-t-il de clubs de padel à Maurice ?',
              a: '18 clubs sont affiliés à la Mauritius Padel League en 2026, répartis sur 4 régions (Nord, Ouest, Centre, Est), pour un total de 65 courts de padel sur l\'île.',
            },
          ].map((faq, i) => (
            <GlassCard key={i} style={{ padding: '20px 24px', marginBottom: '12px' }}>
              <h3 style={{ color: 'white', fontSize: '14px', fontWeight: 700, margin: '0 0 8px' }}>
                {faq.q}
              </h3>
              <p style={{ color: '#888', fontSize: '13px', lineHeight: 1.7, margin: 0 }}>
                {faq.a}
              </p>
            </GlassCard>
          ))}
        </div>

        {/* JSON-LD FAQ page spécifique */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: [
                {
                  '@type': 'Question',
                  name: "Comment s'inscrire à un tournoi de padel à Maurice ?",
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: "Les inscriptions ouvrent 3 semaines avant via WhatsApp auprès du club organisateur. Licence MSRA obligatoire.",
                  },
                },
                {
                  '@type': 'Question',
                  name: 'Quels sont les niveaux de tournois de padel en Maurice ?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'M25, M50, M100, M250, M500 et M1000. Les M500/M1000 sont organisés par la ligue.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'Comment est calculé le classement padel mauritius ?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Les 10 meilleurs résultats des 12 derniers mois, mis à jour mensuellement.',
                  },
                },
              ],
            }),
          }}
        />

      </section>
    </Layout>
  );
}
