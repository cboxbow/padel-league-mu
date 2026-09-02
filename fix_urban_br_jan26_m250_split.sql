begin;

-- Urban Sport Black River M250 - 24 janvier 2026
-- Separation des resultats Hommes et Dames qui avaient ete fusionnes dans t013h.

update public.tournament_results
set
  tournament_id = 't013f',
  tournament_name = 'Urban Sport Black River M250 (Dames)',
  division = 'women',
  category = 'M250',
  tournament_date = '2026-01-24',
  region = 'Ouest',
  club_name = 'Urban Sport Black River'
where id in (
  'c45baa84-c191-4032-b01b-cc01460b12d6',
  'a869c654-6b0a-46cf-b63e-a23400d4c0a9',
  '7eae2b57-e6f0-4f13-9608-6afd1fc60f34',
  'c3df898f-8f72-49bb-97a8-8ac8ad53f0df',
  'a8663d5d-cd1c-4d5a-901f-db8a6e655e11',
  'a338b819-83d8-4a58-8fea-28972dd757c8',
  '78277a35-c5cc-455e-92ad-2842e47f2064',
  '3feb7bb9-e2ab-4292-b873-9ea70e53048f',
  '36497504-dce9-4bd9-9376-3f884d51bd94'
);

update public.tournament_results
set
  tournament_id = 't013h',
  tournament_name = 'Urban Sport Black River M250 (Hommes)',
  division = 'men',
  category = 'M250',
  tournament_date = '2026-01-24',
  region = 'Ouest',
  club_name = 'Urban Sport Black River'
where tournament_id = 't013h'
  and tournament_date = '2026-01-24'
  and club_name = 'Urban Sport Black River'
  and category = 'M250';

update public.historical_tournament_results
set
  event_name = 'M250 - URBAN BR - JAN 26 - WOMEN',
  sheet_name = 'M250 - URBAN BR - JAN 26 - WOMEN',
  division = 'women',
  category = 'M250',
  event_date = '2026-01-24',
  club_name = 'Urban Sport Black River'
where event_date = '2026-01-24'
  and club_name = 'Urban Sport Black River'
  and category = 'M250'
  and sheet_name ilike '%WOME%';

-- Reprise robuste si une passe precedente a deja renomme les lignes Women en MEN.
update public.historical_tournament_results
set
  event_name = 'M250 - URBAN BR - JAN 26 - WOMEN',
  sheet_name = 'M250 - URBAN BR - JAN 26 - WOMEN',
  division = 'women',
  category = 'M250',
  event_date = '2026-01-24',
  club_name = 'Urban Sport Black River'
where event_date = '2026-01-24'
  and club_name = 'Urban Sport Black River'
  and category = 'M250'
  and player1_name in (
    'PAMELA JUGDARREE',
    'CELINE DESVAUX DE MARIGNY',
    'MARTINA HOLA',
    'PASCALE FERRAT',
    'ELIZABETH RECTER',
    'VALENTINA CRUCIANI',
    'OLGA KLIMENKO',
    'MELODY DE ROBILLARD',
    'DESIRE DE WAAL'
  );

update public.historical_tournament_results
set
  event_name = 'M250 - URBAN BR - JAN 26 - MEN',
  sheet_name = 'M250 - URBAN BR - JAN 26 - MEN',
  division = 'men',
  category = 'M250',
  event_date = '2026-01-24',
  club_name = 'Urban Sport Black River'
where event_date = '2026-01-24'
  and club_name = 'Urban Sport Black River'
  and category = 'M250'
  and sheet_name ilike '%MEN%'
  and sheet_name not ilike '%WOM%';

commit;

-- Verification attendue:
-- t013h / men   = 12 lignes
-- t013f / women = 9 lignes
select tournament_id, division, count(*) as rows
from public.tournament_results
where tournament_id in ('t013h', 't013f')
group by tournament_id, division
order by tournament_id, division;
