-- ============================================================================
-- MPL - LOT L5 (D1) : PROPOSITION - fiche joueur de NATHAN WONG (non executee)
-- ============================================================================
-- Constat (document officiel MIXTE SPARC 5 SEPT.jpg) : 11e du M500 Mixte SPARC
-- avec Diana Kuznetsova (MPL0002013), 90 points. Ligne en base (historique et
-- site, meme id a9393e13-c82d-43d3-af46-a40f6c802603) sans fiche joueur
-- (player2_id vide). Aucun autre resultat a ce nom.
--
-- AVANT EXECUTION, CONFIRMER QUE NATHAN WONG N'EST PAS JONATHAN WONG
-- (MPL0001865, joueur Hommes avec Javon Wong). Si c'est la meme personne,
-- NE PAS executer ce script : rattacher le resultat a MPL0001865 (option B).
--
-- Effets (option A) :
--   1. cree la fiche "Nathan Wong" (genre M) avec la licence MPL suivante ;
--   2. rattache UNIQUEMENT la ligne SPARC Mixte du 06/09 a cette fiche.
-- Ne modifie ni les points, ni le rang, ni le classement de septembre fige
-- (une revision v2 du Mixte reste une decision separee).
-- ============================================================================
begin;

do $$
declare
  v_id uuid := gen_random_uuid();
  v_license text;
begin
  if exists (select 1 from public.players where lower(first_name) = 'nathan' and lower(last_name) = 'wong') then
    raise exception 'Une fiche Nathan Wong existe deja : rien a creer';
  end if;
  select 'MPL' || lpad((max(substring(license_no from 4)::int) + 1)::text, 7, '0') into v_license
    from public.players where license_no ~ '^MPL[0-9]{7}$';

  insert into public.players (id, first_name, last_name, gender, license_no, active)
  values (v_id, 'Nathan', 'Wong', 'M', v_license, true);

  update public.historical_tournament_results set player2_id = v_id
   where id = 'a9393e13-c82d-43d3-af46-a40f6c802603' and player2_name = 'Nathan Wong' and player2_id is null;
  if not found then raise exception 'Ligne historique introuvable ou deja rattachee : arret'; end if;
  update public.tournament_results set player2_id = v_id
   where id = 'a9393e13-c82d-43d3-af46-a40f6c802603' and player2_name = 'Nathan Wong' and player2_id is null;

  raise notice 'Fiche Nathan Wong creee : % (licence %)', v_id, v_license;
end $$;

select p.id, p.first_name, p.last_name, p.license_no, h.event_name, h.event_date, h.rank_label, h.points
  from public.players p join public.historical_tournament_results h on h.player2_id = p.id
 where p.first_name = 'Nathan' and p.last_name = 'Wong';
commit;

-- Option B (si Nathan Wong = Jonathan Wong MPL0001865) : a la place du bloc ci-dessus,
--   update public.historical_tournament_results set player2_id = 'b3ec0a65-de8f-4f45-9e57-35590e459573'
--    where id = 'a9393e13-c82d-43d3-af46-a40f6c802603' and player2_name = 'Nathan Wong' and player2_id is null;
--   update public.tournament_results set player2_id = 'b3ec0a65-de8f-4f45-9e57-35590e459573'
--    where id = 'a9393e13-c82d-43d3-af46-a40f6c802603' and player2_name = 'Nathan Wong' and player2_id is null;
