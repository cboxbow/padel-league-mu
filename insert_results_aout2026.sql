-- ============================================================
-- INSERT résultats — nouveaux tournois traités du dossier
-- "8 RESULTS AOUT 2026" (résultats non encore en base au 2026-08-27)
-- À exécuter dans Supabase > SQL Editor
--
-- ⚠️ Tournois déjà en base (identiques aux PDF, donc PAS réinsérés ici) :
--    t137 (Energia M250 H), t138 (Isla Mixed Open M500),
--    t139h/t139f (Urban BR M100 H/D), t140h (Urban GB M25 H)
--
-- ⚠️ ATTENTION — t143h (Mont Choisy Golf M250 Hommes) :
--    Le fichier source est nommé "M250 MCG - JUL 26 - MEN RESULTS.pdf"
--    (juillet) mais il n'existe AUCUN tournoi M250 Mont Choisy Golf en
--    juillet dans le calendrier officiel (src/data/mpl2026.ts). Le seul
--    tournoi correspondant club+catégorie+division encore sans résultats
--    est t143h, prévu le 2026-08-08 (statut "upcoming"). On part du
--    principe que "JUL 26" est une erreur de nommage du fichier PDF et
--    que ce résultat appartient bien à t143h. À CONFIRMER avant de
--    lancer ce bloc — sinon commenter la section t143h ci-dessous.
-- ============================================================

-- ── t150h — Isla Padel Grand Baie M100 (Hommes) — 2026-08-22 ──────────────
DELETE FROM tournament_results WHERE tournament_id = 't150h';
INSERT INTO tournament_results (
  id, tournament_id, tournament_name, tournament_date,
  category, division, region, club_name,
  rank, team_name, player1_name, player2_name, points
) VALUES
  (gen_random_uuid(), 't150h', 'Isla Padel Grand Baie M100 (Hommes)', '2026-08-22', 'M100', 'men', 'Nord', 'Isla Padel Grand Baie', 1,  'ANTHONY CLARENC / NOAH LAGESSE',              'ANTHONY CLARENC',       'NOAH LAGESSE',        100),
  (gen_random_uuid(), 't150h', 'Isla Padel Grand Baie M100 (Hommes)', '2026-08-22', 'M100', 'men', 'Nord', 'Isla Padel Grand Baie', 2,  'ANDY TSE / HUGO CURT',                        'ANDY TSE',              'HUGO CURT',            70),
  (gen_random_uuid(), 't150h', 'Isla Padel Grand Baie M100 (Hommes)', '2026-08-22', 'M100', 'men', 'Nord', 'Isla Padel Grand Baie', 3,  'AXEL DEMONTOUX / KEVIN BOYER',                'AXEL DEMONTOUX',        'KEVIN BOYER',          60),
  (gen_random_uuid(), 't150h', 'Isla Padel Grand Baie M100 (Hommes)', '2026-08-22', 'M100', 'men', 'Nord', 'Isla Padel Grand Baie', 4,  'MAX SCHAFFO / NOA BEE',                       'MAX SCHAFFO',           'NOA BEE',              55),
  (gen_random_uuid(), 't150h', 'Isla Padel Grand Baie M100 (Hommes)', '2026-08-22', 'M100', 'men', 'Nord', 'Isla Padel Grand Baie', 5,  'THOMAS MAUJEAN / FABIEN BOULLE',              'THOMAS MAUJEAN',        'FABIEN BOULLE',        45),
  (gen_random_uuid(), 't150h', 'Isla Padel Grand Baie M100 (Hommes)', '2026-08-22', 'M100', 'men', 'Nord', 'Isla Padel Grand Baie', 6,  'KUNAL SEWNAUTH / MARTINA HOLA',               'KUNAL SEWNAUTH',        'MARTINA HOLA',         40),
  (gen_random_uuid(), 't150h', 'Isla Padel Grand Baie M100 (Hommes)', '2026-08-22', 'M100', 'men', 'Nord', 'Isla Padel Grand Baie', 7,  'THEO FANCHETTE / RAPHAEL BAYA',               'THEO FANCHETTE',        'RAPHAEL BAYA',         35),
  (gen_random_uuid(), 't150h', 'Isla Padel Grand Baie M100 (Hommes)', '2026-08-22', 'M100', 'men', 'Nord', 'Isla Padel Grand Baie', 8,  'CAMERON DE ROBILLARD / ANDRY AH CHOON',       'CAMERON DE ROBILLARD',  'ANDRY AH CHOON',       30),
  (gen_random_uuid(), 't150h', 'Isla Padel Grand Baie M100 (Hommes)', '2026-08-22', 'M100', 'men', 'Nord', 'Isla Padel Grand Baie', 9,  'GARY LAN / AMRIT DINDOYAL',                   'GARY LAN',              'AMRIT DINDOYAL',       25),
  (gen_random_uuid(), 't150h', 'Isla Padel Grand Baie M100 (Hommes)', '2026-08-22', 'M100', 'men', 'Nord', 'Isla Padel Grand Baie', 10, 'TOM SCHAFFO / DARREN LI',                     'TOM SCHAFFO',           'DARREN LI',            21),
  (gen_random_uuid(), 't150h', 'Isla Padel Grand Baie M100 (Hommes)', '2026-08-22', 'M100', 'men', 'Nord', 'Isla Padel Grand Baie', 11, 'WILLIAM GARCIA / ENZO GARCIA',                'WILLIAM GARCIA',        'ENZO GARCIA',          18),
  (gen_random_uuid(), 't150h', 'Isla Padel Grand Baie M100 (Hommes)', '2026-08-22', 'M100', 'men', 'Nord', 'Isla Padel Grand Baie', 12, 'SIMON LAGESSE / DAVID MAUREL',                'SIMON LAGESSE',         'DAVID MAUREL',         15),
  (gen_random_uuid(), 't150h', 'Isla Padel Grand Baie M100 (Hommes)', '2026-08-22', 'M100', 'men', 'Nord', 'Isla Padel Grand Baie', 13, 'JEAN-EDERN ROUGAGNOU / XAVIER LASSUS',        'JEAN-EDERN ROUGAGNOU',  'XAVIER LASSUS',        10),
  (gen_random_uuid(), 't150h', 'Isla Padel Grand Baie M100 (Hommes)', '2026-08-22', 'M100', 'men', 'Nord', 'Isla Padel Grand Baie', 14, 'JULES BELLEC / VALENTIN PETTON',              'JULES BELLEC',          'VALENTIN PETTON',       5),
  (gen_random_uuid(), 't150h', 'Isla Padel Grand Baie M100 (Hommes)', '2026-08-22', 'M100', 'men', 'Nord', 'Isla Padel Grand Baie', 15, 'JEAN PIERRE RUNGHEN / REMOR LAGESSE',         'JEAN PIERRE RUNGHEN',   'REMOR LAGESSE',         3),
  (gen_random_uuid(), 't150h', 'Isla Padel Grand Baie M100 (Hommes)', '2026-08-22', 'M100', 'men', 'Nord', 'Isla Padel Grand Baie', 16, 'AVNEESH GOODAR / DAVID COOMBES',              'AVNEESH GOODAR',        'DAVID COOMBES',         1);

