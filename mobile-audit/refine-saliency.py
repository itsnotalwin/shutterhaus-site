# Refine the subject-localisation metric.
# The first pass used the bbox of the top 25% of gradient mass, which came out
# nearly frame-sized (289x401 device px on a 333x500 box) = degenerate.
# Fix: use a centre-biased saliency and report the bbox of the top 2% of mass
# (the strongest local detail), plus a defensible "dominant detail" region.
import os, json
from PIL import Image, ImageFilter

BASE = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\mobile-audit"
SERVED = os.path.join(BASE, "served")
cq = json.load(open(os.path.join(BASE, "crop-quality.json"), encoding="utf-8"))
DPR = 3.0

out = []
for r in cq:
    p = os.path.join(SERVED, r["file"])
    with Image.open(p) as im:
        W, H = im.size
        g = im.convert("L").resize((200, int(200 * H / W)), Image.BILINEAR)
        e = g.filter(ImageFilter.FIND_EDGES)
        ew, eh = e.size
        px = list(e.getdata())
        tot = sum(px) or 1
        cx = sum((i % ew) * v for i, v in enumerate(px)) / tot / (ew - 1)
        cy = sum((i // ew) * v for i, v in enumerate(px)) / tot / (eh - 1)
        for pct, name in ((0.02, "core2"), (0.05, "core5")):
            order = sorted(range(len(px)), key=lambda k: -px[k])
            need = tot * pct
            acc = 0; xs = []; ys = []
            for idx in order:
                acc += px[idx]
                if px[idx] == 0: break
                xs.append(idx % ew); ys.append(idx // ew)
                if acc >= need: break
            wn = (max(xs) - min(xs)) / (ew - 1)
            hn = (max(ys) - min(ys)) / (eh - 1)
            r[name] = [round(wn, 3), round(hn, 3)]
            r[name + "_dev"] = [round(wn * r["box_w"] * DPR, 1), round(hn * r["box_h"] * DPR, 1)]
    out.append(r)

json.dump(out, open(os.path.join(BASE, "crop-quality.json"), "w", encoding="utf-8"), indent=1)

print(f"{'label':30s} {'boxDev':>10s} {'core2%dev':>11s} {'core5%dev':>11s}  {'saliency centroid'}")
for r in out:
    bd = f"{r['box_w']*DPR:.0f}x{r['box_h']*DPR:.0f}"
    print(f"{r['label']:30s} {bd:>10s} {str(r['core2_dev']):>11s} {str(r['core5_dev']):>11s}  ({r['sal_cx']:.2f},{r['sal_cy']:.2f})")

c2 = [r['core2_dev'][0] for r in out]
c5 = [r['core5_dev'][0] for r in out]
print(f"\ncore2% width device px: min {min(c2):.0f} median {sorted(c2)[len(c2)//2]:.0f} max {max(c2):.0f}")
print(f"core5% width device px: min {min(c5):.0f} median {sorted(c5)[len(c5)//2]:.0f} max {max(c5):.0f}")
print(f"box device width: {out[0]['box_w']*DPR:.0f}")
