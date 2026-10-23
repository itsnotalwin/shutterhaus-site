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
the existing gated CI provides rendered browser verification. Refresh the root
and `src/` captures from the new release before declaring visual QA complete.
