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
import datetime as dt
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SITE = "https://shutterhausvisuals.co.za"

# The same numeric prices power visible cards, booking options and metadata.
pricing = json.loads((ROOT / "src" / "pricing.json").read_text(encoding="utf-8"))
package_prices = [tier["price"] for tier in pricing["tiers"]]
if not package_prices or any(
    isinstance(price, bool) or not isinstance(price, (int, float)) or not math.isfinite(price) or price <= 0
    for price in package_prices
):
    raise SystemExit("FAIL: package prices must be positive numeric ZAR amounts")
if len({tier["name"] for tier in pricing["tiers"]}) != len(package_prices):
    raise SystemExit("FAIL: package names must be unique for booking links")


def rand(amount: float) -> str:
    return "R" + f"{amount:,.2f}".rstrip("0").rstrip(".")

# id, filename, <title>, meta description
# The title/description here is what a crawler or a WhatsApp preview reads.
ROUTES = [
    (
        "home",
        "index.html",
        "Shutterhaus Visuals | photography in Gauteng",
        "Portraits, couples, families and social content, shot on location across Gauteng by Alwin Newman. Shutterhaus Visuals, Pretoria.",
    ),
    (
        "portfolio",
        "portfolio.html",
        "Portfolio | Shutterhaus Visuals",
        "Selected portrait and place photography from sessions shot around Gauteng. Portraits, couples, families and social content.",
    ),
    (
        "about",
        "about.html",
        "About | Shutterhaus Visuals",
        "Alwin Newman is a photographer working across Gauteng, shooting portraits, couples, families and social content on location.",
    ),
    (
        "services",
        "services.html",
        "Services & pricing | Shutterhaus Visuals",
        "Photography packages and pricing for portraits, couples, families and social content, shot on location across Gauteng, South Africa.",
    ),
    (
        "contact",
        "contact.html",
        "Contact | Shutterhaus Visuals",
        "Enquire about a photography session in Gauteng. WhatsApp or email Alwin Newman at Shutterhaus Visuals. Evenings and weekends by appointment.",
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

    <link rel="preload" href="./fonts/inter-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="./fonts/archivo-black-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin />

    <meta property="og:title" content="{og_title}" />
    <meta property="og:description" content="{description}" />
    <meta property="og:type" content="website" />
    <!-- og:title used to be the <title> cut at the first em dash, which threw
         the brand away: "Portfolio", "About", "Contact". A WhatsApp or Facebook
         share showed a bare section name. It is the full title now. -->
    <meta property="og:site_name" content="Shutterhaus Visuals" />
    <!-- en_ZA, not en_US. The site only ever serves South Africa, and a
         locale that matches the business is the one a local-intent click
         should be attributed to. -->
    <meta property="og:locale" content="en_ZA" />
    <!-- Share cards. Without og:image every WhatsApp/Instagram/Facebook share
         of this link renders as bare grey text, and for a photographer the
         shared link IS the portfolio. Regenerate with tools/og-card.py.
         One card is shared by all five routes on purpose: it is the same
         photographer either way, and the dimensions below are measured from
         the actual bytes, not assumed. -->
    <meta property="og:image" content="{site}/og-card.jpg" />
    <meta property="og:image:secure_url" content="{site}/og-card.jpg" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:url" content="{url}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Black and white portrait from a Shutterhaus Visuals session" />

    <!-- X/Twitter falls back to the og:* tags for these, so the card already
         rendered. They are declared explicitly because the fallback is
         documented behaviour rather than a guarantee, and a silent card
         regression on the platform Alwin posts links to is not something to
         discover after the ad spend. -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{og_title}" />
    <meta name="twitter:description" content="{description}" />
    <meta name="twitter:image" content="{site}/og-card.jpg" />
    <meta name="twitter:image:alt" content="Black and white portrait from a Shutterhaus Visuals session" />

    <!-- The custom domain is canonical; github.io serves the same build.
         This is the ONE thing the split fixes for real: before it, every page
         declared the apex as canonical, so search engines were told the whole
         site was a single document. Each page now names ITSELF. -->
    <link rel="canonical" href="{url}" />

    <!-- Icons as REAL FILES, not inline data URIs.
         This was a black "S" emitted as `href="data:image/svg+xml,..."`, which
         browsers honour and therefore looked fine in a tab for months. Google
         does not: it wants a fetchable icon file and substitutes its own grey
         globe placeholder when it cannot get one, which is what Alwin was
         seeing next to the site in search results. `shortcut icon` is listed
         first so the legacy favicon.ico probe wins; the explicit sizes follow
         for anything that prefers them, and apple-touch-icon is what iOS uses
         for a home-screen bookmark. Generated by tools/make-favicon.py. -->
    <link rel="shortcut icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/favicon.ico" sizes="32x32" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <!-- Breadcrumbs for the SERP trail. A photographer's subpages are
         otherwise four flat results with no indication they sit under a home
         page. Marked up as JSON-LD rather than a visible trail because a
         breadcrumb bar is not copy Alwin asked for. -->
    <script type="application/ld+json">
{ld}
    </script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./src/main.ts"></script>
  </body>
</html>
"""


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace('"', "&quot;")


# ---------------------------------------------------------------------------
# Structured data
# ---------------------------------------------------------------------------
# WHY THERE IS JSON-LD AT ALL
# A one-person photography studio is exactly the business a LocalBusiness
# knowledge panel is built for: one named person, one phone number, one area
# served, one Instagram. Without markup, Google has to infer all of that from
# page copy, and for a local "photographer near me" query the inference is worth
# real clicks. ProfessionalService is the subtype that fits — it is a LocalBusiness
# for a trade rather than a shop with opening hours and a menu.
#
# WHAT IS DELIBERATELY NOT HERE
# No aggregateRating and no Review. A rating Alwin has not earned is a lie in a
# schema.org field that search engines read as a claim by the business, and
# self-published review markup is a manual-action risk. The packages on
# /services are NOT declared as Offer nodes either: the prices there are the
# current ones, but a price in structured data that later drifts from the page
# is worse than no price at all. priceRange below is the only price claim, and
# it is derived from the four tiers actually listed.
#
# Business identity below is maintained here; prices come from pricing.json.
ALWIN = {
    "@type": "Person",
    "@id": f"{SITE}/#alwin",
    "name": "Alwin Newman",
    "jobTitle": "Photographer",
    "worksFor": {"@id": f"{SITE}/#business"},
    "url": f"{SITE}/about.html",
}

BIZ = {
    "@type": "ProfessionalService",
    "@id": f"{SITE}/#business",
    "name": "Shutterhaus Visuals",
    "description": (
        "Photography studio shooting portraits, couples, families and social "
        "content on location across Gauteng."
    ),
    "url": f"{SITE}/",
    "email": "alwin@shutterhausvisuals.co.za",
    "image": f"{SITE}/og-card.jpg",
    "priceRange": f"{rand(min(package_prices))}–{rand(max(package_prices))}",
    "areaServed": [
        {"@type": "City", "name": "Pretoria"},
        {"@type": "City", "name": "Johannesburg"},
        {"@type": "AdministrativeArea", "name": "Gauteng"},
    ],
    "address": {
        "@type": "PostalAddress",
        "addressRegion": "Gauteng",
        "addressCountry": "ZA",
    },
    "founder": {"@id": f"{SITE}/#alwin"},
    "sameAs": ["https://instagram.com/shutterhausvisuals"],
}


def json_ld(filename: str, title: str, description: str) -> str:
    """The @graph block for one route.

    Every page carries the same business node plus a WebPage node describing
    that specific page. Repeating the business on all five is deliberate, not
    sloppy: the @id is identical everywhere, so these merge into one entity
    rather than becoming five competing businesses.

    BreadcrumbList is on the subpages only, and the homepage is omitted from it
    because the breadcrumb trail has to start at Home for the last item to be
    a real step, not a truncation.
    """
    url = f"{SITE}/" if filename == "index.html" else f"{SITE}/{filename}"
    graph = [
        BIZ,
        # The founder is on /about and is named on every page, so the Person
        # node is too. A @id referenced by "founder" but never defined is a
        # dangling reference, which is worse than omitting the founder field.
        ALWIN,
        {
            "@type": "WebPage",
            "@id": f"{url}#webpage",
            "url": url,
            "name": title,
            "description": description,
            "isPartOf": {"@id": f"{SITE}/#website"},
            "about": {"@id": f"{SITE}/#business"},
            "inLanguage": "en-ZA",
        },
    ]
    if filename == "index.html":
        graph.insert(
            1,
            {
                "@type": "WebSite",
                "@id": f"{SITE}/#website",
                "url": f"{SITE}/",
                "name": "Shutterhaus Visuals",
                "inLanguage": "en-ZA",
                "publisher": {"@id": f"{SITE}/#business"},
            },
        )
    else:
        # Subpages reference the WebSite node, which is only defined on the
        # homepage. Without it the graph has a dangling isPartOf edge on four of
        # the five documents, so the node is emitted here too — the same @id in
        # both places, so they merge rather than duplicate.
        graph.append(
            {
                "@type": "WebSite",
                "@id": f"{SITE}/#website",
                "url": f"{SITE}/",
                "name": "Shutterhaus Visuals",
                "inLanguage": "en-ZA",
                "publisher": {"@id": f"{SITE}/#business"},
            }
        )
        graph.append(
            {
                "@type": "BreadcrumbList",
                "@id": f"{url}#breadcrumb",
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": 1,
                        "name": "Home",
                        "item": f"{SITE}/",
                    },
                    {
                        "@type": "ListItem",
                        "position": 2,
                        "name": title.split(" | ")[0],
                        "item": url,
                    },
                ],
            }
        )
    return json.dumps(
        {"@context": "https://schema.org", "@graph": graph},
        indent=2,
        ensure_ascii=False,
    )


written = []
for rid, filename, title, description in ROUTES:
    # `index.html` and `/` are the same document. The homepage declares the bare
    # apex as its canonical so the two URLs are not treated as duplicates — a
    # self-referencing `/index.html` canonical would compete with the apex for
    # the same content, and the apex is the one people share.
    url = f"{SITE}/" if filename == "index.html" else f"{SITE}/{filename}"
    # og:title is the full title, NOT the part before the em dash. The old
    # split produced og:title="Portfolio" / "About" / "Contact" — a share card
    # with no brand name on it, on the one platform (WhatsApp) where a South
    # African business is most likely to be shared.
    og_title = title
    # The JSON is embedded in a <script>, so the only sequence that can break
    # out of it is "</script". Escaping the slash keeps the document well-formed
    # without changing what JSON.parse sees.
    ld = json_ld(filename, title, description).replace("</", "<\\/")
    html = HEAD.format(
        title=esc(title),
        description=esc(description),
        og_title=esc(og_title),
        url=url,
        site=SITE,
        ld=ld,
    )
    (ROOT / filename).write_text(html, encoding="utf-8")
    written.append((filename, rid, title, description))

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
emitted = {rid for _, rid, _, _ in written}
missing = [i for i in nav_ids if i not in emitted]

# ---------------------------------------------------------------------------
# Sitemap
# ---------------------------------------------------------------------------
# Generated HERE, not maintained by hand in public/sitemap.xml. The header
# comment on that file claimed "Generated by tools/build-pages.py — do not
# hand-edit" while nothing in this script wrote it, so ROUTES and the sitemap
# were free to drift: add a page to ROUTES, ship, and the sitemap silently
# keeps listing the old set. Generating it removes that failure mode.
#
# WHAT CHANGED AND WHY
# 1. <lastmod> is now emitted. It was absent entirely. Google uses lastmod to
#    decide how often to recrawl, and the sitemap header comment claimed the
#    whole point of the split was to get these pages indexed — a sitemap with no
#    lastmod undercuts that. It is the build date, ISO 8601, which is the one
#    value that cannot drift out of step with the files.
# 2. /admin.html is still absent, and that is deliberate: it is noindex in its
#    own head AND disallowed in robots.txt. Listing a noindex URL in a sitemap
#    is a contradiction Google warns about.
# 3. The bare apex is used for index.html, matching the canonical the page
#    declares. The sitemap must not advertise a URL the page tells the crawler
#    to ignore.
LASTMOD = dt.date.today().isoformat()
sitemap = ['<?xml version="1.0" encoding="UTF-8"?>']
sitemap.append("<!--")
sitemap.append("  Generated by tools/build-pages.py — do not hand-edit.")
sitemap.append("")
sitemap.append("  Every URL below is built from the ROUTES list in that script, so a")
sitemap.append("  page cannot exist without being listed, or be listed without existing.")
sitemap.append("  The bare apex stands in for index.html because that is the canonical")
sitemap.append("  the homepage declares. /admin.html is deliberately absent: it is")
sitemap.append("  noindex in its own head and disallowed in robots.txt.")
sitemap.append("-->")
sitemap.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
for filename, rid, _, _ in written:
    loc = f"{SITE}/" if filename == "index.html" else f"{SITE}/{filename}"
    freq = "weekly" if rid in ("home", "portfolio") else "monthly"
    prio = {"home": "1.0", "portfolio": "0.9", "services": "0.8", "contact": "0.8"}.get(rid, "0.7")
    sitemap.append("  <url>")
    sitemap.append(f"    <loc>{loc}</loc>")
    sitemap.append(f"    <lastmod>{LASTMOD}</lastmod>")
    sitemap.append(f"    <changefreq>{freq}</changefreq>")
    sitemap.append(f"    <priority>{prio}</priority>")
    sitemap.append("  </url>")
sitemap.append("</urlset>")
sitemap_text = "\n".join(sitemap) + "\n"

# public/ is what vite copies into dist/, and what GitHub Pages serves.
(ROOT / "public" / "sitemap.xml").write_text(sitemap_text, encoding="utf-8")

print(f"{len(written)} page(s) written: " + ", ".join(f for f, _, _, _ in written))
print(f"sitemap.xml written ({len(written)} urls, lastmod {LASTMOD})")
if missing:
    print(f"\nFAIL: nav item(s) with no HTML document: {missing}")
    print("Add it to ROUTES above and re-run.")
    raise SystemExit(1)
print(f"every nav route has a document: {nav_ids}")

# ---------------------------------------------------------------------------
# Self-check
# ---------------------------------------------------------------------------
# The metadata is the one thing on this site that no browser ever renders, so a
# typo in it ships silently and is invisible until a share card looks wrong. The
# checks below are the ones that actually caught problems during this pass.
problems = []
seen_titles, seen_descs = {}, {}
for filename, rid, title, description in written:
    if len(title) > 60:
        problems.append(f"{filename}: title is {len(title)} chars (Google truncates past ~60): {title!r}")
    if not (120 <= len(description) <= 160):
        problems.append(f"{filename}: description is {len(description)} chars, want 120-160")
    if title in seen_titles:
        problems.append(f"{filename}: title duplicates {seen_titles[title]}: {title!r}")
    if description in seen_descs:
        problems.append(f"{filename}: description duplicates {seen_descs[description]}")
    seen_titles[title] = filename
    seen_descs[description] = filename

    # The generated JSON must parse, and must not claim a review.
    doc = json.loads(json_ld(filename, title, description))
    blob = json.dumps(doc)
    for banned in ("aggregateRating", '"review"', '"rating"'):
        if banned in blob:
            problems.append(f"{filename}: structured data contains {banned} — must be earned, not invented")
    # Every @id referenced must be defined, or the graph has a dangling edge.
    defined = {n["@id"] for n in doc["@graph"] if "@id" in n}
    for node in doc["@graph"]:
        for key, val in node.items():
            if isinstance(val, dict) and "@id" in val and val["@id"] not in defined:
                problems.append(f"{filename}: {node['@type']}.{key} -> undefined @id {val['@id']}")

# The og:image dims are asserted here as literal numbers. They are a claim about
# the bytes of a binary asset; if tools/og-card.py ever changes the output size
# this constant is the thing that goes stale, so it is checked against the file.
og = ROOT / "public" / "og-card.jpg"
if og.exists():
    try:
        from PIL import Image

        with Image.open(og) as im:
            w, h = im.size
        if (w, h) != (1200, 630):
            problems.append(f"og-card.jpg is {w}x{h} but the meta declares 1200x630")
    except ImportError:
        print("note: Pillow not installed, skipped the og-card.jpg size check")
else:
    problems.append("public/og-card.jpg is missing — every share card points at it")

# The favicon files must exist as real files on disk.
#
# This check is here because the failure is invisible: a missing favicon.ico
# still builds, still deploys, and still renders a correct tab icon, because the
# browser falls back to its own default. Only a search engine shows the problem,
# and only as a grey globe beside the site in Google, which is how Alwin found
# it. Nothing else in this build would ever have surfaced it.
ICON_FILES = ["favicon.ico", "favicon-32.png", "apple-touch-icon.png"]
for icon in ICON_FILES:
    if not (ROOT / "public" / icon).exists():
        problems.append(
            f"public/{icon} is missing — Google serves a grey globe without it "
            f"(run: python tools/make-favicon.py)"
        )

# The pages must point at files, not at a data: URI. The inline data-URI icon was
# the original defect and it builds perfectly cleanly, so it needs its own
# assertion rather than being implied by the file check above.
if 'rel="icon" href="data:' in html:
    problems.append(
        "an icon link still uses an inline data: URI — crawlers cannot fetch "
        "those, so Google shows the grey globe placeholder"
    )

if problems:
    print("\nFAIL:")
    for p in problems:
        print("  - " + p)
    raise SystemExit(1)
print("metadata self-check passed: titles <=60, descriptions 120-160, no duplicates, JSON-LD parses")
