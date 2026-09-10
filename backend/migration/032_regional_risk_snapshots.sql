-- Migration 032: Audit trail des scores régionaux
-- =================================================
-- Journalise les scores de cohérence historique vs terrain au fil de l'arrivée
-- des PV. Les snapshots sont append-only: on conserve chaque calcul avec ses
-- règles nommées et ses preuves.

CREATE TABLE IF NOT EXISTS regional_risk_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
    region_name TEXT NOT NULL DEFAULT '',
    normalized_region_name TEXT NOT NULL DEFAULT '',
    reference_election_id UUID REFERENCES elections(id) ON DELETE SET NULL,
    reference_election_year INT,
    reference_contest_type VARCHAR(40) NOT NULL DEFAULT '',
    reference_source_document_slug VARCHAR(180) NOT NULL DEFAULT '',
    total_stations INT NOT NULL DEFAULT 0,
    submitted_pv INT NOT NULL DEFAULT 0,
    coverage_rate NUMERIC(10,6) NOT NULL DEFAULT 0,
    registered_voters INT NOT NULL DEFAULT 0,
    reported_voters INT NOT NULL DEFAULT 0,
    blank_or_invalid_votes INT NOT NULL DEFAULT 0,
    turnout_rate NUMERIC(8,3),
    reference_turnout_rate NUMERIC(8,3),
    turnout_gap_points NUMERIC(8,3),
    invalid_rate NUMERIC(8,3),
    reference_invalid_rate NUMERIC(8,3),
    invalid_gap_points NUMERIC(8,3),
    leader_candidate_id UUID,
    leader_name TEXT NOT NULL DEFAULT '',
    leader_party TEXT NOT NULL DEFAULT '',
    leader_votes INT NOT NULL DEFAULT 0,
    risk_score INT NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
    risk_status VARCHAR(40) NOT NULL DEFAULT 'signal_faible',
    rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    snapshot_hash VARCHAR(128) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_regional_risk_snapshots_election
    ON regional_risk_snapshots (election_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_regional_risk_snapshots_region
    ON regional_risk_snapshots (normalized_region_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_regional_risk_snapshots_status
    ON regional_risk_snapshots (risk_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_regional_risk_snapshots_dedupe
    ON regional_risk_snapshots (election_id, normalized_region_name, snapshot_hash, created_at DESC);
