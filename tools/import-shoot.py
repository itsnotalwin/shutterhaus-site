"""
Import a shoot from a desktop folder into public/gallery/.

Why this exists: the originals on a phone are 6557x8137 and 5644x10034 —
multi-megapixel files totalling 127MB. Shipping those as the gallery
"originals" means the lightbox downloads a 24MB file, and make-derivatives.py
would emit 4 widths under every one of them (400+ files, ~90MB of repo).

So: cap the long edge at MAX_EDGE, which is far larger than anything the site
ever renders (the widest slot is the 1600w derivative, and the lightbox shows
the image at most ~92vw). Everything above that is bytes nobody can see, and
it is what makes a git repo unmanageable.

EXIF orientation is baked in on the way through, so a phone-shot portrait
does not silently render sideways.

Usage:
    python tools/import-shoot.py <source-folder> [--clean] [--max 2400]

    --clean   remove existing gallery originals first (the derivative files
              go with them; you asked to replace the current set)
"""

import argparse
import re
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageOps

# Matches the -400w / -1600w suffix make-derivatives.py appends.
DERIV_RE = re.compile(r"-\d+w$")

# Nothing on this site renders wider than the 1600w derivative. 2400 gives the
# lightbox headroom on a 4K display without carrying 8000px of dead pixels.
MAX_EDGE = 2400

# Names are normalised to a stable, sortable, web-safe stem. The shoot arrived
# as "11-IMG_0018.jpg" and "1-20240718113728_IMG_0065.jpg"; keeping the user's
# prefix but dropping the extension noise makes the portfolio order predictable.
SAFE_RE = re.compile(r"[^a-z0-9]+")


def clean_stem(name: str) -> str:
    """'11-IMG_0018.jpg' -> '11-img-0018'."""
    stem = Path(name).stem.lower()
    return SAFE_RE.sub("-", stem).strip("-")


def import_one(src: Path, gallery: Path, max_edge: int) -> dict | None:
    try:
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")

            ow, oh = im.size
            long_edge = max(ow, oh)
            if long_edge > max_edge:
                scale = max_edge / long_edge
                nw, nh = round(ow * scale), round(oh * scale)
                im = im.resize((nw, nh), Image.LANCZOS)

            stem = clean_stem(src.name)
            dest = gallery / f"{stem}.jpg"
            # Optimise + progressive: progressive JPEGs render top-down, so the
            # top of a portrait appears first instead of after the whole file.
            im.save(dest, "JPEG", quality=90, optimize=True, progressive=True)
            return {
                "dest": dest,
                "width": im.width,
                "height": im.height,
                "orig_w": ow,
                "orig_h": oh,
                "src_bytes": src.stat().st_size,
                "out_bytes": dest.stat().st_size,
            }
    except Exception as exc:  # noqa: BLE001 - report, don't abort 50 files
        print(f"  SKIP {src.name}: {exc}")
        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--clean", action="store_true")
    ap.add_argument("--max", type=int, default=MAX_EDGE)
    args = ap.parse_args()

    src_dir = Path(args.source)
    gallery = Path(__file__).resolve().parent.parent / "public" / "gallery"
    gallery.mkdir(parents=True, exist_ok=True)

    if args.clean:
        removed = 0
        for p in gallery.iterdir():
            if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                p.unlink()
                removed += 1
        print(f"removed {removed} existing file(s) from public/gallery\n")

    srcs = sorted(
        p for p in src_dir.iterdir()
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
    )
    if not srcs:
        raise SystemExit(f"no images found in {src_dir}")

    print(f"importing {len(srcs)} image(s) from {src_dir}")
    print(f"long edge capped at {args.max}px\n")

    rows, in_bytes, out_bytes = [], 0, 0
    for p in srcs:
        r = import_one(p, gallery, args.max)
        if not r:
            continue
        in_bytes += r["src_bytes"]
        out_bytes += r["out_bytes"]
        rows.append(r)
        flag = ""
        if (r["orig_w"], r["orig_h"]) != (r["width"], r["height"]):
            flag = f"  (from {r['orig_w']}x{r['orig_h']})"
        print(f"  {r['dest'].name:28} {r['width']:>5}x{r['height']:<5} "
              f"{r['out_bytes'] / 1024:6.0f} KB{flag}")

    print(f"\n{len(rows)} imported, {out_bytes / 1024 / 1024:.1f} MB "
          f"(was {in_bytes / 1024 / 1024:.1f} MB)")
    print("next: python tools/make-derivatives.py")


if __name__ == "__main__":
    main()
