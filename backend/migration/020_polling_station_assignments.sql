-- Migration 020: Affectations observateur -> bureau de vote

CREATE TABLE IF NOT EXISTS polling_station_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    polling_station_id UUID NOT NULL REFERENCES polling_stations(id) ON DELETE CASCADE,
    observer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (election_id, polling_station_id, observer_id)
);

CREATE INDEX IF NOT EXISTS idx_polling_station_assignments_election
    ON polling_station_assignments (election_id);

CREATE INDEX IF NOT EXISTS idx_polling_station_assignments_observer
    ON polling_station_assignments (observer_id);

CREATE INDEX IF NOT EXISTS idx_polling_station_assignments_station
    ON polling_station_assignments (polling_station_id);
