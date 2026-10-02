#!/usr/bin/env python
"""Generate shots/pf-options.html — a 3-candidate portfolio-layout comparison
using the site's real photographs. All layout maths is computed here so the
justified rows sum to exactly the panel width (no 1px seams, no raggedness)."""

import os
from html import escape

# Derived from this file's own location (tools/ -> repo root) so the script
# survives the site being moved out of the vault on 2026-10-02. A hardcoded
# absolute path here silently regenerated pf-options.html into a dead tree.
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAL = os.path.join(REPO, "public/gallery")
OUT = os.path.join(REPO, "shots/pf-options.html")

# Site order (alphabetical, as the gallery manifest stores it) — first 12 frames.
SELECT = [
    "1-20240718113728-img-0065",
    "11-img-0018",
    "12-img-0019",
    "13-img-0020",
    "14-img-0026",
    "15-img-0025",
    "16-img-0030",
    "18-img-0043",
    "19-img-0198-3",
    "20-img-0202",
    "21-img-0234",
    "22-img-0239",
]

# Real aspect ratios measured off the -400w derivatives on disk.
AR = {
    "1-20240718113728-img-0065": 1.778,
    "11-img-0018": 0.806,
    "12-img-0019": 0.667,
    "13-img-0020": 0.667,
    "14-img-0026": 0.667,
    "15-img-0025": 0.667,
    "16-img-0030": 0.667,
    "18-img-0043": 0.667,
    "19-img-0198-3": 0.800,
    "20-img-0202": 0.563,
    "21-img-0234": 0.667,
    "22-img-0239": 0.860,
}

def px(v):
    """Format a CSS px length without float noise (105.66666 -> 105.667)."""
    s = f"{v:.3f}".rstrip("0").rstrip(".")
    return s


# ---- panel geometry (fixed, so every computed pixel is exact) -------------
# The box model matters here: a panel's INNER width is its outer width minus
# 2x padding, and the grids inside must be sized to the INNER width. Sizing the
# grids to the OUTER width overflows by 44px -- which pushed A's second sub-grid
# onto an implicit row and let `overflow:hidden` on the justified rows crop them.
STAGE, PAGE_PAD, GAP, PANEL_PAD, PANEL_BORDER = 2400, 40, 32, 22, 1
W_PANEL = 752                       # outer width of each of the 3 panels
# `.panel` is a content-box element with a 1px border, so the real content
# width is W_PANEL - 2*PANEL_PAD - 2*PANEL_BORDER = 706, not 708. Everything
# downstream is computed from THIS number.
W_INNER = W_PANEL - 2 * PANEL_PAD - 2 * PANEL_BORDER
assert PAGE_PAD * 2 + W_PANEL * 3 + GAP * 2 == STAGE
assert W_INNER == 706, W_INNER

A_SUBGAP = 32
A_SUB = (W_INNER - A_SUBGAP) // 2     # 337
A_COLS, A_GUT = 3, 10
A_ROWS = len(SELECT) // A_COLS        # 4
# Derive the cell from the space available rather than assuming it divides
# evenly: 337 = 3*w + 2*10 -> w = 105.67, which CSS handles exactly. Keep it
# fractional so the grid still fills A_SUB edge to edge with zero slack.
A_CELL = (A_SUB - (A_COLS - 1) * A_GUT) / A_COLS
C_GUT = 14
B_ROWS = None  # set below, after SELECT is known

W_B = W_INNER                          # justified rows fill the inner width
W_C = W_INNER                          # true-ratio grid fills the inner width

# A_SUB*2 + gap may be 1px under W_INNER when the split doesn't divide evenly;
# centre the pair so the residual lands on both sides and A stays flush.
A_SIDE_PAD = (W_INNER - (A_SUB * 2 + A_SUBGAP)) / 2
assert abs(A_CELL * A_COLS + (A_COLS - 1) * A_GUT - A_SUB) < 0.01


def src(stem, w):
    p = os.path.join(GAL, f"{stem}-{w}w.jpg")
    assert os.path.exists(p), f"MISSING {p}"
    assert os.path.getsize(p) > 1000, f"TINY {p}"
    return f"../public/gallery/{stem}-{w}w.jpg"


