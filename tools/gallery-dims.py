"""
Report true pixel dimensions of the optimised gallery files.

Used to seed the photos table with width/height so the layout can reserve
space before the image arrives (CLS) and so the admin can show real sizes.

Usage: python tools/gallery-dims.py
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GALLERY = ROOT / "public" / "gallery"


def main() -> int:
    if not GALLERY.is_dir():
        print(f"no gallery at {GALLERY}", file=sys.stderr)
        return 1
    rows = []
    for f in sorted(GALLERY.glob("*.jpg")):
        with Image.open(f) as im:
            rows.append(
                {
                    "filename": f.name,
                    "width": im.width,
                    "height": im.height,
                    "bytes": f.stat().st_size,
                }
            )
    print(json.dumps(rows, indent=2))
    total = sum(r["bytes"] for r in rows)
    print(f"\n{len(rows)} images, {total/1024:.0f} KB total", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
