"""
Every candidate the srcset advertises must exist on disk.

    python tools/check-srcset.py

Why this exists
---------------
`src/pages.ts` builds each srcset with `w <= sourceWidth`, so a 1600px source
advertises a 1600w candidate. `tools/make-derivatives.py` used to generate only
`w < im.width`. The two disagreed for exactly-equal widths, and 16 of the 50
frames shipped advertising a file that was never written.

The browser trusted the srcset, requested -1600w.webp, got a 404, and fell
back to the full-size original — 604kB fetched for three visible frames, on
production, for weeks. Nothing caught it: check-images.mjs asserts the images
that DO load are intact, so a 404 on the preferred candidate is invisible to it.
This tool asserts the promise the markup makes.

Fails loudly rather than shipping. Run before `npm run build`.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GALLERY = ROOT / "public" / "gallery"
EXTS = {".jpg", ".jpeg", ".png"}
WIDTHS = (400, 800, 1200, 1600)  # must match WIDTHS in src/pages.ts

src_pages = (ROOT / "src" / "pages.ts").read_text(encoding="utf-8")
m = re.search(r"const WIDTHS = \[([^\]]+)\]", src_pages)
if not m:
    raise SystemExit("could not find WIDTHS in src/pages.ts — update this check")
ts_widths = tuple(int(x) for x in re.findall(r"\d+", m.group(1)))
if ts_widths != WIDTHS:
    raise SystemExit(
        f"src/pages.ts advertises {ts_widths} but this check tests {WIDTHS}. "
        f"They have drifted; fix one before shipping."
    )

sources = sorted(
    p for p in GALLERY.iterdir() if p.suffix.lower() in EXTS and not re.search(r"-\d+w$", p.stem)
)
if not sources:
    print("no source frames in public/gallery")
    sys.exit(1)

missing: list[str] = []
checked = 0

for src in sources:
    width = Image.open(src).width
    for w in WIDTHS:
        if w > width:
            continue  # srcset caps at source width, so it is never advertised
        checked += 1
        for ext in ("webp", "jpg"):
            stem = src.stem
            if not (GALLERY / f"{stem}-{w}w.{ext}").exists():
                missing.append(f"{stem}-{w}w.{ext}")

print(f"{len(sources)} source frame(s), {checked} advertised candidate(s) checked")

if missing:
    print(f"FAIL  {len(missing)} advertised derivative(s) do not exist:")
    for m_ in missing[:20]:
        print("   ", m_)
    print("\nFix: python tools/make-derivatives.py   (it must cover every width")
    print("the srcset advertises — see the inclusive `w <= im.width` note there.)")
    sys.exit(1)

print("ok    every candidate the srcset advertises exists on disk")
