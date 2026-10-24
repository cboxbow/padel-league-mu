-- ============================================================================
-- MPL - LOT L4 : CONTROLES AVANT / APRES (lecture seule, aucune ecriture)
-- ============================================================================
-- A executer AVANT la migration (sauvegarder le resultat), puis APRES chaque
-- etape, et comparer. Les requetes marquees [L4] n'existent qu'apres migration.
-- ============================================================================

-- 1. Classements publies : contenu intact (doit etre IDENTIQUE avant et apres).
select division, to_char(reference_month, 'YYYY-MM') as mois, version, status, locked, entries_count,
       checksum, public.ranking_snapshot_checksum(id) = checksum as checksum_ok
  from public.ranking_snapshots
 order by reference_month, division, version;

-- 2. References de seeding existantes (Moka M500 : meme snapshot_id avant et apres).
select tournament_id, division, snapshot_id, locked_at, locked_by, override_reason
  from public.tournament_seeding_references order by tournament_id, division;

-- 3. Nombre de lignes par classement (doit etre identique avant et apres).
select s.division, to_char(s.reference_month, 'YYYY-MM') as mois, s.version, count(e.*) as lignes, sum(e.points) as total_points
  from public.ranking_snapshots s join public.ranking_snapshot_entries e on e.snapshot_id = s.id
 group by 1, 2, 3 order by 2, 1, 3;

-- 4. [L4] Periodes de validite (4 confirmees : juin -> septembre 2026).
select to_char(reference_month, 'YYYY-MM') as classement, validity_start, validity_end,
       to_char(registration_opening_month, 'YYYY-MM') as inscriptions, status, source
  from public.ranking_validity_periods order by reference_month;

-- 5. [L4] Periode figee sur les classements publies (septembre apres L4_2 : 21/10 -> 20/11).
select division, to_char(reference_month, 'YYYY-MM') as mois, version, validity_start, validity_end
  from public.ranking_snapshots where status = 'published' order by reference_month, division;

-- 6. [L4] References : tracabilite (Moka : approved, v1, debut 31/10, periode 21/10 -> 20/11).
select tournament_id, division, snapshot_version, approval_status, reference_date,
       to_char(expected_reference_month, 'YYYY-MM') as classement_attendu, validity_start, validity_end,
       approved_at, seeding_generated_at, notes
  from public.tournament_seeding_references order by tournament_id, division;

-- 7. [L4] Statut de seeding des tournois du 21/10 au 20/11/2026.
select seeding_status, count(*) as tournois
  from public.tournament_seeding_status
 where start_date between date '2026-10-21' and date '2026-11-20' and tournament_status <> 'cancelled'
 group by 1 order by 1;
