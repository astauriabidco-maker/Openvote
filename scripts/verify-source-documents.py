#!/usr/bin/env python3
"""Verify official source documents listed in data/sources/official/manifest.json."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "data/sources/official/manifest.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_manifest(path: Path, manifest: dict) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument(
        "--write-missing-checksums",
        action="store_true",
        help="Write computed SHA-256 values into manifest entries that have no checksum.",
    )
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    if not manifest_path.is_absolute():
        manifest_path = ROOT / manifest_path

    manifest = load_manifest(manifest_path)
    failures = 0
    changed = False

    for doc in manifest.get("documents", []):
        slug = doc.get("slug", "<missing-slug>")
        local_path = ROOT / doc["local_path"]

        if not local_path.exists():
            if doc.get("status") == "catalog_tracked":
                print(f"CATALOG {slug}: {doc['source_url']} (no local archive required)")
                continue
            print(f"MISSING {slug}: {doc['local_path']}")
            if doc.get("status") not in {"planned"}:
                failures += 1
            continue

        actual = sha256_file(local_path)
        expected = doc.get("sha256_checksum")
        size = local_path.stat().st_size

        if expected and expected != actual:
            print(f"MISMATCH {slug}: expected {expected}, actual {actual}")
            failures += 1
            continue

        if not expected and args.write_missing_checksums:
            doc["sha256_checksum"] = actual
            doc["file_size_bytes"] = size
            if doc.get("status") == "planned":
                doc["status"] = "downloaded"
            changed = True

        print(f"OK {slug}: sha256={actual} bytes={size}")

    if changed:
        save_manifest(manifest_path, manifest)
        print(f"UPDATED {manifest_path}")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
