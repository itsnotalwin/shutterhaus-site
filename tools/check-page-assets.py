"""Verify the local resources actually advertised by the five built public pages."""
import os
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1] / "dist"
ORIGIN = "https://shutterhausvisuals.co.za/"
DEPLOY_BASE = urljoin(ORIGIN, os.getenv("BASE_PATH", "./").rstrip("/") + "/")
PAGES = ("index.html", "portfolio.html", "about.html", "services.html", "contact.html")


def local_path(base, reference):
    url = urlsplit(urljoin(urljoin(DEPLOY_BASE, base), reference))
    if url.scheme not in ("https", "http") or url.hostname != urlsplit(ORIGIN).hostname:
        return None
    path = unquote(url.path).removeprefix(urlsplit(DEPLOY_BASE).path).lstrip("/")
    return path + "index.html" if not path or path.endswith("/") else path


class Resources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = set()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for key in ("src", "poster", "data-full"):
            if a.get(key):
                self.references.add(a[key])
        if tag in ("a", "link") and a.get("href"):
            self.references.add(a["href"])
        if a.get("srcset"):
            self.references.update(part.strip().split()[0] for part in a["srcset"].split(",") if part.strip())
        if (a.get("property") or a.get("name")) in ("og:image", "twitter:image") and a.get("content"):
            self.references.add(a["content"])


def public_paths(read):
    paths = set(PAGES)
    for page in PAGES:
        parser = Resources()
        parser.feed(read(page))
        paths.update(path for ref in parser.references if (path := local_path(page, ref)))
    for css in sorted(path for path in paths if path.endswith(".css")):
        urls = re.findall(r"""url\(\s*['"]?([^)'"]+)['"]?\s*\)""", read(css))
        paths.update(path for ref in urls if (path := local_path(css, ref.strip())))
    return paths


if __name__ == "__main__":
    paths = public_paths(lambda path: (ROOT / path).read_text(encoding="utf-8"))
    missing = sorted(path for path in paths if not (ROOT / path).is_file() or (ROOT / path).stat().st_size == 0)
    if missing:
        raise SystemExit("Missing or empty published resources:\n" + "\n".join(missing))
    print(f"Verified {len(paths)} published resources, including responsive images, originals, ink, fonts and page links.")
