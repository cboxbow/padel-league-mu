-- ============================================================================
-- MPL : regions en double dans historical_tournament_results (NORD / Nord ...)
-- ============================================================================
-- Constat du 24/10/2026 (lecture seule) : la table historique melange
--   NORD 1105, OUEST 687, SUD 176, CENTRE 155, EST 117   (import du classeur)
--   Nord  374, Ouest 238, Sud  18, Centre  78, Est  72   (saisie admin)
-- alors que tournaments et tournament_results n'utilisent que Nord, Ouest,
-- Sud, Centre, Est. Le filtre Region de la page Resultats affiche donc chaque
-- region deux fois.
--
-- Effet : passe les 5 valeurs en majuscules a la forme Nord/Ouest/Sud/Centre/Est.
-- Ne touche QUE la colonne region (ni noms, ni points, ni rangs, ni joueurs).
-- La region n'intervient pas dans le calcul des classements.
-- Rejouable : sans effet si deja corrige. Arret si une region inconnue apparait.
-- A executer dans l'editeur SQL de Supabase.
-- ============================================================================
begin;

do $$
declare
  v_unknown text;
  v_count int;
begin
  select string_agg(distinct region, ', ') into v_unknown
    from public.historical_tournament_results
   where region is not null
     and upper(region) not in ('NORD', 'OUEST', 'SUD', 'CENTRE', 'EST');
  if v_unknown is not null then
    raise exception 'Region(s) inattendue(s) : % : arret, rien n''est modifie', v_unknown;
  end if;

  update public.historical_tournament_results
     set region = initcap(lower(region))
   where region in ('NORD', 'OUEST', 'SUD', 'CENTRE', 'EST');
  get diagnostics v_count = row_count;
  raise notice '% lignes corrigees (2 240 attendues au 24/10/2026)', v_count;
end $$;

-- Controle : il ne doit rester que Nord, Ouest, Sud, Centre, Est.
select region, count(*) as lignes
  from public.historical_tournament_results
 group by region
 order by region;
commit;
