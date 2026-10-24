-- ============================================================================
-- MPL - LOT L3 : dates de finale des tableaux qui changent de mois
-- ============================================================================
-- Prerequis : ranking_snapshots_l3_migration.sql.
-- Seul tableau de la saison qui commence un mois et finit le suivant :
--   M1000 Urban Sport Black River, commence le vendredi 31/10/2025, etiquete
--   "NOV 25" dans le classeur federal -> finale retenue le dimanche 02/11/2025
--   (format M1000 vendredi-dimanche ; date exacte a confirmer, seul le mois
--   compte pour la regle). 73 lignes : Hommes 43, Dames 23, U15 7.
-- Effet : ce M1000 compte jusqu'au classement d'OCTOBRE 2026 inclus et expire
--   au classement de NOVEMBRE 2026 (au lieu d'expirer des octobre).
-- Les tableaux d'un jour n'ont pas besoin de date de fin (fin = debut).
-- Les 6 tableaux du 31/10/2026 recoivent tout de meme leur date (31/10) :
--   finale confirmee, plus d alerte "date de finale a verifier" au generateur.
-- A FAIRE A CHAQUE NOUVEAU TOURNOI SUR PLUSIEURS JOURS : renseigner
--   tournaments.end_date (et event_end_date des resultats importes).
-- ============================================================================
begin;

update public.historical_tournament_results
   set event_end_date = date '2025-11-02'
 where event_date = date '2025-10-31'
   and event_name like 'M1000 - URBAN BR - NOV 25 - %'
   and event_end_date is distinct from date '2025-11-02';

-- Tournois du samedi 31/10/2026 : finale le jour meme (confirme le 24/10/2026),
-- ils comptent pour le classement d'OCTOBRE 2026 (tournois de novembre).
update public.tournaments
   set end_date = date '2026-10-31'
 where id in ('t263h', 't264f', 't197h', 't197f', 't195h', 't195f')
   and coalesce(date, tournament_date) = date '2026-10-31'
   and end_date is distinct from date '2026-10-31';

select id, name, coalesce(date, tournament_date) as debut, end_date
  from public.tournaments
 where id in ('t263h', 't264f', 't197h', 't197f', 't195h', 't195f') order by id;

select event_name, event_date, event_end_date, count(*) as lignes
  from public.historical_tournament_results
 where event_name like 'M1000 - URBAN BR - NOV 25 - %'
 group by 1, 2, 3 order by 1;

commit;
