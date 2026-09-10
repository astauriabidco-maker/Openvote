#!/usr/bin/env python3
"""Integration check for the ELECAM 2025 polling-station import guard.

Requires DATABASE_URL or --database-url. The test first runs the normal
idempotent import, then intentionally runs the importer with a wrong expected
count and verifies that the database row count remains unchanged.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys


DEFAULT_ELECTION_ID = "00002025-0000-4000-8000-000000000001"
DEFAULT_SOURCE_NAME = "ELECAM 2025 official polling station lists"
DEFAULT_EXPECTED_COUNT = 28170


def run(command: list[str], input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, input=input_text, text=True, capture_output=True)


def count_imported(database_url: str, election_id: str, source_name: str) -> int:
    sql = f"""
SELECT COUNT(*)
FROM polling_stations
WHERE election_id = $${election_id}$$::uuid
  AND source_name = $${source_name}$$;
"""
    result = run(["psql", database_url, "-tAc", sql])
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return int(result.stdout.strip())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--election-id", default=DEFAULT_ELECTION_ID)
    parser.add_argument("--source-name", default=DEFAULT_SOURCE_NAME)
    parser.add_argument("--expected-count", type=int, default=DEFAULT_EXPECTED_COUNT)
    args = parser.parse_args()

    if not args.database_url:
        raise SystemExit("DATABASE_URL or --database-url is required.")

    importer = [
        sys.executable,
        "scripts/import-elecam-2025-polling-stations.py",
        "--database-url",
        args.database_url,
        "--election-id",
        args.election_id,
        "--source-name",
        args.source_name,
        "--expected-count",
        str(args.expected_count),
    ]
    good = run(importer)
    if good.returncode != 0:
        sys.stderr.write(good.stderr or good.stdout)
        return good.returncode

    before = count_imported(args.database_url, args.election_id, args.source_name)
    if before != args.expected_count:
        raise SystemExit(f"expected {args.expected_count} rows before guard test, got {before}")

    bad_expected_count = args.expected_count - 1
    bad = run([*importer[:-1], str(bad_expected_count)])
    if bad.returncode == 0:
        raise SystemExit("expected import to fail with wrong expected count, but it succeeded")
    if "import aborted" not in (bad.stderr + bad.stdout):
        raise SystemExit("expected failure output to mention import aborted")

    after = count_imported(args.database_url, args.election_id, args.source_name)
    if after != before:
        raise SystemExit(f"rollback guard failed: count changed from {before} to {after}")

    print(f"OK ELECAM 2025 import guard refused {bad_expected_count} and preserved {after} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
