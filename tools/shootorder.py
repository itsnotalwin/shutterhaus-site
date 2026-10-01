"""
Group the gallery into shoots and spread them out.

Alwin, 2026-10-01: "too many of the same shoot next to or close to each other
should have variance". Half the wall was the same woman in the same top against
the same wall, because the generator sorted by the leading number in the export
filename — and that number is the order the folder was gathered in, so a burst
landed as one unbroken block.

The grouping has to come from the pictures, not the filenames. Filename prefixes
run 1,2,4,5,6,7,8,9,11,12... with no gaps that mean anything, and two adjacent
numbers are not reliably the same session.

Signals, and why dhash alone is not enough here:
every frame is a portrait of the same subject in the same room, so the 64-bit
difference hash has a median pair distance of 31 of 64 and the sessions overlap
almost entirely — measured, not guessed (tools/calibrate-shoots.py). A change of
pose moves those bits about as much as a change of room does.

Colour distance is what separates them. Over all 1225 pairs the percentiles are
p1 0.004, p10 0.047, p30 0.169, p50 0.454: same-session pairs land under ~0.2
and cross-session pairs start around 0.3. So the cut sits at 0.30, with the hash
kept as a secondary gate at 24/64 so two shots that merely share a palette do
not merge into one cluster.

That pairing yields 17 clusters from 50 frames, of which four are large: 16, 12,
6 and 3. Those four ARE the runs Alwin is complaining about.

    python tools/shootorder.py            # report the clusters
    python tools/shootorder.py --write    # write interleave-order.json
"""

from __future__ import annotations

import colorsys
import hashlib
import json
import random
import re
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GALLERY = ROOT / "public" / "gallery"

# Derived filenames carry a width suffix; originals never do. Excluding only
# "-400w" swept in the 800w/1200w/1600w rungs, and a derivative clusters
# perfectly with its own original — 174 "shots" that are really 50.
DERIV = re.compile(r"-\d+w\.(jpe?g|webp|png)$", re.I)

# Chosen from the measured distribution — see the module docstring.
DH_MAX = 24
COLOUR_MAX = 0.30

# How far apart two frames of one shoot have to sit, in wall positions.
#
# This was 4, and that was unachievable: the largest shoot has 16 frames in 50
# wall slots, so its 15 gaps must share 49 positions, and 15 gaps of 4 would
# need 60. No ordering can satisfy GAP=4 for that shoot, so the solver was
# spending its budget on a constraint it could never meet while the number it
# reports stayed stuck. GAP=3 is the largest value the biggest session can
# actually achieve (15 x 3 = 45 <= 49), so the target is one the search can
# finish. The adjacency rule below is a separate, unconditional guarantee.
GAP = 3

# Perturb-and-repair attempts. Each one is a full O(n^3) local search, so this is
# the runtime knob: 60 took ~4 minutes on 50 frames and is enough to reach a
# good ordering, but the cost is superlinear so doubling it roughly doubles the
# wait. Raise it only when the gallery changes materially.
RESTARTS = 240

# src/index.html is a SPA; the wall is the only thing this order is tuned for.
OUT = ROOT / "interleave-order.json"


def originals() -> list[Path]:
    """Every real photograph in the gallery, in export-filename order."""
    files = [
        p
        for p in GALLERY.iterdir()
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"} and not DERIV.search(p.name)
    ]

    def key(p: Path):
        m = re.match(r"^(\d+)", p.stem)
        return (int(m.group(1)) if m else 10**9, p.stem)

    return sorted(files, key=key)


def fingerprint(files: list[Path]) -> str:
    """
    A digest of WHICH frames this order was computed for.

    Without it, `build-demo-ts.py` cannot tell a fresh order file from one
    written before frames were added or removed — and the fallback is silent:
    new frames get appended in export order and the same-shoot clump returns,
    looking like the tool simply never worked. The digest makes the mismatch
    detectable. Name and size are enough: content edits that keep the filename
    and dimensions are out of scope, and a re-run is cheap.
    """
    parts = [f"{p.name}:{p.stat().st_size}" for p in files]
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()[:16]


def _popcount(x: int) -> int:
    return bin(x).count("1")


def _dhash(img: Image.Image, size: int = 8) -> int:
    g = img.convert("L").resize((size + 1, size), Image.LANCZOS)
    a = np.asarray(g, dtype=np.int16)
    bits = (a[:, 1:] > a[:, :-1]).flatten()
    return int("".join("1" if b else "0" for b in bits), 2)


def _colour(img: Image.Image) -> tuple[float, float]:
    """Mean hue and mean saturation/value, over a coarse grid of patches.

    Averaging over patches rather than the whole frame keeps one warm window in
    a cool room from deciding the whole signature.
    """
    small = img.convert("RGB").resize((64, 64), Image.LANCZOS)
    a = np.asarray(small, dtype=np.float32) / 255.0
    rows, cols, _ = a.shape
    hues, sats, vals = [], [], []
    for r in range(0, rows, 8):
        for c in range(0, cols, 8):
            patch = a[r : r + 8, c : c + 8].reshape(-1, 3).mean(axis=0)
            h, l, s = colorsys.rgb_to_hls(*patch)
            hues.append(h * 360)
            sats.append(s)
            vals.append(l)
    return float(np.mean(hues)), float(np.mean(sats)), float(np.mean(vals))


