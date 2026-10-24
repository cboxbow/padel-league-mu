# MPL : bilan et sauvegarde au 24/10/2026

Point de reprise pour continuer depuis un autre poste. Ce fichier décrit ce qui a été fait, l'état réel de la production au 24/10/2026 (contrôlé à la fin de la session), comment travailler et ce qui reste à faire.

> Aucun secret dans ce fichier. La clé `anon` Supabase est publique (elle est dans le site). La clé **service role** ne doit jamais être écrite dans un fichier ; elle a été collée deux fois dans la conversation : **à changer dans Supabase** (voir « À faire »).

---

## 1. État général (contrôlé le 24/10/2026)

| Élément | État |
|---|---|
| Site officiel https://padelleague.mu | En ligne (200). Version du commit `ace26d1`, déployée automatiquement. |
| Page Classement de seeding `#/classements/seeding` | En ligne : septembre 2026 (H 971, D 324, X 215), tournois d'octobre listés. |
| Vercel `padel-league-mu` (https://padel-league-mu-eta.vercel.app) | En ligne, connecté à Supabase (variables ajoutées le 24/10). |
| Outil Moka Rangers M500 (https://moka.mauritiuspadel.click) | En ligne. Seeding = classement officiel de septembre 2026. |
| Classements en direct (table `rankings`) | H 964, D 324, X 215, J 34. Calcul au 24/10/2026. |
| Classement officiel figé de septembre 2026 | Publié, verrouillé (H v1, D v1, X v1), sert aux tournois d'octobre. |
| Écriture publique sur les classements | Bloquée (réponse 401), correctif de sécurité en place. |
| Déploiements GitHub → cPanel | 4 derniers : tous réussis. |
| Tests du moteur de classement | 21/21 OK. |

---

## 2. Où sont les choses

### Site
- **Code local** : `PADEL LEAGUE/02 TOURNOIS/2026/DESIGN PADEL LEAGUE/WEB OFFICIAL MPL/galerie_rls_401_fix/galerie_rls_401_fix` (Vite + React + TypeScript). **Ce dossier n'est pas un dépôt git.**
- **Dépôt GitHub** : https://github.com/cboxbow/padel-league-mu, branche `main`.
- **Hébergement** : padelleague.mu est sur **cPanel chez HOSTIN** (serveur Stack Harbor, 205.204.80.149), pas sur Vercel.
- **Supabase** : projet `ooeusylgxnncyuluakwa`.

### Déployer le site (plus besoin de zip)
Un push sur `main` déclenche `.github/workflows/deploy-cpanel.yml` : build public + admin, puis envoi FTPS sur cPanel, en environ 1 minute.
Suivi : https://github.com/cboxbow/padel-league-mu/actions

Comme le dossier local n'est pas un dépôt git :
1. cloner le dépôt (`git clone https://github.com/cboxbow/padel-league-mu.git`) ;
2. copier les fichiers modifiés depuis le dossier local ;
3. comparer (`git diff`, en ignorant les fins de ligne CRLF/LF) ;
4. commit (auteur `cboxbow`) puis `git push origin main`.

Sur le poste desktop, le plus simple est de travailler directement dans un clone du dépôt.

Les 4 projets Vercel (`padel-league-mu`, `-3r56`, `-4vaz`, `-git-push`) se reconstruisent aussi à chaque push, mais aucun n'est relié au domaine. Seul `padel-league-mu` a les variables Supabase.

### Outil Moka Rangers M500
- Dépôt https://github.com/cboxbow/mpl-m500-moka-rangers-2026 ; un push sur `main` déploie moka.mauritiuspadel.click.
- Dossier local : `PADEL LEAGUE/02 TOURNOIS/2026/M 500 MOKA RANGERS 2026/mpl-m500-moka-rangers`.
- Commandes : `npm run teams`, `npm run check`. Rangs : `scripts/moka-entries.mjs`.

### Livrables de la session
- `03 CLASSEMENTS & RESULTATS/2026/AUDIT RANKING 24 OCT 2026/` : rapport d'audit, classeur Excel (13 onglets), corrections SQL, **sauvegardes de production** (`SAUVEGARDE_PRODUCTION_2026-10-24`, `SAUVEGARDE_AVANT_CORRECTIONS`).
- `03 CLASSEMENTS & RESULTATS/2026/AUDIT SEPTEMBRE 2026 ET SEEDING/` : audit de septembre, conception du seeding mensuel, et `L2 GEL SEP 2026/` (scripts du gel de septembre).
- `03 CLASSEMENTS & RESULTATS/2026/L3 CLASSEMENT MENSUEL/` : migration L3, dates de finale, aperçu provisoire d'octobre.

---

## 3. Ce qui a été fait, dans l'ordre

### 3.1 Site : corrections de départ
- `vercel.json` : build `npm run build:public` (au lieu de `npm run build`).
- **Fiche joueur (Classements)** : les détails se chargent en parallèle, et un ancien chargement ne peut plus écraser le joueur affiché.
- **Magaly Schaffo** : il manquait 130 points. Le recalcul supprimait à tort sa 2e victoire au M500 RM Hennessy (12/12/2025 et 20/06/2026, mêmes points). Le dédoublonnage compare maintenant les dates (écart de 3 jours max). Magaly 1re Dames à 4 900 points, Marinne Giraud 2e à 4 700.

### 3.2 Audit complet des classements (24/10)
- Rapport : `AUDIT RANKING 24 OCT 2026/RAPPORT_AUDIT_RANKINGS_2026-10-24.md`.
- Corrections appliquées en base (après accord), puis **Hommes et Dames republiés au 24/10** :
  - Toinel / Selig retirées du tableau Hommes (résultat Dames) ;
  - résultat de Nicolas Rey (2) remis sur sa fiche (homonyme) ;
  - Christopher Sinna à la place de David Paucot (M25 Labourdonnais, juin) ;
  - Laura Gaspard à la place de Laura Payet (M25 Club House Dames, janvier) ;
  - Anna Zhivilo et Géraldine Gébert ramenées à 6 points (M25 RM GB Dames, avril) ;
  - ligne Laura Gaspard en double supprimée ;
  - 27 résultats saisis sous une autre orthographe rattachés à la bonne fiche.
- Résultat : **16 doublons « fantômes » supprimés**, Keith Lioong à 449 points. Le Mixte garde sa publication du 22/10, déjà conforme.
- Retour arrière possible : `scripts/restore-rankings-from-backup.cjs` (confirmation `RESTAURER`) avec la sauvegarde.

### 3.3 Moteur de classement
- `scripts/lib/mpl-ranking-engine.cjs` : moteur pur et testé (fenêtre, 8 meilleurs résultats, ex æquo arrondis à l'entier supérieur, rangs 1-1-3, détection des tableaux importés deux fois).
- `scripts/recalculate-rankings-from-results.cjs` (script de production) : simulation `DRY_RUN=1`, choix des divisions `RANKING_DIVISIONS`, mode mensuel `RANKING_MONTH=AAAA-MM`.
- Tests : `node --test scripts/test-mpl-ranking-engine.cjs` (21/21).
- Simulation hors ligne : `scripts/sim/` (faux client Supabase, variable `SIM_DIR`).
- Panneau admin : `ResultsAdminPage.tsx` écarte aussi les tableaux en double ; `ExportsPage.tsx` exporte le `player_id` dans un ordre stable.

### 3.4 Sécurité
- Faille : le public (clé anon) pouvait écrire dans les tables de classement.
- `security_fix_rankings_write_policies.sql` **exécuté** : lecture publique conservée, écriture réservée aux admins connectés. Vérifié (écriture anonyme refusée).

### 3.5 Classements officiels mensuels figés (lots L1 à L3)
**L1 / L1.1 (en production)** : tables `ranking_snapshots`, `ranking_snapshot_entries`, `ranking_snapshot_results`, `tournament_seeding_references`, `ranking_audit_log`.
- Cycle : brouillon → validé → publié (→ remplacé / retiré). Une fois publié : **verrouillé**, même pour le service role. Toute correction = nouvelle version avec motif obligatoire.
- Publication avec phrase de confirmation (`PUBLIER MEN 2026-11`), somme de contrôle SHA-256, journal d'audit.
- Fonctions : `create_ranking_snapshot_draft`, `validate_ranking_snapshot`, `publish_ranking_snapshot`.
- Tests : `scripts/test-ranking-snapshots-l1.cjs` (44/44, sur copie PGlite).

**L2 (en production)** : septembre 2026 figé **tel que diffusé** (classeur `Padel League - RANKINGS - SEP 26.xlsx`), anomalies documentées en note.
- H 971, D 324, X 215 lignes, publiés et verrouillés le 23/10. Référence des tournois d'**octobre 2026**.
- Moka Rangers M500 (t263h, t264f) rattaché à septembre (`L2_3_...sql`).
- Outil Moka mis à jour avec les rangs de septembre (commits `7566de4`, `163e03d`), Amaury Desvaux #341 confirmé.

**L3 (en production)** : règle officielle décidée le 24/10/2026 :
- **date de référence d'un tournoi = jour de la finale** (date de fin) ;
- **classement du mois M** = tournois dont la finale a eu lieu du **1er jour du mois M-11 au dernier jour du mois M** (12 mois calendaires), 8 meilleurs résultats ;
- il sert aux **tournois du mois M+1**.
- Migration `ranking_snapshots_l3_migration.sql` exécutée : colonnes `tournaments.end_date` et `historical_tournament_results.event_end_date`, règle dans `ranking_settings`, somme de contrôle v2 (septembre garde sa v1, toujours exacte).
- `ranking_l3_dates_de_fin.sql` exécuté :
  - M1000 Urban BR (commencé le 31/10/2025) : finale au **02/11/2025**, 73 lignes. Il compte donc jusqu'au classement d'octobre 2026 inclus. **Date à confirmer.**
  - Tournois du 31/10/2026 (Moka M500, RM Port Chambly M250, Caña Beau Plan M50) : finale le **31/10/2026**, ils comptent pour octobre.
- Générateur : `scripts/generate-monthly-snapshot.cjs` (n'écrit rien en base, produit un aperçu Excel et les scripts SQL).
- Répétition complète : `scripts/test-ranking-l3.cjs` (23/23).

### 3.6 Page publique « Classement de seeding » (lot L5)
- `src/pages/ClassementSeeding.tsx`, route `#/classements/seeding`.
- Affiche les classements publiés : mois, divisions, fenêtre, date de publication, version, motif de révision, évolution par rapport au mois précédent, détail des résultats retenus par joueur, recherche.
- Liste **tous les tournois du mois** concernés (19 tournois Hommes en octobre), annulés exclus.
- Réessaie automatiquement en cas d'`AbortError` Supabase, avec un message clair et un bouton Réessayer.
- Liens ajoutés : bascule « Classement en direct / Classement de seeding » et note sur la page Classements, bouton dans le Calendrier.
- **Points arrondis à l'entier supérieur** sur les pages Seeding, Classements et Espace joueur.

### 3.7 Divers
- Club **I PADEL BY RM Henessy** : région passée de NORD à **CENTRE** (`fix_club_hennessy_region_centre.sql`). Le nom reste écrit « Henessy » (choix confirmé).
- Accès bloqué à padelleague.mu depuis l'IP `102.115.119.13` : pare-feu de l'hébergeur. Résolu en changeant d'IP (nouvelle IP `105.235.147.225`).

### Commits poussés sur `cboxbow/padel-league-mu`
| Commit | Contenu |
|---|---|
| `b641c45` | Page de seeding, moteur, générateur, tests, migrations, arrondi des points, `vercel.json` |
| `e530ccc` | Page de seeding : réessai sur AbortError, message + bouton Réessayer |
| `ace26d1` | Page de seeding : tous les tournois du mois |

---

## 4. Procédure mensuelle : classement officiel de seeding

Exemple pour **octobre 2026** (tournois de novembre), à faire **après la saisie des résultats du 31/10** :

1. Vérifier que tous les résultats du mois sont saisis, et que chaque tournoi sur plusieurs jours a sa `end_date` (jour de la finale).
2. Générer, sans rien écrire en base :
   ```bash
   RANKING_MONTH=2026-10 ADMIN_ID=<uuid du compte admin> OUT_DIR=<dossier de sortie> \
   VITE_SUPABASE_URL=https://ooeusylgxnncyuluakwa.supabase.co VITE_SUPABASE_ANON_KEY=<clé anon> \
   node scripts/generate-monthly-snapshot.cjs
   ```
   Le script produit `APERCU_2026_10.xlsx` (classement, mouvements, contrôles), `2026_10_1a/1b/1c_import_validation_*.sql` et `2026_10_2_publication.sql`.
3. Relire l'aperçu, en particulier l'onglet CONTROLES (dates de finale à vérifier).
4. Dans l'éditeur SQL de Supabase : exécuter les scripts `1a`, `1b`, `1c` (import et validation), vérifier, puis `2_publication`.
5. La page de seeding affiche le nouveau mois automatiquement, sans redéploiement.

Pour corriger un mois déjà publié : relancer avec `REVISION_REASON="motif"`. Cela crée une v2, et la v1 reste consultable.

---

## 5. À faire / décisions en attente

### Sécurité
- [ ] **Changer la clé service role Supabase** (collée deux fois dans la conversation).
- [ ] Demander à HOSTIN de débloquer l'IP `102.115.119.13` et de la mettre en liste blanche.
- [ ] Vérifier qu'aucune messagerie @padelleague.mu ne tourne avec un ancien mot de passe (cause fréquente de blocage).

### Prochaine échéance
- [ ] **Classement officiel d'octobre 2026**, après les tournois du 31/10 (procédure ci-dessus). Aperçu provisoire : `L3 CLASSEMENT MENSUEL/APERCU OCT 2026 (provisoire au 24-10)/`.
- [ ] Confirmer la date de finale du M1000 Urban BR (02/11/2025 retenu).

### Données joueurs, mises de côté (« plus tard »)
- [ ] **Stéphane Payet** : les fiches MPL0001314 et MPL0002062 sont-elles la même personne ? (25 + 18 points sur deux lignes)
- [ ] **Amaury Desvaux** : rattacher le résultat à la fiche MPL0000796 ou MPL0000514 ?
- [ ] **Oudrhiri / Deepoo-Payet** : équipe absente du PDF officiel du M25 RM GB Dames d'avril. Faut-il retirer leurs 7 points ?

### Règles à trancher par la Commission
- [ ] La page Ligue annonce encore « 10 meilleurs scores » : la règle appliquée est **8**.
- [ ] Règle des ex æquo dans un tournoi (pas uniforme dans le classeur).
- [ ] Femmes jouant des tableaux Hommes : faut-il les classer aussi chez les Hommes ? (Magaly Schaffo y est 215e)
- [ ] 28 tournois marqués « terminé » sans aucun résultat : annulés, ou résultats à retrouver ?
- [ ] Publication à deux personnes (validation ≠ publication) : réglage `require_two_person_publication`, aujourd'hui désactivé.
- [ ] Barème M500/M1000 : +10 / +20 points par rapport au fichier « Points Allocation » (bonus de poule non écrit ?).

### Lots restants
- [ ] **L4** : écran admin pour générer, valider et publier les classements mensuels sans passer par l'éditeur SQL.
- [ ] **L6** : relier automatiquement les têtes de série de chaque tournoi au classement officiel du mois précédent (`tournament_seeding_references`).
- [ ] Éventuellement : ajouter les variables Supabase aux 3 autres projets Vercel, ou les supprimer s'ils ne servent plus.

---

## 6. Fichiers clés du code (dossier du site)

| Fichier | Rôle |
|---|---|
| `src/pages/ClassementSeeding.tsx` | Page publique du classement de seeding |
| `src/pages/Classements.tsx` | Classement en direct + fiche joueur |
| `src/pages/Calendrier.tsx` | Calendrier (lien vers le seeding) |
| `scripts/recalculate-rankings-from-results.cjs` | Recalcul et publication du classement en direct |
| `scripts/lib/mpl-ranking-engine.cjs` | Moteur de calcul pur |
| `scripts/generate-monthly-snapshot.cjs` | Génération du classement officiel mensuel |
| `scripts/test-*.cjs` | Tests (moteur, L1, L2, L3) |
| `scripts/restore-rankings-from-backup.cjs` | Retour arrière des classements en direct |
| `ranking_snapshots_l1_migration.sql`, `..._l1_1_...`, `..._l3_...` | Migrations (déjà en production) |
| `security_fix_rankings_write_policies.sql` | Correctif de sécurité (déjà en production) |
| `.github/workflows/deploy-cpanel.yml` (dans le dépôt) | Déploiement automatique sur cPanel |
