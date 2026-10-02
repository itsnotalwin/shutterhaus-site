"""
Generate one HTML file per route from a single head template.

    python tools/build-pages.py && npm run build

WHY THIS EXISTS
---------------
The site was a hash-routed SPA: ONE index.html, and `main.ts` read
`location.hash` to swap `#app`. Everything Google could see was a single
document, so the portfolio, about, services and contact copy were all
invisible to search — one canonical URL for the entire site, and no sitemap.

Alwin asked for the pages split so each is a real document. That is what
this emits: portfolio.html, about.html, services.html, contact.html and
admin.html alongside index.html, each carrying its own title, description,
og:url and canonical.

WHAT THIS DOES NOT DO
--------------------
It does NOT change how a page RENDERS. Every file boots the same
`src/main.ts`, and `route()` reads the FILENAME first (falling back to the
hash, so an old `#/portfolio` link still works). One renderer, many
documents — so there is no second implementation that can drift.

The per-page <title> is also written by the client after load (setTitle in
main.ts), so the static tag matters for crawlers and social scrapers that
never run JS, while a human sees the same string either way.

Keep the route list in one place: ROUTES below is the single source, and
`tools/verify.mjs` asserts every emitted file exists and every nav link in
src/config.ts has a matching document.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SITE = "https://shutterhausvisuals.co.za"

# id, filename, <title>, meta description
# The title/description here is what a crawler or a WhatsApp preview reads.
ROUTES = [
    (
        "home",
        "index.html",
        "Shutterhaus Visuals — photography in Gauteng",
        "Portraits, couples, families and social content, shot on location across Gauteng by Alwin Newman. Shutterhaus Visuals.",
    ),
    (
        "portfolio",
        "portfolio.html",
        "Portfolio — Shutterhaus Visuals",
        "Selected portrait and place photography from sessions shot around Gauteng. Portraits, couples, families and social content.",
    ),
    (
        "about",
        "about.html",
        "About — Shutterhaus Visuals",
        "Alwin Newman is a photographer working across Gauteng, shooting portraits, couples, families and social content on location.",
    ),
    (
        "services",
        "services.html",
        "Services & pricing — Shutterhaus Visuals",
        "Photography packages and pricing for portraits, couples, families and social content, shot on location across Gauteng.",
    ),
    (
        "contact",
        "contact.html",
        "Contact — Shutterhaus Visuals",
        "Enquire about a photography session in Gauteng. WhatsApp, phone or email Alwin Newman at Shutterhaus Visuals.",
    ),
]

HEAD = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <!-- viewport-fit=cover lets the page draw under the notch, the Dynamic
         Island and the home indicator. Without it iOS letterboxes the viewport
         to the safe area and `env(safe-area-inset-*)` resolves to 0 forever, so
         every inset below would be dead code. With it, the header grows a top
         pad, the gutters grow left/right, and the page bottom clears the home
         bar. The env() calls are all wrapped in max() against 0px so a
         desktop browser, where these resolve to nothing, is unaffected. -->
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>{title}</title>
    <meta name="description" content="{description}" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500&display=swap"
      rel="stylesheet"
    />

    <meta property="og:title" content="{og_title}" />
    <meta property="og:description" content="{description}" />
    <meta property="og:type" content="website" />
    <!-- Share cards. Without og:image every WhatsApp/Instagram/Facebook share
         of this link renders as bare grey text, and for a photographer the
         shared link IS the portfolio. Regenerate with tools/og-card.py. -->
    <meta property="og:image" content="{site}/og-card.jpg" />
    <meta property="og:url" content="{url}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Black and white portrait from a Shutterhaus Visuals session" />
    <meta name="twitter:card" content="summary_large_image" />

    <!-- The custom domain is canonical; github.io serves the same build.
         This is the ONE thing the split fixes for real: before it, every page
         declared the apex as canonical, so search engines were told the whole
         site was a single document. Each page now names ITSELF. -->
    <link rel="canonical" href="{url}" />

    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23111'/><text y='72' x='50' text-anchor='middle' font-size='62' font-family='Arial' font-weight='bold' fill='%23fff'>S</text></svg>" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./src/main.ts"></script>
  </body>
</html>
"""


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace('"', "&quot;")


written = []
for rid, filename, title, description in ROUTES:
    # `index.html` and `/` are the same document. The homepage declares the bare
    # apex as its canonical so the two URLs are not treated as duplicates — a
    # self-referencing `/index.html` canonical would compete with the apex for
    # the same content, and the apex is the one people share.
    url = f"{SITE}/" if filename == "index.html" else f"{SITE}/{filename}"
    og_title = title.split(" — ")[0] if " — " in title else title
    html = HEAD.format(
        title=esc(title),
        description=esc(description),
        og_title=esc(og_title),
        url=url,
        site=SITE,
    )
    (ROOT / filename).write_text(html, encoding="utf-8")
    written.append((filename, rid))

# The nav in src/config.ts is the source of truth for which pages must exist.
# If someone adds a nav item and no document, fail loudly here rather than
# shipping a nav link to a 404.
#
# Scoped to the `nav:` array ONLY. A naive scan of the whole file also matches
# `social:` entries, which are external links (instagram, whatsapp) with no
# document and never need one — the first run of this script failed on exactly
# that and it was the check being wrong, not the config.
config = (ROOT / "src" / "config.ts").read_text(encoding="utf-8")
nav_block = re.search(r"\bnav:\s*\[(.*?)\n  \]", config, re.S)
if not nav_block:
    print("FAIL: could not find the `nav:` array in src/config.ts")
    raise SystemExit(1)
nav_ids = re.findall(r'\{\s*id:\s*"([a-z]+)"\s*,\s*label:', nav_block.group(1))
emitted = {rid for _, rid in written}
missing = [i for i in nav_ids if i not in emitted]

print(f"{len(written)} page(s) written: " + ", ".join(f for f, _ in written))
if missing:
    print(f"\nFAIL: nav item(s) with no HTML document: {missing}")
    print("Add it to ROUTES above and re-run.")
    raise SystemExit(1)
print(f"every nav route has a document: {nav_ids}")
