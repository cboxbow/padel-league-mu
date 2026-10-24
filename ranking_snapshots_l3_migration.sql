-- ============================================================================
-- MPL - LOT L3 : regle officielle de la fenetre des classements mensuels
-- ============================================================================
-- Decision du 24/10/2026 :
--   * date de reference d'un tournoi = sa DATE DE FIN (jour de la finale) ;
--   * classement du mois M = tournois dont la finale a eu lieu du 1er jour du
--     mois M-11 au dernier jour du mois M (12 mois calendaires), 8 meilleurs
--     resultats ; il sert de reference de seeding aux tournois du mois M+1.
-- Migration ADDITIVE, rejouable. Prerequis : L1 + L1.1.
-- Contenu :
--   1. dates de fin (tournaments.end_date, historical_tournament_results.event_end_date)
--      - vides = tournoi d'un jour (fin = date de debut) ;
--   2. regle enregistree dans ranking_settings ;
--   3. somme de controle v2 independante du serveur (tri binaire "C") ; les
--      instantanes deja publies gardent la v1 avec laquelle ils ont ete scelles ;
--   4. calcul moteur : ligne sans fiche joueur = avertissement (note obligatoire),
--      comme pour un import.
-- ============================================================================

-- ── 1. Dates de fin ────────────────────────────────────────────────────────
alter table public.tournaments add column if not exists end_date date;
alter table public.tournaments drop constraint if exists tournaments_end_date_ck;
alter table public.tournaments add constraint tournaments_end_date_ck
  check (end_date is null or end_date >= coalesce(date, tournament_date));

alter table public.historical_tournament_results add column if not exists event_end_date date;
alter table public.historical_tournament_results drop constraint if exists historical_event_end_date_ck;
alter table public.historical_tournament_results add constraint historical_event_end_date_ck
  check (event_end_date is null or event_end_date >= event_date);

comment on column public.tournaments.end_date is
  'Jour de la finale. Vide = tournoi d''un jour (fin = date de debut). Date de reference du Ranking MPL.';
comment on column public.historical_tournament_results.event_end_date is
  'Jour de la finale du tableau. Vide = meme jour que event_date. Date de reference du Ranking MPL.';

-- ── 2. Regle officielle ─────────────────────────────────────────────────────
insert into public.ranking_settings (key, value) values
  ('reference_date', '"tournament_end_date"'::jsonb),
  ('snapshot_window', '{"months": 12, "type": "calendar", "from": "first day of month M-11", "to": "last day of month M", "max_results": 8, "applies_to": "tournaments of month M+1", "decided": "2026-10-24"}'::jsonb)
on conflict (key) do update set value = excluded.value;

-- ── 3. Somme de controle v2 ─────────────────────────────────────────────────
alter table public.ranking_snapshots add column if not exists checksum_version integer not null default 1;
alter table public.ranking_snapshots alter column checksum_version set default 2;

