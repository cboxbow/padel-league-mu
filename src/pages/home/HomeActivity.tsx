import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Radio, Trophy, Medal, UserRound, ListOrdered, ArrowRight, CalendarDays } from 'lucide-react';
import { CategoryBadge } from '@/components/Layout';
import { useTournaments, type TournamentData } from '@/hooks/useData';
import { useI18n } from '@/hooks/useI18n';
import { ROUTE_PATHS } from '@/lib/index';

// Bloc "activite sportive" de l'accueil : lit le calendrier existant (memes
// statuts que la page Calendrier : computeTournamentStatus). Aucune donnee
// inventee : chaque liste est vide si la source ne contient rien.

type EventGroup = {
  key: string;
  date: string;
  startDate?: string;
  deadline?: string;
  category: string;
  club: string;
  name: string;
  divisions: string[];
  status: string;
};

function divisionShort(t: TournamentData, fr: boolean) {
  const v = `${t.division} ${t.type} ${t.name}`.toUpperCase();
  if (v.includes('MIX')) return fr ? 'Mixte' : 'Mixed';
  if (v.includes('JUNIOR') || /U1[135]/.test(v)) return 'Junior';
  if (v.includes('WOMEN') || v.includes('DAMES')) return fr ? 'Dames' : 'Women';
  if (v.includes('MEN') || v.includes('HOMMES')) return fr ? 'Hommes' : 'Men';
  return '';
}

