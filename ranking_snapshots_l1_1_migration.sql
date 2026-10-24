-- ============================================================================
-- MPL - LOT L1.1 : instantanes importes "tels que diffuses"
-- ============================================================================
-- Prerequis : ranking_snapshots_l1_migration.sql. A executer TANT QUE les
-- tables d'instantanes sont vides (verifie ci-dessous, sinon arret).
--
-- Pourquoi : le classement officiel de septembre 2026 (classeur) contient
--   * des joueurs sans fiche dans "players" (ex. Mickael Gosch, 32e) ;
--   * des joueurs presents deux fois (ex. Zayan Sookia #401 et #818).
-- Pour le figer TEL QUE DIFFUSE, une ligne peut desormais ne pas avoir de
-- player_id, a condition de porter une note d'identite (sans fiche, doublon de
-- la ligne #...). Unicite conservee : un meme player_id une seule fois.
-- Validation : rangs du classeur conserves (trous admis) pour un import ;
-- pour un calcul moteur, rang exact et fiche joueur obligatoires.
-- ============================================================================

do $$
begin
  if exists (select 1 from public.ranking_snapshots) then
    raise exception 'L1.1 doit etre appliquee avant tout instantane (tables non vides)';
  end if;
end $$;

-- ── Lignes : identifiant technique, fiche joueur facultative avec note ──────
do $$
declare v_fk text;
begin
  select conname into v_fk from pg_constraint
   where conrelid = 'public.ranking_snapshot_results'::regclass and contype = 'f'
     and confrelid = 'public.ranking_snapshot_entries'::regclass;
  if v_fk is not null then
    execute format('alter table public.ranking_snapshot_results drop constraint %I', v_fk);
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ranking_snapshot_entries' and column_name = 'entry_id') then
    alter table public.ranking_snapshot_entries drop constraint ranking_snapshot_entries_pkey;
    alter table public.ranking_snapshot_entries add column entry_id bigint generated always as identity;
    alter table public.ranking_snapshot_entries add constraint ranking_snapshot_entries_pkey primary key (entry_id);
    alter table public.ranking_snapshot_entries add constraint ranking_snapshot_entries_player_uk unique (snapshot_id, player_id);
  end if;
end $$;

alter table public.ranking_snapshot_entries alter column player_id drop not null;
alter table public.ranking_snapshot_entries add column if not exists identity_note text;
alter table public.ranking_snapshot_entries drop constraint if exists ranking_snapshot_entries_identity_ck;
alter table public.ranking_snapshot_entries add constraint ranking_snapshot_entries_identity_ck
  check (player_id is not null or length(trim(coalesce(identity_note, ''))) > 0);

-- ── Points : valeurs exactes du classeur (decimales des ex aequo) ──────────
alter table public.ranking_snapshot_entries alter column points type numeric;
alter table public.ranking_snapshot_results alter column points type numeric;

-- ── Detail : rattache a la ligne (entry_id) ─────────────────────────────────
alter table public.ranking_snapshot_results add column if not exists entry_id bigint;
alter table public.ranking_snapshot_results alter column entry_id set not null;
alter table public.ranking_snapshot_results alter column player_id drop not null;
alter table public.ranking_snapshot_results drop constraint if exists ranking_snapshot_results_entry_fk;
alter table public.ranking_snapshot_results add constraint ranking_snapshot_results_entry_fk
  foreign key (entry_id) references public.ranking_snapshot_entries(entry_id) on delete cascade;
create index if not exists ranking_snapshot_results_entry_idx on public.ranking_snapshot_results (entry_id);

-- ── Somme de controle : lignes sans fiche identifiees par leur nom ──────────
create or replace function public.ranking_snapshot_checksum(p_snapshot_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select encode(sha256(convert_to(coalesce(string_agg(
           coalesce(e.player_id::text, 'NOM:' || e.player_name) || '|' || e.rank || '|' || trim(to_char(e.points, 'FM9999999990.00')) || '|' || e.results_counted,
           ';' order by e.rank, coalesce(e.player_id::text, 'NOM:' || e.player_name), e.points), ''), 'UTF8')), 'hex')
    from public.ranking_snapshot_entries e
   where e.snapshot_id = p_snapshot_id;
$$;

-- ── Validation ──────────────────────────────────────────────────────────────
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
    -- Calcul moteur : rang exact (1,1,3) et fiche joueur obligatoire.
    select count(*) into v_bad from (
      select rank, rank() over (order by points desc) as expected
        from public.ranking_snapshot_entries where snapshot_id = p_snapshot_id
    ) x where x.rank <> x.expected;
    if v_bad > 0 then v_errors := v_errors || format('%s rangs incoherents avec les points', v_bad); end if;
    select count(*) into v_bad from public.ranking_snapshot_entries where snapshot_id = p_snapshot_id and player_id is null;
    if v_bad > 0 then v_errors := v_errors || format('%s lignes sans fiche joueur', v_bad); end if;
  else
    -- Import tel que diffuse : rangs conserves (trous admis), mais plus de points
    -- => rang strictement meilleur, et memes points => meme rang.
    select count(*) into v_bad from public.ranking_snapshot_entries a
      join public.ranking_snapshot_entries b on b.snapshot_id = a.snapshot_id and b.entry_id <> a.entry_id
     where a.snapshot_id = p_snapshot_id
       and ((a.points > b.points and a.rank >= b.rank) or (a.points = b.points and a.rank <> b.rank));
    if v_bad > 0 then v_errors := v_errors || format('%s paires de lignes avec rangs incoherents', v_bad / 2); end if;
    select count(*) into v_bad from public.ranking_snapshot_entries where snapshot_id = p_snapshot_id and player_id is null;
    if v_bad > 0 then v_warnings := v_warnings || format('%s lignes sans fiche joueur (note d''identite renseignee)', v_bad); end if;
  end if;

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
  values (v_actor, 'validate', p_snapshot_id, jsonb_build_object('entries', v_count, 'checksum', v_checksum, 'warnings', v_warnings));
  return jsonb_build_object('ok', true, 'entries', v_count, 'checksum', v_checksum, 'warnings', v_warnings);
end;
$$;

revoke all on function public.validate_ranking_snapshot(uuid) from public, anon;
grant execute on function public.validate_ranking_snapshot(uuid) to authenticated;
grant execute on function public.ranking_snapshot_checksum(uuid) to anon, authenticated;
