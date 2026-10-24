-- ============================================================================
-- MPL - LOT L5 (E3) : PUBLICATION de la V2 du classement MIXTE de SEPTEMBRE 2026
-- ============================================================================
-- APRES verification de la V2 validee (L5_E2). La V1 passe "remplacee"
-- (superseded) : elle reste consultable et n'est pas modifiee. La V2 recoit la
-- periode confirmee 21/10/2026 -> 20/11/2026.
-- Seedings : aucune reference ne pointe vers le Mixte de septembre ; toute
-- reference approuvee garde de toute facon sa version exacte.
-- Rejouable : sans effet si la V2 est deja publiee.
-- Remplacer <ADMIN_ID> par l'uuid du compte admin.
-- ============================================================================
begin;
select set_config('request.jwt.claim.sub', '<ADMIN_ID>', true);
select set_config('request.jwt.claims', '{"sub":"<ADMIN_ID>","role":"authenticated"}', true);

do $$
declare v_id uuid;
begin
  if exists (select 1 from public.ranking_snapshots where division = 'mixed' and reference_month = date '2026-09-01' and version = 2 and status = 'published') then
    raise notice 'V2 deja publiee : rien a faire';
    return;
  end if;
  select id into v_id from public.ranking_snapshots
   where division = 'mixed' and reference_month = date '2026-09-01' and version = 2 and status = 'validated';
  if v_id is null then raise exception 'Aucune V2 validee (executer d''abord L5_E2)'; end if;
  perform public.publish_ranking_snapshot(v_id, 'PUBLIER MIXED 2026-10');
end $$;

select version, status, locked, validity_start, validity_end, entries_count, published_at,
       public.ranking_snapshot_checksum(id) = checksum as checksum_ok
  from public.ranking_snapshots where division = 'mixed' and reference_month = date '2026-09-01' order by version;
commit;
