-- ============================================================================
-- MPL - LOT L5 (E2) : REVISION V2 du classement officiel MIXTE de SEPTEMBRE 2026
-- ============================================================================
-- Motif : JONATHAN WONG (MPL0001865) a ete omis de la feuille RANKING MIXED du
-- classeur diffuse alors que son resultat officiel existe (M500 Mixte SPARC du
-- 05-06/09/2026, 11e, 90 points, publie sous le nom "Nathan Wong" - meme
-- personne, decision MPL du 24/10/2026).
--
-- La V2 = la V1 a l'identique (memes joueurs, memes points, memes rangs
-- precedents, meme detail) + JONATHAN WONG au 145e rang (90 points, ex aequo
-- avec les 5 joueurs deja a 90). Les 66 joueurs sous 90 points reculent d'un
-- rang (150..209 -> 151..210). AUCUN point modifie. 215 -> 216 lignes.
--
-- Cree la V2 en BROUILLON puis la VALIDE. NE PUBLIE PAS (voir L5_E3).
-- La V1 reste intacte ; a la publication de la V2 elle passera "remplacee"
-- (consultable). Aucune reference de seeding n'utilise le classement Mixte
-- de septembre : aucun seeding approuve n'est affecte.
-- Rejouable : sans effet si une V2 avec ce motif existe deja.
-- Remplacer <ADMIN_ID> par l'uuid du compte admin.
-- ============================================================================
begin;
select set_config('request.jwt.claim.sub', '<ADMIN_ID>', true);
select set_config('request.jwt.claims', '{"sub":"<ADMIN_ID>","role":"authenticated"}', true);

do $$
declare
  c_reason constant text := 'Ajout de JONATHAN WONG (MPL0001865, publie sous le nom Nathan Wong) omis de la feuille RANKING MIXED : M500 Mixte SPARC 06/09/2026, 11e, 90 points (document officiel). Aucun point modifie ; 66 joueurs reculent d''un rang. Decision MPL du 24/10/2026.';
  c_jonathan constant uuid := 'b3ec0a65-de8f-4f45-9e57-35590e459573';
  v1 public.ranking_snapshots;
  v_v2 uuid;
  v_res jsonb;
  e record;
  v_new bigint;
  v_n integer;
begin
  select * into v1 from public.ranking_snapshots
   where division = 'mixed' and reference_month = date '2026-09-01' and version = 1;
  if not found then raise exception 'Mixte septembre v1 introuvable'; end if;
  if exists (select 1 from public.ranking_snapshots where division = 'mixed' and reference_month = date '2026-09-01' and version >= 2 and revision_reason = c_reason) then
    raise notice 'V2 deja creee avec ce motif : rien a faire';
    return;
  end if;
  if v1.status <> 'published' or public.ranking_snapshot_checksum(v1.id) <> v1.checksum then
    raise exception 'La V1 n''est plus publiee ou son contenu a change : arret';
  end if;
  if exists (select 1 from public.ranking_snapshot_entries where snapshot_id = v1.id and player_id = c_jonathan) then
    raise exception 'Jonathan Wong figure deja dans la V1 : arret';
  end if;

  v_v2 := public.create_ranking_snapshot_draft(
    'mixed', v1.reference_month, v1.applicable_month, v1.cutoff_date, v1.window_start, v1.window_end, v1.rules,
    'workbook_import', v1.source_file || ' + correction documentee (L5)', v1.engine_version,
    v1.notes || E'\n\nREVISION V2 (24/10/2026) : ' || c_reason,
    v1.id, c_reason);

  -- Lignes de la V1 recopiees ; rang + 1 sous 90 points.
  create temporary table tmp_entry_map (old_id bigint primary key, new_id bigint) on commit drop;
  for e in select * from public.ranking_snapshot_entries where snapshot_id = v1.id order by entry_id loop
    insert into public.ranking_snapshot_entries (snapshot_id, player_id, player_name, rank, previous_rank, points, results_counted, results_eligible, identity_note)
    values (v_v2, e.player_id, e.player_name, case when e.points < 90 then e.rank + 1 else e.rank end, e.previous_rank, e.points, e.results_counted, e.results_eligible, e.identity_note)
    returning entry_id into v_new;
    insert into tmp_entry_map values (e.entry_id, v_new);
  end loop;
  insert into public.ranking_snapshot_results (snapshot_id, entry_id, player_id, result_id, tournament_id, event_name, event_date, category, position, points, status, reason)
  select v_v2, m.new_id, r.player_id, r.result_id, r.tournament_id, r.event_name, r.event_date, r.category, r.position, r.points, r.status, r.reason
    from public.ranking_snapshot_results r join tmp_entry_map m on m.old_id = r.entry_id
   where r.snapshot_id = v1.id;

  -- Ligne ajoutee : Jonathan Wong, 145e, 90 points (1 resultat retenu sur 1).
  insert into public.ranking_snapshot_entries (snapshot_id, player_id, player_name, rank, previous_rank, points, results_counted, results_eligible, identity_note)
  values (v_v2, c_jonathan, 'JONATHAN WONG', 145, null, 90, 1, 1,
          'Ajoute en V2 : omis du classeur diffuse ; resultat publie sous le nom Nathan Wong (meme personne, decision MPL du 24/10/2026)')
  returning entry_id into v_new;
  insert into public.ranking_snapshot_results (snapshot_id, entry_id, player_id, tournament_id, event_name, event_date, category, position, points, status, reason)
  values (v_v2, v_new, c_jonathan, 't160', 'M500 SPARC - SEP 26', date '2026-09-06', 'M500', '11', 90, 'counted', 'Top 8 (#1)');

  select count(*) into v_n from public.ranking_snapshot_entries where snapshot_id = v_v2;
  if v_n <> v1.entries_count + 1 then raise exception 'V2 : % lignes au lieu de %', v_n, v1.entries_count + 1; end if;

  v_res := public.validate_ranking_snapshot(v_v2);
  if not (v_res->>'ok')::boolean then raise exception 'Validation de la V2 refusee : %', v_res; end if;
  raise notice 'Mixte septembre V2 % validee : %', v_v2, v_res;
  drop table tmp_entry_map;
end $$;

-- Controle : V1 publiee intacte, V2 validee ; Jonathan Wong 145e ; joueurs a 90 points.
select version, status, entries_count, left(checksum, 16) as checksum, public.ranking_snapshot_checksum(id) = checksum as checksum_ok
  from public.ranking_snapshots where division = 'mixed' and reference_month = date '2026-09-01' order by version;
select s.version, e.rank, e.player_name, e.points
  from public.ranking_snapshot_entries e join public.ranking_snapshots s on s.id = e.snapshot_id
 where s.division = 'mixed' and s.reference_month = date '2026-09-01' and e.points between 85 and 95
 order by s.version, e.rank, e.player_name;
commit;
