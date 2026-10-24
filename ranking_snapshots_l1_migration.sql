-- ============================================================================
-- MPL - LOT L1 : classements de seeding mensuels immuables
-- ============================================================================
-- Migration ADDITIVE : cree de nouveaux objets, ajoute 2 colonnes nullables
-- (registrations, player_registration_requests). Ne modifie ni ne supprime
-- aucune donnee existante. Rejouable (if not exists / or replace).
-- Retour arriere : ranking_snapshots_l1_rollback.sql
--
-- Principes :
--   * un instantane = 1 division x 1 mois d'application x 1 version ;
--   * contenu modifiable uniquement en brouillon (draft) ;
--   * validation, publication, retrait et affectation aux tournois uniquement
--     via des fonctions qui verifient le role admin et journalisent ;
--   * public : lecture des instantanes publies / remplaces uniquement.
-- ============================================================================

-- ── 0. Reglages et role admin ───────────────────────────────────────────────
create table if not exists public.ranking_settings (
  key   text primary key,
  value jsonb not null
);
-- Regle des deux personnes (validateur <> publicateur) : desactivee par defaut,
-- a activer apres decision de la Commission.
insert into public.ranking_settings (key, value)
values ('require_two_person_publication', 'false'::jsonb)
on conflict (key) do nothing;

create or replace function public.mpl_is_ranking_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'superadmin')
  );
$$;

-- ── 1. Types et tables ──────────────────────────────────────────────────────
do $$ begin
  create type public.ranking_snapshot_status as enum ('draft', 'validated', 'published', 'superseded', 'withdrawn');
exception when duplicate_object then null; end $$;

create table if not exists public.ranking_snapshots (
  id                uuid primary key default gen_random_uuid(),
  division          text not null check (division in ('men', 'women', 'mixed', 'junior')),
  reference_month   date not null check (reference_month = date_trunc('month', reference_month)::date),
  applicable_month  date not null check (applicable_month = date_trunc('month', applicable_month)::date),
  cutoff_date       date not null,
  window_start      date not null,
  window_end        date not null,
  rules             jsonb not null default '{}'::jsonb,
  version           integer not null default 1 check (version >= 1),
  status            public.ranking_snapshot_status not null default 'draft',
  source            text not null check (source in ('engine', 'workbook_import')),
  source_file       text,
  engine_version    text,
  checksum          text,
  entries_count     integer,
  revision_of       uuid references public.ranking_snapshots(id),
  revision_reason   text,
  status_reason     text,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  validated_by      uuid,
  validated_at      timestamptz,
  published_by      uuid,
  published_at      timestamptz,
  locked            boolean not null default false,
  notes             text,
  constraint ranking_snapshots_version_uk unique (division, applicable_month, version),
  constraint ranking_snapshots_revision_reason_ck check (revision_of is null or length(trim(coalesce(revision_reason, ''))) > 0),
  constraint ranking_snapshots_months_ck check (applicable_month > reference_month),
  constraint ranking_snapshots_window_ck check (window_start <= window_end and window_end <= cutoff_date),
  constraint ranking_snapshots_published_ck check (
    status not in ('published', 'superseded') or (locked and published_at is not null and validated_at is not null and checksum is not null)
  )
);
create unique index if not exists ranking_snapshots_one_published
  on public.ranking_snapshots (division, applicable_month) where status = 'published';

create table if not exists public.ranking_snapshot_entries (
  snapshot_id       uuid not null references public.ranking_snapshots(id) on delete cascade,
  player_id         uuid not null references public.players(id),
  player_name       text not null,
  rank              integer not null check (rank >= 1),
  previous_rank     integer,
  points            numeric(10,2) not null check (points >= 0),
  results_counted   integer not null default 0 check (results_counted between 0 and 8),
  results_eligible  integer not null default 0 check (results_eligible >= 0),
  primary key (snapshot_id, player_id)
);
create index if not exists ranking_snapshot_entries_rank_idx on public.ranking_snapshot_entries (snapshot_id, rank);

