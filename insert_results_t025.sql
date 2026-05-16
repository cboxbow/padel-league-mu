-- ============================================================
-- INSERT résultats M100 Urban Sport Grand Baie - 7 Fév 2026
-- Tournoi ID: t025
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

-- Supprime les éventuelles données existantes pour ce tournoi
DELETE FROM tournament_results WHERE tournament_id = 't025';

-- Insère les 14 paires avec UUID générés automatiquement
INSERT INTO tournament_results (
  id, tournament_id, tournament_name, tournament_date,
  category, division, region, club_name,
  rank, team_name, player1_name, player2_name, points
) VALUES
  (gen_random_uuid(), 't025', 'M100 Urban Grand Baie', '2026-02-07', 'M100', 'men', 'Nord', 'Urban Sport Grand Baie', 1,  'FABRICE/ANDY',   'Fabrice Nayna',    'Andy Tse',            100),
  (gen_random_uuid(), 't025', 'M100 Urban Grand Baie', '2026-02-07', 'M100', 'men', 'Nord', 'Urban Sport Grand Baie', 2,  'CEDRIC/HUGO',    'Cedric Vachet',    'Hugo Curt',            70),
  (gen_random_uuid(), 't025', 'M100 Urban Grand Baie', '2026-02-07', 'M100', 'men', 'Nord', 'Urban Sport Grand Baie', 3,  'NOA/JULIEN',     'Noa Bee',          'Julien Bee',           60),
  (gen_random_uuid(), 't025', 'M100 Urban Grand Baie', '2026-02-07', 'M100', 'men', 'Nord', 'Urban Sport Grand Baie', 4,  'MARTIN/FRAN',    'Martin David',     'Fran Gomez',           55),
  (gen_random_uuid(), 't025', 'M100 Urban Grand Baie', '2026-02-07', 'M100', 'men', 'Nord', 'Urban Sport Grand Baie', 5,  'QUENTIN/AXEL',   'Quentin Thelohan', 'Axel Demontoux',       45),
  (gen_random_uuid(), 't025', 'M100 Urban Grand Baie', '2026-02-07', 'M100', 'men', 'Nord', 'Urban Sport Grand Baie', 6,  'CEDRIC/DAVID',   'Cedric Rahmouni',  'David Soulage',        40),
  (gen_random_uuid(), 't025', 'M100 Urban Grand Baie', '2026-02-07', 'M100', 'men', 'Nord', 'Urban Sport Grand Baie', 7,  'ROMAIN/LUDOVIC', 'Romain Bernard',   'Ludovic Rousseau',     35),
  (gen_random_uuid(), 't025', 'M100 Urban Grand Baie', '2026-02-07', 'M100', 'men', 'Nord', 'Urban Sport Grand Baie', 8,  'ASHLEY/LUCA',    'Ashley Jugdarree', 'Luca Navarrini',       30),
  (gen_random_uuid(), 't025', 'M100 Urban Grand Baie', '2026-02-07', 'M100', 'men', 'Nord', 'Urban Sport Grand Baie', 9,  'FABIEN/PAUL',    'Fabien Fournier',  'Paul Senaffe',         25),
  (gen_random_uuid(), 't025', 'M100 Urban Grand Baie', '2026-02-07', 'M100', 'men', 'Nord', 'Urban Sport Grand Baie', 10, 'KEVIN/ANDRY',    'Kevin Boyer',      'Andry Ah Choon',       21),
  (gen_random_uuid(), 't025', 'M100 Urban Grand Baie', '2026-02-07', 'M100', 'men', 'Nord', 'Urban Sport Grand Baie', 11, 'LAURENT/PASCAL', 'Laurent Hannelas', 'Pascal Quirin',        18),
  (gen_random_uuid(), 't025', 'M100 Urban Grand Baie', '2026-02-07', 'M100', 'men', 'Nord', 'Urban Sport Grand Baie', 12, 'THOMAS/AARON',   'Thomas Amargos',   'Aaron Fournier',       15),
  (gen_random_uuid(), 't025', 'M100 Urban Grand Baie', '2026-02-07', 'M100', 'men', 'Nord', 'Urban Sport Grand Baie', 13, 'JEREMY/OLIVIER', 'Jeremy Nobels',    'Olivier De Preville', 10),
  (gen_random_uuid(), 't025', 'M100 Urban Grand Baie', '2026-02-07', 'M100', 'men', 'Nord', 'Urban Sport Grand Baie', 14, 'SARVISH/KUNAL',  'Sarvish Keenoo',   'Kunal Sewnauth',        5);

-- Vérification
SELECT rank, team_name, player1_name, player2_name, points
FROM tournament_results
WHERE tournament_id = 't025'
ORDER BY rank;
