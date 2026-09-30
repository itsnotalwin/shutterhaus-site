"""
Regenerate width/height in src/demo.ts straight from the actual files.

Why this must exist: pictureFor() caps its srcset ladder at the source
width, and figure() uses the ratio to reserve layout space. With no
dimensions on the row:
  - the cap never applied, so the srcset advertised -1600w files that
    make-derivatives.py never generated (it does not upscale) -- the browser
    picked that candidate, 404'd, and the home hero rendered as a black box;
  - aspect-ratio fell back to a guess, which is how finals-34 came to be
    stored as 1800x1800 instead of its real 1440x1800.

Run: python tools/sync-demo-dims.py
Writes the file in place; prints a summary. Idempotent.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "src" / "demo.ts"
GALLERY = ROOT / "public" / "gallery"

# `url: "gallery/finals-34.jpg"` -> the path we must measure.
URL_RE = re.compile(r'url:\s*"(gallery/[^"]+)"')
# The exact suffix to rewrite, so nothing else on the line is touched.
TAIL_RE = re.compile(
    r'(?P<head>filename:\s*"[^"]+")(?P<tail>.*)$'
)


def main() -> int:
    text = DEMO.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    changed = 0
    missing: list[str] = []

    for i, line in enumerate(lines):
        m = URL_RE.search(line)
        if not m:
            continue
        path = GALLERY / Path(m.group(1)).name
        if not path.exists():
            missing.append(m.group(1))
            continue
        with Image.open(path) as im:
            w, h = im.size

        # Drop any existing width/height so this is idempotent.
        cleaned = re.sub(r"\s*width:\s*\d+,?", "", line)
        cleaned = re.sub(r"\s*height:\s*\d+,?", "", cleaned)

        t = TAIL_RE.search(cleaned)
        if not t:
            print(f"  ! no filename= on line {i + 1}, skipped", file=sys.stderr)
            continue
        new_line = (
            cleaned[: t.start()]
            + f'width: {w}, height: {h}, '
            + t.group("head")
            + t.group("tail")
        )
        if new_line != line:
            lines[i] = new_line
            changed += 1
            print(f"  {path.name}: {w}x{h}")

    DEMO.write_text("".join(lines), encoding="utf-8")
    if missing:
        print(f"\n{len(missing)} referenced file(s) not found:", file=sys.stderr)
        for p in missing:
            print(f"  {p}", file=sys.stderr)
        return 1
    print(f"\n{changed} line(s) updated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
