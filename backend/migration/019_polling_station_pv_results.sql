-- Migration 019: Bureaux de vote, candidats, PV terrain et résultats

DO $$ BEGIN
    CREATE TYPE pv_status AS ENUM ('draft', 'submitted', 'verified', 'disputed', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Bureaux de vote officiels ou importés depuis les listes ELECAM.
CREATE TABLE IF NOT EXISTS polling_stations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    code VARCHAR(80) NOT NULL,
    name VARCHAR(255) NOT NULL,
    region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    arrondissement_id UUID REFERENCES arrondissements(id) ON DELETE SET NULL,
    registered_voters INT NOT NULL DEFAULT 0 CHECK (registered_voters >= 0),
    location_name TEXT DEFAULT '',
    gps_location GEOMETRY(Point, 4326),
    h3_index VARCHAR(15),
    source_name VARCHAR(120) DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (election_id, code)
);

CREATE INDEX IF NOT EXISTS idx_polling_stations_election ON polling_stations (election_id);
CREATE INDEX IF NOT EXISTS idx_polling_stations_region ON polling_stations (region_id);
CREATE INDEX IF NOT EXISTS idx_polling_stations_gps ON polling_stations USING GIST (gps_location);
CREATE INDEX IF NOT EXISTS idx_polling_stations_h3 ON polling_stations (h3_index);

-- Candidats/listes rattachés à un scrutin.
CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    party VARCHAR(200) DEFAULT '',
    ballot_number INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (election_id, name)
);

CREATE INDEX IF NOT EXISTS idx_candidates_election ON candidates (election_id);

-- PV transmis par un observateur pour un bureau donné.
CREATE TABLE IF NOT EXISTS pv_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    polling_station_id UUID NOT NULL REFERENCES polling_stations(id) ON DELETE CASCADE,
    observer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status pv_status NOT NULL DEFAULT 'submitted',
    registered_voters INT NOT NULL DEFAULT 0 CHECK (registered_voters >= 0),
    voters_count INT NOT NULL DEFAULT 0 CHECK (voters_count >= 0),
    null_votes INT NOT NULL DEFAULT 0 CHECK (null_votes >= 0),
    blank_votes INT NOT NULL DEFAULT 0 CHECK (blank_votes >= 0),
    disputed_votes INT NOT NULL DEFAULT 0 CHECK (disputed_votes >= 0),
    pv_photo_url TEXT DEFAULT '',
    pv_hash VARCHAR(128) DEFAULT '',
    signed_payload_hash VARCHAR(128) DEFAULT '',
    signature TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (election_id, polling_station_id, observer_id)
);

CREATE INDEX IF NOT EXISTS idx_pv_submissions_election ON pv_submissions (election_id);
CREATE INDEX IF NOT EXISTS idx_pv_submissions_station ON pv_submissions (polling_station_id);
CREATE INDEX IF NOT EXISTS idx_pv_submissions_observer ON pv_submissions (observer_id);
CREATE INDEX IF NOT EXISTS idx_pv_submissions_status ON pv_submissions (status);

-- Résultats saisis depuis le PV, une ligne par candidat.
CREATE TABLE IF NOT EXISTS pv_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pv_submission_id UUID NOT NULL REFERENCES pv_submissions(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    votes INT NOT NULL CHECK (votes >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (pv_submission_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_pv_results_candidate ON pv_results (candidate_id);
