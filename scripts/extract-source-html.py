#!/usr/bin/env python3
"""Extract readable text from official HTML source documents."""

from __future__ import annotations

import argparse
import html.parser
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "data/sources/official/manifest.json"


class TextExtractor(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.skip_stack: list[str] = []
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self.skip_stack.append(tag)
        if tag in {"p", "div", "section", "article", "h1", "h2", "h3", "li", "br"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if self.skip_stack and self.skip_stack[-1] == tag:
            self.skip_stack.pop()
        if tag in {"p", "div", "section", "article", "h1", "h2", "h3", "li"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.skip_stack:
            return
        text = re.sub(r"\s+", " ", data).strip()
        if text:
            self.parts.append(text)

    def text(self) -> str:
        text = "\n".join(part.strip() for part in self.parts if part.strip())
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip() + "\n"


def load_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def save_manifest(path: Path, manifest: dict) -> None:
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--slug", help="Extract only one document slug.")
    parser.add_argument("--write-status", action="store_true")
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    if not manifest_path.is_absolute():
        manifest_path = ROOT / manifest_path

    manifest = load_manifest(manifest_path)
    changed = False
    failures = 0
    for doc in manifest.get("documents", []):
        slug = doc.get("slug", "<missing-slug>")
        if args.slug and slug != args.slug:
            continue

        local_path = ROOT / doc["local_path"]
        if local_path.suffix.lower() not in {".html", ".htm"}:
            continue
        if not local_path.exists():
            print(f"SKIP {slug}: missing {doc['local_path']}")
            continue

        try:
            extractor = TextExtractor()
            extractor.feed(local_path.read_text(encoding="utf-8", errors="replace"))
            extracted_path = ROOT / doc["extracted_text_path"]
            extracted_path.parent.mkdir(parents=True, exist_ok=True)
            extracted_path.write_text(extractor.text(), encoding="utf-8")
        except Exception as exc:
            print(f"FAIL {slug}: {exc}", file=sys.stderr)
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
