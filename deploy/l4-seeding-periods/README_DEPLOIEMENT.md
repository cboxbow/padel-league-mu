# Lot L4 : périodes de validité 21 → 20 et références de seeding

Branche : `dev/seeding-periods-21-20`. **Rien n'est déployé en production** tant que l'administrateur MPL ne l'a pas autorisé.

## Ce que fait L4

- **Classement applicable à un tournoi :** celui dont la période de validité contient la **date de début** du tournoi. Le même classement vaut pour tout le tournoi.
- **Périodes explicites** (`ranking_validity_periods`), confirmées pour juin, juillet, août et septembre 2026.
  - Le cycle 21 → 20 sert uniquement à *proposer* une période « provisoire ».
  - Le seeding n'utilise jamais une période non confirmée.
- **Publication d'un classement :** refusée sans période confirmée. La période est **figée** sur le classement au moment de la publication.
- **Références de seeding :**
  - circuit proposer → approuver (phrase de confirmation) → horodater la génération du seeding ;
  - une fois approuvée, la version du classement est figée ;
  - si le classement attendu n'est pas publié, la référence reste « en attente » et le seeding final est bloqué ;
  - un cas exceptionnel peut être approuvé avec un motif, journalisé.
- **Le classement en direct n'est jamais substitué.**
- **Archives officielles** juin, juillet et août 2026, importées telles que diffusées (contrôles d'intégrité, aucune reconstruction).

## Fichiers

| Fichier | Rôle |
|---|---|
| `ranking_snapshots_l4_validity_periods.sql` (racine) | Migration additive et rejouable |
| `deploy/l4-seeding-periods/L4_0_controles_avant_apres.sql` | Contrôles en lecture seule, avant et après |
| `deploy/l4-seeding-periods/L4_2_periode_septembre_2026.sql` | Fige la période 21/10 → 20/11 sur septembre 2026 (contenu inchangé) |
| `L4_3_<MOIS>_<DIV>_import_validation.sql` + `L4_4_<MOIS>_publication.sql` | Archives juin, juillet, août. Générés par `scripts/build-workbook-snapshot-import.cjs` ; non versionnés (fichiers de données), fournis dans le dossier de livraison |
| `deploy/l4-seeding-periods/L4_9_rollback.sql` | Retour arrière, généré par `scripts/build-l4-rollback.cjs` |
| `scripts/backup-ranking-tables.cjs` | Sauvegarde JSON des tables (lecture seule) |
| `scripts/test-ranking-l4.cjs` | Répétition complète sur copie PGlite (61 contrôles) |

## Tests (à relancer avant autorisation)

```bash
node --test scripts/test-mpl-ranking-engine.cjs
PGLITE_PATH=<pglite> SNAPSHOT_DIR=<copie json> WORKBOOK=<SEP 26.xlsx> node scripts/test-ranking-snapshots-l1.cjs
PGLITE_PATH=<pglite> SNAPSHOT_DIR=<copie json> L2_DIR=<L2 GEL SEP 2026> node scripts/test-sep26-import-l2.cjs
PGLITE_PATH=<pglite> SNAPSHOT_DIR=<copie json> L2_DIR=<L2 GEL SEP 2026> GEN_DIR=<sortie L3> node scripts/test-ranking-l3.cjs
PGLITE_PATH=<pglite> SNAPSHOT_DIR=<copie json> L2_DIR=<L2 GEL SEP 2026> IMPORTS_DIR=<L4_3/L4_4> OCT_DIR=<sortie L3> node scripts/test-ranking-l4.cjs
```

Résultats au 24/10/2026 : 21/21, 44/44, 23/23, 23/23, **61/61**.

## Liste de déploiement (après autorisation écrite)

1. [ ] **Sauvegarde.**
   - Vérifier la dernière sauvegarde Supabase (Database → Backups) et la télécharger.
   - Lancer `scripts/backup-ranking-tables.cjs`, avec la clé de service en variable d'environnement.
2. [ ] **État « avant ».** Exécuter `L4_0_controles_avant_apres.sql` (requêtes 1 à 3) et conserver le résultat.
3. [ ] **Migration.** Exécuter `ranking_snapshots_l4_validity_periods.sql`.
4. [ ] **Période de septembre.** Exécuter `L4_2_periode_septembre_2026.sql`, avec `<ADMIN_ID>` remplacé.
5. [ ] **État « après ».** Exécuter `L4_0_controles_avant_apres.sql`, requêtes 1 à 7. Les requêtes 1 à 3 doivent être **identiques** à l'état « avant ». Pour Moka : `approved`, v1, période du 21/10 au 20/11.
6. [ ] **Archives (autorisation séparée).**
   - Relire `L4_3_*_verification.json`.
   - Exécuter les 9 scripts `L4_3_*` puis les 3 scripts `L4_4_*`.
   - Contrôler les nombres de lignes : juin 895/319/213, juillet 928/324/224, août 940/318/219.
7. [ ] **Code.** Fusionner `dev/seeding-periods-21-20` dans `main`. Le déploiement automatique se lance (GitHub Actions → cPanel, et Vercel).
   - **Toujours APRÈS l'étape 3**, sinon la page affiche « période non confirmée ».
8. [ ] **Vérification en ligne.**
   - `#/classements/seeding` : « Valable pour les tournois commençant du 21/10/2026 au 20/11/2026 » ; liste des tournois du 21/10 au 20/11 ; Moka « APPROUVÉ V1 ».
   - Admin : page « Références de seeding ».
9. [ ] **Avant le 21/11/2026.** Saisir la période du classement d'octobre une fois confirmée (`set_ranking_validity_period`), puis publier le classement d'octobre.

## Retour arrière

- **Code :** annuler le commit de fusion sur `main` (`git revert`) et pousser. Le redéploiement est automatique.
- **Base :** exécuter `L4_9_rollback.sql`.
  - Les fonctions L1/L3 sont remises en place.
  - Les références non approuvées sont retirées ; les références approuvées (dont Moka) sont conservées.
  - Les colonnes, la table et la vue L4 sont supprimées.
  - Les classements publiés ne sont jamais modifiés. Les archives publiées restent : pour les retirer, utiliser `withdraw_ranking_snapshot(id, motif)`.
- Le rollback a été testé sur la copie PGlite : contenu intact, règle L1 restaurée, ré-application de L4 possible.
