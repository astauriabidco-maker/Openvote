-- Migration 037: Complements departementaux officiels Presidentielle 2025
-- =============================================================================
-- Complete la couverture departementale officielle avec les pages 11, 13, 15,
-- 16, 18, 20 et 22 de la proclamation du Conseil constitutionnel.
-- =============================================================================

WITH source AS (
    SELECT id FROM source_documents
    WHERE slug = 'conseil-constitutionnel-presidentielle-2025-resultats'
),
department_rows AS (
    SELECT
        '00002025-0000-4000-8000-000000000001'::uuid AS election_id,
        source.id AS source_document_id,
        'conseil-constitutionnel-presidentielle-2025-resultats'::varchar AS source_document_slug,
        2025 AS election_year,
        'presidential'::varchar AS contest_type,
        v.region_name,
        v.department_name,
        v.registered_voters,
        v.actual_voters,
        v.turnout_pct,
        v.abstention_pct,
        v.invalid_votes,
        v.valid_votes,
        v.source_page
    FROM source
    CROSS JOIN (VALUES
        ('FAR NORTH', 'DIAMARE', 305771::numeric, 169046::numeric, 55.290::numeric, 44.710::numeric, 3479::numeric, 165567::numeric, 11),
        ('FAR NORTH', 'LOGONE ET CHARI', 215294::numeric, 122890::numeric, 57.080::numeric, 42.920::numeric, 2983::numeric, 119907::numeric, 11),
        ('FAR NORTH', 'MAYO-DANAY', 218740::numeric, 142416::numeric, 65.110::numeric, 34.890::numeric, 3058::numeric, 139358::numeric, 11),
        ('FAR NORTH', 'MAYO-KANI', 158265::numeric, 98313::numeric, 62.120::numeric, 37.880::numeric, 2348::numeric, 95965::numeric, 11),
        ('FAR NORTH', 'MAYO-SAVA', 146095::numeric, 88373::numeric, 60.490::numeric, 39.510::numeric, 2169::numeric, 86204::numeric, 11),
        ('FAR NORTH', 'MAYO-TSANAGA', 217430::numeric, 113624::numeric, 52.260::numeric, 47.740::numeric, 3332::numeric, 110292::numeric, 11),
        ('LITTORAL', 'MOUNGO', 234020::numeric, 121101::numeric, 51.750::numeric, 48.250::numeric, 1240::numeric, 119861::numeric, 13),
        ('LITTORAL', 'NKAM', 27339::numeric, 14846::numeric, 54.300::numeric, 45.700::numeric, 220::numeric, 14626::numeric, 13),
        ('LITTORAL', 'SANAGA-MARITIME', 100710::numeric, 50734::numeric, 50.380::numeric, 49.620::numeric, 546::numeric, 50188::numeric, 13),
        ('LITTORAL', 'WOURI', 977955::numeric, 474701::numeric, 48.540::numeric, 51.460::numeric, 3582::numeric, 471119::numeric, 13),
        ('NORTH', 'BENOUE', 423222::numeric, 198943::numeric, 46.980::numeric, 53.020::numeric, 4685::numeric, 194258::numeric, 15),
        ('NORTH', 'FARO', 39057::numeric, 25026::numeric, 64.080::numeric, 35.920::numeric, 476::numeric, 24550::numeric, 15),
        ('NORTH', 'MAYO-LOUTI', 173359::numeric, 90404::numeric, 52.150::numeric, 47.850::numeric, 1982::numeric, 88422::numeric, 15),
        ('NORTH', 'MAYO-REY', 157667::numeric, 94544::numeric, 59.960::numeric, 40.040::numeric, 2255::numeric, 92289::numeric, 15),
        ('NORTH-WEST', 'BOYO', 56828::numeric, 9775::numeric, 17.200::numeric, 82.800::numeric, 60::numeric, 9715::numeric, 16),
        ('NORTH-WEST', 'BUI', 104230::numeric, 16364::numeric, 15.700::numeric, 84.300::numeric, 71::numeric, 16293::numeric, 16),
        ('NORTH-WEST', 'DONGA-MANTUNG', 96778::numeric, 40630::numeric, 41.980::numeric, 58.020::numeric, 508::numeric, 40122::numeric, 16),
        ('NORTH-WEST', 'MENCHUM', 52568::numeric, 10520::numeric, 20.010::numeric, 79.990::numeric, 158::numeric, 10362::numeric, 16),
        ('NORTH-WEST', 'MEZAM', 208476::numeric, 169952::numeric, 81.520::numeric, 18.480::numeric, 731::numeric, 169221::numeric, 16),
        ('NORTH-WEST', 'MOMO', 57183::numeric, 26317::numeric, 46.020::numeric, 53.980::numeric, 154::numeric, 26163::numeric, 16),
        ('NORTH-WEST', 'NGO KETUNJIA', 52033::numeric, 24317::numeric, 46.730::numeric, 53.270::numeric, 528::numeric, 23789::numeric, 16),
        ('WEST', 'BAMBOUTOS', 118275::numeric, 71802::numeric, 60.710::numeric, 39.290::numeric, 826::numeric, 70976::numeric, 18),
        ('WEST', 'HAUT-NKAM', 57244::numeric, 37858::numeric, 66.130::numeric, 33.870::numeric, 369::numeric, 37489::numeric, 18),
        ('WEST', 'HAUTS-PLATEAUX', 44765::numeric, 41023::numeric, 91.640::numeric, 8.360::numeric, 704::numeric, 40319::numeric, 18),
        ('WEST', 'KOUNG-KHI', 41549::numeric, 30050::numeric, 72.320::numeric, 27.680::numeric, 392::numeric, 29658::numeric, 18),
        ('WEST', 'MENOUA', 145128::numeric, 90951::numeric, 62.670::numeric, 37.330::numeric, 826::numeric, 90125::numeric, 18),
        ('WEST', 'MIFI', 178163::numeric, 92697::numeric, 52.030::numeric, 47.970::numeric, 929::numeric, 91768::numeric, 18),
        ('WEST', 'NDE', 71160::numeric, 50388::numeric, 70.810::numeric, 29.190::numeric, 560::numeric, 49828::numeric, 18),
        ('WEST', 'NOUN', 221296::numeric, 114200::numeric, 51.610::numeric, 48.390::numeric, 1832::numeric, 112368::numeric, 18),
        ('SOUTH', 'DJA-ET-LOBO', 98288::numeric, 87939::numeric, 89.470::numeric, 10.530::numeric, 172::numeric, 87767::numeric, 20),
        ('SOUTH', 'MVILA', 93788::numeric, 89117::numeric, 95.020::numeric, 4.980::numeric, 326::numeric, 88791::numeric, 20),
        ('SOUTH', 'OCEAN', 93177::numeric, 80641::numeric, 86.550::numeric, 13.450::numeric, 785::numeric, 79856::numeric, 20),
        ('SOUTH', 'VALLEE DU NTEM', 41076::numeric, 30401::numeric, 74.010::numeric, 25.990::numeric, 168::numeric, 30233::numeric, 20),
        ('SOUTH-WEST', 'FAKO', 182746::numeric, 61489::numeric, 33.650::numeric, 66.350::numeric, 1006::numeric, 60483::numeric, 22),
        ('SOUTH-WEST', 'KOUPE-MANENGOUBA', 38420::numeric, 23036::numeric, 59.960::numeric, 40.040::numeric, 95::numeric, 22941::numeric, 22),
        ('SOUTH-WEST', 'LEBIALEM', 22499::numeric, 8976::numeric, 39.900::numeric, 60.100::numeric, 154::numeric, 8822::numeric, 22),
        ('SOUTH-WEST', 'MANYU', 55228::numeric, 37444::numeric, 67.800::numeric, 32.200::numeric, 166::numeric, 37278::numeric, 22),
        ('SOUTH-WEST', 'MEME', 95082::numeric, 34658::numeric, 36.450::numeric, 63.550::numeric, 238::numeric, 34420::numeric, 22),
        ('SOUTH-WEST', 'NDIAN', 36731::numeric, 33856::numeric, 92.170::numeric, 7.830::numeric, 133::numeric, 33723::numeric, 22)
    ) AS v(region_name, department_name, registered_voters, actual_voters, turnout_pct, abstention_pct, invalid_votes, valid_votes, source_page)
),
indicator_rows AS (
    SELECT
        election_id, source_document_id, source_document_slug, election_year, contest_type,
        region_name, department_name, source_page,
        indicator_code, indicator_label, value_numeric, unit
    FROM department_rows
    CROSS JOIN LATERAL (VALUES
        ('registered_voters', 'Inscrits', registered_voters, 'count'),
        ('actual_voters', 'Votants', actual_voters, 'count'),
        ('turnout_pct', 'Taux de participation', turnout_pct, 'percent'),
        ('abstention_pct', 'Taux abstention', abstention_pct, 'percent'),
        ('invalid_votes', 'Bulletins nuls', invalid_votes, 'votes'),
        ('valid_votes', 'Suffrages exprimes', valid_votes, 'votes')
    ) AS indicator(indicator_code, indicator_label, value_numeric, unit)
)
INSERT INTO territorial_election_indicators (
    election_id, source_document_id, source_document_slug, election_year, contest_type,
    territory_level, region_name, department_name, indicator_code, indicator_label,
    value_numeric, unit, confidence, status, notes
)
SELECT election_id, source_document_id, source_document_slug, election_year, contest_type,
       'department', region_name, department_name, indicator_code, indicator_label,
       value_numeric, unit, 'official', 'verified',
       'Resultats departementaux verifies visuellement page ' || source_page || '.'
FROM indicator_rows
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
