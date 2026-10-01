"""
Build a labelled contact sheet of the 50 GALLERY frames, in render order.

Why: the filter bar needs real categories. Every photo currently carries
album="photo" and the same alt text, so there is nothing to filter on. Counts
cannot be invented — they have to come from looking at the frames.

This sheets the FILES IN RENDER ORDER (the interleave-order.json order, which
is what the wall actually shows) so the index here lines up with the index on
the live page. A separate sheet can be made in filename order if needed.

Usage:
  python tools/contact-sheet-gallery.py <out.png> [cols] [cell_px]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
GALLERY = ROOT / "public" / "gallery"
ORDER = ROOT / "interleave-order.json"

EXTS = {".jpg", ".jpeg", ".png", ".webp"}

# One label per cell, in the order the wall renders them.
LABELS = [
    "Portraits", "Couples", "Families", "Social",
]


def font(size: int):
    for name in ("segoeui.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def render_order() -> list[str]:
    """Filenames in the order the portfolio wall renders them."""
    meta = json.loads(ORDER.read_text(encoding="utf-8"))
    order = meta["order"]
    # The order file may name files with or without extension; match loosely.
    out: list[str] = []
    by_stem = {p.stem: p.name for p in GALLERY.iterdir() if p.suffix.lower() in EXTS}
    for name in order:
        if name in by_stem.values():
            out.append(name)
        else:
            stem = Path(name).stem
            if stem in by_stem:
                out.append(by_stem[stem])
    return out


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "shots" / "sheet.png"
    cols = int(sys.argv[2]) if len(sys.argv) > 2 else 7
    cell = int(sys.argv[3]) if len(sys.argv) > 3 else 260

    names = render_order()
    if not names:
        print("no frames matched the render order")
        return 1

    label_h = 34
    rows = (len(names) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + label_h)), "white")
    draw = ImageDraw.Draw(sheet)
    f = font(17)

    for i, name in enumerate(names):
        src = GALLERY / name
        if not src.exists():
            print("missing", name)
            continue
        im = Image.open(src).convert("RGB")
        im.thumbnail((cell - 8, cell - 8), Image.LANCZOS)
        tile = Image.new("RGB", (cell, cell), (110, 110, 110))
        tile.paste(im, ((cell - im.width) // 2, (cell - im.height) // 2))
        x, y = (i % cols) * cell, (i // cols) * (cell + label_h)
        sheet.paste(tile, (x, y))
        # The index, big, top-left. This is the number to quote when tagging.
        draw.rectangle([x, y, x + 34, y + 26], fill="black")
        draw.text((x + 8, y + 4), f"{i+1}", fill="white", font=font(19))
        draw.text((x + 6, y + cell + 6), name, fill="black", font=f)

    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, quality=92)
    print(f"{len(names)} frames -> {out}  ({sheet.width}x{sheet.height})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