create table if not exists public.ranking_snapshot_results (
  id             bigint generated always as identity primary key,
  snapshot_id    uuid not null references public.ranking_snapshots(id) on delete cascade,
  player_id      uuid not null references public.players(id),
  result_id      uuid,
  tournament_id  text,
  event_name     text not null,
  event_date     date not null,
  category       text not null,
  position       text,
  points         numeric(10,2) not null,
  status         text not null check (status in ('counted', 'excluded')),
  reason         text,
  foreign key (snapshot_id, player_id) references public.ranking_snapshot_entries(snapshot_id, player_id) on delete cascade
);
create index if not exists ranking_snapshot_results_player_idx on public.ranking_snapshot_results (snapshot_id, player_id);

create table if not exists public.tournament_seeding_references (
  tournament_id    text not null references public.tournaments(id),
  division         text not null check (division in ('men', 'women', 'mixed', 'junior')),
  snapshot_id      uuid not null references public.ranking_snapshots(id),
  locked_at        timestamptz not null default now(),
  locked_by        uuid,
  override_reason  text,
  primary key (tournament_id, division)
);

create table if not exists public.ranking_audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor        uuid,
  action       text not null,
  snapshot_id  uuid references public.ranking_snapshots(id) on delete set null,
  details      jsonb not null default '{}'::jsonb
);

alter table public.registrations add column if not exists seeding_snapshot_id uuid references public.ranking_snapshots(id);
alter table public.registrations add column if not exists team_weight integer;
alter table public.player_registration_requests add column if not exists seeding_snapshot_id uuid references public.ranking_snapshots(id);

-- ── 2. Immutabilite (triggers) ──────────────────────────────────────────────
-- Lignes et detail : modifiables seulement tant que l'instantane est un brouillon.
create or replace function public.ranking_snapshot_content_guard()
returns trigger
language plpgsql
as $$
declare
  v_status public.ranking_snapshot_status;
begin
  select status into v_status from public.ranking_snapshots
   where id = coalesce(new.snapshot_id, old.snapshot_id);
  -- Suppression en cascade d'un brouillon : le parent n'existe deja plus.
  if v_status is null then return coalesce(new, old); end if;
  if v_status <> 'draft' then
    raise exception 'Instantane % au statut % : contenu verrouille (creer une revision)',
      coalesce(new.snapshot_id, old.snapshot_id), v_status
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists ranking_snapshot_entries_guard on public.ranking_snapshot_entries;
create trigger ranking_snapshot_entries_guard
  before insert or update or delete on public.ranking_snapshot_entries
  for each row execute function public.ranking_snapshot_content_guard();

drop trigger if exists ranking_snapshot_results_guard on public.ranking_snapshot_results;
create trigger ranking_snapshot_results_guard
  before insert or update or delete on public.ranking_snapshot_results
  for each row execute function public.ranking_snapshot_content_guard();

