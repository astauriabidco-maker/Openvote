-- Migration 024: Empreintes cryptographiques et confiance des PV

ALTER TABLE pv_submissions
    ADD COLUMN IF NOT EXISTS proof_manifest_version INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS client_recorded_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS device_latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS device_longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS device_id VARCHAR(120) DEFAULT '',
    ADD COLUMN IF NOT EXISTS server_payload_hash VARCHAR(128) DEFAULT '',
    ADD COLUMN IF NOT EXISTS integrity_status VARCHAR(40) DEFAULT 'unverified',
    ADD COLUMN IF NOT EXISTS integrity_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS canonical_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_pv_submissions_integrity_status
    ON pv_submissions (integrity_status);

CREATE INDEX IF NOT EXISTS idx_pv_submissions_client_recorded_at
    ON pv_submissions (client_recorded_at);
