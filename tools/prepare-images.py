"""
Make web-sized versions of a shoot folder for the gallery.

Longest edge -> 1800px, quality 82, progressive JPEG. A 31MB DSLR file drops
to roughly 300KB, which is what a portfolio grid actually needs.

Usage: python tools/prepare-images.py <src-folder> <out-folder> [max_edge]
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

EXTS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".heic"}
MAX_EDGE = 1800
QUALITY = 82


def prepare(src: Path, out: Path, max_edge: int = MAX_EDGE) -> None:
    if not src.is_dir():
        raise SystemExit(f"not a folder: {src}")

    out.mkdir(parents=True, exist_ok=True)
    files = sorted(
        p for p in src.iterdir()
        if p.is_file() and p.suffix.lower() in EXTS and not p.name.startswith(".")
    )
    if not files:
        raise SystemExit(f"no images found in {src}")

    print(f"{len(files)} image(s) -> {out}  (max edge {max_edge}px, q{QUALITY})\n")
    before = after = 0

    for p in files:
        before += p.stat().st_size
        with Image.open(p) as im:
            im = ImageOps.exif_transpose(im)  # honour camera rotation
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")

            w, h = im.size
            if max(w, h) > max_edge:
                scale = max_edge / max(w, h)
                im = im.resize(
                    (round(w * scale), round(h * scale)), Image.LANCZOS
                )

            dest = out / f"{p.stem.lower().replace(' ', '-')}.jpg"
            im.save(dest, "JPEG", quality=QUALITY, optimize=True, progressive=True)

        size = dest.stat().st_size
        after += size
        with Image.open(dest) as c:
            dims = f"{c.width}x{c.height}"
        print(f"  {p.name:<24} -> {dest.name:<24} {dims:>11}  {size/1024:7.0f} KB")

    if before:
        print(
            f"\n  total {before/1024/1024:6.1f} MB -> {after/1024/1024:5.1f} MB "
            f"({(1 - after/before) * 100:.0f}% smaller)"
        )


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    max_edge = int(sys.argv[3]) if len(sys.argv) > 3 else MAX_EDGE
    prepare(Path(sys.argv[1]), Path(sys.argv[2]), max_edge)
