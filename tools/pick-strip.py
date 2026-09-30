"""
Choose the home-strip frame set by SEARCH, not by eye.

Alwin: "i just see some random white space and its ugly at the bottom right
of the selected work." The strip packs 8 frames into 3 columns, and 8 does
not divide by 3 — the best possible split is 2/3/3, so one column is short
no matter how clever the packer is. The real fix is picking a frame COUNT
that divides evenly AND whose aspect ratios happen to balance.

This scores every subset of the available frames (after the hero) for a given
column count and reports the best few. Bounded with itertools.combinations
over a capped candidate pool, because the full 49-frame pool times a 12-frame
subset is 1e11 combinations and will hang.

Run: python tools/pick-strip.py [cols]
"""

import itertools
import re
import sys

DEMO = "src/demo.ts"
HERO = "27-img-0297.jpg"  # pinned in config.heroPhoto
CANDIDATE_CAP = 24  # keep the search tractable; the strip is art direction, not a proof


def frames() -> list[tuple[float, str]]:
    """(width/height, filename) for every bundled frame except the hero."""
    src = open(DEMO, encoding="utf-8").read()
    rows = re.findall(r'width: (\d+), height: (\d+), filename: "([^"]+)"', src)
    out = [(int(w) / int(h), n) for w, h, n in rows if n != HERO]
    return out


def spread(heights: list[float], cols: int) -> tuple[float, list[float]]:
    """Greedy shortest-column-first packing; returns (spread, column totals)."""
    cols_h: list[list[float]] = [[] for _ in range(cols)]
    totals = [0.0] * cols
    for h in heights:
        c = min(range(cols), key=lambda i: totals[i])
        cols_h[c].append(h)
        totals[c] += h
    return max(totals) - min(totals), totals


def main() -> None:
    cols = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    pool = frames()[:CANDIDATE_CAP]
    print(f"{len(pool)} candidate frames, {cols} columns\n")

    results = []
    for take in (6, 8, 9, 10, 12, 15):
        if take > len(pool):
            continue
        best = None
        for combo in itertools.combinations(range(len(pool)), take):
            hs = [pool[i][0] for i in combo]
            sp, totals = spread(hs, cols)
            if best is None or sp < best[0]:
                best = (sp, combo, totals)
        sp, combo, totals = best
        per = [len(HS) for HS in [[pool[i][0] for i in c] for c in [[]]]]
        results.append((sp, take, combo))
        print(
            f"take={take:2d}  spread={sp:.3f}  "
            f"worst gap ~{sp * 400:.0f}px  totals={[round(t, 2) for t in totals]}"
        )

    results.sort()
    sp, take, combo = results[0]
    print(f"\nBEST: cols={cols} take={take} spread={sp:.3f}")
    for i in combo:
        h, n = pool[i]
        print(f"  {n:<34} h/w={h:.3f}")


if __name__ == "__main__":
    main()
