-- Journal append-only des événements critiques liés aux PV.
CREATE TABLE IF NOT EXISTS pv_audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pv_submission_id UUID NOT NULL REFERENCES pv_submissions(id) ON DELETE CASCADE,
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    polling_station_id UUID NOT NULL REFERENCES polling_stations(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role user_role,
    event_type TEXT NOT NULL,
    from_status pv_status,
    to_status pv_status,
    integrity_status TEXT,
    server_payload_hash TEXT,
    comment TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pv_audit_events_pv_created
    ON pv_audit_events(pv_submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pv_audit_events_election_created
    ON pv_audit_events(election_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_pv_audit_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'pv_audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_pv_audit_event_update ON pv_audit_events;
CREATE TRIGGER trg_prevent_pv_audit_event_update
    BEFORE UPDATE ON pv_audit_events
    FOR EACH ROW EXECUTE FUNCTION prevent_pv_audit_event_mutation();

DROP TRIGGER IF EXISTS trg_prevent_pv_audit_event_delete ON pv_audit_events;
CREATE TRIGGER trg_prevent_pv_audit_event_delete
    BEFORE DELETE ON pv_audit_events
    FOR EACH ROW EXECUTE FUNCTION prevent_pv_audit_event_mutation();