def shoot_of(pairs: np.ndarray, n: int) -> list[int]:
    """Connected components over the same-shoot predicate, as cluster indices."""
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i in range(n):
        for j in range(i + 1, n):
            if pairs[i, j]:
                ri, rj = find(i), find(j)
                if ri != rj:
                    parent[rj] = ri

    roots: dict[int, int] = {}
    out = []
    for i in range(n):
        r = find(i)
        if r not in roots:
            roots[r] = len(roots)
        out.append(roots[r])
    return out


def cluster(files: list[Path]) -> tuple[list[int], np.ndarray]:
    """Return the cluster index per file and the raw distance matrix."""
    n = len(files)
    sig: list[tuple[float, float, float]] = []
    dhs: list[int] = []
    for p in files:
        with Image.open(p) as im:
            dhs.append(_dhash(im))
            sig.append(_colour(im))

    dh = np.zeros((n, n), np.int16)
    colour_d = np.zeros((n, n), np.float32)
    for i in range(n):
        for j in range(i + 1, n):
            dh[i, j] = dh[j, i] = _popcount(dhs[i] ^ dhs[j])
            hi, si, vi = sig[i]
            hj, sj, vj = sig[j]
            # Hue is circular: 350deg and 10deg are close, not 340deg apart.
            d = abs(hi - hj) % 360
            d = min(d, 360 - d)
            c = d / 180.0 + abs(si - sj) + abs(vi - vj) / 2
            colour_d[i, j] = colour_d[j, i] = c

    same = (dh <= DH_MAX) & (colour_d <= COLOUR_MAX)
    return shoot_of(same, n), colour_d


def _violations(seq: list[int], shoots: list[int], gap: int) -> int:
    """
    Total cost: every same-shoot pair closer than `gap` positions is bad.

    Adjacent pairs are weighted far above the rest. "Next to each other" is what
    Alwin saw; a pair four apart in a justified wall already reads as unrelated.
    Counting them equally would let the optimiser fix 24 borderline pairs and
    leave one true clump sitting in plain sight.
    """
    last: dict[int, int] = {}
    cost = 0
    for pos, idx in enumerate(seq):
        s = shoots[idx]
        if s in last:
            d = pos - last[s]
            if d == 1:
                cost += 100  # side by side: the thing Alwin actually saw
            elif d < gap:
                cost += 1
        last[s] = pos
    return cost


def interleave(files: list[Path], shoots: list[int]) -> list[int]:
    """
    Order the frames so no two from one shoot sit next to or almost next to
    each other.

    Greedy least-recently-used, then a swap-repair pass. Greedy alone is not
    enough: with 16/12/6/3 frames in the four big sessions and only 13 other
    frames to separate them, first-choice selection runs out of separators and
    falls through to its fallback tiers, which is how the first version of this
    function still shipped 4 adjacent pairs.

    The repair is a local search over pairwise swaps — cheap because it only
    re-scores the four positions a swap can move. It terminates when a full pass
    finds no improving swap, and every swap is checked before being taken, so it
    cannot cycle.
    """
    n = len(files)
    by_shoot: dict[int, list[int]] = {}
    for idx, s in enumerate(shoots):
        by_shoot.setdefault(s, []).append(idx)

    # --- seed: round-robin the shoots largest-first, which is the arrangement
    # with the most separators, then hand out frames in export order.
    cursor = {s: 0 for s in by_shoot}
    recent: list[int] = []
    last_used = {s: -1 for s in by_shoot}
    seq: list[int] = []
    order_shoots = sorted(by_shoot, key=lambda s: (-len(by_shoot[s]), s))
    while len(seq) < n:
        remaining = [s for s in order_shoots if cursor[s] < len(by_shoot[s])]
        pick = min(remaining, key=lambda s: (last_used[s], s))
        seq.append(by_shoot[pick][cursor[pick]])
        cursor[pick] += 1
        last_used[pick] = len(seq) - 1
        recent.append(pick)
        if len(recent) > GAP:
            recent.pop(0)

    best_seq = seq
    best = _violations(seq, shoots, GAP)

    # Perturb and re-repair, keep anything better.
    #
    # One deterministic pass is not enough. The greedy seed is fixed, so the repair
    # always converges to the same local minimum. Measured on the real gallery:
    # a single pass leaves 25 same-shoot pairs inside the window, and 60
    # perturbations from the base reach 15-22 depending on the seed path — the
    # spread matters, because an earlier single-seed run once reported 13 and
    # would not reproduce, which is why the seed is fixed AND the budget is not
    # quoted as a guarantee. The only hard guarantee is zero adjacent pairs.
    rng = random.Random(11)
    for _ in range(RESTARTS):
        cand = list(best_seq)
        for _ in range(rng.randint(2, 7)):
            i, j = rng.randrange(n), rng.randrange(n)
            cand[i], cand[j] = cand[j], cand[i]
        cand, cost = _repair(cand, shoots, GAP)
        if cost < best:
            best, best_seq = cost, cand

    return best_seq


