/* eslint-disable no-console */
// Genere deploy/l4-seeding-periods/L4_9_rollback.sql a partir des definitions
// EXACTES d'avant L4 (fonctions L1 / L3), pour eviter toute recopie manuelle.
//   node scripts/build-l4-rollback.cjs
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const l1 = fs.readFileSync(path.join(root, 'ranking_snapshots_l1_migration.sql'), 'utf8');
const l3 = fs.readFileSync(path.join(root, 'ranking_snapshots_l3_migration.sql'), 'utf8');

// Extrait "create or replace function public.<name>(...) ... $$;" d'un script.
function fn(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`fonction ${name} introuvable`);
  const body = sql.indexOf('$$', start);
  const end = sql.indexOf('$$;', body + 2);
  return sql.slice(start, end + 3);
}

const out = `-- ============================================================================
-- MPL - LOT L4 : RETOUR ARRIERE (rollback) de ranking_snapshots_l4_validity_periods.sql
-- ============================================================================
-- Genere par scripts/build-l4-rollback.cjs a partir des definitions d'avant L4
-- (L1 + L3). A executer dans l'editeur SQL UNIQUEMENT en cas de probleme, apres
-- sauvegarde. Tout ou rien.
--
-- Effets :
--   - fonctions publish / assign / gardes remises dans leur version L1-L3 ;
--   - references de seeding creees par L4 (statut autre que "approved")
--     supprimees ; les references approuvees (dont Moka M500) sont conservees ;
--   - colonnes, table des periodes, vue et fonctions L4 supprimees.
-- NE TOUCHE PAS aux classements publies (contenu, rangs, points, sommes de
-- controle). Les archives juin / juillet / aout eventuellement publiees restent
-- publiees (immuables) ; pour les retirer : withdraw_ranking_snapshot(id, motif).
-- ============================================================================
begin;

-- 1. Gardes et fonctions d'avant L4.
${fn(l3, 'ranking_snapshot_header_guard')}

${fn(l1, 'publish_ranking_snapshot')}

${fn(l1, 'assign_tournament_seeding')}

${fn(l1, 'tournament_seeding_reference_guard')}

-- 2. References creees par L4 (non approuvees) : retirees.
drop trigger if exists tournament_seeding_references_guard on public.tournament_seeding_references;
delete from public.tournament_seeding_references where approval_status is distinct from 'approved' or snapshot_id is null;
create trigger tournament_seeding_references_guard
  before update or delete on public.tournament_seeding_references
  for each row execute function public.tournament_seeding_reference_guard();

-- 3. Objets et colonnes L4.
drop view if exists public.tournament_seeding_status;
drop function if exists public.propose_tournament_seeding(text, text);
drop function if exists public.approve_tournament_seeding(text, text, text);
drop function if exists public.approve_tournament_seeding_exception(text, text, uuid, text);
drop function if exists public.mark_tournament_seeding_generated(text, text);
drop function if exists public.set_snapshot_validity(uuid, text);
drop function if exists public.set_ranking_validity_period(date, date, date, date, text, text);
drop function if exists public.ranking_period_for_date(date);
drop function if exists public.ranking_default_validity(date);

alter table public.tournament_seeding_references drop constraint if exists tournament_seeding_references_status_ck;
alter table public.tournament_seeding_references drop constraint if exists tournament_seeding_references_snapshot_ck;
alter table public.tournament_seeding_references drop constraint if exists tournament_seeding_references_generated_ck;
alter table public.tournament_seeding_references alter column snapshot_id set not null;
alter table public.tournament_seeding_references
  drop column if exists reference_date, drop column if exists expected_reference_month,
  drop column if exists validity_start, drop column if exists validity_end, drop column if exists snapshot_version,
  drop column if exists approval_status, drop column if exists assigned_at, drop column if exists assigned_by,
  drop column if exists approved_at, drop column if exists approved_by, drop column if exists seeding_generated_at,
  drop column if exists seeding_generated_by, drop column if exists notes;

alter table public.tournaments drop column if exists registration_opens_at;

alter table public.ranking_snapshots drop constraint if exists ranking_snapshots_validity_ck;
alter table public.ranking_snapshots drop column if exists validity_start, drop column if exists validity_end, drop column if exists validity_source;

drop trigger if exists ranking_validity_periods_guard on public.ranking_validity_periods;
drop function if exists public.ranking_validity_periods_guard();
drop table if exists public.ranking_validity_periods;

delete from public.ranking_settings where key = 'validity_cycle';
update public.ranking_settings
   set value = '{"months": 12, "type": "calendar", "from": "first day of month M-11", "to": "last day of month M", "max_results": 8, "applies_to": "tournaments of month M+1", "decided": "2026-10-24"}'::jsonb
 where key = 'snapshot_window';

revoke all on function public.publish_ranking_snapshot(uuid, text) from public, anon;
revoke all on function public.assign_tournament_seeding(text, text, uuid, text) from public, anon;
grant execute on function public.publish_ranking_snapshot(uuid, text) to authenticated;
grant execute on function public.assign_tournament_seeding(text, text, uuid, text) to authenticated;

-- Controle.
select tournament_id, division, snapshot_id, locked_at from public.tournament_seeding_references order by 1;
select division, to_char(reference_month, 'YYYY-MM') mois, version, status, public.ranking_snapshot_checksum(id) = checksum as checksum_ok
  from public.ranking_snapshots order by reference_month, division, version;
commit;
`;
const target = path.join(root, 'deploy', 'l4-seeding-periods', 'L4_9_rollback.sql');
fs.writeFileSync(target, out);
console.log(`ecrit ${path.relative(root, target)} (${out.length} caracteres)`);