-- ── t150f — Isla Padel Grand Baie M100 (Dames) — 2026-08-22 ───────────────
DELETE FROM tournament_results WHERE tournament_id = 't150f';
INSERT INTO tournament_results (
  id, tournament_id, tournament_name, tournament_date,
  category, division, region, club_name,
  rank, team_name, player1_name, player2_name, points
) VALUES
  (gen_random_uuid(), 't150f', 'Isla Padel Grand Baie M100 (Dames)', '2026-08-22', 'M100', 'women', 'Nord', 'Isla Padel Grand Baie', 1,  'CARLA ALLISON / KRISTEL KOO',        'CARLA ALLISON',    'KRISTEL KOO',        100),
  (gen_random_uuid(), 't150f', 'Isla Padel Grand Baie M100 (Dames)', '2026-08-22', 'M100', 'women', 'Nord', 'Isla Padel Grand Baie', 2,  'AURELIE PARK / LIA GIRAUD',          'AURELIE PARK',     'LIA GIRAUD',          65),
  (gen_random_uuid(), 't150f', 'Isla Padel Grand Baie M100 (Dames)', '2026-08-22', 'M100', 'women', 'Nord', 'Isla Padel Grand Baie', 3,  'STEPHANIE ANGOH / ANNE LUCAS',       'STEPHANIE ANGOH',  'ANNE LUCAS',          55),
  (gen_random_uuid(), 't150f', 'Isla Padel Grand Baie M100 (Dames)', '2026-08-22', 'M100', 'women', 'Nord', 'Isla Padel Grand Baie', 4,  'LAISA AH CHOON / CLARA KOENIG',      'LAISA AH CHOON',   'CLARA KOENIG',        50),
  (gen_random_uuid(), 't150f', 'Isla Padel Grand Baie M100 (Dames)', '2026-08-22', 'M100', 'women', 'Nord', 'Isla Padel Grand Baie', 5,  'DESIRE DE WAAL / DANILA LACOSTE',    'DESIRE DE WAAL',   'DANILA LACOSTE',      35),
  (gen_random_uuid(), 't150f', 'Isla Padel Grand Baie M100 (Dames)', '2026-08-22', 'M100', 'women', 'Nord', 'Isla Padel Grand Baie', 6,  'YARONI WILKEN / ELIZABETH LOTTER',   'YARONI WILKEN',    'ELIZABETH LOTTER',    25),
  (gen_random_uuid(), 't150f', 'Isla Padel Grand Baie M100 (Dames)', '2026-08-22', 'M100', 'women', 'Nord', 'Isla Padel Grand Baie', 7,  'SANDRA ROGERS / ANNE CLARENC',       'SANDRA ROGERS',    'ANNE CLARENC',        20),
  (gen_random_uuid(), 't150f', 'Isla Padel Grand Baie M100 (Dames)', '2026-08-22', 'M100', 'women', 'Nord', 'Isla Padel Grand Baie', 8,  'ELOISE BOYER / MELANIE NOEL',        'ELOISE BOYER',     'MELANIE NOEL',        15),
  (gen_random_uuid(), 't150f', 'Isla Padel Grand Baie M100 (Dames)', '2026-08-22', 'M100', 'women', 'Nord', 'Isla Padel Grand Baie', 9,  'ANNA ZHIVILO / SHAMIRA KAUMAYA',     'ANNA ZHIVILO',     'SHAMIRA KAUMAYA',     10),
  (gen_random_uuid(), 't150f', 'Isla Padel Grand Baie M100 (Dames)', '2026-08-22', 'M100', 'women', 'Nord', 'Isla Padel Grand Baie', 10, 'AKI GOMAND / JOELLE HIRIGOYEN',      'AKI GOMAND',       'JOELLE HIRIGOYEN',     5);

-- ── t142 — Labourdonnais Mapou M100 (Hommes) — 2026-08-08 ─────────────────
DELETE FROM tournament_results WHERE tournament_id = 't142';
INSERT INTO tournament_results (
  id, tournament_id, tournament_name, tournament_date,
  category, division, region, club_name,
  rank, team_name, player1_name, player2_name, points
) VALUES
  (gen_random_uuid(), 't142', 'Labourdonnais Mapou M100 (Hommes)', '2026-08-08', 'M100', 'men', 'Nord', 'Labourdonnais Mapou', 1, 'DEAN DULTHUMMON / DYLAN DULTHUMMON',   'DEAN DULTHUMMON',    'DYLAN DULTHUMMON',    100),
  (gen_random_uuid(), 't142', 'Labourdonnais Mapou M100 (Hommes)', '2026-08-08', 'M100', 'men', 'Nord', 'Labourdonnais Mapou', 2, 'ANDY TSE / HUGO CURT',                 'ANDY TSE',           'HUGO CURT',            65),
  (gen_random_uuid(), 't142', 'Labourdonnais Mapou M100 (Hommes)', '2026-08-08', 'M100', 'men', 'Nord', 'Labourdonnais Mapou', 3, 'STEPHANE MAUREL / ALEXANDRE GELLE',    'STEPHANE MAUREL',    'ALEXANDRE GELLE',      55),
  (gen_random_uuid(), 't142', 'Labourdonnais Mapou M100 (Hommes)', '2026-08-08', 'M100', 'men', 'Nord', 'Labourdonnais Mapou', 4, 'YANNICK DE MEZIERES / LLOYD POELMANN', 'YANNICK DE MEZIERES', 'LLOYD POELMANN',      50),
  (gen_random_uuid(), 't142', 'Labourdonnais Mapou M100 (Hommes)', '2026-08-08', 'M100', 'men', 'Nord', 'Labourdonnais Mapou', 5, 'KUNAL SEWNAUTH / ENZO VEEREN',         'KUNAL SEWNAUTH',     'ENZO VEEREN',          35),
  (gen_random_uuid(), 't142', 'Labourdonnais Mapou M100 (Hommes)', '2026-08-08', 'M100', 'men', 'Nord', 'Labourdonnais Mapou', 6, 'DYLAN COUTURIER / TOM HAGEN',          'DYLAN COUTURIER',    'TOM HAGEN',            25),
  (gen_random_uuid(), 't142', 'Labourdonnais Mapou M100 (Hommes)', '2026-08-08', 'M100', 'men', 'Nord', 'Labourdonnais Mapou', 7, 'JEAN PIERRE RUNGHEN / THEO ROMAC',     'JEAN PIERRE RUNGHEN', 'THEO ROMAC',           20),
  (gen_random_uuid(), 't142', 'Labourdonnais Mapou M100 (Hommes)', '2026-08-08', 'M100', 'men', 'Nord', 'Labourdonnais Mapou', 8, 'CHARMAINE SCHRODER / RAYDON LANGE',    'CHARMAINE SCHRODER', 'RAYDON LANGE',          15),
  (gen_random_uuid(), 't142', 'Labourdonnais Mapou M100 (Hommes)', '2026-08-08', 'M100', 'men', 'Nord', 'Labourdonnais Mapou', 9, 'TRISTAN WIEHE / CEDRIC VACHET',        'TRISTAN WIEHE',      'CEDRIC VACHET',        10);

