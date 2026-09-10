-- Migration 029: Traçabilité documentaire des bureaux de vote

ALTER TABLE polling_stations
    ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES source_documents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_document_slug VARCHAR(180) DEFAULT '',
    ADD COLUMN IF NOT EXISTS source_sha256 VARCHAR(64) DEFAULT '',
    ADD COLUMN IF NOT EXISTS source_position INT,
    ADD COLUMN IF NOT EXISTS source_confidence VARCHAR(40) DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_polling_stations_source_document
    ON polling_stations (source_document_id);

CREATE INDEX IF NOT EXISTS idx_polling_stations_source_slug
    ON polling_stations (source_document_slug);

CREATE INDEX IF NOT EXISTS idx_polling_stations_source_confidence
    ON polling_stations (source_confidence);

UPDATE polling_stations ps
SET source_document_id = sd.id
FROM source_documents sd
WHERE ps.source_document_id IS NULL
  AND ps.source_document_slug <> ''
  AND sd.slug = ps.source_document_slug;
