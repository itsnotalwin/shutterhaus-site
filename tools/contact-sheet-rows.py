"""
Contact sheet of the 30-pick candidates, grouped by aspect ratio.

The wall is 10 rows of 3, and each row must hold three frames of the SAME
aspect ratio or the row is not one height and every short photo leaves a gap
under it. Alwin, 2026-10-01: "make sure it sits nice, no spacing issues at
all". Identical ratio per row is what makes that literally true with nothing
cropped and nothing stretched.

So the candidates are grouped by ratio first, and the best three in each group
are chosen by eye. This sheet is for that judgement.

Run: uv run --with pillow python tools/contact-sheet-rows.py
"""
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
GALLERY = ROOT / "public" / "gallery"
OUT = ROOT / "shots" / "rows.png"


def font(sz):
    for n in ("segoeui.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(n, sz)
        except OSError:
            pass
    return ImageFont.load_default()


demo = (ROOT / "src" / "demo.ts").read_text(encoding="utf-8")
trip = re.findall(r'url: "gallery/([^"]+)"[^\n]*?width: (\d+), height: (\d+)', demo)
data = [{"f": f, "w": int(w), "h": int(h), "r": round(int(h) / int(w), 3)}
        for f, w, h in trip]

# The three ratios that can fill 10 clean rows of 3: 16 + 12 + 7 available,
# and 15 + 12 + 3 = 30 chosen.
GROUPS = [(1.5, 5), (1.25, 4), (1.7778, 1)]

tiles = []
for ratio, rows in GROUPS:
    members = [d for d in data if d["r"] == ratio]
    tiles.append(("HEAD", f"ratio {ratio} - {len(members)} available, need {rows*3}", 0))
    for d in members:
        tiles.append(("TILE", d["f"], d["r"]))

COLS, CELL, LAB = 8, 250, 26
rows_n = (len(tiles) + COLS - 1) // COLS
img = Image.new("RGB", (COLS * CELL, rows_n * (CELL + LAB)), "white")
dr = ImageDraw.Draw(img)
ft = font(15)

for i, (kind, label, ratio) in enumerate(tiles):
    x, y = (i % COLS) * CELL, (i // COLS) * (CELL + LAB)
    if kind == "HEAD":
        dr.rectangle([x, y, x + CELL, y + CELL], fill=(235, 235, 235))
        dr.text((x + 6, y + CELL // 2), label, fill="black", font=font(16))
        continue
    p = GALLERY / label
    if not p.exists():
        continue
    im = Image.open(p).convert("RGB")
    im.thumbnail((CELL - 8, CELL - 8), Image.LANCZOS)
    tile = Image.new("RGB", (CELL, CELL), (120, 120, 120))
    tile.paste(im, ((CELL - im.width) // 2, (CELL - im.height) // 2))
    img.paste(tile, (x, y))
    dr.text((x + 4, y + CELL + 4), f"{label}  r{ratio}", fill="black", font=ft)

img.save(OUT, quality=92)
print(f"{len(tiles)} tiles -> {OUT} ({img.width}x{img.height})")
