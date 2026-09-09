#!/usr/bin/env python3
"""Extract text from official source PDFs using pdftotext."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "data/sources/official/manifest.json"


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
    parser.add_argument("--slug", help="Extract only one document slug.")
    parser.add_argument("--write-status", action="store_true")
    args = parser.parse_args()

    if shutil.which("pdftotext") is None:
        print("pdftotext is required. Install poppler-utils/poppler first.", file=sys.stderr)
        return 2

    manifest_path = Path(args.manifest)
    if not manifest_path.is_absolute():
        manifest_path = ROOT / manifest_path

    manifest = load_manifest(manifest_path)
    failures = 0
    changed = False

    for doc in manifest.get("documents", []):
        slug = doc.get("slug", "<missing-slug>")
        if args.slug and slug != args.slug:
            continue

        local_path = ROOT / doc["local_path"]
        extracted_path = ROOT / doc["extracted_text_path"]

        if not local_path.exists():
            print(f"SKIP {slug}: missing {doc['local_path']}")
            continue

        extracted_path.parent.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(
            ["pdftotext", "-layout", str(local_path), str(extracted_path)],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if result.returncode != 0:
            print(f"FAIL {slug}: {result.stderr.strip()}", file=sys.stderr)
            failures += 1
            continue

        print(f"EXTRACTED {slug}: {doc['extracted_text_path']}")
        if args.write_status and doc.get("status") in {"planned", "downloaded"}:
            doc["status"] = "extracted"
            changed = True

    if changed:
        save_manifest(manifest_path, manifest)
        print(f"UPDATED {manifest_path}")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

