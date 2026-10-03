# Emit the per-image markdown table rows from measured data.
import os, json
BASE = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\mobile-audit"
LOCAL = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\public\gallery"
cq = json.load(open(os.path.join(BASE, "crop-quality.json"), encoding="utf-8"))

def kb(n): return f"{n/1024:.0f} KB"

rows = []
rows.append("| # | File | Source px | Ratio | Box (CSS) | Bytes sent | 400w would be | Waste | Crop kept | Saliency centroid | Subject core (device px) |")
rows.append("|--:|---|--|--:|--:|--:|--:|--:|--:|--|--|")
for i, r in enumerate(cq):
    p400 = os.path.join(LOCAL, f"{r['label']}-400w.webp")
    b400 = os.path.getsize(p400)
    waste = r["bytes"] / b400
    rows.append(
        f"| {i+1} | `{r['label']}.webp` | {r['px_w']}x{r['px_h']} | {r['aspect']} | "
        f"{r['box_css'].replace('x','x')} | {kb(r['bytes'])} | {kb(b400)} | {waste:.1f}x | "
        f"**100%** | ({r['sal_cx']:.2f}, {r['sal_cy']:.2f}) | {r['core_dev_wh'][0]:.0f}x{r['core_dev_wh'][1]:.0f} |"
    )
out = "\n".join(rows)
open(os.path.join(BASE, "table.md"), "w", encoding="utf-8").write(out)
print(f"{len(rows)-2} rows written, {len(out)} chars")

# alt coverage + shape summary
alts = [r for r in cq if r["alt"] and r["alt"].strip()]
print("alt present:", len(alts), "of", len(cq))
from collections import Counter
print("shapes:", Counter(f'{r["px_w"]}x{r["px_h"]}' for r in cq))
print("boxes:", Counter(r["box_css"] for r in cq))
