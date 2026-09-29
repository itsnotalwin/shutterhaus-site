"""
Build a labelled contact sheet (montage) of a folder so duplicates can be
judged by eye, which beats any heuristic for "is this the same shot?".

Usage: python tools/contact-sheet.py <folder> <out.png> [cols] [cell_px]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def font(size: int):
    for name in ("segoeui.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> int:
    folder = Path(sys.argv[1])
    out = Path(sys.argv[2])
    cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
    cell = int(sys.argv[4]) if len(sys.argv) > 4 else 380

    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in EXTS)
    if not files:
        print("no images in", folder)
        return 1

    label_h = 30
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + label_h)), "white")
    draw = ImageDraw.Draw(sheet)
    f = font(20)

    for i, p in enumerate(files):
        im = Image.open(p).convert("RGB")
        # contain, letterboxed on a mid grey so the frame edges are obvious
        im.thumbnail((cell - 8, cell - 8), Image.LANCZOS)
        tile = Image.new("RGB", (cell, cell), (120, 120, 120))
        tile.paste(im, ((cell - im.width) // 2, (cell - im.height) // 2))
        x, y = (i % cols) * cell, (i // cols) * (cell + label_h)
        sheet.paste(tile, (x, y))
        w, h = Image.open(p).size
        draw.text((x + 6, y + cell + 4), f"{i+1}. {p.name}  {w}x{h}", fill="black", font=f)

    sheet.save(out, quality=92)
    print(f"{len(files)} images -> {out}  ({sheet.width}x{sheet.height})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
