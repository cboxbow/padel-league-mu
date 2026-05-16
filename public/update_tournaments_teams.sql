-- =====================================================
-- MPL 2026 - Mise à jour tournois
-- 1) teams_registered basé sur résultats réels
-- 2) Status completed pour tous tournois joués
-- Date: 2026-03-24
-- =====================================================

-- ─── 1. Nombre d'équipes inscrites (depuis résultats) ────────────────────────
UPDATE tournaments SET teams_registered = 8 WHERE id = 't001h'; -- M50 Caña Beau Plan (Hommes)
UPDATE tournaments SET teams_registered = 8 WHERE id = 't004'; -- M250 Mapou
UPDATE tournaments SET teams_registered = 12 WHERE id = 't005'; -- M25 Mont Choisy Golf
UPDATE tournaments SET teams_registered = 9 WHERE id = 't006h'; -- M25 Energia Pte aux Canonniers (Hommes)
UPDATE tournaments SET teams_registered = 9 WHERE id = 't010h'; -- M50 Azuri (Hommes)
UPDATE tournaments SET teams_registered = 11 WHERE id = 't010f'; -- M50 Azuri (Dames)
UPDATE tournaments SET teams_registered = 8 WHERE id = 't011h'; -- M25 Club House Black River (Hommes)
UPDATE tournaments SET teams_registered = 8 WHERE id = 't011f'; -- M25 Club House Black River (Dames)
UPDATE tournaments SET teams_registered = 10 WHERE id = 't012'; -- Mixed Open Azuri
UPDATE tournaments SET teams_registered = 16 WHERE id = 't014'; -- M50 Urban Sport Grand Baie
UPDATE tournaments SET teams_registered = 8 WHERE id = 't017h'; -- M50 Albion (Hommes)
UPDATE tournaments SET teams_registered = 10 WHERE id = 't018h'; -- M100 Port Chambly (Hommes)
UPDATE tournaments SET teams_registered = 10 WHERE id = 't018f'; -- M100 Port Chambly (Dames)
UPDATE tournaments SET teams_registered = 8 WHERE id = 't022f'; -- M50 Energia Pte aux Canonniers (Dames)
UPDATE tournaments SET teams_registered = 14 WHERE id = 't025'; -- M100 Urban Grand Baie
UPDATE tournaments SET teams_registered = 8 WHERE id = 't026h'; -- M500 Mapou (Hommes)
UPDATE tournaments SET teams_registered = 9 WHERE id = 't026f'; -- M500 Mapou (Dames)
UPDATE tournaments SET teams_registered = 8 WHERE id = 't029h'; -- M100 Azuri (Hommes)
UPDATE tournaments SET teams_registered = 8 WHERE id = 't029f'; -- M100 Azuri (Dames)

-- ─── 2. Marquer completed tous tournois joués ≤ 2026-03-24 ────────────────────
UPDATE tournaments 
SET status = 'completed' 
WHERE tournament_date <= '2026-03-24' 
  AND status IN ('open', 'upcoming');

-- ─── 3. Vérification ──────────────────────────────────────────────────────────
SELECT id, name, tournament_date, status, teams_registered, max_teams
FROM tournaments
WHERE tournament_date <= '2026-03-24'
ORDER BY tournament_date, id;
