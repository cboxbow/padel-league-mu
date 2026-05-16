-- ============================================================
--  MPL 2026 — SQL COMPLET pour la table tournaments (Supabase)
--  Auteur : MPL Admin
--  Date   : 2026-03-22
-- ============================================================

-- ── 1. CREATION DE LA TABLE ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournaments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  club_id          TEXT        NOT NULL REFERENCES public.clubs(id) ON DELETE RESTRICT,
  club_name        TEXT        NOT NULL,
  date             DATE        NOT NULL,
  region           TEXT        NOT NULL CHECK (region IN ('Nord', 'Ouest', 'Centre', 'Est', 'Sud')),
  category         TEXT        NOT NULL CHECK (category IN ('M25','M50','M100','M250','M500','M1000','MIXED','Junior')),
  division         TEXT        NOT NULL DEFAULT 'MEN' CHECK (division IN ('MEN','WOMEN','MIXED','JUNIOR','MEN&WOMEN')),
  type             TEXT        NOT NULL DEFAULT 'MEN' CHECK (type IN ('MEN','WOMEN','MIXED','JUNIOR','MEN&WOMEN')),
  status           TEXT        NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','open','completed','cancelled')),
  prize_money      INTEGER     NOT NULL DEFAULT 0,
  max_teams        INTEGER     NOT NULL DEFAULT 16,
  teams_registered INTEGER     NOT NULL DEFAULT 0,
  registration_opens  DATE,
  registration_closes DATE,
  draw_date           DATE,
  min_courts          INTEGER  DEFAULT 2,
  selection_mode      TEXT     DEFAULT 'registration' CHECK (selection_mode IN ('registration','ranking')),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. INDEX ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tournaments_date       ON public.tournaments(date);
