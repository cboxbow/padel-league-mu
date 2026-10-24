/* eslint-disable no-console */
// Lot L5 : genere les scripts SQL proposes (NON executes) a partir de l'analyse
// de la phase A (tournois du 21/10 au 20/11/2026) :
//   L5_A_propositions_references.sql   : propose_tournament_seeding pour les tournois eligibles
//                                         (aucune approbation, rejouable) ;
//   L5_B_retour_arriere_archives.sql   : retire / supprime les archives juin-aout importees ;
//   L5_C_periode_octobre_provisoire.sql: periode du classement d'octobre au statut PROVISOIRE.
//
//   PHASE_A=<json de la phase A> ADMIN_ID=<uuid> OUT_DIR=<dossier> node scripts/build-l5-scripts.cjs
const fs = require('node:fs');
const path = require('node:path');

const env = process.env;
if (!env.PHASE_A || !env.OUT_DIR || !/^[0-9a-f-]{36}$/.test(env.ADMIN_ID || '')) {
  console.error('PHASE_A, ADMIN_ID et OUT_DIR sont requis.');
  process.exit(1);
}
const rows = JSON.parse(fs.readFileSync(env.PHASE_A, 'utf8'));
const claims = `select set_config('request.jwt.claim.sub', '${env.ADMIN_ID}', true);
select set_config('request.jwt.claims', '${JSON.stringify({ sub: env.ADMIN_ID, role: 'authenticated' })}', true);`;
fs.mkdirSync(env.OUT_DIR, { recursive: true });

const eligible = rows.filter((r) => /^Proposer/.test(r.action_proposee));
const review = rows.filter((r) => /^Revue/.test(r.action_proposee));
fs.writeFileSync(path.join(env.OUT_DIR, 'L5_A_propositions_references.sql'), `-- ============================================================================
-- MPL - LOT L5 (A) : PROPOSITION des references de seeding (sans approbation)
-- ============================================================================
-- ${eligible.length} tournois commencant du 25/10 au 15/11/2026 -> classement de SEPTEMBRE 2026 v1
-- de leur division (periode 21/10 -> 20/11). Statut cree : "proposed".
-- N'APPROUVE RIEN : l'approbation reste manuelle (page admin "References de
-- seeding" ou approve_tournament_seeding avec phrase de confirmation).
-- Rejouable : une reference deja proposee est simplement reproposee ; une
-- reference APPROUVEE n'est jamais touchee (la fonction refuse).
-- Exclus (revue manuelle) : ${review.map((r) => r.tournoi_id).join(', ')} (tournois du 24/10 deja commences).
-- Exclus (deja approuves) : ${rows.filter((r) => r.approbation === 'approved').map((r) => r.tournoi_id).join(', ')}.
-- ============================================================================
begin;
${claims}

do $$
declare
  t record;
  v_res jsonb;
begin
  for t in select * from (values
${eligible.map((r) => `    ('${r.tournoi_id}', '${r.division}')`).join(',\n')}
  ) as x(tournament_id, division)
  loop
    if exists (select 1 from public.tournament_seeding_references r
                where r.tournament_id = t.tournament_id and r.division = t.division and r.approval_status = 'approved') then
      raise notice '% / % : deja approuve, non modifie', t.tournament_id, t.division;
      continue;
    end if;
    v_res := public.propose_tournament_seeding(t.tournament_id, t.division);
    if v_res->>'status' <> 'proposed' or v_res->>'expected_reference_month' <> '2026-09-01' then
      raise exception '% / % : proposition inattendue %', t.tournament_id, t.division, v_res;
    end if;
  end loop;
end $$;

select tournament_id, division, approval_status, snapshot_version, to_char(expected_reference_month, 'YYYY-MM') as classement, validity_start, validity_end
  from public.tournament_seeding_references order by reference_date, tournament_id;
commit;
`);

fs.writeFileSync(path.join(env.OUT_DIR, 'L5_B_retour_arriere_archives.sql'), `-- ============================================================================
-- MPL - LOT L5 (B) : RETOUR ARRIERE des archives juin / juillet / aout 2026
-- ============================================================================
-- A n'utiliser QUE si les archives importees doivent etre retirees.
--   - valide           -> repasse en BROUILLON (unvalidate) : invisible du public, inutilisable pour
--                          le seeding ; conserve pour le journal d'audit (ajout seul, aucune suppression) ;
--   - brouillon        -> laisse tel quel ;
--   - publie           -> RETIRE (withdraw, motif journalise ; le contenu reste consultable
--                          par les administrateurs, jamais supprime) ;
--   - un classement utilise par une reference de seeding n'est PAS retire (la fonction refuse).
-- Ne touche qu'aux classements importes d'un classeur (source workbook_import)
-- de juin, juillet et aout 2026. Septembre n'est jamais concerne.
-- ============================================================================
begin;
${claims}

do $$
declare s record;
begin
  for s in select id, division, reference_month, status from public.ranking_snapshots
            where source = 'workbook_import' and reference_month in (date '2026-06-01', date '2026-07-01', date '2026-08-01')
            order by reference_month, division
  loop
    if s.status = 'published' then
      perform public.withdraw_ranking_snapshot(s.id, 'Retour arriere L5 : archive retiree sur decision MPL');
    elsif s.status = 'validated' then
      perform public.unvalidate_ranking_snapshot(s.id, 'Retour arriere L5');
    end if;
    raise notice '% % : % traite', s.division, to_char(s.reference_month, 'YYYY-MM'), s.status;
  end loop;
end $$;

select division, to_char(reference_month, 'YYYY-MM') as mois, version, status from public.ranking_snapshots order by reference_month, division;
commit;
`);

fs.writeFileSync(path.join(env.OUT_DIR, 'L5_C_periode_octobre_provisoire.sql'), `-- ============================================================================
-- MPL - LOT L5 (C) : periode du classement d'OCTOBRE 2026, statut PROVISOIRE
-- ============================================================================
-- Proposition (cycle 21 -> 20) : tournois commencant du 21/11/2026 au 20/12/2026,
-- inscriptions ouvertes en novembre 2026. Au statut "provisional", elle est
-- visible mais NE SERT PAS au seeding et la publication du classement d'octobre
-- reste refusee. Une fois la periode confirmee par la MPL, rejouer avec 'confirmed'.
-- ============================================================================
begin;
${claims}
select public.set_ranking_validity_period(date '2026-10-01', date '2026-11-21', date '2026-12-20', date '2026-11-01', 'provisional',
  'Proposition L5 du 24/10/2026 (cycle 21 -> 20), en attente de confirmation MPL / MSRA');
select to_char(reference_month, 'YYYY-MM') as classement, validity_start, validity_end, status, source from public.ranking_validity_periods order by reference_month;
commit;
`);
console.log(`propositions : ${eligible.length} ; revue manuelle : ${review.length} ; fichiers ecrits dans ${env.OUT_DIR}`);