def largest_remainder(weights, total):
    """Split `total` px across `weights` proportionally, exact integer sum."""
    s = float(sum(weights))
    raw = [total * w / s for w in weights]
    out = [int(x) for x in raw]
    rem = total - sum(out)
    order = sorted(range(len(raw)), key=lambda i: raw[i] - int(raw[i]), reverse=True)
    for i in order[:rem]:
        out[i] += 1
    assert sum(out) == total
    return out


def img(stem, w, extra="", alt=True):
    a = escape(stem) if alt else ""
    return (f'<img src="{src(stem, w)}" alt="{a}" '
            f'loading="eager" decoding="async"{extra}>')


# ============================================================ CANDIDATE A
def grid_a(stem_w, ratio, label):
    h = round(A_CELL / ratio)
    cells = "\n".join(
        f'      <figure class="cell">{img(s, stem_w)}</figure>'
        for s in SELECT)
    return f"""
      <div class="asub">
      <div class="subhead"><span class="subhead__t">{label}</span>
        <span class="subhead__m">{A_COLS}&times;{A_ROWS} &middot; {px(A_CELL)}&times;{px(h)}px</span></div>
      <div class="ugrid" style="--cellw:{px(A_CELL)}px;--cellh:{px(h)}px">
{cells}
      </div></div>""", h


a45, a45h = grid_a(400, 0.8, "A1 &middot; 4:5 PORTRAIT")
a11, a11h = grid_a(400, 1.0, "A2 &middot; 1:1 SQUARE")
A_H = max(A_ROWS * a45h + (A_ROWS - 1) * A_GUT,
          A_ROWS * a11h + (A_ROWS - 1) * A_GUT)

# ============================================================ CANDIDATE B
# Justified rows: each row is one height, widths proportional to real AR,
# row sum == W_B exactly. The 16:9 frame rides in a 4-up row (as Flickr would).
B_ROWS = [
    ["11-img-0018", "19-img-0198-3", "12-img-0019"],
    ["22-img-0239", "20-img-0202", "13-img-0020"],
    ["14-img-0026", "15-img-0025", "16-img-0030"],
    ["1-20240718113728-img-0065", "18-img-0043", "21-img-0234"],
]
assert sorted(sum(B_ROWS, [])) == sorted(SELECT), "B must use each frame once"

b_html, b_heights = [], []
max_warp = 0.0
for row in B_ROWS:
    ws = [AR[s] for s in row]
    # The height that makes the row fill W_B exactly. Kept FRACTIONAL: rounding
    # it to an integer changes the required per-image widths and shears them.
    # CSS takes fractional px, so nothing is lost and no frame is distorted.
    h = W_B / sum(ws)
    widths = largest_remainder(ws, W_B)               # exact widths, sum == W_B
    assert len(widths) == len(row)
    for p, s in zip(widths, row):
        ideal = AR[s] * h
        warp = abs(ideal - p) / p * 100
        max_warp = max(max_warp, warp)
        assert warp < 1.0, f"distortion {s}: ideal {ideal:.2f} vs {p} ({warp:.2f}%)"
    hs = px(h)
    b_heights.append(hs)
    cells = '\n'.join(
        f'      <figure class="cell" style="flex:0 0 {p}px">{img(s, 800)}</figure>'
        for p, s in zip(widths, row))
    b_html.append(f'    <div class="jrow" style="height:{hs}px">\n{cells}\n    </div>')
assert len(b_heights) == len(B_ROWS), 'one height per row, not per cell'
B_H = sum(float(x) for x in b_heights)
bmin, bmax = round(min(float(x) for x in b_heights)), round(max(float(x) for x in b_heights))
print(f"B max per-frame width warp: {max_warp:.3f}% (object-fit:cover absorbs this)")
b_html = "\n".join(b_html)

