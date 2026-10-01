"""
Regenerate src/demo.ts from whatever is currently in public/gallery/.

Dimensions and filenames are read from the FILES, never hand-typed: the
srcset cap in `pictureFor()` depends on a correct `width`, and a wrong one
advertises a derivative that was never generated — which is what rendered
the home hero as a black box once already.

Ordering: shoots are spread apart, not simply sorted by filename. See below.

Run: python tools/build-demo-ts.py
Idempotent — regenerates the file wholesale.

--- Why the order is not the export order -------------------------------

Alwin, 2026-10-01: "too many of the same shoot next to or close to each other
should have variance". The export order put 16 frames of one session in a single
block, so half the wall was the same woman in the same outfit in the same room.

tools/shootorder.py decides the order: it clusters the gallery into shoots by
colour and image hash, then interleaves them so no two frames from one shoot sit
next to each other, and as few as possible sit within a few positions of each
other. It writes interleave-order.json, which this script consumes.

This script HARD-FAILS if that order file is missing or was written for a
different set of frames. It used to print a warning and fall back to export
order, which reintroduced the clump silently and looked like the fix had been
undone. When the gallery changes:

  python tools/shootorder.py --write   # re-spread the shoots
  python tools/build-demo-ts.py        # regenerate src/demo.ts
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from frame_meta import FRAMES  # noqa: E402
DEMO = ROOT / "src" / "demo.ts"
GALLERY = ROOT / "public" / "gallery"
ORDER_FILE = ROOT / "interleave-order.json"

# Suffixes make-derivatives.py appends; only real originals belong here.
DERIV = re.compile(r"-\d+w\.(jpe?g|webp|png)$", re.I)


def gallery_fingerprint(files: list[Path]) -> str:
    """
    A digest of WHICH frames exist, matching what shootorder.py records.

    Name and size are enough here. Re-hashing image content would catch an
    in-place edit that keeps the filename, which does not happen in this
    workflow — add or remove an image, and both the name and the frame count
    change. The two functions must stay in step: one records the digest, the
    other refuses a file whose digest no longer matches.
    """
    parts = [f"{p.name}:{p.stat().st_size}" for p in files]
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()[:16]


def apply_shoot_order(files: list[Path]) -> list[Path]:
    """
    Re-sort into the shoot-spread order, or refuse.

    Every failure path here raises instead of warning. That is the point of the
    function: a stale or missing order file makes the wall clump again, and a
    printed warning scrolls past while `demo.ts` still gets written and shipped.
    Exiting non-zero means the build stops with the reason on screen.

    Appending unknown frames at the end — the earlier behaviour — is specifically
    the failure being avoided. It yields a wall that is *mostly* spread with one
    clump tacked on, which reads as success. The digest catches that case before
    the ordering is applied at all.
    """
    if not ORDER_FILE.exists():
        raise SystemExit(
            "interleave-order.json not found. Regenerate it, do not fall back:\n"
            "  python tools/shootorder.py --write\n"
            "Export order clumps same-shoot frames, which is the problem this exists "
            "to fix, and shipping it looks exactly like the fix never happened."
        )

    meta = json.loads(ORDER_FILE.read_text(encoding="utf-8"))

    if meta.get("fingerprint") != gallery_fingerprint(files):
        raise SystemExit(
            "interleave-order.json is STALE — it was written for a different set of "
            "frames than public/gallery/ now holds.\n"
            "Regenerate it:\n"
            "  python tools/shootorder.py --write\n"
            "then re-run this script."
        )

    rank = {name: i for i, name in enumerate(meta.get("order", []))}
    unknown = [p.name for p in files if p.name not in rank]
    if unknown:
        # The digest matching while names are missing means the two scripts
        # disagree about which files count as originals — a real bug, not drift.
        raise SystemExit(
            f"{len(unknown)} frame(s) missing from the order despite a matching "
            f"digest: {', '.join(unknown[:3])}{'...' if len(unknown) > 3 else ''}\n"
            "The two tools disagree about which files are originals."
        )

    files.sort(key=lambda p: (rank[p.name], p.name))
    return files

def main() -> None:
    files = [
        p for p in GALLERY.iterdir()
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"} and not DERIV.search(p.name)
    ]
    # "1-foo.jpg", "10-foo.jpg" ... sort by the leading integer, not lexically,
    # so 2 comes before 10 the way the export numbered them.
    def key(p: Path):
        m = re.match(r"^(\d+)", p.stem)
        return (int(m.group(1)) if m else 10**9, p.stem)

    files.sort(key=key)
    files = apply_shoot_order(files)

    rows = []
    for i, p in enumerate(files):
        w, h = Image.open(p).size
        # Real per-frame description, from tools/frame_meta.py. These used to be
        # a hardcoded "Portrait, natural light" on all 50 frames, which is the
        # alt text, the SEO description and the lightbox caption at once — 50
        # identical ones was an accessibility bug and wasted search value.
        meta = FRAMES.get(p.name)
        if meta is None:
            raise SystemExit(
                f"no alt text for {p.name} — add it to tools/frame_meta.py "
                f"(or run tools/check-frame-meta.py to see the gap)"
            )
        alt = meta["alt"].replace('"', '\\"')
        cat = meta["cat"]
        rows.append(
            f'  {{ id: "c{i}", url: "gallery/{p.name}", '
            f'alt: "{alt}", album: "{cat}", '
            f"sort_order: {i}, visible: true, width: {w}, height: {h}, "
            f'filename: "{p.name}" }},'
        )

    doc = f'''import type {{ Photo }} from "./types";

/**
 * Alwin's favourites.
 *
 * Not a single shoot — these are the frames he picked out of everything he has
 * shot since he started. So there is no session narrative in the order; the
 * leading number is just the export order of the folder they were gathered in.
 *
 * GENERATED by tools/build-demo-ts.py from the files in public/gallery/ — do
 * not hand-edit. `width`/`height` are read from the actual images because
 * `pictureFor()` caps its srcset ladder at the source width, and a wrong value
 * advertises a derivative that does not exist (this shipped once as a black-box
 * hero).
 *
 * To add or reorder: change the files in public/gallery/, then
 *   python tools/build-demo-ts.py && python tools/make-derivatives.py
 *
 * The images live in public/gallery/ so the gallery looks right before
 * Supabase is connected. Uploads through /admin take over automatically.
 */
export const DEMO_PHOTOS: Photo[] = [
{chr(10).join(rows)}
];
'''
    DEMO.write_text(doc, encoding="utf-8")
    print(f"{len(rows)} photo(s) written to src/demo.ts")


if __name__ == "__main__":
    main()
