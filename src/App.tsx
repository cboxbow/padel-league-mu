import { lazy, Suspense, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { I18nProvider } from '@/hooks/useI18n';
import { ROUTE_PATHS } from '@/lib/index';
import Home          from '@/pages/Home';
import Ligue         from '@/pages/Ligue';
import Regions       from '@/pages/Regions';
import Clubs         from '@/pages/Clubs';
import Calendrier    from '@/pages/Calendrier';
import Classements   from '@/pages/Classements';
import Resultats     from '@/pages/Resultats';
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

function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTE_PATHS.HOME}            element={<Home />} />
      <Route path={ROUTE_PATHS.LEAGUE}          element={<Ligue />} />
      <Route path={ROUTE_PATHS.REGIONS}         element={<Regions />} />
      <Route path={ROUTE_PATHS.CLUBS}           element={<Clubs />} />
      <Route path={ROUTE_PATHS.CALENDAR}        element={<Calendrier />} />
      <Route path={ROUTE_PATHS.RANKINGS}        element={<Classements />} />
      <Route path={ROUTE_PATHS.RESULTS}         element={<Resultats />} />
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
