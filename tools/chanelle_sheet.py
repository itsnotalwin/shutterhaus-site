"""
Contact sheet of the CHANELLE originals so the wall selection can be judged by eye.

Renders every source original as a labelled thumbnail with its index number and
native aspect ratio, which is the number tools/rows.py keys off. Writes a single
JPEG to audit-v2/chanelle-sheet.jpg.

Usage:  python tools/chanelle_sheet.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

SRC = r"C:\Users\Operations 3\Desktop\CHANELLE"
OUT = r"C:\Users\Operations 3\Documents\WEBSITE\shutterhaus-site\audit-v2\chanelle-sheet.jpg"

COLS = 10
CELL_W, IMG_H, LABEL_H = 200, 200, 26
PAD = 6


def index_of(name: str) -> int:
    """Files are named '<index>-IMG_1234.jpg'. That leading index is what
    public/gallery/ and tools/rows.py key off, so it must be reproduced exactly."""
    head = name.split("-", 1)[0]
    try:
        return int(head)
    except ValueError:
        return -1


def img_number(name: str):
    """The IMG_ number, e.g. '11-IMG_0018.jpg' -> '0018'."""
    for part in name.replace(".", "-").split("-"):
        if part.upper().startswith("IMG"):
            digits = "".join(ch for ch in part if ch.isdigit())
            if digits:
                return digits
    return "?"


def load_font(size=13):
    for name in ("arial.ttf", "segoeui.ttf", "tahoma.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    files = sorted(
        f for f in os.listdir(SRC) if f.lower().endswith((".jpg", ".jpeg", ".png"))
    )
    files.sort(key=index_of)

    rows = (len(files) + COLS - 1) // COLS
    W = COLS * (CELL_W + PAD) + PAD
    H = rows * (IMG_H + LABEL_H + PAD) + PAD

    sheet = Image.new("RGB", (W, H), (18, 18, 18))
    draw = ImageDraw.Draw(sheet)
    font = load_font(13)
    small = load_font(11)

    report = []
    for i, name in enumerate(files):
        col, row = i % COLS, i // COLS
        x = PAD + col * (CELL_W + PAD)
        y = PAD + row * (IMG_H + LABEL_H + PAD)
        path = os.path.join(SRC, name)
        try:
            with Image.open(path) as im:
                w, h = im.size
                im = im.convert("RGB")
                im.thumbnail((CELL_W, IMG_H), Image.LANCZOS)
                # centre the thumbnail in the cell
                ix = x + (CELL_W - im.width) // 2
                iy = y + (IMG_H - im.height) // 2
                sheet.paste(im, (ix, iy))
        except Exception as exc:  # keep going, just record it
            report.append((name, "FAILED: %s" % exc))
            continue

        idx = index_of(name)
        num = img_number(name)
        ratio = w / h if h else 0
        draw.text(
            (x + 2, y + IMG_H + 4),
            "#%s  img-%s" % (idx, num),
            fill=(235, 235, 235),
            font=font,
        )
        draw.text(
            (x + 2, y + IMG_H + 15),
            "%dx%d  %.2f:1" % (w, h, ratio),
            fill=(150, 150, 150),
            font=small,
        )
        report.append((idx, num, w, h, round(ratio, 3)))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.save(OUT, quality=88)
    print("wrote %s  (%dx%d, %d files)" % (OUT, W, H, len(files)))
    print()
    print("%-5s %-8s %-11s %-7s %s" % ("idx", "img", "size", "ratio", "shape"))
    for row in report:
        if isinstance(row[0], int):
            idx, num, w, h, ratio = row
            shape = "portrait" if ratio < 0.95 else ("square" if ratio <= 1.1 else "landscape")
            print("%-5s %-8s %-11s %-7s %s" % (idx, num, "%dx%d" % (w, h), ratio, shape))
        else:
            print("!! %s" % (row,))


if __name__ == "__main__":
    main()