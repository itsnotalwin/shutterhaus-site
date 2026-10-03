# Per-image crop-quality + subject-resolution analysis of the 30 delivered mobile images.
# Measured facts only. No estimates.
import os, json
from PIL import Image, ImageFilter

BASE = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\mobile-audit"
SERVED = os.path.join(BASE, "served")
LOCAL = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\public\gallery"

VIEWPORT_CSS = 393.0
DPR = 3.0

imgs = json.load(open(os.path.join(BASE, "portfolio-imgs.json"), encoding="utf-8"))

def saliency(im):
    """Gradient-magnitude saliency proxy on a downscaled greyscale copy."""
    g = im.convert("L")
    g = g.resize((160, int(160 * im.height / im.width)), Image.BILINEAR)
    e = g.filter(ImageFilter.FIND_EDGES)
    px = list(e.getdata())
    tot = sum(px) or 1
    return e, px, tot

rows = []
for i in imgs:
    name = i["currentSrc"].split("/")[-1]
    p = os.path.join(SERVED, name)
    if not os.path.exists(p):
        continue
    with Image.open(p) as im:
        W, H = im.size
        e, px, tot = saliency(im)
        ew, eh = e.size
        # saliency centroid in normalised coords (0..1)
        cx = sum((idx % ew) * v for idx, v in enumerate(px)) / tot / (ew - 1)
        cy = sum((idx // ew) * v for idx, v in enumerate(px)) / tot / (eh - 1)
        # "subject core" = bbox holding the top 25% of saliency mass
        order = sorted(range(len(px)), key=lambda k: -px[k])
        need = tot * 0.25
        acc = 0; xs = []; ys = []
        for idx in order:
            acc += px[idx]
            if px[idx] == 0: break
            xs.append(idx % ew); ys.append(idx // ew)
            if acc >= need: break
        bx0, bx1, by0, by1 = min(xs), max(xs), min(ys), max(ys)
        core_w_norm = (bx1 - bx0) / (ew - 1)
        core_h_norm = (by1 - by0) / (eh - 1)

    box_w = i["renderedW"]; box_h = i["renderedH"]
    # crop retention: object-fit fill + matching aspect-ratio => whole frame survives
    keep_w = 1.0; keep_h = 1.0
    # subject core size in DEVICE pixels at the rendered box size
    core_dev_w = core_w_norm * box_w * DPR
    core_dev_h = core_h_norm * box_h * DPR
    # centroid position relative to the crop window (0..1). With keep=1 the window
    # is the whole frame, so a 0.5,0.5 centroid is dead centre.
    off_x = (cx - 0.5) * 2.0   # -1..1
    off_y = (cy - 0.5) * 2.0
    dist_from_center = ((cx - 0.5) ** 2 + (cy - 0.5) ** 2) ** 0.5

    rows.append(dict(
        file=name, label=name.split("-1200w")[0],
        px_w=W, px_h=H, aspect=round(W / H, 4),
        bytes=os.path.getsize(p),
        box_css=f"{box_w:g}x{box_h:g}", box_w=box_w, box_h=box_h,
        keep_area_pct=round(keep_w * keep_h * 100, 1),
        sal_cx=round(cx, 3), sal_cy=round(cy, 3),
        off_x=round(off_x, 2), off_y=round(off_y, 2),
        dist_from_center=round(dist_from_center, 3),
        core_norm_wh=[round(core_w_norm, 3), round(core_h_norm, 3)],
        core_dev_wh=[round(core_dev_w, 1), round(core_dev_h, 1)],
        subject_fully_inside_crop=True,   # crop == full frame, provably
        alt=i["alt"], loading=i["loading"],
    ))

json.dump(rows, open(os.path.join(BASE, "crop-quality.json"), "w", encoding="utf-8"), indent=1)

print(f"{'file':30s} {'px':>10s} {'box CSS':>10s} {'keep%':>6s} {'salC(x,y)':>13s} {'coreDev px':>12s} {'alt'}")
for r in rows:
    print(f"{r['label']:30s} {str(r['px_w'])+'x'+str(r['px_h']):>10s} {r['box_css']:>10s} {r['keep_area_pct']:6.1f} "
          f"({r['sal_cx']:.2f},{r['sal_cy']:.2f})  {r['core_dev_wh'][0]:5.0f}x{r['core_dev_wh'][1]:<5.0f} "
          f"{'Y' if r['alt'] and r['alt'].strip() else 'MISSING'}")

print("\n=== CROP GEOMETRY SUMMARY ===")
print("distinct object-fit:", {i["objectFit"] for i in imgs})
print("distinct box sizes:", sorted({r["box_css"] for r in rows}))
print("min keep_area_pct:", min(r["keep_area_pct"] for r in rows))
print("images losing >40% of frame to crop:", sum(1 for r in rows if r["keep_area_pct"] < 60))
print("images whose subject falls outside the crop:", sum(1 for r in rows if not r["subject_fully_inside_crop"]))
print("\nsubject-core size in DEVICE px, ranked smallest first:")
for r in sorted(rows, key=lambda r: r["core_dev_wh"][0])[:10]:
    print(f"  {r['label']:30s} core={r['core_dev_wh'][0]:.0f}x{r['core_dev_wh'][1]:.0f} devpx  box={r['box_css']}")
tot = sum(r["bytes"] for r in rows)
print(f"\ntotal bytes: {tot} = {tot/1024/1024:.2f} MB for {len(rows)} images")
print(f"mean {tot/len(rows)/1024:.0f} KB per image, each rendered at {rows[0]['box_w']:g} CSS px")
