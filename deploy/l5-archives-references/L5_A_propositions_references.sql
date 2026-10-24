-- ============================================================================
-- MPL - LOT L5 (A) : PROPOSITION des references de seeding (sans approbation)
-- ============================================================================
-- 26 tournois commencant du 25/10 au 15/11/2026 -> classement de SEPTEMBRE 2026 v1
-- de leur division (periode 21/10 -> 20/11). Statut cree : "proposed".
-- N'APPROUVE RIEN : l'approbation reste manuelle (page admin "References de
-- seeding" ou approve_tournament_seeding avec phrase de confirmation).
-- Rejouable : une reference deja proposee est simplement reproposee ; une
-- reference APPROUVEE n'est jamais touchee (la fonction refuse).
-- Exclus (revue manuelle) : t191f, t191h, t192f, t192h, t193f, t193h (tournois du 24/10 deja commences).
-- Exclus (deja approuves) : t263h, t264f.
-- ============================================================================
begin;
select set_config('request.jwt.claim.sub', 'a19ee76e-30da-43df-b8b7-d1a15a0e0268', true);
select set_config('request.jwt.claims', '{"sub":"a19ee76e-30da-43df-b8b7-d1a15a0e0268","role":"authenticated"}', true);

do $$
declare
  t record;
  v_res jsonb;
begin
  for t in select * from (values
    ('t188f', 'women'),
    ('t188h', 'men'),
    ('t194f', 'women'),
    ('t194h', 'men'),
    ('t195f', 'women'),
    ('t195h', 'men'),
    ('t197f', 'women'),
    ('t197h', 'men'),
    ('t198', 'men'),
    ('t199f', 'women'),
    ('t199h', 'men'),
    ('t200f', 'women'),
    ('t200h', 'men'),
    ('t201', 'men'),
    ('t202f', 'women'),
    ('t202h', 'men'),
    ('t203f', 'women'),
    ('t203h', 'men'),
    ('t204f', 'women'),
    ('t204h', 'men'),
    ('t205f', 'women'),
    ('t205h', 'men'),
    ('t206f', 'women'),
    ('t206h', 'men'),
    ('t207f', 'women'),
    ('t207h', 'men')
  ) as x(tournament_id, division)
  loop
    if exists (select 1 from public.tournament_seeding_references r
                where r.tournament_id = t.tournament_id and r.division = t.division and r.approval_status = 'approved') then
      raise notice '% / % : deja approuve, non modifie', t.tournament_id, t.division;
      continue;
    end if;
    v_res := public.propose_tournament_seeding(t.tournament_id, t.division);
    if v_res->>'status' <> 'proposed' or v_res->>'expected_reference_month' <> '2026-09-01' then
      raise exception '% / % : proposition inattendue %', t.tournament_id, t.division, v_res;
    end if;
  end loop;
end $$;

select tournament_id, division, approval_status, snapshot_version, to_char(expected_reference_month, 'YYYY-MM') as classement, validity_start, validity_end
  from public.tournament_seeding_references order by reference_date, tournament_id;
commit;
