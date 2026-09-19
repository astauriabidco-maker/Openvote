-- Migration 035: Indicateurs candidats regionaux Presidentielle 2025
-- ================================================================
-- Ajoute a la carte consolidee les voix et pourcentages regionaux de
-- BIYA PAUL et ISSA TCHIROMA verifies visuellement page 34 de la
-- proclamation officielle du Conseil constitutionnel.
-- ================================================================

WITH source AS (
    SELECT id FROM source_documents
    WHERE slug = 'conseil-constitutionnel-presidentielle-2025-resultats'
),
rows AS (
    SELECT
        '00002025-0000-4000-8000-000000000001'::uuid AS election_id,
        source.id AS source_document_id,
        'conseil-constitutionnel-presidentielle-2025-resultats'::varchar AS source_document_slug,
        2025 AS election_year,
        'presidential'::varchar AS contest_type,
        v.region_name,
        v.indicator_code,
        v.indicator_label,
        v.value_numeric,
        v.unit,
        'official'::varchar AS confidence,
        'verified'::varchar AS status,
        'Recapitulatif regional des suffrages par candidat, page 34.'::text AS notes
    FROM source
    CROSS JOIN (VALUES
        ('ADAMAWA', 'candidate_biya_votes', 'BIYA PAUL - voix', 79256::numeric, 'votes'),
        ('ADAMAWA', 'candidate_biya_pct_valid', 'BIYA PAUL - % suffrages exprimes', 34.610::numeric, 'percent'),
        ('ADAMAWA', 'candidate_tchiroma_votes', 'ISSA TCHIROMA - voix', 115258::numeric, 'votes'),
        ('ADAMAWA', 'candidate_tchiroma_pct_valid', 'ISSA TCHIROMA - % suffrages exprimes', 50.330::numeric, 'percent'),
        ('CENTRE', 'candidate_biya_votes', 'BIYA PAUL - voix', 722153::numeric, 'votes'),
        ('CENTRE', 'candidate_biya_pct_valid', 'BIYA PAUL - % suffrages exprimes', 70.140::numeric, 'percent'),
        ('CENTRE', 'candidate_tchiroma_votes', 'ISSA TCHIROMA - voix', 222654::numeric, 'votes'),
        ('CENTRE', 'candidate_tchiroma_pct_valid', 'ISSA TCHIROMA - % suffrages exprimes', 21.620::numeric, 'percent'),
        ('EAST', 'candidate_biya_votes', 'BIYA PAUL - voix', 192543::numeric, 'votes'),
        ('EAST', 'candidate_biya_pct_valid', 'BIYA PAUL - % suffrages exprimes', 73.880::numeric, 'percent'),
        ('EAST', 'candidate_tchiroma_votes', 'ISSA TCHIROMA - voix', 51660::numeric, 'votes'),
        ('EAST', 'candidate_tchiroma_pct_valid', 'ISSA TCHIROMA - % suffrages exprimes', 19.820::numeric, 'percent'),
        ('FAR NORTH', 'candidate_biya_votes', 'BIYA PAUL - voix', 329476::numeric, 'votes'),
        ('FAR NORTH', 'candidate_biya_pct_valid', 'BIYA PAUL - % suffrages exprimes', 45.930::numeric, 'percent'),
        ('FAR NORTH', 'candidate_tchiroma_votes', 'ISSA TCHIROMA - voix', 303669::numeric, 'votes'),
        ('FAR NORTH', 'candidate_tchiroma_pct_valid', 'ISSA TCHIROMA - % suffrages exprimes', 42.340::numeric, 'percent'),
        ('LITTORAL', 'candidate_biya_votes', 'BIYA PAUL - voix', 137679::numeric, 'votes'),
        ('LITTORAL', 'candidate_biya_pct_valid', 'BIYA PAUL - % suffrages exprimes', 20.990::numeric, 'percent'),
        ('LITTORAL', 'candidate_tchiroma_votes', 'ISSA TCHIROMA - voix', 423557::numeric, 'votes'),
        ('LITTORAL', 'candidate_tchiroma_pct_valid', 'ISSA TCHIROMA - % suffrages exprimes', 64.590::numeric, 'percent'),
        ('NORTH', 'candidate_biya_votes', 'BIYA PAUL - voix', 154926::numeric, 'votes'),
        ('NORTH', 'candidate_biya_pct_valid', 'BIYA PAUL - % suffrages exprimes', 38.780::numeric, 'percent'),
        ('NORTH', 'candidate_tchiroma_votes', 'ISSA TCHIROMA - voix', 173837::numeric, 'votes'),
        ('NORTH', 'candidate_tchiroma_pct_valid', 'ISSA TCHIROMA - % suffrages exprimes', 43.510::numeric, 'percent'),
        ('NORTH-WEST', 'candidate_biya_votes', 'BIYA PAUL - voix', 255188::numeric, 'votes'),
        ('NORTH-WEST', 'candidate_biya_pct_valid', 'BIYA PAUL - % suffrages exprimes', 86.310::numeric, 'percent'),
        ('NORTH-WEST', 'candidate_tchiroma_votes', 'ISSA TCHIROMA - voix', 15392::numeric, 'votes'),
        ('NORTH-WEST', 'candidate_tchiroma_pct_valid', 'ISSA TCHIROMA - % suffrages exprimes', 5.210::numeric, 'percent'),
        ('WEST', 'candidate_biya_votes', 'BIYA PAUL - voix', 201731::numeric, 'votes'),
        ('WEST', 'candidate_biya_pct_valid', 'BIYA PAUL - % suffrages exprimes', 38.610::numeric, 'percent'),
        ('WEST', 'candidate_tchiroma_votes', 'ISSA TCHIROMA - voix', 244315::numeric, 'votes'),
        ('WEST', 'candidate_tchiroma_pct_valid', 'ISSA TCHIROMA - % suffrages exprimes', 46.760::numeric, 'percent'),
        ('SOUTH', 'candidate_biya_votes', 'BIYA PAUL - voix', 260449::numeric, 'votes'),
        ('SOUTH', 'candidate_biya_pct_valid', 'BIYA PAUL - % suffrages exprimes', 90.860::numeric, 'percent'),
        ('SOUTH', 'candidate_tchiroma_votes', 'ISSA TCHIROMA - voix', 17207::numeric, 'votes'),
        ('SOUTH', 'candidate_tchiroma_pct_valid', 'ISSA TCHIROMA - % suffrages exprimes', 6.000::numeric, 'percent'),
        ('SOUTH-WEST', 'candidate_biya_votes', 'BIYA PAUL - voix', 135975::numeric, 'votes'),
        ('SOUTH-WEST', 'candidate_biya_pct_valid', 'BIYA PAUL - % suffrages exprimes', 68.790::numeric, 'percent'),
        ('SOUTH-WEST', 'candidate_tchiroma_votes', 'ISSA TCHIROMA - voix', 45047::numeric, 'votes'),
        ('SOUTH-WEST', 'candidate_tchiroma_pct_valid', 'ISSA TCHIROMA - % suffrages exprimes', 22.790::numeric, 'percent')
    ) AS v(region_name, indicator_code, indicator_label, value_numeric, unit)
)
INSERT INTO territorial_election_indicators (
    election_id, source_document_id, source_document_slug, election_year, contest_type,
    territory_level, region_name, indicator_code, indicator_label, value_numeric,
    unit, confidence, status, notes
)
SELECT election_id, source_document_id, source_document_slug, election_year, contest_type,
       'region', region_name, indicator_code, indicator_label, value_numeric,
       unit, confidence, status, notes
FROM rows
ON CONFLICT (
    election_id, territory_level, region_name, department_name, commune_name,
    indicator_code, source_document_slug
) DO UPDATE SET
    source_document_id = EXCLUDED.source_document_id,
    value_numeric = EXCLUDED.value_numeric,
    unit = EXCLUDED.unit,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    updated_at = NOW();
