-- ============================================================================
-- MPL - LOT L4 (P2) : periode de validite du classement de SEPTEMBRE 2026
-- ============================================================================
-- Prerequis : ranking_snapshots_l4_validity_periods.sql.
-- Fige sur les 3 instantanes publies de septembre 2026 (H, D, X, v1) la periode
-- CONFIRMEE du 21/10/2026 au 20/11/2026. Le contenu (lignes, points, rangs,
-- somme de controle) n'est PAS modifie ; les references du M500 Moka Rangers
-- restent sur septembre v1.
-- Remplacer <ADMIN_ID> par l'uuid du compte admin qui execute le script.
-- ============================================================================
begin;
select set_config('request.jwt.claim.sub', '<ADMIN_ID>', true);
select set_config('request.jwt.claims', '{"sub":"<ADMIN_ID>","role":"authenticated"}', true);

select division, public.set_snapshot_validity(id,
  'Periode officielle confirmee par la MPL le 24/10/2026 : tournois commencant du 21/10/2026 au 20/11/2026 (audit des periodes 21 -> 20)')
  from public.ranking_snapshots
 where reference_month = date '2026-09-01' and status = 'published' and validity_start is null
 order by division;

-- Controle : periode figee, somme de controle toujours exacte, Moka inchange.
select division, version, status, locked, validity_start, validity_end,
       public.ranking_snapshot_checksum(id) = checksum as checksum_ok
  from public.ranking_snapshots where reference_month = date '2026-09-01' order by division;
select tournament_id, division, snapshot_version, approval_status, validity_start, validity_end, approved_at
  from public.tournament_seeding_references order by tournament_id;
commit;
