"""
Generate the Open Graph share card (1200x630) from a gallery photo.

Why a build step and not a checked-in binary: the card has to be regenerated
whenever the hero image changes, and a 20-line script beats remembering to
export one by hand in Photoshop.

Usage: python tools/og-card.py <srcImage> <outPng> [siteName] [tagline]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps

W, H = 1200, 630


def fit(img: Image.Image, box_w: int, box_h: int) -> Image.Image:
    """Cover-fit: fill the box, crop the overflow, never distort."""
    s = max(box_w / img.width, box_h / img.height)
    nw, nh = max(1, round(img.width * s)), max(1, round(img.height * s))
    img = img.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - box_w) // 2, (nh - box_h) // 2
    return img.crop((left, top, left + box_w, top + box_h))


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    """Prefer a real font file; fall back to PIL's bitmap default."""
    names = (
        ["ariblk.ttf", "ArchivoBlack-Regular.ttf"] if bold else []
    ) + ["arial.ttf", "segoeui.ttf", "DejaVuSans.ttf"]
    roots = [
        Path("C:/Windows/Fonts"),
        Path("/usr/share/fonts/truetype/dejavu"),
        Path("/Library/Fonts"),
    ]
    for root in roots:
        for n in names:
            p = root / n
            if p.exists():
                try:
                    return ImageFont.truetype(str(p), size)
                except OSError:
                    pass
    return ImageFont.load_default()


def main() -> int:
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    site = sys.argv[3] if len(sys.argv) > 3 else "SHUTTERHAUS"
    tagline = sys.argv[4] if len(sys.argv) > 4 else "PHOTOGRAPHY · GAUTENG"

    img = ImageOps.exif_transpose(Image.open(src)).convert("RGB")

    # B&W to match the site's shell, slightly lifted so faces don't crush.
    img = ImageOps.grayscale(img)
    img = ImageEnhance.Contrast(img).enhance(1.06)

    card = fit(img, W, H)

    # Darken the bottom so the type always has contrast, whatever the photo.
    # A hard-edged rectangle cut straight across the subject's face, so build a
    # vertical gradient mask that ramps in below the midpoint instead.
    veil = Image.new("L", (W, H), 0)
    vdraw = ImageDraw.Draw(veil)
    top = int(H * 0.34)
    for y in range(top, H):
        t = (y - top) / max(1, (H - 1 - top))
        vdraw.line((0, y, W, y), fill=round(96 * (t**1.7)))
    black = Image.new("RGB", (W, H), (0, 0, 0))
    # composite() against an L mask returns mode L; force RGB so 3-tuple fills
    # (white type) are accepted by draw.text().
    card = Image.composite(black, card.convert("RGB"), veil).convert("RGB")

    d = ImageDraw.Draw(card)
    d.text((64, H - 168), site, font=font(74), fill=(255, 255, 255))
    d.text((64, H - 74), tagline, font=font(27, bold=False), fill=(214, 214, 214))
    d.line((64, H - 196, 200, H - 196), fill=(255, 255, 255), width=3)

    out.parent.mkdir(parents=True, exist_ok=True)
    # PNG of a 1200x630 photo is ~600 KB; JPEG is ~60 KB for visually identical
    # quality. Social crawlers fetch this on every share, so size matters.
    if out.suffix.lower() in (".jpg", ".jpeg"):
        card.save(out, "JPEG", quality=86, optimize=True, progressive=True)
    else:
        card.save(out, "PNG", optimize=True)
    print(f"{out}  {W}x{H}  {out.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
