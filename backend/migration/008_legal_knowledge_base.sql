-- Migration 008: Base de Connaissance Juridique Intelligente (RAG)
-- Activation de pgvector et ajout des embeddings pour la recherche sémantique

-- 1. Extension pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Ajout de la colonne embedding aux articles
ALTER TABLE legal_framework ADD COLUMN IF NOT EXISTS embedding vector(768);

-- 3. Métadonnées enrichies pour le croisement terrain/droit
ALTER TABLE legal_framework ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}';
ALTER TABLE legal_framework ADD COLUMN IF NOT EXISTS violation_types TEXT[] DEFAULT '{}';
ALTER TABLE legal_framework ADD COLUMN IF NOT EXISTS severity_level INTEGER DEFAULT 1;
ALTER TABLE legal_framework ADD COLUMN IF NOT EXISTS chapter TEXT DEFAULT '';
ALTER TABLE legal_framework ADD COLUMN IF NOT EXISTS section TEXT DEFAULT '';

-- 4. Index HNSW pour recherche vectorielle rapide (cosinus)
CREATE INDEX IF NOT EXISTS idx_legal_embedding ON legal_framework
  USING hnsw (embedding vector_cosine_ops);

-- 5. Table de liaison rapport-article (qualification juridique)
CREATE TABLE IF NOT EXISTS report_legal_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    article_id UUID NOT NULL REFERENCES legal_framework(id) ON DELETE CASCADE,
    similarity_score FLOAT NOT NULL DEFAULT 0,
    match_type VARCHAR(50) DEFAULT 'auto', -- 'auto' = IA, 'manual' = humain
    notes TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(report_id, article_id)
);

-- 6. Index pour les requêtes de qualification
CREATE INDEX IF NOT EXISTS idx_report_matches_report ON report_legal_matches(report_id);
CREATE INDEX IF NOT EXISTS idx_report_matches_article ON report_legal_matches(article_id);
CREATE INDEX IF NOT EXISTS idx_report_matches_score ON report_legal_matches(similarity_score DESC);
