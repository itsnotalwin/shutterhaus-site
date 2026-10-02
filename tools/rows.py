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

Alwin, 2026-10-02 (re-curation): the pack had drifted to 28 because two ratio
groups had an odd count and an odd count cannot pair. Re-picked from the CHANELLE
originals (C:/Users/Operations 3/Desktop/CHANELLE, 50 files) against a contact
sheet, now that every frame renders as uploaded rather than behind a greyscale
filter — so the green-screen studio series and the colour outdoor frames finally
show their true selves. Restores the 30 he asked for on 2026-10-01.

    ratio 0.6667  14 chosen of 16 available ->  7 rows
    ratio 0.8     12 chosen of 13 available ->  6 rows
    ratio 0.5625   4 chosen of  8 available ->  2 rows
                    ---------------------------------
                    30 photos, 15 rows, 0px row spread

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

# Each row is two frames of one exact aspect ratio, best first.
#
# Re-picked 2026-10-02 against a contact sheet of the 50 CHANELLE originals,
# now that frames render as uploaded instead of behind a greyscale filter.
# The wall opens on the studio series so the page leads in colour, and the
# studio frames are paired one-per-row against a portrait rather than two
# together, so no run of green exceeds a single row -- there are 14
# near-identical green-screen frames in the source and showing all of them
# reads as padding.
ROWS = [
    # --- ratio 0.6667 (2:3 portrait) -- 7 rows
    ["49-img-0131.jpg", "48-img-0128.jpg"],
    # A genuine laugh, then the only male portrait in the set. Without that
    # variety the wall reads as a single shoot.
    ["21-img-0234.jpg", "5-img-0086.jpg"],
    ["12-img-0019.jpg", "18-img-0043.jpg"],
    ["13-img-0020.jpg", "16-img-0030.jpg"],
    ["25-img-0249.jpg", "14-img-0026.jpg"],
    ["32-img-0404.jpg", "37-img-0124.jpg"],
    ["2-20240718114526-img-0124.jpg", "36-img-0076.jpg"],
    # --- ratio 0.8 (4:5) -- 6 rows
    # 51 not 11: img-0018 is 6557x8137 = 0.8059, which is NOT the same shape as
    # a true 0.8 frame and would leave a visible gap under it.
    ["51-img-0145.jpg", "19-img-0198-3.jpg"],
    ["40-img-0092.jpg", "28-img-0308.jpg"],
    ["26-img-0253.jpg", "35-img-0482.jpg"],
    ["9-img-0269.jpg", "42-img-0095.jpg"],
    ["30-img-0396.jpg", "45-img-0118.jpg"],
    ["46-img-0119.jpg", "47-img-0121.jpg"],
    # --- ratio 0.5625 (9:16 portrait) -- 2 rows
    # The tall frames sit last, where the longest cell works as a run-out.
    ["24-img-0245.jpg", "20-img-0202.jpg"],
    ["34-img-0461.jpg", "52-img-0149.jpg"],
]
