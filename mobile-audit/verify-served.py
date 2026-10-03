# Verify true dimensions of the SERVED files (download from live origin) and the local clones.
import os, json, urllib.request
from PIL import Image

BASE = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\mobile-audit"
DL = os.path.join(BASE, "served")
os.makedirs(DL, exist_ok=True)
LOCAL = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\public\gallery"

imgs = json.load(open(os.path.join(BASE, "portfolio-imgs.json"), encoding="utf-8"))
rows = []
for i in imgs:
    name = i["currentSrc"].split("/")[-1]
    dest = os.path.join(DL, name)
    url = "https://shutterhausvisuals.co.za/gallery/" + name
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=45).read()
        open(dest, "wb").write(data)
        with Image.open(dest) as im:
            sw, sh, fmt = im.width, im.height, im.format
    except Exception as e:
        sw = sh = None; fmt = "ERR:" + str(e)[:60]; data = b""
    lp = os.path.join(LOCAL, name)
    lw = lh = lfmt = None
    if os.path.exists(lp):
        with Image.open(lp) as im:
            lw, lh, lfmt = im.width, im.height, im.format
    rows.append(dict(idx=i["idx"], file=name, served_w=sw, served_h=sh, served_fmt=fmt,
                     served_bytes=len(data), local_w=lw, local_h=lh, local_fmt=lfmt,
                     local_bytes=os.path.getsize(lp) if os.path.exists(lp) else None,
                     label=(i["currentSrc"].split("/")[-2] if False else name.split("-1200w")[0]),
                     rendered_w=i["renderedW"], rendered_h=i["renderedH"],
                     alt=i["alt"], declared_ar=i["ar"]))
json.dump(rows, open(os.path.join(BASE, "served-dims.json"), "w", encoding="utf-8"), indent=1)

print(f"{'file':34s} {'served px':>12s} {'fmt':>5s} {'bytes':>8s}  {'local px':>12s} {'localB':>8s}  box")
mism = 0
for r in rows:
    sw = f"{r['served_w']}x{r['served_h']}" if r["served_w"] else "n/a"
    lw = f"{r['local_w']}x{r['local_h']}" if r["local_w"] else "MISSING"
    print(f"{r['file']:34s} {sw:>12s} {str(r['served_fmt']):>5s} {r['served_bytes']:>8d}  {lw:>12s} {str(r['local_bytes']):>8s}  {r['rendered_w']}x{r['rendered_h']}")
    if r["served_w"] != 1200: mism += 1
print(f"\nfiles NOT actually 1200px wide despite the -1200w name: {mism} of {len(rows)}")
ws = {(r["served_w"], r["served_h"]) for r in rows if r["served_w"]}
print("distinct served pixel sizes:", sorted(ws))
tb = sum(r["served_bytes"] for r in rows)
print(f"total served bytes for 30 images: {tb} B = {tb/1024/1024:.2f} MB")
print(f"effective bytes per 111px-wide thumbnail: {tb/30/1024:.0f} KB")
