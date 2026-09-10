#!/usr/bin/env python3
"""Enrich ELECAM 2025 polling-station CSV with database geography UUIDs.

The generated department and arrondissement UUIDs are database-specific because
the migrations create them with uuid_generate_v4(). This script resolves them
against the target database before producing the upload CSV.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import subprocess
import sys
import unicodedata
from io import StringIO
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CANONICAL = ROOT / "data/sources/official/structured/elecam-2025-polling-stations.csv"
DEFAULT_OUTPUT = ROOT / "data/sources/official/structured/elecam-2025-polling-stations-upload-with-geo.csv"
DEFAULT_REPORT = ROOT / "data/sources/official/structured/elecam-2025-polling-stations-geo-match-report.md"
DEFAULT_MAP_OUTPUT = ROOT / "data/sources/official/structured/geo-uuid-map.json"

GEO_QUERY = """
COPY (
    SELECT
        r.id::text AS region_id,
        r.name AS region_name,
        r.code AS region_code,
        d.id::text AS department_id,
        d.name AS department_name,
        d.code AS department_code,
        a.id::text AS arrondissement_id,
        a.name AS arrondissement_name,
        a.code AS arrondissement_code
    FROM arrondissements a
    JOIN departments d ON d.id = a.department_id
    JOIN regions r ON r.id = d.region_id
    ORDER BY r.code, d.code, a.code
) TO STDOUT WITH CSV HEADER
""".strip()

ALIASES = {
    "BATSENGA": "BATCHENGA",
    "ELAK": "ELAK OKU",
    "VALLE DU NTEM": "VALLEE DU NTEM",
    "NORTH-WEST": "NORD-OUEST",
    "SOUTH-WEST": "SUD-OUEST",
    "EXTREME-NORD": "EXTREME NORD",
    "FONKUKA": "FONFUKA",
    "ISANGUELE": "ISANGELE",
    "KAELE": "KAELE MK",
    "MAKARI": "MAKARY",
    "MASSOK SONGLOULOU": "MASSOCK SONGLOULOU",
    "NGOKE TUNJIA": "NGO KETUNJIA",
    "NJOMBE PENJA": "PENJA",
    "WABANE": "WABANE SW",
}

GEO_KEY_ALIASES = {
    ("NORD OUEST", "BUI", "WUM"): ("NORD OUEST", "MENCHUM", "WUM"),
    ("NORD OUEST", "NGO KETUNJIA", "ELAK OKU"): ("NORD OUEST", "BUI", "ELAK OKU"),
}


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.upper().replace("’", "'")
    value = re.sub(r"[^A-Z0-9']+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return ALIASES.get(value, value)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def query_geo_map(database_url: str) -> list[dict[str, str]]:
    result = subprocess.run(
        ["psql", database_url, "-v", "ON_ERROR_STOP=1", "-q", "-c", GEO_QUERY],
        check=True,
        text=True,
        capture_output=True,
    )
    return list(csv.DictReader(StringIO(result.stdout)))


def load_geo_map(args: argparse.Namespace) -> list[dict[str, str]]:
    if args.geo_map:
        return json.loads(Path(args.geo_map).read_text(encoding="utf-8"))
    database_url = args.database_url or os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL ou --geo-map est requis pour résoudre les UUID.")
    geo_rows = query_geo_map(database_url)
    if args.map_output:
        Path(args.map_output).write_text(json.dumps(geo_rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return geo_rows


def build_indexes(geo_rows: list[dict[str, str]]) -> tuple[dict[str, str], dict[tuple[str, str], str], dict[tuple[str, str, str], dict[str, str]]]:
    regions: dict[str, str] = {}
    departments: dict[tuple[str, str], str] = {}
    arrondissements: dict[tuple[str, str, str], dict[str, str]] = {}
    for row in geo_rows:
        region = normalize(row["region_name"])
        department = normalize(row["department_name"])
        arrondissement = normalize(row["arrondissement_name"])
        regions[region] = row["region_id"]
        departments[(region, department)] = row["department_id"]
        arrondissements[(region, department, arrondissement)] = row
    return regions, departments, arrondissements


def resolve_geo_key(region: str, department: str, commune: str) -> tuple[str, str, str]:
    return GEO_KEY_ALIASES.get((region, department, commune), (region, department, commune))


def write_report(path: Path, total_rows: int, unmatched: list[dict[str, str]], source: str, output: Path) -> None:
    matched = total_rows - len(unmatched)
    unmatched_keys = sorted(
        {
            (
                row["region_name"],
                row["department_name"],
                row["commune_name"],
                row["match_status"],
            )
            for row in unmatched
        }
    )
    lines = [
        "# Geo UUID match report - ELECAM 2025 polling stations",
        "",
        f"- Source CSV: `{source}`",
        f"- Output CSV: `{output}`",
        f"- Rows: {total_rows}",
        f"- Matched rows: {matched}",
        f"- Unmatched rows: {len(unmatched)}",
        "",
        "Unmatched commune keys:",
    ]
    if not unmatched_keys:
        lines.append("- None")
    else:
        for region, department, commune, status in unmatched_keys[:200]:
            lines.append(f"- {region} / {department} / {commune}: {status}")
        if len(unmatched_keys) > 200:
            lines.append(f"- ... {len(unmatched_keys) - 200} more")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--canonical-input", default=str(DEFAULT_CANONICAL))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--report", default=str(DEFAULT_REPORT))
    parser.add_argument("--geo-map")
    parser.add_argument("--database-url")
    parser.add_argument("--map-output", default=str(DEFAULT_MAP_OUTPUT))
    args = parser.parse_args()

    canonical_path = Path(args.canonical_input)
    output_path = Path(args.output)
    report_path = Path(args.report)
    rows = read_csv(canonical_path)
    geo_rows = load_geo_map(args)
    regions, departments, arrondissements = build_indexes(geo_rows)

    output_rows: list[dict[str, str]] = []
    unmatched: list[dict[str, str]] = []
    for row in rows:
        region = normalize(row["region_name"])
        department = normalize(row["department_name"])
        commune = normalize(row["commune_name"])
        region, department, commune = resolve_geo_key(region, department, commune)
        geo = arrondissements.get((region, department, commune))
        region_id = regions.get(region, "")
        department_id = departments.get((region, department), "")
        arrondissement_id = geo["arrondissement_id"] if geo else ""

        match_status = "matched"
        if not region_id:
            match_status = "missing_region"
        elif not department_id:
            match_status = "missing_department"
        elif not arrondissement_id:
            match_status = "missing_arrondissement"

        out = {
            "code": row["code"],
            "name": row["polling_station_name"],
            "region_id": region_id,
            "department_id": department_id,
            "arrondissement_id": arrondissement_id,
            "registered_voters": row["registered_voters"],
            "location_name": " / ".join(
                part
                for part in [
                    row["region_name"],
                    row["department_name"],
                    row["commune_name"],
                    row["location_name"],
                ]
                if part
            ),
            "latitude": "",
            "longitude": "",
            "source_document_slug": row.get("source_document_slug", ""),
            "source_sha256": row.get("source_sha256", ""),
            "source_position": row.get("source_position", ""),
            "source_confidence": row.get("confidence", ""),
        }
        output_rows.append(out)
        if match_status != "matched":
            unmatched.append({**row, "match_status": match_status})

    write_csv(
        output_path,
        [
            "code",
            "name",
            "region_id",
            "department_id",
            "arrondissement_id",
            "registered_voters",
            "location_name",
            "latitude",
            "longitude",
            "source_document_slug",
            "source_sha256",
            "source_position",
            "source_confidence",
        ],
        output_rows,
    )
    write_report(report_path, len(output_rows), unmatched, str(canonical_path), output_path)

    print(f"OK wrote {len(output_rows)} polling stations")
    print(f"unmatched={len(unmatched)}")
    print(f"output={output_path}")
    return 1 if unmatched else 0


if __name__ == "__main__":
    sys.exit(main())
