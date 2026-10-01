"""
The portfolio wall: 30 chosen frames, 10 rows of 3, each row one exact ratio.

Alwin, 2026-10-01: "I dont like having the scroll on each column anymore, static
is better, but remove any numbering you have on images, choose 30 of the best to
use 3 per row and make sure it sits nice no spacing issues at all please."

HOW THE SPACING GUARANTEE WORKS -- read before changing a pick
------------------------------------------------------------
Three uncropped photos at three DIFFERENT aspect ratios are not one height, so
the short ones leave a gap under them. That gap is what "spacing issues" means
here, and CSS cannot fix it without cropping (object-fit: cover), which Alwin has
rejected since the first day.

So it is fixed in the DATA instead: every row holds three frames of the EXACT
same aspect ratio. At the same column width, three equal ratios give three
identical heights, so each row is exactly one height and the gap under every
photo is zero.

  ratio 1.5      16 available -> 15 chosen -> 5 rows
  ratio 1.25     12 available -> 12 chosen -> 4 rows
  ratio 1.7778    7 available ->  3 chosen -> 1 row
                             ----------------
                              30 photos, 10 rows, 0px row spread

tools/check-rows.py FAILS if a row ever mixes ratios, so this cannot silently
regress. A 0.5% tolerance covers a rounding difference on a resave, not a real
difference in shape.

TO CHANGE A PICK: edit ROWS, then run
    python tools/build-rows-ts.py && python tools/check-rows.py
No other file needs to know.
"""

# Each row is three frames of one exact aspect ratio, best first.
ROWS = [
    # --- ratio 1.5 (3:2) -- 5 rows
    ["49-img-0131.jpg", "48-img-0128.jpg", "25-img-0249.jpg"],
    ["14-img-0026.jpg", "15-img-0025.jpg", "18-img-0043.jpg"],
    ["32-img-0404.jpg", "37-img-0124.jpg", "21-img-0234.jpg"],
    ["16-img-0030.jpg", "12-img-0019.jpg", "13-img-0020.jpg"],
    ["36-img-0076.jpg", "50-img-0143.jpg", "2-20240718114526-img-0124.jpg"],
    # --- ratio 1.25 (5:4) -- 4 rows
    ["26-img-0253.jpg", "40-img-0092.jpg", "42-img-0095.jpg"],
    ["30-img-0396.jpg", "45-img-0118.jpg", "46-img-0119.jpg"],
    ["19-img-0198-3.jpg", "51-img-0145.jpg", "28-img-0308.jpg"],
    ["47-img-0121.jpg", "35-img-0482.jpg", "9-img-0269.jpg"],
    # --- ratio 1.7778 (16:9) -- 1 row
    ["24-img-0245.jpg", "53-img-0155.jpg", "20-img-0202.jpg"],
]
