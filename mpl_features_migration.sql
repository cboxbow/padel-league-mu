-- =============================================================
-- MPL (Mauritius Padel League) – Features Migration
-- Safe: IF NOT EXISTS / DO NOTHING – extends existing schema
-- =============================================================

-- 1. Étendre tournament_status pour les nouveaux états
ALTER TYPE tournament_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE tournament_status ADD VALUE IF NOT EXISTS 'open';
ALTER TYPE tournament_status ADD VALUE IF NOT EXISTS 'draw_ready';
ALTER TYPE tournament_status ADD VALUE IF NOT EXISTS 'live';
ALTER TYPE tournament_status ADD VALUE IF NOT EXISTS 'finished';

-- 2. Étendre match_status
ALTER TYPE match_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE match_status ADD VALUE IF NOT EXISTS 'walkover';

-- 3. Check-in système
CREATE TABLE IF NOT EXISTS checkins (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id   uuid REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id         uuid REFERENCES teams(id) ON DELETE CASCADE,
  checked_in_at   timestamptz DEFAULT now(),
  checked_in_by   text,
  UNIQUE(tournament_id, team_id)
);

-- 4. Draws
CREATE TABLE IF NOT EXISTS draws (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id   uuid REFERENCES tournaments(id) ON DELETE CASCADE UNIQUE,
  draw_type       text DEFAULT 'single_elimination', -- 'single_elimination','double_elimination','round_robin','groups+bracket'
  total_teams     integer DEFAULT 0,
  total_groups    integer DEFAULT 0,
  generated_at    timestamptz DEFAULT now(),
  generated_by    text,
  status          text DEFAULT 'draft', -- draft, published, locked
  metadata        jsonb DEFAULT '{}'
);

-- 5. Groups (pour phase de groupes)
CREATE TABLE IF NOT EXISTS draw_groups (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  draw_id         uuid REFERENCES draws(id) ON DELETE CASCADE,
  group_name      text NOT NULL, -- 'A', 'B', 'C'...
  group_order     integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- 6. Draw slots (placement des équipes)
CREATE TABLE IF NOT EXISTS draw_slots (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  draw_id         uuid REFERENCES draws(id) ON DELETE CASCADE,
  group_id        uuid REFERENCES draw_groups(id) ON DELETE SET NULL,
  team_id         uuid REFERENCES teams(id) ON DELETE SET NULL,
  slot_position   integer NOT NULL,  -- position dans le bracket/groupe
  seed            integer,
  is_bye          boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

-- 7. Bracket matches (distincts des matches généraux)
CREATE TABLE IF NOT EXISTS bracket_matches (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  draw_id         uuid REFERENCES draws(id) ON DELETE CASCADE,
  group_id        uuid REFERENCES draw_groups(id) ON DELETE SET NULL,
  round           text NOT NULL,
  match_order     integer DEFAULT 0,
  slot1_id        uuid REFERENCES draw_slots(id) ON DELETE SET NULL,
  slot2_id        uuid REFERENCES draw_slots(id) ON DELETE SET NULL,
  winner_slot_id  uuid REFERENCES draw_slots(id) ON DELETE SET NULL,
  next_match_id   uuid REFERENCES bracket_matches(id) ON DELETE SET NULL,
  score_set1      text,
  score_set2      text,
  score_tb        text,
  status          text DEFAULT 'pending', -- pending, live, finished, walkover
  court_label     text,
  scheduled_at    timestamptz,
  started_at      timestamptz,
  finished_at     timestamptz,
  golden_point    boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

-- 8. Score history (pour les updates live)
CREATE TABLE IF NOT EXISTS score_events (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id        uuid REFERENCES matches(id) ON DELETE CASCADE,
  event_type      text NOT NULL, -- 'set_score', 'tb_score', 'match_start', 'match_end', 'golden_point'
  set_number      integer,
  score_team1     text,
  score_team2     text,
  serving_team    integer, -- 1 ou 2
  timestamp       timestamptz DEFAULT now(),
  operator_id     text
);

-- 9. Étendre matches existant (colonnes additionnelles)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS team1_name text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS team2_name text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS golden_point boolean DEFAULT false;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS serving_team integer;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS super_tiebreak boolean DEFAULT false;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS draw_id uuid REFERENCES draws(id) ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS next_match_id uuid REFERENCES matches(id);

-- 10. Étendre registrations existant
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS checked_in boolean DEFAULT false;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS player1_name text;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS player2_name text;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS club_name text;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS withdrawal_reason text;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS withdrawn boolean DEFAULT false;

-- 11. Notifications admin
CREATE TABLE IF NOT EXISTS admin_notifications (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type        text NOT NULL, -- 'info','warning','error','success'
  title       text NOT NULL,
  message     text,
  tournament_id uuid REFERENCES tournaments(id) ON DELETE CASCADE,
  read        boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- 12. RLS policies (permissif pour service_role)
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE draw_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE draw_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "public_read_checkins" ON checkins FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "public_read_draws" ON draws FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "public_read_draw_groups" ON draw_groups FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "public_read_draw_slots" ON draw_slots FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "public_read_bracket_matches" ON bracket_matches FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "public_read_score_events" ON score_events FOR SELECT USING (true);
