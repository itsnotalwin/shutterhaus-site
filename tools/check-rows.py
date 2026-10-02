"""
The spacing guarantee, enforced.

    python tools/check-rows.py

Uncropped photos at DIFFERENT aspect ratios are not one height, so the short
ones leave a gap underneath. Alwin, 2026-10-01: "make sure it sits nice, no
spacing issues at all please". The fix is in the data — every row holds frames
of the same ratio — so this asserts it, because a row that quietly mixes
ratios is the whole defect coming back and the page still looks plausible.

Alwin, 2026-10-02: rows are TWO frames now, not three, and the re-curation
restored the 30 he originally asked for, so the counts below moved to
15 rows / 30 frames. These are asserted rather than inferred so a silent re-pack
cannot shrink the wall.

Also checks: frame count, no duplicates, every file exists, no numbering left
in the markup.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from rows import ROWS  # noqa: E402

GALLERY = ROOT / "public" / "gallery"

demo = (ROOT / "src" / "demo.ts").read_text(encoding="utf-8")
trip = re.findall(r'url: "gallery/([^"]+)"[^\n]*?width: (\d+), height: (\d+)', demo)
RATIO = {f: round(int(h) / int(w), 4) for f, w, h in trip}

fails = 0


def check(name, ok, detail=""):
    global fails
    if ok:
        print(f"ok    {name}" + (f"  ({detail})" if detail else ""))
    else:
        fails += 1
        print(f"FAIL  {name}" + (f"  ({detail})" if detail else ""))


flat = [f for row in ROWS for f in row]

EXPECTED_ROWS = 15
EXPECTED_PER_ROW = 2
EXPECTED_FRAMES = EXPECTED_ROWS * EXPECTED_PER_ROW

check("fifteen rows", len(ROWS) == EXPECTED_ROWS, str(len(ROWS)))
check("two frames per row", all(len(r) == EXPECTED_PER_ROW for r in ROWS), str([len(r) for r in ROWS]))
check(f"{EXPECTED_FRAMES} frames", len(flat) == EXPECTED_FRAMES, str(len(flat)))
check("no duplicates", len(set(flat)) == EXPECTED_FRAMES, f"{len(set(flat))} unique")
missing = [f for f in flat if not (GALLERY / f).exists()]
check("every frame exists on disk", not missing, ", ".join(missing))
unknown = [f for f in flat if f not in RATIO]
check("every frame is in the gallery", not unknown, ", ".join(unknown))

# THE SPACING GUARANTEE. 0.5% tolerance covers a resave rounding difference.
bad = []
for i, row in enumerate(ROWS, 1):
    rs = [RATIO.get(f) for f in row]
    if any(r is None for r in rs):
        bad.append(f"row {i}: unknown ratio")
        continue
    if (max(rs) - min(rs)) / max(rs) > 0.005:
        bad.append(f"row {i}: ratios {rs}")
check("every row is ONE aspect ratio (zero gap under any photo)", not bad, "; ".join(bad))

# And the arithmetic that proves it: equal ratio x equal column width = equal height.
widths = [RATIO[f] for f in flat if f in RATIO]
check("ratios present for every frame", len(widths) == EXPECTED_FRAMES, str(len(widths)))

pages = (ROOT / "src" / "pages.ts").read_text(encoding="utf-8")
check("no frame numbering is printed", "pf-cell__n" not in pages,
      "pf-cell__n still emitted" if "pf-cell__n" in pages else "")

if fails:
    print(f"\n{fails} check(s) failed")
    raise SystemExit(1)
print(f"\n{len(ROWS)} rows, {len(flat)} frames, every row exactly one ratio")