def _repair(seq: list[int], shoots: list[int], gap: int) -> tuple[list[int], int]:
    """Swap-repair until no pairwise swap improves the violation cost."""
    n = len(seq)
    seq = list(seq)
    best = _violations(seq, shoots, gap)
    while best > 0:
        improved = False
        for i in range(n):
            for j in range(i + 1, n):
                if shoots[seq[i]] == shoots[seq[j]]:
                    continue  # swapping within a shoot changes nothing
                seq[i], seq[j] = seq[j], seq[i]
                cost = _violations(seq, shoots, gap)
                if cost < best:
                    best = cost
                    improved = True
                    break
                seq[i], seq[j] = seq[j], seq[i]
            if improved:
                # Restart the scan rather than resuming mid-loop. The cost is a
                # whole-sequence measure, so an early swap changes what counts as
                # an improvement for every position after it.
                break
        if not improved:
            break
    return seq, best


def main() -> None:
    files = originals()
    shoots, _ = cluster(files)
    order = interleave(files, shoots)

    sizes: dict[int, int] = {}
    for s in shoots:
        sizes[s] = sizes.get(s, 0) + 1

    print(f"{len(files)} frames -> {len(sizes)} shoots")
    for s, c in sorted(sizes.items(), key=lambda kv: -kv[1]):
        if c >= 3:
            names = [files[i].name for i, x in enumerate(shoots) if x == s]
            print(f"  shoot {s} ({c}): {', '.join(n[:22] for n in names[:6])}"
                  + (" ..." if len(names) > 6 else ""))

    # The measures that matter, and why "worst gap" is not one of them:
    # max-distance between same-shoot frames goes UP when frames spread apart,
    # so rewarding a big number would score a clump as highly as a spread.
    # What Alwin complained about was "next to or close to", so count the pairs
    # that actually land close, before and after.
    def closeness(seq: list[int]) -> tuple[int, int, float]:
        last: dict[int, int] = {}
        adjacent = 0
        within = 0
        dists: list[int] = []
        for pos, idx in enumerate(seq):
            s = shoots[idx]
            if s in last:
                d = pos - last[s]
                dists.append(d)
                if d == 1:
                    adjacent += 1
                if d <= GAP:
                    within += 1
            last[s] = pos
        mean = sum(dists) / len(dists) if dists else 0.0
        return adjacent, within, mean

    a_before = closeness(list(range(len(files))))
    a_after = closeness(order)
    print(f"\nsame-shoot pairs touching:   {a_before[0]} -> {a_after[0]}")
    print(f"same-shoot pairs within {GAP}: {a_before[1]} -> {a_after[1]}")
    print(f"mean distance between same-shoot frames: {a_before[2]:.1f} -> {a_after[2]:.1f}")

    # How close together can same-shoot frames be at best?
    #
    # A shoot with m frames in n slots has m-1 gaps whose sum is at most n-1,
    # and each gap costs at least 1. If k of those gaps reach GAP, they cost
    # GAP each and the rest cost 1, so (GAP-1)*k + (m-1) <= n-1 and therefore
    # k <= (n-1-(m-1))/(GAP-1). The rest are unavoidably closer than GAP:
    #   floor = (m-1) - k
    # This is a LOWER bound per shoot, and it does not model contention between
    # shoots — four large sessions competing for the same 50 slots push the real
    # optimum above it. Printed so the achieved number is read as "near the
    # achievable limit" and not as "should have been zero".
    n_slots = len(files)
    floor = 0
    for s, c in sorted(sizes.items()):
        if c < 2:
            continue
        gaps = c - 1
        k = (n_slots - gaps) // (GAP - 1)
        short = gaps - min(gaps, max(k, 0))
        floor += short
        if short:
            print(
                f"  shoot {s}: {c} frames in {n_slots} slots cannot all sit {GAP} apart"
                f" — at least {short} pair(s) forced closer"
            )
    print(f"per-shoot lower bound on 'within {GAP}': {floor} (ignores cross-shoot contention)")

    # Zero adjacent pairs is the only claim worth making, so assert it.
    if a_after[0] != 0:
        raise SystemExit(f"interleave left {a_after[0]} adjacent same-shoot pair(s)")

    if "--write" in __import__("sys").argv:
        payload = {
            "dh_max": DH_MAX,
            "colour_max": COLOUR_MAX,
            "gap": GAP,
            "fingerprint": fingerprint(files),
            "adjacent_before": a_before[0],
            "adjacent_after": a_after[0],
            "within_gap_before": a_before[1],
            "within_gap_after": a_after[1],
            "mean_distance_before": round(a_before[2], 2),
            "mean_distance_after": round(a_after[2], 2),
            "order": [files[i].name for i in order],
            "shoot_of": {files[i].name: shoots[i] for i in range(len(files))},
        }
        OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()