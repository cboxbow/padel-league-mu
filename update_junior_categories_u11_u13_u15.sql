-- Migration Supabase MPL 2026
-- Remplace les anciennes categories Juniors:
-- U10 -> U11, U12 -> U13, U14 -> U15

DO $$
DECLARE
  target record;
BEGIN
  -- Colonnes texte contenant les noms de tournois.
  FOR target IN
    SELECT * FROM (VALUES
      ('tournaments', 'name'),
      ('tournament_results', 'tournament_name'),
      ('tournament_photos', 'tournament_name'),
      ('tournament_registrations', 'tournament_name'),
      ('matches', 'tournament_name')
    ) AS t(table_name, column_name)
  LOOP
    IF to_regclass('public.' || target.table_name) IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = target.table_name
           AND column_name = target.column_name
       )
    THEN
      EXECUTE format(
        'UPDATE public.%I
         SET %I = replace(replace(replace(%I, %L, %L), %L, %L), %L, %L)
         WHERE %I LIKE %L OR %I LIKE %L OR %I LIKE %L',
        target.table_name,
        target.column_name,
        target.column_name,
        'Junior U10', 'Junior U11',
        'Junior U12', 'Junior U13',
        'Junior U14', 'Junior U15',
        target.column_name, '%Junior U10%',
        target.column_name, '%Junior U12%',
        target.column_name, '%Junior U14%'
      );
    END IF;
  END LOOP;

  -- Colonnes de categorie/type.
  FOR target IN
    SELECT * FROM (VALUES
      ('tournaments', 'category'),
      ('tournaments', 'type'),
      ('tournaments', 'tournament_type'),
      ('tournament_results', 'category'),
      ('tournament_photos', 'category'),
      ('matches', 'category')
    ) AS t(table_name, column_name)
  LOOP
    IF to_regclass('public.' || target.table_name) IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = target.table_name
           AND column_name = target.column_name
       )
    THEN
      EXECUTE format(
        'UPDATE public.%I
         SET %I = CASE %I
           WHEN %L THEN %L
           WHEN %L THEN %L
           WHEN %L THEN %L
           ELSE %I
         END
         WHERE %I IN (%L, %L, %L)',
        target.table_name,
        target.column_name,
        target.column_name,
        'U10', 'U11',
        'U12', 'U13',
        'U14', 'U15',
        target.column_name,
        target.column_name,
        'U10', 'U12', 'U14'
      );
    END IF;
  END LOOP;
END $$;
