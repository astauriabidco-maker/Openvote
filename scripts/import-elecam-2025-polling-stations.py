#!/usr/bin/env python3
"""Transactionally import ELECAM 2025 polling stations into PostgreSQL.

The script streams the verified CSV into a temporary staging table with
PostgreSQL COPY, validates the staging data and foreign keys, upserts the
target polling_stations rows, and commits only if exactly 28,170 rows are
present for the ELECAM 2025 source.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT / "data/sources/official/structured/elecam-2025-polling-stations-upload-with-geo.csv"
DEFAULT_ELECTION_ID = "00002025-0000-4000-8000-000000000001"
DEFAULT_ELECTION_NAME = "Presidentielle Cameroun 2025"
DEFAULT_ELECTION_DATE = "2025-10-12 00:00:00+01"
DEFAULT_SOURCE_NAME = "ELECAM 2025 official polling station lists"
DEFAULT_EXPECTED_COUNT = 28170


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def build_sql(args: argparse.Namespace, csv_text: str) -> str:
    election_id = sql_literal(args.election_id)
    election_name = sql_literal(args.election_name)
    election_date = sql_literal(args.election_date)
    source_name = sql_literal(args.source_name)
    expected_count = int(args.expected_count)

    return f"""
BEGIN;

CREATE TEMP TABLE elecam_2025_polling_stations_import_config (
    election_id UUID NOT NULL,
    expected_count INT NOT NULL,
    source_name TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO elecam_2025_polling_stations_import_config (
    election_id,
    expected_count,
    source_name
)
VALUES (
    {election_id}::uuid,
    {expected_count},
    {source_name}
);

CREATE TEMP TABLE elecam_2025_polling_stations_stage (
    code TEXT,
    name TEXT,
    region_id TEXT,
    department_id TEXT,
    arrondissement_id TEXT,
    registered_voters TEXT,
    location_name TEXT,
    latitude TEXT,
    longitude TEXT,
    source_document_slug TEXT,
    source_sha256 TEXT,
    source_position TEXT,
    source_confidence TEXT
) ON COMMIT DROP;

COPY elecam_2025_polling_stations_stage (
    code,
    name,
    region_id,
    department_id,
    arrondissement_id,
    registered_voters,
    location_name,
    latitude,
    longitude,
    source_document_slug,
    source_sha256,
    source_position,
    source_confidence
) FROM STDIN WITH (FORMAT csv, HEADER true);
{csv_text}\\.

DO $$
DECLARE
    expected_rows INT;
    bad_rows INT;
BEGIN
    SELECT expected_count INTO expected_rows
    FROM elecam_2025_polling_stations_import_config;

    SELECT COUNT(*) INTO bad_rows FROM elecam_2025_polling_stations_stage;
    IF bad_rows <> expected_rows THEN
        RAISE EXCEPTION 'ELECAM 2025 import aborted: expected % CSV rows, got %', expected_rows, bad_rows;
    END IF;

    SELECT COUNT(*) INTO bad_rows
    FROM elecam_2025_polling_stations_stage
    WHERE COALESCE(NULLIF(BTRIM(code), ''), '') = ''
       OR COALESCE(NULLIF(BTRIM(name), ''), '') = ''
       OR COALESCE(NULLIF(BTRIM(region_id), ''), '') = ''
       OR COALESCE(NULLIF(BTRIM(department_id), ''), '') = ''
       OR COALESCE(NULLIF(BTRIM(arrondissement_id), ''), '') = ''
       OR COALESCE(NULLIF(BTRIM(registered_voters), ''), '') = '';
    IF bad_rows > 0 THEN
        RAISE EXCEPTION 'ELECAM 2025 import aborted: % rows have missing required values', bad_rows;
    END IF;

    SELECT COUNT(*) INTO bad_rows
    FROM elecam_2025_polling_stations_stage
    WHERE registered_voters !~ '^[0-9]+$';
    IF bad_rows > 0 THEN
        RAISE EXCEPTION 'ELECAM 2025 import aborted: % rows have invalid registered_voters', bad_rows;
    END IF;

    SELECT COUNT(*) INTO bad_rows
    FROM elecam_2025_polling_stations_stage
    WHERE COALESCE(NULLIF(BTRIM(source_position), ''), '') <> ''
      AND source_position !~ '^[0-9]+$';
    IF bad_rows > 0 THEN
        RAISE EXCEPTION 'ELECAM 2025 import aborted: % rows have invalid source_position', bad_rows;
    END IF;

    SELECT COUNT(*) INTO bad_rows
    FROM elecam_2025_polling_stations_stage
    WHERE COALESCE(NULLIF(BTRIM(source_sha256), ''), '') <> ''
      AND source_sha256 !~ '^[0-9a-fA-F]{{64}}$';
    IF bad_rows > 0 THEN
        RAISE EXCEPTION 'ELECAM 2025 import aborted: % rows have invalid source_sha256', bad_rows;
    END IF;

    SELECT COUNT(*) INTO bad_rows
    FROM (
        SELECT code
        FROM elecam_2025_polling_stations_stage
        GROUP BY code
        HAVING COUNT(*) > 1
    ) duplicates;
    IF bad_rows > 0 THEN
        RAISE EXCEPTION 'ELECAM 2025 import aborted: % duplicate polling-station codes in CSV', bad_rows;
    END IF;

    SELECT COUNT(*) INTO bad_rows
    FROM elecam_2025_polling_stations_stage
    WHERE (COALESCE(NULLIF(BTRIM(latitude), ''), '') = '') <> (COALESCE(NULLIF(BTRIM(longitude), ''), '') = '')
       OR (
            COALESCE(NULLIF(BTRIM(latitude), ''), '') <> ''
            AND (
                latitude !~ '^-?[0-9]+(\\.[0-9]+)?$'
                OR longitude !~ '^-?[0-9]+(\\.[0-9]+)?$'
            )
       );
    IF bad_rows > 0 THEN
        RAISE EXCEPTION 'ELECAM 2025 import aborted: % rows have invalid latitude/longitude pairs', bad_rows;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.polling_stations') IS NULL THEN
        RAISE EXCEPTION 'ELECAM 2025 import aborted: table polling_stations is missing; apply migration 019 first';
    END IF;
END $$;

INSERT INTO elections (
    id,
    name,
    type,
    status,
    date,
    description,
    region_ids
)
VALUES (
    {election_id}::uuid,
    {election_name},
    'presidential',
    'planned',
    {election_date}::timestamptz,
    'Scrutin cible pour importer les listes officielles ELECAM des bureaux de vote 2025.',
    'all'
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    type = EXCLUDED.type,
    date = EXCLUDED.date,
    description = EXCLUDED.description,
    region_ids = EXCLUDED.region_ids,
    updated_at = NOW();

DO $$
DECLARE
    bad_rows INT;
BEGIN
    SELECT COUNT(*) INTO bad_rows
    FROM elecam_2025_polling_stations_stage s
    LEFT JOIN regions r ON r.id = s.region_id::uuid
    WHERE r.id IS NULL;
    IF bad_rows > 0 THEN
        RAISE EXCEPTION 'ELECAM 2025 import aborted: % rows reference unknown region_id', bad_rows;
    END IF;

    SELECT COUNT(*) INTO bad_rows
    FROM elecam_2025_polling_stations_stage s
    LEFT JOIN departments d ON d.id = s.department_id::uuid
    WHERE d.id IS NULL;
    IF bad_rows > 0 THEN
        RAISE EXCEPTION 'ELECAM 2025 import aborted: % rows reference unknown department_id', bad_rows;
    END IF;

    SELECT COUNT(*) INTO bad_rows
    FROM elecam_2025_polling_stations_stage s
    LEFT JOIN arrondissements a ON a.id = s.arrondissement_id::uuid
    WHERE a.id IS NULL;
    IF bad_rows > 0 THEN
        RAISE EXCEPTION 'ELECAM 2025 import aborted: % rows reference unknown arrondissement_id', bad_rows;
    END IF;

    SELECT COUNT(*) INTO bad_rows
    FROM elecam_2025_polling_stations_stage s
    LEFT JOIN source_documents sd ON sd.slug = BTRIM(s.source_document_slug)
    WHERE COALESCE(NULLIF(BTRIM(s.source_document_slug), ''), '') <> ''
      AND sd.id IS NULL;
    IF bad_rows > 0 THEN
        RAISE EXCEPTION 'ELECAM 2025 import aborted: % rows reference unknown source_document_slug', bad_rows;
    END IF;

    SELECT COUNT(*) INTO bad_rows
    FROM elecam_2025_polling_stations_stage s
    JOIN source_documents sd ON sd.slug = BTRIM(s.source_document_slug)
    WHERE COALESCE(NULLIF(BTRIM(s.source_sha256), ''), '') <> ''
      AND LOWER(BTRIM(s.source_sha256)) <> LOWER(COALESCE(sd.sha256_checksum, ''));
    IF bad_rows > 0 THEN
        RAISE EXCEPTION 'ELECAM 2025 import aborted: % rows have source_sha256 mismatching source_documents', bad_rows;
    END IF;
END $$;

INSERT INTO polling_stations (
    election_id,
    code,
    name,
    region_id,
    department_id,
    arrondissement_id,
    registered_voters,
    location_name,
    gps_location,
    h3_index,
    source_name,
    source_document_id,
    source_document_slug,
    source_sha256,
    source_position,
    source_confidence
)
SELECT
    {election_id}::uuid,
    BTRIM(code),
    BTRIM(name),
    BTRIM(region_id)::uuid,
    BTRIM(department_id)::uuid,
    BTRIM(arrondissement_id)::uuid,
    registered_voters::int,
    COALESCE(location_name, ''),
    CASE
        WHEN COALESCE(NULLIF(BTRIM(latitude), ''), '') = '' THEN NULL
        ELSE ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)
    END,
    NULL,
    {source_name},
    sd.id,
    COALESCE(BTRIM(s.source_document_slug), ''),
    LOWER(COALESCE(BTRIM(s.source_sha256), '')),
    NULLIF(BTRIM(s.source_position), '')::int,
    COALESCE(BTRIM(s.source_confidence), '')
FROM elecam_2025_polling_stations_stage s
LEFT JOIN source_documents sd ON sd.slug = BTRIM(s.source_document_slug)
ON CONFLICT (election_id, code) DO UPDATE
SET name = EXCLUDED.name,
    region_id = EXCLUDED.region_id,
    department_id = EXCLUDED.department_id,
    arrondissement_id = EXCLUDED.arrondissement_id,
    registered_voters = EXCLUDED.registered_voters,
    location_name = EXCLUDED.location_name,
    gps_location = EXCLUDED.gps_location,
    h3_index = EXCLUDED.h3_index,
    source_name = EXCLUDED.source_name,
    source_document_id = EXCLUDED.source_document_id,
    source_document_slug = EXCLUDED.source_document_slug,
    source_sha256 = EXCLUDED.source_sha256,
    source_position = EXCLUDED.source_position,
    source_confidence = EXCLUDED.source_confidence,
    updated_at = NOW();

DO $$
DECLARE
    expected_rows INT;
    target_election_id UUID;
    target_source_name TEXT;
    imported_rows INT;
BEGIN
    SELECT expected_count, election_id, source_name
    INTO expected_rows, target_election_id, target_source_name
    FROM elecam_2025_polling_stations_import_config;

    SELECT COUNT(*) INTO imported_rows
    FROM polling_stations
    WHERE election_id = target_election_id
      AND source_name = target_source_name;

    IF imported_rows <> expected_rows THEN
        RAISE EXCEPTION 'ELECAM 2025 import aborted: expected % imported polling_stations, got %', expected_rows, imported_rows;
    END IF;
END $$;

COMMIT;
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--csv-path", default=str(DEFAULT_CSV))
    parser.add_argument("--expected-count", type=int, default=DEFAULT_EXPECTED_COUNT)
    parser.add_argument("--election-id", default=DEFAULT_ELECTION_ID)
    parser.add_argument("--election-name", default=DEFAULT_ELECTION_NAME)
    parser.add_argument("--election-date", default=DEFAULT_ELECTION_DATE)
    parser.add_argument("--source-name", default=DEFAULT_SOURCE_NAME)
    args = parser.parse_args()

    if not args.database_url:
        raise SystemExit("DATABASE_URL or --database-url is required.")

    csv_path = Path(args.csv_path)
    if not csv_path.exists():
        raise SystemExit(f"CSV not found: {csv_path}")

    csv_text = csv_path.read_text(encoding="utf-8")
    if not csv_text.endswith("\n"):
        csv_text += "\n"

    sql = build_sql(args, csv_text)
    result = subprocess.run(
        ["psql", args.database_url, "-v", "ON_ERROR_STOP=1", "-q"],
        input=sql,
        text=True,
    )
    if result.returncode != 0:
        return result.returncode

    print(f"ELECAM 2025 polling-station import committed: {args.expected_count} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