-- ── t148h — I Padel by RM Hennessy M100 (Hommes) — 2026-08-16 ─────────────
DELETE FROM tournament_results WHERE tournament_id = 't148h';
INSERT INTO tournament_results (
  id, tournament_id, tournament_name, tournament_date,
  category, division, region, club_name,
  rank, team_name, player1_name, player2_name, points
) VALUES
  (gen_random_uuid(), 't148h', 'I Padel by RM Hennessy M100 (Hommes)', '2026-08-16', 'M100', 'men', 'Centre', 'I Padel by RM Hennessy', 1, 'WILLIAM GARCIA / YANNICK GARCIA',            'WILLIAM GARCIA',        'YANNICK GARCIA',            100),
  (gen_random_uuid(), 't148h', 'I Padel by RM Hennessy M100 (Hommes)', '2026-08-16', 'M100', 'men', 'Centre', 'I Padel by RM Hennessy', 2, 'KEVIN BLANC / PIERRE CHARPENTIER',           'KEVIN BLANC',           'PIERRE CHARPENTIER',        60),
  (gen_random_uuid(), 't148h', 'I Padel by RM Hennessy M100 (Hommes)', '2026-08-16', 'M100', 'men', 'Centre', 'I Padel by RM Hennessy', 3, 'ALEXIS LAVIE / PHILIPPE CAVAIGNAC',          'ALEXIS LAVIE',          'PHILIPPE CAVAIGNAC',        50),
  (gen_random_uuid(), 't148h', 'I Padel by RM Hennessy M100 (Hommes)', '2026-08-16', 'M100', 'men', 'Centre', 'I Padel by RM Hennessy', 4, 'AXEL DEMONTOUX / KEVIN BOYER',               'AXEL DEMONTOUX',        'KEVIN BOYER',               40),
  (gen_random_uuid(), 't148h', 'I Padel by RM Hennessy M100 (Hommes)', '2026-08-16', 'M100', 'men', 'Centre', 'I Padel by RM Hennessy', 5, 'VINCENZE LAU HIU HOONG / ADRIEN WONG',       'VINCENZE LAU HIU HOONG', 'ADRIEN WONG',              25),
  (gen_random_uuid(), 't148h', 'I Padel by RM Hennessy M100 (Hommes)', '2026-08-16', 'M100', 'men', 'Centre', 'I Padel by RM Hennessy', 6, 'DARREN LI / TOM SCHAFFO',                    'DARREN LI',             'TOM SCHAFFO',               10),
  (gen_random_uuid(), 't148h', 'I Padel by RM Hennessy M100 (Hommes)', '2026-08-16', 'M100', 'men', 'Centre', 'I Padel by RM Hennessy', 7, 'ALEKSEI GRIGOREV / XAVIER LASSUS',           'ALEKSEI GRIGOREV',      'XAVIER LASSUS',              5),
  (gen_random_uuid(), 't148h', 'I Padel by RM Hennessy M100 (Hommes)', '2026-08-16', 'M100', 'men', 'Centre', 'I Padel by RM Hennessy', 8, 'EMMANUEL PERRAULT / MAX MULLER',             'EMMANUEL PERRAULT',     'MAX MULLER',                 1);

-- ── t145h — Caña Beau Plan M1000 (Hommes) — 2026-08-15 ────────────────────
DELETE FROM tournament_results WHERE tournament_id = 't145h';
INSERT INTO tournament_results (
  id, tournament_id, tournament_name, tournament_date,
  category, division, region, club_name,
  rank, team_name, player1_name, player2_name, points
) VALUES
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 1,  'OLIVIER COUACAUD / ENZO COUACAUD',                    'OLIVIER COUACAUD',      'ENZO COUACAUD',              1000),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 2,  'PIERRE GADAIT / PAUL-HENRY TEYSSEDRE',                'PIERRE GADAIT',         'PAUL-HENRY TEYSSEDRE',        800),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 3,  'MATHIEU VALLET / AMAURY DE BEER',                     'MATHIEU VALLET',        'AMAURY DE BEER',              750),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 4,  'NICOLAS LEGROS / JAKE LAM HAU CHING',                 'NICOLAS LEGROS',        'JAKE LAM HAU CHING',          720),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 5,  'JEROME MAMET / DIMITRI RAFFRAY',                      'JEROME MAMET',          'DIMITRI RAFFRAY',             675),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 5,  'SIMON KOENIG / JASON ROGERS',                         'SIMON KOENIG',          'JASON ROGERS',                675),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 7,  'RYAN WONG / AARON SANCHEZ',                           'RYAN WONG',             'AARON SANCHEZ',               615),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 7,  'THIERRY PARK / JEAN CHRISTOPHE SCHAFFO',              'THIERRY PARK',          'JEAN CHRISTOPHE SCHAFFO',     615),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 9,  'LOIC MAMET / THOMAS CLARK',                           'LOIC MAMET',            'THOMAS CLARK',                585),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 9,  'ANTHONY KWOK / ROMAIN BOUIC',                         'ANTHONY KWOK',          'ROMAIN BOUIC',                585),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 11, 'ULRIC DUPONT / ANNA BLUE HOUAREAU',                   'ULRIC DUPONT',          'ANNA BLUE HOUAREAU',          535),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 11, 'LUDOVIC LINCOLN / FREDERICK RAFFRAY',                 'LUDOVIC LINCOLN',       'FREDERICK RAFFRAY',           535),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 13, 'JULES DE SPEVILLE / BAPTISTE DESVAUX DE MARIGNY',     'JULES DE SPEVILLE',     'BAPTISTE DESVAUX DE MARIGNY', 505),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 13, 'ADAM AUCKLAND / CLINTON ELLIS',                       'ADAM AUCKLAND',         'CLINTON ELLIS',               485),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 15, 'FLORIAN MANSON / SAMUEL DESJARDINS',                  'FLORIAN MANSON',        'SAMUEL DESJARDINS',           435),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 15, 'ANTOINE DE HAAS / MICKAEL GOSCH',                     'ANTOINE DE HAAS',       'MICKAEL GOSCH',               435),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 17, 'VICTOR LAGESSE / PIERRE CLARENC',                     'VICTOR LAGESSE',        'PIERRE CLARENC',              385),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 17, 'PIERRE LEBRETON / NOAH LAGESSE',                      'PIERRE LEBRETON',       'NOAH LAGESSE',                385),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 19, 'FABRICE PEROUX / SAMY CHARNI',                        'FABRICE PEROUX',        'SAMY CHARNI',                 335),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 19, 'DYLAN DULTHUMMON / DEAN DULTHUMMON',                  'DYLAN DULTHUMMON',      'DEAN DULTHUMMON',             335),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 21, 'TRISTAN LAGESSE / ROMAIN LUQUET',                     'TRISTAN LAGESSE',       'ROMAIN LUQUET',               285),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 21, 'STEPHANE THOMAS / KENNY WONG',                        'STEPHANE THOMAS',       'KENNY WONG',                  285),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 23, 'KIRILL LYZHNIKOV / ANDREY SHEVCHENKO',                'KIRILL LYZHNIKOV',      'ANDREY SHEVCHENKO',           215),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 23, 'CHARLIE GOUPIL / PRZEMEK PALCZYNSKI',                 'CHARLIE GOUPIL',        'PRZEMEK PALCZYNSKI',          235),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 25, 'LEO PELLAS / PIERRE MOUTON',                          'LEO PELLAS',            'PIERRE MOUTON',               138),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 25, 'EDOUARD REMONT / GUILLAUME CASSADIN',                 'EDOUARD REMONT',        'GUILLAUME CASSADIN',          138),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 25, 'RAPHAEL DORNE / FRANCOIS-XAVIER PIELTAIN',            'RAPHAEL DORNE',         'FRANCOIS-XAVIER PIELTAIN',    138),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 25, 'WILLIAM DE ROBILLARD / OLIVIER DESVAUX',              'WILLIAM DE ROBILLARD',  'OLIVIER DESVAUX',             138),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 29, 'AXEL BELLANCOURT / OLAF SCHRODER',                    'AXEL BELLANCOURT',      'OLAF SCHRODER',                43),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 29, 'KEVIN BOYER / AXEL DEMONTOUX',                        'KEVIN BOYER',           'AXEL DEMONTOUX',               43),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 29, 'WILLIAM GARCIA / YANNICK GARCIA',                     'WILLIAM GARCIA',        'YANNICK GARCIA',               43),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 29, 'LEONARDO NAVARRINI / JULIEN HUE',                     'LEONARDO NAVARRINI',    'JULIEN HUE',                   43),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 33, 'ALAIN LANGLOIS / CHRISTIAN BEZANDRY',                 'ALAIN LANGLOIS',        'CHRISTIAN BEZANDRY',           10),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 33, 'TRISTAN WIEHE / XAVIER LASSUS',                       'TRISTAN WIEHE',         'XAVIER LASSUS',                 10),
  (gen_random_uuid(), 't145h', 'Caña Beau Plan M1000 (Hommes)', '2026-08-15', 'M1000', 'men', 'Nord', 'Caña Beau Plan', 33, 'LULU ULCOQ / JEAN-LOUIS MERLE',                       'LULU ULCOQ',            'JEAN-LOUIS MERLE',              10);

