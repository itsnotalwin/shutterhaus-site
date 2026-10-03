# Direct, defensible test of F1: if `sizes` were fixed and the browser picked the
# 400w candidate, would the 111px render box look any different?
#
# Method: downscale BOTH the served 1200w and the 400w candidate to the exact
# device-pixel box the phone rasterises (111 CSS px x DPR3), then measure the
# RMS difference between the two. This replaces the flawed "detail_vs_2x" proxy,
# which exceeded 1.0 purely because a fixed blur radius behaves differently at
# different scales.
import os, json
from PIL import Image, ImageChops, ImageStat

BASE = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\mobile-audit"
SERVED = os.path.join(BASE, "served")
LOCAL = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\public\gallery"
cq = json.load(open(os.path.join(BASE, "crop-quality.json"), encoding="utf-8"))
DPR = 3.0

out = []
for r in cq:
    lab = r["label"]
    big = Image.open(os.path.join(SERVED, f"{lab}-1200w.webp")).convert("RGB")
    p400 = os.path.join(LOCAL, f"{lab}-400w.webp")
    small = Image.open(p400).convert("RGB")
    dw, dh = int(r["box_w"] * DPR), int(r["box_h"] * DPR)
    a = big.resize((dw, dh), Image.LANCZOS)     # what is served today
    b = small.resize((dw, dh), Image.LANCZOS)   # what a fixed sizes= would serve
    diff = ImageChops.difference(a, b)
    rms = ImageStat.Stat(diff).rms
    mean = sum(ImageStat.Stat(diff).mean) / 3
    # PSNR against the served render.
    # Standard: PSNR = 10 * log10(MAX^2 / MSE), MAX = 255.
    import math
    mse = sum(v * v for v in rms) / 3
    psnr = 99.0 if mse == 0 else 10.0 * math.log10((255.0 ** 2) / mse)
    out.append(dict(r, diff_rms=round(mean, 3), diff_max_px=[round(v, 1) for v in rms],
                    psnr=round(psnr, 1), bytes1200=r["bytes"],
                    bytes400=os.path.getsize(p400)))

json.dump(out, open(os.path.join(BASE, "crop-quality.json"), "w", encoding="utf-8"), indent=1)

print(f"{'label':30s} {'meanDiff':>9s} {'PSNR dB':>8s} {'maxChan':>8s}  {'1200w B':>9s} {'400w B':>8s} {'ratio':>6s}")
for r in out:
    print(f"{r['label']:30s} {r['diff_rms']:>9.3f} {r['psnr']:>8.1f} {max(r['diff_max_px']):>8.1f}  "
          f"{r['bytes1200']:>9d} {r['bytes400']:>8d} {r['bytes1200']/r['bytes400']:>6.1f}x")

p = [r["psnr"] for r in out]
m = [r["diff_rms"] for r in out]
t12 = sum(r["bytes1200"] for r in out); t4 = sum(r["bytes400"] for r in out)
print(f"\nmean abs pixel difference at the render box: min {min(m):.3f} median {sorted(m)[len(m)//2]:.3f} max {max(m):.3f} (0-255 scale)")
print(f"PSNR: min {min(p):.1f} dB median {sorted(p)[len(p)//2]:.1f} dB max {max(p):.1f} dB")
print(f"\n{'>40 dB is visually lossless; >45 dB is indistinguishable.'}")
print(f"images with PSNR > 40 dB: {sum(1 for x in p if x > 40)} of 30")
print(f"images with PSNR > 45 dB: {sum(1 for x in p if x > 45)} of 30")
print(f"\ntotal 1200w {t12/1024/1024:.2f} MB  vs  400w {t4/1024/1024:.2f} MB  -> saves {(t12-t4)/1024/1024:.2f} MB ({t12/t4:.1f}x)")
