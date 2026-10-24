-- ============================================================================
-- MPL - LOT L4 : periodes de validite 21 -> 20 et references de seeding approuvees
-- ============================================================================
-- Decisions MPL du 24/10/2026 (suite a l'audit des periodes de seeding) :
--   1. Le classement applicable a un tournoi se determine par sa DATE DE DEBUT
--      officielle ; le meme instantane vaut pour tout le tournoi.
--   2. Periodes de validite explicites et configurables, cycle recurrent du 21
--      au 20 (application permanente soumise a l'approbation MSRA/MPL).
--      Periodes confirmees :
--        classement de JUIN 2026      -> tournois du 21/07 au 20/08/2026
--        classement de JUILLET 2026   -> tournois du 21/08 au 20/09/2026
--        classement d'AOUT 2026       -> tournois du 21/09 au 20/10/2026
--        classement de SEPTEMBRE 2026 -> tournois du 21/10 au 20/11/2026
--   3. Inscriptions ouvertes avant la publication du classement de la periode :
--      reference attendue affichee "en attente", jamais de substitution par le
--      classement courant, seeding final bloque jusqu'a l'approbation ; cas
--      exceptionnels traites par un administrateur avec motif journalise.
--   Une reference approuvee conserve la version exacte de l'instantane.
--
-- Migration ADDITIVE et rejouable. Prerequis : L1, L1.1, L3.
-- Ne modifie AUCUN classement, resultat, inscription ni tirage. Les deux
-- references existantes (M500 Moka Rangers) gardent leur instantane : seules
-- leurs colonnes de tracabilite sont renseignees.
-- ============================================================================

-- ── 0. Colonnes de periode sur les classements (utilisees par la garde ci-dessous)
alter table public.ranking_snapshots add column if not exists validity_start date;
alter table public.ranking_snapshots add column if not exists validity_end date;
alter table public.ranking_snapshots add column if not exists validity_source text;

-- ── 1. Periodes de validite (explicites, configurables) ─────────────────────
create table if not exists public.ranking_validity_periods (
  reference_month            date primary key check (reference_month = date_trunc('month', reference_month)::date),
  validity_start             date not null,
  validity_end               date not null,
  registration_opening_month date not null check (registration_opening_month = date_trunc('month', registration_opening_month)::date),
  status                     text not null default 'provisional' check (status in ('confirmed', 'provisional')),
  source                     text not null check (length(trim(source)) > 0),
  created_at                 timestamptz not null default now(),
  created_by                 uuid,
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid,
  constraint ranking_validity_periods_range_ck check (validity_start <= validity_end),
  constraint ranking_validity_periods_after_ck check (validity_start > reference_month)
);

-- Pas de chevauchement entre deux periodes.
create or replace function public.ranking_validity_periods_guard()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.ranking_validity_periods p
     where p.reference_month <> new.reference_month
       and daterange(p.validity_start, p.validity_end, '[]') && daterange(new.validity_start, new.validity_end, '[]')
  ) then
    raise exception 'Periode de validite % -> % : chevauche une autre periode', new.validity_start, new.validity_end using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (new.validity_start, new.validity_end) is distinct from (old.validity_start, old.validity_end)
     and exists (select 1 from public.ranking_snapshots s where s.reference_month = old.reference_month and s.validity_start is not null) then
    raise exception 'Periode du classement de % deja figee dans un classement publie : modification interdite', to_char(old.reference_month, 'YYYY-MM') using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Periode de validite : suppression interdite' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists ranking_validity_periods_guard on public.ranking_validity_periods;
create trigger ranking_validity_periods_guard
  before insert or update or delete on public.ranking_validity_periods
  for each row execute function public.ranking_validity_periods_guard();

-- Periodes confirmees par la MPL le 24/10/2026.
insert into public.ranking_validity_periods (reference_month, validity_start, validity_end, registration_opening_month, status, source) values
  (date '2026-06-01', date '2026-07-21', date '2026-08-20', date '2026-07-01', 'confirmed', 'Communication officielle MPL, confirmee le 24/10/2026'),
  (date '2026-07-01', date '2026-08-21', date '2026-09-20', date '2026-08-01', 'confirmed', 'Communication officielle MPL, confirmee le 24/10/2026'),
  (date '2026-08-01', date '2026-09-21', date '2026-10-20', date '2026-09-01', 'confirmed', 'Communication officielle MPL, confirmee le 24/10/2026'),
  (date '2026-09-01', date '2026-10-21', date '2026-11-20', date '2026-10-01', 'confirmed', 'Communication officielle MPL, confirmee le 24/10/2026')
on conflict (reference_month) do nothing;

-- Cycle par defaut (sert UNIQUEMENT a proposer une periode "provisional").
insert into public.ranking_settings (key, value) values
  ('validity_cycle', '{"start_day": 21, "end_day": 20, "start_months_after_reference": 1, "end_months_after_reference": 2, "reference_date": "tournament_start_date", "status": "provisional", "note": "Cycle 21 -> 20 ; application permanente soumise a l''approbation MSRA/MPL. Seules les periodes confirmees servent au seeding."}'::jsonb),
  ('snapshot_window', '{"months": 12, "type": "calendar", "from": "first day of month M-11", "to": "last day of month M", "max_results": 8, "applies_to": "tournaments whose START DATE falls within the snapshot validity period (ranking_validity_periods)", "decided": "2026-10-24"}'::jsonb)
on conflict (key) do update set value = excluded.value;

create or replace function public.ranking_default_validity(p_reference_month date)
returns table (validity_start date, validity_end date, registration_opening_month date)
language sql
stable
set search_path = public
as $$
  select (date_trunc('month', p_reference_month) + interval '1 month' + interval '20 days')::date,
         (date_trunc('month', p_reference_month) + interval '2 months' + interval '19 days')::date,
         (date_trunc('month', p_reference_month) + interval '1 month')::date;
$$;

-- Periode (confirmee) contenant une date de debut de tournoi.
create or replace function public.ranking_period_for_date(p_date date)
returns setof public.ranking_validity_periods
language sql
stable
set search_path = public
as $$
  select * from public.ranking_validity_periods
   where p_date between validity_start and validity_end
   order by reference_month;
$$;

-- Saisie / modification d'une periode (administrateur, journalisee).
create or replace function public.set_ranking_validity_period(
  p_reference_month date, p_validity_start date, p_validity_end date,
  p_registration_opening_month date, p_status text, p_source text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := public.ranking_require_admin();
begin
  insert into public.ranking_validity_periods (reference_month, validity_start, validity_end, registration_opening_month, status, source, created_by, updated_by)
  values (p_reference_month, p_validity_start, p_validity_end, p_registration_opening_month, p_status, p_source, v_actor, v_actor)
  on conflict (reference_month) do update
     set validity_start = excluded.validity_start, validity_end = excluded.validity_end,
         registration_opening_month = excluded.registration_opening_month, status = excluded.status,
         source = excluded.source, updated_at = now(), updated_by = v_actor;
  insert into public.ranking_audit_log (actor, action, details)
  values (v_actor, 'set_validity_period', jsonb_build_object('reference_month', p_reference_month, 'start', p_validity_start, 'end', p_validity_end,
          'registration_opening_month', p_registration_opening_month, 'status', p_status, 'source', p_source));
end;
$$;

-- ── 2. Periode figee sur chaque classement publie ───────────────────────────
alter table public.ranking_snapshots drop constraint if exists ranking_snapshots_validity_ck;
alter table public.ranking_snapshots add constraint ranking_snapshots_validity_ck
  check ((validity_start is null and validity_end is null) or (validity_start <= validity_end and validity_start > reference_month));

-- Garde des en-tetes (version L3) + periode : posee une seule fois, par une
-- fonction metier, puis verrouillee comme le reste des parametres.
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

  -- Periode de validite : vide -> renseignee une seule fois, via une fonction metier.
  if (new.validity_start, new.validity_end, new.validity_source) is distinct from (old.validity_start, old.validity_end, old.validity_source) then
    if old.validity_start is not null or old.validity_end is not null then
      raise exception 'Instantane % : periode de validite deja figee', old.id using errcode = 'P0001';
    end if;
    if coalesce(current_setting('mpl.ranking_workflow', true), '') <> 'on' then
      raise exception 'Periode de validite uniquement via publish_ranking_snapshot / set_snapshot_validity' using errcode = 'P0001';
    end if;
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

-- Fige la periode confirmee sur un instantane publie qui n'en a pas encore
-- (cas de septembre 2026, publie avant L4). Journalise, motif obligatoire.
create or replace function public.set_snapshot_validity(p_snapshot_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.ranking_require_admin();
  s public.ranking_snapshots;
  p public.ranking_validity_periods;
begin
  perform set_config('mpl.ranking_workflow', 'on', true);
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Motif obligatoire' using errcode = 'P0001'; end if;
  select * into s from public.ranking_snapshots where id = p_snapshot_id for update;
  if not found then raise exception 'Instantane introuvable' using errcode = 'P0002'; end if;
  if s.status not in ('published', 'superseded') then raise exception 'Reserve aux instantanes publies (statut %)', s.status using errcode = 'P0001'; end if;
  if s.validity_start is not null or s.validity_end is not null then
    raise exception 'Instantane % : periode de validite deja figee (% -> %)', s.id, s.validity_start, s.validity_end using errcode = 'P0001';
  end if;
  select * into p from public.ranking_validity_periods where reference_month = s.reference_month and status = 'confirmed';
  if not found then raise exception 'Aucune periode confirmee pour le classement de %', to_char(s.reference_month, 'YYYY-MM') using errcode = 'P0001'; end if;
  update public.ranking_snapshots set validity_start = p.validity_start, validity_end = p.validity_end, validity_source = p.source where id = p_snapshot_id;
  insert into public.ranking_audit_log (actor, action, snapshot_id, details)
  values (v_actor, 'set_snapshot_validity', p_snapshot_id, jsonb_build_object('start', p.validity_start, 'end', p.validity_end, 'source', p.source, 'reason', p_reason));
  return jsonb_build_object('ok', true, 'validity_start', p.validity_start, 'validity_end', p.validity_end);
end;
$$;

-- Publication (version L1) + periode confirmee obligatoire, figee a la publication.
create or replace function public.publish_ranking_snapshot(p_snapshot_id uuid, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.ranking_require_admin();
  s public.ranking_snapshots;
  p public.ranking_validity_periods;
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

  select * into p from public.ranking_validity_periods where reference_month = s.reference_month and status = 'confirmed';
  if not found then
    raise exception 'Periode de validite du classement de % non confirmee : la saisir avant de publier (set_ranking_validity_period)',
      to_char(s.reference_month, 'YYYY-MM') using errcode = 'P0001';
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
     set status = 'published', locked = true, published_by = v_actor, published_at = now(),
         validity_start = p.validity_start, validity_end = p.validity_end, validity_source = p.source
   where id = p_snapshot_id;

  insert into public.ranking_audit_log (actor, action, snapshot_id, details)
  values (v_actor, 'publish', p_snapshot_id, jsonb_build_object('superseded', v_previous, 'checksum', s.checksum,
          'validity_start', p.validity_start, 'validity_end', p.validity_end));
  return jsonb_build_object('ok', true, 'superseded', v_previous, 'validity_start', p.validity_start, 'validity_end', p.validity_end);
end;
$$;

-- ── 3. Tournois : date d'ouverture des inscriptions ─────────────────────────
alter table public.tournaments add column if not exists registration_opens_at date;
comment on column public.tournaments.registration_opens_at is
  'Date d''ouverture des inscriptions. Si elle precede la publication du classement de la periode, la reference de seeding reste "en attente".';

-- ── 4. References de seeding : periode, version, approbation, tracabilite ───
alter table public.tournament_seeding_references alter column snapshot_id drop not null;
alter table public.tournament_seeding_references add column if not exists reference_date date;
alter table public.tournament_seeding_references add column if not exists expected_reference_month date;
alter table public.tournament_seeding_references add column if not exists validity_start date;
alter table public.tournament_seeding_references add column if not exists validity_end date;
alter table public.tournament_seeding_references add column if not exists snapshot_version integer;
alter table public.tournament_seeding_references add column if not exists approval_status text not null default 'approved';
alter table public.tournament_seeding_references add column if not exists assigned_at timestamptz;
alter table public.tournament_seeding_references add column if not exists assigned_by uuid;
alter table public.tournament_seeding_references add column if not exists approved_at timestamptz;
alter table public.tournament_seeding_references add column if not exists approved_by uuid;
alter table public.tournament_seeding_references add column if not exists seeding_generated_at timestamptz;
alter table public.tournament_seeding_references add column if not exists seeding_generated_by uuid;
alter table public.tournament_seeding_references add column if not exists notes text;
alter table public.tournament_seeding_references drop constraint if exists tournament_seeding_references_status_ck;
alter table public.tournament_seeding_references add constraint tournament_seeding_references_status_ck
  check (approval_status in ('pending_snapshot', 'proposed', 'approved', 'rejected'));
-- Garde : pas de suppression ; une reference approuvee est figee (instantane,
-- version, periode) sauf reaffectation motivee ; l'horodatage du seeding ne
-- s'efface pas ; toute ecriture passe par les fonctions (mpl.ranking_workflow).
create or replace function public.tournament_seeding_reference_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Reference de seeding : suppression interdite' using errcode = 'P0001';
  end if;
  if coalesce(current_setting('mpl.ranking_workflow', true), '') <> 'on' then
    raise exception 'Reference de seeding : ecriture uniquement via les fonctions propose/approve/assign' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    -- Une valeur deja renseignee d'une reference approuvee est figee (le
    -- premier renseignement des colonnes de tracabilite reste possible).
    if old.approval_status = 'approved'
       and (   (old.snapshot_id is not null and new.snapshot_id is distinct from old.snapshot_id)
            or (old.snapshot_version is not null and new.snapshot_version is distinct from old.snapshot_version)
            or (old.validity_start is not null and new.validity_start is distinct from old.validity_start)
            or (old.validity_end is not null and new.validity_end is distinct from old.validity_end)
            or (old.reference_date is not null and new.reference_date is distinct from old.reference_date)
            or (old.approved_at is not null and new.approved_at is distinct from old.approved_at))
       and length(trim(coalesce(new.override_reason, ''))) = 0 then
      raise exception 'Reference approuvee : changement sans motif interdit' using errcode = 'P0001';
    end if;
    if old.seeding_generated_at is not null and new.seeding_generated_at is distinct from old.seeding_generated_at then
      raise exception 'Seeding deja genere le % : horodatage fige', old.seeding_generated_at using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists tournament_seeding_references_guard on public.tournament_seeding_references;
create trigger tournament_seeding_references_guard
  before insert or update or delete on public.tournament_seeding_references
  for each row execute function public.tournament_seeding_reference_guard();

-- Tracabilite des references existantes (M500 Moka Rangers, 23/10/2026) :
-- MEME instantane, MEME version ; seules les colonnes d'audit sont remplies.
do $$
begin
  perform set_config('mpl.ranking_workflow', 'on', true);
  update public.tournament_seeding_references r
     set reference_date = coalesce(t.date, t.tournament_date),
         expected_reference_month = p.reference_month,
         validity_start = p.validity_start,
         validity_end = p.validity_end,
         snapshot_version = s.version,
         approval_status = 'approved',
         assigned_at = coalesce(r.assigned_at, r.locked_at),
         assigned_by = coalesce(r.assigned_by, r.locked_by),
         approved_at = coalesce(r.approved_at, r.locked_at),
         approved_by = coalesce(r.approved_by, r.locked_by),
         notes = coalesce(r.notes, 'Reference posee le 23/10/2026 (L2_3) ; seeding produit par l''outil Moka Rangers avec les rangs de septembre 2026 v1 (hors base, horodatage non enregistre).')
    from public.tournaments t, public.ranking_snapshots s, public.ranking_validity_periods p
   where t.id = r.tournament_id and s.id = r.snapshot_id
     and coalesce(t.date, t.tournament_date) between p.validity_start and p.validity_end
     and r.reference_date is null;
  perform set_config('mpl.ranking_workflow', 'off', true);
end $$;

-- Contraintes posees apres la reprise des references existantes.
alter table public.tournament_seeding_references drop constraint if exists tournament_seeding_references_snapshot_ck;
alter table public.tournament_seeding_references add constraint tournament_seeding_references_snapshot_ck
  check (approval_status in ('pending_snapshot', 'rejected') or (snapshot_id is not null and snapshot_version is not null));
alter table public.tournament_seeding_references drop constraint if exists tournament_seeding_references_generated_ck;
alter table public.tournament_seeding_references add constraint tournament_seeding_references_generated_ck
  check (seeding_generated_at is null or approval_status = 'approved');

-- ── 5. Fonctions de reference de seeding ────────────────────────────────────
-- Propose la reference attendue d'un tournoi (date de DEBUT) sans jamais
-- l'approuver ni la remplacer par le classement courant.
create or replace function public.propose_tournament_seeding(p_tournament_id text, p_division text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.ranking_require_admin();
  v_start date;
  p public.ranking_validity_periods;
  v_count integer;
  s public.ranking_snapshots;
  r public.tournament_seeding_references;
  v_status text;
  v_notes text[] := '{}';
begin
  perform set_config('mpl.ranking_workflow', 'on', true);
  select coalesce(t.date, t.tournament_date) into v_start from public.tournaments t where t.id = p_tournament_id;
  if v_start is null then raise exception 'Tournoi % introuvable ou sans date de debut', p_tournament_id using errcode = 'P0002'; end if;
  if p_division not in ('men', 'women', 'mixed', 'junior') then raise exception 'Division invalide : %', p_division using errcode = 'P0001'; end if;

  select * into r from public.tournament_seeding_references where tournament_id = p_tournament_id and division = p_division;
  if found and r.approval_status = 'approved' then
    raise exception 'Reference deja approuvee (instantane %, v%) : utiliser la reaffectation motivee', r.snapshot_id, r.snapshot_version using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.ranking_period_for_date(v_start) x where x.status = 'confirmed';
  if v_count = 0 then
    raise exception 'Aucune periode de validite confirmee ne contient le % : validation manuelle requise', v_start using errcode = 'P0001';
  end if;
  if v_count > 1 then
    raise exception 'Plusieurs periodes contiennent le % : validation manuelle requise', v_start using errcode = 'P0001';
  end if;
  select * into p from public.ranking_period_for_date(v_start) x where x.status = 'confirmed';

  select * into s from public.ranking_snapshots
   where division = p_division and reference_month = p.reference_month and status = 'published';
  if found then
    v_status := 'proposed';
  else
    v_status := 'pending_snapshot';
    v_notes := v_notes || format('Classement de %s non publie : reference attendue en attente, aucun seeding final possible', to_char(p.reference_month, 'MM/YYYY'));
  end if;
  if exists (select 1 from public.tournaments t where t.id = p_tournament_id and t.registration_opens_at is not null
              and (s.id is null or t.registration_opens_at < s.published_at::date)) then
    v_notes := v_notes || 'Inscriptions ouvertes avant la publication du classement de la periode';
  end if;

  insert into public.tournament_seeding_references (tournament_id, division, snapshot_id, snapshot_version, locked_by, reference_date,
         expected_reference_month, validity_start, validity_end, approval_status, assigned_at, assigned_by, notes)
  values (p_tournament_id, p_division, s.id, s.version, v_actor, v_start, p.reference_month, p.validity_start, p.validity_end,
          v_status, now(), v_actor, nullif(array_to_string(v_notes, ' ; '), ''))
  on conflict (tournament_id, division) do update
     set snapshot_id = excluded.snapshot_id, snapshot_version = excluded.snapshot_version, reference_date = excluded.reference_date,
         expected_reference_month = excluded.expected_reference_month, validity_start = excluded.validity_start,
         validity_end = excluded.validity_end, approval_status = excluded.approval_status, assigned_at = now(),
         assigned_by = v_actor, notes = excluded.notes;

  insert into public.ranking_audit_log (actor, action, snapshot_id, details)
  values (v_actor, 'propose_seeding', s.id, jsonb_build_object('tournament_id', p_tournament_id, 'division', p_division, 'start_date', v_start,
          'expected_reference_month', p.reference_month, 'status', v_status, 'notes', v_notes));
  return jsonb_build_object('status', v_status, 'snapshot_id', s.id, 'snapshot_version', s.version, 'expected_reference_month', p.reference_month,
                            'validity_start', p.validity_start, 'validity_end', p.validity_end, 'notes', v_notes);
end;
$$;

-- Approuve la reference proposee : l'instantane et sa version sont figes.
create or replace function public.approve_tournament_seeding(p_tournament_id text, p_division text, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.ranking_require_admin();
  r public.tournament_seeding_references;
  s public.ranking_snapshots;
  v_expected text := 'APPROUVER ' || p_tournament_id || ' ' || upper(p_division);
begin
  perform set_config('mpl.ranking_workflow', 'on', true);
  if coalesce(p_confirmation, '') <> v_expected then
    raise exception 'Confirmation invalide : saisir exactement "%"', v_expected using errcode = 'P0001';
  end if;
  select * into r from public.tournament_seeding_references where tournament_id = p_tournament_id and division = p_division for update;
  if not found then raise exception 'Aucune reference proposee pour % / %', p_tournament_id, p_division using errcode = 'P0002'; end if;
  if r.approval_status = 'pending_snapshot' then
    raise exception 'Classement de la periode non publie : approbation impossible (cas exceptionnel : approve_tournament_seeding_exception)' using errcode = 'P0001';
  end if;
  if r.approval_status <> 'proposed' then raise exception 'Reference au statut % : rien a approuver', r.approval_status using errcode = 'P0001'; end if;
  select * into s from public.ranking_snapshots where id = r.snapshot_id;
  if s.status <> 'published' or s.version <> r.snapshot_version then
    raise exception 'L''instantane propose n''est plus la version publiee : reproposer la reference' using errcode = 'P0001';
  end if;
  update public.tournament_seeding_references
     set approval_status = 'approved', approved_at = now(), approved_by = v_actor, locked_at = now(), locked_by = v_actor
   where tournament_id = p_tournament_id and division = p_division;
  insert into public.ranking_audit_log (actor, action, snapshot_id, details)
  values (v_actor, 'approve_seeding', s.id, jsonb_build_object('tournament_id', p_tournament_id, 'division', p_division, 'snapshot_version', s.version));
  return jsonb_build_object('ok', true, 'snapshot_id', s.id, 'snapshot_version', s.version);
end;
$$;

-- Cas exceptionnel documente : un administrateur approuve un autre instantane
-- publie (ex. classement de la periode non publie a temps), motif obligatoire.
create or replace function public.approve_tournament_seeding_exception(p_tournament_id text, p_division text, p_snapshot_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.ranking_require_admin();
  v_start date;
  s public.ranking_snapshots;
  p public.ranking_validity_periods;
  r public.tournament_seeding_references;
begin
  perform set_config('mpl.ranking_workflow', 'on', true);
  if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'Motif detaille obligatoire (10 caracteres minimum)' using errcode = 'P0001'; end if;
  select coalesce(t.date, t.tournament_date) into v_start from public.tournaments t where t.id = p_tournament_id;
  if v_start is null then raise exception 'Tournoi % introuvable', p_tournament_id using errcode = 'P0002'; end if;
  select * into s from public.ranking_snapshots where id = p_snapshot_id;
  if not found or s.status <> 'published' or s.division <> p_division then
    raise exception 'Instantane publie de la division % requis', p_division using errcode = 'P0001';
  end if;
  select * into r from public.tournament_seeding_references where tournament_id = p_tournament_id and division = p_division for update;
  if found and r.seeding_generated_at is not null then
    raise exception 'Seeding deja genere le % : reference figee', r.seeding_generated_at using errcode = 'P0001';
  end if;
  select * into p from public.ranking_period_for_date(v_start) x where x.status = 'confirmed' limit 1;
  insert into public.tournament_seeding_references (tournament_id, division, snapshot_id, snapshot_version, locked_by, reference_date,
         expected_reference_month, validity_start, validity_end, approval_status, assigned_at, assigned_by, approved_at, approved_by, override_reason, notes)
  values (p_tournament_id, p_division, s.id, s.version, v_actor, v_start, p.reference_month, p.validity_start, p.validity_end,
          'approved', now(), v_actor, now(), v_actor, p_reason, 'Cas exceptionnel approuve par un administrateur')
  on conflict (tournament_id, division) do update
     set snapshot_id = excluded.snapshot_id, snapshot_version = excluded.snapshot_version, reference_date = excluded.reference_date,
         expected_reference_month = excluded.expected_reference_month, validity_start = excluded.validity_start, validity_end = excluded.validity_end,
         approval_status = 'approved', assigned_at = now(), assigned_by = v_actor, approved_at = now(), approved_by = v_actor,
         locked_at = now(), locked_by = v_actor, override_reason = excluded.override_reason, notes = excluded.notes;
  insert into public.ranking_audit_log (actor, action, snapshot_id, details)
  values (v_actor, 'approve_seeding_exception', s.id, jsonb_build_object('tournament_id', p_tournament_id, 'division', p_division,
          'snapshot_version', s.version, 'expected_reference_month', p.reference_month, 'reason', p_reason));
  return jsonb_build_object('ok', true, 'snapshot_id', s.id, 'snapshot_version', s.version, 'expected_reference_month', p.reference_month);
end;
$$;

-- Horodate la generation du seeding final (une seule fois, reference approuvee).
create or replace function public.mark_tournament_seeding_generated(p_tournament_id text, p_division text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.ranking_require_admin();
  r public.tournament_seeding_references;
begin
  perform set_config('mpl.ranking_workflow', 'on', true);
  select * into r from public.tournament_seeding_references where tournament_id = p_tournament_id and division = p_division for update;
  if not found or r.approval_status <> 'approved' then
    raise exception 'Seeding final impossible : reference non approuvee (statut %)', coalesce(r.approval_status, 'absente') using errcode = 'P0001';
  end if;
  if r.seeding_generated_at is not null then raise exception 'Seeding deja genere le %', r.seeding_generated_at using errcode = 'P0001'; end if;
  update public.tournament_seeding_references set seeding_generated_at = now(), seeding_generated_by = v_actor
   where tournament_id = p_tournament_id and division = p_division;
  insert into public.ranking_audit_log (actor, action, snapshot_id, details)
  values (v_actor, 'seeding_generated', r.snapshot_id, jsonb_build_object('tournament_id', p_tournament_id, 'division', p_division, 'snapshot_version', r.snapshot_version));
  return jsonb_build_object('ok', true, 'snapshot_id', r.snapshot_id, 'snapshot_version', r.snapshot_version);
end;
$$;

-- assign_tournament_seeding (L1) : regle du mois calendaire remplacee par la
-- periode de validite (date de debut). Cree directement une reference
-- approuvee ; hors periode, motif obligatoire.
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
  v_start date;
  p public.ranking_validity_periods;
  v_existing public.tournament_seeding_references;
begin
  perform set_config('mpl.ranking_workflow', 'on', true);
  select * into s from public.ranking_snapshots where id = p_snapshot_id;
  if not found or s.status <> 'published' then
    raise exception 'Seul un instantane publie peut servir au seeding' using errcode = 'P0001';
  end if;
  if s.division <> p_division then
    raise exception 'Division de l''instantane (%) differente de %', s.division, p_division using errcode = 'P0001';
  end if;
  select coalesce(t.date, t.tournament_date) into v_start from public.tournaments t where t.id = p_tournament_id;
  if v_start is null then raise exception 'Tournoi % introuvable ou sans date', p_tournament_id using errcode = 'P0002'; end if;
  select * into p from public.ranking_period_for_date(v_start) x where x.status = 'confirmed' limit 1;
  if (p.reference_month is null or p.reference_month <> s.reference_month) and length(trim(coalesce(p_override_reason, ''))) = 0 then
    raise exception 'Le tournoi du % releve du classement de % (periode %), pas de % : motif obligatoire',
      v_start, coalesce(to_char(p.reference_month, 'YYYY-MM'), 'aucune periode confirmee'),
      coalesce(p.validity_start::text || ' -> ' || p.validity_end::text, '?'), to_char(s.reference_month, 'YYYY-MM') using errcode = 'P0001';
  end if;
  select * into v_existing from public.tournament_seeding_references where tournament_id = p_tournament_id and division = p_division;
  if found and v_existing.snapshot_id is not null and v_existing.snapshot_id <> p_snapshot_id and length(trim(coalesce(p_override_reason, ''))) = 0 then
    raise exception 'Le tournoi a deja une reference de seeding : motif obligatoire pour la changer' using errcode = 'P0001';
  end if;
  if found and v_existing.seeding_generated_at is not null and v_existing.snapshot_id is distinct from p_snapshot_id then
    raise exception 'Seeding deja genere le % : reference figee', v_existing.seeding_generated_at using errcode = 'P0001';
  end if;

  insert into public.tournament_seeding_references (tournament_id, division, snapshot_id, snapshot_version, locked_by, override_reason,
         reference_date, expected_reference_month, validity_start, validity_end, approval_status, assigned_at, assigned_by, approved_at, approved_by)
  values (p_tournament_id, p_division, p_snapshot_id, s.version, v_actor, p_override_reason,
          v_start, p.reference_month, p.validity_start, p.validity_end, 'approved', now(), v_actor, now(), v_actor)
  on conflict (tournament_id, division) do update
     set snapshot_id = excluded.snapshot_id, snapshot_version = excluded.snapshot_version, locked_at = now(), locked_by = excluded.locked_by,
         override_reason = excluded.override_reason, reference_date = excluded.reference_date,
         expected_reference_month = excluded.expected_reference_month, validity_start = excluded.validity_start,
         validity_end = excluded.validity_end, approval_status = 'approved', assigned_at = now(), assigned_by = v_actor,
         approved_at = now(), approved_by = v_actor;

  insert into public.ranking_audit_log (actor, action, snapshot_id, details)
  values (v_actor, 'assign_seeding', p_snapshot_id, jsonb_build_object('tournament_id', p_tournament_id, 'division', p_division,
          'previous', v_existing.snapshot_id, 'reason', p_override_reason, 'start_date', v_start, 'expected_reference_month', p.reference_month));
end;
$$;

-- ── 6. Vue publique : reference attendue / approuvee de chaque tournoi ──────
create or replace view public.tournament_seeding_status
with (security_invoker = true) as
select t.id as tournament_id,
       t.name as tournament_name,
       coalesce(t.date, t.tournament_date) as start_date,
       t.end_date,
       t.registration_opens_at,
       t.division,
       t.category,
       t.status as tournament_status,
       p.reference_month as expected_reference_month,
       p.validity_start,
       p.validity_end,
       p.status as period_status,
       s.id as expected_snapshot_id,
       s.version as expected_snapshot_version,
       s.published_at as expected_snapshot_published_at,
       r.snapshot_id,
       r.snapshot_version,
       r.approval_status,
       r.approved_at,
       r.seeding_generated_at,
       r.override_reason,
       case
         when r.approval_status is not null then r.approval_status
         when p.reference_month is null then 'no_period'
         when s.id is null then 'pending_snapshot'
         else 'not_assigned'
       end as seeding_status
  from public.tournaments t
  left join public.ranking_validity_periods p
         on coalesce(t.date, t.tournament_date) between p.validity_start and p.validity_end
  left join public.ranking_snapshots s
         on s.reference_month = p.reference_month and s.division = t.division and s.status = 'published'
  left join public.tournament_seeding_references r
         on r.tournament_id = t.id and r.division = t.division;

-- ── 7. Droits ───────────────────────────────────────────────────────────────
alter table public.ranking_validity_periods enable row level security;
drop policy if exists ranking_validity_periods_read on public.ranking_validity_periods;
create policy ranking_validity_periods_read on public.ranking_validity_periods for select using (true);
revoke all on public.ranking_validity_periods from anon, authenticated;
grant select on public.ranking_validity_periods to anon, authenticated;
grant select on public.tournament_seeding_status to anon, authenticated;

revoke all on function public.set_ranking_validity_period(date, date, date, date, text, text) from public, anon;
revoke all on function public.set_snapshot_validity(uuid, text) from public, anon;
revoke all on function public.propose_tournament_seeding(text, text) from public, anon;
revoke all on function public.approve_tournament_seeding(text, text, text) from public, anon;
revoke all on function public.approve_tournament_seeding_exception(text, text, uuid, text) from public, anon;
revoke all on function public.mark_tournament_seeding_generated(text, text) from public, anon;
revoke all on function public.assign_tournament_seeding(text, text, uuid, text) from public, anon;
revoke all on function public.publish_ranking_snapshot(uuid, text) from public, anon;
grant execute on function public.set_ranking_validity_period(date, date, date, date, text, text) to authenticated;
grant execute on function public.set_snapshot_validity(uuid, text) to authenticated;
grant execute on function public.propose_tournament_seeding(text, text) to authenticated;
grant execute on function public.approve_tournament_seeding(text, text, text) to authenticated;
grant execute on function public.approve_tournament_seeding_exception(text, text, uuid, text) to authenticated;
grant execute on function public.mark_tournament_seeding_generated(text, text) to authenticated;
grant execute on function public.assign_tournament_seeding(text, text, uuid, text) to authenticated;
grant execute on function public.publish_ranking_snapshot(uuid, text) to authenticated;
grant execute on function public.ranking_period_for_date(date) to anon, authenticated;
grant execute on function public.ranking_default_validity(date) to anon, authenticated;