-- ── t145f — Caña Beau Plan M1000 (Dames) — 2026-08-15 ─────────────────────
DELETE FROM tournament_results WHERE tournament_id = 't145f';
INSERT INTO tournament_results (
  id, tournament_id, tournament_name, tournament_date,
  category, division, region, club_name,
  rank, team_name, player1_name, player2_name, points
) VALUES
  (gen_random_uuid(), 't145f', 'Caña Beau Plan M1000 (Dames)', '2026-08-15', 'M1000', 'women', 'Nord', 'Caña Beau Plan', 1,  'LAURA KOENIG / ANNA BLUE HOUAREAU',        'LAURA KOENIG',       'ANNA BLUE HOUAREAU',    1000),
  (gen_random_uuid(), 't145f', 'Caña Beau Plan M1000 (Dames)', '2026-08-15', 'M1000', 'women', 'Nord', 'Caña Beau Plan', 2,  'MARINNE GIRAUD / MAGALY SCHAFFO',          'MARINNE GIRAUD',     'MAGALY SCHAFFO',         700),
  (gen_random_uuid(), 't145f', 'Caña Beau Plan M1000 (Dames)', '2026-08-15', 'M1000', 'women', 'Nord', 'Caña Beau Plan', 3,  'CECILE PARK / CELINE DESVAUX DE MARIGNY',  'CECILE PARK',        'CELINE DESVAUX DE MARIGNY', 600),
  (gen_random_uuid(), 't145f', 'Caña Beau Plan M1000 (Dames)', '2026-08-15', 'M1000', 'women', 'Nord', 'Caña Beau Plan', 4,  'MARTINA HOLA / KATE FOO KUNE',             'MARTINA HOLA',       'KATE FOO KUNE',          550),
  (gen_random_uuid(), 't145f', 'Caña Beau Plan M1000 (Dames)', '2026-08-15', 'M1000', 'women', 'Nord', 'Caña Beau Plan', 5,  'YUSHNA SADDUL / COLINE AUMARD',            'YUSHNA SADDUL',      'COLINE AUMARD',          470),
  (gen_random_uuid(), 't145f', 'Caña Beau Plan M1000 (Dames)', '2026-08-15', 'M1000', 'women', 'Nord', 'Caña Beau Plan', 6,  'AURELIE PARK / EMMA ARMAND',               'AURELIE PARK',       'EMMA ARMAND',            420),
  (gen_random_uuid(), 't145f', 'Caña Beau Plan M1000 (Dames)', '2026-08-15', 'M1000', 'women', 'Nord', 'Caña Beau Plan', 7,  'MARINE LINCOLN / CLEA MAMET',              'MARINE LINCOLN',     'CLEA MAMET',             370),
  (gen_random_uuid(), 't145f', 'Caña Beau Plan M1000 (Dames)', '2026-08-15', 'M1000', 'women', 'Nord', 'Caña Beau Plan', 8,  'ELSA TOULET / SANDRINE DE SPEVILLE',       'ELSA TOULET',        'SANDRINE DE SPEVILLE',   320),
  (gen_random_uuid(), 't145f', 'Caña Beau Plan M1000 (Dames)', '2026-08-15', 'M1000', 'women', 'Nord', 'Caña Beau Plan', 9,  'ATHINA AUDIBERT / LIA GIRAUD',             'ATHINA AUDIBERT',    'LIA GIRAUD',             250),
  (gen_random_uuid(), 't145f', 'Caña Beau Plan M1000 (Dames)', '2026-08-15', 'M1000', 'women', 'Nord', 'Caña Beau Plan', 10, 'CARLA ALLISON / DESIRE DE WAAL',           'CARLA ALLISON',      'DESIRE DE WAAL',         210),
  (gen_random_uuid(), 't145f', 'Caña Beau Plan M1000 (Dames)', '2026-08-15', 'M1000', 'women', 'Nord', 'Caña Beau Plan', 11, 'CHARMAINE SCHRODER / MARIE LAGESSE',       'CHARMAINE SCHRODER', 'MARIE LAGESSE',          180),
  (gen_random_uuid(), 't145f', 'Caña Beau Plan M1000 (Dames)', '2026-08-15', 'M1000', 'women', 'Nord', 'Caña Beau Plan', 12, 'ELSA VALLET / ANNE LUCAS',                 'ELSA VALLET',        'ANNE LUCAS',             150),
  (gen_random_uuid(), 't145f', 'Caña Beau Plan M1000 (Dames)', '2026-08-15', 'M1000', 'women', 'Nord', 'Caña Beau Plan', 13, 'STEPHANIE ANGOH / LAISA AH CHOON',         'STEPHANIE ANGOH',    'LAISA AH CHOON',         100);

-- ── t152h — RM Club Grand Baie M25 (Hommes) — 2026-08-22 ──────────────────
DELETE FROM tournament_results WHERE tournament_id = 't152h';
INSERT INTO tournament_results (
  id, tournament_id, tournament_name, tournament_date,
  category, division, region, club_name,
  rank, team_name, player1_name, player2_name, points
) VALUES
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 1,  'JORDAN LEUNG / DENY CORNETTE',              'JORDAN LEUNG',      'DENY CORNETTE',       25),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 2,  'DIDIER COQUET / JOSHUA COQUET',             'DIDIER COQUET',     'JOSHUA COQUET',       20),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 3,  'JEAN DAVID MARTINET / PHILIP ROHNACHER',    'JEAN DAVID MARTINET', 'PHILIP ROHNACHER',  18),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 4,  'HANS PERMALLOO / CEDRIC FLEUROT',           'HANS PERMALLOO',    'CEDRIC FLEUROT',      17),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 5,  'LAURENT SAY / LOIC DUFLOT',                 'LAURENT SAY',       'LOIC DUFLOT',         16),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 6,  'LUIGI PAUMERO MAURY / SELWYN MOOTHY',       'LUIGI PAUMERO MAURY', 'SELWYN MOOTHY',      15),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 7,  'YAZ RUJBALLY / JAYTEEN ADNATH',             'YAZ RUJBALLY',      'JAYTEEN ADNATH',      14),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 8,  'KAI SCHRODER / RAYDON LANGE',               'KAI SCHRODER',      'RAYDON LANGE',        13),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 9,  'JEREMY NOEL / THOMAS BRUNET',               'JEREMY NOEL',       'THOMAS BRUNET',       12),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 10, 'JEAN-VINCENT DACRUZ / OLIVIER CHAVAGNAN',   'JEAN-VINCENT DACRUZ', 'OLIVIER CHAVAGNAN', 11),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 11, 'HUGUES TRIJASSE / NASSIM SHEIKH ALI',       'HUGUES TRIJASSE',   'NASSIM SHEIKH ALI',   10),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 12, 'LAURENT IP WAI / LORENZO DE MARTIN',        'LAURENT IP WAI',    'LORENZO DE MARTIN',    9),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 13, 'YSEN RICHARD / ALEXANDRE JEAN-PIERRE',      'YSEN RICHARD',      'ALEXANDRE JEAN-PIERRE', 8),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 14, 'ANUJ PARMAR / LUCAS CHANTREAU',             'ANUJ PARMAR',       'LUCAS CHANTREAU',      7),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 15, 'DAMIEN PUTTEEA / SHEHRIAD LUNGUT',          'DAMIEN PUTTEEA',    'SHEHRIAD LUNGUT',      6),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 16, 'MAXIME CABURET / RAPHAEL KOURDIAN',         'MAXIME CABURET',    'RAPHAEL KOURDIAN',     5),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 17, 'GUSTAVE MORAND / DAVID LEGALANT',           'GUSTAVE MORAND',    'DAVID LEGALANT',       3),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 17, 'LOUIS NOEL / BERNARD LOPEZ',                'LOUIS NOEL',        'BERNARD LOPEZ',        3),
  (gen_random_uuid(), 't152h', 'RM Club Grand Baie M25 (Hommes)', '2026-08-22', 'M25', 'men', 'Nord', 'RM Club Grand Baie', 17, 'ALEXANDER VOLKHOV / NOAH BOYER',            'ALEXANDER VOLKHOV', 'NOAH BOYER',           3);

