-- Migration 016: Historique démographique département (time series)
-- =================================================================
-- Permet de tracer l'évolution de la démographie d'un département
-- dans le temps : à chaque UPDATE de population/registered_voters,
-- on insère un snapshot dans la table d'historique.
--
-- Source de vérité du graphique d'évolution dans l'UI admin
-- (Feature 3 du sprint CSV) : GET /admin/departments/:id/demographics-history
-- lit depuis cette table.
--
-- Pourquoi un trigger SQL plutôt qu'un INSERT applicatif :
--   1. Robuste : tout update de departments passe par le trigger,
--      qu'il vienne de l'API REST, du runner de migration, d'un
--      script d'admin, etc.
--   2. Pas de coupling : le code Go (UpdateDepartmentDemographics)
--      n'a pas besoin de connaître la table d'historique.
--   3. Idempotent : on n'insère que si population ou voters changent
--      vraiment (évite de polluer l'historique avec des no-op).

-- ========================================
-- TABLE : department_demographics_history
-- ========================================
CREATE TABLE IF NOT EXISTS department_demographics_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    population INTEGER NOT NULL,
    registered_voters INTEGER NOT NULL,
    data_source VARCHAR(200),
    data_confidence VARCHAR(20),
    source_import_id UUID REFERENCES data_imports(id) ON DELETE SET NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_history_dept_recorded
    ON department_demographics_history (department_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_history_import
    ON department_demographics_history (source_import_id);

-- ========================================
-- TRIGGER : append_after_update_department_demographics
-- ========================================
-- BEFORE INSERT, on enregistre le snapshot initial. BEFORE UPDATE,
-- on n'insère que si (population, registered_voters) changent
-- réellement (un UPDATE sur data_source seul ne pollue pas l'historique).
CREATE OR REPLACE FUNCTION log_department_demographics_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO department_demographics_history
            (department_id, year, population, registered_voters,
             data_source, data_confidence, recorded_at)
        VALUES
            (NEW.id, NEW.data_year, NEW.population, NEW.registered_voters,
             NEW.data_source, NEW.data_confidence, NOW());
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Skip si rien de signifiant n'a changé
        IF (OLD.population = NEW.population
            AND OLD.registered_voters = NEW.registered_voters) THEN
            RETURN NEW;
        END IF;
        INSERT INTO department_demographics_history
            (department_id, year, population, registered_voters,
             data_source, data_confidence, recorded_at)
        VALUES
            (NEW.id, NEW.data_year, NEW.population, NEW.registered_voters,
             NEW.data_source, NEW.data_confidence, NOW());
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_dept_demo_change ON departments;
CREATE TRIGGER trg_log_dept_demo_change
    AFTER INSERT OR UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION log_department_demographics_change();

-- ========================================
-- BACKFILL : seed l'historique avec l'état actuel de chaque département
-- (un point unique par dept, daté NOW, pour que le graphique ne soit
-- pas vide pour les départements jamais mis à jour depuis l'install).
--
-- Idempotence : on n'insert que si la table d'historique est vide
-- (cas d'un environnement frais). Sur un re-run, on garde l'historique
-- déjà accumulé par les UPDATE successifs.
-- ========================================
INSERT INTO department_demographics_history
    (department_id, year, population, registered_voters,
     data_source, data_confidence, recorded_at)
SELECT
    id, data_year, population, registered_voters,
    data_source, data_confidence, NOW()
FROM departments
WHERE NOT EXISTS (
    SELECT 1 FROM department_demographics_history LIMIT 1
);
