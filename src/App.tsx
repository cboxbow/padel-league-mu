import { lazy, Suspense, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { I18nProvider } from '@/hooks/useI18n';
import { ROUTE_PATHS } from '@/lib/index';
import { getSupabaseClient } from '@/lib/supabase';
import Home          from '@/pages/Home';
import Ligue         from '@/pages/Ligue';
import Regions       from '@/pages/Regions';
import Clubs         from '@/pages/Clubs';
import Calendrier    from '@/pages/Calendrier';
import Classements   from '@/pages/Classements';
import EspaceJoueur  from '@/pages/EspaceJoueur';
import Resultats     from '@/pages/Resultats';
import Historique    from '@/pages/Historique';
import PadelMauritius from '@/pages/PadelMauritius';
import Galerie        from '@/pages/Galerie';
import ObsScoreboard  from '@/features/obs/ObsScoreboard';

// true  → build public  (admin invisible, route supprimée, code exclu du bundle)
// false → build complet (admin accessible via /admin)
const IS_PUBLIC_MODE = __IS_PUBLIC_BUILD__ || import.meta.env.VITE_PUBLIC_MODE === 'true';

// Chargement paresseux : le code admin n'est PAS inclus dans le bundle public
const Admin = !IS_PUBLIC_MODE ? lazy(() => import('@/pages/Admin')) : null;

function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname, search]);

  return null;
}

// Le lien magique (connexion joueur) redirige vers la racine du site, sans
// route dans le hash : avec HashRouter, un ?code=... colle a un "#/route"
// entre en collision soit avec la lecture du hash par React Router, soit
// avec la lecture du code par supabase-js selon l'ordre. On atterrit donc
// sur "/" (Accueil) et on ecoute la connexion ici, au niveau de l'app
// entiere, puis on redirige nous-memes vers l'Espace Joueur une fois la
// session etablie.
function usePlayerMagicLinkRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!window.location.search.includes('code=')) return;
    const client = getSupabaseClient();
    if (!client) return;

    let handled = false;
    const goToPlayerSpace = () => {
      if (handled) return;
      handled = true;
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      navigate(ROUTE_PATHS.PLAYER_SPACE, { replace: true });
    };

    // L'echange du ?code=... est asynchrone (appel reseau) : on ecoute
    // l'evenement SIGNED_IN, avec un filet de securite via getSession() au
    // cas ou il aurait deja eu lieu avant que cet effet ne s'abonne.
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) goToPlayerSpace();
    });
    client.auth.getSession().then(({ data }) => {
      if (data.session) goToPlayerSpace();
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function AppRoutes() {
  usePlayerMagicLinkRedirect();

  return (
    <Routes>
      <Route path={ROUTE_PATHS.HOME}            element={<Home />} />
      <Route path={ROUTE_PATHS.LEAGUE}          element={<Ligue />} />
      <Route path={ROUTE_PATHS.REGIONS}         element={<Regions />} />
      <Route path={ROUTE_PATHS.CLUBS}           element={<Clubs />} />
      <Route path={ROUTE_PATHS.CALENDAR}        element={<Calendrier />} />
      <Route path={ROUTE_PATHS.RANKINGS}        element={<Classements />} />
      <Route path={ROUTE_PATHS.PLAYER_SPACE}    element={<EspaceJoueur />} />
      <Route path={ROUTE_PATHS.RESULTS}         element={<Resultats />} />
      <Route path={ROUTE_PATHS.HISTORY}         element={<Historique />} />
      <Route path={ROUTE_PATHS.PADEL_MAURITIUS} element={<PadelMauritius />} />
      <Route path={ROUTE_PATHS.GALLERY}          element={<Galerie />} />
      <Route path={ROUTE_PATHS.OBS_SCOREBOARD}   element={<ObsScoreboard />} />

      {/* Routes admin : absentes du build public */}
      {IS_PUBLIC_MODE || !Admin
        ? <Route path="/admin/*" element={<Navigate to="/" replace />} />
        : <Route path={ROUTE_PATHS.ADMIN} element={
            <Suspense fallback={null}><Admin /></Suspense>
          } />
      }

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <Router>
        <ScrollToTop />
        <AppRoutes />
      </Router>
    </I18nProvider>
  );
}
