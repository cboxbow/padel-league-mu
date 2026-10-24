-- ============================================================================
-- MPL - LOT L5 (B) : RETOUR ARRIERE des archives juin / juillet / aout 2026
-- ============================================================================
-- A n'utiliser QUE si les archives importees doivent etre retirees.
--   - valide           -> repasse en BROUILLON (unvalidate) : invisible du public, inutilisable pour
--                          le seeding ; conserve pour le journal d'audit (ajout seul, aucune suppression) ;
--   - brouillon        -> laisse tel quel ;
--   - publie           -> RETIRE (withdraw, motif journalise ; le contenu reste consultable
--                          par les administrateurs, jamais supprime) ;
--   - un classement utilise par une reference de seeding n'est PAS retire (la fonction refuse).
-- Ne touche qu'aux classements importes d'un classeur (source workbook_import)
-- de juin, juillet et aout 2026. Septembre n'est jamais concerne.
-- ============================================================================
begin;
select set_config('request.jwt.claim.sub', 'a19ee76e-30da-43df-b8b7-d1a15a0e0268', true);
select set_config('request.jwt.claims', '{"sub":"a19ee76e-30da-43df-b8b7-d1a15a0e0268","role":"authenticated"}', true);

do $$
declare s record;
begin
  for s in select id, division, reference_month, status from public.ranking_snapshots
            where source = 'workbook_import' and reference_month in (date '2026-06-01', date '2026-07-01', date '2026-08-01')
            order by reference_month, division
  loop
    if s.status = 'published' then
      perform public.withdraw_ranking_snapshot(s.id, 'Retour arriere L5 : archive retiree sur decision MPL');
    elsif s.status = 'validated' then
      perform public.unvalidate_ranking_snapshot(s.id, 'Retour arriere L5');
    end if;
    raise notice '% % : % traite', s.division, to_char(s.reference_month, 'YYYY-MM'), s.status;
  end loop;
end $$;

select division, to_char(reference_month, 'YYYY-MM') as mois, version, status from public.ranking_snapshots order by reference_month, division;
commit;