# ============================================================ CANDIDATE C
# Reproduces the live wall exactly: src/editorial.css L295-296 --
#   .grid--wall { display:grid; grid-template-columns:repeat(3,1fr); gap:14px }
#   .grid--wall .col { display: contents }
# `display:contents` dissolves the round-robin <div class="col"> wrappers, so the
# frames land as plain grid items in row-major order at their TRUE ratios. Each
# grid row is then as tall as its tallest frame and the shorter ones sit in a
# void beneath themselves. That void is the defect, so measure it.
C_W = (W_C - (3 - 1) * C_GUT) / 3.0
c_html = "\n".join(
    f'      <figure class="cell">{img(s, 800)}</figure>' for s in SELECT)

rows_c, notches = [], []
for r in range(4):
    trio = SELECT[r * 3:r * 3 + 3]
    hh = max(C_W / AR[s] for s in trio)
    voids = [(s, round(hh - C_W / AR[s])) for s in trio]
    rows_c.append((r + 1, trio, hh))
    notches += voids
C_H = round(sum(x[2] for x in rows_c) + 3 * C_GUT)
# The worst single void = the tallest shortfall inside its row.
NOTCH = max(v for _, v in notches)
NOTCH_STEM = next(s for s, v in notches if v == NOTCH)
TOTAL_VOID = round(sum(v for _, v in notches))
assert NOTCH > 0 and TOTAL_VOID > 0, "C should show voids; if not, C is not the baseline"

# ============================================================ HTML
def r_(x):
    return f"{x:g}"


html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1500">
<title>Portfolio layout &mdash; 3 options &middot; Shutterhaus Visuals</title>
<style>
/* Self-contained. No webfonts, no CDN, no JS &mdash; opened straight off disk. */
:root {{
  --bg: #0c0c0c;
  --ink: #ffffff;
  --dim: #8d8d8d;
  --dimmer: #5e5e5e;
  --line: #232323;
  --panel: #101010;
  --font-display: "Archivo Black", "Arial Black", Impact, "Helvetica Neue", sans-serif;
  --font-body: Inter, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
}}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; padding: 0; background: var(--bg); color: var(--ink);
  font-family: var(--font-body); -webkit-font-smoothing: antialiased; }}
body {{ padding: {PAGE_PAD}px; }}

/* Fixed stage width: every pixel in this mock is computed, so the layout is
   only exact at >= {STAGE}px. Below that the page scrolls horizontally instead
   of silently re-flowing the maths. */
.stage {{ width: {STAGE}px; }}

.masthead {{ margin: 0 0 34px; max-width: 1180px; }}
.eyebrow {{ font: 700 11px/1 var(--font-body); letter-spacing: .22em;
  text-transform: uppercase; color: var(--dimmer); margin: 0 0 14px; }}
.masthead h1 {{ font: 400 44px/1.02 var(--font-display); letter-spacing: -.015em;
  margin: 0 0 16px; text-transform: uppercase; }}
.masthead p {{ font-size: 15px; line-height: 1.62; color: var(--dim); margin: 0; max-width: 900px; }}
.masthead b {{ color: var(--ink); font-weight: 600; }}

.panels {{ display: grid; grid-template-columns: repeat(3, {W_PANEL}px);
  gap: {GAP}px; align-items: start; }}

.panel {{ background: var(--panel); border: 1px solid var(--line);
  padding: {PANEL_PAD}px; }}
.phead {{ display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }}
.tag {{ font: 400 30px/1 var(--font-display); color: var(--ink); }}
.ptitle {{ font: 400 17px/1.1 var(--font-display); text-transform: uppercase;
  letter-spacing: -.005em; }}
.pnote {{ font-size: 12.5px; line-height: 1.58; color: var(--dim);
  margin: 0 0 18px; min-height: 58px; }}
.pnote b {{ color: var(--ink); font-weight: 600; }}
.pstat {{ font: 600 10px/1 var(--font-body); letter-spacing: .16em;
  text-transform: uppercase; color: var(--dimmer);
  border-top: 1px solid var(--line); padding-top: 11px; margin: 18px 0 0;
  display: flex; justify-content: space-between; gap: 12px; }}

/* ---- A: uniform grid ---- */
/* {A_SUB}px tracks; the fractional cell keeps both grids flush to the edges. */
.asplit {{ display: grid; grid-template-columns: {A_SUB}px {A_SUB}px;
  gap: {A_SUBGAP}px; justify-content: center; }}
