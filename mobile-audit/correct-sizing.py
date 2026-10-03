# What SHOULD be delivered: measure the 400w/800w derivatives that exist locally,
# and compute the correct byte budget for a 111px box at DPR3.
import os, json
from PIL import Image

LOCAL = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\public\gallery"
BASE = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\mobile-audit"
cq = json.load(open(os.path.join(BASE, "crop-quality.json"), encoding="utf-8"))

WIDTHS = [400, 800, 1200, 1600]
box_css = cq[0]["box_w"]
print(f"rendered box width: {box_css} CSS px")
for dpr in (1, 2, 3):
    need = box_css * dpr
    best = min([w for w in WIDTHS if w >= need], default=1600)
    print(f"  DPR {dpr}: needs {need:.0f} device px -> correct candidate = {best}w")

print("\n=== actual delivered vs correct (DPR3 => 333 device px, 400w candidate) ===")
tot_actual = tot_400 = tot_800 = 0
missing = []
per = []
for r in cq:
    base = r["label"]
    sizes = {}
    for w in WIDTHS:
        p = os.path.join(LOCAL, f"{base}-{w}w.webp")
        if os.path.exists(p):
            sizes[w] = os.path.getsize(p)
    got400 = sizes.get(400)
    if got400 is None:
        missing.append(base)
    tot_actual += r["bytes"]
    tot_400 += got400 or 0
    tot_800 += sizes.get(800) or 0
    per.append((base, r["bytes"], got400, sizes.get(800), sizes.get(1200)))

print(f"{'image':30s} {'1200w (served)':>15s} {'800w':>9s} {'400w':>8s} {'waste vs 400w':>14s}")
for base, a, g4, g8, g12 in per:
    w = (a / g4) if g4 else 0
    print(f"{base:30s} {a:>15d} {str(g8):>9s} {str(g4):>8s} {(f'{w:.1f}x' if g4 else 'n/a'):>14s}")

print(f"\nTOTAL delivered (1200w, all 30):  {tot_actual/1024/1024:.2f} MB")
print(f"TOTAL if 400w chosen:             {tot_400/1024/1024:.2f} MB")
print(f"TOTAL if 800w chosen:             {tot_800/1024/1024:.2f} MB")
print(f"overhead factor (1200w vs 400w):  {tot_actual/tot_400:.1f}x")
print(f"WASTED bytes:                     {(tot_actual-tot_400)/1024/1024:.2f} MB")
print(f"missing 400w derivatives: {len(missing)} {missing}")

# First screenful: how many images are in the first 852px viewport on a 393px phone?
n_first = 0
y = 184.6
for r in cq:
    h = r["box_h"]
    if y < 852: n_first += 1
    y += h + 6
print(f"\nimages whose top falls in the first 852px viewport: {n_first}")
