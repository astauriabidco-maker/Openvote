#!/usr/bin/env python3
"""Validate BUCREP 2023 department population CSV against published totals."""

from __future__ import annotations

import csv
import sys
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data/sources/official/structured/bucrep-2023-department-population.csv"

EXPECTED_REGIONS = {
    "AD": 1525175,
    "CE": 5204170,
    "ES": 1200281,
    "EN": 5573289,
    "LT": 4247503,
    "NO": 3753485,
    # The regional table says 1,774,119; department rows sum to 1,774,109.
    "NW": 1774109,
    "OU": 3315190,
    "SU": 938738,
    "SW": 1324187,
}
EXPECTED_NATIONAL_FROM_DEPARTMENTS = 28856127
EXPECTED_ROWS = 58


def main() -> int:
    by_region: dict[str, int] = defaultdict(int)
    rows = 0

    with CSV_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            rows += 1
            by_region[row["region_code"]] += int(row["population"])

    failures = []
    if rows != EXPECTED_ROWS:
        failures.append(f"expected {EXPECTED_ROWS} rows, got {rows}")

    for region_code, expected in EXPECTED_REGIONS.items():
        actual = by_region[region_code]
        if actual != expected:
            failures.append(f"{region_code}: expected {expected}, got {actual}")

    national = sum(by_region.values())
    if national != EXPECTED_NATIONAL_FROM_DEPARTMENTS:
        failures.append(
            f"national department sum: expected {EXPECTED_NATIONAL_FROM_DEPARTMENTS}, got {national}"
        )

    if failures:
        for failure in failures:
            print(f"FAIL {failure}", file=sys.stderr)
        return 1

    print(f"OK {rows} rows, national department sum={national}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
