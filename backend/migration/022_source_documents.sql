-- Migration 022: Source documents verifiables
-- ====================================================
-- Chaine de preuve pour les donnees importees:
-- document officiel, URL, copie locale, checksum SHA-256,
-- extraction reproductible et niveau de confiance.
-- ====================================================

CREATE TABLE IF NOT EXISTS source_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(120) UNIQUE NOT NULL,
    title TEXT NOT NULL,
    publisher VARCHAR(200) NOT NULL,
    source_url TEXT NOT NULL,
    document_type VARCHAR(60) NOT NULL,
    language VARCHAR(12),
    published_date DATE,
    retrieved_at TIMESTAMP WITH TIME ZONE,
    local_path TEXT NOT NULL,
    extracted_text_path TEXT,
    sha256_checksum CHAR(64),
    mime_type VARCHAR(120),
    file_size_bytes BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
    granularity TEXT,
    reference_year INTEGER CHECK (reference_year IS NULL OR reference_year BETWEEN 1900 AND 2100),
    confidence VARCHAR(30) NOT NULL DEFAULT 'official'
        CHECK (confidence IN ('official', 'official_estimate', 'secondary_check', 'unverified')),
    status VARCHAR(30) NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'downloaded', 'extracted', 'verified', 'rejected')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_documents_publisher
    ON source_documents (publisher);
CREATE INDEX IF NOT EXISTS idx_source_documents_type
    ON source_documents (document_type);
CREATE INDEX IF NOT EXISTS idx_source_documents_confidence
    ON source_documents (confidence);
CREATE INDEX IF NOT EXISTS idx_source_documents_reference_year
    ON source_documents (reference_year);

CREATE OR REPLACE FUNCTION set_source_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_source_documents_updated_at ON source_documents;
CREATE TRIGGER trg_source_documents_updated_at
    BEFORE UPDATE ON source_documents
    FOR EACH ROW EXECUTE FUNCTION set_source_documents_updated_at();

ALTER TABLE data_imports
    ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES source_documents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_url TEXT,
    ADD COLUMN IF NOT EXISTS source_checksum CHAR(64),
    ADD COLUMN IF NOT EXISTS confidence VARCHAR(30)
        CHECK (confidence IS NULL OR confidence IN ('official', 'official_estimate', 'secondary_check', 'unverified')),
    ADD COLUMN IF NOT EXISTS publisher VARCHAR(200),
    ADD COLUMN IF NOT EXISTS document_title TEXT,
    ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_data_imports_source_document
    ON data_imports (source_document_id);
CREATE INDEX IF NOT EXISTS idx_data_imports_confidence
    ON data_imports (confidence);

ALTER TABLE legal_documents
    ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES source_documents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sha256_checksum CHAR(64),
    ADD COLUMN IF NOT EXISTS publisher VARCHAR(200),
    ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_legal_documents_source_document
    ON legal_documents (source_document_id);

INSERT INTO source_documents
    (slug, title, publisher, source_url, document_type, language, local_path,
     extracted_text_path, sha256_checksum, file_size_bytes, retrieved_at,
     granularity, reference_year, confidence, status, notes)
