"""
Import a SINGLE photograph into public/gallery/, then generate its derivatives.

import-shoot.py only takes a folder, and this photo arrived on its own in
Downloads. Everything else is the same contract that script establishes:

  - long edge capped at MAX_EDGE (2400). The site never renders wider than the
    1600w derivative and the lightbox shows at most ~92vw, so a 4639px original
    is bytes nobody can see. A 1.9MB upload became a 24MB lightbox download
    before this existed.
  - EXIF orientation baked in, so a phone-shot portrait cannot render sideways.
  - named `{index}-img-{n}.jpg`, matching tools/import-shoot.py's normaliser,
    so the gallery order stays predictable.

Usage:
    python tools/import-one.py <file> [--index 54] [--alt "..."] [--max 2400]

Prints the gallery stem it wrote, so a caller can wire it into config.
"""
import argparse
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
GALLERY = ROOT / "public" / "gallery"
MAX_EDGE = 2400
SAFE_RE = re.compile(r"[^a-z0-9]+")


def normalise(name: str) -> str:
    """'54-IMG_0164.jpg' -> '54-img-0164'."""
    return SAFE_RE.sub("-", Path(name).stem.lower()).strip("-")


def next_index() -> int:
    used = [int(m.group(1)) for f in GALLERY.iterdir()
            if (m := re.match(r"^(\d+)-", f.name))]
    return (max(used) + 1) if used else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--index", type=int, default=None,
                    help="gallery index; defaults to one past the highest used")
    ap.add_argument("--max", type=int, default=MAX_EDGE)
    ap.add_argument("--alt", default="")
    args = ap.parse_args()

    src = Path(args.source)
    if not src.exists():
        print(f"no such file: {src}", file=sys.stderr)
        return 1
    GALLERY.mkdir(parents=True, exist_ok=True)

    index = args.index if args.index is not None else next_index()
    stem = normalise(f"{index}-{src.stem}")

    with Image.open(src) as im:
        # exif_transpose first, so the cap applies to the upright image.
        im = ImageOps.exif_transpose(im)
        if im.mode != "RGB":
            im = im.convert("RGB")
        before = im.size
        if max(im.size) > args.max:
            im.thumbnail((args.max, args.max), Image.LANCZOS)
        out = GALLERY / f"{stem}.jpg"
        # 88 matches QUALITY in make-derivatives.py; the "original" is really a
        # capped master, not a true original, so it does not need more.
        im.save(out, quality=88, optimize=True)
        after = im.size

    meta = {
        "stem": stem,
        "index": index,
        "source": src.name,
        "sourceBytes": src.stat().st_size,
        "cappedBytes": out.stat().st_size,
        "sourceSize": list(before),
        "cappedSize": list(after),
        "ratio": round(after[0] / after[1], 4) if after[1] else None,
        "alt": args.alt,
    }
    print(json.dumps(meta, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())