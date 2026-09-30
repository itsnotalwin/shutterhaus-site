"""
Generate responsive derivatives for the gallery so phones stop downloading
1800px files for a 358px-wide grid cell.

The grid renders at 358px CSS on a 390px phone. At DPR 2 that is 716 device
pixels, so the 1440-1800px originals were ~2.5x oversized — the single biggest
cause of the 6.4s mobile LCP.

Writes <stem>-<width>w.jpg beside each original. Originals are left untouched:
the lightbox loads the full-size file on click, and `data-full` points there.

Usage: python tools/make-derivatives.py [gallery-dir]
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

# Matches the -400w / -1600w suffix this tool itself appends.
DERIV_RE = re.compile(r"-\d+w$")

# Widths a phone and a desktop actually request, plus a 3x slot for retina
# tablets. 1600 is the largest useful: nothing renders wider than ~640 CSS px.
WIDTHS = (400, 800, 1200, 1600)
QUALITY = 80
WEBP_QUALITY = 72


def derivatives(src: Path, out_dir: Path) -> tuple[int, int]:
    """Write every width that's smaller than the source. Returns (count, bytes).

    Both JPEG and WebP are emitted per width. This grid is bandwidth-bound,
    not CPU-bound: on a throttled 1.6Mbps phone the nine photos were the whole
    LCP budget, and WebP is the same picture for roughly a third fewer bytes.
    JPEG stays as the `src` so the lightbox and any non-WebP client still work.
    """
    made = 0
    total = 0

    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)  # honour camera rotation
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")

        # Never upscale: a 1200px source can't honestly fill a 1600w slot.
        usable = [w for w in WIDTHS if w < im.width]
        if not usable:
            return 0, 0

        for w in usable:
            h = round(im.height * (w / im.width))
            resized = im.resize((w, h), Image.LANCZOS)
            dest = out_dir / f"{src.stem}-{w}w.jpg"
            resized.save(dest, "JPEG", quality=QUALITY, optimize=True, progressive=True)
            made += 1
            total += dest.stat().st_size
            webp = out_dir / f"{src.stem}-{w}w.webp"
            resized.save(webp, "WEBP", quality=WEBP_QUALITY, method=4)
            made += 1
            total += webp.stat().st_size

    return made, total


def main() -> None:
    gallery = Path(sys.argv[1] if len(sys.argv) > 1 else "public/gallery")
    if not gallery.is_dir():
        raise SystemExit(f"not a folder: {gallery}")

    # Only true originals. Without this, a second run treats the -800w.jpg it
    # wrote last time as a source and manufactures a derivative of a derivative.
    srcs = sorted(
        p
        for p in gallery.iterdir()
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
        and not DERIV_RE.search(p.stem)
    )
    if not srcs:
        raise SystemExit(f"no images in {gallery}")

    print(f"{len(srcs)} image(s) -> {WIDTHS} widths, q{QUALITY}\n")

    before = after = 0
    for p in srcs:
        made, nbytes = derivatives(p, gallery)
        before += p.stat().st_size
        after += nbytes
        if made:
            print(f"  {p.name:20} {p.stat().st_size / 1024:6.0f} KB"
                  f"  ->  {made} files, {nbytes / 1024:6.0f} KB total")
        else:
            print(f"  {p.name:20} {p.stat().st_size / 1024:6.0f} KB  (no width smaller than source)")

    print(f"\nderivatives: {after / 1024:.0f} KB across {len(srcs)} images "
          f"(originals kept for the lightbox: {before / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