-- ── t149 — Club House Black River M250 (Hommes) — 2026-08-22 ─────────────
DELETE FROM tournament_results WHERE tournament_id = 't149';
INSERT INTO tournament_results (
  id, tournament_id, tournament_name, tournament_date,
  category, division, region, club_name,
  rank, team_name, player1_name, player2_name, points
) VALUES
  (gen_random_uuid(), 't149', 'Club House Black River M250 (Hommes)', '2026-08-22', 'M250', 'men', 'Ouest', 'Club House Black River', 1, 'IAN KOENIG / PIERRE GADAIT',              'IAN KOENIG',       'PIERRE GADAIT',       250),
  (gen_random_uuid(), 't149', 'Club House Black River M250 (Hommes)', '2026-08-22', 'M250', 'men', 'Ouest', 'Club House Black River', 2, 'EMMANUEL PERRAULT / PIERRE CHARPENTIER',  'EMMANUEL PERRAULT', 'PIERRE CHARPENTIER', 150),
  (gen_random_uuid(), 't149', 'Club House Black River M250 (Hommes)', '2026-08-22', 'M250', 'men', 'Ouest', 'Club House Black River', 3, 'CLEMENT BESTEL / JADON ROSSLER',          'CLEMENT BESTEL',   'JADON ROSSLER',       125),
  (gen_random_uuid(), 't149', 'Club House Black River M250 (Hommes)', '2026-08-22', 'M250', 'men', 'Ouest', 'Club House Black River', 4, 'WILLIAM DE ROBILLARD / PRZEMEK PALCZYNSKI', 'WILLIAM DE ROBILLARD', 'PRZEMEK PALCZYNSKI', 100),
  (gen_random_uuid(), 't149', 'Club House Black River M250 (Hommes)', '2026-08-22', 'M250', 'men', 'Ouest', 'Club House Black River', 5, 'ROGER DUPONT / XAVIER MAMET',             'ROGER DUPONT',     'XAVIER MAMET',         63),
  (gen_random_uuid(), 't149', 'Club House Black River M250 (Hommes)', '2026-08-22', 'M250', 'men', 'Ouest', 'Club House Black River', 6, 'KIRILL LYZHNIKOV / ANDREY SHEVCHENKO',    'KIRILL LYZHNIKOV', 'ANDREY SHEVCHENKO',    25),
  (gen_random_uuid(), 't149', 'Club House Black River M250 (Hommes)', '2026-08-22', 'M250', 'men', 'Ouest', 'Club House Black River', 7, 'ALEXIS LAVIE / PHILIPPE CAVAIGNAC',       'ALEXIS LAVIE',     'PHILIPPE CAVAIGNAC',   13),
  (gen_random_uuid(), 't149', 'Club House Black River M250 (Hommes)', '2026-08-22', 'M250', 'men', 'Ouest', 'Club House Black River', 8, 'LAURENT DARUTY / SAMUEL GALLET',          'LAURENT DARUTY',   'SAMUEL GALLET',         3);

-- ── t143h — Mont Choisy Golf M250 (Hommes) — date supposée 2026-08-08 ────
-- ⚠️ Voir avertissement en tête de fichier avant d'exécuter ce bloc.
DELETE FROM tournament_results WHERE tournament_id = 't143h';
INSERT INTO tournament_results (
  id, tournament_id, tournament_name, tournament_date,
  category, division, region, club_name,
  rank, team_name, player1_name, player2_name, points
) VALUES
  (gen_random_uuid(), 't143h', 'Mont Choisy Golf M250 (Hommes)', '2026-08-08', 'M250', 'men', 'Nord', 'Mont Choisy Golf', 1, 'PIERRE MOUTON / BRICE LESCROART',                'PIERRE MOUTON',   'BRICE LESCROART',        250),
  (gen_random_uuid(), 't143h', 'Mont Choisy Golf M250 (Hommes)', '2026-08-08', 'M250', 'men', 'Nord', 'Mont Choisy Golf', 2, 'GUILLAUME CASSADIN / EDOUARD REMONT',            'GUILLAUME CASSADIN', 'EDOUARD REMONT',      150),
  (gen_random_uuid(), 't143h', 'Mont Choisy Golf M250 (Hommes)', '2026-08-08', 'M250', 'men', 'Nord', 'Mont Choisy Golf', 3, 'CHARLIE GOUPIL / JULIEN HUE',                    'CHARLIE GOUPIL',  'JULIEN HUE',             125),
  (gen_random_uuid(), 't143h', 'Mont Choisy Golf M250 (Hommes)', '2026-08-08', 'M250', 'men', 'Nord', 'Mont Choisy Golf', 4, 'BAPTISTE DESVAUX DE MARIGNY / JULES DE SPEVILLE', 'BAPTISTE DESVAUX DE MARIGNY', 'JULES DE SPEVILLE', 100),
  (gen_random_uuid(), 't143h', 'Mont Choisy Golf M250 (Hommes)', '2026-08-08', 'M250', 'men', 'Nord', 'Mont Choisy Golf', 5, 'LULU ULCOQ / STEPHANE THOMAS',                   'LULU ULCOQ',      'STEPHANE THOMAS',         63),
  (gen_random_uuid(), 't143h', 'Mont Choisy Golf M250 (Hommes)', '2026-08-08', 'M250', 'men', 'Nord', 'Mont Choisy Golf', 6, 'WILLIAM GARCIA / YANNICK GARCIA',                'WILLIAM GARCIA',  'YANNICK GARCIA',          25),
  (gen_random_uuid(), 't143h', 'Mont Choisy Golf M250 (Hommes)', '2026-08-08', 'M250', 'men', 'Nord', 'Mont Choisy Golf', 7, 'JEAN-PHILIPPE D''UNIENVILLE / PIERRE LEBRETON',  'JEAN-PHILIPPE D''UNIENVILLE', 'PIERRE LEBRETON', 13),
  (gen_random_uuid(), 't143h', 'Mont Choisy Golf M250 (Hommes)', '2026-08-08', 'M250', 'men', 'Nord', 'Mont Choisy Golf', 8, 'AXEL DEMONTOUX / KEVIN BOYER',                   'AXEL DEMONTOUX',  'KEVIN BOYER',              3);

