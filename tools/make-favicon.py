"""
Generate the site's real favicon files.

WHY THIS EXISTS — Google was showing a grey globe next to the site in search
results. The cause was the icon declaration, not a missing file: every page
emitted an inline `data:image/svg+xml,...` <link rel="icon">. Browsers honour a
data-URI icon, so it looked fine in a tab and nobody noticed. Google does not:
it wants a real, fetchable icon file, and when it cannot get one it substitutes
its own grey globe placeholder.

So this writes the three files a crawler will actually fetch:
  favicon.ico      32/16 multi-size, the legacy path every crawler probes
  favicon-32.png   explicit 32, for anything that prefers PNG
  apple-touch-icon.png  180, for iOS home-screen bookmarks

The mark is the same black square with a white "S" the inline SVG described, so
the site keeps the identity it had. It is drawn here rather than converted from
the SVG so the geometry is exact at every size: a rasterised text glyph lands
differently at 16px than at 180, and 16px is the size that actually shows up in
a search result.

Usage:  python tools/make-favicon.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

INK = (17, 17, 17)      # #111, the site's --ink
PAPER = (255, 255, 255)  # #fff


def _font(size: int):
    """
    A bold sans face at `size` px.

    Tries the paths a Windows install actually has before falling back to
    PIL's default, which is a bitmap font far too light to read at 16px.
    """
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for c in candidates:
        if Path(c).exists():
            try:
                return ImageFont.truetype(c, size)
            except OSError:
                continue
    return ImageFont.load_default()


def mark(px: int, inset_ratio: float = 0.0, radius_ratio: float = 0.0) -> Image.Image:
    """
    The favicon at `px` square.

    inset_ratio pulls the square in from the tile edge. At 16px a full-bleed
    black square on a dark browser chrome is invisible, so small sizes get a
    margin. radius_ratio rounds the corners for the platforms that show them.
    """
    im = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    inset = int(px * inset_ratio)
    box = (inset, inset, px - inset - 1, px - inset - 1)
    if radius_ratio:
        d.rounded_rectangle(box, radius=int(px * radius_ratio), fill=INK)
    else:
        d.rectangle(box, fill=INK)

    # "S" sized to the tile, then nudged down to sit optically centred: the
    # cap height of a bold S sits above the geometric middle, so centring on the
    # glyph's bounding box leaves it looking high.
    glyph = max(8, int(px * 0.72))
    font = _font(glyph)
    bb = d.textbbox((0, 0), "S", font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (px - tw) / 2 - bb[0]
    y = (px - th) / 2 - bb[1] + px * 0.02
    d.text((x, y), "S", font=font, fill=PAPER)
    return im


def main() -> int:
    PUBLIC.mkdir(parents=True, exist_ok=True)

    # favicon.ico, multi-resolution. 32 is what a browser tab asks for; 16 is
    # what a bookmark or a cramped tab strip gets.
    ico_src = mark(256)
    ico_src.save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    # 32 gets a 1px inset so it does not merge into dark browser chrome.
    mark(32, inset_ratio=0.03).save(PUBLIC / "favicon-32.png")

    # Apple wants 180 with transparent corners handled by the OS mask.
    mark(180, radius_ratio=0.22).save(PUBLIC / "apple-touch-icon.png")

    for f in ["favicon.ico", "favicon-32.png", "apple-touch-icon.png"]:
        p = PUBLIC / f
        print(f"{f}: {p.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())