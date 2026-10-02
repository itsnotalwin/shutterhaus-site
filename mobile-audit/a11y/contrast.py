"""contrast.py — measured WCAG contrast for text sitting on photographs.

Why this exists as a script and not a bookmarklet
-------------------------------------------------
Contrast over a photograph is not a property of two colour swatches. The
"background" is a continuous field of photo pixels plus a translucent
scrim, and the answer changes as you move across a single line of text.
WCAG's ratio formula assumes a flat backdrop, so the only defensible
number here is computed on the pixels the browser actually painted.

How glyph pixels are excluded — and why the naive method is wrong
----------------------------------------------------------------
The obvious approach is "sample the box, take the median". That is
wrong for exactly the elements we care about: the eyebrow is 11px mono
at 0.9 opacity, so the glyphs cover a large share of a small box and the
median lands ON the text, inflating the apparent background toward the
text colour and under-reporting the failure.

So we do not threshold. capture.mjs takes the frame twice, once with the
target text visible and once with it set to `visibility: hidden`. The
photograph, the scrim and the layout are identical between the two; the
ONLY pixels that differ are glyphs and their antialiasing fringe. A pixel
is therefore classified as background purely by "did it change when the
letters were removed", which needs no per-element tuning and cannot
misclassify a dark photograph as glyph.

Background lightness is then reported as a DISTRIBUTION, not a point:
  worst  = the background pixel with the highest contrast against the
           text colour (this is the one that fails AA, and it is what the
           fix has to solve)
  median = typical background
  best   = the most favourable pixel
The headline number is `worst`, because a line of text is only as
readable as its least readable point.

For the text colour we take the rendered colour of the glyph pixels
themselves (median over pixels the diff classified as glyph), so a
semi-transparent white eyebrow is measured at the white it actually
paints, not at #fff.

Reference for the formula: WCAG 2.x relative luminance.
    c_lin  = c/12.92            if c <= 0.04045   else ((c+0.055)/1.055) ** 2.4
    L      = 0.2126 R + 0.7152 G + 0.0722 B
    ratio  = (L_hi + 0.05) / (L_lo + 0.05)
"""
import json
import os
import sys

from PIL import Image

BASE = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\mobile-audit\a11y"

# WCAG 2.1 SC 1.4.3. Body text and anything below 18.66px bold / 24px
# regular needs 4.5. Large text and non-text UI (an icon, a control) need
# 3.0 — which is the correct bar for the wordmark (32px display) and for
# the burger bars (a graphical object, not body copy).
THRESH = {"eyebrow": 4.5, "lede": 4.5, "wordmark": 3.0, "burger": 3.0}


def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(rgb):
    r, g, b = rgb[:3]
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def ratio(l1, l2):
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def srgb_to_lin_hex(h):
    """#fff / rgb(255,255,255) -> linear luminance, for cross-checking the
    rendered measurement against the declared colour."""
    h = h.strip()
    if h.startswith("#"):
        h = h[1:]
        if len(h) == 3:
            h = "".join(ch * 2 for ch in h)
        return lum((int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)))
    if h.startswith("rgb"):
        p = [float(x) for x in h[h.index("(") + 1 : h.index(")")].split(",")[:3]]
        return lum(p)
    return None


