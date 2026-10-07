"""Build route metadata and HTML using the shared public TypeScript renderers.

Each document contains its complete default content before JavaScript runs.
The browser binds navigation/form controls and loads published gallery edits.
Prices are shared with visible cards and booking choices through pricing.json.
"""
import json
import math
import re
import sys
import subprocess
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

# Shared with the browser so hydration and legacy hash links keep the same metadata.
seo = json.loads((ROOT / "src" / "seo.json").read_text(encoding="utf-8"))
ROUTES = [(rid, page["filename"], page["title"], page["description"]) for rid, page in seo.items()]

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
    <div id="app" data-route="{route}">{body}</div>
    <noscript>
      <style>.burger {{ display:none!important }} .site-nav {{ position:static!important; visibility:visible!important; opacity:1!important; transform:none!important; width:auto!important; display:flex!important; flex-direction:row!important; flex-wrap:wrap; align-items:center; gap:14px!important; height:auto!important; padding:0!important; background:#fff!important }} .site-nav {{ flex-basis:100%; }} .site-nav a {{ color:#111!important; width:auto!important; padding:12px 0!important; border:0!important; font-size:11px!important; min-height:44px; }} .site-header {{ display:flex!important; flex-wrap:wrap; height:auto!important; gap:16px!important; position:relative!important; background:#fff!important; color:#111!important }} .site-header .logo,.site-header .site-social {{ color:#111!important }} .site-header .logo {{ order:0; }} .site-header .site-social {{ order:1; margin-left:auto; }} .site-header .site-nav {{ order:2; }} .shell--over .site-header {{ margin-bottom:0!important }} .main {{ padding-top:0!important }} .pf-rows {{ display:block; column-count:3; column-gap:var(--gut); }} .pf-col {{ display:contents; }} .pf-cell {{ break-inside:avoid; margin-bottom:var(--gut); }} @media(max-width:760px) {{ .pf-rows {{ column-count:2; }} }}</style>
    </noscript>
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
        "Kempton Park photographer shooting portraits, couples, families and social "
        "content on location across Gauteng."
    ),
    "url": f"{SITE}/",
    "email": "alwin@shutterhausvisuals.co.za",
    "image": f"{SITE}/og-card.jpg",
    "priceRange": f"{rand(min(package_prices))}–{rand(max(package_prices))}",
    "areaServed": [
        {"@type": "City", "name": "Kempton Park"},
        {"@type": "City", "name": "Johannesburg"},
        {"@type": "AdministrativeArea", "name": "Gauteng"},
    ],
    "address": {
        "@type": "PostalAddress",
        "addressLocality": "Kempton Park",
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


bodies = json.loads(subprocess.check_output(["node", "tools/prerender.mjs"], cwd=ROOT, text=True))
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
        route=rid,
        body=bodies[rid],
        title=esc(title),
        description=esc(description),
        og_title=esc(og_title),
        url=url,
        site=SITE,
        ld=ld,
    )
    html = "\n".join(line.rstrip() for line in html.splitlines()) + "\n"
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
# Only canonical, indexable pages belong here. Omit optional lastmod because
# a build date is not a content-change date, and published photos change independently.
sitemap = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<!-- Generated by tools/build-pages.py. -->',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for filename, rid, _, _ in written:
    loc = f"{SITE}/" if filename == "index.html" else f"{SITE}/{filename}"
    sitemap.extend(["  <url>", f"    <loc>{loc}</loc>", "  </url>"])
sitemap.append("</urlset>")
sitemap_text = "\n".join(sitemap) + "\n"

# public/ is what vite copies into dist/, and what GitHub Pages serves.
(ROOT / "public" / "sitemap.xml").write_text(sitemap_text, encoding="utf-8")

print(f"{len(written)} page(s) written: " + ", ".join(f for f, _, _, _ in written))
print(f"sitemap.xml written ({len(written)} canonical urls)")
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