.subhead {{ display: flex; align-items: baseline; justify-content: space-between;
  gap: 8px; margin: 0 0 9px; }}
.subhead__t {{ font: 600 10px/1 var(--font-body); letter-spacing: .16em;
  text-transform: uppercase; color: var(--ink); }}
.subhead__m {{ font: 400 10px/1 var(--font-body); letter-spacing: .06em; color: var(--dimmer); }}
.ugrid {{ display: grid; grid-template-columns: repeat({A_COLS}, var(--cellw));
  gap: {A_GUT}px; }}
.ugrid .cell {{ width: var(--cellw); height: var(--cellh); }}

/* ---- B: justified rows ---- */
.jwrap {{ display: flex; flex-direction: column; }}
/* No overflow:hidden here on purpose -- it would silently crop an overflow
   bug instead of letting the verifier see the row exceed its panel. */
/* `flex:0 0 Npx` alone is NOT enough: flex-shrink still kicks in when the
   bases total more than the container, which silently stole ~2px per row.
   flex-shrink:0 pins each cell to its computed width so the row fills exactly. */
.jrow {{ display: flex; height: var(--h); }}
.jrow .cell {{ height: 100%; flex-shrink: 0; }}

/* ---- C: current masonry (live wall) ---- */
.cgrid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: {C_GUT}px; }}
.cgrid .cell {{ width: 100%; height: auto; }}

/* ---- shared cell behaviour (matches the live site) ---- */
.cell {{ margin: 0; }}
.cell img {{ display: block; width: 100%; height: 100%; object-fit: cover;
  background: #f4f4f4; cursor: zoom-in;
  filter: grayscale(1) contrast(1.06);
  transition: filter 260ms ease; }}
.cgrid .cell img {{ height: auto; object-fit: fill; }}
/* Monochrome at rest, true colour on hover &mdash; pointer devices only, so a
   touch device never leaves a frame stuck mid-transition. */
@media (hover: hover) {{
  .cell:hover img {{ filter: grayscale(0) contrast(1); }}
}}
.cell figcaption {{ font-size: 11px; color: var(--dim); padding-top: 6px; }}

/* Full-stage width: this was capped at 1180px against a {STAGE}px stage, which
   left a dead band down the right of the page. */
.verdict {{ margin: 40px 0 0; border-top: 1px solid var(--line); padding-top: 26px; }}
.verdict h2 {{ font: 400 19px/1 var(--font-display); text-transform: uppercase;
  margin: 0 0 18px; }}
.verdict__grid {{ display: grid; grid-template-columns: repeat(3, {W_PANEL}px);
  gap: {GAP}px; }}
.vcol p {{ font-size: 13.5px; line-height: 1.66; color: var(--dim); margin: 0 0 11px; }}
.vcol p:last-child {{ margin-bottom: 0; }}
.vcol p b {{ color: var(--ink); font-weight: 600; }}
.vcol h3 {{ font: 400 11px/1 var(--font-display); letter-spacing: .18em;
  text-transform: uppercase; color: var(--ink); margin: 0 0 9px; }}
