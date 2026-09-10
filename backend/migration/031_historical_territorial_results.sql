-- Migration 031: Résultats historiques territoriaux ELECAM
-- ========================================================
-- Ajoute les dimensions région/département/commune aux résultats historiques,
-- puis importe les premiers tableaux territoriaux suffisamment propres dans
-- les rapports ELECAM archivés.
-- ========================================================

ALTER TABLE historical_election_results
    ADD COLUMN IF NOT EXISTS region_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS department_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS commune_name TEXT NOT NULL DEFAULT '';

ALTER TABLE historical_election_results
    DROP CONSTRAINT IF EXISTS historical_election_results_election_id_contest_type_result_key;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'historical_election_results'::regclass
          AND conname = 'historical_election_results_unique_scope'
    ) THEN
        ALTER TABLE historical_election_results
            ADD CONSTRAINT historical_election_results_unique_scope
            UNIQUE (
                election_id, contest_type, result_level, region_name, department_name, commune_name,
                actor_type, actor_name, party, metric_type
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_historical_election_results_region
    ON historical_election_results (region_name);

WITH rows AS (
    SELECT * FROM (VALUES
        ('ADAMAWA', 11, 654, 653, 626, 27, 1, 99.850::numeric),
        ('CENTRE', 37, 1983, 1975, 1949, 26, 8, 99.600::numeric),
        ('EAST', 17, 914, 911, 903, 8, 3, 99.670::numeric),
        ('FAR NORTH', 28, 1566, 1559, 1524, 35, 7, 99.550::numeric),
        ('LITTORAL', 20, 1086, 1081, 1055, 26, 5, 99.540::numeric),
        ('NORTH', 13, 760, 758, 743, 15, 2, 99.740::numeric),
        ('NORTH-WEST', 19, 1127, 949, 945, 4, 178, 84.210::numeric),
        ('WEST', 22, 1254, 1252, 1240, 12, 2, 99.840::numeric),
        ('SOUTH', 11, 831, 829, 821, 8, 2, 99.760::numeric),
        ('SOUTH-WEST', 17, 959, 957, 957, 0, 2, 99.790::numeric)
    ) AS v(region_name, polling_stations, registered_voters, actual_voters, valid_votes, blank_or_invalid_votes, abstentions, percentage)
)
INSERT INTO historical_election_results (
    election_id, source_document_id, source_document_slug, election_year, contest_type,
    result_level, region_name, actor_type, actor_name, party, metric_type,
    registered_voters, actual_voters, valid_votes, blank_or_invalid_votes, abstentions,
    polling_stations, percentage, source_line_start, source_line_end, confidence, status, notes
)
SELECT '11111111-2023-4000-8000-000000000007'::uuid, sd.id, 'elecam-senatoriales-2023-rapport-en',
       2023, 'senatorial', 'region', r.region_name, 'election', '', '', 'summary',
       r.registered_voters, r.actual_voters, r.valid_votes, r.blank_or_invalid_votes,
       r.abstentions, r.polling_stations, r.percentage, 2462, 2538,
       'official_report', 'verified', 'Election statistics per senatorial constituency.'
FROM rows r
LEFT JOIN source_documents sd ON sd.slug = 'elecam-senatoriales-2023-rapport-en'
ON CONFLICT (
    election_id, contest_type, result_level, region_name, department_name, commune_name,
    actor_type, actor_name, party, metric_type
) DO UPDATE SET
    source_document_id = EXCLUDED.source_document_id,
    registered_voters = EXCLUDED.registered_voters,
    actual_voters = EXCLUDED.actual_voters,
    valid_votes = EXCLUDED.valid_votes,
    blank_or_invalid_votes = EXCLUDED.blank_or_invalid_votes,
    abstentions = EXCLUDED.abstentions,
    polling_stations = EXCLUDED.polling_stations,
    percentage = EXCLUDED.percentage,
    source_line_start = EXCLUDED.source_line_start,
    source_line_end = EXCLUDED.source_line_end,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    updated_at = NOW();

WITH rows AS (
    SELECT * FROM (VALUES
        ('ADAMAWA', 21),
        ('CENTRE', 70),
        ('EAST', 33),
        ('FAR NORTH', 47),
        ('LITTORAL', 34),
        ('NORTH', 21),
        ('NORTH-WEST', 34),
        ('WEST', 40),
        ('SOUTH', 29),
        ('SOUTH-WEST', 31)
    ) AS v(region_name, councils)
)
INSERT INTO historical_election_results (
    election_id, source_document_id, source_document_slug, election_year, contest_type,
    result_level, region_name, actor_type, actor_name, party, metric_type, councils,
    source_line_start, source_line_end, confidence, status, notes
)
SELECT '11111111-2013-4000-8000-000000000003'::uuid, sd.id, 'elecam-legislatives-municipales-2013-rapport-en',
       2013, 'municipal', 'region', r.region_name, 'election', '', '', 'summary', r.councils,
       11231, 11266, 'official_report', 'verified', 'Total councils by region in the municipal council-control table.'
FROM rows r
LEFT JOIN source_documents sd ON sd.slug = 'elecam-legislatives-municipales-2013-rapport-en'
ON CONFLICT (
    election_id, contest_type, result_level, region_name, department_name, commune_name,
    actor_type, actor_name, party, metric_type
) DO UPDATE SET
    source_document_id = EXCLUDED.source_document_id,
    councils = EXCLUDED.councils,
    source_line_start = EXCLUDED.source_line_start,
    source_line_end = EXCLUDED.source_line_end,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    updated_at = NOW();

WITH rows AS (
    SELECT * FROM (VALUES
        ('ADAMAWA', 'CPDM', 14), ('ADAMAWA', 'NUDP', 7),
        ('CENTRE', 'CPDM', 65), ('CENTRE', 'UPC', 5),
        ('EAST', 'CPDM', 33),
        ('FAR NORTH', 'CPDM', 40), ('FAR NORTH', 'NUDP', 2), ('FAR NORTH', 'MDR', 5),
        ('LITTORAL', 'CPDM', 28), ('LITTORAL', 'SDF', 3), ('LITTORAL', 'UPC', 2), ('LITTORAL', 'UFP', 1),
        ('NORTH', 'CPDM', 15), ('NORTH', 'NUDP', 6),
        ('NORTH-WEST', 'CPDM', 19), ('NORTH-WEST', 'SDF', 15),
        ('WEST', 'CPDM', 33), ('WEST', 'SDF', 1), ('WEST', 'CDU', 5), ('WEST', 'UMS', 1),
        ('SOUTH', 'CPDM', 29),
        ('SOUTH-WEST', 'CPDM', 27), ('SOUTH-WEST', 'SDF', 4)
    ) AS v(region_name, party, councils_controlled)
)
INSERT INTO historical_election_results (
    election_id, source_document_id, source_document_slug, election_year, contest_type,
    result_level, region_name, actor_type, actor_name, party, metric_type,
    councils_controlled, source_line_start, source_line_end, confidence, status, notes
)
SELECT '11111111-2013-4000-8000-000000000003'::uuid, sd.id, 'elecam-legislatives-municipales-2013-rapport-en',
       2013, 'municipal', 'region', r.region_name, 'party', r.party, r.party, 'councils_controlled',
       r.councils_controlled, 11231, 11266, 'official_report', 'verified',
       'Councils controlled per political party and per region.'
FROM rows r
LEFT JOIN source_documents sd ON sd.slug = 'elecam-legislatives-municipales-2013-rapport-en'
ON CONFLICT (
    election_id, contest_type, result_level, region_name, department_name, commune_name,
    actor_type, actor_name, party, metric_type
) DO UPDATE SET
    source_document_id = EXCLUDED.source_document_id,
    councils_controlled = EXCLUDED.councils_controlled,
    source_line_start = EXCLUDED.source_line_start,
    source_line_end = EXCLUDED.source_line_end,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    updated_at = NOW();