create or replace function public.ranking_snapshot_checksum(p_snapshot_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select encode(sha256(convert_to(coalesce(
    case when s.checksum_version >= 2 then
      (select string_agg(x.line, ';' order by x.rank, x.k collate "C", x.points)
         from (select e.rank, e.points,
                      coalesce(e.player_id::text, 'NOM:' || e.player_name) as k,
                      coalesce(e.player_id::text, 'NOM:' || e.player_name) || '|' || e.rank || '|' || trim(to_char(e.points, 'FM9999999990.00')) || '|' || e.results_counted as line
                 from public.ranking_snapshot_entries e where e.snapshot_id = s.id) x)
    else
      (select string_agg(coalesce(e.player_id::text, 'NOM:' || e.player_name) || '|' || e.rank || '|' || trim(to_char(e.points, 'FM9999999990.00')) || '|' || e.results_counted,
                         ';' order by e.rank, coalesce(e.player_id::text, 'NOM:' || e.player_name), e.points)
         from public.ranking_snapshot_entries e where e.snapshot_id = s.id)
    end, ''), 'UTF8')), 'hex')
    from public.ranking_snapshots s
   where s.id = p_snapshot_id;
$$;

-- La version de la somme de controle est figee comme le reste des parametres.
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

-- ── 4. Validation : sans fiche = avertissement pour tous les instantanes ────
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
  v_warnings text[] := '{}';
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

  if s.source = 'engine' then
    -- Calcul moteur : rang exact (1,1,3).
    select count(*) into v_bad from (
      select rank, rank() over (order by points desc) as expected
        from public.ranking_snapshot_entries where snapshot_id = p_snapshot_id
    ) x where x.rank <> x.expected;
    if v_bad > 0 then v_errors := v_errors || format('%s rangs incoherents avec les points', v_bad); end if;
  else
    -- Import tel que diffuse : rangs conserves (trous admis), mais plus de points
    -- => rang strictement meilleur, et memes points => meme rang.
    select count(*) into v_bad from public.ranking_snapshot_entries a
      join public.ranking_snapshot_entries b on b.snapshot_id = a.snapshot_id and b.entry_id <> a.entry_id
     where a.snapshot_id = p_snapshot_id
       and ((a.points > b.points and a.rank >= b.rank) or (a.points = b.points and a.rank <> b.rank));
    if v_bad > 0 then v_errors := v_errors || format('%s paires de lignes avec rangs incoherents', v_bad / 2); end if;
  end if;

  select count(*) into v_bad from public.ranking_snapshot_entries where snapshot_id = p_snapshot_id and player_id is null;
  if v_bad > 0 then v_warnings := v_warnings || format('%s lignes sans fiche joueur (note d''identite renseignee)', v_bad); end if;

  if exists (select 1 from public.ranking_snapshot_results where snapshot_id = p_snapshot_id) then
    select count(*) into v_bad from public.ranking_snapshot_entries e
     where e.snapshot_id = p_snapshot_id
       and abs(e.points - coalesce((select sum(r.points) from public.ranking_snapshot_results r
                                     where r.entry_id = e.entry_id and r.status = 'counted'), 0)) >= 0.01;
    if v_bad > 0 then v_errors := v_errors || format('%s totaux differents de la somme des resultats retenus', v_bad); end if;

    select count(*) into v_bad from (
      select entry_id from public.ranking_snapshot_results
       where snapshot_id = p_snapshot_id and status = 'counted'
       group by entry_id having count(*) > 8
    ) x;
    if v_bad > 0 then v_errors := v_errors || format('%s lignes avec plus de 8 resultats retenus', v_bad); end if;

    -- event_date du detail = date de reference (finale) du resultat.
    select count(*) into v_bad from public.ranking_snapshot_results
     where snapshot_id = p_snapshot_id and status = 'counted'
       and (event_date < s.window_start or event_date > s.window_end);
    if v_bad > 0 then v_errors := v_errors || format('%s resultats retenus hors fenetre', v_bad); end if;
  end if;

  if array_length(v_errors, 1) > 0 then
    insert into public.ranking_audit_log (actor, action, snapshot_id, details)
    values (v_actor, 'validate_rejected', p_snapshot_id, jsonb_build_object('errors', v_errors, 'warnings', v_warnings));
    return jsonb_build_object('ok', false, 'errors', v_errors, 'warnings', v_warnings);
  end if;

  v_checksum := public.ranking_snapshot_checksum(p_snapshot_id);
  update public.ranking_snapshots
     set status = 'validated', validated_by = v_actor, validated_at = now(), checksum = v_checksum, entries_count = v_count
   where id = p_snapshot_id;
  insert into public.ranking_audit_log (actor, action, snapshot_id, details)
  values (v_actor, 'validate', p_snapshot_id, jsonb_build_object('entries', v_count, 'checksum', v_checksum, 'checksum_version', s.checksum_version, 'warnings', v_warnings));
  return jsonb_build_object('ok', true, 'entries', v_count, 'checksum', v_checksum, 'checksum_version', s.checksum_version, 'warnings', v_warnings);
end;
$$;

revoke all on function public.validate_ranking_snapshot(uuid) from public, anon;
grant execute on function public.validate_ranking_snapshot(uuid) to authenticated;
grant execute on function public.ranking_snapshot_checksum(uuid) to anon, authenticated;
