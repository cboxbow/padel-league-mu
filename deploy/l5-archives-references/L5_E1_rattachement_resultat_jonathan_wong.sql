-- ============================================================================
-- MPL - LOT L5 (E1) : rattachement du resultat "Nathan Wong" a JONATHAN WONG (MPL0001865)
-- ============================================================================
-- Decision MPL du 24/10/2026 : Nathan Wong et Jonathan Wong sont la meme personne.
-- On utilise EXCLUSIVEMENT la fiche existante MPL0001865 : aucune fiche creee.
--
-- Resultat concerne (document officiel MIXTE SPARC 5 SEPT.jpg) : M500 Mixte SPARC
-- Cascavelle (t160), 11e avec Diana Kuznetsova (MPL0002013), 90 points.
-- Ligne a9393e13-c82d-43d3-af46-a40f6c802603, presente dans
-- historical_tournament_results ET tournament_results, player2_id vide.
--
-- Effet : renseigne player2_id = fiche MPL0001865 sur cette seule ligne (2 tables).
-- Ne modifie NI le nom tel que saisi ("Nathan Wong"), NI le rang, NI les points.
-- Rejouable : sans effet si la ligne est deja rattachee a MPL0001865 ; arret si
-- elle est rattachee a une AUTRE fiche ou si une fiche "Nathan Wong" existe.
-- ============================================================================
begin;

do $$
declare
  v_jonathan constant uuid := 'b3ec0a65-de8f-4f45-9e57-35590e459573';
  v_row constant uuid := 'a9393e13-c82d-43d3-af46-a40f6c802603';
  v_cur uuid;
begin
  if not exists (select 1 from public.players where id = v_jonathan and license_no = 'MPL0001865' and first_name = 'Jonathan' and last_name = 'Wong') then
    raise exception 'Fiche MPL0001865 (Jonathan Wong) introuvable : arret';
  end if;
  if exists (select 1 from public.players where lower(first_name) = 'nathan' and lower(last_name) = 'wong') then
    raise exception 'Une fiche "Nathan Wong" existe : doublon a traiter avant ce script';
  end if;

  select player2_id into v_cur from public.historical_tournament_results
   where id = v_row and player2_name = 'Nathan Wong' and points = 90 and rank_min = 11 and event_key = 't160';
  if not found then raise exception 'Ligne SPARC Mixte (historique) introuvable ou differente du controle : arret'; end if;
  if v_cur is not null and v_cur <> v_jonathan then raise exception 'Ligne deja rattachee a une autre fiche (%) : arret', v_cur; end if;
  update public.historical_tournament_results set player2_id = v_jonathan where id = v_row and player2_id is null;

  select player2_id into v_cur from public.tournament_results
   where id = v_row and player2_name = 'Nathan Wong' and points = 90 and rank = 11 and tournament_id = 't160';
  if not found then raise exception 'Ligne SPARC Mixte (site) introuvable ou differente du controle : arret'; end if;
  if v_cur is not null and v_cur <> v_jonathan then raise exception 'Ligne site deja rattachee a une autre fiche (%) : arret', v_cur; end if;
  update public.tournament_results set player2_id = v_jonathan where id = v_row and player2_id is null;
end $$;

-- Controle : la ligne pointe vers MPL0001865 dans les deux tables, rien d'autre ne change.
select 'historique' as source, h.event_name, h.event_date, h.rank_label, h.player2_name, p.license_no, h.points
  from public.historical_tournament_results h join public.players p on p.id = h.player2_id
 where h.id = 'a9393e13-c82d-43d3-af46-a40f6c802603'
union all
select 'site', t.tournament_name, t.tournament_date, t.rank::text, t.player2_name, p.license_no, t.points
  from public.tournament_results t join public.players p on p.id = t.player2_id
 where t.id = 'a9393e13-c82d-43d3-af46-a40f6c802603';
commit;
