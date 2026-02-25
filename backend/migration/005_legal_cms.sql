-- Migration 005: Système de Gestion de Connaissances Électorales (CMS)
-- Permet de gérer des documents complets (Constitution, Code Électoral, Lois)

-- 1. Table des Documents
CREATE TABLE IF NOT EXISTS legal_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50),
    published_date DATE,
    source_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Liaison des Articles aux Documents
ALTER TABLE legal_framework ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES legal_documents(id) ON DELETE CASCADE;

-- 2.b Unicité par document
ALTER TABLE legal_framework DROP CONSTRAINT IF EXISTS legal_framework_article_number_key;
ALTER TABLE legal_framework ADD CONSTRAINT legal_framework_doc_article_unique UNIQUE (document_id, article_number);

-- 3. Ajout de types pour les documents
ALTER TABLE legal_documents ADD COLUMN IF NOT EXISTS doc_type VARCHAR(50) DEFAULT 'law'; -- 'constitution', 'law', 'decree'

-- 4. Insertion des documents de base
INSERT INTO legal_documents (id, title, description, doc_type, version) VALUES
('b2000001-0000-0000-0000-000000000001', 'Constitution du Cameroun', 'Loi fondamentale de la République du Cameroun', 'constitution', 'Revision 2008'),
('b2000001-0000-0000-0000-000000000002', 'Code Électoral', 'Loi n° 2012/001 du 19 avril 2012 portant Code électoral', 'law', '2012')
ON CONFLICT DO NOTHING;

-- 5. Rattachement des articles existants au Code Électoral par défaut
UPDATE legal_framework SET document_id = 'b2000001-0000-0000-0000-000000000002' WHERE document_id IS NULL;

-- 6. Quelques articles de la Constitution pour la démo
INSERT INTO legal_framework (article_number, title, content, category, document_id) VALUES
('Art 1.2', 'La République', 'La République du Cameroun est un Etat unitaire décentralisé. Elle est une et indivisible...', 'Principes', 'b2000001-0000-0000-0000-000000000001'),
('Art 2.1', 'Souveraineté', 'La souveraineté nationale appartient au peuple camerounais qui l''exerce soit par l''intermédiaire de ses députés...', 'Souveraineté', 'b2000001-0000-0000-0000-000000000001')
ON CONFLICT (article_number) DO NOTHING;
