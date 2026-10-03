# Emit the per-image markdown table from measured data only.
import os, json
from collections import Counter
BASE = r"C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\mobile-audit"
cq = json.load(open(os.path.join(BASE, "crop-quality.json"), encoding="utf-8"))

def kb(n): return f"{n/1024:.0f} KB"
rows = ["| # | File | Source px | Box (CSS) | Bytes sent | 400w would be | Waste | Area kept | Saliency centroid | 1200w vs 400w at render box |",
        "|--:|---|--|--:|--:|--:|--:|--:|--|---|"]
for i, r in enumerate(cq):
    rows.append(
        f"| {i+1} | `{r['label']}` | {r['px_w']}x{r['px_h']} | {r['box_css']} | {kb(r['bytes1200'])} | "
        f"{kb(r['bytes400'])} | {r['bytes1200']/r['bytes400']:.1f}x | **100%** | "
        f"({r['sal_cx']:.2f}, {r['sal_cy']:.2f}) | {r['psnr']:.1f} dB |")
open(os.path.join(BASE, "table.md"), "w", encoding="utf-8").write("\n".join(rows))
print(f"{len(rows)-2} rows")
print("alt present:", sum(1 for r in cq if r["alt"] and r["alt"].strip()), "of", len(cq))
print("shapes:", dict(Counter(f'{r["px_w"]}x{r["px_h"]}' for r in cq)))
p = sorted(r["psnr"] for r in cq)
print("psnr min/med/max:", p[0], p[len(p)//2], p[-1])
xs = [r["sal_cx"] for r in cq]; ys = [r["sal_cy"] for r in cq]
print(f"centroid x {min(xs):.2f}-{max(xs):.2f}  y {min(ys):.2f}-{max(ys):.2f}")
print("total:", sum(r['bytes1200'] for r in cq), "vs", sum(r['bytes400'] for r in cq))
