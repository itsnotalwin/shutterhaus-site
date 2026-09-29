"""
Add a shoot's photos to the site: optimise -> write -> tell you what to commit.

Image files live in the repository (public/gallery/), not in a database — see
the header of supabase/schema.sql for why. So adding photos is a git operation
rather than a browser upload.

Usage:
    python tools/add-photos.py "C:/path/to/shoot"
    python tools/add-photos.py "C:/path/to/shoot" --start 9   # continue numbering
    python tools/add-photos.py "C:/path/to/shoot" --dry-run  # don't write

What it does:
  * resizes so the longest edge is 1800 px, progressive JPEG q82
  * refuses files already present (same bytes) so re-runs are safe
  * prints a ready-to-paste git command
  * prints the SQL to seed the metadata rows, ready for the Supabase MCP tool

It does NOT touch the database — seeding rows needs a project connection this
script deliberately does not hold, so the credentials never sit on disk here.
"""
import argparse
import io
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

REPO = Path(__file__).resolve().parent.parent
GALLERY = REPO / "public" / "gallery"
MAX_EDGE = 1800
QUALITY = 82
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}

SITE_BASE = "https://itsnotalwin.github.io/shutterhaus-site"


def slugify(stem: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")
    return s or "photo"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", help="folder of source photos")
    ap.add_argument("--start", type=int, default=None,
                    help="first sort_order to use (default: continue after the highest)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true",
                    help="re-optimise files that are already in the gallery")
    args = ap.parse_args()

    src_dir = Path(args.folder)
    if not src_dir.is_dir():
        print(f"not a folder: {src_dir}")
        return 1

    GALLERY.mkdir(parents=True, exist_ok=True)


    files = sorted(p for p in src_dir.iterdir()
                   if p.is_file() and p.suffix.lower() in IMG_EXT)
    if not files:
        print(f"no images found in {src_dir}")
        return 1

    # Continue numbering after whatever is already published, so a new shoot
    # appends to the grid instead of reshuffling it.
    start = args.start
    if start is None:
        import json
        demo = REPO / "src" / "demo.ts"
        n = 0
        if demo.is_file():
            n = len(re.findall(r'sort_order:', demo.read_text(encoding="utf-8")))
        start = n

    print(f"{len(files)} image(s) from {src_dir}")
    print(f"destination: {GALLERY}\n")

    # Skip by NAME, not by hash. Re-optimising an already-published file yields
    # slightly different bytes (PIL version, encoder state), so a hash check
    # reports every image as "new" on a second run — and re-adds photos that were
    # deliberately removed. The name is the thing that means "published".
    published = {p.name for p in GALLERY.glob("*.jpg")}

    rows, order, skipped, readded = [], start, 0, []
    for src in files:
        dst = GALLERY / f"{slugify(src.stem)}.jpg"
        if dst.name in published and not args.force:
            print(f"  = {dst.name}  already in gallery, skipping")
            skipped += 1
            continue
        if dst.name in published and args.force:
            readded.append(dst.name)
        dst = GALLERY / f"{slugify(src.stem)}.jpg"
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
            im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
            w, h = im.size
            buf = io.BytesIO()
            im.convert("RGB").save(buf, "JPEG", quality=QUALITY,
                                   optimize=True, progressive=True)
            data = buf.getvalue()

        if args.dry_run:
            print(f"  ~ {dst.name}  {w}x{h}  {len(data)//1024} KB")
        else:
            dst.write_bytes(data)
            print(f"  + {dst.name}  {w}x{h}  {len(data)//1024} KB")

        rel = f"gallery/{dst.name}"
        rows.append((dst.name, rel, w, h, order))
        order += 1

    print(f"\n{len(rows)} new file(s), {skipped} unchanged")

    if not rows:
        print("\nnothing to do")
        return 0

    if readded:
        print("\n--force replaced these published files:")
        for n in readded:
            print(f"  ! {n}")

    print("\n--- 1. commit and push the files -------------------------------")
    print(f'git add public/gallery && git commit -m "Add {len(rows)} photos" && git push')

    print("\n--- 2. seed the metadata rows (Supabase MCP, after the push) -----")
    print("insert into public.photos (filename, storage_path, url, width, height,")
    print("                          sort_order, visible, alt, album) values")
    values = ",\n".join(
        f"('{fn}','{rel}','{SITE_BASE}/{rel}',{w},{h},{o},true,'','photo')"
        for fn, rel, w, h, o in rows
    )
    print(values + ";")
    print("\nThen set alt text in admin.html — a blank alt is what Google indexes.")
    print("\nNOTE: any source file NOT listed above is already in the gallery. If"
          "\n      you are re-running on an old shoot, check the skipped list —"
          "\n      photos deleted earlier as duplicates are absent and would come"
          "\n      back as new.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