-- En-tete : transitions de statut controlees, metadonnees figees hors brouillon,
-- suppression interdite hors brouillon.
create or replace function public.ranking_snapshot_header_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- Un instantane nait toujours brouillon, non verrouille, sans validation :
    -- meme la cle service_role ne peut pas inserer une publication toute faite.
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

  -- Tout changement de statut passe par les fonctions de validation /
  -- publication / retrait (elles posent ce marqueur pour la transaction).
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
       new.revision_of, new.revision_reason, new.created_by, new.created_at
     ) is distinct from (
       old.division, old.reference_month, old.applicable_month, old.cutoff_date, old.window_start,
       old.window_end, old.rules, old.version, old.source, old.source_file, old.engine_version,
       old.revision_of, old.revision_reason, old.created_by, old.created_at
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

drop trigger if exists ranking_snapshots_guard on public.ranking_snapshots;
create trigger ranking_snapshots_guard
  before insert or update or delete on public.ranking_snapshots
  for each row execute function public.ranking_snapshot_header_guard();

-- Journal d'audit : ajout seul.
create or replace function public.ranking_audit_log_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Journal d''audit en ajout seul' using errcode = 'P0001';
end;
$$;
drop trigger if exists ranking_audit_log_no_change on public.ranking_audit_log;
create trigger ranking_audit_log_no_change
  before update or delete on public.ranking_audit_log
  for each row execute function public.ranking_audit_log_append_only();

-- Reference de seeding : modification seulement via la fonction d'affectation
-- (qui exige un motif) ; jamais supprimee.
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
drop trigger if exists tournament_seeding_references_guard on public.tournament_seeding_references;
create trigger tournament_seeding_references_guard
  before update or delete on public.tournament_seeding_references
  for each row execute function public.tournament_seeding_reference_guard();

-- ── 3. Fonctions metier (seul chemin d'ecriture hors brouillon) ─────────────
create or replace function public.ranking_snapshot_checksum(p_snapshot_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select encode(sha256(convert_to(coalesce(string_agg(
           e.player_id::text || '|' || e.rank || '|' || trim(to_char(e.points, 'FM9999999990.00')) || '|' || e.results_counted,
           ';' order by e.rank, e.player_id), ''), 'UTF8')), 'hex')
    from public.ranking_snapshot_entries e
   where e.snapshot_id = p_snapshot_id;
$$;

create or replace function public.ranking_require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.mpl_is_ranking_admin() then
    raise exception 'Reserve aux administrateurs MPL' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create or replace function public.create_ranking_snapshot_draft(
  p_division text,
  p_reference_month date,
  p_applicable_month date,
  p_cutoff_date date,
  p_window_start date,
  p_window_end date,
  p_rules jsonb,
  p_source text,
  p_source_file text default null,
  p_engine_version text default null,
  p_notes text default null,
  p_revision_of uuid default null,
  p_revision_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.ranking_require_admin();
  v_id uuid;
  v_version integer;
begin
  select coalesce(max(version), 0) + 1 into v_version
    from public.ranking_snapshots
   where division = p_division and applicable_month = p_applicable_month;
  if v_version > 1 and p_revision_of is null then
    raise exception 'Un instantane existe deja pour % / % : creer une revision (motif obligatoire)',
      p_division, to_char(p_applicable_month, 'YYYY-MM') using errcode = 'P0001';
  end if;
  insert into public.ranking_snapshots (
    division, reference_month, applicable_month, cutoff_date, window_start, window_end, rules,
    version, source, source_file, engine_version, notes, revision_of, revision_reason, created_by
  ) values (
    p_division, p_reference_month, p_applicable_month, p_cutoff_date, p_window_start, p_window_end, coalesce(p_rules, '{}'::jsonb),
    v_version, p_source, p_source_file, p_engine_version, p_notes, p_revision_of, p_revision_reason, v_actor
  ) returning id into v_id;
  insert into public.ranking_audit_log (actor, action, snapshot_id, details)
  values (v_actor, 'generate', v_id, jsonb_build_object('division', p_division, 'applicable_month', p_applicable_month, 'version', v_version, 'source', p_source, 'revision_of', p_revision_of, 'reason', p_revision_reason));
  return v_id;
end;
$$;

-- Controles d'integrite + passage au statut "validated" (contenu fige).
create or replace function public.validate_ranking_snapshot(p_snapshot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.ranking_require_admin();
  s public.ranking_snapshots;
  v_errors text[] := '{}';
  v_count integer;
  v_bad integer;
  v_checksum text;
begin
  perform set_config('mpl.ranking_workflow', 'on', true);
  select * into s from public.ranking_snapshots where id = p_snapshot_id for update;
  if not found then raise exception 'Instantane introuvable' using errcode = 'P0002'; end if;
  if s.status <> 'draft' then raise exception 'Seul un brouillon peut etre valide (statut %)', s.status using errcode = 'P0001'; end if;

  select count(*) into v_count from public.ranking_snapshot_entries where snapshot_id = p_snapshot_id;
  if v_count = 0 then v_errors := v_errors || 'aucune ligne'; end if;

  -- Rangs coherents avec les points (1,1,3 a egalite).
  select count(*) into v_bad from (
    select rank, rank() over (order by points desc) as expected
      from public.ranking_snapshot_entries where snapshot_id = p_snapshot_id
  ) x where x.rank <> x.expected;
  if v_bad > 0 then v_errors := v_errors || format('%s rangs incoherents avec les points', v_bad); end if;

  -- Totaux = somme des resultats retenus (si le detail est fourni).
  if exists (select 1 from public.ranking_snapshot_results where snapshot_id = p_snapshot_id) then
    select count(*) into v_bad from public.ranking_snapshot_entries e
     where e.snapshot_id = p_snapshot_id
       and e.points <> coalesce((select sum(r.points) from public.ranking_snapshot_results r
                                  where r.snapshot_id = e.snapshot_id and r.player_id = e.player_id and r.status = 'counted'), 0);
    if v_bad > 0 then v_errors := v_errors || format('%s totaux differents de la somme des resultats retenus', v_bad); end if;

    select count(*) into v_bad from (
      select player_id from public.ranking_snapshot_results
       where snapshot_id = p_snapshot_id and status = 'counted'
       group by player_id having count(*) > 8
    ) x;
    if v_bad > 0 then v_errors := v_errors || format('%s joueurs avec plus de 8 resultats retenus', v_bad); end if;

    select count(*) into v_bad from public.ranking_snapshot_results
     where snapshot_id = p_snapshot_id and status = 'counted'
       and (event_date < s.window_start or event_date > s.window_end);
    if v_bad > 0 then v_errors := v_errors || format('%s resultats retenus hors fenetre', v_bad); end if;
  end if;

  if array_length(v_errors, 1) > 0 then
    insert into public.ranking_audit_log (actor, action, snapshot_id, details)
    values (v_actor, 'validate_rejected', p_snapshot_id, jsonb_build_object('errors', v_errors));
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  v_checksum := public.ranking_snapshot_checksum(p_snapshot_id);
  update public.ranking_snapshots
     set status = 'validated', validated_by = v_actor, validated_at = now(), checksum = v_checksum, entries_count = v_count
   where id = p_snapshot_id;
  insert into public.ranking_audit_log (actor, action, snapshot_id, details)
  values (v_actor, 'validate', p_snapshot_id, jsonb_build_object('entries', v_count, 'checksum', v_checksum));
  return jsonb_build_object('ok', true, 'entries', v_count, 'checksum', v_checksum);
end;
$$;

create or replace function public.unvalidate_ranking_snapshot(p_snapshot_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := public.ranking_require_admin();
begin
  perform set_config('mpl.ranking_workflow', 'on', true);
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Motif obligatoire' using errcode = 'P0001'; end if;
  update public.ranking_snapshots
     set status = 'draft', validated_by = null, validated_at = null, checksum = null, entries_count = null, status_reason = p_reason
   where id = p_snapshot_id and status = 'validated';
  if not found then raise exception 'Seul un instantane valide peut repasser en brouillon' using errcode = 'P0001'; end if;
  insert into public.ranking_audit_log (actor, action, snapshot_id, details) values (v_actor, 'unvalidate', p_snapshot_id, jsonb_build_object('reason', p_reason));
end;
$$;

-- Publication + verrouillage. Mot de confirmation : "PUBLIER <division> <AAAA-MM>"
-- (mois d'application). L'eventuelle version publiee du meme mois passe en superseded.
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

create or replace function public.withdraw_ranking_snapshot(p_snapshot_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := public.ranking_require_admin();
begin
  perform set_config('mpl.ranking_workflow', 'on', true);
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Motif obligatoire' using errcode = 'P0001'; end if;
  if exists (select 1 from public.tournament_seeding_references where snapshot_id = p_snapshot_id) then
    raise exception 'Instantane utilise par des tournois : reaffecter ces tournois avant le retrait' using errcode = 'P0001';
  end if;
  update public.ranking_snapshots set status = 'withdrawn', status_reason = p_reason
   where id = p_snapshot_id and status = 'published';
  if not found then raise exception 'Seul un instantane publie peut etre retire' using errcode = 'P0001'; end if;
  insert into public.ranking_audit_log (actor, action, snapshot_id, details) values (v_actor, 'withdraw', p_snapshot_id, jsonb_build_object('reason', p_reason));
end;
$$;

-- Affecte (ou reaffecte, avec motif) l'instantane de seeding d'un tournoi.
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

-- ── 4. RLS et privileges ────────────────────────────────────────────────────
alter table public.ranking_settings              enable row level security;
alter table public.ranking_snapshots             enable row level security;
alter table public.ranking_snapshot_entries      enable row level security;
alter table public.ranking_snapshot_results      enable row level security;
alter table public.tournament_seeding_references enable row level security;
alter table public.ranking_audit_log             enable row level security;

drop policy if exists ranking_settings_read on public.ranking_settings;
create policy ranking_settings_read on public.ranking_settings for select using (true);

drop policy if exists ranking_snapshots_read on public.ranking_snapshots;
create policy ranking_snapshots_read on public.ranking_snapshots for select
  using (status in ('published', 'superseded') or public.mpl_is_ranking_admin());

drop policy if exists ranking_snapshot_entries_read on public.ranking_snapshot_entries;
create policy ranking_snapshot_entries_read on public.ranking_snapshot_entries for select
  using (exists (select 1 from public.ranking_snapshots s where s.id = snapshot_id
                  and (s.status in ('published', 'superseded') or public.mpl_is_ranking_admin())));
drop policy if exists ranking_snapshot_entries_admin_write on public.ranking_snapshot_entries;
create policy ranking_snapshot_entries_admin_write on public.ranking_snapshot_entries for all to authenticated
  using (public.mpl_is_ranking_admin()) with check (public.mpl_is_ranking_admin());

drop policy if exists ranking_snapshot_results_read on public.ranking_snapshot_results;
create policy ranking_snapshot_results_read on public.ranking_snapshot_results for select
  using (exists (select 1 from public.ranking_snapshots s where s.id = snapshot_id
                  and (s.status in ('published', 'superseded') or public.mpl_is_ranking_admin())));
drop policy if exists ranking_snapshot_results_admin_write on public.ranking_snapshot_results;
create policy ranking_snapshot_results_admin_write on public.ranking_snapshot_results for all to authenticated
  using (public.mpl_is_ranking_admin()) with check (public.mpl_is_ranking_admin());

drop policy if exists tournament_seeding_references_read on public.tournament_seeding_references;
create policy tournament_seeding_references_read on public.tournament_seeding_references for select using (true);

drop policy if exists ranking_audit_log_admin_read on public.ranking_audit_log;
create policy ranking_audit_log_admin_read on public.ranking_audit_log for select to authenticated
  using (public.mpl_is_ranking_admin());

-- Lecture publique ; ecriture directe seulement sur le contenu des brouillons
-- (RLS admin + trigger) ; tout le reste passe par les fonctions ci-dessus.
revoke all on public.ranking_settings, public.ranking_snapshots, public.ranking_snapshot_entries,
              public.ranking_snapshot_results, public.tournament_seeding_references, public.ranking_audit_log
  from anon, authenticated;
grant select on public.ranking_settings, public.ranking_snapshots, public.ranking_snapshot_entries,
                public.ranking_snapshot_results, public.tournament_seeding_references to anon, authenticated;
grant select on public.ranking_audit_log to authenticated;
grant insert, update, delete on public.ranking_snapshot_entries, public.ranking_snapshot_results to authenticated;

revoke all on function public.create_ranking_snapshot_draft(text, date, date, date, date, date, jsonb, text, text, text, text, uuid, text) from public, anon;
revoke all on function public.validate_ranking_snapshot(uuid) from public, anon;
revoke all on function public.unvalidate_ranking_snapshot(uuid, text) from public, anon;
revoke all on function public.publish_ranking_snapshot(uuid, text) from public, anon;
revoke all on function public.withdraw_ranking_snapshot(uuid, text) from public, anon;
revoke all on function public.assign_tournament_seeding(text, text, uuid, text) from public, anon;
grant execute on function public.create_ranking_snapshot_draft(text, date, date, date, date, date, jsonb, text, text, text, text, uuid, text) to authenticated;
grant execute on function public.validate_ranking_snapshot(uuid) to authenticated;
grant execute on function public.unvalidate_ranking_snapshot(uuid, text) to authenticated;
grant execute on function public.publish_ranking_snapshot(uuid, text) to authenticated;
grant execute on function public.withdraw_ranking_snapshot(uuid, text) to authenticated;
grant execute on function public.assign_tournament_seeding(text, text, uuid, text) to authenticated;
revoke all on function public.ranking_require_admin() from public, anon;
grant execute on function public.ranking_snapshot_checksum(uuid) to anon, authenticated;
grant execute on function public.mpl_is_ranking_admin() to anon, authenticated;
