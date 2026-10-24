-- ============================================================================
-- MPL - LOT L5 (C) : periode du classement d'OCTOBRE 2026, statut PROVISOIRE
-- ============================================================================
-- Proposition (cycle 21 -> 20) : tournois commencant du 21/11/2026 au 20/12/2026,
-- inscriptions ouvertes en novembre 2026. Au statut "provisional", elle est
-- visible mais NE SERT PAS au seeding et la publication du classement d'octobre
-- reste refusee. Une fois la periode confirmee par la MPL, rejouer avec 'confirmed'.
-- ============================================================================
begin;
select set_config('request.jwt.claim.sub', 'a19ee76e-30da-43df-b8b7-d1a15a0e0268', true);
select set_config('request.jwt.claims', '{"sub":"a19ee76e-30da-43df-b8b7-d1a15a0e0268","role":"authenticated"}', true);
select public.set_ranking_validity_period(date '2026-10-01', date '2026-11-21', date '2026-12-20', date '2026-11-01', 'provisional',
  'Proposition L5 du 24/10/2026 (cycle 21 -> 20), en attente de confirmation MPL / MSRA');
select to_char(reference_month, 'YYYY-MM') as classement, validity_start, validity_end, status, source from public.ranking_validity_periods order by reference_month;
commit;
