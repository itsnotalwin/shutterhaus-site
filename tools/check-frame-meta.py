"""
Check tools/frame-meta.py against the gallery and the render order.

Fails loudly rather than shipping a frame with no alt text: the whole point of
the file is that every frame has a real description, and a silent gap would put
us back to a generic fallback.

Usage: python tools/check-frame-meta.py
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from frame_meta import CATEGORIES, FRAMES  # noqa: E402

EXTS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_ALT = 125


def main() -> int:
    meta = json.loads((ROOT / "interleave-order.json").read_text(encoding="utf-8"))
    order = meta["order"]

    # Derivative sizes (the -400w / -800w / -1200w / -1600w ladder) are not
    # gallery frames. Match the numeric tier, not a fixed list, so adding a new
    # ladder step does not make every derivative look like a missing frame.
    def is_frame(name: str) -> bool:
        if Path(name).suffix.lower() not in EXTS:
            return False
        return re.search(r"-\d+w$", Path(name).stem) is None

    on_disk = {p.name for p in (ROOT / "public" / "gallery").iterdir() if is_frame(p.name)}

    problems: list[str] = []

    if len(order) != len(set(order)):
        problems.append("render order contains duplicates")
    if len(order) != 50:
        problems.append(f"expected 50 frames in the render order, found {len(order)}")

    missing = [f for f in order if f not in FRAMES]
    if missing:
        problems.append(f"{len(missing)} frame(s) with no alt text: {missing}")

    extra = [f for f in FRAMES if f not in set(order)]
    if extra:
        problems.append(f"{len(extra)} alt entry(ies) not in the render order: {extra}")

    unlisted = on_disk - set(order)
    if unlisted:
        problems.append(f"{len(unlisted)} gallery file(s) missing from the render order: {sorted(unlisted)}")

    for name, meta_ in FRAMES.items():
        if len(meta_["alt"]) > MAX_ALT:
            problems.append(f"alt over {MAX_ALT} chars: {name} ({len(meta_['alt'])})")
        if meta_["cat"] not in CATEGORIES:
            problems.append(f"unknown category {meta_['cat']!r}: {name}")
        if meta_["alt"].lower() == "portrait, natural light":
            problems.append(f"still the old placeholder alt: {name}")

    if problems:
        print("FAIL")
        for p in problems:
            print("  -", p)
        return 1

    counts = Counter(v["cat"] for v in FRAMES.values())
    print(f"ok    {len(FRAMES)} frames, every one described")
    print(f"ok    categories: {', '.join(f'{k}={counts[k]}' for k in sorted(counts))}")
    print(f"ok    longest alt: {max(len(v['alt']) for v in FRAMES.values())} chars")
    print("frame meta is complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
