# Shutterhaus Visuals

Production source: `itsnotalwin/shutterhaus-site`, branch `main`.
Live site: https://shutterhausvisuals.co.za. Vite + TypeScript, generated static
public documents, a separately styled admin, and optional Supabase gallery data.

Read `AGENTS.md` and `README.md` before working. Public styles are in
`src/public.css`, loaded after the shared `src/styles.css`. Keep factual copy,
package configuration, published photo choices, navigation and enquiry behavior
intact during visual maintenance. Generate HTML through `tools/build-pages.py`.

Run `npm ci`, `npm run build`, and `npm test`. `npm run dev` starts development;
`npm run preview` serves the production build. Browser checks are described in
the README. Current work refines the desktop hero, fits the existing artwork on
phones/tablets/desktop, and removes visible alt descriptions from the lightbox.
The approved phone cover and swipe gallery remain the responsive baseline.
The owner explicitly authorized research, implementation and deployment on
2026-10-21. Preserve the sole main branch and gated deployment workflow.

Validation on 2026-10-21: production build and all 22 public/admin DOM regression
tests pass, including the visible-caption regression. The seven-width verifier
checks desktop shell bounds, complete Home artwork and uncropped desktop hero
presentation. Desktop and mobile captures for all five pages were inspected.
Current Home screenshots live at the root and in `src/`; see `src/DESIGN.md`.
Inherited documentation gaps in untouched folders remain separate backfill work.

2026-10-23 desktop pass: refined inner-page proportions and About spacing,
aligned package content rows, made the desktop enquiry form compact and improved
footer readability. Build and 22 DOM tests pass. Local Chromium is unavailable;
the existing gated CI provides rendered browser verification. Release 9dce8cf
passed the seven-width public verifier and both browser engines; root and `src/`
captures now show the reviewed 23 October build. The final inner-page corrections
use the same gated workflow. Phone/tablet CSS remains byte-for-byte unchanged.

2026-10-23 hero follow-up: the owner requested a stronger Home hero after the
broader desktop pass. The hero now pairs a two-line headline and booking group
with the complete photograph; the actual horizontal artwork anchors the left
column. Desktop-only CSS controls the structural change. Preserve the phone
cover and the published hero selection. Gated rendered checks follow the local
build and DOM regressions.

Hero validation: UI commit `3654d2e` and run 39988308443 passed all build,
interaction, seven-width layout, Chromium, WebKit, deployment and live Safari
checks. New root/source desktop captures show the two-column hero. The phone
capture matches the preceding PNG byte for byte. The live desktop hero was
independently inspected. The evidence follow-up changes documentation and
screenshots only; it does not change the verified UI.

2026-10-23 Sessions follow-up: the owner requested consistent package imagery.
Desktop cards now use one 3:2 photo frame and individual crop positions, removing
empty gaps beneath landscape images. Existing phone/tablet frames and package
facts remain unchanged. The public verifier checks equal frame edges and saves
package-section captures for the browser review.

Sessions validation: UI commit `2f4237b`, run 39991738484, passed the build,
22 interaction tests, seven-width public/control verifier and both browser
engines. The live desktop page was independently checked: four equal 3:2 frames,
all photographs loaded, aligned booking controls and no horizontal overflow.
New `SCREENSHOT-SESSIONS.png` and `SCREENSHOT-SESSIONS-MOBILE.png` captures at the
root and in `src/` record the changed screen. The phone comparison and existing
Home captures remain identical. The evidence follow-up changes no UI code.