VALUES
    (
        'bucrep-projections-demographiques-2023',
        'Projections Demographiques (2023)',
        'BUCREP',
        'https://bucrep.org/download/25879/?tmstv=1788889392',
        'population_projection',
        'fr',
        'data/sources/official/pdfs/bucrep-projections-demographiques-2023.pdf',
        'data/sources/official/extracted/bucrep-projections-demographiques-2023.txt',
        'a2c950b1bd51643ab482591414b7bd7e7ea0600d17a80bea790fa1ea3920d620',
        615051,
        '2026-09-09T00:00:00+02:00',
        'national,region,department,commune',
        2023,
        'official_estimate',
        'verified',
        'PDF officiel telecharge depuis le catalogue BUCREP le 2026-09-09.'
    ),
    (
        'bucrep-rgph-2005-rapport-presentation-resultats',
        'Rapport de Presentation des Resultats du 3e RGPH',
        'BUCREP',
        'https://bucrep.org/download/25881/?tmstv=1788889392',
        'population_census',
        'fr',
        'data/sources/official/pdfs/bucrep-rgph-2005-rapport-presentation-resultats.pdf',
        'data/sources/official/extracted/bucrep-rgph-2005-rapport-presentation-resultats.txt',
        '480a8f626d766a1589fb5061849f5f0b53cf9e0fdb7476f29104e263b33def37',
        3092528,
        '2026-09-09T00:00:00+02:00',
        'national,region,department',
        2005,
        'official',
        'verified',
        'PDF officiel telecharge depuis le catalogue BUCREP le 2026-09-09.'
    ),
    (
        'elecam-documentation',
        'ELECAM - Documentation officielle electorale',
        'ELECAM',
        'https://portail.elecam.cm/fr/documentation/',
        'election_catalog',
        'fr',
        'data/sources/official/pdfs/elecam-documentation.pdf',
        'data/sources/official/extracted/elecam-documentation.txt',
        NULL,
        NULL,
        NULL,
        'election,region,polling_station',
        NULL,
        'official',
        'planned',
        'Page catalogue officielle; les rapports et listes de bureaux de vote doivent etre archives comme documents separes.'
    ),
    (
        'elecam-loi-2026-003-code-electoral',
        'Loi no 2026/003 du 14 avril 2026 modifiant le code electoral',
        'ELECAM',
        'https://portail.elecam.cm/download/loi-no-2026-003-du-14-avr-2026-modifiant-et-completent-certaines-dispositions-de-la-loi-no-2012-001-du-19-avril-2012-portant-code-electoral/?wpdmdl=3268',
        'law',
        'fr',
        'data/sources/official/pdfs/elecam-loi-2026-003-code-electoral.pdf',
        'data/sources/official/extracted/elecam-loi-2026-003-code-electoral.txt',
        'e4ab98812e52e51f7a392e64acffd3d2540811f36b3073e5f7576ef53b3dcbdb',
        3259144,
        '2026-09-09T00:00:00+02:00',
        'legal_text',
        2026,
        'official',
        'verified',
        'PDF officiel telecharge depuis ELECAM le 2026-09-09. La page PRC officielle existe mais expose un document HTML, pas un PDF direct.'
    ),
    (
        'assnat-electoral-code',
        'Code electoral',
        'Assemblee Nationale du Cameroun',
        'https://www.assnat.cm/images/lois-adoptees/electoral-code.pdf',
        'law',
        'fr',
        'data/sources/official/pdfs/assnat-electoral-code.pdf',
        'data/sources/official/extracted/assnat-electoral-code.txt',
        '19e3903380da7489e03ba9dc9e6c0663719245328770766c15e78edf8cb56129',
        443745,
        '2026-09-09T00:00:00+02:00',
        'legal_text',
        2012,
        'official',
        'verified',
        'PDF officiel Assemblee Nationale. Version de base a consolider avec les lois modificatives, notamment 2026/003.'
    ),
    (
        'assnat-constitution',
        'Constitution du Cameroun',
        'Assemblee Nationale du Cameroun',
        'https://www.assnat.cm/images/constitution.pdf',
        'constitution',
        'fr',
        'data/sources/official/pdfs/assnat-constitution.pdf',
        'data/sources/official/extracted/assnat-constitution.txt',
        'b7861566f89cee8e758650f24d52bb449331fde94aea8bd10c0a401400237176',
        25055470,
        '2026-09-09T00:00:00+02:00',
        'legal_text',
        NULL,
        'official',
        'downloaded',
        'PDF officiel Assemblee Nationale. Checksum verifie, mais extraction texte vide; OCR requis avant exploitation RAG/CMS. A consolider avec la loi constitutionnelle 2026/002.'
    ),
    (
        'prc-decret-2025-305-convocation-presidentielle',
        'Decret no 2025/305 du 11 juillet 2025 portant convocation du corps electoral',
        'Presidence de la Republique du Cameroun',
        'https://prc.cm/fr/actualites/actes/decrets/7865-decret-n-2025-305-du-11-juillet-2025-portant-convocation-du-corps-electoral-en-vue-de-l-election-du-president-de-la-republique',
        'decree',
        'fr',
        'data/sources/official/pdfs/prc-decret-2025-305-convocation-presidentielle.pdf',
        'data/sources/official/extracted/prc-decret-2025-305-convocation-presidentielle.txt',
        NULL,
        NULL,
        NULL,
        'election',
        2025,
        'official',
        'planned',
        'Source primaire pour la date officielle de la presidentielle 2025.'
    )
ON CONFLICT (slug) DO NOTHING;
