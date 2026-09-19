-- Migration 036: Indicateurs departementaux officiels Presidentielle 2025
-- =============================================================================
-- Premiere vague verifiee visuellement depuis les pages 4, 6 et 9 de la
-- proclamation officielle du Conseil constitutionnel. Les lignes restent
-- volontairement limitees aux departements relus pour garder la consolidation
-- traçable et revisable.
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
        ('ADAMAWA', 'DJEREM', 63683::numeric, 27426::numeric, 43.070::numeric, 56.930::numeric, 342::numeric, 27084::numeric, 4),
        ('ADAMAWA', 'FARO ET DEO', 45265::numeric, 22460::numeric, 49.620::numeric, 50.380::numeric, 285::numeric, 22175::numeric, 4),
        ('ADAMAWA', 'MAYO BANYO', 82424::numeric, 36690::numeric, 44.510::numeric, 55.490::numeric, 631::numeric, 36059::numeric, 4),
        ('ADAMAWA', 'MBERE', 81656::numeric, 38866::numeric, 47.600::numeric, 52.400::numeric, 541::numeric, 38325::numeric, 4),
        ('ADAMAWA', 'VINA', 238904::numeric, 106654::numeric, 44.640::numeric, 55.360::numeric, 1297::numeric, 105357::numeric, 4),
        ('CENTRE', 'HAUTE SANAGA', 60701::numeric, 57560::numeric, 94.830::numeric, 5.170::numeric, 272::numeric, 57288::numeric, 6),
        ('CENTRE', 'LEKIE', 160527::numeric, 148985::numeric, 92.810::numeric, 7.190::numeric, 1014::numeric, 147971::numeric, 6),
        ('CENTRE', 'MBAM ET INOUBOU', 94177::numeric, 85872::numeric, 91.180::numeric, 8.820::numeric, 785::numeric, 85087::numeric, 6),
        ('CENTRE', 'MBAM ET KIM', 65022::numeric, 60333::numeric, 92.790::numeric, 7.210::numeric, 473::numeric, 59860::numeric, 6),
        ('CENTRE', 'MEFOU ET AFAMBA', 112313::numeric, 105425::numeric, 93.870::numeric, 6.130::numeric, 663::numeric, 104762::numeric, 6),
        ('CENTRE', 'MEFOU ET AKONO', 46103::numeric, 31173::numeric, 67.620::numeric, 32.380::numeric, 294::numeric, 30879::numeric, 6),
        ('CENTRE', 'MFOUNDI', 771503::numeric, 393708::numeric, 51.030::numeric, 48.970::numeric, 3068::numeric, 390640::numeric, 6),
        ('CENTRE', 'NYONG ET KELLE', 62917::numeric, 57255::numeric, 91.000::numeric, 9.000::numeric, 231::numeric, 57024::numeric, 6),
        ('CENTRE', 'NYONG ET MFOUMOU', 50190::numeric, 39955::numeric, 79.610::numeric, 20.390::numeric, 134::numeric, 39821::numeric, 6),
        ('CENTRE', 'NYONG ET SO''O', 60894::numeric, 56621::numeric, 92.980::numeric, 7.020::numeric, 324::numeric, 56297::numeric, 6),
        ('EAST', 'BOUMBA ET NGOKO', 44931::numeric, 27423::numeric, 61.030::numeric, 38.970::numeric, 319::numeric, 27104::numeric, 9),
        ('EAST', 'HAUT NYONG', 93665::numeric, 73840::numeric, 78.830::numeric, 21.170::numeric, 454::numeric, 73386::numeric, 9),
        ('EAST', 'KADEY', 76540::numeric, 74647::numeric, 97.530::numeric, 2.470::numeric, 658::numeric, 73989::numeric, 9),
        ('EAST', 'LOM ET DJEREM', 179223::numeric, 87415::numeric, 48.770::numeric, 51.230::numeric, 1293::numeric, 86122::numeric, 9)
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
