#!/usr/bin/env python3
"""Dependency-free structural checks for the EdwardsApps static site."""

from __future__ import annotations

import json
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]


class PageParser(HTMLParser):
    def __init__(self, path: Path) -> None:
        super().__init__(convert_charrefs=True)
        self.path = path
        self.lang = ""
        self.title_parts: list[str] = []
        self.in_title = False
        self.description = ""
        self.h1_count = 0
        self.ids: set[str] = set()
        self.duplicate_ids: set[str] = set()
        self.references: list[tuple[str, str, int]] = []
        self.json_ld: list[str] = []
        self._json_ld_parts: list[str] | None = None
        self.errors: list[str] = []

    def handle_starttag(self, tag: str, attrs_list: list[tuple[str, str | None]]) -> None:
        attrs = {name: value or "" for name, value in attrs_list}
        line, _ = self.getpos()

        if tag == "html":
            self.lang = attrs.get("lang", "")
        elif tag == "title":
            self.in_title = True
        elif tag == "meta" and attrs.get("name", "").lower() == "description":
            self.description = attrs.get("content", "").strip()
        elif tag == "h1":
            self.h1_count += 1
        elif tag == "img" and "alt" not in attrs:
            self.errors.append(f"line {line}: image is missing an alt attribute")

        element_id = attrs.get("id")
        if element_id:
            if element_id in self.ids:
                self.duplicate_ids.add(element_id)
            self.ids.add(element_id)

        attribute = {"a": "href", "link": "href", "script": "src", "img": "src", "source": "src"}.get(tag)
        if attribute and attrs.get(attribute):
            self.references.append((tag, attrs[attribute], line))

        if tag == "script" and attrs.get("type", "").lower() == "application/ld+json":
            self._json_ld_parts = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self.in_title = False
        elif tag == "script" and self._json_ld_parts is not None:
            self.json_ld.append("".join(self._json_ld_parts).strip())
            self._json_ld_parts = None

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)
        if self._json_ld_parts is not None:
            self._json_ld_parts.append(data)

    @property
    def title(self) -> str:
        return "".join(self.title_parts).strip()


def parse_pages() -> dict[Path, PageParser]:
    pages: dict[Path, PageParser] = {}
    for path in sorted(ROOT.glob("*.html")):
        parser = PageParser(path)
        parser.feed(path.read_text(encoding="utf-8"))
        parser.close()
        pages[path.resolve()] = parser
    return pages


def resolve_reference(page: Path, value: str) -> tuple[Path, str] | None:
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or value.startswith("//"):
        return None
    if not parsed.path and not parsed.fragment:
        return None

    decoded_path = unquote(parsed.path)
    if not decoded_path:
        target = page
    elif decoded_path == "/":
        target = ROOT / "index.html"
    elif decoded_path.startswith("/"):
        target = ROOT / decoded_path.lstrip("/")
    else:
        target = page.parent / decoded_path

    if decoded_path.endswith("/") and decoded_path != "/":
        target = target / "index.html"
    return target.resolve(), unquote(parsed.fragment)


def main() -> int:
    pages = parse_pages()
    errors: list[str] = []

    for path, parser in pages.items():
        label = path.relative_to(ROOT)
        if parser.lang != "en-GB":
            errors.append(f"{label}: html lang must be en-GB")
        if not parser.title:
            errors.append(f"{label}: missing title")
        if path.name != "404.html" and not parser.description:
            errors.append(f"{label}: missing meta description")
        if parser.h1_count != 1:
            errors.append(f"{label}: expected one h1, found {parser.h1_count}")
        for duplicate in sorted(parser.duplicate_ids):
            errors.append(f"{label}: duplicate id {duplicate!r}")
        errors.extend(f"{label}: {message}" for message in parser.errors)

        for index, block in enumerate(parser.json_ld, start=1):
            try:
                json.loads(block)
            except json.JSONDecodeError as exc:
                errors.append(f"{label}: JSON-LD block {index} is invalid: {exc}")

        for tag, value, line in parser.references:
            resolved = resolve_reference(path, value)
            if resolved is None:
                continue
            target, fragment = resolved
            if not target.exists():
                errors.append(f"{label}:{line}: {tag} references missing {value!r}")
                continue
            if fragment and target.suffix.lower() == ".html":
                target_page = pages.get(target)
                if target_page and fragment not in target_page.ids:
                    errors.append(f"{label}:{line}: fragment #{fragment} is missing in {target.relative_to(ROOT)}")

    sitemap_path = ROOT / "sitemap.xml"
    try:
        sitemap = ElementTree.parse(sitemap_path)
        namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        sitemap_urls = {element.text or "" for element in sitemap.findall("sm:url/sm:loc", namespace)}
        expected_urls = {
            "https://edwardsapps.co.uk/" if path.name == "index.html" else f"https://edwardsapps.co.uk/{path.name}"
            for path in pages
            if path.name != "404.html"
        }
        for missing_url in sorted(expected_urls - sitemap_urls):
            errors.append(f"sitemap.xml: missing {missing_url}")
    except ElementTree.ParseError as exc:
        errors.append(f"sitemap.xml: invalid XML: {exc}")

    if errors:
        print("Site checks failed:\n")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Site checks passed for {len(pages)} HTML pages.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