CREATE INDEX IF NOT EXISTS idx_tournaments_region     ON public.tournaments(region);
CREATE INDEX IF NOT EXISTS idx_tournaments_category   ON public.tournaments(category);
CREATE INDEX IF NOT EXISTS idx_tournaments_status     ON public.tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_club_id    ON public.tournaments(club_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_division   ON public.tournaments(division);

-- ── 3. TRIGGER updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tournaments_updated_at ON public.tournaments;
CREATE TRIGGER trg_tournaments_updated_at
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. ROW LEVEL SECURITY ────────────────────────────────────────────────────
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- Lecture publique (site public)
DROP POLICY IF EXISTS "tournaments_select_public" ON public.tournaments;
CREATE POLICY "tournaments_select_public"
  ON public.tournaments FOR SELECT
  USING (true);

-- Insertion : admin authentifié uniquement
DROP POLICY IF EXISTS "tournaments_insert_admin" ON public.tournaments;
CREATE POLICY "tournaments_insert_admin"
  ON public.tournaments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Mise à jour : admin authentifié uniquement
DROP POLICY IF EXISTS "tournaments_update_admin" ON public.tournaments;
CREATE POLICY "tournaments_update_admin"
  ON public.tournaments FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Suppression : admin authentifié uniquement
DROP POLICY IF EXISTS "tournaments_delete_admin" ON public.tournaments;
CREATE POLICY "tournaments_delete_admin"
  ON public.tournaments FOR DELETE
  USING (auth.role() = 'authenticated');

-- ── 5. UPDATE — MISE À JOUR DES DONNÉES EXISTANTES ──────────────────────────
--  Colonnes ajoutées si manquantes (migration safe)
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS teams_registered  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS registration_opens  DATE,
  ADD COLUMN IF NOT EXISTS registration_closes DATE,
  ADD COLUMN IF NOT EXISTS draw_date           DATE,
  ADD COLUMN IF NOT EXISTS min_courts          INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS selection_mode      TEXT DEFAULT 'registration'
    CHECK (selection_mode IN ('registration','ranking')),
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ── 6. DONNÉES D'EXEMPLE — 30 tournois saison 2026 ───────────────────────────
--  Pattern :  registration_opens  = date - 21 jours
--             registration_closes = date - 7  jours
--             draw_date           = date - 3  jours

INSERT INTO public.tournaments
  (name, club_id, club_name, date, region, category, division, type, status,
   prize_money, max_teams, teams_registered, registration_opens, registration_closes,
   draw_date, min_courts, selection_mode)
VALUES
-- ── JANVIER 2026 ──────────────────────────────────────────
('Urban Sport GB M25 #1',        'c03','Urban Sport Grand Baie',  '2026-01-10', 'Nord',   'M25',  'MEN','MEN',  'completed', 25000, 16, 16, '2025-12-20','2026-01-03','2026-01-07', 2,'registration'),
('RM Club Grand Baie M50',        'c08','RM Club Grand Baie',      '2026-01-11', 'Nord',   'M50',  'MEN','MEN',  'completed', 50000, 16, 14, '2025-12-21','2026-01-04','2026-01-08', 2,'registration'),
('Caña Beau Plan M25 #1',         'c01','Caña Beau Plan',          '2026-01-17', 'Nord',   'M25',  'MEN','MEN',  'completed', 25000, 12, 12, '2025-12-27','2026-01-10','2026-01-14', 2,'registration'),
('SPARC Cascavelle M100 Jan',     'c05','SPARC Cascavelle',        '2026-01-18', 'Ouest',  'M100', 'MEN','MEN',  'completed',100000, 16, 16, '2025-12-28','2026-01-11','2026-01-15', 2,'registration'),
('Isla Padel GB Mixed #1',        'c12','Isla Padel Grand Baie',   '2026-01-24', 'Nord',   'MIXED','MIXED','MIXED','completed',30000, 12, 10,'2026-01-03','2026-01-17','2026-01-21', 2,'registration'),
('Moka Rangers M25 #1',           'c18','Moka Rangers',            '2026-01-25', 'Centre', 'M25',  'MEN','MEN',  'completed', 25000, 16, 15, '2026-01-04','2026-01-18','2026-01-22', 2,'registration'),

-- ── FÉVRIER 2026 ──────────────────────────────────────────
('Club Med Albion M50',           'c02','Club Med Albion',         '2026-02-07', 'Ouest',  'M50',  'MEN','MEN',  'completed', 50000, 12, 12, '2026-01-17','2026-01-31','2026-02-04', 2,'registration'),
('RM Club Tamarin M25 #1',        'c06','RM Club Tamarin',         '2026-02-08', 'Ouest',  'M25',  'MEN','MEN',  'completed', 25000, 16, 13, '2026-01-18','2026-02-01','2026-02-05', 2,'registration'),
('Labourdonnais Mapou M100',      'c09','Labourdonnais Mapou',     '2026-02-14', 'Nord',   'M100', 'MEN','MEN',  'completed',100000, 16, 16, '2026-01-24','2026-02-07','2026-02-11', 2,'registration'),
('Urban Sport BR M25',            'c04','Urban Sport Black River', '2026-02-15', 'Ouest',  'M25',  'MEN','MEN',  'completed', 25000, 16, 14, '2026-01-25','2026-02-08','2026-02-12', 2,'registration'),
('I Padel Hennessy M50',          'c07','I Padel by RM Hennessy',  '2026-02-21', 'Centre', 'M50',  'MEN','MEN',  'completed', 50000, 12, 11, '2026-01-31','2026-02-14','2026-02-18', 2,'registration'),
('Mont Choisy M25 #1',            'c14','Mont Choisy Golf',        '2026-02-22', 'Nord',   'M25',  'MEN','MEN',  'completed', 25000,  8,  8, '2026-02-01','2026-02-15','2026-02-19', 2,'registration'),

-- ── MARS 2026 ─────────────────────────────────────────────
('Terres Brunes M100',            'c13','Terres Brunes Sports',    '2026-03-07', 'Ouest',  'M100', 'MEN','MEN',  'completed',100000, 16, 16, '2026-02-14','2026-02-28','2026-03-04', 2,'registration'),
('Oxygen Moka M50',               'c15','Oxygen Moka',             '2026-03-08', 'Centre', 'M50',  'MEN','MEN',  'completed', 50000, 12, 10, '2026-02-15','2026-03-01','2026-03-05', 2,'registration'),
('Studio RM Azuri M25',           'c11','Studio by RM Azuri',      '2026-03-14', 'Est',    'M25',  'MEN','MEN',  'completed', 25000, 12, 12, '2026-02-21','2026-03-07','2026-03-11', 2,'registration'),
('I Padel Port Chambly M100',     'c10','I Padel by RM Port Chambly','2026-03-15','Centre', 'M100','MEN','MEN',  'completed',100000, 16, 14, '2026-02-22','2026-03-08','2026-03-12', 2,'registration'),
('Club House BR M25',             'c16','Club House Black River',  '2026-03-21', 'Ouest',  'M25',  'MEN','MEN',  'completed', 25000,  8,  8, '2026-03-01','2026-03-14','2026-03-18', 2,'registration'),

-- ── AVRIL 2026 ────────────────────────────────────────────
('Energia Pte Canonniers M25',    'c17','Energia Pointe aux Canonniers','2026-04-04','Nord', 'M25', 'MEN','MEN', 'open',      25000, 16, 12, '2026-03-14','2026-03-28','2026-04-01', 2,'registration'),
('Caña Beau Plan M250',           'c01','Caña Beau Plan',          '2026-04-05', 'Nord',   'M250', 'MEN','MEN',  'open',     250000, 16, 10, '2026-03-15','2026-03-29','2026-04-02', 2,'registration'),
('RM Club GB M100 Apr',           'c08','RM Club Grand Baie',      '2026-04-11', 'Nord',   'M100', 'MEN','MEN',  'upcoming', 100000, 16,  6, '2026-03-21','2026-04-04','2026-04-08', 2,'registration'),
('Isla Padel Junior #1',          'c12','Isla Padel Grand Baie',   '2026-04-12', 'Nord',   'Junior','JUNIOR','JUNIOR','upcoming',15000,12, 4,'2026-03-22','2026-04-05','2026-04-09', 2,'registration'),
('SPARC M250 Apr',                'c05','SPARC Cascavelle',        '2026-04-18', 'Ouest',  'M250', 'MEN','MEN',  'upcoming', 250000, 16,  3, '2026-03-28','2026-04-11','2026-04-15', 2,'registration'),
('Moka Rangers M100 Apr',         'c18','Moka Rangers',            '2026-04-19', 'Centre', 'M100', 'MEN','MEN',  'upcoming', 100000, 16,  0, '2026-03-29','2026-04-12','2026-04-16', 2,'registration'),

-- ── MAI 2026 ──────────────────────────────────────────────
('Urban Sport GB M250 May',       'c03','Urban Sport Grand Baie',  '2026-05-02', 'Nord',   'M250', 'MEN','MEN',  'upcoming', 250000, 16,  0, '2026-04-11','2026-04-25','2026-04-29', 2,'registration'),
('RM Club Tamarin M100 May',      'c06','RM Club Tamarin',         '2026-05-03', 'Ouest',  'M100', 'MEN','MEN',  'upcoming', 100000, 16,  0, '2026-04-12','2026-04-26','2026-04-30', 2,'registration'),
('Oxygen Moka M25 May',           'c15','Oxygen Moka',             '2026-05-09', 'Centre', 'M25',  'MEN','MEN',  'upcoming',  25000, 12,  0, '2026-04-18','2026-05-02','2026-05-06', 2,'registration'),

-- ── JUIN 2026 — M500 ──────────────────────────────────────
('MPL M500 Grand Baie Open',      'c08','RM Club Grand Baie',      '2026-06-06', 'Nord',   'M500', 'MEN','MEN',  'upcoming', 500000, 32,  0, '2026-05-16','2026-05-30','2026-06-03', 3,'ranking'),
('MPL M500 Cascavelle Open',      'c05','SPARC Cascavelle',        '2026-06-20', 'Ouest',  'M500', 'MEN','MEN',  'upcoming', 500000, 32,  0, '2026-05-30','2026-06-13','2026-06-17', 3,'ranking'),

-- ── DÉCEMBRE 2026 — M1000 ─────────────────────────────────
('MPL M1000 National Championship','c08','RM Club Grand Baie',     '2026-12-05', 'Nord',   'M1000','MEN','MEN',  'upcoming',1000000,64,  0, '2026-11-14','2026-11-28','2026-12-02', 4,'ranking'),
('MPL M1000 Grand Final',         'c01','Caña Beau Plan',          '2026-12-19', 'Nord',   'M1000','MEN','MEN',  'upcoming',1000000,64,  0, '2026-11-28','2026-12-12','2026-12-16', 4,'ranking')

ON CONFLICT (id) DO NOTHING;

-- ── 7. MISE À JOUR CHAMPS MANQUANTS (données déjà en base) ───────────────────
--  Recalcule registration_opens/closes/draw_date pour les tournois sans ces valeurs
UPDATE public.tournaments
SET
  registration_opens  = date - INTERVAL '21 days',
  registration_closes = date - INTERVAL '7 days',
  draw_date           = date - INTERVAL '3 days'
WHERE registration_opens IS NULL;

-- Recalcule selection_mode pour M500/M1000
UPDATE public.tournaments
SET selection_mode = 'ranking'
WHERE category IN ('M500','M1000') AND selection_mode = 'registration';

-- Recalcule min_courts pour M500 et M1000
UPDATE public.tournaments SET min_courts = 3 WHERE category = 'M500'  AND min_courts < 3;
UPDATE public.tournaments SET min_courts = 4 WHERE category = 'M1000' AND min_courts < 4;

-- ── 8. VUE UTILE — calendrier public ─────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_calendar AS
SELECT
  t.id,
  t.name,
  t.club_name,
  t.date,
  TO_CHAR(t.date, 'TMMonth YYYY') AS month_label,
  t.region,
  t.category,
  t.division,
  t.status,
  t.prize_money,
  t.max_teams,
  t.teams_registered,
  ROUND(t.teams_registered::numeric / NULLIF(t.max_teams,0) * 100, 0) AS fill_pct,
  t.registration_opens,
  t.registration_closes,
  t.draw_date,
  t.selection_mode,
  t.notes
FROM public.tournaments t
ORDER BY t.date ASC;

-- ── 9. VÉRIFICATION ──────────────────────────────────────────────────────────
SELECT
  category,
  status,
  COUNT(*) AS nb_tournois,
  SUM(prize_money) AS total_prize,
  SUM(teams_registered) AS total_inscriptions
FROM public.tournaments
GROUP BY category, status
ORDER BY category, status;
