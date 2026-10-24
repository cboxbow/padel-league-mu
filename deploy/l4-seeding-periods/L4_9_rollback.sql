-- ============================================================================
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
create or replace function public.ranking_snapshot_header_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.locked or new.validated_at is not null or new.published_at is not null or new.checksum is not null then
      raise exception 'Un instantane doit etre cree en brouillon (create_ranking_snapshot_draft)' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Instantane % au statut % : suppression interdite', old.id, old.status using errcode = 'P0001';
    end if;
    return old;
  end if;

  if new.status is distinct from old.status and coalesce(current_setting('mpl.ranking_workflow', true), '') <> 'on' then
    raise exception 'Changement de statut uniquement via les fonctions validate/publish/withdraw' using errcode = 'P0001';
  end if;

  if not (
       (old.status = new.status)
    or (old.status = 'draft'     and new.status = 'validated')
    or (old.status = 'validated' and new.status in ('draft', 'published'))
    or (old.status = 'published' and new.status in ('superseded', 'withdrawn'))
  ) then
    raise exception 'Transition de statut interdite : % -> %', old.status, new.status using errcode = 'P0001';
  end if;

  if old.status <> 'draft' and (
       new.division, new.reference_month, new.applicable_month, new.cutoff_date, new.window_start,
       new.window_end, new.rules, new.version, new.source, new.source_file, new.engine_version,
       new.revision_of, new.revision_reason, new.created_by, new.created_at, new.checksum_version
     ) is distinct from (
       old.division, old.reference_month, old.applicable_month, old.cutoff_date, old.window_start,
       old.window_end, old.rules, old.version, old.source, old.source_file, old.engine_version,
       old.revision_of, old.revision_reason, old.created_by, old.created_at, old.checksum_version
     ) then
    raise exception 'Instantane % au statut % : parametres verrouilles', old.id, old.status using errcode = 'P0001';
  end if;

  if old.locked and (
       not new.locked
       or new.checksum is distinct from old.checksum
       or new.entries_count is distinct from old.entries_count
       or new.validated_by is distinct from old.validated_by
       or new.validated_at is distinct from old.validated_at
       or new.published_by is distinct from old.published_by
       or new.published_at is distinct from old.published_at
     ) then
    raise exception 'Instantane % verrouille : publication figee', old.id using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.publish_ranking_snapshot(p_snapshot_id uuid, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.ranking_require_admin();
  s public.ranking_snapshots;
  v_expected text;
  v_previous uuid;
  v_two_person boolean;
begin
  perform set_config('mpl.ranking_workflow', 'on', true);
  select * into s from public.ranking_snapshots where id = p_snapshot_id for update;
  if not found then raise exception 'Instantane introuvable' using errcode = 'P0002'; end if;
  if s.status <> 'validated' then raise exception 'Seul un instantane valide peut etre publie (statut %)', s.status using errcode = 'P0001'; end if;

  v_expected := 'PUBLIER ' || upper(s.division) || ' ' || to_char(s.applicable_month, 'YYYY-MM');
  if coalesce(p_confirmation, '') <> v_expected then
    raise exception 'Confirmation invalide : saisir exactement "%"', v_expected using errcode = 'P0001';
  end if;

  select coalesce((value)::text::boolean, false) into v_two_person from public.ranking_settings where key = 'require_two_person_publication';
  if coalesce(v_two_person, false) and s.validated_by = v_actor then
    raise exception 'Regle des deux personnes : le publicateur doit etre different du validateur' using errcode = 'P0001';
  end if;

  if public.ranking_snapshot_checksum(p_snapshot_id) <> s.checksum then
    raise exception 'Contenu modifie depuis la validation (somme de controle differente)' using errcode = 'P0001';
  end if;

  update public.ranking_snapshots
     set status = 'superseded', status_reason = 'Remplace par la version ' || s.version
   where division = s.division and applicable_month = s.applicable_month and status = 'published'
  returning id into v_previous;

  update public.ranking_snapshots
     set status = 'published', locked = true, published_by = v_actor, published_at = now()
   where id = p_snapshot_id;

  insert into public.ranking_audit_log (actor, action, snapshot_id, details)
  values (v_actor, 'publish', p_snapshot_id, jsonb_build_object('superseded', v_previous, 'checksum', s.checksum));
  return jsonb_build_object('ok', true, 'superseded', v_previous);
end;
$$;

create or replace function public.assign_tournament_seeding(
  p_tournament_id text,
  p_division text,
  p_snapshot_id uuid,
  p_override_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.ranking_require_admin();
  s public.ranking_snapshots;
  v_tournament_month date;
  v_existing uuid;
begin
  select * into s from public.ranking_snapshots where id = p_snapshot_id;
  if not found or s.status <> 'published' then
    raise exception 'Seul un instantane publie peut servir au seeding' using errcode = 'P0001';
  end if;
  if s.division <> p_division then
    raise exception 'Division de l''instantane (%) differente de %', s.division, p_division using errcode = 'P0001';
  end if;
  select date_trunc('month', coalesce(t.date, t.tournament_date))::date into v_tournament_month
    from public.tournaments t where t.id = p_tournament_id;
  if v_tournament_month is null then raise exception 'Tournoi % introuvable ou sans date', p_tournament_id using errcode = 'P0002'; end if;
  if v_tournament_month <> s.applicable_month and length(trim(coalesce(p_override_reason, ''))) = 0 then
    raise exception 'Instantane prevu pour %, tournoi en % : motif obligatoire',
      to_char(s.applicable_month, 'YYYY-MM'), to_char(v_tournament_month, 'YYYY-MM') using errcode = 'P0001';
  end if;

  select snapshot_id into v_existing from public.tournament_seeding_references
   where tournament_id = p_tournament_id and division = p_division;
  if v_existing is not null and v_existing <> p_snapshot_id and length(trim(coalesce(p_override_reason, ''))) = 0 then
    raise exception 'Le tournoi a deja une reference de seeding : motif obligatoire pour la changer' using errcode = 'P0001';
  end if;

  insert into public.tournament_seeding_references (tournament_id, division, snapshot_id, locked_by, override_reason)
  values (p_tournament_id, p_division, p_snapshot_id, v_actor, p_override_reason)
  on conflict (tournament_id, division) do update
     set snapshot_id = excluded.snapshot_id, locked_at = now(), locked_by = excluded.locked_by, override_reason = excluded.override_reason;

  insert into public.ranking_audit_log (actor, action, snapshot_id, details)
  values (v_actor, 'assign_seeding', p_snapshot_id, jsonb_build_object('tournament_id', p_tournament_id, 'division', p_division, 'previous', v_existing, 'reason', p_override_reason));
end;
$$;

create or replace function public.tournament_seeding_reference_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Reference de seeding : suppression interdite' using errcode = 'P0001';
  end if;
  if new.snapshot_id is distinct from old.snapshot_id and length(trim(coalesce(new.override_reason, ''))) = 0 then
    raise exception 'Changement de reference de seeding sans motif' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

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
