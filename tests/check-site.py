#!/usr/bin/env python3
"""Check the public static pages without network requests or form submissions.

Run with: python3 tests/check-site.py
The sitemap defines the public page inventory; assets/brand/avatar-maker.html
is a separate internal utility, not a public landing page.
"""

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json
import re
import sys
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://pixelmotion.pt"
NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
VOID = set("area base br col embed hr img input link meta param source track wbr".split())
CSS_URL = re.compile(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)")
ISSUES = []


def issue(path, message):
    ISSUES.append(f"{path.relative_to(ROOT)}: {message}")


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.source = path.read_text(encoding="utf-8")
        self.stack = []
        self.ids = []
        self.refs = []
        self.metas = {}
        self.canonicals = []
        self.titles = []
        self.mains = []
        self.h1s = 0
        self.solutions = []
        self.options = []
        self.json_blocks = []
        self.capture = None
        self.buffer = ""
        self.feed(self.source)
        self.close()
        if self.stack:
            issue(path, f"unclosed elements: {self.stack}")

    def handle_starttag(self, tag, pairs):
        attrs = dict(pairs)
        if len(attrs) != len(pairs):
            issue(self.path, f"duplicate attributes on <{tag}>")
        if tag not in VOID:
            self.stack.append(tag)
        if attrs.get("id"):
            self.ids.append(attrs["id"])
        if tag == "html" and attrs.get("lang") != "pt-PT":
            issue(self.path, "expected lang=pt-PT")
        if tag == "main":
            self.mains.append(attrs)
        if tag == "h1":
            self.h1s += 1
        if tag == "title":
            self.capture, self.buffer = "title", ""
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.capture, self.buffer = "json", ""
        if tag == "meta":
            key = attrs.get("name") or attrs.get("property")
            if key:
                self.metas[key] = attrs.get("content", "")
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonicals.append(attrs.get("href", ""))
        if tag == "img" and "alt" not in attrs:
            issue(self.path, f"image missing alt: {attrs.get('src')}")
        if attrs.get("data-solution"):
            self.solutions.append(attrs["data-solution"])
        if tag == "option":
            self.options.append(attrs.get("value"))
        if tag in {"a", "link"} and attrs.get("href"):
            self.refs.append((attrs["href"], tag == "a"))
        for key in ("src", "poster"):
            if attrs.get(key):
                self.refs.append((attrs[key], False))
        if attrs.get("srcset"):
            for candidate in attrs["srcset"].split(","):
                self.refs.append((candidate.strip().split()[0], False))
        for ref in CSS_URL.findall(attrs.get("style", "")):
            self.refs.append((ref, False))

    def handle_endtag(self, tag):
        if tag not in VOID:
            if not self.stack or self.stack[-1] != tag:
                issue(self.path, f"unexpected </{tag}> after {self.stack[-3:]}")
            else:
                self.stack.pop()
        if tag == "title" and self.capture == "title":
            self.titles.append(self.buffer.strip())
            self.capture = None
        if tag == "script" and self.capture == "json":
            try:
                self.json_blocks.append(json.loads(self.buffer))
            except json.JSONDecodeError as exc:
                issue(self.path, f"invalid JSON-LD: {exc}")
            self.capture = None

    def handle_data(self, value):
        if self.capture:
            self.buffer += value


def local_target(source, ref):
    url = urlsplit(ref)
    if url.scheme and url.scheme not in {"http", "https"}:
        return None
    if url.netloc and url.netloc != "pixelmotion.pt":
        return None
    if url.netloc or url.path.startswith("/"):
        path = ROOT / unquote(url.path).lstrip("/")
    elif url.path:
        path = source.parent / unquote(url.path)
    else:
        path = source
    if path.is_dir():
        path /= "index.html"
    return path.resolve(), unquote(url.fragment)


def check_ref(source, ref, fragment=False):
    target = local_target(source, ref)
    if target is None:
        return
    path, anchor = target
    if not path.is_file():
        issue(source, f"missing local target: {ref}")
    elif fragment and anchor and path in PAGES and anchor not in PAGES[path].ids:
        issue(source, f"missing fragment: {ref}")


