-- ============================================================================
-- MPL - CORRECTIF DE SECURITE (a valider, NON EXECUTE)
-- ============================================================================
-- Constat du 2026-10-24 : official_rankings_schema.sql donne aux tables de
-- classement des politiques "for all to anon, authenticated using (true)".
-- Verifie sans rien modifier : une requete PATCH avec la seule cle publique
-- (presente dans le site) est acceptee (HTTP 204) sur official_rankings,
-- rankings et official_ranking_details. N'importe qui peut donc modifier ou
-- effacer le classement publie.
--
-- Correctif : lecture publique conservee ; ecriture reservee aux comptes
-- admin/superadmin connectes. Les scripts serveur (cle service_role) ne sont
-- pas concernes par la RLS et continuent de fonctionner.
-- A tester apres execution : panneau admin connecte (publication, import,
-- edition manuelle) + site public (lecture).
-- ============================================================================
begin;

do $$
declare t text;
begin
  foreach t in array array['official_ranking_imports', 'official_rankings', 'official_ranking_details', 'rankings'] loop
    execute format('drop policy if exists "official ranking imports write admin client" on public.%I', t);
    execute format('drop policy if exists "official rankings write admin client" on public.%I', t);
    execute format('drop policy if exists "official ranking details write admin client" on public.%I', t);
    execute format('drop policy if exists "rankings write admin only" on public.%I', t);
    execute format($p$create policy "rankings write admin only" on public.%I for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(coalesce(p.role, '')) in ('admin', 'superadmin')))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(coalesce(p.role, '')) in ('admin', 'superadmin')))$p$, t);
    execute format('revoke insert, update, delete on public.%I from anon', t);
  end loop;
end $$;

-- Verification : la liste des politiques de ces tables ne doit plus contenir
-- de politique d'ecriture ouverte a anon.
select tablename, policyname, roles, cmd
  from pg_policies
 where schemaname = 'public' and tablename in ('official_ranking_imports', 'official_rankings', 'official_ranking_details', 'rankings')
 order by tablename, policyname;

commit;
