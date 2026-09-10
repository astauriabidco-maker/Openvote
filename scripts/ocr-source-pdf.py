#!/usr/bin/env python3
"""OCR an official source PDF into a reproducible text extraction."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "data/sources/official/manifest.json"


def load_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def save_manifest(path: Path, manifest: dict) -> None:
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run(command: list[str]) -> None:
    subprocess.run(command, check=True, text=True)


def ocr_pdf(pdf_path: Path, extracted_path: Path, language: str, dpi: int) -> None:
    with tempfile.TemporaryDirectory(prefix="openvote-ocr-") as tmp:
        image_prefix = Path(tmp) / "page"
        run(["pdftoppm", "-r", str(dpi), "-png", str(pdf_path), str(image_prefix)])
        page_paths = sorted(Path(tmp).glob("page-*.png"))
        if not page_paths:
            raise RuntimeError(f"no pages rendered from {pdf_path}")

        texts: list[str] = []
        for page_path in page_paths:
            result = subprocess.run(
                ["tesseract", str(page_path), "stdout", "-l", language, "--psm", "6"],
                check=True,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            page_number = page_path.stem.rsplit("-", 1)[-1]
            texts.append(f"--- page {int(page_number)} ---\n{result.stdout.strip()}\n")

    extracted_path.parent.mkdir(parents=True, exist_ok=True)
    extracted_path.write_text("\n".join(texts).strip() + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--slug", required=True)
    parser.add_argument("--language", default="fra")
    parser.add_argument("--dpi", type=int, default=300)
    parser.add_argument("--write-status", action="store_true")
    args = parser.parse_args()

    for tool in ["pdftoppm", "tesseract"]:
        if shutil.which(tool) is None:
            print(f"{tool} is required.", file=sys.stderr)
            return 2

    manifest_path = Path(args.manifest)
    if not manifest_path.is_absolute():
        manifest_path = ROOT / manifest_path

    manifest = load_manifest(manifest_path)
    doc = next((entry for entry in manifest.get("documents", []) if entry.get("slug") == args.slug), None)
    if not doc:
        raise SystemExit(f"slug not found: {args.slug}")

    pdf_path = ROOT / doc["local_path"]
    extracted_path = ROOT / doc["extracted_text_path"]
    ocr_pdf(pdf_path, extracted_path, args.language, args.dpi)
    print(f"OCR {args.slug}: {doc['extracted_text_path']}")

    if args.write_status:
        doc["status"] = "ocr_extracted"
        notes = doc.get("notes") or ""
        if "OCR" not in notes:
            doc["notes"] = (notes + " OCR texte généré localement avec pdftoppm + tesseract.").strip()
            save_manifest(manifest_path, manifest)
            print(f"UPDATED {manifest_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
