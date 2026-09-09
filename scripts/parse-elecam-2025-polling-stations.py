#!/usr/bin/env python3
"""Parse ELECAM 2025 polling-station text extractions into CSV files.

The parser consumes the verified PDF text extractions listed in
data/sources/official/elecam-election-wave-manifest.json. It produces:

- canonical CSV with administrative names/codes and source metadata
- upload CSV shaped for the existing /admin/polling-stations/import-csv endpoint
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "data/sources/official/elecam-election-wave-manifest.json"
DEFAULT_CANONICAL = ROOT / "data/sources/official/structured/elecam-2025-polling-stations.csv"
DEFAULT_UPLOAD = ROOT / "data/sources/official/structured/elecam-2025-polling-stations-upload.csv"
DEFAULT_REPORT = ROOT / "data/sources/official/structured/elecam-2025-polling-stations-validation.md"
DEFAULT_REVIEW = ROOT / "data/sources/official/structured/elecam-2025-polling-stations-review.csv"

REGION_CODES = {
    "ADAMAOUA": "AD",
    "CENTRE": "CE",
    "EST": "ES",
    "EXTREME-NORD": "EN",
    "EXTRÊME-NORD": "EN",
    "LITTORAL": "LT",
    "NORD": "NO",
    "NORD-OUEST": "NW",
    "NORTH-WEST": "NW",
    "SUD": "SU",
    "SUD-OUEST": "SW",
    "SOUTH-WEST": "SW",
}


HEADER_RE = re.compile(
    r"^\s*REGION\s*:\s*(?P<region>.*?)\s+DEPARTEMENT\s*:\s*(?P<department>.*?)\s+COMMUNE\s*:\s*(?P<commune>.*?)\s*$",
    re.IGNORECASE,
)
ALT_HEADER_RE = re.compile(
    r"^\s*REGION\s*:\s*(?P<region>.*?)\s{2,}(?P<department>[A-Z][A-Z '\-.]+?)\s+COMMUNE\s*:\s*(?P<commune>.*?)\s*$",
    re.IGNORECASE,
)
ROW_RE = re.compile(r"^\s*(?P<pos>\d+)\s+(?P<body>.*?)\s+(?P<count>\d[\d ]*)\s*$")
TOTAL_RE = re.compile(
    r"Total bureaux de vote / Polling stations\s*:\s*(?P<stations>\d[\d ]*)\s+Total électeurs / voters\s*:\s*(?P<voters>\d[\d ]*)",
    re.IGNORECASE,
)


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" :\t")


def normalize_key(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = normalize_space(value).upper()
    value = value.replace("’", "'")
    return value


def slug(value: str) -> str:
    value = normalize_key(value)
    value = re.sub(r"[^A-Z0-9]+", "-", value).strip("-")
    return value or "UNKNOWN"


def parse_int(value: str) -> int:
    return int(value.replace(" ", ""))


def parse_station_count(value: str) -> int:
    count = parse_int(value)
    if count > 700 and " " in value.strip():
        return int(value.strip().split()[-1])
    return count


def split_station_and_location(body: str) -> tuple[str, str]:
    parts = re.split(r"\s{2,}", body)
    if len(parts) >= 2:
        return normalize_space(parts[0]), normalize_space(" ".join(parts[1:]))
    return normalize_space(body), ""


def build_row(
    doc: dict,
    current: dict[str, str],
    pos: str,
    station_name: str,
    location: str,
    count: int,
) -> dict:
    region_key = normalize_key(current["region"])
    region_code = REGION_CODES.get(region_key, slug(current["region"])[:2])
    department_code = f"{region_code}-{slug(current['department'])}"
    commune_code = f"{department_code}-{slug(current['commune'])}"
    polling_station_code = f"ELECAM-2025-{commune_code}-{int(pos):04d}"

    return {
        "code": polling_station_code,
        "source_position": int(pos),
        "region_code": region_code,
        "region_name": current["region"],
        "department_code": department_code,
        "department_name": current["department"],
        "commune_code": commune_code,
        "commune_name": current["commune"],
        "polling_station_name": station_name,
        "registered_voters": count,
        "location_name": location,
        "source_document_slug": doc["slug"],
        "source_sha256": doc["sha256_checksum"],
        "confidence": doc["confidence"],
    }


def parse_text(doc: dict, text: str) -> tuple[list[dict], list[dict]]:
    rows: list[dict] = []
    totals: list[dict] = []
    current = {"region": "", "department": "", "commune": ""}
    pending_pos: str | None = None
    pending_name = ""
    pending_location = ""
    pending_count = 0

    def flush_pending() -> None:
        nonlocal pending_pos, pending_name, pending_location, pending_count
        if not pending_pos:
            return
        rows.append(
            build_row(
                doc,
                current,
                pending_pos,
                pending_name,
                pending_location,
                pending_count,
            )
        )
        pending_pos = None
        pending_name = ""
        pending_location = ""
        pending_count = 0

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        header = HEADER_RE.match(line) or ALT_HEADER_RE.match(line)
        if header:
            flush_pending()
            current = {
                "region": normalize_space(header.group("region")),
                "department": normalize_space(header.group("department")),
                "commune": normalize_space(header.group("commune")),
            }
            pending_pos = None
            pending_name = ""
            pending_location = ""
            pending_count = 0
            continue

        total = TOTAL_RE.search(line)
        if total and current["commune"]:
            flush_pending()
            totals.append(
                {
                    **current,
                    "expected_stations": parse_int(total.group("stations")),
                    "expected_voters": parse_int(total.group("voters")),
                }
            )
            continue

        continuation = normalize_space(line)
        if pending_pos and continuation and " / " in continuation:
            rows.append(
                build_row(
                    doc,
                    current,
                    pending_pos,
                    normalize_space(f"{pending_name} {continuation}"),
                    pending_location,
                    pending_count,
                )
            )
            pending_pos = None
            pending_name = ""
            pending_location = ""
            pending_count = 0
            continue

        match = ROW_RE.match(line)
        if not match or not current["commune"]:
            continue

        pos = match.group("pos")
        if pending_pos and pending_pos != pos:
            flush_pending()

        body = match.group("body")
        count = parse_station_count(match.group("count"))
        station_name, location = split_station_and_location(body)

        if pending_pos == pos:
            station_name = normalize_space(f"{pending_name} {station_name}")
            location = location or pending_location
            count = count or pending_count
            pending_pos = None
            pending_name = ""
            pending_location = ""
            pending_count = 0
        elif not location and " / " not in station_name:
            pending_pos = pos
            pending_name = station_name
            pending_location = location
            pending_count = count
            continue

        rows.append(build_row(doc, current, pos, station_name, location, count))

    flush_pending()
    return rows, totals


def load_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def compare_totals(rows: list[dict], totals: list[dict]) -> tuple[list[tuple[dict, dict]], dict[tuple[str, str, str], dict[str, int]]]:
    by_commune: dict[tuple[str, str, str], dict[str, int]] = {}
    for row in rows:
        key = (row["region_name"], row["department_name"], row["commune_name"])
        stats = by_commune.setdefault(key, {"stations": 0, "voters": 0})
        stats["stations"] += 1
        stats["voters"] += int(row["registered_voters"])

    mismatches = []
    for total in totals:
        key = (total["region"], total["department"], total["commune"])
        actual = by_commune.get(key, {"stations": 0, "voters": 0})
        if actual["stations"] != total["expected_stations"] or actual["voters"] != total["expected_voters"]:
            mismatches.append((total, actual))
    return mismatches, by_commune


def mark_confidence(rows: list[dict], mismatches: list[tuple[dict, dict]]) -> None:
    mismatched_keys = {
        (total["region"], total["department"], total["commune"])
        for total, _actual in mismatches
    }
    for row in rows:
        key = (row["region_name"], row["department_name"], row["commune_name"])
        if key in mismatched_keys:
            row["confidence"] = "needs_review"


def write_review_csv(
    path: Path,
    rows: list[dict],
    mismatches: list[tuple[dict, dict]],
    fieldnames: list[str],
) -> None:
    mismatch_by_key = {
        (total["region"], total["department"], total["commune"]): (total, actual)
        for total, actual in mismatches
    }
    review_rows = []
    for row in rows:
        key = (row["region_name"], row["department_name"], row["commune_name"])
        if key not in mismatch_by_key:
            continue
        total, actual = mismatch_by_key[key]
        review_rows.append(
            {
                **row,
                "expected_stations": total["expected_stations"],
                "actual_stations": actual["stations"],
                "expected_voters": total["expected_voters"],
                "actual_voters": actual["voters"],
                "voter_delta": actual["voters"] - total["expected_voters"],
            }
        )
    write_csv(
        path,
        fieldnames
        + [
            "expected_stations",
            "actual_stations",
            "expected_voters",
            "actual_voters",
            "voter_delta",
        ],
        review_rows,
    )


def write_report(path: Path, rows: list[dict], totals: list[dict], skipped: list[str]) -> None:
    mismatches, _by_commune = compare_totals(rows, totals)
    confidence_counts: dict[str, int] = {}
    for row in rows:
        confidence_counts[row["confidence"]] = confidence_counts.get(row["confidence"], 0) + 1

    lines = [
        "# Validation - ELECAM 2025 polling stations",
        "",
        "Source: `data/sources/official/elecam-election-wave-manifest.json`.",
        "",
        f"- Parsed rows: {len(rows)}",
        f"- Communes with published totals: {len(totals)}",
        f"- Total registered voters parsed: {sum(int(r['registered_voters']) for r in rows):,}",
        f"- Total-control mismatches: {len(mismatches)}",
        f"- Rows marked official: {confidence_counts.get('official', 0)}",
        f"- Rows marked needs_review: {confidence_counts.get('needs_review', 0)}",
        f"- Review CSV: `data/sources/official/structured/elecam-2025-polling-stations-review.csv`",
        "",
        "Skipped documents:",
    ]
    lines.extend(f"- `{slug}`" for slug in skipped)
    lines.extend(["", "Mismatches:"])
    if not mismatches:
        lines.append("- None")
    else:
        for total, actual in mismatches[:100]:
            lines.append(
                "- "
                f"{total['region']} / {total['department']} / {total['commune']}: "
                f"stations {actual['stations']} vs {total['expected_stations']}, "
                f"voters {actual['voters']} vs {total['expected_voters']}"
            )
        if len(mismatches) > 100:
            lines.append(f"- ... {len(mismatches) - 100} more")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--canonical-output", default=str(DEFAULT_CANONICAL))
    parser.add_argument("--upload-output", default=str(DEFAULT_UPLOAD))
    parser.add_argument("--report", default=str(DEFAULT_REPORT))
    parser.add_argument("--review-output", default=str(DEFAULT_REVIEW))
    args = parser.parse_args()

    manifest_path = ROOT / args.manifest if not Path(args.manifest).is_absolute() else Path(args.manifest)
    manifest = load_manifest(manifest_path)

    rows: list[dict] = []
    totals: list[dict] = []
    skipped: list[str] = []
    seen_source_rows: set[tuple[str, str, str, str, int, str, int]] = set()
    for doc in manifest.get("documents", []):
        if doc.get("document_type") != "polling_station_list":
            continue
        if doc.get("status") not in {"verified", "extracted"}:
            skipped.append(doc["slug"])
            continue
        text_path = ROOT / doc["extracted_text_path"]
        text = text_path.read_text(encoding="utf-8", errors="replace")
        if not text.strip():
            skipped.append(doc["slug"])
            continue
        doc_rows, doc_totals = parse_text(doc, text)
        for row in doc_rows:
            source_key = (
                row["source_document_slug"],
                row["region_name"],
                row["department_name"],
                row["commune_name"],
                int(row["source_position"]),
                row["polling_station_name"],
                int(row["registered_voters"]),
            )
            if source_key in seen_source_rows:
                continue
            seen_source_rows.add(source_key)
            rows.append(row)
        totals.extend(doc_totals)

    duplicate_codes = len(rows) - len({row["code"] for row in rows})
    if duplicate_codes:
        print(f"duplicate generated polling-station codes: {duplicate_codes}", file=sys.stderr)
        return 1

    mismatches, _by_commune = compare_totals(rows, totals)
    mark_confidence(rows, mismatches)

    canonical_fields = [
        "code",
        "source_position",
        "region_code",
        "region_name",
        "department_code",
        "department_name",
        "commune_code",
        "commune_name",
        "polling_station_name",
        "registered_voters",
        "location_name",
        "source_document_slug",
        "source_sha256",
        "confidence",
    ]
    write_csv(Path(args.canonical_output), canonical_fields, rows)
    write_review_csv(Path(args.review_output), rows, mismatches, canonical_fields)

    upload_rows = [
        {
            "code": row["code"],
            "name": row["polling_station_name"],
            "region_id": "",
            "department_id": "",
            "arrondissement_id": "",
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
        }
        for row in rows
    ]
    write_csv(
        Path(args.upload_output),
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
        ],
        upload_rows,
    )
    write_report(Path(args.report), rows, totals, skipped)

    canonical_digest = hashlib.sha256(Path(args.canonical_output).read_bytes()).hexdigest()
    print(f"OK parsed {len(rows)} stations")
    print(f"canonical_sha256={canonical_digest}")
    print(f"skipped={','.join(skipped) if skipped else 'none'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