-- ── t141 — I Padel by RM Port Chambly M50 (Hommes) — 2026-08-02 ──────────
DELETE FROM tournament_results WHERE tournament_id = 't141';
INSERT INTO tournament_results (
  id, tournament_id, tournament_name, tournament_date,
  category, division, region, club_name,
  rank, team_name, player1_name, player2_name, points
) VALUES
  (gen_random_uuid(), 't141', 'I Padel by RM Port Chambly M50 (Hommes)', '2026-08-02', 'M50', 'men', 'Sud', 'I Padel by RM Port Chambly', 1,  'YANNICK DE MEZIERES / LLOYD POELMANN', 'YANNICK DE MEZIERES', 'LLOYD POELMANN',   50),
  (gen_random_uuid(), 't141', 'I Padel by RM Port Chambly M50 (Hommes)', '2026-08-02', 'M50', 'men', 'Sud', 'I Padel by RM Port Chambly', 2,  'JOHN DE LA HOGUE / LAURA DE LA HOGUE', 'JOHN DE LA HOGUE',    'LAURA DE LA HOGUE', 36),
  (gen_random_uuid(), 't141', 'I Padel by RM Port Chambly M50 (Hommes)', '2026-08-02', 'M50', 'men', 'Sud', 'I Padel by RM Port Chambly', 3,  'YANNICK GARCIA / ENZO GARCIA',         'YANNICK GARCIA',      'ENZO GARCIA',       32),
  (gen_random_uuid(), 't141', 'I Padel by RM Port Chambly M50 (Hommes)', '2026-08-02', 'M50', 'men', 'Sud', 'I Padel by RM Port Chambly', 4,  'GARY LAN / KENNY LAM',                 'GARY LAN',            'KENNY LAM',         30),
  (gen_random_uuid(), 't141', 'I Padel by RM Port Chambly M50 (Hommes)', '2026-08-02', 'M50', 'men', 'Sud', 'I Padel by RM Port Chambly', 5,  'KEITH LIOONG / DARREN LI',             'KEITH LIOONG',        'DARREN LI',         28),
  (gen_random_uuid(), 't141', 'I Padel by RM Port Chambly M50 (Hommes)', '2026-08-02', 'M50', 'men', 'Sud', 'I Padel by RM Port Chambly', 6,  'TONY KONG / RONNIE SIEW',              'TONY KONG',           'RONNIE SIEW',       26),
  (gen_random_uuid(), 't141', 'I Padel by RM Port Chambly M50 (Hommes)', '2026-08-02', 'M50', 'men', 'Sud', 'I Padel by RM Port Chambly', 7,  'IBRAHIM DALA / NICHOLAS PINAGAPAMY',   'IBRAHIM DALA',        'NICHOLAS PINAGAPAMY', 24),
  (gen_random_uuid(), 't141', 'I Padel by RM Port Chambly M50 (Hommes)', '2026-08-02', 'M50', 'men', 'Sud', 'I Padel by RM Port Chambly', 8,  'GREGORY CHAROUX / ALEX SAMUELSON',     'GREGORY CHAROUX',     'ALEX SAMUELSON',    22),
  (gen_random_uuid(), 't141', 'I Padel by RM Port Chambly M50 (Hommes)', '2026-08-02', 'M50', 'men', 'Sud', 'I Padel by RM Port Chambly', 9,  'THOMAS D''UNIENVILLE / ZAID JEEWON',   'THOMAS D''UNIENVILLE', 'ZAID JEEWON',      20),
  (gen_random_uuid(), 't141', 'I Padel by RM Port Chambly M50 (Hommes)', '2026-08-02', 'M50', 'men', 'Sud', 'I Padel by RM Port Chambly', 10, 'FABIEN KATTIC / ANDRY AH CHOON',       'FABIEN KATTIC',       'ANDRY AH CHOON',    18),
  (gen_random_uuid(), 't141', 'I Padel by RM Port Chambly M50 (Hommes)', '2026-08-02', 'M50', 'men', 'Sud', 'I Padel by RM Port Chambly', 11, 'BRICE HAREL / FABIEN BOULLE',          'BRICE HAREL',         'FABIEN BOULLE',     14),
  (gen_random_uuid(), 't141', 'I Padel by RM Port Chambly M50 (Hommes)', '2026-08-02', 'M50', 'men', 'Sud', 'I Padel by RM Port Chambly', 12, 'NEEL BOOTH / MATTEO MOTTA',            'NEEL BOOTH',          'MATTEO MOTTA',      10),
  (gen_random_uuid(), 't141', 'I Padel by RM Port Chambly M50 (Hommes)', '2026-08-02', 'M50', 'men', 'Sud', 'I Padel by RM Port Chambly', 13, 'BRYAN JOHN CHUAN / YANNICK YEW',       'BRYAN JOHN CHUAN',    'YANNICK YEW',        8);

-- ── t153h — RM Club Tamarin M50 (Hommes) — 2026-08-23 ────────────────────
DELETE FROM tournament_results WHERE tournament_id = 't153h';
INSERT INTO tournament_results (
  id, tournament_id, tournament_name, tournament_date,
  category, division, region, club_name,
  rank, team_name, player1_name, player2_name, points
) VALUES
  (gen_random_uuid(), 't153h', 'RM Club Tamarin M50 (Hommes)', '2026-08-23', 'M50', 'men', 'Ouest', 'RM Club Tamarin', 1,  'KEVIN BLANC / CALVIN HOWARTH',              'KEVIN BLANC',      'CALVIN HOWARTH',            50),
  (gen_random_uuid(), 't153h', 'RM Club Tamarin M50 (Hommes)', '2026-08-23', 'M50', 'men', 'Ouest', 'RM Club Tamarin', 2,  'BRIAN LAM / KHIM LEE BAW',                  'BRIAN LAM',        'KHIM LEE BAW',              34),
  (gen_random_uuid(), 't153h', 'RM Club Tamarin M50 (Hommes)', '2026-08-23', 'M50', 'men', 'Ouest', 'RM Club Tamarin', 3,  'ANDRY AH CHOON / DARREN LI',                'ANDRY AH CHOON',   'DARREN LI',                 30),
  (gen_random_uuid(), 't153h', 'RM Club Tamarin M50 (Hommes)', '2026-08-23', 'M50', 'men', 'Ouest', 'RM Club Tamarin', 4,  'IBRAHIM DALA / MOHAMMAD PEERSAIB',          'IBRAHIM DALA',     'MOHAMMAD PEERSAIB',         26),
  (gen_random_uuid(), 't153h', 'RM Club Tamarin M50 (Hommes)', '2026-08-23', 'M50', 'men', 'Ouest', 'RM Club Tamarin', 5,  'LOIC BONCOEUR / MATTEO MOTTA',              'LOIC BONCOEUR',    'MATTEO MOTTA',              22),
  (gen_random_uuid(), 't153h', 'RM Club Tamarin M50 (Hommes)', '2026-08-23', 'M50', 'men', 'Ouest', 'RM Club Tamarin', 6,  'SYLVAIN LIOTARD / SERGEI VASILEV',          'SYLVAIN LIOTARD',  'SERGEI VASILEV',            18),
  (gen_random_uuid(), 't153h', 'RM Club Tamarin M50 (Hommes)', '2026-08-23', 'M50', 'men', 'Ouest', 'RM Club Tamarin', 7,  'ALAIN GUSTIN / THIERRY BINDINI',            'ALAIN GUSTIN',     'THIERRY BINDINI',           14),
  (gen_random_uuid(), 't153h', 'RM Club Tamarin M50 (Hommes)', '2026-08-23', 'M50', 'men', 'Ouest', 'RM Club Tamarin', 8,  'ALEKSEI GRIGOREV / ADAM TARASOV',           'ALEKSEI GRIGOREV', 'ADAM TARASOV',              10),
  (gen_random_uuid(), 't153h', 'RM Club Tamarin M50 (Hommes)', '2026-08-23', 'M50', 'men', 'Ouest', 'RM Club Tamarin', 9,  'LUDOVIC POILLY / ADRIAN HUGGETT',           'LUDOVIC POILLY',   'ADRIAN HUGGETT',             8),
  (gen_random_uuid(), 't153h', 'RM Club Tamarin M50 (Hommes)', '2026-08-23', 'M50', 'men', 'Ouest', 'RM Club Tamarin', 10, 'GIANNI BERGANDI / ALEXANDRE TSANG MANG KIN', 'GIANNI BERGANDI', 'ALEXANDRE TSANG MANG KIN',  6),
  (gen_random_uuid(), 't153h', 'RM Club Tamarin M50 (Hommes)', '2026-08-23', 'M50', 'men', 'Ouest', 'RM Club Tamarin', 11, 'VADIM KAMPEL / GUILLAUME DORZA',            'VADIM KAMPEL',     'GUILLAUME DORZA',            4),
  (gen_random_uuid(), 't153h', 'RM Club Tamarin M50 (Hommes)', '2026-08-23', 'M50', 'men', 'Ouest', 'RM Club Tamarin', 12, 'THOMAS ROUSSET / FRANC DUPONT',             'THOMAS ROUSSET',   'FRANC DUPONT',               2);

