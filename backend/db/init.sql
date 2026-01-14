-- Extension PostGIS pour les données géospatiales
CREATE EXTENSION IF NOT EXISTS postgis;

-- Types Enum pour les rôles
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'moderator', 'user');

-- Table des utilisateurs
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des rapports (Signalements)
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    h3_index TEXT NOT NULL, -- Index H3 (ex: '8a2a1072b59ffff')
    location GEOGRAPHY(POINT, 4326) NOT NULL, -- Coordonnées PostGIS (lat/long)
    report_hash TEXT NOT NULL, -- Hash pour l'intégrité du rapport
    content TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index géospatial pour la recherche par proximité
CREATE INDEX IF NOT EXISTS idx_reports_location ON reports USING GIST (location);
-- Index sur H3 pour les agrégations rapides
CREATE INDEX IF NOT EXISTS idx_reports_h3 ON reports (h3_index);

-- Table des incidents
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    severity INTEGER CHECK (severity BETWEEN 1 AND 5),
    status TEXT DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insertion d'un utilisateur admin par défaut (mot de passe à changer en prod)
-- Note: 'password' hashé (exemple simplifié pour init)
INSERT INTO users (username, email, password_hash, role) 
VALUES ('admin', 'admin@openvote.org', 'argon2id_hash_placeholder', 'super_admin')
ON CONFLICT DO NOTHING;
