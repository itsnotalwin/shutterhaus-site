"""
The portfolio wall: 30 chosen frames, 15 rows of 2, each row one exact ratio.

Alwin, 2026-10-01: "I dont like having the scroll on each column anymore, static
is better, but remove any numbering you have on images, choose 30 of the best to
use 3 per row and make sure it sits nice no spacing issues at all please."

Alwin, 2026-10-02 (mobile): 2 columns on a phone — 111px tiles were too small to
read a face, and the audit measured ~30px faces at 393px. So this file holds two
frames per row, and the COLUMN COUNT is a viewport concern owned by the CSS.
It used to be derived from len(row) here, which meant the phone fix silently
dragged the desktop to two columns too and produced a 14,582px-tall page. Do not
put the column count back in this file.

Alwin, verbatim (re-curation): "selected work should be the best of the best
images no landscapes or random things keep it to the portraits we have".

Re-picked against ratios measured with PIL on the base gallery files (not the
-800w derivatives) and against contact sheets rendered at the TRUE tile size,
because a tile is ~173px wide on a phone and a frame that only works big is a
bad frame. Portrait frames only: everything at ratio >= 0.95 is out.

    ratio 0.6667  14 chosen of 16 available ->  7 rows
    ratio 0.8     10 chosen of 13 available ->  5 rows
    ratio 0.5625   6 chosen of  7 available ->  3 rows
                    ---------------------------------
                    30 photos, 15 rows, 0px row spread

RESERVED -- these must never appear on the wall:
  54-img-0164  the family shot, pinned to the Signature package card on
               /services (ratio 1.6, landscape)
  55-metal-detector  portrait ratio, but it is the picture of the photographer
               on the About page

HOW THE SPACING GUARANTEE WORKS -- read before changing a pick
------------------------------------------------------------
Uncropped photos at DIFFERENT aspect ratios are not one height, so the short
ones leave a gap under them. That gap is what "spacing issues" means here, and
CSS cannot fix it without cropping (object-fit: cover), which Alwin has
rejected since the first day.

So it is fixed in the DATA instead: every row holds two frames of the EXACT
same aspect ratio. At the same column width, two equal ratios give two
identical heights, so each row is exactly one height and the gap under every
photo is zero.

tools/check-rows.py FAILS if a row ever mixes ratios or a row is not two
frames, so this cannot silently regress. A 0.5% tolerance covers a rounding
difference on a resave, not a real difference in shape.

TO CHANGE A PICK: edit ROWS, then run
    python tools/build-rows-ts.py && python tools/check-rows.py
No other file needs to know.
"""

# Each row is two frames of one exact aspect ratio. Row order IS the wall order:
# top to bottom. Strongest frames open it.
#
# 11 of the 30 are the green-backdrop shoot, which is not a free choice: only
# 21 usable portraits sit outside it, so 30 frames cannot be built without it,
# and the per-ratio pools make 11 the smallest count that still pairs. What is
# enforced instead is SPREAD -- no row holds two of them (the 0.8 group carries
# 5 across exactly 5 rows, the 0.5625 group 3 across 3 rows, so one per row is
# the most those groups can hold) and no two are adjacent anywhere in the
# rendered order, minimum gap 2 slots.
#
# Rows are interleaved by ratio on purpose. Grouping the 0.6667 rows together
# and then the 0.8 rows buries eleven green frames inside four rows of each
# other, which is exactly the clumping Alwin flagged.
ROWS = [
    # Opens in colour -- warm outdoor daylight and a genuine laugh -- against a
    # black-and-white city frame, so the wall leads in its strongest register.
    ["2-20240718114526-img-0124.jpg", "18-img-0043.jpg"],          # 0.6667
    # The sharpest frame in the set and the most legible face on the wall.
    ["34-img-0461.jpg", "53-img-0155.jpg"],                       # 0.5625
    # The studio beauty frame: warm rim light, holds together at 173px.
    ["19-img-0198-3.jpg", "47-img-0121.jpg"],                     # 0.8
    ["24-img-0245.jpg", "44-img-0098.jpg"],                       # 0.5625
    # Tight monochrome headshot opposite the studio series.
    ["28-img-0308.jpg", "51-img-0145.jpg"],                       # 0.8
    ["25-img-0249.jpg", "49-img-0131.jpg"],                       # 0.6667
    # 5-img-0086 is the only male portrait on the wall. Without it the whole
    # thing reads as one afternoon with one subject.
    ["32-img-0404.jpg", "5-img-0086.jpg"],                        # 0.6667
    ["50-img-0143.jpg", "15-img-0025.jpg"],                       # 0.6667
    ["45-img-0118.jpg", "30-img-0396.jpg"],                       # 0.8
    ["41-img-0094.jpg", "20-img-0202.jpg"],                       # 0.5625
    ["40-img-0092.jpg", "35-img-0482.jpg"],                       # 0.8
    ["48-img-0128.jpg", "16-img-0030.jpg"],                       # 0.6667
    ["37-img-0124.jpg", "14-img-0026.jpg"],                       # 0.6667
    ["46-img-0119.jpg", "26-img-0253.jpg"],                       # 0.8
    # Runs out on two monochrome city frames.
    ["13-img-0020.jpg", "21-img-0234.jpg"],                       # 0.6667
]
