-- Migration 009: Support LLM analyses + vecteur flexible
-- Idempotent: ne touche pas aux embeddings existants

-- S'assurer que la colonne embedding existe (format flexible)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'legal_framework' AND column_name = 'embedding') THEN
        ALTER TABLE legal_framework ADD COLUMN embedding vector;
    END IF;
END $$;

-- Table pour stocker les analyses juridiques LLM
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
