-- Migration 003: Elections, Audit Logs, Types d'incidents

-- =============================================
-- TABLE ELECTIONS (Scrutins)
-- =============================================
DO $$ BEGIN
    CREATE TYPE election_status AS ENUM ('planned', 'active', 'closed', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS elections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'general',
    status election_status NOT NULL DEFAULT 'planned',
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    description TEXT DEFAULT '',
    region_ids TEXT DEFAULT 'all',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- TABLE AUDIT LOGS (Persistés)
-- =============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id VARCHAR(100) NOT NULL,
    admin_name VARCHAR(200) DEFAULT '',
    action VARCHAR(100) NOT NULL,
    target_id VARCHAR(200) DEFAULT '',
    details TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON audit_logs (admin_id);

-- =============================================
-- TABLE TYPES D'INCIDENTS
-- =============================================
CREATE TABLE IF NOT EXISTS incident_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(20) NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    severity INT NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
    color VARCHAR(7) DEFAULT '#f0883e',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pré-insertion des types d'incidents standards pour le contexte électoral
INSERT INTO incident_types (name, code, description, severity, color) VALUES
    ('Bourrage d''urnes', 'STUFF', 'Introduction frauduleuse de bulletins dans l''urne', 5, '#f85149'),
    ('Intimidation', 'INTIM', 'Menaces ou pressions exercées sur les électeurs', 5, '#f85149'),
    ('Achat de votes', 'BUYV', 'Distribution d''argent ou de biens en échange de votes', 4, '#f0883e'),
    ('Violence', 'VIOLE', 'Actes de violence physique liés au processus électoral', 5, '#da3633'),
    ('Fermeture anticipée', 'EARLY', 'Bureau de vote fermé avant l''heure officielle', 4, '#f0883e'),
    ('Matériel manquant', 'NOMAT', 'Absence de matériel électoral nécessaire', 3, '#d29922'),
    ('Procuration frauduleuse', 'FRAUD', 'Utilisation abusive de procurations', 4, '#f0883e'),
    ('Obstruction', 'OBSTR', 'Empêchement de l''accès au bureau de vote', 4, '#f0883e'),
    ('Décompte irrégulier', 'COUNT', 'Anomalies lors du dépouillement des votes', 5, '#f85149'),
    ('Propagande illégale', 'PROPA', 'Propagande électorale le jour du scrutin', 2, '#8b949e'),
    ('Défaillance technique', 'TECH', 'Panne d''équipement ou problème technique', 2, '#8b949e'),
    ('Autre', 'OTHER', 'Incident non catégorisé', 1, '#8b949e')
ON CONFLICT (code) DO NOTHING;

-- Ajout du champ last_login_at à la table users
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
