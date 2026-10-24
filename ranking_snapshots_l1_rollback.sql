-- ============================================================================
-- MPL - LOT L1 : retour arriere de ranking_snapshots_l1_migration.sql
-- ============================================================================
-- Supprime UNIQUEMENT les objets crees par L1. A n'utiliser que tant qu'aucun
-- instantane officiel n'a ete publie : sinon, exporter d'abord les tables
-- ranking_snapshots* et ranking_audit_log (elles seront perdues).
-- Couvre aussi L1.1 (meme objets).
-- ============================================================================
begin;

alter table public.registrations drop column if exists seeding_snapshot_id;
alter table public.registrations drop column if exists team_weight;
alter table public.player_registration_requests drop column if exists seeding_snapshot_id;

drop function if exists public.assign_tournament_seeding(text, text, uuid, text);
drop function if exists public.withdraw_ranking_snapshot(uuid, text);
drop function if exists public.publish_ranking_snapshot(uuid, text);
drop function if exists public.unvalidate_ranking_snapshot(uuid, text);
drop function if exists public.validate_ranking_snapshot(uuid);
drop function if exists public.create_ranking_snapshot_draft(text, date, date, date, date, date, jsonb, text, text, text, text, uuid, text);

drop table if exists public.tournament_seeding_references;
drop table if exists public.ranking_audit_log;
drop table if exists public.ranking_snapshot_results;
drop table if exists public.ranking_snapshot_entries;
drop table if exists public.ranking_snapshots;
drop table if exists public.ranking_settings;

drop function if exists public.ranking_require_admin();
drop function if exists public.ranking_snapshot_checksum(uuid);
drop function if exists public.tournament_seeding_reference_guard();
drop function if exists public.ranking_audit_log_append_only();
drop function if exists public.ranking_snapshot_header_guard();
drop function if exists public.ranking_snapshot_content_guard();
drop function if exists public.mpl_is_ranking_admin();
drop type if exists public.ranking_snapshot_status;

commit;
