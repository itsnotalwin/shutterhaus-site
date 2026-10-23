# Shutterhaus public presentation

The approved theme is a white editorial frame, Bodoni Moda display type, Inter
body/UI, monochrome portfolio photography and the supplied geometric artwork.
Generate the root HTML from `src/`; keep the static and hydrated pages aligned.

The desktop Home hero uses two columns: a two-line headline, support copy,
booking controls and complete horizontal artwork on the left; the full
photograph on the right. White space separates these groups without a competing
tall artwork column. The mobile cover, three-line heading and swipe gallery
remain the responsive baseline. See `src/DESIGN.md` for implementation details.

Actual capture route `/`, date 2026-10-23, UI commit `3654d2e`:
`SCREENSHOT.png` is the 1440×900 viewport; `SCREENSHOT-MOBILE.png` is a full-page
capture at viewport 390×844. Both come from [run 39988308443](https://github.com/itsnotalwin/shutterhaus-site/actions/runs/39988308443).
The mobile PNG is byte-identical to the preceding reviewed capture. Desktop was
also inspected at 1024px, 1920px and in the live browser. Build, 22 DOM tests,
seven-width layout/control verification, Chromium and WebKit photo checks,
deployment and live Safari scrolling all passed. Inner-page layouts and package
alignment from the preceding desktop pass remain intact.

Sessions follow-up, 2026-10-23: desktop package images now use matching 3:2
landscape frames with individual focal positions. This replaces the previous
mixed landscape/portrait photo heights and the gaps they created. Phone/tablet
image frames stay intact. New package-section captures follow browser QA.