-- ── t147 — SPARC Cascavelle M50 (Hommes) — 2026-08-15 ────────────────────
DELETE FROM tournament_results WHERE tournament_id = 't147';
INSERT INTO tournament_results (
  id, tournament_id, tournament_name, tournament_date,
  category, division, region, club_name,
  rank, team_name, player1_name, player2_name, points
) VALUES
  (gen_random_uuid(), 't147', 'SPARC Cascavelle M50 (Hommes)', '2026-08-15', 'M50', 'men', 'Ouest', 'SPARC Cascavelle', 1,  'BRYAN FOO-KUNE / KEITH LIOONG',        'BRYAN FOO-KUNE',    'KEITH LIOONG',       50),
  (gen_random_uuid(), 't147', 'SPARC Cascavelle M50 (Hommes)', '2026-08-15', 'M50', 'men', 'Ouest', 'SPARC Cascavelle', 2,  'LOIC BONCOEUR / MATHIS MAZOULE',       'LOIC BONCOEUR',     'MATHIS MAZOULE',     36),
  (gen_random_uuid(), 't147', 'SPARC Cascavelle M50 (Hommes)', '2026-08-15', 'M50', 'men', 'Ouest', 'SPARC Cascavelle', 3,  'MAXIME HUYSE / THIERRY BINDINI',       'MAXIME HUYSE',      'THIERRY BINDINI',    32),
  (gen_random_uuid(), 't147', 'SPARC Cascavelle M50 (Hommes)', '2026-08-15', 'M50', 'men', 'Ouest', 'SPARC Cascavelle', 4,  'MATTEO MOTTA / NEEL BOOTH',            'MATTEO MOTTA',      'NEEL BOOTH',         30),
  (gen_random_uuid(), 't147', 'SPARC Cascavelle M50 (Hommes)', '2026-08-15', 'M50', 'men', 'Ouest', 'SPARC Cascavelle', 5,  'NICHOLAS PINAGAPAMY / FABIEN KATTIC',  'NICHOLAS PINAGAPAMY', 'FABIEN KATTIC',    28),
  (gen_random_uuid(), 't147', 'SPARC Cascavelle M50 (Hommes)', '2026-08-15', 'M50', 'men', 'Ouest', 'SPARC Cascavelle', 6,  'DORIAN RODOT / NICOLAS FEUGIER',       'DORIAN RODOT',      'NICOLAS FEUGIER',    26),
  (gen_random_uuid(), 't147', 'SPARC Cascavelle M50 (Hommes)', '2026-08-15', 'M50', 'men', 'Ouest', 'SPARC Cascavelle', 7,  'IBRAHIM DALA / ANDRY AH CHOON',        'IBRAHIM DALA',      'ANDRY AH CHOON',     24),
  (gen_random_uuid(), 't147', 'SPARC Cascavelle M50 (Hommes)', '2026-08-15', 'M50', 'men', 'Ouest', 'SPARC Cascavelle', 8,  'GIANNI BERGANDI / BENOIT DELMAIRE',    'GIANNI BERGANDI',   'BENOIT DELMAIRE',    22),
  (gen_random_uuid(), 't147', 'SPARC Cascavelle M50 (Hommes)', '2026-08-15', 'M50', 'men', 'Ouest', 'SPARC Cascavelle', 9,  'DHRUV DESAI / POUBALEN PARASURAMAN',   'DHRUV DESAI',       'POUBALEN PARASURAMAN', 20),
  (gen_random_uuid(), 't147', 'SPARC Cascavelle M50 (Hommes)', '2026-08-15', 'M50', 'men', 'Ouest', 'SPARC Cascavelle', 10, 'KELVIN JAGLOO / JEAN-MICHEL LACIDE',   'KELVIN JAGLOO',     'JEAN-MICHEL LACIDE', 18),
  (gen_random_uuid(), 't147', 'SPARC Cascavelle M50 (Hommes)', '2026-08-15', 'M50', 'men', 'Ouest', 'SPARC Cascavelle', 11, 'O''LEARY OXENHAM / THOMAS LACIDE',     'O''LEARY OXENHAM',  'THOMAS LACIDE',      14),
  (gen_random_uuid(), 't147', 'SPARC Cascavelle M50 (Hommes)', '2026-08-15', 'M50', 'men', 'Ouest', 'SPARC Cascavelle', 12, 'VADIM KAMPEL / YAN BRADSHAW',          'VADIM KAMPEL',      'YAN BRADSHAW',       10),
  (gen_random_uuid(), 't147', 'SPARC Cascavelle M50 (Hommes)', '2026-08-15', 'M50', 'men', 'Ouest', 'SPARC Cascavelle', 13, 'SYLVAIN LIOTARD / SERGEI VASILEV',     'SYLVAIN LIOTARD',   'SERGEI VASILEV',      8),
  (gen_random_uuid(), 't147', 'SPARC Cascavelle M50 (Hommes)', '2026-08-15', 'M50', 'men', 'Ouest', 'SPARC Cascavelle', 14, 'MATHIEU GUERINEAU / GUILLAUME DORZA',  'MATHIEU GUERINEAU', 'GUILLAUME DORZA',     6),
  (gen_random_uuid(), 't147', 'SPARC Cascavelle M50 (Hommes)', '2026-08-15', 'M50', 'men', 'Ouest', 'SPARC Cascavelle', 15, 'DMITRY NOVOPASHIN / ALISTAIR PETERSEN', 'DMITRY NOVOPASHIN', 'ALISTAIR PETERSEN',  4),
  (gen_random_uuid(), 't147', 'SPARC Cascavelle M50 (Hommes)', '2026-08-15', 'M50', 'men', 'Ouest', 'SPARC Cascavelle', 16, 'LUIGI PAUMERO MAURY / SELWYN MOOTHY',  'LUIGI PAUMERO MAURY', 'SELWYN MOOTHY',     2);

