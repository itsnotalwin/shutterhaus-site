"""
Find near-duplicate / duplicate images in a folder.

Byte-identical files are found by hash. Visually similar files (re-exports,
mild edits, different compression) are found by perceptual hash: aHash + dHash
with a Hamming-distance threshold. EXIF camera timestamp catches straight
re-shoots of the same frame.
"""
import hashlib
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageOps

SIMILAR_THRESHOLD = 8  # hamming distance out of 64 bits (~87% alike)


def ahash(img: Image.Image) -> int:
    g = img.convert("L").resize((8, 8), Image.LANCZOS)
    px = list(g.getdata())
    avg = sum(px) / len(px)
    bits = 0
    for i, p in enumerate(px):
        if p > avg:
            bits |= 1 << i
    return bits


def dhash(img: Image.Image) -> int:
    g = img.convert("L").resize((9, 8), Image.LANCZOS)
    px = list(g.getdata())
    bits = 0
    for y in range(8):
        for x in range(8):
            if px[y * 9 + x] > px[y * 9 + x + 1]:
                bits |= 1 << (y * 8 + x)
    return bits


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def exif_dt(img: Image.Image):
    try:
        return img.getexif().get(36867)  # DateTimeOriginal
    except Exception:
        return None


def main(folder: str) -> int:
    files = sorted(
        p
        for p in Path(folder).rglob("*")
        if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".heic", ".tif", ".tiff"}
    )
    if not files:
        print("no images found in", folder)
        return 1

    rows = []
    for p in files:
        data = p.read_bytes()
        byte = hashlib.sha256(data).hexdigest()
        try:
            im = ImageOps.exif_transpose(Image.open(p))
            im.load()
            a, d, dt = ahash(im), dhash(im), exif_dt(im)
            rows.append((p, len(data), byte, a, d, dt, im.size))
        except Exception as e:  # noqa: BLE001
            rows.append((p, len(data), byte, None, None, None, None))
            print(f"!! could not read {p.name}: {e}")

    print(f"\n{len(files)} image(s) in {folder}\n")

    # --- exact byte duplicates ---
    by_hash = defaultdict(list)
    for r in rows:
        by_hash[r[2]].append(r[0])
    exact = {h: v for h, v in by_hash.items() if len(v) > 1}
    print("== EXACT duplicates (same bytes) ==")
    if not exact:
        print("  none")
    for h, v in exact.items():
        print(f"  {h[:12]}  {', '.join(x.name for x in v)}")

    # --- perceptual duplicates ---
    print("\n== NEAR duplicates (visually alike) ==")
    found = False
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            a1, a2 = rows[i], rows[j]
            if a1[3] is None or a2[3] is None:
                continue
            da, dd = hamming(a1[3], a2[3]), hamming(a1[4], a2[4])
            dist = min(da, dd)
            if dist <= SIMILAR_THRESHOLD:
                found = True
                same_dt = a1[5] and a1[5] == a2[5]
                print(
                    f"  {a1[0].name} <-> {a2[0].name}   hamming={dist} "
                    f"(a={da} d={dd}){'  SAME EXIF TIME' if same_dt else ''}"
                )
    if not found:
        print("  none")

    # --- same shooting moment ---
    print("\n== SAME EXIF capture time (re-shoots / copies) ==")
    by_dt = defaultdict(list)
    for r in rows:
        if r[5]:
            by_dt[r[5]].append(r[0])
    hit = False
    for dt, v in sorted(by_dt.items()):
        if len(v) > 1:
            hit = True
            print(f"  {dt}  ->  {', '.join(x.name for x in v)}")
    if not hit:
        print("  none")

    # --- per-file detail ---
    print("\n== PER FILE ==")
    for p, size, b, a, d, dt, dims in rows:
        print(
            f"  {p.name:24} {size/1024:8.0f} KB  {str(dims):16} "
            f"ah={a if a is None else format(a,'016x')}  dt={dt}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
