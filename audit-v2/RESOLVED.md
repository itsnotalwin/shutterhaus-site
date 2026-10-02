# Shutterhaus Visuals — Audit Resolution

**Date:** 2026-10-02 · follows `AUDIT.md` (12 findings)
**Verified against the local build** in headless Chrome over CDP, not by inspection.
Raw evidence: `audit-v2/final-verification.json`, `audit-v2/after/*.png`.

## All 12 findings resolved

| # | Finding | Resolution | Measured after |
|---|---|---|---|
| 1 | Wall 2-up on desktop, 14,582px page | Column count taken out of the data entirely; wall capped at 900px | **10,557px**, tiles 687×1031 → **443×665**, 0px row spread |
| 2 | "Investment" invisible at 1.03:1 | Class-name mismatch fixed — dropped `eyebrow`, which was winning on `color` | **19.44:1**, white on `#0d0d0d` |
| 3 | Popular package identical to the other three | `.pkg--pop` added: inverted black card + MOST POPULAR label | `rgb(13,13,13)` vs transparent on the rest |
| 4 | H1 split "PORTRAITUR / E" | Clamp floor 48→30px so the `vw` term bites; word-break pinned to no-break | "Portraiture" needs 289px, has **357px** |
| 5 | Gate red 59/67, nothing ran it | Expectations rebuilt; **wired into CI** as a blocking `verify` job | **73/73** |
| 6 | B&W was a CSS filter over colour JPEGs | Filter deleted outright, no replacement | **0** filters anywhere |
| 7 | 28 frames, not 30 | Re-curated from the CHANELLE originals | **30 frames, 15 rows**, all checks green |
| 8 | Generated file shipped a stale docstring | Generator template made accurate and self-updating | `rows.ts` no longer says "10 rows of 3" |
| 9 | Portfolio 1,624KB | New **560w** rung between 400 and 800 | **1,218KB** (−25%) |
| 10 | `spec` defined but never rendered | Rendered on every card; 50 lines of dead `pricingPage()` deleted | all 4 tiers show it |
| 11 | `object-fit: cover` cropping his work | Removed from all public figures | hero only, and deliberate |
| 12 | Contact served 1600px to render 277px | `bestDerivative` + `pictureFor` | contact route **756KB → 381KB** |

## Two regressions found and fixed during verification

Both were introduced by the fixes themselves and caught by measurement, not review:

- **6px horizontal overflow at 320px.** `.burger` had no `grid-area`, so it was
  auto-placed into the logo's column: logo 128 + burger 44 + social 96 + two
  20px gaps = 308px inside a 288px box. Fixed with an explicit three-track
  template. Back to **0px** at 320 and 393.
- **The portfolio mockup's grid column got deleted** mid-edit by my own patch
  and the wall briefly had no column definition at all. Restored.

## Decisions that needed judgement, not just a fix

**The desktop wall could not be made 3-up.** A row holds a fixed number of
frames, and the ratio groups pack into pairs — so 3 columns would render two
cells and leave a third of every row empty. Restoring 3-up means going back to
3 frames per row, which puts the phone back to the 111px tiles Alwin rejected on
2026-10-02. The two wishes are genuinely in tension.

What was done instead: keep 2-up and cap the wall at 900px on wide screens.
Cells land at ~443px, which is a sane size to judge a photograph, and the page
drops by a third. Phone untouched. **This is the one call worth a second
opinion** — if the 111px phone tiles are no longer a problem to him, going back
to 3 frames per row is the better answer.

**The greyscale removal is narrower than it sounds.** Of the 50 CHANELLE
originals, most are *already* black and white — only about 8 are in colour
(the green-screen studio series and a few outdoor frames). So removing the
filter does not make the site colourful; it stops those ~8 being flattened.
The wall now opens on a colour frame.

## Remaining, not fixed

- **`store-*.js` is 228KB raw / ~63KB gzipped and loads on every public route**,
  including `/about` and `/contact`, because `main.ts` imports `listPublicPhotos`
  from the same module `admin.ts` uses for writes. Splitting the read path from
  the write path is the single biggest remaining win. Not attempted: it is how
  the site loads live photographs, and a botched refactor breaks the gallery
  rather than merely slowing it.
- **WebP quality 86 may now be generous** with no filter doing the visual
  heavy lifting. Dropping to ~80 would save roughly 20% per frame. Left alone
  deliberately — it means re-encoding the whole gallery and the saving should be
  judged on a real screen, not guessed at.

## Gates now in place

| Gate | Guards |
|---|---|
| `npm run verify` | 73 rendered assertions; **blocks deploy in CI** |
| `npm run build` | `tsc` + page gen + **`check-rows.py`** + srcset check |
| `check-rows.py` | 15 rows, 30 frames, one aspect ratio per row |

`check-rows.py` was previously *not* in the build at all — the spacing guarantee
had no gate.

## Not verified here

Everything above is measured in headless Chrome. **Alwin's own iPhone is still
the only authority on iOS behaviour** — particularly that nothing repaints on
`resize`. He should open a **new tab**, not pull-to-refresh, to see the new
build once it is deployed.