def check_json_urls(source, item):
    if isinstance(item, dict):
        for key, value in item.items():
            if key in {"url", "image", "thumbnailUrl", "contentUrl", "embedUrl", "item"}:
                for ref in value if isinstance(value, list) else [value]:
                    if isinstance(ref, str) and ref.startswith(ORIGIN):
                        check_ref(source, ref)
            check_json_urls(source, value)
    elif isinstance(item, list):
        for child in item:
            check_json_urls(source, child)


try:
    sitemap = ET.parse(ROOT / "sitemap.xml")
    video_sitemap = ET.parse(ROOT / "video-sitemap.xml")
except ET.ParseError as exc:
    raise SystemExit(f"Invalid sitemap XML: {exc}")

locations = [element.text for element in sitemap.findall("s:url/s:loc", NS)]
if len(locations) != len(set(locations)):
    issue(ROOT / "sitemap.xml", "duplicate page URLs")

PAGES = {}
for location in locations:
    if not location or not location.startswith(ORIGIN + "/"):
        issue(ROOT / "sitemap.xml", f"unexpected origin: {location}")
        continue
    path, _ = local_target(ROOT / "sitemap.xml", location)
    if not path.is_file():
        issue(ROOT / "sitemap.xml", f"missing page: {location}")
        continue
    PAGES[path] = Page(path)

public_files = set(ROOT.glob("*.html")) | set((ROOT / "projetos").glob("*.html"))
public_files.discard(ROOT / "index-old.html")
for path in public_files - set(PAGES):
    issue(path, "public page missing from sitemap")

for location, path in ((url, local_target(ROOT / "sitemap.xml", url)[0]) for url in locations):
    page = PAGES.get(path)
    if page is None:
        continue
    if len(page.mains) != 1 or page.mains[0].get("id") != "main-content":
        issue(path, "expected one main landmark with id=main-content")
    if page.h1s != 1:
        issue(path, f"expected one h1, found {page.h1s}")
    duplicates = [name for name, count in Counter(page.ids).items() if count > 1]
    if duplicates:
        issue(path, f"duplicate ids: {duplicates}")
    if len(page.titles) != 1 or not page.titles[0]:
        issue(path, "expected one nonempty title")
    if not page.metas.get("description"):
        issue(path, "missing meta description")
    if page.canonicals != [location]:
        issue(path, f"canonical does not match sitemap: {page.canonicals}")
    if page.metas.get("og:url") != location:
        issue(path, "og:url does not match canonical")
    if not page.json_blocks:
        issue(path, "missing JSON-LD")
    for ref, fragment in page.refs:
        check_ref(path, ref, fragment)
    for key in ("og:image", "twitter:image"):
        if page.metas.get(key):
            check_ref(path, page.metas[key])
    for block in page.json_blocks:
        check_json_urls(path, block)
    for solution in page.solutions:
        if solution not in page.options:
            issue(path, f"CTA without matching solution option: {solution}")
    if re.search(r"\bfundador(?:es)?\b|mais escolhida", page.source, re.I):
        issue(path, "stale founder offer or unverified popularity claim")
    if re.search(r'<div\s+class="thumb"\s*>\s*</div>', page.source):
        issue(path, "empty portfolio thumbnail")

for sheet in ROOT.glob("*.css"):
    for ref in CSS_URL.findall(sheet.read_text(encoding="utf-8")):
        check_ref(sheet, ref)

for element in video_sitemap.iter():
    if element.text and element.tag.rsplit("}", 1)[-1] in {
        "loc", "thumbnail_loc", "content_loc", "player_loc"
    }:
        check_ref(ROOT / "video-sitemap.xml", element.text)
        if element.tag.rsplit("}", 1)[-1] == "loc" and element.text not in locations:
            issue(ROOT / "video-sitemap.xml", f"page absent from sitemap: {element.text}")

if ISSUES:
    print("\n".join(ISSUES))
    print(f"FAIL: {len(ISSUES)} issue(s) across {len(PAGES)} public pages")
    sys.exit(1)
print(f"PASS: {len(PAGES)} public pages; HTML, metadata, local links/assets, JSON-LD and sitemaps")
