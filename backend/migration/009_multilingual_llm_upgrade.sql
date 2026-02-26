-- Migration 009: Colonne vectorielle flexible + table analyses LLM
-- Supprime la contrainte de dimension fixe pour accepter 768 (nomic) ou 1024 (snowflake)

-- 1. Supprimer l'ancien index et la colonne (dimension fixe)
DROP INDEX IF EXISTS idx_legal_embedding;
ALTER TABLE legal_framework DROP COLUMN IF EXISTS embedding;

-- 2. Recréer sans contrainte de dimension fixe (accepte toutes les dimensions)
ALTER TABLE legal_framework ADD COLUMN embedding vector;

-- 3. Table pour stocker les analyses juridiques LLM
CREATE TABLE IF NOT EXISTS legal_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    summary TEXT NOT NULL DEFAULT '',
    recommendation TEXT NOT NULL DEFAULT '',
    severity_level INTEGER NOT NULL DEFAULT 3,
    raw_response TEXT NOT NULL DEFAULT '',
    llm_model VARCHAR(100) NOT NULL DEFAULT 'mistral',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(report_id)
);

CREATE INDEX IF NOT EXISTS idx_legal_analyses_report ON legal_analyses(report_id);
CREATE INDEX IF NOT EXISTS idx_legal_analyses_severity ON legal_analyses(severity_level DESC);
