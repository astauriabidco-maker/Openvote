-- ============================================================
-- 017 : Table schema_migrations pour tracking fail-fast
-- ============================================================
--
-- But : passer d'un runner "warning-and-continues" à un runner
-- "skip-if-applied + log.Fatalf on real error". Sans cette table,
-- un deuxième démarrage du backend échoue parce que les migrations
-- 002/003/005/etc. contiennent des INSERT non-idempotents.
--
-- Pattern classique (Rails/Django/Flyway) :
--   1. CREATE TABLE schema_migrations si absente
--   2. Pour chaque migration NNN :
--      a. SELECT 1 FROM schema_migrations WHERE version='NNN_xxx'
--         → si présent, on skip
--      b. sinon, BEGIN + EXEC migration + INSERT schema_migrations
--         + COMMIT
--   3. Toute erreur dans l'exec ou l'insert ⇒ log.Fatalf
--
-- Pourquoi pas IF NOT EXISTS sur les inserts 002-016 ?
--   Certains inserts ont des ID en dur ; les re-runs casseraient
--   même avec ON CONFLICT DO NOTHING si l'ID diffère. Plus simple
--   de tracker la version explicitement.
--
-- Note : cette migration est elle-même trackée (version '017_*')
-- pour rester consistante avec les suivantes.

CREATE TABLE IF NOT EXISTS schema_migrations (
    -- Le nom du fichier (ex: '002_regions_departments.sql') sert
    -- d'identifiant. Texte plutôt qu'int pour permettre des
    -- suffixes de patch (002_a_fix.sql) sans renuméroter.
    version TEXT PRIMARY KEY,
    -- Quand la migration a été appliquée sur CETTE instance.
    -- Utile pour debug ("qui a appliqué ça et quand ?").
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Hash SHA256 du contenu pour détecter les modifications
    -- post-application. Optionnel mais on le pose dès le début
    -- pour ne pas avoir à le rajouter plus tard.
    checksum TEXT NOT NULL
);
