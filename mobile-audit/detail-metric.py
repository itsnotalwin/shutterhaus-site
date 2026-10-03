# Honest replacement for the degenerate "subject core" metric.
#
# The gradient-saliency bbox spans nearly the whole frame (core2% width median
# 236 of 333 device px), so it does NOT isolate a face and must not be reported
# as one. Instead measure something defensible: how much high-frequency detail
# survives when the 1200px source is downscaled to the 333 device px the phone
# actually rasterises, and the resulting local contrast a viewer perceives.
import os, json
from PIL import Image, ImageFilter, ImageChops, ImageStat

BASE = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\mobile-audit"
SERVED = os.path.join(BASE, "served")
cq = json.load(open(os.path.join(BASE, "crop-quality.json"), encoding="utf-8"))
DPR = 3.0

def highfreq(im):
    """RMS of the high-pass (detail) component of a greyscale image."""
    g = im.convert("L")
    blur = g.filter(ImageFilter.GaussianBlur(2))
    hp = ImageChops.difference(g, blur)
    return ImageStat.Stat(hp).rms[0]

out = []
for r in cq:
    p = os.path.join(SERVED, r["file"])
    with Image.open(p) as im:
        W, H = im.size
        dev_w = int(r["box_w"] * DPR)
        dev_h = int(r["box_h"] * DPR)
        full = im.convert("RGB").resize((dev_w, dev_h), Image.LANCZOS)   # what the phone rasterises
        # "reference" = same view at 2x the render size, i.e. what a retina tablet sees
        big = im.convert("RGB").resize((dev_w * 2, dev_h * 2), Image.LANCZOS)
        hf_small, hf_big = highfreq(full), highfreq(big)
        rms_small = ImageStat.Stat(full.convert("L")).rms[0]
        # sharpness proxy: variance of laplacian, scaled to the render box
        lap = full.convert("L").filter(ImageFilter.FIND_EDGES)
        sharp = ImageStat.Stat(lap).rms[0]
        out.append(dict(r,
            render_dev=f"{dev_w}x{dev_h}",
            detail_rms=round(hf_small, 2),
            detail_vs_2x=round(hf_small / hf_big, 3) if hf_big else None,
            local_contrast_rms=round(rms_small, 2),
            sharp_rms=round(sharp, 2),
        ))

json.dump(out, open(os.path.join(BASE, "crop-quality.json"), "w", encoding="utf-8"), indent=1)

print(f"{'label':30s} {'renderDev':>10s} {'detailRMS':>10s} {'detail/2x':>9s} {'contrast':>9s} {'sharpRMS':>9s}")
for r in out:
    print(f"{r['label']:30s} {r['render_dev']:>10s} {r['detail_rms']:>10.2f} {r['detail_vs_2x']:>9.3f} "
          f"{r['local_contrast_rms']:>9.2f} {r['sharp_rms']:>9.2f}")

d = [r["detail_vs_2x"] for r in out if r["detail_vs_2x"] is not None]
s = [r["sharp_rms"] for r in out]
print(f"\ndetail_vs_2x: min {min(d):.3f} median {sorted(d)[len(d)//2]:.3f} max {max(d):.3f}")
print(f"sharp_rms:    min {min(s):.2f} median {sorted(s)[len(s)//2]:.2f} max {max(s):.2f}")
print("\nA value near 1.0 means the 333px render retains essentially all the")
print("perceptual detail of a 2x larger render: the source is not the bottleneck,")
print("the 111px BOX is.")
