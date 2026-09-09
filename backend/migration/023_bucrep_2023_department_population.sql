-- Migration 023: Population departementale BUCREP 2023
-- ====================================================
-- Remplace les populations departementales estimees/proportionnelles
-- par les totaux departementaux du PDF officiel BUCREP 2023.
--
-- Source:
--   data/sources/official/pdfs/bucrep-projections-demographiques-2023.pdf
--   sha256 a2c950b1bd51643ab482591414b7bd7e7ea0600d17a80bea790fa1ea3920d620
--
-- Note de validation:
--   Le tableau departemental donne TOTAL NORD-OUEST = 1 774 109,
--   alors que le tableau regional donne 1 774 119. Les valeurs ci-dessous
--   conservent la somme des departements telle qu'extraite; cette somme
--   correspond au total national publie: 28 856 127.
-- ====================================================

CREATE TEMP TABLE tmp_bucrep_2023_department_population (
    code TEXT PRIMARY KEY,
    population INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_bucrep_2023_department_population (code, population) VALUES
    ('AD-DJ', 203655), ('AD-FD', 164663), ('AD-MB', 282690), ('AD-MR', 271791), ('AD-VI', 602376),
    ('CE-HS', 137728), ('CE-LK', 509457), ('CE-MI', 283482), ('CE-MK', 252215), ('CE-MA', 704072),
    ('CE-MO', 232897), ('CE-MF', 2461729), ('CE-NK', 245868), ('CE-NM', 160115), ('CE-NS', 216607),
    ('ES-BN', 159102), ('ES-HN', 266975), ('ES-KA', 249473), ('ES-LD', 524731),
    ('EN-DI', 1216243), ('EN-LC', 950791), ('EN-MD', 1071632), ('EN-MK', 873105), ('EN-MS', 503787), ('EN-MT', 957731),
    ('LT-MO', 662755), ('LT-NK', 85564), ('LT-SM', 286715), ('LT-WO', 3212469),
    ('NO-BE', 1817117), ('NO-FA', 153100), ('NO-ML', 833378), ('NO-MR', 949890),
    ('NW-BO', 161797), ('NW-BU', 313590), ('NW-DM', 259837), ('NW-ME', 126547), ('NW-MZ', 572139), ('NW-MM', 158425), ('NW-NK', 181774),
    ('OU-BA', 499618), ('OU-HN', 212680), ('OU-HP', 312312), ('OU-KK', 245987), ('OU-MN', 615467), ('OU-MI', 474536), ('OU-ND', 228581), ('OU-NO', 726009),
    ('SU-DL', 265178), ('SU-MV', 310239), ('SU-OC', 241195), ('SU-VN', 122126),
    ('SW-FA', 556785), ('SW-KM', 137300), ('SW-LE', 73309), ('SW-MA', 124827), ('SW-ME', 346334), ('SW-ND', 85632);

DO $$
DECLARE
    matched_departments INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO matched_departments
    FROM tmp_bucrep_2023_department_population src
    JOIN departments d ON d.code = src.code;

    IF matched_departments <> 58 THEN
        RAISE EXCEPTION 'BUCREP 2023 import expected 58 matched departments, got %', matched_departments;
    END IF;
END $$;

UPDATE departments d
SET
    population = src.population,
    data_source = 'BUCREP 2023 - Estimation officielle par departement',
    data_confidence = 'official_estimate',
    data_year = 2023,
    last_updated = NOW()
FROM tmp_bucrep_2023_department_population src
WHERE d.code = src.code;

WITH source_doc AS (
    SELECT id
    FROM source_documents
    WHERE slug = 'bucrep-projections-demographiques-2023'
)
INSERT INTO data_imports (
    import_type,
    source_name,
    file_name,
    records_updated,
    records_failed,
    imported_by,
    notes,
    source_document_id,
    source_url,
    source_checksum,
    confidence,
    publisher,
    document_title,
    retrieved_at
)
SELECT
    'population',
    'BUCREP 2023 - Estimation officielle par departement',
    'data/sources/official/structured/bucrep-2023-department-population.csv',
    58,
    0,
    'system',
    'Import des 58 populations departementales depuis le PDF BUCREP 2023 verifie. La somme departementale correspond au total national publie: 28 856 127. Anomalie source: Nord-Ouest vaut 1 774 109 dans le tableau departemental contre 1 774 119 dans le tableau regional.',
    sd.id,
    'https://bucrep.org/download/25879/?tmstv=1788889392',
    'a2c950b1bd51643ab482591414b7bd7e7ea0600d17a80bea790fa1ea3920d620',
    'official_estimate',
    'BUCREP',
    'Projections Demographiques (2023)',
    '2026-09-09T00:00:00+02:00'
FROM source_doc sd
WHERE NOT EXISTS (
    SELECT 1
    FROM data_imports
    WHERE source_checksum = 'a2c950b1bd51643ab482591414b7bd7e7ea0600d17a80bea790fa1ea3920d620'
      AND file_name = 'data/sources/official/structured/bucrep-2023-department-population.csv'
);
