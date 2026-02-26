-- Migration 009: Upgrade vers modèle multilingue + analyses LLM
-- Passage de nomic-embed-text (768D) à snowflake-arctic-embed2 (1024D)

-- 1. Supprimer l'ancien index HNSW (dimension incompatible)
DROP INDEX IF EXISTS idx_legal_embedding;

-- 2. Réinitialiser les embeddings (nouvelle dimension)  
ALTER TABLE legal_framework DROP COLUMN IF EXISTS embedding;
ALTER TABLE legal_framework ADD COLUMN embedding vector(1024);

-- 3. Recréer l'index HNSW pour la nouvelle dimension
CREATE INDEX IF NOT EXISTS idx_legal_embedding ON legal_framework
  USING hnsw (embedding vector_cosine_ops);

-- 4. Table pour stocker les analyses juridiques LLM
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