def main(tag):
    with open(os.path.join(BASE, f"{tag}-geom.json"), encoding="utf-8") as f:
        geom = json.load(f)
    withText = Image.open(os.path.join(BASE, f"{tag}-render.png")).convert("RGB")
    noText = Image.open(os.path.join(BASE, f"{tag}-notext.png")).convert("RGB")

    rows = []
    for key, g in geom.items():
        if not g:
            rows.append(dict(key=key, error="element not found"))
            continue
        x0, y0 = max(0, g["x"]), max(0, g["y"])
        x1, y1 = x0 + g["w"], y0 + g["h"]
        # The screenshot is the full page height, so a box can run past the
        # bottom of the visible area. Clip to what we actually captured and
        # say so, rather than silently padding with black.
        x1, y1 = min(x1, withText.width), min(y1, withText.height)

        if x1 <= x0 or y1 <= y0:
            rows.append(dict(key=key, error=f"empty box {g}"))
            continue

        a = withText.crop((x0, y0, x1, y1))
        b = noText.crop((x0, y0, x1, y1))
        ap, bp = a.load(), b.load()

        glyph_lums, bg_lums, bg_rgb = [], [], []
        for yy in range(y1 - y0):
            for xx in range(x1 - x0):
                p, q = ap[xx, yy], bp[xx, yy]
                # "Did this pixel change when the letters were removed?"
                diff = max(abs(p[i] - q[i]) for i in range(3))
                if diff > 6:
                    # A glyph pixel. Keep the BRIGHTEST ones only: the
                    # antialiasing fringe blends toward the photo, so the
                    # core of a white glyph is the truest sample of the
                    # colour the text actually paints.
                    glyph_lums.append((lum(p), p))
                else:
                    bg_lums.append(lum(p))
                    bg_rgb.append(p)

        if not bg_lums:
            rows.append(dict(key=key, error="no background pixels found"))
            continue

        if glyph_lums:
            glyph_lums.sort(key=lambda t: t[0], reverse=True)
            core = glyph_lums[: max(1, len(glyph_lums) // 20)]  # top 5%
            text_lum = sum(l for l, _ in core) / len(core)
            text_rgb = tuple(sum(c[i] for _, c in core) // len(core) for i in range(3))
            text_from = "rendered glyph pixels"
        else:
            # No glyph pixels at all: the mark is drawn as a filled shape, not
            # type. The burger bars are `background: #fff` on a 1px-tall <i>,
            # so the colour that matters is the background, not `color`. Fall
            # back to that and record which property was used, so a pass can
            # never come from measuring against the wrong one.
            fb = g.get("background", "rgba(0, 0, 0, 0)")
            text_from = "background" if "rgba(0, 0, 0, 0)" not in fb else "color"
            text_lum = srgb_to_lin_hex(g[text_from])
            text_rgb = None

        # Keep luminance and colour PAIRED in one list. Sorting a bare list of
        # luminances and then indexing the unsorted colour list by that index
        # silently reports a random pixel's colour next to a real number, which
        # makes the finding unreproducible by eye.
        pairs = sorted(zip(bg_lums, bg_rgb), key=lambda t: t[0])
        # Which background pixel is the "worst" one? It is NOT the one furthest
        # from the text in luminance — that is the BEST case, because contrast
        # GROWS as the two luminances separate. For white type the pixel that
        # eats the ratio is the one whose luminance sits CLOSEST to the text's,
        # i.e. a blown highlight. Getting this backwards is easy, and it makes
        # a dark photograph report as a comfortable pass.
        worst_lum, worst_rgb = min(pairs, key=lambda t: abs(t[0] - text_lum))
        best_lum, _ = max(pairs, key=lambda t: abs(t[0] - text_lum))
        median_lum, _ = pairs[len(pairs) // 2]

        r_worst = ratio(text_lum, worst_lum)
        r_med = ratio(text_lum, median_lum)
        r_best = ratio(text_lum, best_lum)

        th = THRESH.get(key, 4.5)
        rows.append(
            dict(
                key=key,
                label=g["label"],
                fontSize=g["fontSize"],
                fontFamily=g["fontFamily"],
                cssBox=f'{g["cssW"]}x{g["cssH"]} css px',
                deviceBox=f"{g['w']}x{g['h']} device px",
                declaredColor=g["color"],
                textFrom=text_from,
                textRGB=text_rgb,
                textLum=round(text_lum, 5),
                worstBgRGB=worst_rgb,
                worstBgLum=round(worst_lum, 5),
                medianBgLum=round(median_lum, 5),
                bgPixels=len(bg_lums),
                glyphPixels=len(glyph_lums),
                ratio_worst=round(r_worst, 2),
                ratio_median=round(r_med, 2),
                ratio_best=round(r_best, 2),
                threshold=th,
                pass_worst=r_worst >= th,
            )
        )

    out = os.path.join(BASE, f"contrast-{tag}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=1)

    print(f"\n=== measured contrast, {tag} (393x852 DPR 3) ===")
    print(f"{'element':10} {'font':16} {'text':>9} {'worst bg':>9} {'WORST':>7} {'med':>6} {'need':>5}  pass")
    for r in rows:
        if "error" in r:
            print(f"{r['key']:10} ERROR {r['error']}")
            continue
        t = r["textRGB"]
        w = r["worstBgRGB"]
        ts = f"#{t[0]:02x}{t[1]:02x}{t[2]:02x}" if t else "n/a"
        ws = f"#{w[0]:02x}{w[1]:02x}{w[2]:02x}" if w else "n/a"
        print(
            f"{r['key']:10} {r['fontSize']:16} {ts:>9} {ws:>9} "
            f"{r['ratio_worst']:6.2f}:1 {r['ratio_median']:5.2f}:1 "
            f"{r['threshold']:4.1f}:1  {'PASS' if r['pass_worst'] else 'FAIL'}"
        )
    print(f"\nwrote {out}")
    return 0 if all(r.get("pass_worst") for r in rows) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "before"))
