-- Activation des extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- Définition des ENUMs pour le typage fort au niveau DB
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('super_admin', 'region_admin', 'local_coord', 'observer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE report_status AS ENUM ('pending', 'verified', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Table Users
DROP TABLE IF EXISTS users CASCADE;
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'observer',
    password_hash VARCHAR(255) NOT NULL,
    region_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table Reports
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    observer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    incident_type VARCHAR(100) NOT NULL,
    description TEXT,
    gps_location GEOMETRY(Point, 4326), -- SRID 4326 pour Lat/Lon WGS84
    h3_index VARCHAR(15), -- Index hexadécimal H3
    status report_status NOT NULL DEFAULT 'pending',
    proof_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index Spatial pour les requêtes géographiques rapides
CREATE INDEX IF NOT EXISTS idx_reports_gps_location ON reports USING GIST (gps_location);

-- Index sur le H3 pour le Moteur de Triangulation
CREATE INDEX IF NOT EXISTS idx_reports_h3_index ON reports (h3_index);