.legend {{ font-size: 12px; color: var(--dimmer); margin: 22px 0 0; }}
</style>
</head>
<body>
<div class="stage">

  <header class="masthead">
    <p class="eyebrow">Shutterhaus Visuals &middot; design decision &middot; portfolio route</p>
    <h1>Three layouts, same 12 photographs</h1>
    <p>Every frame below is a real photograph from <b>public/gallery</b>, in the order the
      gallery manifest stores them &mdash; one 16:9 landscape, one 0.86 near-square, one 0.56 tall
      portrait and eight 2:3 frames. Hover any frame to see it in colour.
      The point of the comparison is what each layout does to <b>that same mixed set</b>:
      candidate C is today's wall, reproduced frame for frame.</p>
  </header>

  <div class="panels">

    <!-- ============================================================ A -->
    <section class="panel" id="cand-a">
      <div class="phead"><span class="tag">A</span>
        <span class="ptitle">Uniform grid</span></div>
      <p class="pnote">Perfect alignment &mdash; every column edge is flush, at any width.
        The cost is the crop: each frame is masked to the cell's ratio, so the 16:9 landscape
        loses roughly half its width and tall portraits lose their sides. Two ratios shown
        side by side; <b>4:5 suits this set</b> because most work is vertical.</p>
      <div class="asplit">{a45}
{a11}
      </div>
      <p class="pstat"><span>Ragged edges: none</span>
        <span>{px(A_CELL)}&times;{px(a45h)}px cell</span></p>
    </section>

    <!-- ============================================================ B -->
    <section class="panel" id="cand-b">
      <div class="phead"><span class="tag">B</span>
        <span class="ptitle">Justified rows</span></div>
      <p class="pnote">The Flickr / Google Photos look: each row is one height and fills the
        width edge to edge, zero gaps. Ratios are preserved, so a row's height is set by its
        contents &mdash; <b>row heights here run {bmin}&ndash;{bmax}px</b> and
        they drift as the viewport changes. The 16:9 sits in a 4-up row to keep that row from
        collapsing.</p>
      <div class="jwrap">
{b_html}
      </div>
      <p class="pstat"><span>Ragged edges: none</span>
        <span>4 rows &middot; {B_H}px</span></p>
    </section>

    <!-- ============================================================ C -->
    <section class="panel" id="cand-c">
      <div class="phead"><span class="tag">C</span>
        <span class="ptitle">Current masonry</span></div>
      <p class="pnote">What ships today: a 3-column grid, frames at their true ratio
        (<code>display:contents</code> on the round-robin wrappers, so the browser lays them
        out row by row). Nothing is cropped, but every grid row is as tall as its tallest
        frame &mdash; so the 16:9 landscape sits in a <b>{NOTCH}px void</b> and the three rows
        waste <b>{TOTAL_VOID}px</b> of empty cell in total. Same mechanism, 50 frames, is the
        ragged wall on shutterhausvisuals.co.za.</p>
      <div class="cgrid">
{c_html}
      </div>
      <p class="pstat"><span>Voids: {TOTAL_VOID}px</span>
        <span>4 rows &middot; {C_H}px</span></p>
    </section>

  </div>

  <section class="verdict">
    <h2>Reading the numbers</h2>
    <div class="verdict__grid">
      <div class="vcol">
        <h3>A &middot; Uniform grid</h3>
        <p>The only option that is genuinely clean in the editorial sense &mdash; columns and
          rows are mathematically flush, and it is the most compact of the three
          ({A_H}px of grid for 12 frames, because 4:5 cells are small). It is the right
          default for a photographer's portfolio, with one honest caveat: cropping a 16:9 to
          4:5 discards real image area, so the landscape frames read as deliberate crops
          rather than the whole picture.</p>
      </div>
      <div class="vcol">
        <h3>B &middot; Justified rows</h3>
        <p>Clean at the left and right margins but not between rows &mdash; the row boundaries
          become the new ragged edge. It also ties the layout to the viewport: the same
          frames produce different row heights at every width, so the rhythm changes as the
          window resizes.</p>
      </div>
      <div class="vcol">
        <h3>C &middot; Current masonry</h3>
        <p>Preserves every pixel of every photograph, which is the one thing the other two
          give up, and that is worth something. It is also the layout being replaced, and the
          voids are what makes it read as untidy rather than intentional.</p>
      </div>
    </div>
    <p class="legend">Hover any photograph to reveal its original colour. Rendered at a fixed
      stage width of {STAGE}px so the computed geometry is exact;
      scroll horizontally on a narrower window.</p>
  </section>

</div>
</body>
</html>
"""

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

print(f"wrote {OUT}  ({len(html):,} bytes)")
print(f"A cell {A_CELL}x{a45h} (4:5)  /  {A_CELL}x{a11h} (1:1)   panel A body {A_H}px")
print(f"B row heights {[str(h) for h in b_heights]}  prose range {bmin}-{bmax}px")
print(f"C panel {C_H}px  worst notch {NOTCH}px")
print("B row width sums:", [sum(largest_remainder([AR[s] for s in r], W_B)) for r in B_ROWS])