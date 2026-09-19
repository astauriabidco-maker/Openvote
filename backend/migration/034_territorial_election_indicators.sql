-- Migration 034: Consolidation de la carte electorale
-- ===================================================
-- Cree une couche d'indicateurs territoriaux sourcés. Les valeurs exactes
-- proviennent des resultats officiels; les cartes analytiques restent des
-- controles secondaires avec confiance distincte.
-- ===================================================

CREATE TABLE IF NOT EXISTS territorial_election_indicators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    source_document_id UUID REFERENCES source_documents(id) ON DELETE SET NULL,
    source_document_slug VARCHAR(180) NOT NULL DEFAULT '',
    election_year INT NOT NULL CHECK (election_year BETWEEN 1900 AND 2100),
    contest_type VARCHAR(40) NOT NULL,
    territory_level VARCHAR(40) NOT NULL,
    region_name TEXT NOT NULL DEFAULT '',
    department_name TEXT NOT NULL DEFAULT '',
    commune_name TEXT NOT NULL DEFAULT '',
    indicator_code VARCHAR(80) NOT NULL,
    indicator_label TEXT NOT NULL,
    value_numeric NUMERIC(14,3),
    value_text TEXT NOT NULL DEFAULT '',
    unit VARCHAR(40) NOT NULL DEFAULT '',
    confidence VARCHAR(40) NOT NULL DEFAULT 'official',
    status VARCHAR(40) NOT NULL DEFAULT 'verified',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (
        election_id, territory_level, region_name, department_name, commune_name,
        indicator_code, source_document_slug
    )
);

CREATE INDEX IF NOT EXISTS idx_territorial_election_indicators_election
    ON territorial_election_indicators (election_id);
CREATE INDEX IF NOT EXISTS idx_territorial_election_indicators_territory
    ON territorial_election_indicators (territory_level, region_name, department_name);
CREATE INDEX IF NOT EXISTS idx_territorial_election_indicators_code
    ON territorial_election_indicators (indicator_code);
CREATE INDEX IF NOT EXISTS idx_territorial_election_indicators_source
    ON territorial_election_indicators (source_document_slug);