-- ── t144h — Terres Brunes Sports & Leisure M50 (Hommes) — 2026-08-08 ─────
DELETE FROM tournament_results WHERE tournament_id = 't144h';
INSERT INTO tournament_results (
  id, tournament_id, tournament_name, tournament_date,
  category, division, region, club_name,
  rank, team_name, player1_name, player2_name, points
) VALUES
  (gen_random_uuid(), 't144h', 'Terres Brunes Sports & Leisure M50 (Hommes)', '2026-08-08', 'M50', 'men', 'Ouest', 'Terres Brunes Sports & Leisure', 1,  'FABIEN KATTIC / SAMUEL DE MAROUSSEM',        'FABIEN KATTIC',       'SAMUEL DE MAROUSSEM', 50),
  (gen_random_uuid(), 't144h', 'Terres Brunes Sports & Leisure M50 (Hommes)', '2026-08-08', 'M50', 'men', 'Ouest', 'Terres Brunes Sports & Leisure', 2,  'YANN LIM AH TOCK / VINCENZE LAU HIU HOONG',  'YANN LIM AH TOCK',    'VINCENZE LAU HIU HOONG', 34),
  (gen_random_uuid(), 't144h', 'Terres Brunes Sports & Leisure M50 (Hommes)', '2026-08-08', 'M50', 'men', 'Ouest', 'Terres Brunes Sports & Leisure', 3,  'BRYAN FOO-KUNE / YANNICK YEW',               'BRYAN FOO-KUNE',      'YANNICK YEW',          30),
  (gen_random_uuid(), 't144h', 'Terres Brunes Sports & Leisure M50 (Hommes)', '2026-08-08', 'M50', 'men', 'Ouest', 'Terres Brunes Sports & Leisure', 4,  'WERNER LABUSCHAGNE / FRANCOIS HUGNIN',       'WERNER LABUSCHAGNE',  'FRANCOIS HUGNIN',      26),
  (gen_random_uuid(), 't144h', 'Terres Brunes Sports & Leisure M50 (Hommes)', '2026-08-08', 'M50', 'men', 'Ouest', 'Terres Brunes Sports & Leisure', 5,  'AMRIT DINDOYAL / STEVENS ANGOH',             'AMRIT DINDOYAL',      'STEVENS ANGOH',        22),
  (gen_random_uuid(), 't144h', 'Terres Brunes Sports & Leisure M50 (Hommes)', '2026-08-08', 'M50', 'men', 'Ouest', 'Terres Brunes Sports & Leisure', 6,  'IBRAHIM DALA / ANDRY AH CHOON',              'IBRAHIM DALA',        'ANDRY AH CHOON',       18),
  (gen_random_uuid(), 't144h', 'Terres Brunes Sports & Leisure M50 (Hommes)', '2026-08-08', 'M50', 'men', 'Ouest', 'Terres Brunes Sports & Leisure', 7,  'ALEKSEI GRIGOREV / ADAM TARASOV',            'ALEKSEI GRIGOREV',    'ADAM TARASOV',         14),
  (gen_random_uuid(), 't144h', 'Terres Brunes Sports & Leisure M50 (Hommes)', '2026-08-08', 'M50', 'men', 'Ouest', 'Terres Brunes Sports & Leisure', 8,  'THIERRY BINDINI / DENIS VINSON',             'THIERRY BINDINI',     'DENIS VINSON',         10),
  (gen_random_uuid(), 't144h', 'Terres Brunes Sports & Leisure M50 (Hommes)', '2026-08-08', 'M50', 'men', 'Ouest', 'Terres Brunes Sports & Leisure', 9,  'POUBALEN PARASURAMAN / DHRUV DESAI',         'POUBALEN PARASURAMAN', 'DHRUV DESAI',          8),
  (gen_random_uuid(), 't144h', 'Terres Brunes Sports & Leisure M50 (Hommes)', '2026-08-08', 'M50', 'men', 'Ouest', 'Terres Brunes Sports & Leisure', 10, 'SERGEI VASILEV / DMITRY NOVOPASHIN',         'SERGEI VASILEV',      'DMITRY NOVOPASHIN',    6),
  (gen_random_uuid(), 't144h', 'Terres Brunes Sports & Leisure M50 (Hommes)', '2026-08-08', 'M50', 'men', 'Ouest', 'Terres Brunes Sports & Leisure', 11, 'JEROME PILOT / LOIC CHAROUX',                'JEROME PILOT',        'LOIC CHAROUX',         4),
  (gen_random_uuid(), 't144h', 'Terres Brunes Sports & Leisure M50 (Hommes)', '2026-08-08', 'M50', 'men', 'Ouest', 'Terres Brunes Sports & Leisure', 12, 'THOMAS ROUSSET / FRANC DUPONT',              'THOMAS ROUSSET',      'FRANC DUPONT',         2);

-- ── t144f — Terres Brunes Sports & Leisure M50 (Dames) — 2026-08-08 ──────
DELETE FROM tournament_results WHERE tournament_id = 't144f';
INSERT INTO tournament_results (
  id, tournament_id, tournament_name, tournament_date,
  category, division, region, club_name,
  rank, team_name, player1_name, player2_name, points
) VALUES
  (gen_random_uuid(), 't144f', 'Terres Brunes Sports & Leisure M50 (Dames)', '2026-08-08', 'M50', 'women', 'Ouest', 'Terres Brunes Sports & Leisure', 1, 'ANNE LUCAS / AGNES SAGOT',                'ANNE LUCAS',       'AGNES SAGOT',       50),
  (gen_random_uuid(), 't144f', 'Terres Brunes Sports & Leisure M50 (Dames)', '2026-08-08', 'M50', 'women', 'Ouest', 'Terres Brunes Sports & Leisure', 2, 'YARONI WILKEN / SASHA WAGNER',            'YARONI WILKEN',    'SASHA WAGNER',      30),
  (gen_random_uuid(), 't144f', 'Terres Brunes Sports & Leisure M50 (Dames)', '2026-08-08', 'M50', 'women', 'Ouest', 'Terres Brunes Sports & Leisure', 3, 'AUDREY GALLET / CATHERINE RONIN',         'AUDREY GALLET',    'CATHERINE RONIN',   24),
  (gen_random_uuid(), 't144f', 'Terres Brunes Sports & Leisure M50 (Dames)', '2026-08-08', 'M50', 'women', 'Ouest', 'Terres Brunes Sports & Leisure', 4, 'ROXANE GALLET / VICTORIA BOUIC',          'ROXANE GALLET',    'VICTORIA BOUIC',    18),
  (gen_random_uuid(), 't144f', 'Terres Brunes Sports & Leisure M50 (Dames)', '2026-08-08', 'M50', 'women', 'Ouest', 'Terres Brunes Sports & Leisure', 5, 'MARINA COSTA / NATACHA REY',              'MARINA COSTA',     'NATACHA REY',       12),
  (gen_random_uuid(), 't144f', 'Terres Brunes Sports & Leisure M50 (Dames)', '2026-08-08', 'M50', 'women', 'Ouest', 'Terres Brunes Sports & Leisure', 6, 'MELODY DE ROBILLARD / NATHALIE LAM',      'MELODY DE ROBILLARD', 'NATHALIE LAM',    8),
  (gen_random_uuid(), 't144f', 'Terres Brunes Sports & Leisure M50 (Dames)', '2026-08-08', 'M50', 'women', 'Ouest', 'Terres Brunes Sports & Leisure', 7, 'PAULINE CHARPENTIER / SINDY DE ROBILLARD', 'PAULINE CHARPENTIER', 'SINDY DE ROBILLARD', 4),
  (gen_random_uuid(), 't144f', 'Terres Brunes Sports & Leisure M50 (Dames)', '2026-08-08', 'M50', 'women', 'Ouest', 'Terres Brunes Sports & Leisure', 8, 'LOTTICIA LAW LAM / STEFFI KWO',           'LOTTICIA LAW LAM', 'STEFFI KWO',         2);

-- ── Vérification globale ───────────────────────────────────────────────
SELECT tournament_id, count(*) AS lignes, sum(points) AS points_total
FROM tournament_results
WHERE tournament_id IN (
  't150h','t150f','t142','t148h','t145h','t145f','t152h','t149','t143h',
  't141','t153h','t147','t144h','t144f'
)
GROUP BY tournament_id
ORDER BY tournament_id;