function groupEvents(rows: TournamentData[], fr: boolean): EventGroup[] {
  const groups = new Map<string, EventGroup>();
  for (const t of rows) {
    const key = `${t.date}|${t.club_name}|${t.category}`;
    const division = divisionShort(t, fr);
    const g = groups.get(key) ?? {
      key, date: t.date, startDate: t.start_date, deadline: t.registration_deadline,
      category: t.category, club: t.club_name,
      name: t.name.replace(/\s*\((Hommes|Dames|Mixte|Junior[^)]*)\)\s*$/i, ''),
      divisions: [], status: t.status,
    };
    if (division && !g.divisions.includes(division)) g.divisions.push(division);
    groups.set(key, g);
  }
  return Array.from(groups.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function fmtDate(iso: string | undefined, lang: string, withWeekday = true) {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', withWeekday
    ? { weekday: 'short', day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

// Derniere date d'inscription : cloture fixee par tournoi, sinon regle J-7
// (le statut passe en "tirage" a moins de 7 jours du premier jour).
function registrationEnd(g: EventGroup, lang: string) {
  if (g.deadline) {
    const d = new Date(g.deadline);
    return d.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mauritius' });
  }
  const start = new Date(`${g.startDate || g.date}T12:00:00`);
  start.setDate(start.getDate() - 7);
  return fmtDate(start.toISOString().slice(0, 10), lang);
}

function EventRow({ g, lang, extra }: { g: EventGroup; lang: string; extra?: string }) {
  return (
    <li className="home-activity-row">
      <CategoryBadge category={g.category} size="xs" />
      <div>
        <strong>{g.name}</strong>
        <span>{fmtDate(g.startDate || g.date, lang)}{g.startDate && g.startDate !== g.date ? ` → ${fmtDate(g.date, lang)}` : ''}{g.divisions.length ? ` · ${g.divisions.join(' / ')}` : ''}</span>
        {extra && <em>{extra}</em>}
      </div>
    </li>
  );
}

export default function HomeActivity() {
  const { lang } = useI18n();
  const fr = lang === 'fr';
  const { tournaments, loading } = useTournaments();

  const { ongoing, deadlines, upcoming, recent } = useMemo(() => {
    const live = tournaments.filter(t => t.status !== 'cancelled');
    const today = new Date().toISOString().slice(0, 10);
    return {
      ongoing: groupEvents(live.filter(t => t.status === 'ongoing'), fr),
      deadlines: groupEvents(live.filter(t => t.status === 'open'), fr).slice(0, 5),
      upcoming: groupEvents(live.filter(t => t.date >= today && ['upcoming', 'open', 'draw'].includes(t.status)), fr)
        .filter((g, i, all) => all.findIndex(x => x.key === g.key) === i)
        .slice(0, 6),
      recent: groupEvents(live.filter(t => t.status === 'completed' && t.has_results), fr).reverse().slice(0, 5),
    };
  }, [tournaments, fr]);

  const empty = (text: string) => <p className="home-activity-empty">{loading ? (fr ? 'Chargement…' : 'Loading…') : text}</p>;

  return (
    <section className="home-activity" aria-label={fr ? 'Activité sportive' : 'Sport activity'}>
      <div className="home-activity-inner">
        <div className="home-quick">
          {[
            { to: ROUTE_PATHS.CALENDAR, icon: CalendarDays, label: fr ? 'Calendrier' : 'Calendar', sub: fr ? 'Tous les tournois' : 'All tournaments' },
            { to: ROUTE_PATHS.RANKINGS, icon: ListOrdered, label: fr ? 'Classement en direct' : 'Live ranking', sub: fr ? 'Top 8 sur 12 mois' : 'Best 8 over 12 months' },
            { to: ROUTE_PATHS.SEEDING, icon: Medal, label: fr ? 'Têtes de série' : 'Seeding', sub: fr ? 'Classement mensuel' : 'Monthly ranking' },
            { to: ROUTE_PATHS.PLAYER_SPACE, icon: UserRound, label: fr ? 'Espace joueurs' : 'Players', sub: fr ? 'Profil et inscriptions' : 'Profile and entries' },
          ].map(({ to, icon: Icon, label, sub }) => (
            <Link key={to} to={to} className="home-quick-link">
              <Icon size={18} />
              <span><strong>{label}</strong><small>{sub}</small></span>
              <ArrowRight size={15} />
            </Link>
          ))}
        </div>

        <div className="home-activity-grid">
          <div className="home-activity-card">
            <h2><Radio size={16} /> {fr ? 'En cours' : 'Ongoing'}</h2>
            {ongoing.length
              ? <ul>{ongoing.map(g => <EventRow key={g.key} g={g} lang={lang} />)}</ul>
              : empty(fr ? 'Aucun tournoi en cours aujourd\'hui.' : 'No tournament today.')}
          </div>
          <div className="home-activity-card">
            <h2><CalendarClock size={16} /> {fr ? 'Inscriptions : dates limites' : 'Entry deadlines'}</h2>
            {deadlines.length
              ? <ul>{deadlines.map(g => <EventRow key={g.key} g={g} lang={lang} extra={`${fr ? 'Inscriptions jusqu\'au' : 'Entries until'} ${registrationEnd(g, lang)}`} />)}</ul>
              : empty(fr ? 'Aucune inscription ouverte pour le moment.' : 'No open entries right now.')}
            <Link to={ROUTE_PATHS.PLAYER_SPACE} className="home-activity-more">{fr ? 'Préparer une inscription' : 'Prepare an entry'} <ArrowRight size={14} /></Link>
          </div>
          <div className="home-activity-card">
            <h2><CalendarDays size={16} /> {fr ? 'Prochains tournois' : 'Next tournaments'}</h2>
            {upcoming.length
              ? <ul>{upcoming.map(g => <EventRow key={g.key} g={g} lang={lang} />)}</ul>
              : empty(fr ? 'Aucun tournoi programmé.' : 'No tournament scheduled.')}
            <Link to={ROUTE_PATHS.CALENDAR} className="home-activity-more">{fr ? 'Voir le calendrier' : 'See the calendar'} <ArrowRight size={14} /></Link>
          </div>
          <div className="home-activity-card">
            <h2><Trophy size={16} /> {fr ? 'Derniers résultats' : 'Latest results'}</h2>
            {recent.length
              ? <ul>{recent.map(g => <EventRow key={g.key} g={g} lang={lang} />)}</ul>
              : empty(fr ? 'Aucun résultat publié récemment.' : 'No recent results.')}
            <Link to={ROUTE_PATHS.RESULTS} className="home-activity-more">{fr ? 'Tous les résultats' : 'All results'} <ArrowRight size={14} /></Link>
          </div>
        </div>
      </div>
      <style>{`
        .home-activity { padding: 34px 24px 56px; background: linear-gradient(180deg, #0a0a0a 0%, #0c0c0c 100%); border-top: 1px solid rgba(74,213,105,0.12); }
        .home-activity-inner { max-width: 1200px; margin: 0 auto; }
        .home-quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 22px; }
        .home-quick-link { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 12px; text-decoration: none; color: white; border: 1px solid rgba(74,213,105,0.22); background: rgba(74,213,105,0.06); }
        .home-quick-link:hover, .home-quick-link:focus-visible { border-color: #4ad569; background: rgba(74,213,105,0.12); outline: none; }
        .home-quick-link > svg:first-child { color: #4ad569; flex-shrink: 0; }
        .home-quick-link span { display: flex; flex-direction: column; flex: 1; min-width: 0; }
        .home-quick-link strong { font-size: 14px; }
        .home-quick-link small { color: #9ca3af; font-size: 12px; }
        .home-activity-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
        .home-activity-card { border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.025); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; min-width: 0; }
        .home-activity-card h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 15px; color: white; font-weight: 800; }
        .home-activity-card h2 svg { color: #4ad569; }
        .home-activity-card ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; flex: 1; }
        .home-activity-row { display: flex; gap: 10px; align-items: flex-start; }
        .home-activity-row > div { display: flex; flex-direction: column; min-width: 0; }
        .home-activity-row strong { color: white; font-size: 13px; line-height: 1.3; overflow-wrap: anywhere; }
        .home-activity-row span { color: #9ca3af; font-size: 12px; }
        .home-activity-row em { color: #fbbf24; font-size: 12px; font-style: normal; font-weight: 700; }
        .home-activity-empty { color: #777; font-size: 13px; margin: 0; flex: 1; }
        .home-activity-more { margin-top: 12px; display: inline-flex; align-items: center; gap: 6px; color: #4ad569; font-size: 13px; font-weight: 700; text-decoration: none; }
        .home-activity-more:hover, .home-activity-more:focus-visible { text-decoration: underline; }
      `}</style>
    </section>
  );
}