WITH source AS (
    SELECT id FROM source_documents
    WHERE slug = 'conseil-constitutionnel-presidentielle-2025-resultats'
),
official_rows AS (
    SELECT
        '00002025-0000-4000-8000-000000000001'::uuid AS election_id,
        source.id AS source_document_id,
        'conseil-constitutionnel-presidentielle-2025-resultats'::varchar AS source_document_slug,
        2025 AS election_year,
        'presidential'::varchar AS contest_type,
        v.territory_level,
        v.region_name,
        v.indicator_code,
        v.indicator_label,
        v.value_numeric,
        v.unit,
        'official'::varchar AS confidence,
        'verified'::varchar AS status,
        v.notes
    FROM source
    CROSS JOIN (VALUES
        ('national', '', 'registered_voters', 'Inscrits', 8082692::numeric, 'voters', 'Total general officiel page 33.'),
        ('national', '', 'actual_voters', 'Votants', 4668446::numeric, 'voters', 'Total general officiel page 33.'),
        ('national', '', 'valid_votes', 'Suffrages valablement exprimes', 4610826::numeric, 'votes', 'Total general officiel page 33.'),
        ('national', '', 'invalid_votes', 'Bulletins nuls', 57620::numeric, 'votes', 'Total general officiel page 33.'),
        ('national', '', 'turnout_pct', 'Participation', 57.760::numeric, 'percent', 'Total general officiel page 33.'),
        ('region', 'ADAMAWA', 'registered_voters', 'Inscrits', 511932::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'ADAMAWA', 'actual_voters', 'Votants', 232096::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'ADAMAWA', 'valid_votes', 'Suffrages valablement exprimes', 229000::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'ADAMAWA', 'invalid_votes', 'Bulletins nuls', 3096::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'ADAMAWA', 'turnout_pct', 'Participation', 45.340::numeric, 'percent', 'Region officielle page 33.'),
        ('region', 'CENTRE', 'registered_voters', 'Inscrits', 1484347::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'CENTRE', 'actual_voters', 'Votants', 1036887::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'CENTRE', 'valid_votes', 'Suffrages valablement exprimes', 1029629::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'CENTRE', 'invalid_votes', 'Bulletins nuls', 7258::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'CENTRE', 'turnout_pct', 'Participation', 69.850::numeric, 'percent', 'Region officielle page 33.'),
        ('region', 'EAST', 'registered_voters', 'Inscrits', 394359::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'EAST', 'actual_voters', 'Votants', 263325::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'EAST', 'valid_votes', 'Suffrages valablement exprimes', 260601::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'EAST', 'invalid_votes', 'Bulletins nuls', 2724::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'EAST', 'turnout_pct', 'Participation', 66.770::numeric, 'percent', 'Region officielle page 33.'),
        ('region', 'FAR NORTH', 'registered_voters', 'Inscrits', 1261595::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'FAR NORTH', 'actual_voters', 'Votants', 734662::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'FAR NORTH', 'valid_votes', 'Suffrages valablement exprimes', 717293::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'FAR NORTH', 'invalid_votes', 'Bulletins nuls', 17369::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'FAR NORTH', 'turnout_pct', 'Participation', 58.230::numeric, 'percent', 'Region officielle page 33.'),
        ('region', 'LITTORAL', 'registered_voters', 'Inscrits', 1340024::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'LITTORAL', 'actual_voters', 'Votants', 661382::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'LITTORAL', 'valid_votes', 'Suffrages valablement exprimes', 655794::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'LITTORAL', 'invalid_votes', 'Bulletins nuls', 5588::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'LITTORAL', 'turnout_pct', 'Participation', 49.360::numeric, 'percent', 'Region officielle page 33.'),
        ('region', 'NORTH', 'registered_voters', 'Inscrits', 793505::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'NORTH', 'actual_voters', 'Votants', 408917::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'NORTH', 'valid_votes', 'Suffrages valablement exprimes', 399519::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'NORTH', 'invalid_votes', 'Bulletins nuls', 9398::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'NORTH', 'turnout_pct', 'Participation', 51.530::numeric, 'percent', 'Region officielle page 33.'),
        ('region', 'NORTH-WEST', 'registered_voters', 'Inscrits', 628096::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'NORTH-WEST', 'actual_voters', 'Votants', 297875::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'NORTH-WEST', 'valid_votes', 'Suffrages valablement exprimes', 295665::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'NORTH-WEST', 'invalid_votes', 'Bulletins nuls', 2210::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'NORTH-WEST', 'turnout_pct', 'Participation', 47.430::numeric, 'percent', 'Region officielle page 33.'),
        ('region', 'WEST', 'registered_voters', 'Inscrits', 877580::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'WEST', 'actual_voters', 'Votants', 528969::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'WEST', 'valid_votes', 'Suffrages valablement exprimes', 522531::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'WEST', 'invalid_votes', 'Bulletins nuls', 6438::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'WEST', 'turnout_pct', 'Participation', 60.280::numeric, 'percent', 'Region officielle page 33.'),
        ('region', 'SOUTH', 'registered_voters', 'Inscrits', 326329::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'SOUTH', 'actual_voters', 'Votants', 288098::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'SOUTH', 'valid_votes', 'Suffrages valablement exprimes', 286647::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'SOUTH', 'invalid_votes', 'Bulletins nuls', 1451::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'SOUTH', 'turnout_pct', 'Participation', 88.280::numeric, 'percent', 'Region officielle page 33.'),
        ('region', 'SOUTH-WEST', 'registered_voters', 'Inscrits', 430706::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'SOUTH-WEST', 'actual_voters', 'Votants', 199459::numeric, 'voters', 'Region officielle page 33.'),
        ('region', 'SOUTH-WEST', 'valid_votes', 'Suffrages valablement exprimes', 197667::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'SOUTH-WEST', 'invalid_votes', 'Bulletins nuls', 1792::numeric, 'votes', 'Region officielle page 33.'),
        ('region', 'SOUTH-WEST', 'turnout_pct', 'Participation', 46.310::numeric, 'percent', 'Region officielle page 33.'),
        ('diaspora', 'DIASPORA', 'registered_voters', 'Inscrits', 34219::numeric, 'voters', 'Diaspora officielle page 33.'),
        ('diaspora', 'DIASPORA', 'actual_voters', 'Votants', 16776::numeric, 'voters', 'Diaspora officielle page 33.'),
        ('diaspora', 'DIASPORA', 'valid_votes', 'Suffrages valablement exprimes', 16480::numeric, 'votes', 'Diaspora officielle page 33.'),
        ('diaspora', 'DIASPORA', 'invalid_votes', 'Bulletins nuls', 296::numeric, 'votes', 'Diaspora officielle page 33.'),
        ('diaspora', 'DIASPORA', 'turnout_pct', 'Participation', 49.030::numeric, 'percent', 'Diaspora officielle page 33.')
    ) AS v(territory_level, region_name, indicator_code, indicator_label, value_numeric, unit, notes)
)
INSERT INTO territorial_election_indicators (
    election_id, source_document_id, source_document_slug, election_year, contest_type,
    territory_level, region_name, indicator_code, indicator_label, value_numeric,
    unit, confidence, status, notes
)
SELECT election_id, source_document_id, source_document_slug, election_year, contest_type,
       territory_level, region_name, indicator_code, indicator_label, value_numeric,
       unit, confidence, status, notes
FROM official_rows
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

WITH source AS (
    SELECT id FROM source_documents
    WHERE slug = 'lam-2025-suffrages-rapport-inscrits'
),
lam_rows AS (
    SELECT
        '00002025-0000-4000-8000-000000000001'::uuid AS election_id,
        source.id AS source_document_id,
        'lam-2025-suffrages-rapport-inscrits'::varchar AS source_document_slug,
        2025 AS election_year,
        'presidential'::varchar AS contest_type,
        v.indicator_code,
        v.indicator_label,
        v.value_numeric,
        v.notes
    FROM source
    CROSS JOIN (VALUES
        ('registered_share_biya_pct', 'Biya / inscrits', 30.600::numeric, 'Carte LAM: part nationale du vote Biya rapportee aux inscrits.'),
        ('registered_share_tchiroma_pct', 'Tchiroma / inscrits', 20.100::numeric, 'Carte LAM: part nationale du vote Tchiroma rapportee aux inscrits.'),
        ('registered_share_other_pct', 'Autres candidats / inscrits', 7.100::numeric, 'Carte LAM: part nationale des autres candidats rapportee aux inscrits.'),
        ('abstention_pct', 'Abstention', 42.200::numeric, 'Carte LAM: part nationale de l abstention rapportee aux inscrits.')
    ) AS v(indicator_code, indicator_label, value_numeric, notes)
)
INSERT INTO territorial_election_indicators (
    election_id, source_document_id, source_document_slug, election_year, contest_type,
    territory_level, indicator_code, indicator_label, value_numeric, unit,
    confidence, status, notes
)
SELECT election_id, source_document_id, source_document_slug, election_year, contest_type,
       'national', indicator_code, indicator_label, value_numeric, 'percent',
       'secondary_check', 'verified', notes
FROM lam_rows
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
